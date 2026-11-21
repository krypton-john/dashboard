import { initSiteNav, syncStickyScrollMarginForHeader } from "./site-nav.js";

const lastUpdatedEl = document.getElementById("last-updated");
const gridEl = document.getElementById("statutory-grid");

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * @param {object} item
 */
function renderStatutoryCard(item) {
  const shell = document.createElement("article");
  shell.className = "statutory-card";

  const title = document.createElement("h2");
  title.className = "statutory-card__title";
  title.textContent = item.title ?? "Requirement";

  const body = document.createElement("p");
  body.className = "statutory-card__body";
  body.textContent = item.summary ?? "";

  const due = document.createElement("p");
  due.className = "statutory-card__due";
  if (item.dueAt) due.textContent = `Due ${formatDate(item.dueAt)}`;

  shell.append(title, body);
  if (item.dueAt) shell.append(due);
  return shell;
}

function render(data) {
  const items = Array.isArray(data?.items) ? data.items : [];

  if (items.length === 0) {
    gridEl.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "grid__empty";
    empty.textContent =
      "No statutory requirements are configured yet. Add entries to data/statutory.json when ready.";
    gridEl.append(empty);
  } else {
    gridEl.replaceChildren(...items.map((item) => renderStatutoryCard(item)));
  }

  const updated = data?.updatedAt;
  lastUpdatedEl.textContent = updated
    ? `List updated ${formatDate(updated)}`
    : "Statutory list not dated";

  requestAnimationFrame(syncStickyScrollMarginForHeader);
}

async function load() {
  try {
    const res = await fetch("data/statutory.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch {
    gridEl.replaceChildren();
    lastUpdatedEl.textContent = "Could not load statutory data";
  }
}

initSiteNav("statutory");
window.addEventListener("resize", syncStickyScrollMarginForHeader);
load();