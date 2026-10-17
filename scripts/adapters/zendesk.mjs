import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @param {object} incident
 */
function stateFromActiveIncident(incident) {
  const impact = incident?.attributes?.impact;
  if (impact === "critical" || impact === "major") return "major";
  return "degraded";
}

/**
 * @param {object[]} active
 * @param {object[]} maintenance
 * @param {number} [nowMs]
 */
export function parseZendeskStatus(active, maintenance, nowMs = Date.now()) {
  const states = [];
  let description = "All systems operational";
  let maintenanceStartsAt = null;

  for (const incident of active) {
    states.push(stateFromActiveIncident(incident));
    if (description === "All systems operational") {
      description = incident.attributes?.title ?? description;
    }
  }

  for (const incident of maintenance) {
    const attrs = incident?.attributes ?? {};
    const start = Date.parse(attrs.maintenance_start_time);
    const end = Date.parse(attrs.maintenance_end_time);

    if (!Number.isNaN(start) && nowMs < start) {
      states.push("future-maintenance");
      const iso = new Date(start).toISOString();
      if (!maintenanceStartsAt || iso < maintenanceStartsAt) {
        maintenanceStartsAt = iso;
        description = attrs.title ?? description;
      }
      continue;
    }

    if (
      !Number.isNaN(start) &&
      (Number.isNaN(end) || nowMs <= end) &&
      nowMs >= start &&
      (attrs.outage || attrs.degradation)
    ) {
      states.push(attrs.outage ? "major" : "degraded");
      if (description === "All systems operational") {
        description = attrs.title ?? description;
      }
    }
  }

  if (states.length === 0) {
    return {
      state: "operational",
      description,
      maintenanceStartsAt: null,
    };
  }

  const state = worstState(states);
  return {
    state,
    description: String(description).slice(0, 160),
    maintenanceStartsAt: state === "future-maintenance" ? maintenanceStartsAt : null,
  };
}

/**
 * @param {string} baseUrl e.g. https://status.zendesk.com
 * @param {AbortSignal} signal
 */
export async function fetchZendesk(baseUrl, signal) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    Accept: "application/json",
    "User-Agent": "saas-status-dashboard/1.0",
  };

  const [activeRes, maintenanceRes] = await Promise.all([
    fetch(`${base}/api/incidents/active`, { signal, headers }),
    fetch(`${base}/api/incidents/maintenance`, { signal, headers }),
  ]);

  if (!activeRes.ok) {
    throw new Error(`Zendesk active incidents HTTP ${activeRes.status}`);
  }
  if (!maintenanceRes.ok) {
    throw new Error(`Zendesk maintenance HTTP ${maintenanceRes.status}`);
  }

  const activeBody = await activeRes.json();
  const maintenanceBody = await maintenanceRes.json();

  return parseZendeskStatus(
    Array.isArray(activeBody.data) ? activeBody.data : [],
    Array.isArray(maintenanceBody.data) ? maintenanceBody.data : []
  );
}
