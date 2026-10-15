/** @typedef {import('../lib/states.mjs').ToolState} ToolState */

const FEED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RESOLVED_RE = /^resolved:/i;
const PLANNED_RE =
  /maintenance|rescheduled|scheduled|routine maintenance|live site maintenance|impact window|planned/i;
const INCIDENT_TITLE_RE = /initial notification|update:/i;
const ONGOING_INCIDENT_RE =
  /currently experiencing|working on resolving|checkout errors|declines|service interruption|partial outage|major outage/i;

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

/**
 * @typedef {{ title: string; updated: string; content: string }} AtomEntry
 */

/**
 * @param {string} xml
 * @returns {AtomEntry[]}
 */
export function parseAtomEntries(xml) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(
      /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i
    );
    const updatedMatch = block.match(/<updated>([^<]+)<\/updated>/i);
    const contentMatch = block.match(
      /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i
    );
    if (!titleMatch || !updatedMatch) continue;
    entries.push({
      title: titleMatch[1].trim(),
      updated: updatedMatch[1].trim(),
      content: contentMatch ? contentMatch[1].trim() : "",
    });
  }
  return entries;
}

/**
 * @param {string} html
 */
export function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} title
 * @param {string} content
 */
export function isPlannedMaintenance(title, content) {
  const text = `${title} ${stripHtml(content)}`;
  if (PLANNED_RE.test(text)) return true;
  if (/^initial notification:/i.test(title) && /maintenance|hyperwallet/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * @param {string} text
 * @param {number} referenceYear
 * @returns {number | null}
 */
function parseMonthDayFragment(fragment, referenceYear) {
  const dayMonth = new RegExp(
    `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})(?:\\s+(\\d{4}))?`,
    "i"
  );
  const monthDay = new RegExp(
    `(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
    "i"
  );

  let m = dayMonth.exec(fragment);
  if (m) {
    const year = m[3] ? Number(m[3]) : referenceYear;
    const iso = `${m[2]} ${m[1]}, ${year}`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  }

  m = monthDay.exec(fragment);
  if (m) {
    const year = m[3] ? Number(m[3]) : referenceYear;
    const iso = `${m[1]} ${m[2]}, ${year}`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

/**
 * @param {string} text
 * @param {string} updatedIso
 * @returns {{ start: number; end: number } | null}
 */
export function parseImpactWindow(text, updatedIso) {
  const referenceYear = new Date(updatedIso).getUTCFullYear();

  const isoMatches = [...text.matchAll(/\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?/gi)].map(
    (m) => Date.parse(m[0])
  ).filter((ms) => !Number.isNaN(ms));

  if (isoMatches.length >= 2) {
    const sorted = [...isoMatches].sort((a, b) => a - b);
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }

  const dates = [];
  const dayMonthGlobal = new RegExp(
    `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})(?:\\s+(\\d{4}))?|(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
    "gi"
  );
  let match;
  while ((match = dayMonthGlobal.exec(text)) !== null) {
    const parsed = parseMonthDayFragment(match[0], referenceYear);
    if (parsed != null) dates.push(parsed);
  }

  if (dates.length >= 2) {
    const sorted = [...dates].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1] + 24 * 60 * 60 * 1000;
    return { start, end };
  }

  if (dates.length === 1) {
    const start = dates[0];
    return { start, end: start + 24 * 60 * 60 * 1000 };
  }

  return null;
}

/**
 * @param {AtomEntry} entry
 * @param {number} nowMs
 */
export function isPlannedEntryActiveNow(entry, nowMs) {
  const text = stripHtml(entry.content);
  const window = parseImpactWindow(`${entry.title} ${text}`, entry.updated);
  if (!window) return false;
  return nowMs >= window.start && nowMs <= window.end;
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
 * @param {AtomEntry} entry
 * @param {number} nowMs
 * @returns {{ title: string; severity: IncidentSeverity } | null}
 */
function evaluateEntry(entry, nowMs) {
  const title = entry.title.replace(/\s+/g, " ").trim();
  const body = stripHtml(entry.content);
  const text = `${title} ${body}`;

  if (RESOLVED_RE.test(title)) return null;

  if (isPlannedMaintenance(title, entry.content)) {
    if (isPlannedEntryActiveNow(entry, nowMs)) {
      return { title, severity: "degraded" };
    }
    return null;
  }

  if (!INCIDENT_TITLE_RE.test(title)) return null;

  if (ONGOING_INCIDENT_RE.test(text) && !PLANNED_RE.test(text)) {
    return { title, severity: severityFromTitle(title) };
  }

  if (PLANNED_RE.test(text)) return null;

  if (/initial notification/i.test(title)) {
    return { title, severity: severityFromTitle(title) };
  }

  if (/^update:/i.test(title)) {
    return { title, severity: severityFromTitle(title) };
  }

  return null;
}

/** @typedef {'degraded' | 'major'} IncidentSeverity */

/**
 * @param {AtomEntry[]} entries
 * @param {number} [nowMs]
 */
export function parsePaypalAtomFeed(entries, nowMs = Date.now()) {
  const active = [];

  for (const entry of entries) {
    const updatedMs = Date.parse(entry.updated);
    if (Number.isNaN(updatedMs)) continue;

    const planned = isPlannedMaintenance(entry.title, entry.content);
    const stale = nowMs - updatedMs > FEED_LOOKBACK_MS;
    const inPlannedWindow = planned && isPlannedEntryActiveNow(entry, nowMs);
    if (stale && !inPlannedWindow) continue;

    const result = evaluateEntry(entry, nowMs);
    if (result) active.push(result);
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
