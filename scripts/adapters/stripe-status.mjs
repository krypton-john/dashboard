import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @param {object} payload Stripe /current JSON
 */
export function parseStripeCurrent(payload) {
  const message =
    typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "Stripe status";

  const largest = String(payload?.largestatus ?? "up").toLowerCase();
  const states = /** @type {ToolState[]} */ ([]);

  if (largest === "down" || largest === "major" || largest === "outage") {
    states.push("major");
  } else if (largest !== "up" && largest !== "operational") {
    states.push("degraded");
  }

  for (const value of Object.values(payload?.statuses ?? {})) {
    const v = String(value).toLowerCase();
    if (v === "down" || v === "major") states.push("major");
    else if (v !== "up" && v !== "operational") states.push("degraded");
  }

  const state = states.length ? worstState(states) : "operational";
  return {
    state,
    description: message.slice(0, 160),
    maintenanceStartsAt: null,
  };
}

/**
 * @param {string} pageUrl e.g. https://status.stripe.com/
 * @param {AbortSignal} signal
 */
export async function fetchStripeStatus(pageUrl, signal) {
  const base = pageUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/current`, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "saas-status-dashboard/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Stripe status HTTP ${res.status}`);
  }

  const body = await res.json();
  return parseStripeCurrent(body);
}
