import { summarizeStatuspageMaintenances } from "../lib/statuspage-maintenance.mjs";
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
      return "degraded";
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
 * @param {number} [nowMs]
 * @returns {{ state: ToolState, description: string, maintenanceStartsAt: string | null }}
 */
export function parseStatuspageSummary(summary, nowMs = Date.now()) {
  const indicator = summary?.status?.indicator;
  const description =
    typeof summary?.status?.description === "string"
      ? summary.status.description
      : "No status description";

  let state = indicatorToState(indicator);
  let maintenanceStartsAt = null;

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
            return "degraded";
          case "maintenance":
            return i.status === "scheduled" ? "future-maintenance" : "degraded";
          default:
            return "degraded";
        }
      });
      state = worstState(impactStates);
    }
  }

  const maintenance = summarizeStatuspageMaintenances(
    summary?.scheduled_maintenances,
    nowMs
  );

  if (maintenance) {
    if (state === "operational" || state === "future-maintenance") {
      state = maintenance.state;
    } else if (maintenance.state === "degraded") {
      state = worstState([state, "degraded"]);
    }
    maintenanceStartsAt = maintenance.maintenanceStartsAt;
    if (maintenance.description && state !== "operational") {
      return { state, description: maintenance.description, maintenanceStartsAt };
    }
  }

  return { state, description, maintenanceStartsAt };
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
