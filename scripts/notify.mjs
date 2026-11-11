#!/usr/bin/env node
/**
 * Dry-run notification pipeline without polling vendors.
 * Usage: ALERTS_DRY_RUN=true node scripts/notify.mjs
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
  const sample = [
    {
      type: "incident_open",
      toolId: "salesforce",
      toolName: "Salesforce",
      pollTime: new Date().toISOString(),
      fingerprint: "sample",
      severity: "degraded",
      description: "Advanced Analytics data is stale",
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
