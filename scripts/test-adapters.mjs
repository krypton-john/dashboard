import assert from "node:assert/strict";
import { parseAdobeAemStatus } from "./adapters/adobe-aem.mjs";
import { parseBetterstackIndex } from "./adapters/betterstack.mjs";
import { parseGcloudIncidents } from "./adapters/gcloud.mjs";
import { parseZendeskStatus } from "./adapters/zendesk.mjs";
import {
  parseAtomEntries,
  parsePaypalAtomFeed,
} from "./adapters/paypal-atom.mjs";
import { parseSalesforceStatus } from "./adapters/salesforce.mjs";
import { parseStatuspageSummary } from "./adapters/statuspage.mjs";
import { formatMaintenanceStartsAtLabel } from "./lib/maintenance-label.mjs";
import { parseMaintenanceStartFromUpdateBody } from "./lib/statuspage-maintenance.mjs";

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

const statuspageFutureMaintenance = {
  status: { indicator: "none", description: "All Systems Operational" },
  incidents: [],
  scheduled_maintenances: [
    {
      name: "Platform maintenance",
      status: "scheduled",
      impact: "maintenance",
      scheduled_for: null,
      scheduled_until: null,
    },
  ],
};
const vtexLike = parseStatuspageSummary({
  status: { indicator: "none", description: "All Systems Operational" },
  incidents: [],
  scheduled_maintenances: [
    {
      name: "Pricing database maintenance",
      status: "scheduled",
      impact: "maintenance",
      scheduled_for: null,
      scheduled_until: null,
      incident_updates: [
        {
          body:
            "**Scheduled for Oct 27, 2026 at 01:00 UTC - 04:00 UTC**\n\nPlatform work.",
        },
      ],
    },
  ],
});
assert.equal(vtexLike.state, "future-maintenance");
assert.ok(vtexLike.maintenanceStartsAt?.startsWith("2026-10-27"));

assert.equal(
  parseStatuspageSummary(statuspageFutureMaintenance).state,
  "future-maintenance"
);

assert.equal(
  parseMaintenanceStartFromUpdateBody(
    "**Scheduled for Oct 27, 2026 at 01:00 UTC - 04:00 UTC**"
  )?.slice(0, 10),
  "2026-10-27"
);

assert.match(
  formatMaintenanceStartsAtLabel("2026-10-27T01:00:00.000Z") ?? "",
  /27 Oct 2026.*01:00 UTC/
);

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

const maintenanceAtom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Rescheduled: PayPal Live Site Maintenance</title><updated>2026-10-14T12:00:00Z</updated>
<content>Impact Window: Thursday October 30th at 8:00 am to 8:30 am GMT.</content></entry>
</feed>`;
assert.equal(
  parsePaypalAtomFeed(parseAtomEntries(maintenanceAtom), Date.parse("2026-10-14T13:00:00Z")).state,
  "future-maintenance"
);

const sf = parseSalesforceStatus(
  [{ type: "Degradation", additionalInformation: "Stale analytics", IncidentImpacts: [{ severity: "minor" }] }],
  [],
  Date.parse("2026-10-14T13:00:00Z")
);
assert.equal(sf.state, "degraded");

const zendeskMaint = parseZendeskStatus(
  [],
  [
    {
      attributes: {
        title: "Pod maintenance",
        maintenance_start_time: "2026-10-05T00:00:00.000Z",
        maintenance_end_time: "2026-10-20T00:00:00.000Z",
        degradation: true,
        outage: false,
      },
    },
  ],
  Date.parse("2026-10-17T12:00:00Z")
);
assert.equal(zendeskMaint.state, "degraded");

const zendeskFuture = parseZendeskStatus(
  [],
  [
    {
      attributes: {
        title: "Future window",
        maintenance_start_time: "2026-11-01T00:00:00.000Z",
        maintenance_end_time: "2026-11-02T00:00:00.000Z",
        degradation: true,
        outage: false,
      },
    },
  ],
  Date.parse("2026-10-17T12:00:00Z")
);
assert.equal(zendeskFuture.state, "future-maintenance");
assert.ok(zendeskFuture.maintenanceStartsAt);

assert.equal(
  parseAdobeAemStatus({ incidentEvent: { incidents: {}, messages: {} } }).state,
  "operational"
);

assert.equal(
  parseBetterstackIndex({
    data: { attributes: { aggregate_state: "operational" } },
    included: [],
  }).state,
  "operational"
);

console.log("adapter tests passed");
