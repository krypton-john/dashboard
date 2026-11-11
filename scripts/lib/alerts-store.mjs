/**
 * @typedef {object} SentRecord
 * @property {string} fingerprint
 * @property {string} sentAt
 * @property {string} toolId
 * @property {string} eventType
 */

/**
 * @typedef {object} AlertsFile
 * @property {number} version
 * @property {SentRecord[]} sent
 */

const MAX_ENTRIES = 500;

/**
 * @returns {AlertsFile}
 */
export function emptyAlertsFile() {
  return { version: 1, sent: [] };
}

/**
 * @param {unknown} raw
 * @returns {AlertsFile}
 */
export function parseAlertsFile(raw) {
  if (!raw || typeof raw !== "object") return emptyAlertsFile();
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    version: typeof o.version === "number" ? o.version : 1,
    sent: Array.isArray(o.sent) ? /** @type {SentRecord[]} */ (o.sent) : [],
  };
}

/**
 * @param {string} toolId
 * @param {string} eventType
 * @param {string} fingerprint
 */
export function alertFingerprint(toolId, eventType, fingerprint) {
  return `${toolId}|${eventType}|${fingerprint}`;
}

/**
 * @param {AlertsFile} db
 * @param {string} fullFingerprint
 * @param {number} cooldownMinutes
 * @param {number} [nowMs]
 */
export function isInCooldown(db, fullFingerprint, cooldownMinutes, nowMs = Date.now()) {
  if (cooldownMinutes <= 0) return false;
  const windowMs = cooldownMinutes * 60 * 1000;
  for (const row of db.sent) {
    if (row.fingerprint !== fullFingerprint) continue;
    const t = Date.parse(row.sentAt);
    if (Number.isNaN(t)) continue;
    if (nowMs - t < windowMs) return true;
  }
  return false;
}

/**
 * @param {AlertsFile} db
 * @param {SentRecord} record
 */
export function recordSent(db, record) {
  db.sent.push(record);
  if (db.sent.length > MAX_ENTRIES) {
    db.sent = db.sent.slice(-MAX_ENTRIES);
  }
}
