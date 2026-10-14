import assert from "node:assert/strict";
import {
  applyPollToIncidents,
  emptyIncidentsFile,
  metricsForTool,
} from "./lib/incidents.mjs";

const t0 = "2026-10-01T10:00:00.000Z";
const t1 = "2026-10-01T10:10:00.000Z";
const t2 = "2026-10-01T10:20:00.000Z";
const t3 = "2026-10-03T10:00:00.000Z";

const db = emptyIncidentsFile();

applyPollToIncidents(db, [{ id: "github", state: "degraded" }], t0);
assert.equal(db.incidents.length, 0, "one blip does not open incident");

applyPollToIncidents(db, [{ id: "github", state: "degraded" }], t1);
assert.equal(db.incidents.length, 1);
assert.equal(db.incidents[0].start, t0);
assert.equal(db.incidents[0].end, null);

let m = metricsForTool(db, "github", t1);
assert.equal(m.incidentOngoing, true);
assert.equal(m.daysSinceLastIncident, 0);

applyPollToIncidents(db, [{ id: "github", state: "operational" }], t2);
assert.equal(db.incidents[0].end, t2);

m = metricsForTool(db, "github", t3);
assert.equal(m.incidentOngoing, false);
assert.equal(m.daysSinceLastIncident, 1);

m = metricsForTool(emptyIncidentsFile(), "new-tool", t0);
assert.equal(m.daysSinceLastIncident, null);

console.log("incident tests passed");
