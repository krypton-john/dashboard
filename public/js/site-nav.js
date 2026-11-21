/** @typedef {{ id: string; href: string; label: string; pageTitle: string }} SiteView */

/** @type {SiteView[]} */
export const SITE_VIEWS = [
  {
    id: "saas",
    href: "index.html",
    label: "SaaS",
    pageTitle: "SaaS Status",
  },
  {
    id: "critical",
    href: "critical-releases.html",
    label: "Critical Software Releases",
    pageTitle: "Critical Software Releases",
  },
  {
    id: "statutory",
    href: "statutory.html",
    label: "Statutory requirements",
    pageTitle: "Statutory requirements",
  },
];

/**
 * @param {string} activeId
 */
export function initSiteNav(activeId) {
  const select = document.getElementById("site-view-select");
  if (!select) return;

  const active = SITE_VIEWS.find((v) => v.id === activeId) ?? SITE_VIEWS[0];
  select.replaceChildren(
    ...SITE_VIEWS.map((v) => {
      const opt = document.createElement("option");
      opt.value = v.href;
      opt.textContent = v.label;
      opt.selected = v.id === active.id;
      return opt;
    })
  );

  select.addEventListener("change", () => {
    const target = select.value;
    if (!target) return;
    const current =
      location.pathname.split("/").filter(Boolean).pop() || "index.html";
    const normalized = current === "" ? "index.html" : current;
    if (target !== normalized) {
      location.href = target;
    }
  });
}

/**
 * @param {string} activeId
 */
export function syncStickyScrollMarginForHeader() {
  const sticky = document.getElementById("page-header-sticky");
  if (!sticky) return;
  const h = sticky.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--sticky-offset", `${Math.ceil(h)}px`);
}