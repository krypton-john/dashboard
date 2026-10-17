import { fetchAdobeAem } from "./adobe-aem.mjs";
import { fetchBetterstack } from "./betterstack.mjs";
import { fetchPaypalAtom } from "./paypal-atom.mjs";
import { fetchSalesforce } from "./salesforce.mjs";
import { fetchZendesk } from "./zendesk.mjs";

/**
 * @param {object} tool
 * @param {AbortSignal} signal
 */
export async function fetchCustom(tool, signal) {
  const kind = tool.customAdapter ?? tool.id;

  switch (kind) {
    case "paypal-atom":
    case "paypal":
      return fetchPaypalAtom(tool.url, signal);
    case "salesforce":
      return fetchSalesforce(tool.url, signal);
    case "zendesk":
      return fetchZendesk(tool.url, signal);
    case "betterstack":
      return fetchBetterstack(tool.url, signal);
    case "adobe-aem":
      return fetchAdobeAem(tool.url, signal, tool.options);
    default:
      throw new Error(`Unknown custom adapter "${kind}"`);
  }
}
