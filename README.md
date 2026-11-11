# SaaS Status Dashboard

Internal traffic-light dashboard for vendor status pages, hosted on **GitHub Pages** with data refreshed by a **scheduled GitHub Action** (see [Plan.md](./Plan.md)).

## Repository layout

| Path | Purpose |
|------|---------|
| `config/tools.json` | Tools to poll; edit this to add or remove vendors |
| `config/tools.schema.json` | JSON Schema for `tools.json` |
| `data/status.json` | Latest normalized status (written by the poller) |
| `data/incidents.json` | Incident history and per-tool tracking metadata |
| `public/` | Static dashboard (HTML, CSS, JS) |
| `scripts/poll.mjs` | Fetches enabled tools and updates `data/status.json` |
| `scripts/adapters/` | Vendor-specific fetchers and normalizers |
| `.github/workflows/pages.yml` | Builds and deploys `public/` + `data/` to Pages |
| `.github/workflows/poll-status.yml` | Scheduled status poll; commits when data changes |

## Local preview

Serve the same layout the Action publishes:

```bash
mkdir -p _site && cp -r public/. _site/ && cp -r data _site/data
python3 -m http.server 8080 --directory _site
```

Open [http://localhost:8080](http://localhost:8080).

## Run the poller locally

Requires Node 18+ (for `fetch`):

```bash
node scripts/poll.mjs
node scripts/test-adapters.mjs
node scripts/test-incidents.mjs
node scripts/test-paypal-atom.mjs
```

The script writes `data/status.json` on every poll (`lastPolledAt`). `generatedAt` changes only when tool state, description, or errors change. The dashboard shows **Last polled** from `lastPolledAt`.

## GitHub Pages setup

1. Push this repo to GitHub on the `main` branch.
2. In the repo **Settings → Pages**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
3. Push to `main` (or run **Deploy GitHub Pages** manually). The workflow copies `public/` and `data/` into the site artifact.

`public/.nojekyll` is included so GitHub does not run Jekyll over the static site.

## Adding a tool

1. Add an entry to `config/tools.json` (must match `config/tools.schema.json`).
2. Pick an **adapter** (see table below).
3. Set `enabled: true` when ready.

| Adapter | Use when | `url` should be |
|--------|-----------|------------------|
| `statuspage` | Vendor uses Atlassian Statuspage (`*/api/v2/summary.json`) | Summary JSON URL |
| `gcloud` | Google Cloud | `https://status.cloud.google.com/incidents.json` |
| `http-ping` | No status API; you only need reachability/latency | Homepage or health URL |
| `custom` | Bespoke feed (see `customAdapter`) | Feed or API URL |

### `http-ping` options

```json
{
  "id": "my-app",
  "name": "My App",
  "adapter": "http-ping",
  "url": "https://app.example.com/health",
  "enabled": true,
  "options": {
    "maxLatencyMs": 5000,
    "acceptableStatuses": [200]
  }
}
```

### PayPal (`custom` + `paypal-atom`)

PayPal does not expose a public Statuspage JSON API. The poller reads their **Atom feed**. **Planned maintenance** (including rescheduled windows) is ignored until the parsed impact window includes the current time; live “Initial Notification” / “Update” entries for real outages still alert.

### Salesforce (`custom` + `salesforce`)

Uses the [Salesforce Trust API](https://api.status.salesforce.com/v1): active incidents plus any **maintenance whose planned window includes now** (degraded). Set `url` to `https://api.status.salesforce.com/v1`.

Enable **Actions** on the repo so **Poll status** can run on schedule (or trigger it manually under Actions). Each successful poll that updates data also **deploys GitHub Pages** (poll commits do not trigger the separate Pages workflow).


### Scheduled Actions note

GitHub disables scheduled workflows after **60 days of repository inactivity**. Merging PRs or running **Poll status** manually counts as activity; keep the repo active or re-enable workflows if polling stops.

### Slack alerts (agentic notify pipeline)

After each poll, the notify pipeline can detect transitions (confirmed incidents, escalations, resolutions, etc.), run **investigators** (stub by default), compose a rich message, and post to **Slack** channels configured in `config/notifications.json`.

1. In Slack: **Apps → Incoming Webhooks** (or add one to each channel) and copy the `https://hooks.slack.com/...` URL.
2. Add repository **secrets** whose names match `slackWebhookSecret` in config (e.g. `CHAT_WEBHOOK_SALESFORCE` — the name is arbitrary; the value must be the Slack URL).
3. Set repository variable **`ALERTS_ENABLED`** to `true` (or `ALERTS_DRY_RUN=true` to log messages without sending).
4. Tune per-tool routes in `config/notifications.json` and investigators in `config/investigators.json`.

**GCP scoping:** On the `google-cloud` tool, optional `alerting.scope.products` / `regions` filter which open vendor incidents affect the dashboard and alerts (see `config/tools.json`).

**Manual test:** Run **Poll status** with the workflow input *Post a fake Salesforce test alert to Slack*, or `ALERTS_ENABLED=true node scripts/notify.mjs` locally with the secret exported.

Dry-run locally:

```bash
ALERTS_DRY_RUN=true node scripts/notify.mjs
```

## Build phases

- **Phase 1:** layout, tool config schema, hello-world Pages site  
- **Phase 2:** fetch script + cron Action  
- **Phase 3:** incident tracking (two-poll confirmation, `incidents.json`)  
- **Phase 4:** dashboard UI (cards, stale warning, auto-refresh)  
- **Phase 5 (current):** Shopify, VTEX, PayPal, `http-ping`, docs and tests  

Details: [Plan.md](./Plan.md).
