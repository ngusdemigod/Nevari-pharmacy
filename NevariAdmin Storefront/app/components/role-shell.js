"use client";

import Image from "next/image";
import { useState } from "react";
import ModalScrim from "./ModalScrim";
import { titleCase } from "./role-dashboard-utils";

export function SkeletonBox({ className = "" }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function RoleShell({
  title,
  pages: navPages,
  active,
  onPageChange,
  children,
  pageBodyClassName = "",
  headerAction = null,
  showHeader = true,
  topContent = null,
  pageLabels = {},
  renderNavIcon = null,
  onLogout = null,
  logoutBusy = false,
  sidebarFooter = null
}) {
  const roleLabel = title.replace(/^Nevari\s+/i, "");
  const visibleNavPages = navPages;
  const labelFor = (page) => pageLabels[page] || titleCase(page);
  const [sideNavOpen, setSideNavOpen] = useState(false);
  return <div className="doctor-flow-shell">
    <section className="app-shell">
      {sideNavOpen ? <ModalScrim className="dashboard-side-nav-backdrop" label="Close navigation" onDismiss={() => setSideNavOpen(false)} /> : null}
      <aside className={`sidebar dashboard-side-nav ${sideNavOpen ? "is-open" : ""}`} aria-label={`${roleLabel} sections`}>
        <div>
          <div className="brand">
            <div className="brand-mark">
              <Image src="/ne.webp" alt="Nevari Health" width={48} height={48} />
            </div>
            <div>
              <p className="brand-title">Nevari Health</p>
              <span className="brand-subtitle">{roleLabel} Dashboard</span>
            </div>
          </div>
          <p className="nav-label">Navigation</p>
          <div className="nav-list">
            {navPages.map((item, index) => <button className={`nav-item ${active === item ? "active" : ""}`} key={item} type="button" onClick={() => {
              onPageChange(item);
              setSideNavOpen(false);
            }}>
              <span className="nav-icon" aria-hidden="true">
                {renderNavIcon ? renderNavIcon(item, index) : <span className={`mobile-nav-glyph glyph-${(index % 4) + 1}`} />}
              </span>
              <span>{labelFor(item)}</span>
            </button>)}
          </div>
          {onLogout ? <button className="nav-item nav-logout" type="button" onClick={onLogout} disabled={logoutBusy}>
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M15 17.5 20 12l-5-5.5M20 12H9m5 7H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>{logoutBusy ? "Logging out..." : "Logout"}</span>
          </button> : null}
        </div>
        {sidebarFooter}
      </aside>
      <main className="main">
        <div className="dashboard-tablet-toolbar">
          <button className="dashboard-menu-button" type="button" aria-label="Open navigation" onClick={() => setSideNavOpen(true)}>
            <span />
            <span />
            <span />
          </button>
        </div>
        {topContent}

        <div className={`page-body ${pageBodyClassName}`.trim()}>
          {children}
        </div>
        <nav className="bottom-nav desktop-bottom-nav" aria-label={`${roleLabel} dashboard navigation`}>
          {visibleNavPages.map((item, index) => <button className={`nav-item ${active === item ? "active" : ""}`} key={item} type="button" onClick={() => onPageChange(item)}>
            <span className="nav-icon" aria-hidden="true">
              {renderNavIcon ? renderNavIcon(item, index) : <span className={`mobile-nav-glyph glyph-${index + 1}`} />}
            </span>
            {active === item ? labelFor(item) : null}
          </button>)}
        </nav>
      </main>
    </section>
  </div>;
}
