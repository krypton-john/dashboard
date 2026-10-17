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
 * @param {object[]} incidents
 * @returns {{ state: ToolState; description: string } | null}
 */
export function parseSalesforceActiveIncidents(incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) return null;

  let state = /** @type {ToolState} */ ("degraded");

  for (const inc of incidents) {
    if (inc.type === "Outage") state = "major";
    for (const impact of inc.IncidentImpacts ?? []) {
      const sev = String(impact.severity ?? "").toLowerCase();
      if (sev === "critical" || sev === "major") state = "major";
    }
  }

  const first = incidents[0];
  const description =
    (typeof first.additionalInformation === "string" &&
      first.additionalInformation.trim()) ||
    (typeof first.message?.pathToResolution === "string" &&
      first.message.pathToResolution) ||
    `Active incident (${incidents.length})`;

  return { state, description: description.slice(0, 160) };
}

/**
 * @param {object[]} maintenances
 * @param {number} [nowMs]
 */
export function findActiveMaintenances(maintenances, nowMs = Date.now()) {
  if (!Array.isArray(maintenances)) return [];

  return maintenances.filter((m) => {
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
  return {
    state: "future-maintenance",
    description: `Upcoming maintenance: ${name}`.slice(0, 160),
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
