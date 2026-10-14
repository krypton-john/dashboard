# SaaS Status Dashboard

Internal traffic-light dashboard for vendor status pages, hosted on **GitHub Pages** with data refreshed by a **scheduled GitHub Action** (see [Plan.md](./Plan.md)).

## Repository layout

| Path | Purpose |
|------|---------|
| `config/tools.json` | Tools to poll; edit this to add or remove vendors |
| `config/tools.schema.json` | JSON Schema for `tools.json` |
| `data/status.json` | Latest normalized status (written by the poller) |
| `data/incidents.json` | Incident history for “days since last incident” |
| `public/` | Static dashboard (HTML, CSS, JS) |
| `.github/workflows/pages.yml` | Builds and deploys `public/` + `data/` to Pages |

## Local preview

Serve the same layout the Action publishes:

```bash
mkdir -p _site && cp -r public/. _site/ && cp -r data _site/data
python3 -m http.server 8080 --directory _site
```

Open [http://localhost:8080](http://localhost:8080).

## GitHub Pages setup

1. Push this repo to GitHub on the `main` branch.
2. In the repo **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run **Deploy GitHub Pages** manually). The workflow copies `public/` and `data/` into the site artifact.

## Adding a tool

1. Add an entry to `config/tools.json` (must match `config/tools.schema.json`).
2. Set `adapter` to `statuspage`, `gcloud`, `http-ping`, or `custom`.
3. Enable the tool once the poller supports that adapter (phase 2+).

## Build phases

- **Phase 1 (current):** layout, tool config schema, hello-world Pages site  
- **Phase 2:** fetch script + cron Action  
- **Phase 3:** incident tracking  
- **Phase 4:** full dashboard UI  
- **Phase 5+:** remaining vendors and hardening  

Details: [Plan.md](./Plan.md).
