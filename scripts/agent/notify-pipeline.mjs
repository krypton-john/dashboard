import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  alertFingerprint,
  isInCooldown,
  parseAlertsFile,
  recordSent,
} from "../lib/alerts-store.mjs";
import {
  eventAllowed,
  parseNotificationsConfig,
  policyForTool,
} from "../lib/notifications-config.mjs";
import { composeChatMessage } from "./compose-message.mjs";
import {
  resolveWebhookFromEnv,
  sendGoogleChatWebhook,
} from "./google-chat.mjs";
import { runInvestigation } from "./investigate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * @typedef {import('../lib/alert-events.mjs').AlertEvent} AlertEvent
 */

/**
 * @param {unknown} raw
 */
function parseInvestigatorsConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return { defaultInvestigators: ["stub"], tools: {} };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    defaultInvestigators: Array.isArray(o.defaultInvestigators)
      ? o.defaultInvestigators
      : ["stub"],
    tools:
      o.tools && typeof o.tools === "object"
        ? /** @type {Record<string, string[]>} */ (o.tools)
        : {},
  };
}

/**
 * @param {AlertEvent[]} events
 * @param {object[]} toolConfigs from config/tools.json
 * @param {string} alertsPath
 * @param {string} notificationsPath
 * @param {string} investigatorsPath
 */
export async function runNotifyPipeline(
  events,
  toolConfigs,
  alertsPath = path.join(ROOT, "data", "alerts.json"),
  notificationsPath = path.join(ROOT, "config", "notifications.json"),
  investigatorsPath = path.join(ROOT, "config", "investigators.json")
) {
  if (!events.length) return { sent: 0, skipped: 0 };

  const dryRun =
    process.env.ALERTS_DRY_RUN === "1" || process.env.ALERTS_DRY_RUN === "true";
  const enabled =
    process.env.ALERTS_ENABLED === "1" || process.env.ALERTS_ENABLED === "true";
  if (!enabled && !dryRun) {
    console.log("Alerts disabled (set ALERTS_ENABLED=true to send).");
    return { sent: 0, skipped: events.length };
  }

  const notifyRaw = JSON.parse(await readFile(notificationsPath, "utf8"));
  const notifyConfig = parseNotificationsConfig(notifyRaw);
  const invRaw = JSON.parse(await readFile(investigatorsPath, "utf8"));
  const invConfig = parseInvestigatorsConfig(invRaw);

  let alertsDb = parseAlertsFile(null);
  try {
    alertsDb = parseAlertsFile(JSON.parse(await readFile(alertsPath, "utf8")));
  } catch {
    /* first run */
  }

  const toolById = new Map(toolConfigs.map((t) => [t.id, t]));
  let sent = 0;
  let skipped = 0;

  for (const event of events) {
    const policy = policyForTool(notifyConfig, event.toolId);
    if (!eventAllowed(event, policy)) {
      skipped += 1;
      continue;
    }

    const fullFp = alertFingerprint(event.toolId, event.type, event.fingerprint);
    if (isInCooldown(alertsDb, fullFp, policy.cooldownMinutes)) {
      skipped += 1;
      continue;
    }

    const toolConfig = toolById.get(event.toolId) ?? {
      id: event.toolId,
      name: event.toolName,
    };
    const investigatorIds =
      invConfig.tools[event.toolId] ?? invConfig.defaultInvestigators;

    const investigation = await runInvestigation(
      event,
      investigatorIds,
      toolConfig
    );
    const text = composeChatMessage(event, investigation, {
      dashboardUrl: notifyConfig.defaults.dashboardUrl ?? null,
      vendorUrl: toolConfig.url ?? null,
    });

    const webhook = resolveWebhookFromEnv(policy.googleChatWebhookSecret);
    if (!webhook && !dryRun) {
      console.warn(
        `No webhook env ${policy.googleChatWebhookSecret} for ${event.toolId}; skipping`
      );
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Chat → ${event.toolId} (${event.type}):\n${text}\n`);
    } else {
      await sendGoogleChatWebhook(webhook, text);
      console.log(`Sent Chat alert for ${event.toolId} (${event.type})`);
    }

    recordSent(alertsDb, {
      fingerprint: fullFp,
      sentAt: new Date().toISOString(),
      toolId: event.toolId,
      eventType: event.type,
    });
    sent += 1;
  }

  await writeFile(
    alertsPath,
    `${JSON.stringify(alertsDb, null, 2)}\n`,
    "utf8"
  );

  return { sent, skipped };
}
