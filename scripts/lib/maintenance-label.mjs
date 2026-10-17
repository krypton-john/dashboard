/**
 * Human-readable maintenance start for status.json (stable across browsers).
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function formatMaintenanceStartsAtLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const formatted = d.toLocaleString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${formatted} UTC`;
}
