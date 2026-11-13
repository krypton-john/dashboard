import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * StatusHub numeric service status (public status page API).
 * @param {number} code
 * @returns {ToolState}
 */
function stateFromStatusCode(code) {
  if (code <= 1) return "operational";
  if (code <= 3) return "degraded";
  return "major";
}

/**
 * @param {{ groups?: { group_name: string; services?: { service_name: string; status: number }[] }[] }} statuses
 * @param {{ title?: string }[]} incidents
 */
export function parseStatusHub(statuses, incidents = []) {
  const states = [];
  const badNames = [];

  for (const group of statuses?.groups ?? []) {
    for (const service of group.services ?? []) {
      const st = stateFromStatusCode(service.status ?? 1);
      if (st !== "operational") {
        states.push(st);
        badNames.push(`${service.service_name} (${group.group_name})`);
      }
    }
  }

  const openIncidents = incidents.filter(
    (i) => i?.flags && !i.flags.deleted && !i.flags.archived
  );

  let description = "All systems operational";
  if (badNames.length > 0) {
    description = `Affected: ${badNames.slice(0, 3).join("; ")}`;
    if (badNames.length > 3) description += ` (+${badNames.length - 3} more)`;
  } else if (openIncidents.length > 0) {
    states.push("degraded");
    description = openIncidents[0].title ?? description;
  }

  const state = states.length ? worstState(states) : "operational";
  return { state, description: description.slice(0, 160), maintenanceStartsAt: null };
}

/**
 * @param {string} pageUrl e.g. https://statushub.example.com/
 * @param {AbortSignal} signal
 */
export async function fetchStatusHub(pageUrl, signal) {
  const base = pageUrl.replace(/\/$/, "");
  const headers = {
    Accept: "application/json",
    "User-Agent": "saas-status-dashboard/1.0",
  };

  const [statusRes, incidentRes] = await Promise.all([
    fetch(`${base}/api/statuses`, { signal, headers }),
    fetch(`${base}/api/incidents`, { signal, headers }),
  ]);

  if (!statusRes.ok) {
    throw new Error(`StatusHub statuses HTTP ${statusRes.status}`);
  }

  const statuses = await statusRes.json();
  let incidents = [];
  if (incidentRes.ok) {
    incidents = await incidentRes.json();
    if (!Array.isArray(incidents)) incidents = [];
  }

  return parseStatusHub(statuses, incidents);
}
