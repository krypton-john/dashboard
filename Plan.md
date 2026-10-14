## **Plan: SaaS Status Dashboard**

### **Recommended architecture**

**Use a scheduled GitHub Action to poll the status sources, write the results to JSON files in the repo, and have the static dashboard read those files.**

* **No CORS problems.** Many status APIs block browser requests from other origins. A server-side poll in the Action avoids this.  
* **It makes “days since last incident” possible.** GitHub Pages has no database, and browser storage would be per-visitor. The Action can append to an incident log committed to the repo, which gives you a shared history that starts from day one.  
* **No backend or cost.** Everything stays inside GitHub (Actions \+ Pages).

The trade-off is that data is only as fresh as the schedule. GitHub cron runs every 5 minutes at best and is often delayed, so expect roughly 5 to 15 minute freshness. For an internal dashboard that is usually fine.

config/tools.json ──► GitHub Action (cron) ──► data/status.json  
                       runs fetch script       data/incidents.json  
                                                      │  
                                    GitHub Pages ◄────┘  
                                    static HTML/JS dashboard

### **Tool configuration**

Adding or removing a tool means editing one JSON file. Each entry looks roughly like this:

json  
{  
  "id": "github",  
  "name": "GitHub",  
  "adapter": "statuspage",  
  "url": "https\://www\.githubstatus.com/api/v2/summary.json",  
  "enabled": true  
}

The `adapter` field says how to read each source:

| Adapter | Used for | Notes |
| ----- | ----- | ----- |
| `statuspage` | GitHub, Cloudflare, and likely others | Atlassian Statuspage format, a very common standard |
| `gcloud` | Google Cloud | Google has its own incidents JSON feed |
| `http-ping` | Anything without a status API (likely Hawthorne Mckenzie Digital) | Checks a URL for response and latency |
| `custom` | Shopify, VTEX, PayPal if needed | Written per tool |

I haven’t verified the current API endpoints for Shopify, VTEX or PayPal. Some vendors have moved off Statuspage, so the first task for Cursor is to confirm each endpoint and what it returns. Where there’s no usable API, fall back to an RSS feed or a page check.

### **Traffic light logic**

Each adapter normalizes to one common shape, so the dashboard doesn’t care about the source:

* 🟢 **Operational**  
* 🟡 **Degraded or partial** (minor incident, maintenance, partial outage)  
* 🔴 **Major outage**  
* ⚪ **Unknown** (the source couldn’t be reached)

Keep the grey state. Otherwise a failure in your own polling will look like an outage or, worse, like “all green”.

### **Days since last incident**

Define “incident” as any transition from green to amber or red. The Action records it as `{toolId, start, end, worstSeverity}` in `incidents.json`.

* The counter is the days since the most recent incident ended, or 0 while one is ongoing.  
* Because history starts from now, each tool should show “Tracking since \[date\]” until it has been running a while. Otherwise a new tool reads as “0 incidents ever”, which is misleading.  
* Require two consecutive non-green polls before recording an incident, to avoid false alarms from a single blip.

### **Phased build**

1. **Foundation:** repo setup, `tools.json` schema, Pages deployment of a hello-world page.  
2. **Data layer:** fetch script (Node or Python), the `statuspage` and `gcloud` adapters, output JSON, and the Action on a cron schedule.  
3. **Incident tracking:** transition detection, `incidents.json`, and the days-since calculation.  
4. **Dashboard UI:** tool cards with traffic lights, days-since counter, “last updated” timestamp, and a stale-data warning if the data is more than about 30 minutes old. Auto-refresh by re-fetching the JSON, and make it responsive.  
5. **Remaining tools:** Shopify, VTEX, PayPal, and Hawthorne Mckenzie Digital once you know what it is.  
6. **Hardening:** error handling per tool, tests for the adapters, a README explaining how to add a tool.

### **Gotchas to plan for**

* **Scheduled Actions get disabled** after 60 days of repo inactivity. Add a keep-alive step or a reminder.  
* **Commit noise:** only commit when data changes, or write to a separate `data` branch so your main history stays clean.  
* **Concurrency:** set the workflow’s concurrency group so overlapping runs don’t clash on commits.  
* **Private repo:** GitHub Pages on a private repo needs a paid plan. A public repo is fine here since the data comes from public status pages.

