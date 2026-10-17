/** @typedef {'degraded' | 'major'} IncidentSeverity */
/** @typedef {import('./states.mjs').ToolState} ToolState */

/**
 * @typedef {object} IncidentRecord
 * @property {string} toolId
 * @property {string} start ISO-8601
 * @property {string | null} end ISO-8601 or null while ongoing
 * @property {IncidentSeverity} worstSeverity
 */

/**
 * @typedef {object} ToolIncidentMeta
 * @property {string} trackingSince ISO-8601
 * @property {number} nonGreenPolls consecutive degraded/major polls
 * @property {string | null} pendingStart first non-green poll time (before incident opens)
 */

/**
 * @typedef {object} IncidentsFile
 * @property {number} version
 * @property {IncidentRecord[]} incidents
 * @property {Record<string, ToolIncidentMeta>} tools
 */

const SEVERITY_RANK = { degraded: 1, major: 2 };

/**
 * @param {ToolState} state
 * @returns {boolean}
 */
export function isGreen(state) {
  return state === "operational" || state === "future-maintenance";
}

/**
 * @param {ToolState} state
 * @returns {IncidentSeverity | null}
 */
export function incidentSeverity(state) {
  if (state === "degraded") return "degraded";
  if (state === "major") return "major";
  return null;
}

/**
 * @param {IncidentSeverity} a
 * @param {IncidentSeverity} b
 */
export function maxSeverity(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * @returns {IncidentsFile}
 */
export function emptyIncidentsFile() {
  return { version: 1, incidents: [], tools: {} };
}

/**
 * @param {unknown} raw
 * @returns {IncidentsFile}
 */
export function parseIncidentsFile(raw) {
  if (!raw || typeof raw !== "object") return emptyIncidentsFile();
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    version: typeof o.version === "number" ? o.version : 1,
    incidents: Array.isArray(o.incidents) ? o.incidents : [],
    tools: o.tools && typeof o.tools === "object"
      ? /** @type {Record<string, ToolIncidentMeta>} */ (o.tools)
      : {},
  };
}

/**
 * @param {IncidentsFile} db
 * @param {string} toolId
 * @param {string} pollTime ISO
 * @returns {ToolIncidentMeta}
 */
function ensureToolMeta(db, toolId, pollTime) {
  if (!db.tools[toolId]) {
    db.tools[toolId] = {
      trackingSince: pollTime,
      nonGreenPolls: 0,
      pendingStart: null,
    };
  }
  return db.tools[toolId];
}

/**
 * @param {IncidentsFile} db
 * @param {string} toolId
 * @returns {IncidentRecord | undefined}
 */
function openIncident(db, toolId) {
  return db.incidents.find((i) => i.toolId === toolId && i.end == null);
}

/**
 * @param {IncidentsFile} db
 * @param {{ id: string, state: ToolState }[]} toolResults
 * @param {string} pollTime ISO-8601
 * @returns {boolean} whether incidents data changed semantically
 */
export function applyPollToIncidents(db, toolResults, pollTime) {
  const before = JSON.stringify(db);

  for (const tool of toolResults) {
    const meta = ensureToolMeta(db, tool.id, pollTime);
    const severity = incidentSeverity(tool.state);
    const open = openIncident(db, tool.id);

    if (isGreen(tool.state)) {
      meta.nonGreenPolls = 0;
      meta.pendingStart = null;
      if (open) open.end = pollTime;
      continue;
    }

    if (severity == null) {
      meta.nonGreenPolls = 0;
      meta.pendingStart = null;
      continue;
    }

    meta.nonGreenPolls += 1;
    if (meta.nonGreenPolls === 1) {
      meta.pendingStart = pollTime;
    }

    if (meta.nonGreenPolls >= 2) {
      const start = meta.pendingStart ?? pollTime;
      if (!open) {
        db.incidents.push({
          toolId: tool.id,
          start,
          end: null,
          worstSeverity: severity,
        });
      } else {
        open.worstSeverity = maxSeverity(open.worstSeverity, severity);
      }
    } else if (open) {
      open.worstSeverity = maxSeverity(open.worstSeverity, severity);
    }
  }

  return JSON.stringify(db) !== before;
}

/**
 * @param {IncidentsFile} db
 * @param {string} toolId
 * @param {string} [nowIso]
 * @returns {{
 *   daysSinceLastIncident: number | null;
 *   incidentOngoing: boolean;
 *   trackingSince: string | null;
 * }}
 */
export function metricsForTool(db, toolId, nowIso = new Date().toISOString()) {
  const meta = db.tools[toolId];
  const trackingSince = meta?.trackingSince ?? null;
  const open = openIncident(db, toolId);
  if (open) {
    return { daysSinceLastIncident: 0, incidentOngoing: true, trackingSince };
  }

  const ended = db.incidents
    .filter((i) => i.toolId === toolId && i.end != null)
    .map((i) => ({ end: Date.parse(i.end) }))
    .filter((i) => !Number.isNaN(i.end))
    .sort((a, b) => b.end - a.end);

  if (ended.length === 0) {
    return { daysSinceLastIncident: null, incidentOngoing: false, trackingSince };
  }

  const now = Date.parse(nowIso);
  const lastEnd = ended[0].end;
  const ms = Math.max(0, now - lastEnd);
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));

  return { daysSinceLastIncident: days, incidentOngoing: false, trackingSince };
}
