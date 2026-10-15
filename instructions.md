# Adding and removing dashboard cards

Each **card** on the EMEA status dashboard is one **tool** in `config/tools.json`. The poller fetches enabled tools; the static site reads `data/status.json` and `data/incidents.json`.

---

## Before you start

- Tool `id` must be unique, lowercase, hyphenated (e.g. `google-cloud`).
- Validate JSON against `config/tools.schema.json` if your editor supports JSON Schema.
- After changes on `main`, **Poll status** (GitHub Actions) updates the data files and **Deploy GitHub Pages** refreshes the site.

---

## Add a new card

### 1. Find how to poll the vendor

| If the vendor… | Use adapter | Typical `url` |
|----------------|-------------|----------------|
| Uses Atlassian Statuspage | `statuspage` | `https://…/api/v2/summary.json` |
| Is Google Cloud | `gcloud` | `https://status.cloud.google.com/incidents.json` |
| Has no status API (reachability only) | `http-ping` | Site or health-check URL |
| Needs custom logic (PayPal, Salesforce) | `custom` | See `README.md` and `scripts/adapters/` |

Confirm the URL in a browser or with `curl` before you commit.

### 2. Add an entry to `config/tools.json`

Insert a new object in the `tools` array **where you want the card to appear** (order in this file is the poller order).

**Statuspage example:**

```json
{
  "id": "datadog",
  "name": "Datadog",
  "adapter": "statuspage",
  "url": "https://status.datadoghq.com/api/v2/summary.json",
  "enabled": true
}
```

**HTTP ping example** (optional `options`):

```json
{
  "id": "my-portal",
  "name": "My Portal",
  "adapter": "http-ping",
  "url": "https://portal.example.com/",
  "enabled": true,
  "options": {
    "maxLatencyMs": 5000,
    "acceptableStatuses": [200]
  }
}
```

**Custom adapter example** (must match an implementation in `scripts/adapters/custom.mjs`):

```json
{
  "id": "salesforce",
  "name": "Salesforce",
  "adapter": "custom",
  "customAdapter": "salesforce",
  "url": "https://api.status.salesforce.com/v1",
  "enabled": true
}
```

Set `enabled: false` while you are testing, then flip to `true` when ready.

### 3. Update card order in the UI

Edit `public/js/dashboard.js` and add the same `id` to the `CARD_ORDER` array in the position you want:

```javascript
const CARD_ORDER = [
  "shopify",
  // …
  "datadog", // new
  "paypal",
];
```

Keep this list aligned with `config/tools.json` so cards always appear in the intended order.

### 4. Test locally

```bash
node scripts/poll.mjs
node scripts/test-adapters.mjs
node scripts/test-incidents.mjs
```

Check `data/status.json` includes your tool with a sensible `state` and `description`.

Preview the site:

```bash
mkdir -p _site && cp -r public/. _site/ && cp -r data _site/data
python3 -m http.server 8080 --directory _site
```

Open http://localhost:8080 and confirm the new card appears.

### 5. Deploy

1. Commit and push to `main` (or merge your PR).
2. In GitHub: **Actions → Poll status → Run workflow** (or wait for the schedule).
3. Confirm **Deploy GitHub Pages** succeeds and the live dashboard shows the new card.

### 6. New custom vendor (only if needed)

If `statuspage`, `gcloud`, and `http-ping` are not enough:

1. Add a fetcher under `scripts/adapters/` (or extend `custom.mjs`).
2. Wire it in `scripts/adapters/index.mjs` (or `custom.mjs` + new `customAdapter` value).
3. Add the new `customAdapter` value to `config/tools.schema.json`.
4. Add tests in `scripts/test-adapters.mjs` or a dedicated test file.

---

## Remove a card

### Option A — Stop monitoring but keep config (recommended for temporary removal)

In `config/tools.json`, set `"enabled": false` on the tool.

The poller skips it; it disappears from the dashboard on the next data update. History remains in `data/incidents.json`.

### Option B — Remove completely

1. **Delete** the tool object from `config/tools.json` (or remove it from the `tools` array).
2. **Remove** its `id` from `CARD_ORDER` in `public/js/dashboard.js`.
3. Commit, push, and run **Poll status** so `data/status.json` no longer lists that tool.

Old incidents for that `toolId` stay in `data/incidents.json`; they do not affect other cards. You can leave them for history or edit the file manually if you want a clean slate (not required).

### After removal

- Merge/push to `main`.
- Run **Poll status** once so committed JSON matches production.
- Verify the card is gone on the GitHub Pages URL.

---

## Quick checklist

| Step | Add | Remove |
|------|-----|--------|
| `config/tools.json` | New entry, `enabled: true` | Delete entry or `enabled: false` |
| `public/js/dashboard.js` `CARD_ORDER` | Add `id` | Remove `id` |
| Custom adapter code | Only if needed | Remove only if deleting bespoke integration |
| `node scripts/poll.mjs` | Test locally | Test locally |
| GitHub Actions | Poll + Pages on `main` | Poll + Pages on `main` |

For architecture and adapters overview, see [README.md](./README.md) and [Plan.md](./Plan.md).
