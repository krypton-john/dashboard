import { fetchPaypalAtom } from "./paypal-atom.mjs";
import { fetchSalesforce } from "./salesforce.mjs";

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
    default:
      throw new Error(`Unknown custom adapter "${kind}"`);
  }
}
