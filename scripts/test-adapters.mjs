import assert from "node:assert/strict";
import { parseGcloudIncidents } from "./adapters/gcloud.mjs";
import { parseStatuspageSummary } from "./adapters/statuspage.mjs";

const statuspageOperational = {
  status: { indicator: "none", description: "All Systems Operational" },
  incidents: [],
  scheduled_maintenances: [],
};

assert.equal(parseStatuspageSummary(statuspageOperational).state, "operational");

const statuspageMajor = {
  status: { indicator: "major", description: "Partial outage" },
  incidents: [{ status: "investigating", impact: "major" }],
  scheduled_maintenances: [],
};

assert.equal(parseStatuspageSummary(statuspageMajor).state, "major");

const gcloudClear = [{ end: "2026-01-01T00:00:00+00:00", updates: [] }];
assert.equal(parseGcloudIncidents(gcloudClear).state, "operational");

const gcloudOutage = [
  {
    end: null,
    external_desc: "GCS errors",
    updates: [{ when: "2026-01-01T00:00:00Z", status: "SERVICE_OUTAGE" }],
  },
];
assert.equal(parseGcloudIncidents(gcloudOutage).state, "major");

console.log("adapter tests passed");
