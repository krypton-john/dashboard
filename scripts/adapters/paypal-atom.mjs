/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAINTENANCE_RE = /maintenance|rescheduled/i;
const RESOLVED_RE = /^resolved:/i;

/**
 * @param {string} xml
 * @returns {{ title: string; updated: string }[]}
 */
export function parseAtomEntries(xml) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const updatedMatch = block.match(/<updated>([^<]+)<\/updated>/i);
    if (!titleMatch || !updatedMatch) continue;
    entries.push({
      title: titleMatch[1].trim(),
      updated: updatedMatch[1].trim(),
    });
  }
  return entries;
}

/**
 * @param {string} title
 */
function severityFromTitle(title) {
  if (/major outage|service disruption|checkout errors|declines/i.test(title)) {
    return "major";
  }
  return "degraded";
}

/**
 * @param {{ title: string; updated: string }[]} entries
 * @param {number} [nowMs]
 */
export function parsePaypalAtomFeed(entries, nowMs = Date.now()) {
  const active = [];

  for (const entry of entries) {
    const updatedMs = Date.parse(entry.updated);
    if (Number.isNaN(updatedMs) || nowMs - updatedMs > ACTIVE_WINDOW_MS) continue;

    const title = entry.title.replace(/\s+/g, " ").trim();
    if (RESOLVED_RE.test(title)) continue;
    if (MAINTENANCE_RE.test(title)) continue;

    if (/initial notification|update:/i.test(title)) {
      active.push({ title, severity: severityFromTitle(title) });
    }
  }

  if (active.length === 0) {
    return { state: "operational", description: "No active incidents in feed" };
  }

  const hasMajor = active.some((a) => a.severity === "major");
  const state = /** @type {ToolState} */ (hasMajor ? "major" : "degraded");
  const description = active[0].title.slice(0, 160);

  return { state, description };
}

/**
 * @param {string} feedUrl
 * @param {AbortSignal} signal
 */
export async function fetchPaypalAtom(feedUrl, signal) {
  const res = await fetch(feedUrl, {
    signal,
    headers: {
      Accept: "application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "saas-status-dashboard/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const entries = parseAtomEntries(xml);
  return parsePaypalAtomFeed(entries);
}
