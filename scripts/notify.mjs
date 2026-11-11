#!/usr/bin/env node
/**
 * Exercise the notify pipeline without polling vendors (fake incident_open).
 *
 * Dry-run (log only): ALERTS_DRY_RUN=true node scripts/notify.mjs
 * Send to Slack:      ALERTS_ENABLED=true CHAT_WEBHOOK_SALESFORCE=https://hooks.slack.com/… node scripts/notify.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNotifyPipeline } from "./agent/notify-pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const tools = JSON.parse(
    await readFile(path.join(ROOT, "config", "tools.json"), "utf8")
  );
  const toolId = process.env.NOTIFY_TEST_TOOL ?? "salesforce";
  const now = new Date().toISOString();
  const sample = [
    {
      type: "incident_open",
      toolId,
      toolName: toolId,
      pollTime: now,
      fingerprint: `test-${now}`,
      severity: "degraded",
      description:
        "[TEST] Synthetic alert — safe to ignore. Advanced Analytics data is stale",
    },
  ];

  const result = await runNotifyPipeline(
    sample,
    tools.tools ?? [],
    path.join(ROOT, "data", "alerts.json")
  );
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
