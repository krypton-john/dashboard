/**
 * @param {import('../../lib/alert-events.mjs').AlertEvent} event
 * @param {object} toolConfig from tools.json
 */
export async function stubInvestigator(event, toolConfig) {
  const name = toolConfig?.name ?? event.toolName;

  return {
    vendorSummary: `${name}: ${event.description ?? event.type}`,
    correlated: false,
    metrics: [],
    affectedFlows: [],
    confidence: "low",
    notes: [
      "Internal telemetry not connected yet (stub investigator).",
      "Configure real investigators in config/investigators.json.",
    ],
  };
}
