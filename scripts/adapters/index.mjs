import { fetchGcloud } from "./gcloud.mjs";
import { fetchStatuspage } from "./statuspage.mjs";

/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

/**
 * @typedef {object} ToolConfig
 * @property {string} id
 * @property {string} name
 * @property {'statuspage' | 'gcloud' | 'http-ping' | 'custom'} adapter
 * @property {string} [url]
 * @property {boolean} enabled
 */

/**
 * @typedef {object} ToolResult
 * @property {string} id
 * @property {string} name
 * @property {ToolState} state
 * @property {string} description
 * @property {string} polledAt
 * @property {string | null} error
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
    polledAt,
    error: null,
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
        parsed = await fetchGcloud(tool.url, controller.signal);
        break;
      case "http-ping":
      case "custom":
        return {
          ...base,
          state: "unknown",
          description: `Adapter "${tool.adapter}" not implemented yet`,
          error: "unsupported_adapter",
        };
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
