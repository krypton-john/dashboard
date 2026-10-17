import assert from "node:assert/strict";
import {
  isPlannedMaintenance,
  parseAtomEntries,
  parseImpactWindow,
  parsePaypalAtomFeed,
} from "./adapters/paypal-atom.mjs";

const hyperwalletFuture = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title type="html"><![CDATA[Rescheduled: Hyperwallet (PP-LIVE-110014)]]></title>
<updated>2026-10-15T16:18:14Z</updated>
<content type="html"><![CDATA[<p>changed to 11:00 PM Saturday, 24 October up to 5:00 AM PDT Sunday, 25 October</p>]]></content>
</entry>
</feed>`;

const nowBefore = Date.parse("2026-10-15T17:00:00Z");
const entries = parseAtomEntries(hyperwalletFuture);
assert.equal(
  parsePaypalAtomFeed(entries, nowBefore).state,
  "future-maintenance",
  "future maintenance should show Future Maintenance state"
);

assert.ok(
  isPlannedMaintenance(
    "Initial Notification: Hyperwallet (PP-LIVE-110014)",
    "routine maintenance activity Impact Window: Saturday 24 October"
  )
);

const window = parseImpactWindow(
  "Saturday 24 October up to Sunday 25 October",
  "2026-10-15T16:18:14Z"
);
assert.ok(window);
const duringWindow = window.start + 2 * 60 * 60 * 1000;
assert.equal(
  parsePaypalAtomFeed(entries, duringWindow).state,
  "degraded",
  "in-window maintenance should alert"
);

const liveIncident = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Initial Notification: API errors</title><updated>2026-10-14T12:00:00Z</updated>
<content>We are currently experiencing checkout errors</content></entry>
</feed>`;
assert.equal(
  parsePaypalAtomFeed(parseAtomEntries(liveIncident), Date.parse("2026-10-14T13:00:00Z")).state,
  "degraded"
);

const singleDayMaintenance = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>Initial Notification: PayPal Live Site Maintenance (PP-LIVE-110012)</title>
<updated>2026-09-28T21:25:00Z</updated>
<content>On Thursday October 15th PayPal will performing routine maintenance activity.</content>
</entry>
</feed>`;
assert.equal(
  parsePaypalAtomFeed(
    parseAtomEntries(singleDayMaintenance),
    Date.parse("2026-10-15T18:00:00Z")
  ).state,
  "operational",
  "single maintenance day without a window should not alert"
);

console.log("paypal-atom tests passed");
