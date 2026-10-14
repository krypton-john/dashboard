import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @param {string} indicator Statuspage `status.indicator`
 * @returns {ToolState}
 */
export function indicatorToState(indicator) {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
    case "maintenance":
      return "degraded";
    case "major":
    case "critical":
      return "major";
    default:
      return "unknown";
  }
}

/**
 * @param {object} summary Parsed Statuspage summary.json
 * @returns {{ state: ToolState, description: string }}
 */
export function parseStatuspageSummary(summary) {
  const indicator = summary?.status?.indicator;
  const description =
    typeof summary?.status?.description === "string"
      ? summary.status.description
      : "No status description";

  let state = indicatorToState(indicator);

  if (state === "operational" && Array.isArray(summary?.incidents)) {
    const active = summary.incidents.filter(
      (i) => i && i.status !== "resolved" && i.status !== "postmortem"
    );
    if (active.length > 0) {
      const impactStates = active.map((i) => {
        switch (i.impact) {
          case "critical":
          case "major":
            return "major";
          case "minor":
          case "maintenance":
            return "degraded";
          default:
            return "degraded";
        }
      });
      state = worstState(impactStates);
    }
  }

  if (
    state === "operational" &&
    Array.isArray(summary?.scheduled_maintenances)
  ) {
    const activeMaint = summary.scheduled_maintenances.filter(
      (m) => m && m.status !== "completed"
    );
    if (activeMaint.length > 0) state = "degraded";
  }

  return { state, description };
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
export async function fetchStatuspage(url, signal) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "saas-status-dashboard/1.0" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  return parseStatuspageSummary(body);
}
