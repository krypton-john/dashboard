import assert from "node:assert/strict";
import { detectAlertEvents } from "./lib/alert-events.mjs";
import { filterGcloudIncidentsByScope, matchProducts } from "./lib/gcloud-scope.mjs";
import {
  eventAllowed,
  parseNotificationsConfig,
  policyForTool,
} from "./lib/notifications-config.mjs";
import { alertFingerprint, isInCooldown, parseAlertsFile } from "./lib/alerts-store.mjs";
import { composeChatMessage } from "./agent/compose-message.mjs";

const t0 = "2026-11-01T10:00:00Z";
const beforeIncidents = {
  version: 1,
  incidents: [],
  tools: {},
};
const afterIncidents = {
  version: 1,
  incidents: [
    {
      toolId: "github",
      start: t0,
      end: null,
      worstSeverity: "degraded",
    },
  ],
  tools: {},
};

const events = detectAlertEvents(
  [{ id: "github", name: "GitHub", state: "operational", adapter: "statuspage" }],
  [
    {
      id: "github",
      name: "GitHub",
      state: "degraded",
      description: "Partial outage",
      adapter: "statuspage",
    },
  ],
  beforeIncidents,
  afterIncidents,
  t0
);
assert.ok(events.some((e) => e.type === "incident_open"));

const notifyCfg = parseNotificationsConfig({
  version: 1,
  defaults: { events: ["incident_open"], minSeverity: "degraded" },
  tools: [
    {
      toolId: "github",
      slackWebhookSecret: "CHAT_WEBHOOK_PLATFORM",
    },
  ],
});
const policy = policyForTool(notifyCfg, "github");
assert.ok(
  eventAllowed(
    { type: "incident_open", toolId: "github", severity: "degraded" },
    policy
  )
);

const scoped = filterGcloudIncidentsByScope(
  [
    {
      external_desc: "Issues in europe-west2 for Cloud Run",
      updates: [],
    },
    {
      external_desc: "Unrelated product in us-central1",
      updates: [],
    },
  ],
  { products: ["Cloud Run"], regions: ["europe-west2"], behavior: "ignore_unscoped" }
);
assert.equal(scoped.incidents.length, 1);
assert.ok(matchProducts("cloud run errors", ["Cloud Run"]).length === 1);

const msg = composeChatMessage(
  {
    type: "incident_open",
    toolId: "salesforce",
    toolName: "Salesforce",
    pollTime: t0,
    fingerprint: "x",
    description: "API degradation",
    severity: "degraded",
  },
  {
    vendorSummary: "Salesforce: API degradation",
    correlated: true,
    metrics: [{ name: "api_errors", value: 45, window: "5m", region: "us-east" }],
    affectedFlows: ["Lead synchronization paused"],
    confidence: "medium",
    notes: [],
  },
  { dashboardUrl: "https://example.com/dashboard/" }
);
assert.match(msg, /Lead synchronization paused/);
assert.match(msg, /45 api_errors/);

const db = parseAlertsFile({ version: 1, sent: [] });
const fp = alertFingerprint("github", "incident_open", t0);
recordCooldownTest(db, fp, t0);

function recordCooldownTest(db, fingerprint, sentAt) {
  db.sent.push({
    fingerprint,
    sentAt,
    toolId: "github",
    eventType: "incident_open",
  });
}
assert.ok(
  isInCooldown(db, fp, 60, Date.parse("2026-11-01T10:30:00Z"))
);

console.log("alert-events tests passed");
