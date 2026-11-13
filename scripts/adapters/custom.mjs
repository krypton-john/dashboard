import { fetchAdobeAem } from "./adobe-aem.mjs";
import { fetchAribaPortal } from "./ariba-portal.mjs";
import { fetchBetterstack } from "./betterstack.mjs";
import { fetchDomoStatus } from "./domo-status.mjs";
import { fetchPaypalAtom } from "./paypal-atom.mjs";
import { fetchPingdomPublic } from "./pingdom-public.mjs";
import { fetchSalesforce } from "./salesforce.mjs";
import { fetchStatusHub } from "./statushub.mjs";
import { fetchStripeStatus } from "./stripe-status.mjs";
import { fetchTikTokApi } from "./tiktok-api.mjs";
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
    case "statushub":
    case "stibo":
      return fetchStatusHub(tool.url, signal);
    case "pingdom-public":
    case "powerreviews":
      return fetchPingdomPublic(tool.url, signal);
    case "tiktok-api":
    case "tiktok":
      return fetchTikTokApi(tool.url, signal, tool.options);
    case "ariba-portal":
    case "ariba":
      return fetchAribaPortal(tool.url, signal);
    case "domo-status":
    case "domo":
      return fetchDomoStatus(tool.url, signal);
    case "stripe-status":
    case "stripe":
      return fetchStripeStatus(tool.url, signal);
    default:
      throw new Error(`Unknown custom adapter "${kind}"`);
  }
}
