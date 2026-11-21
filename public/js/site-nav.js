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
    label: "CVE / Critical releases",
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

const RECENT_IMPROVEMENTS_SEEN_KEY = "emea-dashboard-recent-improvements-v2";
const RECENT_IMPROVEMENTS_MS = 8000;

export function initRecentImprovementsToast() {
  try {
    if (localStorage.getItem(RECENT_IMPROVEMENTS_SEEN_KEY)) return;
  } catch {
    return;
  }

  let toast = document.getElementById("recent-improvements-toast");
  if (!toast) {
    toast = document.createElement("aside");
    toast.id = "recent-improvements-toast";
    toast.className = "improvements-toast improvements-toast--hidden";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.hidden = true;
    const text = document.createElement("p");
    text.className = "improvements-toast__text";
    text.innerHTML =
      "<strong>Recent improvements</strong>Improved layouts; clickable cards to status pages; search and persistent filtering. Introducing the CVE vulnerability list and Statutory requirements views.";
    toast.append(text);
    document.body.append(toast);
  }

  const markSeen = () => {
    try {
      localStorage.setItem(RECENT_IMPROVEMENTS_SEEN_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  };

  const dismiss = () => {
    toast.classList.add("improvements-toast--leaving");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeMs = reducedMotion ? 200 : 450;
    window.setTimeout(() => {
      toast.classList.add("improvements-toast--hidden");
      toast.hidden = true;
      markSeen();
    }, fadeMs);
  };

  toast.classList.remove("improvements-toast--hidden");
  toast.hidden = false;
  window.setTimeout(dismiss, RECENT_IMPROVEMENTS_MS);
}