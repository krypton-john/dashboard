import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @param {object} payload Domo /status JSON
 */
export function parseDomoStatus(payload) {
  const states = /** @type {ToolState[]} */ ([]);
  const active = Array.isArray(payload?.overall?.active)
    ? payload.overall.active
    : [];
  const incidents = (Array.isArray(payload?.incidents) ? payload.incidents : []).filter(
    (inc) => inc?.resolved !== true && !inc?.end
  );

  for (const item of active) {
    const severity = String(item?.severity ?? item?.impact ?? item?.status ?? "").toLowerCase();
    if (/critical|major|down|outage/.test(severity)) states.push("major");
    else if (severity) states.push("degraded");
    else states.push("degraded");
  }

  for (const inc of incidents) {
    const severity = String(inc?.severity ?? inc?.impact ?? inc?.status ?? "").toLowerCase();
    if (/critical|major|down|outage/.test(severity)) states.push("major");
    else states.push("degraded");
  }

  let description = "All Domo services operational";
  if (active.length > 0) {
    const titles = active
      .map((i) => i?.title ?? i?.name ?? i?.service)
      .filter(Boolean);
    description = titles.length
      ? `Active: ${titles.slice(0, 3).join("; ")}`
      : `${active.length} active incident(s)`;
  } else if (incidents.length > 0) {
    description = incidents[0]?.title ?? `${incidents.length} incident(s) in feed`;
  }

  const state = states.length ? worstState(states) : "operational";
  return {
    state,
    description: description.slice(0, 160),
    maintenanceStartsAt: null,
  };
}

/**
 * @param {string} pageUrl e.g. https://status.domo.com/
 * @param {AbortSignal} signal
 */
export async function fetchDomoStatus(pageUrl, signal) {
  const base = pageUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/status`, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "saas-status-dashboard/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Domo status HTTP ${res.status}`);
  }

  const body = await res.json();
  return parseDomoStatus(body);
}
