const STALE_MS = 30 * 60 * 1000;
const REFRESH_MS = 60 * 1000;

const STATE_LABEL = {
  operational: "Operational",
  degraded: "Degraded",
  major: "Major outage",
  unknown: "Unknown",
};

const bannerEl = document.getElementById("banner");
const lastUpdatedEl = document.getElementById("last-updated");
const gridEl = document.getElementById("tool-grid");

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

function renderToolCard(tool, incidentsFile) {
  const article = document.createElement("article");
  article.className = `card card--${tool.state}`;
  article.setAttribute("aria-label", `${tool.name} status`);

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

  article.append(light, title, status, desc, incident);
  return article;
}

function render(status, incidentsFile) {
  const tools = Array.isArray(status.tools) ? status.tools : [];
  gridEl.replaceChildren(...tools.map((t) => renderToolCard(t, incidentsFile)));

  if (!status.generatedAt) {
    lastUpdatedEl.textContent = "Waiting for first poll";
    setBanner("No status data yet. Run the poller or wait for the scheduled workflow.", "warn");
    return;
  }

  const updated = new Date(status.generatedAt);
  const ageMs = Date.now() - updated.getTime();
  lastUpdatedEl.textContent = `Last updated ${formatDate(status.generatedAt)}`;

  if (Number.isNaN(updated.getTime())) {
    setBanner(null);
    return;
  }

  if (ageMs > STALE_MS) {
    const mins = Math.floor(ageMs / 60000);
    setBanner(
      `Data may be stale (last update ${mins} minutes ago). The poller runs about every 10 minutes.`,
      "warn"
    );
  } else {
    setBanner(null);
  }

  const major = tools.filter((t) => t.state === "major");
  const degraded = tools.filter((t) => t.state === "degraded");
  if (major.length > 0) {
    setBanner(
      `${major.map((t) => t.name).join(", ")} reporting major issues.`,
      "danger"
    );
  } else if (degraded.length > 0) {
    setBanner(
      `${degraded.map((t) => t.name).join(", ")} reporting degraded performance.`,
      "warn"
    );
  }
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

load();
setInterval(load, REFRESH_MS);
