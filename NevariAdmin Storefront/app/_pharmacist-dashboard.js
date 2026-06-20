"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminStorefrontDashboard } from "./admin/storefront/page";
import ModalScrim from "./components/ModalScrim";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { hydrateStoredSession, isSessionUsable } from "./components/role-dashboard-utils";
import { performGlobalLogout } from "./components/role-session";

const PHARMACIST_NAV_GROUPS = [
  {
    label: "Nevari Pharmacy",
    items: [
      { id: "products", label: "Products", icon: "i-pill" },
      { id: "orders", label: "Orders", icon: "i-cart" },
      { id: "payments", label: "Payments", icon: "i-credit-card" }
    ]
  },
  {
    label: "Nevari Health",
    items: [
      { id: "mtm", label: "MTM", icon: "i-clipboard" },
      { id: "iv-therapy", label: "IV Therapy", icon: "i-clipboard" }
    ]
  }
];

function InlineIcon({ id }) {
  return (
    <svg aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

function PharmacistIconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="i-layout" viewBox="0 0 24 24">
        <rect x="3" y="4" width="7" height="7" rx="2" />
        <rect x="14" y="4" width="7" height="4" rx="2" />
        <rect x="14" y="11" width="7" height="9" rx="2" />
        <rect x="3" y="14" width="7" height="6" rx="2" />
      </symbol>
      <symbol id="i-pill" viewBox="0 0 24 24">
        <path d="M10.5 20.5 3.5 13.5a5 5 0 1 1 7-7l7 7a5 5 0 1 1-7 7Z" />
        <path d="m8 8 8 8" />
      </symbol>
      <symbol id="i-cart" viewBox="0 0 24 24">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H7" />
      </symbol>
      <symbol id="i-credit-card" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>
      <symbol id="i-menu" viewBox="0 0 24 24">
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </symbol>
      <symbol id="i-briefcase-medical" viewBox="0 0 24 24">
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        <path d="M12 10v6" />
        <path d="M9 13h6" />
      </symbol>
      <symbol id="i-stethoscope" viewBox="0 0 24 24">
        <path d="M6 3v5a4 4 0 0 0 8 0V3" />
        <path d="M10 17a6 6 0 0 0 12 0v-1" />
        <circle cx="20" cy="10" r="2" />
        <path d="M8 3h4" />
      </symbol>
      <symbol id="i-clipboard" viewBox="0 0 24 24">
        <rect x="6" y="5" width="12" height="16" rx="2" />
        <path d="M9 5.5h6" />
        <path d="M9 10h6" />
        <path d="M9 14h6" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3Z" />
        <path d="m9.5 12 1.7 1.7 3.8-4.2" />
      </symbol>
      <symbol id="i-settings" viewBox="0 0 24 24">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="m4.9 4.9 2.1 2.1" />
        <path d="m17 17 2.1 2.1" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m4.9 19.1 2.1-2.1" />
        <path d="m17 7 2.1-2.1" />
        <circle cx="12" cy="12" r="4" />
      </symbol>
      <symbol id="i-logout" viewBox="0 0 24 24">
        <path d="M9 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
        <path d="m13 8 5 4-5 4" />
        <path d="M18 12H9" />
      </symbol>
    </svg>
  );
}

function hasPharmacistRole(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const directRole = typeof user?.role === "string" ? [user.role] : [];
  return [...roles, ...directRole].map((value) => String(value || "").toLowerCase()).includes("pharmacist");
}

export default function PharmacistDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [view, setView] = useState("products");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setDocumentMetadata("Nevari Pharmacist", "Pharmacist product management and medical therapy management.");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncMobile = (event) => setIsMobile(event.matches);
    syncMobile(mediaQuery);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMobile);
      return () => mediaQuery.removeEventListener("change", syncMobile);
    }
    mediaQuery.addListener(syncMobile);
    return () => mediaQuery.removeListener(syncMobile);
  }, []);

  useEffect(() => {
    const hydrated = hydrateStoredSession("pharmacist");
    if (!isSessionUsable(hydrated) || !hasPharmacistRole(hydrated.user)) {
      setAuthResolved(true);
      router.replace(FRONTENDS.pharmacist.loginPath);
      return;
    }
    setSession(hydrated);
    setAuthResolved(true);
  }, [router]);

  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  if (!authResolved || !session) {
    return <PharmacistDashboardBootSkeleton />;
  }

  async function logout() {
    await performGlobalLogout(FRONTENDS.pharmacist, session || hydrateStoredSession("pharmacist"));
    router.replace(FRONTENDS.pharmacist.loginPath);
  }

  function handleViewChange(nextView) {
    setView(nextView);
    setDrawerOpen(false);
  }

  return (
    <main className="pharmacist-dashboard-shell pharmacist-dashboard-shell-embedded">
      <PharmacistIconSprite />
      {isMobile && drawerOpen ? <ModalScrim className="pharmacist-dashboard-backdrop" label="Close pharmacist navigation" onDismiss={() => setDrawerOpen(false)} /> : null}
      <aside className={`pharmacist-dashboard-sidebar pharmacist-dashboard-admin-sidebar ${drawerOpen ? "open" : ""}`.trim()}>
        <div className="pharmacist-dashboard-sidebar-top">
          <div className="brand-row pharmacist-dashboard-brand">
            <div className="brand-mark pharmacist-dashboard-brand-mark">
              <img src={session.siteLogo || "/ne.webp"} alt="Nevari Pharmacy logo" className="brand-logo" />
            </div>
            <div>
              <strong>Nevari Pharmacy</strong>
              <span>Admin Storefront</span>
            </div>
          </div>

          <nav className="nav-groups" aria-label="Pharmacist sections">
            {PHARMACIST_NAV_GROUPS.map((group) => (
              <div className="nav-group" key={group.label}>
                <p className="nav-label">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-item ${view === item.id ? "active" : ""}`}
                    onClick={() => handleViewChange(item.id)}
                  >
                    <span className="nav-icon" aria-hidden="true"><InlineIcon id={item.icon} /></span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="pharmacist-dashboard-sidebar-footer">
          <button type="button" className="nav-item pharmacist-dashboard-logout-nav" onClick={logout}>
            <span className="nav-icon" aria-hidden="true"><InlineIcon id="i-logout" /></span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <section className="pharmacist-dashboard-main pharmacist-dashboard-main-embedded">
        <header className="pharmacist-dashboard-mobile-toolbar">
          <button type="button" className="icon-button pharmacist-dashboard-menu-button" aria-label="Open pharmacist navigation" onClick={() => setDrawerOpen(true)}>
            <InlineIcon id="i-menu" />
          </button>
          <div className="pharmacist-dashboard-mobile-title">
            <strong>Nevari Pharmacy</strong>
            <span>{PHARMACIST_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === view)?.label || "Products"}</span>
          </div>
        </header>
        <AdminStorefrontDashboard
          key={view}
          embeddedInitialPage={view}
          embeddedSession={session}
          embeddedCreateActions={["product", "order"]}
        />
      </section>
    </main>
  );
}

function PharmacistDashboardBootSkeleton() {
  return (
    <main className="pharmacist-dashboard-shell pharmacist-dashboard-shell-embedded">
      <PharmacistIconSprite />
      <aside className="pharmacist-dashboard-sidebar pharmacist-dashboard-admin-sidebar">
        <div className="pharmacist-dashboard-sidebar-top">
          <div className="brand-row pharmacist-dashboard-brand skeleton-panel">
            <div className="brand-mark pharmacist-dashboard-brand-mark">
              <img src="/ne.webp" alt="Nevari Pharmacy logo" className="brand-logo" />
            </div>
            <div>
              <strong>Nevari Pharmacy</strong>
              <span>Admin Storefront</span>
            </div>
          </div>
        </div>
      </aside>
      <section className="pharmacist-dashboard-main pharmacist-dashboard-main-embedded">
        <div className="nevari-admin-storefront embedded-dashboard-page pharmacist-dashboard-boot-card">
          <div className="main-shell">
            <header className="topbar skeleton-panel">
              <div className="topbar-left">
                <div className="skeleton skeleton-line skeleton-line-lg" />
              </div>
            </header>
            <section className="page-view active">
              <div className="products-redesign-metrics">
                {Array.from({ length: 3 }, (_, index) => (
                  <article className="metric-card skeleton-panel" key={`pharmacist-metric-skeleton-${index}`}>
                    <div className="skeleton skeleton-line skeleton-line-xs" />
                    <div className="skeleton skeleton-line skeleton-line-md" />
                    <div className="skeleton skeleton-line skeleton-line-sm" />
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
