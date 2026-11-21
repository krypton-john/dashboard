import { initSiteNav, syncStickyScrollMarginForHeader } from "./site-nav.js";

const DOMAIN_KEYS = [
  { key: "privacy", label: "Privacy" },
  { key: "accessibility", label: "Accessibility" },
  { key: "finance_promotions", label: "Financial promotions" },
];

const lastUpdatedEl = document.getElementById("last-updated");
const gridEl = document.getElementById("statutory-grid");
const metaScopeEl = document.getElementById("statutory-scope");
const regionFilterEl = document.getElementById("statutory-region-filter");
const domainFilterEl = document.getElementById("statutory-domain-filter");
const searchInputEl = document.getElementById("statutory-search-input");

/** @type {object | null} */
let statutoryData = null;

function normalizeUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/**
 * @param {string} query
 * @param {object[]} countries
 */
function filterCountries(countries, query, region, domain) {
  const q = query.trim().toLowerCase();
  return countries.filter((c) => {
    if (region && region !== "all" && c.region_group !== region) return false;
    if (q) {
      const hay = `${c.country_name} ${c.country_code}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (domain && domain !== "all") {
      const block = c[domain];
      if (!block || typeof block !== "object") return false;
    }
    return true;
  });
}

/**
 * @param {string} key
 * @param {object} block
 */
function renderDomainBlock(key, block, domainFocus) {
  if (!block || typeof block !== "object") return null;
  if (domainFocus !== "all" && domainFocus !== key) return null;

  const def = DOMAIN_KEYS.find((d) => d.key === key);
  const section = document.createElement("section");
  section.className = `statutory-domain statutory-domain--${key}`;

  const heading = document.createElement("h3");
  heading.className = "statutory-domain__title";
  heading.textContent = def?.label ?? key;

  section.append(heading);

  const rows = [];
  if (block.regulator) rows.push(["Regulator", block.regulator]);
  if (block.legislation) rows.push(["Legislation", block.legislation]);
  if (block.standard) rows.push(["Standard", block.standard]);
  if (block.ad_standards) rows.push(["Ad standards", block.ad_standards]);

  const dl = document.createElement("dl");
  dl.className = "statutory-domain__facts";
  for (const [term, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  if (rows.length) section.append(dl);

  const url = normalizeUrl(block.url);
  if (url) {
    const link = document.createElement("p");
    link.className = "statutory-domain__link";
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Regulator site ↗";
    link.append(a);
    section.append(link);
  }

  if (block.key_notes) {
    const notes = document.createElement("p");
    notes.className = "statutory-domain__notes";
    notes.textContent = block.key_notes;
    section.append(notes);
  }

  return section;
}

/**
 * @param {object} country
 * @param {string} domainFocus
 */
function renderCountryCard(country, domainFocus) {
  const shell = document.createElement("article");
  shell.className = "statutory-country-card";
  shell.id = `statutory-${country.country_code}`;

  const head = document.createElement("header");
  head.className = "statutory-country-card__head";

  const title = document.createElement("h2");
  title.className = "statutory-country-card__title";
  title.textContent = country.country_name ?? country.country_code;

  const meta = document.createElement("p");
  meta.className = "statutory-country-card__meta";
  meta.textContent = `${country.country_code ?? ""} · ${country.region_group ?? "—"}`;

  head.append(title, meta);
  shell.append(head);

  const body = document.createElement("div");
  body.className = "statutory-country-card__domains";

  for (const { key } of DOMAIN_KEYS) {
    const block = renderDomainBlock(key, country[key], domainFocus);
    if (block) body.append(block);
  }

  if (!body.children.length) return null;
  shell.append(body);
  return shell;
}

function paint() {
  if (!statutoryData) return;

  const countries = Array.isArray(statutoryData.countries)
    ? [...statutoryData.countries]
    : [];
  countries.sort((a, b) =>
    (a.country_name ?? "").localeCompare(b.country_name ?? "", undefined, {
      sensitivity: "base",
    })
  );

  const region = regionFilterEl?.value ?? "all";
  const domain = domainFilterEl?.value ?? "all";
  const query = searchInputEl?.value ?? "";

  const visible = filterCountries(countries, query, region, domain);

  gridEl.replaceChildren();
  const cards = visible
    .map((c) => renderCountryCard(c, domain))
    .filter(Boolean);

  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "grid__empty";
    empty.textContent = "No countries match the current filters.";
    gridEl.append(empty);
  } else {
    gridEl.replaceChildren(...cards);
  }

  const meta = statutoryData.metadata;
  if (metaScopeEl && meta?.scope) {
    const domains = Array.isArray(meta.domains) ? meta.domains.join(" · ") : "";
    metaScopeEl.textContent = domains
      ? `${meta.scope} — ${domains}`
      : meta.scope;
  }

  const updated = meta?.last_updated;
  lastUpdatedEl.textContent = updated
    ? `Regulatory dataset v${meta?.version ?? "?"} · updated ${updated}`
    : "Statutory dataset loaded";

  requestAnimationFrame(syncStickyScrollMarginForHeader);
}

function initStatutoryFilters() {
  const onChange = () => paint();
  regionFilterEl?.addEventListener("change", onChange);
  domainFilterEl?.addEventListener("change", onChange);
  searchInputEl?.addEventListener("input", onChange);
}

async function load() {
  try {
    const res = await fetch("data/statutory.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    statutoryData = await res.json();
    paint();
  } catch {
    gridEl.replaceChildren();
    lastUpdatedEl.textContent = "Could not load statutory data";
    if (metaScopeEl) metaScopeEl.textContent = "Failed to load data/statutory.json.";
  }
}

initSiteNav("statutory");
initStatutoryFilters();
window.addEventListener("resize", syncStickyScrollMarginForHeader);
load();