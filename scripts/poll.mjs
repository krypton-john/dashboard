import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pollTool } from "./adapters/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOOLS_PATH = path.join(ROOT, "config", "tools.json");
const STATUS_PATH = path.join(ROOT, "data", "status.json");

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
    tools.map(({ id, name, state, description, error }) => ({
      id,
      name,
      state,
      description,
      error,
    }));
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
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
  const next = {
    generatedAt,
    tools: results,
  };

  let previousTools = [];
  try {
    const prevRaw = await readFile(STATUS_PATH, "utf8");
    const prev = JSON.parse(prevRaw);
    if (Array.isArray(prev.tools)) previousTools = prev.tools;
  } catch {
    /* first run */
  }

  const changed = !toolsSemanticallyEqual(previousTools, results);
  if (changed) {
    await writeFile(STATUS_PATH, stableStringify(next), "utf8");
    console.log(`Wrote ${path.relative(ROOT, STATUS_PATH)} (${results.length} tools)`);
  } else {
    console.log("No semantic change; leaving status.json unchanged");
  }

  for (const t of results) {
    const flag =
      t.state === "operational"
        ? "OK"
        : t.state === "unknown"
          ? "??"
          : t.state.toUpperCase();
    console.log(`  [${flag}] ${t.name}: ${t.description}${t.error ? ` (${t.error})` : ""}`);
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
