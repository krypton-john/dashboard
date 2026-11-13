import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @param {object} payload Pingdom public checks DataTables JSON
 */
export function parsePingdomPublicChecks(payload) {
  const rows = Array.isArray(payload?.aaData) ? payload.aaData : [];
  const states = /** @type {ToolState[]} */ ([]);
  const down = [];
  const degraded = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const statusCell = String(row[0] ?? "");
    const nameCell = String(row[1] ?? "");
    const name = nameCell.replace(/<[^>]+>/g, "").trim() || "Check";

    if (statusCell.includes("status down")) {
      states.push("major");
      down.push(name);
    } else if (statusCell.includes("status warn")) {
      states.push("degraded");
      degraded.push(name);
    } else if (statusCell.includes('class="icon yellow"') && !statusCell.includes("status up")) {
      states.push("degraded");
      degraded.push(name);
    } else if (statusCell.includes('class="icon red"')) {
      states.push("major");
      down.push(name);
    }
  }

  let description = "All monitored checks up";
  if (down.length) {
    description = `Outage: ${down.slice(0, 3).join(", ")}`;
  } else if (degraded.length) {
    description = `Disruption: ${degraded.slice(0, 3).join(", ")}`;
  }

  const state = states.length ? worstState(states) : "operational";
  return { state, description: description.slice(0, 160), maintenanceStartsAt: null };
}

/**
 * @param {string} pageUrl e.g. https://status.powerreviews.com/
 * @param {AbortSignal} signal
 */
export async function fetchPingdomPublic(pageUrl, signal) {
  const base = pageUrl.replace(/\/$/, "");
  const qs = new URLSearchParams({
    sEcho: "1",
    iColumns: "9",
    sColumns: "",
    iDisplayStart: "0",
    iDisplayLength: "100",
  });

  const res = await fetch(`${base}/checks?${qs}`, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "saas-status-dashboard/1.0",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!res.ok) {
    throw new Error(`Pingdom checks HTTP ${res.status}`);
  }

  const body = await res.json();
  return parsePingdomPublicChecks(body);
}
