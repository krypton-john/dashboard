/**
 * Human-readable vendor status page for dashboard links (not the poller API URL).
 * @param {{ id?: string; adapter?: string; customAdapter?: string; url?: string; statusPageUrl?: string }} tool
 * @returns {string | null}
 */
export function resolveStatusPageUrl(tool) {
  if (!tool || typeof tool !== "object") return null;
  if (typeof tool.statusPageUrl === "string" && tool.statusPageUrl.trim()) {
    return tool.statusPageUrl.replace(/\/$/, "");
  }

  const url = typeof tool.url === "string" ? tool.url.trim() : "";
  if (!url) return null;

  if (tool.adapter === "statuspage" && /\/api\/v2\/summary\.json$/i.test(url)) {
    return url.replace(/\/api\/v2\/summary\.json$/i, "");
  }

  if (tool.adapter === "gcloud") {
    return "https://status.cloud.google.com/";
  }

  const custom = tool.customAdapter ?? tool.id;
  switch (custom) {
    case "salesforce":
      return "https://status.salesforce.com/";
    case "zendesk":
      return "https://status.zendesk.com/";
    case "adobe-aem":
      return "https://status.adobe.com/";
    case "paypal-atom":
    case "paypal":
      return "https://www.paypal-status.com/";
    case "betterstack":
      return url.replace(/\/index\.json$/i, "");
    case "statushub":
    case "stibo":
    case "pingdom-public":
    case "powerreviews":
    case "domo-status":
    case "domo":
    case "stripe-status":
    case "stripe":
    case "tiktok-api":
    case "tiktok-business-api":
      return url.replace(/\/$/, "");
    case "ariba-portal":
    case "ariba":
      return null;
    default:
      break;
  }

  if (tool.adapter === "http-ping") return null;

  if (!/\/(api\/|feed\/|incidents\.json|index\.json|StatusEvents)/i.test(url)) {
    return url.replace(/\/$/, "");
  }

  return null;
}
