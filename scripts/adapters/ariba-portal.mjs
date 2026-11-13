/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const MAX_REDIRECTS = 8;

/**
 * SAP Ariba buyer URLs often redirect to login when healthy; treat 3xx/2xx as reachable.
 * @param {string} portalUrl
 * @param {AbortSignal} signal
 */
export async function fetchAribaPortal(portalUrl, signal) {
  let url = portalUrl;
  let lastStatus = 0;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const res = await fetch(url, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "text/html,*/*",
        "User-Agent": "saas-status-dashboard/1.0",
      },
    });

    lastStatus = res.status;

    if (res.status >= 200 && res.status < 300) {
      return {
        state: /** @type {ToolState} */ ("operational"),
        description: `Buyer portal reachable (HTTP ${res.status})`,
        maintenanceStartsAt: null,
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return {
          state: "degraded",
          description: `Redirect without Location (HTTP ${res.status})`,
          maintenanceStartsAt: null,
        };
      }
      url = new URL(location, url).href;
      continue;
    }

    return {
      state: "major",
      description: `Portal HTTP ${res.status}`,
      maintenanceStartsAt: null,
    };
  }

  if (lastStatus >= 300 && lastStatus < 400) {
    return {
      state: "operational",
      description: "Portal reachable (redirects to sign-in)",
      maintenanceStartsAt: null,
    };
  }

  return {
    state: "degraded",
    description: `Redirect chain exceeded ${MAX_REDIRECTS} hops (last HTTP ${lastStatus})`,
    maintenanceStartsAt: null,
  };
}
