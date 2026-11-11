/**
 * @param {import('../lib/alert-events.mjs').AlertEvent} event
 * @param {object} investigation
 * @param {{ dashboardUrl?: string | null; vendorUrl?: string | null }} links
 */
export function composeChatMessage(event, investigation, links) {
  const headline = eventHeadline(event);
  const lines = [headline, ""];

  lines.push(`Vendor: ${investigation.vendorSummary ?? event.description ?? "—"}`);

  if (investigation.correlated && investigation.metrics?.length > 0) {
    const m = investigation.metrics[0];
    lines.push(
      `Verified: ${m.value} ${m.name} in ${m.window}${m.region ? ` (${m.region})` : ""}.`
    );
  } else {
    lines.push(
      "Internal verification unavailable or not correlated (stub phase)."
    );
  }

  if (investigation.affectedFlows?.length > 0) {
    lines.push(`Impact: ${investigation.affectedFlows.join("; ")}.`);
  } else if (event.type === "incident_resolved") {
    lines.push("Impact: Monitoring returned to normal.");
  } else {
    lines.push(`Impact: See vendor status — ${event.description ?? "details pending"}.`);
  }

  if (event.scopeMatch?.matchedProducts?.length) {
    lines.push(
      `Scope: ${event.scopeMatch.matchedProducts.join(", ")}${event.scopeMatch.matchedRegions?.length ? ` · ${event.scopeMatch.matchedRegions.join(", ")}` : ""}`
    );
  }

  const footer = [];
  if (links.dashboardUrl) footer.push(`Dashboard: ${links.dashboardUrl}`);
  if (links.vendorUrl) footer.push(`Status: ${links.vendorUrl}`);
  if (footer.length) {
    lines.push("");
    lines.push(footer.join(" · "));
  }

  return lines.join("\n");
}

/**
 * @param {import('../lib/alert-events.mjs').AlertEvent} event
 */
function eventHeadline(event) {
  const name = event.toolName ?? event.toolId;
  switch (event.type) {
    case "incident_open":
      return `🔴 *${name}* — confirmed incident (${event.severity ?? "degraded"})`;
    case "severity_escalation":
      return `🔴 *${name}* — escalated to major`;
    case "incident_resolved":
      return `✅ *${name}* — incident resolved`;
    case "future_maintenance":
      return `🟠 *${name}* — scheduled maintenance upcoming`;
    case "http_ping_fail":
      return `🔴 *${name}* — health check failed`;
    case "poll_unknown":
      return `⚠️ *${name}* — could not reach status source`;
    default:
      return `⚠️ *${name}* — ${event.state ?? "status change"}`;
  }
}
