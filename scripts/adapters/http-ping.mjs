/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const DEFAULT_MAX_LATENCY_MS = 8000;

/**
 * @param {number} status
 * @param {number[]} acceptable
 */
function statusOk(status, acceptable) {
  if (acceptable.length > 0) return acceptable.includes(status);
  return status >= 200 && status < 400;
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 * @param {{ maxLatencyMs?: number; acceptableStatuses?: number[] }} [options]
 */
export async function fetchHttpPing(url, signal, options = {}) {
  const maxLatencyMs = options.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS;
  const acceptable = options.acceptableStatuses ?? [];
  const started = performance.now();

  const res = await fetch(url, {
    method: "GET",
    signal,
    redirect: "follow",
    headers: {
      Accept: "*/*",
      "User-Agent": "saas-status-dashboard/1.0",
    },
  });

  const latencyMs = Math.round(performance.now() - started);

  if (!statusOk(res.status, acceptable)) {
    return {
      state: /** @type {ToolState} */ ("major"),
      description: `HTTP ${res.status} (${latencyMs} ms)`,
    };
  }

  if (latencyMs > maxLatencyMs) {
    return {
      state: "degraded",
      description: `Slow response (${latencyMs} ms)`,
    };
  }

  return {
    state: "operational",
    description: `Reachable (${latencyMs} ms)`,
  };
}
