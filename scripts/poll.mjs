import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pollTool } from "./adapters/index.mjs";
import {
  applyPollToIncidents,
  metricsForTool,
  parseIncidentsFile,
} from "./lib/incidents.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOOLS_PATH = path.join(ROOT, "config", "tools.json");
const STATUS_PATH = path.join(ROOT, "data", "status.json");
const INCIDENTS_PATH = path.join(ROOT, "data", "incidents.json");

/**
 * @param {object} payload
 */
function stableStringify(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Compare tool snapshots ignoring poll timestamps.
 * @param {object[]} a
 * @param {object[]} b
 */
function toolsSemanticallyEqual(a, b) {
  const strip = (tools) =>
    tools.map(
      ({
        id,
        name,
        state,
        description,
        error,
        daysSinceLastIncident,
        incidentOngoing,
        trackingSince,
      }) => ({
        id,
        name,
        state,
        description,
        error,
        daysSinceLastIncident,
        incidentOngoing,
        trackingSince,
      })
    );
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/**
 * @param {object[]} results
 * @param {ReturnType<typeof parseIncidentsFile>} incidentsDb
 * @param {string} generatedAt
 */
function attachIncidentMetrics(results, incidentsDb, generatedAt) {
  return results.map((tool) => {
    const metrics = metricsForTool(incidentsDb, tool.id, generatedAt);
    return { ...tool, ...metrics };
  });
}

/**
 * @param {ReturnType<typeof parseIncidentsFile>} db
 */
function incidentsSemanticallyEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const configRaw = await readFile(TOOLS_PATH, "utf8");
  const config = JSON.parse(configRaw);
  const tools = (Array.isArray(config.tools) ? config.tools : []).filter(
    (t) => t.enabled
  );

  const results = [];
  for (const tool of tools) {
    results.push(await pollTool(tool));
  }

  results.sort((a, b) => a.id.localeCompare(b.id));

  const generatedAt = new Date().toISOString();

  let incidentsDb = parseIncidentsFile(null);
  try {
    const incRaw = await readFile(INCIDENTS_PATH, "utf8");
    incidentsDb = parseIncidentsFile(JSON.parse(incRaw));
  } catch {
    /* first run */
  }

  const incidentsChanged = applyPollToIncidents(
    incidentsDb,
    results.map((r) => ({ id: r.id, state: r.state })),
    generatedAt
  );

  const resultsWithMetrics = attachIncidentMetrics(
    results,
    incidentsDb,
    generatedAt
  );

  const next = {
    generatedAt,
    tools: resultsWithMetrics,
  };

  let previousTools = [];
  try {
    const prevRaw = await readFile(STATUS_PATH, "utf8");
    const prev = JSON.parse(prevRaw);
    if (Array.isArray(prev.tools)) previousTools = prev.tools;
  } catch {
    /* first run */
  }

  const statusChanged = !toolsSemanticallyEqual(previousTools, resultsWithMetrics);

  if (statusChanged) {
    await writeFile(STATUS_PATH, stableStringify(next), "utf8");
    console.log(
      `Wrote ${path.relative(ROOT, STATUS_PATH)} (${results.length} tools)`
    );
  } else {
    console.log("No semantic change; leaving status.json unchanged");
  }

  let previousIncidents = parseIncidentsFile(null);
  try {
    const prevRaw = await readFile(INCIDENTS_PATH, "utf8");
    previousIncidents = parseIncidentsFile(JSON.parse(prevRaw));
  } catch {
    /* first run */
  }

  const incidentsFileChanged =
    incidentsChanged ||
    !incidentsSemanticallyEqual(previousIncidents, incidentsDb);

  if (incidentsFileChanged) {
    await writeFile(INCIDENTS_PATH, stableStringify(incidentsDb), "utf8");
    console.log(`Wrote ${path.relative(ROOT, INCIDENTS_PATH)}`);
  }

  const changed = statusChanged || incidentsFileChanged;

  for (const t of resultsWithMetrics) {
    const flag =
      t.state === "operational"
        ? "OK"
        : t.state === "unknown"
          ? "??"
          : t.state.toUpperCase();
    const days =
      t.incidentOngoing
        ? "incident ongoing"
        : t.daysSinceLastIncident == null
          ? "tracking"
          : `${t.daysSinceLastIncident}d since incident`;
    console.log(
      `  [${flag}] ${t.name}: ${t.description} (${days})${t.error ? ` — ${t.error}` : ""}`
    );
  }

  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${changed ? "true" : "false"}\n`,
      "utf8"
    );
  }

  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
