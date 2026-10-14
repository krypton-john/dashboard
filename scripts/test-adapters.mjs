import assert from "node:assert/strict";
import { parseGcloudIncidents } from "./adapters/gcloud.mjs";
import {
  parseAtomEntries,
  parsePaypalAtomFeed,
} from "./adapters/paypal-atom.mjs";
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

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Resolved: test</title><updated>2026-10-14T12:00:00Z</updated></entry>
<entry><title>Initial Notification: API errors</title><updated>2026-10-14T12:00:00Z</updated></entry>
</feed>`;
const entries = parseAtomEntries(atom);
assert.equal(entries.length, 2);
assert.equal(
  parsePaypalAtomFeed(entries, Date.parse("2026-10-14T13:00:00Z")).state,
  "degraded"
);

console.log("adapter tests passed");
