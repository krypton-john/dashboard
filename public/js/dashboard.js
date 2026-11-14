// Warn if no poll in ~90 minutes (hourly schedule + GitHub cron delay).
const STALE_MS = 90 * 60 * 1000;
const REFRESH_MS = 60 * 1000;
const VENDOR_FILTER_STORAGE_KEY = "emea-dashboard-vendor-filter-v1";

/** @type {"all" | "issues" | "custom"} */
let vendorFilterPreset = "all";
/** @type {Set<string>} */
let vendorCustomSelected = new Set();

function sortToolsForDisplay(tools) {
  return [...tools].sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
);
}

/**
 * Subsequence fuzzy score (higher is better). Returns -1 when query chars are not all matched.
 * @param {string} query
 * @param {string} text
 */
function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let prev = -2;
  let streak = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    score += 1;
    if (prev === ti - 1) {
      streak += 1;
      score += streak * 3;
    } else {
      streak = 0;
      if (ti === 0 || /[\s\-_/]/.test(t[ti - 1])) score += 6;
    }
    if (qi === 0) score += ti === 0 ? 12 : Math.max(0, 8 - ti);
    prev = ti;
    qi += 1;
  }

  if (qi < q.length) return -1;
  const span = prev - (q.length - 1);
  score += Math.max(0, 40 - span);
  if (t.startsWith(q)) score += 20;
  return score;
}

function rankToolsByFuzzy(query, tools) {
  const ranked = [];
  for (const tool of tools) {
    const nameScore = fuzzyScore(query, tool.name);
    const idScore = fuzzyScore(query, tool.id.replace(/-/g, " "));
    const score = Math.max(nameScore, idScore);
    if (score >= 0) ranked.push({ tool, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return ranked;
}

const STATE_LABEL = {
  operational: "Operational",
  "future-maintenance": "Future Maintenance",
  degraded: "Degraded",
  major: "Major outage",
  unknown: "Unknown",
};

const bannerEl = document.getElementById("banner");
const lastUpdatedEl = document.getElementById("last-updated");
const gridEl = document.getElementById("tool-grid");
const stickyHeaderEl = document.getElementById("page-header-sticky");
const searchInputEl = document.getElementById("tool-search-input");
const searchResultsEl = document.getElementById("tool-search-results");
const vendorFilterToggleEl = document.getElementById("vendor-filter-toggle");
const vendorFilterPopoverEl = document.getElementById("vendor-filter-popover");
const vendorFilterListEl = document.getElementById("vendor-filter-list");
const vendorFilterBadgeEl = document.getElementById("vendor-filter-badge");
const vendorFilterHintEl = document.getElementById("vendor-filter-hint");
const vendorFilterToolbarEl = document.querySelector(".vendor-filter__toolbar");
const vendorFilterSelectAllEl = document.getElementById("vendor-filter-select-all");
const vendorFilterClearAllEl = document.getElementById("vendor-filter-clear-all");

/** @type {Array<{ id: string; name: string; state: string }>} */
let allTools = [];
/** @type {Array<{ id: string; name: string; state: string }> | null} */
let displayedTools = null;
/** @type {unknown} */
let lastIncidentsFile = null;
/** @type {object | null} */
let lastStatusBody = null;
let searchActiveIndex = -1;

const ISSUE_STATES = new Set(["degraded", "major", "future-maintenance"]);

function syncStickyScrollMargin() {
  if (!stickyHeaderEl) return;
  const h = stickyHeaderEl.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--sticky-offset", `${Math.ceil(h)}px`);
}

function loadVendorFilterPrefs() {
  try {
    const raw = localStorage.getItem(VENDOR_FILTER_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.preset === "all" || data.preset === "issues" || data.preset === "custom") {
      vendorFilterPreset = data.preset;
    }
    if (Array.isArray(data.selectedIds)) {
      vendorCustomSelected = new Set(
        data.selectedIds.filter((id) => typeof id === "string" && id)
      );
    }
    const activePreset = document.querySelector(
      `input[name="vendor-filter-preset"][value="${vendorFilterPreset}"]`
    );
    if (activePreset instanceof HTMLInputElement) activePreset.checked = true;
  } catch {
    /* ignore corrupt storage */
  }
}

function saveVendorFilterPrefs() {
  try {
    localStorage.setItem(
      VENDOR_FILTER_STORAGE_KEY,
      JSON.stringify({
        preset: vendorFilterPreset,
        selectedIds: [...vendorCustomSelected],
      })
    );
  } catch {
    /* private mode / quota */
  }
}

function adoptNewToolsForCustomFilter(sorted) {
  if (vendorFilterPreset !== "custom") return;
  const prev = new Set(allTools.map((t) => t.id));
  for (const t of sorted) {
    if (!prev.has(t.id)) vendorCustomSelected.add(t.id);
  }
}

function filterToolsForDisplay(tools) {
  if (vendorFilterPreset === "all") return tools;
  if (vendorFilterPreset === "issues") {
    return tools.filter((t) => ISSUE_STATES.has(t.state));
  }
  return tools.filter((t) => vendorCustomSelected.has(t.id));
}

function updateVendorFilterBadge(total) {
  if (!vendorFilterBadgeEl) return;
  const visible = filterToolsForDisplay(allTools).length;
  const filtered = vendorFilterPreset !== "all" || visible < total;
  if (!filtered || total === 0) {
    vendorFilterBadgeEl.classList.add("vendor-filter__badge--hidden");
    return;
  }
  vendorFilterBadgeEl.textContent = `${visible}/${total}`;
  vendorFilterBadgeEl.classList.remove("vendor-filter__badge--hidden");
}

function syncVendorFilterPanelUi() {
  const custom = vendorFilterPreset === "custom";
  vendorFilterListEl?.classList.toggle("vendor-filter__list--hidden", !custom);
  vendorFilterToolbarEl?.classList.toggle("vendor-filter__toolbar--hidden", !custom);
  if (vendorFilterHintEl) {
    vendorFilterHintEl.textContent = custom
      ? "Choices are saved in this browser."
      : vendorFilterPreset === "issues"
        ? "Showing degraded, major, or future maintenance only."
        : "All vendors are shown.";
  }
}

function rebuildVendorFilterList() {
  if (!vendorFilterListEl) return;
  vendorFilterListEl.replaceChildren();
  for (const tool of allTools) {
    const label = document.createElement("label");
    label.className = "vendor-filter__item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = vendorCustomSelected.has(tool.id);
    input.dataset.toolId = tool.id;
    input.addEventListener("change", () => {
      vendorFilterPreset = "custom";
      const presetInput = document.querySelector(
        'input[name="vendor-filter-preset"][value="custom"]'
      );
      if (presetInput instanceof HTMLInputElement) presetInput.checked = true;
      if (input.checked) vendorCustomSelected.add(tool.id);
      else vendorCustomSelected.delete(tool.id);
      saveVendorFilterPrefs();
      syncVendorFilterPanelUi();
      applyDisplayFromCache();
    });
    const name = document.createElement("span");
    name.className = "vendor-filter__item-name";
    name.textContent = tool.name;
    label.append(input, name);
    vendorFilterListEl.append(label);
  }
  syncVendorFilterPanelUi();
  updateVendorFilterBadge(allTools.length);
}

function setVendorFilterPopoverOpen(open) {
  if (!vendorFilterToggleEl || !vendorFilterPopoverEl) return;
  vendorFilterToggleEl.setAttribute("aria-expanded", open ? "true" : "false");
  vendorFilterPopoverEl.hidden = !open;
  vendorFilterPopoverEl.classList.toggle("vendor-filter__popover--hidden", !open);
}

function applyDisplayFromCache() {
  if (!lastStatusBody) return;
  paintDashboard(lastStatusBody, lastIncidentsFile);
}

function initVendorFilter() {
  loadVendorFilterPrefs();
  syncVendorFilterPanelUi();

  document.querySelectorAll('input[name="vendor-filter-preset"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (!(el instanceof HTMLInputElement) || !el.checked) return;
      vendorFilterPreset = /** @type {"all" | "issues" | "custom"} */ (el.value);
      if (vendorFilterPreset === "custom" && vendorCustomSelected.size === 0) {
        for (const t of allTools) vendorCustomSelected.add(t.id);
      }
      saveVendorFilterPrefs();
      syncVendorFilterPanelUi();
      rebuildVendorFilterList();
      applyDisplayFromCache();
    });
  });

  vendorFilterSelectAllEl?.addEventListener("click", () => {
    vendorFilterPreset = "custom";
    const presetInput = document.querySelector(
      'input[name="vendor-filter-preset"][value="custom"]'
    );
    if (presetInput instanceof HTMLInputElement) presetInput.checked = true;
    for (const t of allTools) vendorCustomSelected.add(t.id);
    saveVendorFilterPrefs();
    syncVendorFilterPanelUi();
    rebuildVendorFilterList();
    applyDisplayFromCache();
  });

  vendorFilterClearAllEl?.addEventListener("click", () => {
    vendorFilterPreset = "custom";
    const presetInput = document.querySelector(
      'input[name="vendor-filter-preset"][value="custom"]'
    );
    if (presetInput instanceof HTMLInputElement) presetInput.checked = true;
    vendorCustomSelected.clear();
    saveVendorFilterPrefs();
    syncVendorFilterPanelUi();
    rebuildVendorFilterList();
    applyDisplayFromCache();
  });

  vendorFilterToggleEl?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const open = vendorFilterPopoverEl?.hidden !== false;
    setVendorFilterPopoverOpen(open);
    if (open) rebuildVendorFilterList();
  });

  document.addEventListener("click", (ev) => {
    const root = document.getElementById("vendor-filter");
    if (!root || root.contains(/** @type {Node} */ (ev.target))) return;
    setVendorFilterPopoverOpen(false);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") setVendorFilterPopoverOpen(false);
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const formatted = d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    if (formatted) return formatted;
  } catch {
    /* older browsers */
  }
  return d.toLocaleString();
}

function maintenanceWhenLabel(tool) {
  if (tool.maintenanceStartsAtLabel) return tool.maintenanceStartsAtLabel;
  if (!tool.maintenanceStartsAt) return null;
  const d = new Date(tool.maintenanceStartsAt);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(tool.maintenanceStartsAt);
}

function formatTrackingSince(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function metricsForTool(incidentsFile, toolId, now = new Date()) {
  const incidents = Array.isArray(incidentsFile?.incidents)
    ? incidentsFile.incidents
    : [];
  const meta = incidentsFile?.tools?.[toolId];
  const trackingSince = meta?.trackingSince ?? null;
  const open = incidents.find((i) => i.toolId === toolId && i.end == null);
  if (open) {
    return { daysSinceLastIncident: 0, incidentOngoing: true, trackingSince };
  }

  const ended = incidents
    .filter((i) => i.toolId === toolId && i.end != null)
    .map((i) => Date.parse(i.end))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a);

  if (ended.length === 0) {
    return { daysSinceLastIncident: null, incidentOngoing: false, trackingSince };
  }

  const ms = Math.max(0, now.getTime() - ended[0]);
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  return { daysSinceLastIncident: days, incidentOngoing: false, trackingSince };
}

function incidentLine(tool, incidentsFile) {
  const m = metricsForTool(incidentsFile, tool.id);
  if (m.incidentOngoing) {
    return "Incident in progress";
  }
  if (tool.state === "future-maintenance") {
    const when = maintenanceWhenLabel(tool);
    if (when) {
      return `Scheduled maintenance upcoming — ${when}`;
    }
    return "Scheduled maintenance upcoming";
  }
  if (tool.state === "degraded" || tool.state === "major") {
    return "Issue detected — confirming on next poll";
  }
  if (m.daysSinceLastIncident == null) {
    if (m.trackingSince) {
      return `Tracking since ${formatTrackingSince(m.trackingSince)}`;
    }
    return "Tracking since first poll";
  }
  const days = m.daysSinceLastIncident;
  if (days === 0) return "Last incident ended today";
  if (days === 1) return "1 day since last incident";
  return `${days} days since last incident`;
}

function setBanner(message, kind) {
  if (!message) {
    bannerEl.classList.add("banner--hidden");
    bannerEl.textContent = "";
    return;
  }
  bannerEl.textContent = message;
  bannerEl.classList.remove("banner--hidden");
  bannerEl.classList.toggle("banner--warn", kind === "warn");
  bannerEl.classList.toggle("banner--danger", kind === "danger");
}

function scrollToToolCard(toolId) {
  const el = document.getElementById(`tool-card-${toolId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("card--found");
  // Force reflow so repeat searches retrigger animation.
  void el.offsetWidth;
  el.classList.add("card--found");
  el.addEventListener(
    "animationend",
    () => el.classList.remove("card--found"),
    { once: true }
  );
}

function renderToolCard(tool, incidentsFile) {
  const hasLink =
    typeof tool.statusPageUrl === "string" && tool.statusPageUrl.startsWith("https://");
  const shell = document.createElement(hasLink ? "a" : "article");
  shell.id = `tool-card-${tool.id}`;
  shell.className = `card card--${tool.state}`;
  if (hasLink) {
    shell.href = tool.statusPageUrl;
    shell.target = "_blank";
    shell.rel = "noopener noreferrer";
    shell.classList.add("card--link");
    shell.setAttribute(
      "aria-label",
      `${tool.name} — ${STATE_LABEL[tool.state] ?? tool.state}. Open vendor status page in a new tab.`
    );
  } else {
    shell.setAttribute("aria-label", `${tool.name} status`);
  }

  const light = document.createElement("span");
  light.className = "light";
  light.setAttribute("aria-hidden", "true");

  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = tool.name;

  const status = document.createElement("p");
  status.className = "card-status";
  status.textContent = STATE_LABEL[tool.state] ?? tool.state;

  const desc = document.createElement("p");
  desc.className = "card-desc";
  desc.textContent = tool.description;

  const incident = document.createElement("p");
  incident.className = "card-incident";
  incident.textContent = incidentLine(tool, incidentsFile);

  if (hasLink) {
    const linkHint = document.createElement("p");
    linkHint.className = "card-link-hint";
    linkHint.textContent = "View status page ↗";
    shell.append(light, title, status, desc, incident, linkHint);
  } else {
    shell.append(light, title, status, desc, incident);
  }

  return shell;
}

function setSearchResults(matches, activeIndex = searchActiveIndex) {
  searchActiveIndex = activeIndex;
  searchResultsEl.replaceChildren();
  if (!matches.length) {
    searchResultsEl.classList.add("tool-search__results--hidden");
    searchInputEl.setAttribute("aria-expanded", "false");
    searchActiveIndex = -1;
    return;
  }

  searchResultsEl.classList.remove("tool-search__results--hidden");
  searchInputEl.setAttribute("aria-expanded", "true");

  const visible = matches.slice(0, 10);
  if (searchActiveIndex >= visible.length) searchActiveIndex = 0;

  visible.forEach((entry, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-search__result";
    btn.setAttribute("role", "option");
    btn.id = `tool-search-option-${entry.tool.id}`;
    btn.dataset.toolId = entry.tool.id;
    if (index === searchActiveIndex) btn.classList.add("tool-search__result--active");

    const name = document.createElement("span");
    name.textContent = entry.tool.name;

    const state = document.createElement("span");
    state.className = "tool-search__result-state";
    state.textContent = STATE_LABEL[entry.tool.state] ?? entry.tool.state;

    btn.append(name, state);
    btn.addEventListener("click", () => {
      scrollToToolCard(entry.tool.id);
      searchInputEl.value = entry.tool.name;
      setSearchResults([]);
    });
    searchResultsEl.append(btn);
  });
}

function updateSearchFromInput() {
  const query = searchInputEl.value;
  if (!query.trim() || !displayedTools?.length) {
    setSearchResults([]);
    return;
  }
  const matches = rankToolsByFuzzy(query, displayedTools);
  setSearchResults(matches, matches.length ? 0 : -1);
}

function activateSearchSelection() {
  const options = [...searchResultsEl.querySelectorAll(".tool-search__result")];
  if (!options.length) {
    if (!displayedTools?.length) return;
    const query = searchInputEl.value.trim();
    if (!query) return;
    const [best] = rankToolsByFuzzy(query, displayedTools);
    if (best) scrollToToolCard(best.tool.id);
    return;
  }
  const active = options[searchActiveIndex] ?? options[0];
  const toolId = active.dataset.toolId;
  if (toolId) {
    scrollToToolCard(toolId);
    const tool = displayedTools?.find((t) => t.id === toolId);
    if (tool) searchInputEl.value = tool.name;
    setSearchResults([]);
  }
}

function initToolSearch() {
  searchInputEl.addEventListener("input", updateSearchFromInput);
  searchInputEl.addEventListener("keydown", (ev) => {
    const options = [...searchResultsEl.querySelectorAll(".tool-search__result")];
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      const matches = rankToolsByFuzzy(searchInputEl.value, displayedTools ?? []);
      if (!matches.length) return;
      const next = searchActiveIndex < 0 ? 0 : (searchActiveIndex + 1) % Math.min(matches.length, 10);
      setSearchResults(matches, next);
      searchResultsEl.querySelector(".tool-search__result--active")?.scrollIntoView({
        block: "nearest",
      });
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      const matches = rankToolsByFuzzy(searchInputEl.value, displayedTools ?? []);
      if (!matches.length) return;
      const len = Math.min(matches.length, 10);
      const next =
        searchActiveIndex < 0 ? len - 1 : (searchActiveIndex - 1 + len) % len;
      setSearchResults(matches, next);
      searchResultsEl.querySelector(".tool-search__result--active")?.scrollIntoView({
        block: "nearest",
      });
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      activateSearchSelection();
    } else if (ev.key === "Escape") {
      setSearchResults([]);
    }
  });
  searchInputEl.addEventListener("blur", () => {
    window.setTimeout(() => setSearchResults([]), 150);
  });
}

function paintDashboard(status, incidentsFile) {
  const sorted = sortToolsForDisplay(
    Array.isArray(status.tools) ? status.tools : []
  );
  adoptNewToolsForCustomFilter(sorted);
  allTools = sorted;

  const tools = filterToolsForDisplay(sorted);
  displayedTools = tools;

  if (tools.length === 0) {
    gridEl.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "grid__empty";
    empty.textContent =
      vendorFilterPreset === "issues"
        ? "No vendors with active issues match this filter."
        : "No vendors selected. Open Filter and choose at least one vendor.";
    gridEl.append(empty);
  } else {
    gridEl.replaceChildren(...tools.map((t) => renderToolCard(t, incidentsFile)));
  }

  updateVendorFilterBadge(allTools.length);
  if (!vendorFilterPopoverEl?.hidden) rebuildVendorFilterList();

  requestAnimationFrame(syncStickyScrollMargin);

  const polledAt = status.lastPolledAt ?? status.generatedAt;
  if (!polledAt) {
    lastUpdatedEl.textContent = "Waiting for first poll";
    setBanner("No status data yet. Run the poller or wait for the scheduled workflow.", "warn");
    return;
  }

  const updated = new Date(polledAt);
  const ageMs = Date.now() - updated.getTime();
  lastUpdatedEl.textContent = `Last polled ${formatDate(polledAt)}`;

  if (Number.isNaN(updated.getTime())) {
    setBanner(null);
    return;
  }

  const major = tools.filter((t) => t.state === "major");
  const degraded = tools.filter((t) => t.state === "degraded");
  const stale =
    !Number.isNaN(updated.getTime()) && ageMs > STALE_MS;

  let message = null;
  let kind = "warn";

  if (stale) {
    const mins = Math.floor(ageMs / 60000);
    message = `Data may be stale (last poll ${mins} minutes ago). Check that the Poll status workflow is running on schedule.`;
  }

  if (major.length > 0) {
    const names = major.map((t) => t.name).join(", ");
    const line = `${names} reporting major issues — verify in your apps before escalating.`;
    message = message ? `${message} ${line}` : line;
    kind = "danger";
  } else if (degraded.length > 0) {
    const names = degraded.map((t) => t.name).join(", ");
    const line = `${names} reporting degraded — verify in your apps before escalating.`;
    message = message ? `${message} ${line}` : line;
    kind = "warn";
  }

  setBanner(message, kind);
  requestAnimationFrame(syncStickyScrollMargin);
}

function render(status, incidentsFile) {
  lastStatusBody = status;
  lastIncidentsFile = incidentsFile;
  paintDashboard(status, incidentsFile);
}

async function load() {
  try {
    const [statusRes, incidentsRes] = await Promise.all([
      fetch("data/status.json", { cache: "no-store" }),
      fetch("data/incidents.json", { cache: "no-store" }),
    ]);
    if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
    const body = await statusRes.json();
    const incidentsFile = incidentsRes.ok ? await incidentsRes.json() : null;
    render(body, incidentsFile);
  } catch {
    gridEl.replaceChildren();
    lastUpdatedEl.textContent = "Could not load status data";
    setBanner("Failed to load data/status.json.", "danger");
  }
}

function initAdvisoryDetails() {
  const details = document.getElementById("advisory-details");
  if (!details) return;
  const mq = window.matchMedia("(min-width: 768px)");
  const sync = () => {
    details.open = mq.matches;
  };
  sync();
  mq.addEventListener("change", sync);
}

initVendorFilter();
initToolSearch();
initAdvisoryDetails();
window.addEventListener("resize", syncStickyScrollMargin);
load();
setInterval(load, REFRESH_MS);
