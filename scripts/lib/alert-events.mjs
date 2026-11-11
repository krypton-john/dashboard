/** @typedef {import('./incidents.mjs').IncidentsFile} IncidentsFile */
/** @typedef {import('./states.mjs').ToolState} ToolState */

/**
 * @typedef {'incident_open' | 'severity_escalation' | 'incident_resolved' | 'future_maintenance' | 'state_change' | 'poll_unknown' | 'http_ping_fail'} AlertEventType
 */

/**
 * @typedef {object} AlertEvent
 * @property {AlertEventType} type
 * @property {string} toolId
 * @property {string} toolName
 * @property {string} pollTime
 * @property {string} fingerprint
 * @property {ToolState} [state]
 * @property {string} [description]
 * @property {'degraded' | 'major'} [severity]
 * @property {string | null} [maintenanceStartsAt]
 * @property {object | null} [scopeMatch]
 */

/**
 * @param {IncidentsFile} before
 * @param {IncidentsFile} after
 * @param {string} pollTime
 */
function incidentTransitions(before, after, pollTime) {
  /** @type {AlertEvent[]} */
  const events = [];

  const beforeOpen = new Map(
    (before.incidents || [])
      .filter((i) => i.end == null)
      .map((i) => [i.toolId, i])
  );
  const afterOpen = new Map(
    (after.incidents || [])
      .filter((i) => i.end == null)
      .map((i) => [i.toolId, i])
  );

  for (const [toolId, inc] of afterOpen) {
    const prev = beforeOpen.get(toolId);
    if (!prev) {
      events.push({
        type: "incident_open",
        toolId,
        toolName: toolId,
        pollTime,
        fingerprint: inc.start,
        severity: inc.worstSeverity,
      });
    } else if (prev.worstSeverity === "degraded" && inc.worstSeverity === "major") {
      events.push({
        type: "severity_escalation",
        toolId,
        toolName: toolId,
        pollTime,
        fingerprint: `${inc.start}:major`,
        severity: "major",
      });
    }
  }

  for (const [toolId, prev] of beforeOpen) {
    if (!afterOpen.has(toolId)) {
      events.push({
        type: "incident_resolved",
        toolId,
        toolName: toolId,
        pollTime,
        fingerprint: prev.start,
        severity: prev.worstSeverity,
      });
    }
  }

  return events;
}

/**
 * @param {object} tool
 */
function toolSnapshot(tool) {
  return {
    state: tool.state,
    description: tool.description,
    maintenanceStartsAt: tool.maintenanceStartsAt ?? null,
    error: tool.error,
    adapter: tool.adapter,
    scopeMatch: tool.scopeMatch ?? null,
  };
}

/**
 * @param {object[]} previousTools
 * @param {object[]} currentTools
 * @param {string} pollTime
 */
function statusTransitions(previousTools, currentTools, pollTime) {
  /** @type {AlertEvent[]} */
  const events = [];
  const prevMap = new Map(previousTools.map((t) => [t.id, t]));

  for (const tool of currentTools) {
    const prev = prevMap.get(tool.id);
    if (!prev) continue;

    if (tool.state === "unknown" && prev.state !== "unknown") {
      events.push({
        type: "poll_unknown",
        toolId: tool.id,
        toolName: tool.name,
        pollTime,
        fingerprint: tool.error ?? "unknown",
        state: tool.state,
        description: tool.description,
      });
    }

    if (
      tool.adapter === "http-ping" &&
      (tool.state === "degraded" || tool.state === "unknown") &&
      tool.error &&
      prev.state === "operational"
    ) {
      events.push({
        type: "http_ping_fail",
        toolId: tool.id,
        toolName: tool.name,
        pollTime,
        fingerprint: tool.error,
        state: tool.state,
        description: tool.description,
      });
    }

    if (
      tool.state === "future-maintenance" &&
      prev.state !== "future-maintenance" &&
      tool.maintenanceStartsAt
    ) {
      events.push({
        type: "future_maintenance",
        toolId: tool.id,
        toolName: tool.name,
        pollTime,
        fingerprint: tool.maintenanceStartsAt,
        state: tool.state,
        description: tool.description,
        maintenanceStartsAt: tool.maintenanceStartsAt,
        scopeMatch: tool.scopeMatch ?? null,
      });
    }

    const wasBad = prev.state === "degraded" || prev.state === "major";
    const isBad = tool.state === "degraded" || tool.state === "major";
    if (
      isBad &&
      (prev.state !== tool.state || prev.description !== tool.description)
    ) {
      events.push({
        type: "state_change",
        toolId: tool.id,
        toolName: tool.name,
        pollTime,
        fingerprint: `${tool.state}:${tool.description}`.slice(0, 120),
        state: tool.state,
        description: tool.description,
        severity: tool.state === "major" ? "major" : "degraded",
        scopeMatch: tool.scopeMatch ?? null,
      });
    } else if (isBad && !wasBad) {
      events.push({
        type: "state_change",
        toolId: tool.id,
        toolName: tool.name,
        pollTime,
        fingerprint: `${tool.state}:${tool.description}`.slice(0, 120),
        state: tool.state,
        description: tool.description,
        severity: tool.state === "major" ? "major" : "degraded",
        scopeMatch: tool.scopeMatch ?? null,
      });
    }
  }

  return events;
}

/**
 * @param {object[]} previousTools
 * @param {object[]} currentTools
 * @param {IncidentsFile} previousIncidents
 * @param {IncidentsFile} currentIncidents
 * @param {string} pollTime
 * @returns {AlertEvent[]}
 */
export function detectAlertEvents(
  previousTools,
  currentTools,
  previousIncidents,
  currentIncidents,
  pollTime
) {
  const byName = new Map(currentTools.map((t) => [t.id, t]));
  const enrich = (ev) => {
    const tool = byName.get(ev.toolId);
    if (tool) {
      ev.toolName = tool.name;
      if (!ev.description) ev.description = tool.description;
      if (!ev.state) ev.state = tool.state;
      if (ev.scopeMatch == null) ev.scopeMatch = tool.scopeMatch ?? null;
    }
    return ev;
  };

  const merged = [
    ...incidentTransitions(previousIncidents, currentIncidents, pollTime).map(
      enrich
    ),
    ...statusTransitions(previousTools, currentTools, pollTime).map(enrich),
  ];

  return merged;
}
