/** @typedef {import('./states.mjs').ToolState} ToolState */

/**
 * Classify a Statuspage `scheduled_maintenances` entry.
 * @param {object} maintenance
 * @param {number} [nowMs]
 * @returns {ToolState | null} null if completed / irrelevant
 */
export function classifyStatuspageMaintenance(maintenance, nowMs = Date.now()) {
  if (!maintenance || maintenance.status === "completed") return null;

  const start = Date.parse(maintenance.scheduled_for);
  const end = Date.parse(maintenance.scheduled_until);
  const hasStart = !Number.isNaN(start);
  const hasEnd = !Number.isNaN(end);

  if (maintenance.status === "in_progress") {
    return "degraded";
  }

  if (hasStart && hasEnd && nowMs >= start && nowMs <= end) {
    return "degraded";
  }

  if (hasStart && nowMs < start) {
    return "future-maintenance";
  }

  if (maintenance.status === "scheduled" || maintenance.status === "verifying") {
    return "future-maintenance";
  }

  if (hasEnd && nowMs > end) {
    return null;
  }

  return "degraded";
}

/**
 * @param {string} body Statuspage incident update body (may include markdown)
 * @returns {string | null} ISO-8601 start time
 */
export function parseMaintenanceStartFromUpdateBody(body) {
  if (typeof body !== "string" || !body.trim()) return null;

  const text = body.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

  const atUtc = text.match(
    /scheduled for\s+(.+?)\s+at\s+(\d{1,2}:\d{2})\s*UTC\b/i
  );
  if (atUtc) {
    const ms = Date.parse(`${atUtc[1]} ${atUtc[2]} UTC`);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }

  const dayOnly = text.match(/scheduled for\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  if (dayOnly) {
    const ms = Date.parse(dayOnly[1]);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }

  return null;
}

/**
 * @param {object} maintenance
 * @returns {string | null}
 */
export function parseStatuspageMaintenanceStart(maintenance) {
  const start = Date.parse(maintenance?.scheduled_for);
  if (!Number.isNaN(start)) return new Date(start).toISOString();

  if (Array.isArray(maintenance?.incident_updates)) {
    for (const update of maintenance.incident_updates) {
      const fromBody = parseMaintenanceStartFromUpdateBody(update?.body ?? "");
      if (fromBody) return fromBody;
    }
  }

  return null;
}

/**
 * @param {object[]} scheduledMaintenances
 * @param {number} [nowMs]
 * @returns {{ state: ToolState; description: string; maintenanceStartsAt: string | null } | null}
 */
export function summarizeStatuspageMaintenances(
  scheduledMaintenances,
  nowMs = Date.now()
) {
  if (!Array.isArray(scheduledMaintenances)) return null;

  const states = [];
  let description = "";
  let maintenanceStartsAt = null;

  for (const m of scheduledMaintenances) {
    const state = classifyStatuspageMaintenance(m, nowMs);
    if (!state) continue;
    states.push(state);
    if (!description && typeof m.name === "string") {
      description = m.name;
    }
    if (state === "future-maintenance") {
      const start = parseStatuspageMaintenanceStart(m);
      if (start && (!maintenanceStartsAt || start < maintenanceStartsAt)) {
        maintenanceStartsAt = start;
      }
    }
  }

  if (states.length === 0) return null;

  const state = states.includes("degraded")
    ? "degraded"
    : states.includes("future-maintenance")
      ? "future-maintenance"
      : "degraded";

  return {
    state,
    description: description || "Scheduled maintenance",
    maintenanceStartsAt,
  };
}
