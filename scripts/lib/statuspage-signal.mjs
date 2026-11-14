const RECOVERY_STATUSES = new Set(["monitoring", "watching", "verifying"]);

/**
 * @param {object} summary Statuspage summary.json
 * @returns {boolean | null} null when there is no component list
 */
export function statuspageComponentsAllOperational(summary) {
  const components = summary?.components;
  if (!Array.isArray(components) || components.length === 0) return null;
  return components.every((c) => !c?.status || c.status === "operational");
}

/**
 * Incidents vendors keep open while monitoring recovery (e.g. third-party advisories).
 * @param {object} incident
 */
export function isStatuspageAdvisoryIncident(incident) {
  if (!incident) return true;
  if (incident.impact === "critical" || incident.impact === "major") return false;
  if (incident.impact === "maintenance") return false;
  if (RECOVERY_STATUSES.has(incident.status)) return true;
  if (incident.impact === "none") return true;
  return false;
}

/**
 * @param {object} summary
 */
export function statuspageMeaningfulIncidents(summary) {
  return (summary?.incidents ?? []).filter(
    (i) => i && i.status !== "resolved" && i.status !== "postmortem"
  ).filter((i) => !isStatuspageAdvisoryIncident(i));
}

/**
 * @param {object} summary
 */
export function statuspageOperationalDescription(summary) {
  const vendor =
    typeof summary?.status?.description === "string"
      ? summary.status.description.trim()
      : "";
  if (!vendor || /degrad|outage|disrupt|partial/i.test(vendor)) {
    return "All Systems Operational";
  }
  return vendor;
}