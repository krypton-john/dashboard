import assert from "node:assert/strict";
import { resolveStatusPageUrl } from "./lib/status-page-url.mjs";

assert.equal(
  resolveStatusPageUrl({
    adapter: "statuspage",
    url: "https://status.bazaarvoice.com/api/v2/summary.json",
  }),
  "https://status.bazaarvoice.com"
);

assert.equal(
  resolveStatusPageUrl({ adapter: "gcloud", url: "https://status.cloud.google.com/incidents.json" }),
  "https://status.cloud.google.com/"
);

assert.equal(
  resolveStatusPageUrl({ customAdapter: "salesforce", url: "https://api.status.salesforce.com/v1" }),
  "https://status.salesforce.com/"
);

assert.equal(
  resolveStatusPageUrl({
    customAdapter: "ariba-portal",
    url: "https://s1.ariba.com/gb/?realm=x",
  }),
  null
);

assert.equal(
  resolveStatusPageUrl({
    statusPageUrl: "https://example.com/custom-status",
    adapter: "statuspage",
    url: "https://ignored/api/v2/summary.json",
  }),
  "https://example.com/custom-status"
);

console.log("status-page-url tests passed");
