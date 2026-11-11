/**
 * @typedef {object} NotifyPolicy
 * @property {string[]} [events]
 * @property {"degraded" | "major"} [minSeverity]
 * @property {number} [cooldownMinutes]
 */

/**
 * @typedef {object} ToolNotifyConfig
 * @property {string} toolId
 * @property {string} slackWebhookSecret
 * @property {string[]} [events]
 * @property {"degraded" | "major"} [minSeverity]
 * @property {number} [cooldownMinutes]
 */

/**
 * @typedef {object} NotificationsConfig
 * @property {number} version
 * @property {NotifyPolicy & { dashboardUrl?: string }} defaults
 * @property {ToolNotifyConfig[]} tools
 */

/**
 * @param {unknown} raw
 * @returns {NotificationsConfig}
 */
export function parseNotificationsConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return { version: 1, defaults: {}, tools: [] };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    version: typeof o.version === "number" ? o.version : 1,
    defaults:
      o.defaults && typeof o.defaults === "object"
        ? /** @type {NotificationsConfig["defaults"]} */ (o.defaults)
        : {},
    tools: Array.isArray(o.tools) ? /** @type {ToolNotifyConfig[]} */ (o.tools) : [],
  };
}

/**
 * @param {NotificationsConfig} config
 * @param {string} toolId
 */
export function policyForTool(config, toolId) {
  const row = config.tools.find((t) => t.toolId === toolId);
  return {
    events: row?.events ?? config.defaults.events ?? ["incident_open"],
    minSeverity: row?.minSeverity ?? config.defaults.minSeverity ?? "degraded",
    cooldownMinutes:
      row?.cooldownMinutes ?? config.defaults.cooldownMinutes ?? 60,
    slackWebhookSecret:
      row?.slackWebhookSecret ??
      /** @type {string | undefined} */ (row?.googleChatWebhookSecret) ??
      null,
    dashboardUrl: config.defaults.dashboardUrl ?? null,
  };
}

const SEVERITY_RANK = { degraded: 1, major: 2 };

/**
 * @param {import('./alert-events.mjs').AlertEvent} event
 * @param {ReturnType<typeof policyForTool>} policy
 */
export function eventAllowed(event, policy) {
  if (!policy.slackWebhookSecret) return false;
  if (!policy.events.includes(event.type)) return false;

  if (event.severity) {
    const min = SEVERITY_RANK[policy.minSeverity] ?? 1;
    const sev = SEVERITY_RANK[event.severity] ?? 1;
    if (sev < min) return false;
  }

  if (event.type === "state_change" && event.state === "degraded") {
    const min = SEVERITY_RANK[policy.minSeverity] ?? 1;
    if (min > SEVERITY_RANK.degraded) return false;
  }

  return true;
}
