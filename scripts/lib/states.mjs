/** @typedef {'operational' | 'future-maintenance' | 'degraded' | 'major' | 'unknown'} ToolState */

export const TOOL_STATES = /** @type {const} */ ([
  "operational",
  "future-maintenance",
  "degraded",
  "major",
  "unknown",
]);

const RANK = {
  major: 4,
  degraded: 3,
  "future-maintenance": 2,
  operational: 1,
  unknown: 0,
};

/** @param {ToolState[]} states */
export function worstState(states) {
  let worst = /** @type {ToolState} */ ("operational");
  for (const s of states) {
    if ((RANK[s] ?? 0) > (RANK[worst] ?? 0)) worst = s;
  }
  return worst;
}

/** @param {ToolState} state */
export function isOperationalForIncidents(state) {
  return state === "operational" || state === "future-maintenance";
}
