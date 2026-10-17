import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const DEFAULT_PRODUCT_IDS = ["503489", "503470"];

/**
 * @param {object} messages
 * @param {string} token
 */
function messageText(messages, token) {
  if (!token || !messages?.en) return null;
  const entry = messages.en[token];
  if (!entry) return null;
  if (typeof entry.textMessage === "string") return entry.textMessage;
  if (typeof entry.titleMessage === "string") return entry.titleMessage;
  return null;
}

/**
 * @param {object} historyEntry
 */
function isOpenAdobeHistory(historyEntry) {
  if (!historyEntry) return false;
  if (historyEntry.status === "Closed") return false;
  if (historyEntry.csoStatus === "Closed" || historyEntry.csoStatus === "Dismissed") {
    return false;
  }
  if (historyEntry.severity === "Potential" || historyEntry.severity === "Trivial") {
    return false;
  }
  return true;
}

/**
 * @param {string} severity
 * @returns {ToolState}
 */
function severityToState(severity) {
  if (severity === "Major" || severity === "Critical") return "major";
  return "degraded";
}

/**
 * @param {object} eventsBody StatusEvents JSON
 * @param {string[]} productIds
 */
export function parseAdobeAemStatus(eventsBody, productIds = DEFAULT_PRODUCT_IDS) {
  const incidents = eventsBody?.incidentEvent?.incidents ?? {};
  const messages = eventsBody?.incidentEvent?.messages ?? {};
  const idSet = new Set(productIds);

  const states = [];
  let description = "All services available";

  for (const incident of Object.values(incidents)) {
    const products = incident?.products ?? {};
    for (const [productId, product] of Object.entries(products)) {
      if (!idSet.has(productId)) continue;

      const history = Object.values(product?.history ?? {}).sort(
        (a, b) => (b.statusTime ?? 0) - (a.statusTime ?? 0)
      );
      const latest = history[0];
      if (!isOpenAdobeHistory(latest)) continue;

      states.push(severityToState(latest.severity));
      const fromMessage =
        messageText(messages, latest.messageToken) ??
        messageText(messages, latest.titleToken);
      description =
        fromMessage ??
        `${product.name ?? "Adobe Experience Manager"} — ${latest.severity} impact`;
    }
  }

  if (states.length === 0) {
    return {
      state: "operational",
      description,
      maintenanceStartsAt: null,
    };
  }

  return {
    state: worstState(states),
    description: description.slice(0, 160),
    maintenanceStartsAt: null,
  };
}

/**
 * @param {string} eventsUrl
 * @param {AbortSignal} signal
 * @param {{ productIds?: string[] }} [options]
 */
export async function fetchAdobeAem(eventsUrl, signal, options = {}) {
  const res = await fetch(eventsUrl, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "saas-status-dashboard/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const productIds =
    Array.isArray(options.productIds) && options.productIds.length > 0
      ? options.productIds
      : DEFAULT_PRODUCT_IDS;
  return parseAdobeAemStatus(body, productIds);
}
