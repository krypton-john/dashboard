import { stubInvestigator } from "./stub.mjs";

/** @type {Record<string, (event: import('../../lib/alert-events.mjs').AlertEvent, tool: object) => Promise<object>>} */
export const investigators = {
  stub: stubInvestigator,
};
