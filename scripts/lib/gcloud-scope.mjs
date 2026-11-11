/**
 * @typedef {{ products?: string[]; regions?: string[]; behavior?: "ignore_unscoped" | "alert_unscoped_minor" }} GcloudScope
 */

const REGION_RE =
  /(?:europe|asia|us|australia|southamerica|northamerica)-[a-z0-9-]+(?:-[a-z])?/gi;

/**
 * @param {object} incident
 */
export function extractGcloudIncidentText(incident) {
  const parts = [];
  if (typeof incident?.external_desc === "string") {
    parts.push(incident.external_desc);
  }
  if (Array.isArray(incident?.updates)) {
    for (const u of incident.updates) {
      if (typeof u?.text === "string") parts.push(u.text);
    }
  }
  return parts.join(" ").toLowerCase();
}

/**
 * @param {string} text
 */
export function extractRegionsFromText(text) {
  const matches = text.match(REGION_RE);
  if (!matches) return [];
  return [...new Set(matches.map((r) => r.toLowerCase()))];
}

/**
 * @param {string} text
 * @param {string[]} products
 */
export function matchProducts(text, products) {
  if (!Array.isArray(products) || products.length === 0) return [];
  const hay = text.toLowerCase();
  return products.filter((p) => hay.includes(String(p).toLowerCase()));
}

/**
 * @param {string} text
 * @param {string[]} regions
 */
export function matchRegions(text, regions) {
  const found = extractRegionsFromText(text);
  if (!Array.isArray(regions) || regions.length === 0) return found;
  const want = regions.map((r) => r.toLowerCase());
  return found.filter((r) => want.some((w) => r.includes(w) || w.includes(r)));
}

/**
 * @param {object} incident
 * @param {GcloudScope} scope
 */
export function incidentMatchesScope(incident, scope) {
  const text = extractGcloudIncidentText(incident);
  const products = scope?.products ?? [];
  const regions = scope?.regions ?? [];
  const behavior = scope?.behavior ?? "ignore_unscoped";

  const hasScope = products.length > 0 || regions.length > 0;
  if (!hasScope) return { inScope: true, matchedProducts: [], matchedRegions: [] };

  const matchedProducts = matchProducts(text, products);
  const matchedRegions =
    regions.length > 0
      ? matchRegions(text, regions)
      : extractRegionsFromText(text);

  const productOk = products.length === 0 || matchedProducts.length > 0;
  const regionOk = regions.length === 0 || matchedRegions.length > 0;
  const inScope = productOk && regionOk;

  if (!inScope && behavior === "alert_unscoped_minor") {
    return {
      inScope: true,
      matchedProducts,
      matchedRegions,
      unscoped: true,
    };
  }

  return { inScope, matchedProducts, matchedRegions, unscoped: false };
}

/**
 * @param {object[]} incidents
 * @param {GcloudScope} [scope]
 */
export function filterGcloudIncidentsByScope(incidents, scope) {
  if (!Array.isArray(incidents)) return { incidents: [], scopeMeta: null };

  const scoped = scope?.products?.length || scope?.regions?.length;
  if (!scoped) {
    return {
      incidents,
      scopeMeta: null,
    };
  }

  const inScope = [];
  const matchedProducts = new Set();
  const matchedRegions = new Set();

  for (const incident of incidents) {
    const match = incidentMatchesScope(incident, scope);
    if (match.inScope) {
      inScope.push(incident);
      for (const p of match.matchedProducts) matchedProducts.add(p);
      for (const r of match.matchedRegions) matchedRegions.add(r);
    }
  }

  return {
    incidents: inScope,
    scopeMeta: {
      matchedProducts: [...matchedProducts],
      matchedRegions: [...matchedRegions],
    },
  };
}
