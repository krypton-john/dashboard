import { worstState } from "../lib/states.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const RESOURCE_BAD = new Set([
  "degraded",
  "downtime",
  "maintenance",
  "under_maintenance",
]);

/**
 * @param {object} indexJson Better Stack `index.json` payload
 * @param {number} [nowMs]
 */
export function parseBetterstackIndex(indexJson, nowMs = Date.now()) {
  const aggregate = indexJson?.data?.attributes?.aggregate_state;
  const states = [];
  let description =
    typeof indexJson?.data?.attributes?.announcement === "string" &&
    indexJson.data.attributes.announcement.trim()
      ? indexJson.data.attributes.announcement.trim()
      : "All systems operational";
  let maintenanceStartsAt = null;

  if (aggregate && aggregate !== "operational") {
    states.push(aggregate === "downtime" ? "major" : "degraded");
  }

  for (const item of indexJson?.included ?? []) {
    if (item.type !== "status_page_resource") continue;
    const status = item.attributes?.status;
    const name = item.attributes?.public_name ?? "Service";
    if (!status || status === "operational") continue;
    if (RESOURCE_BAD.has(status)) {
      states.push(status === "downtime" ? "major" : "degraded");
      if (description === "All systems operational") {
        description = `${name} ${status.replace(/_/g, " ")}`;
      }
    }
  }

  for (const item of indexJson?.included ?? []) {
    if (item.type !== "status_report") continue;
    const attrs = item.attributes ?? {};
    if (attrs.aggregate_state === "resolved") continue;

    const start = Date.parse(attrs.starts_at);
    const end = attrs.ends_at ? Date.parse(attrs.ends_at) : null;
    const title = typeof attrs.title === "string" ? attrs.title : "Maintenance";

    if (!Number.isNaN(start) && nowMs < start) {
      states.push("future-maintenance");
      const iso = new Date(start).toISOString();
      if (!maintenanceStartsAt || iso < maintenanceStartsAt) {
        maintenanceStartsAt = iso;
        description = title;
      }
      continue;
    }

    if (
      !Number.isNaN(start) &&
      (Number.isNaN(end) || nowMs <= end) &&
      nowMs >= start
    ) {
      states.push("degraded");
      if (description === "All systems operational") description = title;
    }
  }

  if (states.length === 0) {
    return {
      state: "operational",
      description: description.slice(0, 160),
      maintenanceStartsAt: null,
    };
  }

  const state = worstState(states);
  return {
    state,
    description: description.slice(0, 160),
    maintenanceStartsAt: state === "future-maintenance" ? maintenanceStartsAt : null,
  };
}

/**
 * @param {string} indexUrl e.g. https://status.trueloyal.com/index.json
 * @param {AbortSignal} signal
 */
export async function fetchBetterstack(indexUrl, signal) {
  const res = await fetch(indexUrl, {
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
  return parseBetterstackIndex(body);
}
