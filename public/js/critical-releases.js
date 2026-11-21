import { initSiteNav, syncStickyScrollMarginForHeader } from "./site-nav.js";

const SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const lastUpdatedEl = document.getElementById("last-updated");
const gridEl = document.getElementById("release-grid");
const bannerEl = document.getElementById("banner");

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function setBanner(message, visible) {
  if (!bannerEl) return;
  if (!message) {
    bannerEl.classList.add("banner--hidden");
    bannerEl.textContent = "";
    return;
  }
  bannerEl.textContent = message;
  bannerEl.classList.remove("banner--hidden");
}

/**
 * @param {object} item
 */
function renderReleaseCard(item) {
  const sev = String(item.severity ?? "high").toLowerCase();
  const hasLink =
    typeof item.referenceUrl === "string" && item.referenceUrl.startsWith("https://");
  const shell = document.createElement(hasLink ? "a" : "article");
  shell.className = `release-card release-card--${sev}`;
  if (hasLink) {
    shell.href = item.referenceUrl;
    shell.target = "_blank";
    shell.rel = "noopener noreferrer";
    shell.classList.add("release-card--link");
  }

  const badge = document.createElement("p");
  badge.className = "release-card__severity";
  badge.textContent = SEVERITY_LABEL[sev] ?? sev;

  const product = document.createElement("p");
  product.className = "release-card__product";
  product.textContent = item.product ?? "Software";

  const title = document.createElement("h2");
  title.className = "release-card__title";
  title.textContent = item.title ?? "Security release";

  const summary = document.createElement("p");
  summary.className = "release-card__summary";
  summary.textContent = item.summary ?? "";

  const action = document.createElement("p");
  action.className = "release-card__action";
  action.textContent = item.actionRequired ?? "";

  const when = document.createElement("p");
  when.className = "release-card__date";
  when.textContent = item.publishedAt
    ? `Published ${formatDate(item.publishedAt)}`
    : "";

  shell.append(badge, product, title, summary, action, when);
  if (hasLink) {
    const hint = document.createElement("p");
    hint.className = "release-card__link-hint";
    hint.textContent = "Vendor advisory ↗";
    shell.append(hint);
  }
  return shell;
}

function render(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const sorted = [...items].sort((a, b) => {
    const ta = Date.parse(a?.publishedAt ?? 0);
    const tb = Date.parse(b?.publishedAt ?? 0);
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  if (sorted.length === 0) {
    gridEl.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "grid__empty";
    empty.textContent = "No critical software releases are listed yet.";
    gridEl.append(empty);
  } else {
    gridEl.replaceChildren(...sorted.map((item) => renderReleaseCard(item)));
  }

  const updated = data?.updatedAt;
  lastUpdatedEl.textContent = updated
    ? `List updated ${formatDate(updated)}`
    : "Release list not dated";

  const critical = sorted.filter((i) => String(i.severity).toLowerCase() === "critical");
  setBanner(
    critical.length
      ? `${critical.length} critical item(s) need review — confirm patching in your estate.`
      : null,
    critical.length > 0
  );

  requestAnimationFrame(syncStickyScrollMarginForHeader);
}

async function load() {
  try {
    const res = await fetch("data/critical-releases.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch {
    gridEl.replaceChildren();
    lastUpdatedEl.textContent = "Could not load release data";
    setBanner("Failed to load data/critical-releases.json.", true);
  }
}

initSiteNav("critical");
window.addEventListener("resize", syncStickyScrollMarginForHeader);
load();