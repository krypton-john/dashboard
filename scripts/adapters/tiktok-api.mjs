import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const LEVEL_RANK = {
  NO_KNOWN_ISSUE: 1,
  LOW_DISRUPTION: 2,
  MAJOR_DISRUPTION: 3,
};

/**
 * @param {string} level
 * @returns {ToolState}
 */
function stateFromApiLevel(level) {
  if (level === "MAJOR_DISRUPTION") return "major";
  if (level === "LOW_DISRUPTION") return "degraded";
  return "operational";
}

/**
 * @param {object} module
 * @returns {{ states: ToolState[]; description: string | null }}
 */
function walkModule(module) {
  const states = /** @type {ToolState[]} */ ([]);
  let worst = /** @type {string | null} */ (null);
  let worstRank = 0;
  let incidentTitle = null;

  const consider = (m) => {
    const level = m.api_level ?? "NO_KNOWN_ISSUE";
    const rank = LEVEL_RANK[level] ?? 1;
    if (rank > worstRank) {
      worstRank = rank;
      worst = level;
    }
    states.push(stateFromApiLevel(level));

    for (const inc of m.incident_list ?? []) {
      if (inc.incident_level) {
        states.push(stateFromApiLevel(inc.incident_level));
        const r = LEVEL_RANK[inc.incident_level] ?? 1;
        if (r >= worstRank) incidentTitle = inc.title ?? incidentTitle;
      }
    }

    for (const sub of m.sub_modules ?? []) consider(sub);
  };

  consider(module);

  return {
    states,
    description:
      incidentTitle ??
      (worst && worst !== "NO_KNOWN_ISSUE" ? `${module.api_module_name}: ${worst.replace(/_/g, " ").toLowerCase()}` : null),
  };
}

/**
 * @param {object} payload TikTok status_page incident/list response
 */
export function parseTikTokApiStatus(payload) {
  if (payload?.code !== 0) {
    throw new Error(`TikTok API code ${payload?.code}: ${payload?.msg ?? "error"}`);
  }

  const modules = payload?.data?.api_module_list ?? [];
  const states = /** @type {ToolState[]} */ ([]);
  const descriptions = [];

  for (const mod of modules) {
    const { states: st, description } = walkModule(mod);
    states.push(...st);
    if (description) descriptions.push(description);
  }

  let description = "All TikTok Business APIs report no known issues";
  if (descriptions.length) {
    description = descriptions.slice(0, 2).join("; ");
  }

  const state = states.length ? worstState(states) : "operational";
  return { state, description: description.slice(0, 160), maintenanceStartsAt: null };
}

const DEFAULT_LIST_URL =
  "https://business-api.tiktok.com/marketing_api/api/status_page/incident/list/";

/**
 * @param {string} portalUrl Referer for the status API (403 without it)
 * @param {AbortSignal} signal
 * @param {{ statusListUrl?: string }} [options]
 */
export async function fetchTikTokApi(portalUrl, signal, options = {}) {
  const listUrl = options.statusListUrl ?? DEFAULT_LIST_URL;

  const res = await fetch(listUrl, {
    signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "saas-status-dashboard/1.0",
      Referer: portalUrl.replace(/\/$/, "/"),
    },
  });

  if (!res.ok) {
    throw new Error(`TikTok status HTTP ${res.status}`);
  }

  const body = await res.json();
  return parseTikTokApiStatus(body);
}
