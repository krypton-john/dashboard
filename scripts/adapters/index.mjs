import { fetchCustom } from "./custom.mjs";
import { fetchGcloud } from "./gcloud.mjs";
import { fetchHttpPing } from "./http-ping.mjs";
import { fetchStatuspage } from "./statuspage.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @typedef {object} ToolConfig
 * @property {string} id
 * @property {string} name
 * @property {'statuspage' | 'gcloud' | 'http-ping' | 'custom'} adapter
 * @property {string} [url]
 * @property {boolean} enabled
 * @property {string} [customAdapter]
 * @property {{ maxLatencyMs?: number; acceptableStatuses?: number[]; productIds?: string[] }} [options]
 * @property {{ scope?: import('../lib/gcloud-scope.mjs').GcloudScope }} [alerting]
 */

/**
 * @typedef {object} ToolResult
 * @property {string} id
 * @property {string} name
 * @property {ToolState} state
 * @property {string} description
 * @property {string} polledAt
 * @property {string | null} error
 * @property {string | null} [maintenanceStartsAt]
 * @property {string} [adapter]
 * @property {object | null} [scopeMatch]
 */

const POLL_TIMEOUT_MS = 25_000;

/**
 * @param {ToolConfig} tool
 * @returns {Promise<ToolResult>}
 */
export async function pollTool(tool) {
  const polledAt = new Date().toISOString();
  const base = {
    id: tool.id,
    name: tool.name,
    adapter: tool.adapter,
    polledAt,
    error: null,
    scopeMatch: null,
  };

  if (!tool.url) {
    return {
      ...base,
      state: "unknown",
      description: "Missing URL in config",
      error: "config",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

  try {
    let parsed;
    switch (tool.adapter) {
      case "statuspage":
        parsed = await fetchStatuspage(tool.url, controller.signal);
        break;
      case "gcloud":
        parsed = await fetchGcloud(
          tool.url,
          controller.signal,
          tool.alerting?.scope
        );
        break;
      case "http-ping":
        parsed = await fetchHttpPing(tool.url, controller.signal, tool.options);
        break;
      case "custom":
        parsed = await fetchCustom(tool, controller.signal);
        break;
      default:
        return {
          ...base,
          state: "unknown",
          description: `Unknown adapter "${tool.adapter}"`,
          error: "unknown_adapter",
        };
    }

    return {
      ...base,
      state: parsed.state,
      description: parsed.description,
      maintenanceStartsAt: parsed.maintenanceStartsAt ?? null,
      scopeMatch: parsed.scopeMatch ?? null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch status";
    return {
      ...base,
      state: "unknown",
      description: "Could not reach status source",
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}
