import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @param {string} updateStatus
 * @returns {ToolState}
 */
function gcloudUpdateToState(updateStatus) {
  switch (updateStatus) {
    case "SERVICE_OUTAGE":
      return "major";
    case "SERVICE_DISRUPTION":
    case "SERVICE_INFORMATION":
      return "degraded";
    case "AVAILABLE":
      return "operational";
    default:
      return "unknown";
  }
}

/**
 * @param {object} incident
 * @returns {ToolState}
 */
function incidentState(incident) {
  const updates = Array.isArray(incident?.updates) ? incident.updates : [];
  if (updates.length === 0) return "degraded";

  const sorted = [...updates].sort((a, b) => {
    const ta = Date.parse(a?.when || a?.created || "");
    const tb = Date.parse(b?.when || b?.created || "");
    return ta - tb;
  });
  const latest = sorted[sorted.length - 1];
  const fromUpdate = gcloudUpdateToState(latest?.status);

  // Open incident with "available" update still counts as degraded until closed.
  if (fromUpdate === "operational") return "degraded";
  return fromUpdate;
}

/**
 * @param {object[]} incidents
 * @returns {{ state: ToolState, description: string }}
 */
export function parseGcloudIncidents(incidents) {
  if (!Array.isArray(incidents)) {
    return { state: "unknown", description: "Unexpected incidents payload" };
  }

  const now = Date.now();
  const ongoing = incidents.filter((inc) => {
    const end = inc?.end;
    if (!end) return true;
    const endMs = Date.parse(end);
    return Number.isNaN(endMs) || endMs > now;
  });

  if (ongoing.length === 0) {
    return { state: "operational", description: "No active incidents" };
  }

  const states = ongoing.map(incidentState);
  const state = worstState(states);
  const titles = ongoing
    .map((i) => i?.external_desc)
    .filter(Boolean)
    .slice(0, 2);
  const description =
    titles.length > 0
      ? titles.join(" · ")
      : `${ongoing.length} active incident(s)`;

  return { state, description };
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
export async function fetchGcloud(url, signal) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "saas-status-dashboard/1.0" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  return parseGcloudIncidents(body);
}
