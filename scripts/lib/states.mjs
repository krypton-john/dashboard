/** @typedef {'operational' | 'degraded' | 'major' | 'unknown'} ToolState */

export const TOOL_STATES = /** @type {const} */ ([
  "operational",
  "degraded",
  "major",
  "unknown",
]);

/** @param {ToolState[]} states */
export function worstState(states) {
  const rank = { major: 3, degraded: 2, operational: 1, unknown: 0 };
  let worst = /** @type {ToolState} */ ("operational");
  for (const s of states) {
    if (rank[s] > rank[worst]) worst = s;
  }
  return worst;
}
