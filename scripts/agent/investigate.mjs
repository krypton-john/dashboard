import { investigators } from "./investigators/registry.mjs";

const INVESTIGATOR_TIMEOUT_MS = 8_000;

/**
 * @param {import('../lib/alert-events.mjs').AlertEvent} event
 * @param {string[]} investigatorIds
 * @param {object} toolConfig
 */
export async function runInvestigation(event, investigatorIds, toolConfig) {
  const ids =
    investigatorIds.length > 0 ? investigatorIds : ["stub"];
  /** @type {object[]} */
  const results = [];

  await Promise.all(
    ids.map(async (id) => {
      const fn = investigators[id];
      if (!fn) return;
      try {
        const result = await Promise.race([
          fn(event, toolConfig),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), INVESTIGATOR_TIMEOUT_MS)
          ),
        ]);
        results.push(result);
      } catch {
        results.push({
          vendorSummary: event.description ?? event.type,
          correlated: false,
          metrics: [],
          affectedFlows: [],
          confidence: "low",
          notes: [`Investigator "${id}" failed or timed out`],
        });
      }
    })
  );

  if (results.length === 0) {
    return {
      vendorSummary: event.description ?? event.type,
      correlated: false,
      metrics: [],
      affectedFlows: [],
      confidence: "low",
      notes: ["No investigators configured"],
    };
  }

  return mergeInvestigation(results);
}

/**
 * @param {object[]} results
 */
function mergeInvestigation(results) {
  const base = { ...results[0] };
  for (const r of results.slice(1)) {
    base.metrics = [...(base.metrics ?? []), ...(r.metrics ?? [])];
    base.affectedFlows = [
      ...new Set([
        ...(base.affectedFlows ?? []),
        ...(r.affectedFlows ?? []),
      ]),
    ];
    base.notes = [...(base.notes ?? []), ...(r.notes ?? [])];
    if (r.correlated) base.correlated = true;
    if (r.confidence === "high") base.confidence = "high";
    else if (r.confidence === "medium" && base.confidence !== "high") {
      base.confidence = "medium";
    }
  }
  return base;
}
