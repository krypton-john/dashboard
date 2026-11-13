/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "saas-status-dashboard/1.0",
};

/**
 * @param {string} url Tool URL (API base, e.g. https://api.status.salesforce.com/v1)
 */
export function salesforceApiBase(url) {
  return url.replace(/\/$/, "").replace(/\/instances$/, "");
}

/**
 * Trust API keeps known-issue / feature disruptions (often minor, non-core) in
 * `incidents/active`. Only surface platform-impacting incidents on the dashboard.
 * @param {object} inc
 */
export function salesforceIncidentAffectsDashboard(inc) {
  if (!inc || typeof inc !== "object") return false;
  if (String(inc.type) === "Outage") return true;

  const impacts = Array.isArray(inc.IncidentImpacts) ? inc.IncidentImpacts : [];
  if (impacts.length === 0) return String(inc.type) === "Degradation";

  const material = new Set(["critical", "major", "significant", "moderate"]);
  let hasMaterial = false;
  let onlyMinorNonCore = true;

  for (const impact of impacts) {
    const sev = String(impact.severity ?? "").toLowerCase();
    if (material.has(sev)) {
      hasMaterial = true;
      onlyMinorNonCore = false;
    } else if (sev !== "minor") {
      onlyMinorNonCore = false;
    }
  }

  if (hasMaterial) return true;
  if (onlyMinorNonCore && inc.isCore === false) return false;

  return impacts.some((impact) => {
    const sev = String(impact.severity ?? "").toLowerCase();
    return sev === "minor" && inc.isCore !== false;
  });
}

/**
 * @param {object[]} incidents
 * @returns {{ state: ToolState; description: string } | null}
 */
export function parseSalesforceActiveIncidents(incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) return null;

  const relevant = incidents.filter(salesforceIncidentAffectsDashboard);
  if (relevant.length === 0) return null;

  let state = /** @type {ToolState} */ ("degraded");

  for (const inc of relevant) {
    if (inc.type === "Outage") state = "major";
    for (const impact of inc.IncidentImpacts ?? []) {
      const sev = String(impact.severity ?? "").toLowerCase();
      if (sev === "critical" || sev === "major") state = "major";
    }
  }

  const first = relevant[0];
  const description =
    (typeof first.message?.pathToResolution === "string" &&
      first.message.pathToResolution.trim()) ||
    (typeof first.name === "string" && first.name.trim()) ||
    (typeof first.additionalInformation === "string" &&
    !/^https?:\/\//i.test(first.additionalInformation.trim())
      ? first.additionalInformation.trim()
      : null) ||
    `Active incident (${relevant.length})`;

  return { state, description: description.slice(0, 160) };
}

/**
 * @param {object[]} maintenances
 * @param {number} [nowMs]
 */
export function findActiveMaintenances(maintenances, nowMs = Date.now()) {
  if (!Array.isArray(maintenances)) return [];

  return maintenances.filter((m) => {
    if (m.isCore === false) return false;
    const start = Date.parse(m.plannedStartTime);
    const end = Date.parse(m.plannedEndTime);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return start <= nowMs && nowMs <= end;
  });
}

const UPCOMING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {object} maintenance
 */
function isSalesforceMaintenanceEvent(maintenance) {
  const type = String(maintenance?.type ?? "").toLowerCase();
  if (type === "release") return false;
  const name = String(maintenance?.name ?? "").toLowerCase();
  if (name.includes("major release") || name.includes("winter '")) return false;
  return true;
}

/**
 * @param {object[]} maintenances
 * @param {number} [nowMs]
 */
export function findUpcomingMaintenances(maintenances, nowMs = Date.now()) {
  if (!Array.isArray(maintenances)) return [];

  return maintenances.filter((m) => {
    if (!isSalesforceMaintenanceEvent(m)) return false;
    if (m.isCore === false) return false;
    const start = Date.parse(m.plannedStartTime);
    const end = Date.parse(m.plannedEndTime);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    if (start <= nowMs) return false;
    if (start - nowMs > UPCOMING_WINDOW_MS) return false;
    return true;
  });
}

/**
 * @param {object[]} maintenances
 * @param {number} [nowMs]
 * @returns {{ state: ToolState; description: string } | null}
 */
export function parseSalesforceMaintenances(maintenances, nowMs = Date.now()) {
  const active = findActiveMaintenances(maintenances, nowMs);
  if (active.length === 0) return null;

  const name =
    typeof active[0].name === "string" ? active[0].name : "Scheduled maintenance";
  return {
    state: "degraded",
    description: `Maintenance in progress: ${name}`.slice(0, 160),
  };
}

/**
 * @param {object[]} incidents
 * @param {object[]} maintenances
 * @param {number} [nowMs]
 */
/**
 * @param {object[]} maintenances
 * @param {number} [nowMs]
 */
export function parseSalesforceUpcomingMaintenances(
  maintenances,
  nowMs = Date.now()
) {
  const upcoming = findUpcomingMaintenances(maintenances, nowMs);
  if (upcoming.length === 0) return null;

  const name =
    typeof upcoming[0].name === "string"
      ? upcoming[0].name
      : "Scheduled maintenance";
  const startMs = Date.parse(upcoming[0].plannedStartTime);
  const maintenanceStartsAt = Number.isNaN(startMs)
    ? null
    : new Date(startMs).toISOString();

  return {
    state: "future-maintenance",
    description: `Upcoming maintenance: ${name}`.slice(0, 160),
    maintenanceStartsAt,
  };
}

export function parseSalesforceStatus(incidents, maintenances, nowMs = Date.now()) {
  const incident = parseSalesforceActiveIncidents(incidents);
  if (incident) return incident;

  const maintenance = parseSalesforceMaintenances(maintenances, nowMs);
  if (maintenance) return maintenance;

  const upcoming = parseSalesforceUpcomingMaintenances(maintenances, nowMs);
  if (upcoming) return upcoming;

  return { state: "operational", description: "No active incidents or maintenance" };
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
export async function fetchSalesforce(url, signal) {
  const base = salesforceApiBase(url);

  const [incidentsRes, maintenancesRes] = await Promise.all([
    fetch(`${base}/incidents/active`, { signal, headers: HEADERS }),
    fetch(`${base}/maintenances`, { signal, headers: HEADERS }),
  ]);

  if (!incidentsRes.ok) {
    throw new Error(`incidents/active HTTP ${incidentsRes.status}`);
  }
  if (!maintenancesRes.ok) {
    throw new Error(`maintenances HTTP ${maintenancesRes.status}`);
  }

  const incidents = await incidentsRes.json();
  const maintenances = await maintenancesRes.json();

  return parseSalesforceStatus(incidents, maintenances);
}
