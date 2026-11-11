/**
 * @param {string} webhookUrl
 * @param {string} text
 */
export async function sendSlackWebhook(webhookUrl, text) {
  if (!webhookUrl || !webhookUrl.startsWith("https://")) {
    throw new Error("Invalid Slack webhook URL");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Resolve webhook URL from env using secret name from notifications config.
 * @param {string} secretName e.g. CHAT_WEBHOOK_SALESFORCE or SLACK_WEBHOOK_SALESFORCE
 */
export function resolveWebhookFromEnv(secretName) {
  if (!secretName) return null;
  return process.env[secretName] ?? null;
}
