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
 * @param {object[]} scheduledMaintenances
 * @param {number} [nowMs]
 * @returns {{ state: ToolState; description: string } | null}
 */
export function summarizeStatuspageMaintenances(
  scheduledMaintenances,
  nowMs = Date.now()
) {
  if (!Array.isArray(scheduledMaintenances)) return null;

  const states = [];
  let description = "";

  for (const m of scheduledMaintenances) {
    const state = classifyStatuspageMaintenance(m, nowMs);
    if (!state) continue;
    states.push(state);
    if (!description && typeof m.name === "string") {
      description = m.name;
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
  };
}
