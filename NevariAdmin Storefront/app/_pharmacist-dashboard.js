"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { RoleShell, SkeletonBox } from "./components/role-shell";
import { apiFileRequest, apiRequest, hydrateStoredSession, isSessionUsable, shortDate, titleCase } from "./components/role-dashboard-utils";
import { performGlobalLogout } from "./components/role-session";
import { BrandedSpinner } from "./components/BrandedSpinner";
import {
  WEEKDAYS,
  DEFAULT_SLOT_INTERVAL_MINUTES,
  normalizeAvailability,
  toggleAvailabilityDay,
  toggleAvailabilityFrame,
  buildAvailabilityTimeFrames,
  buildAvailabilityRangesFromFrames,
  getSelectedAvailabilityFrames,
  formatAvailabilityLabel,
} from "./components/availability-utils";

const PAGES = ["overview", "mtm", "iv-therapy", "availability"];
const PAGE_LABELS = {
  overview: "Overview",
  mtm: "MTM",
  "iv-therapy": "IV Therapy",
  availability: "Availability",
};
const REFRESH_MS = 45_000;
const CASES_PER_PAGE = 10;
const TERMINAL_CASE_STATUSES = new Set(["completed", "treatment_completed", "declined", "cancelled", "failed"]);

function hasPharmacistRole(user) {
  return [...(Array.isArray(user?.roles) ? user.roles : []), user?.role]
    .map((value) => String(value || "").toLowerCase())
    .includes("pharmacist");
}

function initials(value) {
  return String(value || "Pharmacist").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function iconFor(page) {
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    mtm: <><path d="M9 5h6" /><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M8 10h8M8 14h8M8 18h5" /></>,
    "iv-therapy": <><path d="M9 3h6M12 3v5M8 8h8v5a4 4 0 0 1-8 0V8Z" /><path d="M12 17v4M9 21h6" /></>,
    "action-required": <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 16.5v.5" /></>,
    availability: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[page]}</svg>;
}

function listItems(payload) {
  return Array.isArray(payload?.items) ? payload.items : [];
}

function patientName(item) {
  return item?.patient?.name || item?.patient?.fullName || item?.customer_name || "Patient";
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["completed", "approved", "treatment_completed"].includes(value)) return "success";
  if (["declined", "cancelled", "failed"].includes(value)) return "danger";
  if (["scheduled", "in_progress", "under_review"].includes(value)) return "processing";
  return "pending";
}

function caseReference(item, kind) {
  return item?.request_reference || item?.reference || `${kind === "mtm" ? "MTM" : "IV"} #${item?.id || ""}`;
}

function caseDate(item) {
  return shortDate(item?.scheduled_at || item?.updated_at || item?.created_at);
}

/** Request timestamps are stored as UTC MySQL strings, which JS would otherwise read as local time. */
function utcDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function consultationDate(item) {
  const date = utcDate(item?.scheduled_at);
  if (!date) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { timeZone: item?.timezone || "UTC", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function consultationTime(item) {
  const date = utcDate(item?.scheduled_at);
  if (!date) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { timeZone: item?.timezone || "UTC", hour: "numeric", minute: "2-digit" }).format(date);
}

function isActionRequired(item) {
  return Boolean(item?.action_required) || !TERMINAL_CASE_STATUSES.has(String(item?.status || "").toLowerCase());
}

export default function PharmacistDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [page, setPage] = useState("overview");
  const [notice, setNotice] = useState(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    setDocumentMetadata("Nevari Pharmacist", "Assigned MTM and IV Therapy clinical workspace.");
    const requested = new URLSearchParams(window.location.search).get("view");
    setPage(PAGES.includes(requested) ? requested : "overview");
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

  const mtmQuery = useSWR(
    session ? ["pharmacist-mtm", session.user?.id] : null,
    () => apiRequest(session, "/pharmacist/mtm-requests", { params: { per_page: 100, page: 1 } }),
    { refreshInterval: REFRESH_MS, revalidateOnFocus: false }
  );
  const ivQuery = useSWR(
    session ? ["pharmacist-iv", session.user?.id] : null,
    () => apiRequest(session, "/staff/care-requests/iv-therapy", { params: { per_page: 100, page: 1 } }),
    { refreshInterval: REFRESH_MS, revalidateOnFocus: false }
  );
  const availabilityQuery = useSWR(
    session ? ["pharmacist-availability", session.user?.id] : null,
    () => apiRequest(session, "/pharmacist/availability"),
    { revalidateOnFocus: false }
  );

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    await performGlobalLogout(FRONTENDS.pharmacist, session || hydrateStoredSession("pharmacist"));
    router.replace(FRONTENDS.pharmacist.loginPath);
  }

  function showNotice(message, tone = "success") {
    setNotice({ message, tone });
    window.setTimeout(() => setNotice(null), 4200);
  }

  if (!authResolved || !session) {
    return <PharmacistBootSkeleton />;
  }

  const mtmItems = listItems(mtmQuery.data);
  const ivItems = listItems(ivQuery.data);
  const availability = normalizeAvailability(availabilityQuery.data?.availability || {});
  const loading = mtmQuery.isLoading || ivQuery.isLoading || availabilityQuery.isLoading;

  return <RoleShell
    title="Nevari Pharmacist"
    pages={PAGES}
    active={page}
    onPageChange={setPage}
    pageLabels={PAGE_LABELS}
    renderNavIcon={iconFor}
    onLogout={logout}
    logoutBusy={logoutBusy}
    showHeader={false}
    hideMobileBottomNav
    hideTabletToolbar
    pageBodyClassName="pharmacist-page-body"
    sidebarFooter={<div className="customer-desktop-sidebar-profile">
      <div className="customer-mobile-avatar customer-desktop-sidebar-avatar">{initials(session.user?.display_name)}</div>
      <div className="customer-desktop-sidebar-profile-copy">
        <strong>{session.user?.display_name || "Pharmacist"}</strong>
        <span>{session.user?.email || ""}</span>
      </div>
    </div>}
  >
    {({ openNav }) => <div className="pharmacist-clinical-dashboard">
      {notice ? <div className={`snackbar ${notice.tone}`} role="status" aria-live="polite"><div className="snackbar-copy"><strong className="snackbar-title">{titleCase(notice.tone)}</strong><span className="snackbar-message">{notice.message}</span></div></div> : null}
      {page === "overview" ? <Overview
        name={session.user?.display_name}
        mtmItems={mtmItems}
        ivItems={ivItems}
        availability={availability}
        loading={loading}
        onNavigate={setPage}
        onOpenNav={openNav}
      /> : null}
      {page === "mtm" ? <MtmWorkspace session={session} items={mtmItems} query={mtmQuery} onNotice={showNotice} onOpenNav={openNav} /> : null}
      {page === "iv-therapy" ? <IvWorkspace session={session} items={ivItems} query={ivQuery} onNotice={showNotice} onOpenNav={openNav} /> : null}
      {page === "availability" ? <AvailabilityWorkspace session={session} availability={availability} loading={availabilityQuery.isLoading} mutate={availabilityQuery.mutate} onNotice={showNotice} onOpenNav={openNav} /> : null}
    </div>}
  </RoleShell>;
}

/**
 * Pharmacist page header: search bar, then the nav toggle beside the page title,
 * then the page description. The nav toggle replaces the shell toolbar button and
 * is hidden on desktop, where the sidebar is always visible.
 */
function PharmacistPageHeader({ title, description, onOpenNav, search = null, onSearch = null, searchPlaceholder = "" }) {
  return <header className="pharmacist-page-header">
    {onSearch ? <label className="doctor-mobile-search pharmacist-workspace-search">
      <span className="sr-only">{searchPlaceholder}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
      <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} />
    </label> : null}
    <div className="pharmacist-page-title-row">
      <button className="pharmacist-nav-toggle" type="button" aria-label="Open navigation" onClick={onOpenNav}>
        <span />
        <span />
        <span />
      </button>
      <h1>{title}</h1>
    </div>
    {description ? <p className="pharmacist-page-description">{description}</p> : null}
  </header>;
}

function Overview({ name, mtmItems, ivItems, availability, loading, onNavigate, onOpenNav }) {
  const [search, setSearch] = useState("");
  const availableDays = Object.values(availability).filter((ranges) => Array.isArray(ranges) && ranges.length).length;
  const actionRequired = [...mtmItems, ...ivItems].filter(isActionRequired).length;
  const cards = [
    { key: "assigned-mtm", label: "Assigned MTM", value: mtmItems.length, page: "mtm", icon: "mtm" },
    { key: "assigned-iv", label: "Assigned IV Therapy", value: ivItems.length, page: "iv-therapy", icon: "iv-therapy" },
    { key: "action-required", label: "Action required", value: actionRequired, page: actionRequired && mtmItems.some(isActionRequired) ? "mtm" : "iv-therapy", icon: "action-required" },
    { key: "available-days", label: "Available days", value: availableDays, page: "availability", icon: "availability" },
  ];
  const cases = [
    ...mtmItems.map((item) => ({ ...item, caseKind: "mtm" })),
    ...ivItems.map((item) => ({ ...item, caseKind: "iv" })),
  ]
    .filter((item) => `${patientName(item)} ${caseReference(item, item.caseKind)} ${item.status || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((first, second) => new Date(second.updated_at || second.created_at || 0) - new Date(first.updated_at || first.created_at || 0))
    .slice(0, 6);

  return <section className="pharmacist-clinical-page pharmacist-overview-page">
    <PharmacistPageHeader
      title="Overview"
      description={`Welcome back, ${String(name || "Pharmacist").split(" ")[0].toLowerCase()}`}
      onOpenNav={onOpenNav}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search here for assigned cases"
    />
    <section className="overview-metric-grid pharmacist-metric-grid" aria-label="Pharmacist dashboard summary metrics">
      {cards.map((card) => <button className="overview-metric-card pharmacist-metric-card" type="button" key={card.key} onClick={() => onNavigate(card.page)}>
        <span className="overview-metric-icon" aria-hidden="true">{iconFor(card.icon)}</span>
        <span className="overview-metric-label">{card.label}</span>
        {loading ? <SkeletonBox className="skeleton-line skeleton-line-md" /> : <strong className="overview-metric-value">{card.value}</strong>}
      </button>)}
    </section>
    <OverviewCaseList items={cases} onOpen={(item) => onNavigate(item.caseKind === "mtm" ? "mtm" : "iv-therapy")} />
  </section>;
}

function OverviewCaseList({ items, onOpen }) {
  return <section className="pharmacist-overview-cases" aria-labelledby="pharmacist-overview-cases-title">
    <h2 id="pharmacist-overview-cases-title">Assigned cases</h2>
    <div className="pharmacist-overview-case-list">
      {items.map((item) => <article
        className="pharmacist-overview-case-row"
        key={`${item.caseKind}-${item.id}`}
        role="button"
        tabIndex="0"
        onClick={() => onOpen(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(item);
          }
        }}
      >
        <span className="pharmacist-overview-case-icon" aria-hidden="true">{iconFor(item.caseKind === "mtm" ? "mtm" : "iv-therapy")}</span>
        <span className="pharmacist-overview-case-copy">
          <strong>{patientName(item)}</strong>
          <span>{item.caseKind === "mtm" ? "Medication Therapy Management" : "IV Therapy"} · {caseDate(item)}</span>
          <small>{caseReference(item, item.caseKind)}</small>
        </span>
        <span className={`doctor-mobile-status-pill ${statusTone(item.status)}`}>{titleCase(item.status)}</span>
      </article>)}
      {!items.length ? <div className="pharmacist-overview-empty">No assigned cases match the current search.</div> : null}
    </div>
  </section>;
}

function WorkspaceShell({ title, description, kind, items, loading, selectedId, onSelect, search, onSearch, onOpenNav, modalTitle = "", children }) {
  const [page, setPage] = useState(1);
  const filtered = items.filter((item) => `${patientName(item)} ${item.request_reference || item.reference || ""} ${item.status || ""}`.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / CASES_PER_PAGE));
  const paginatedItems = filtered.slice((page - 1) * CASES_PER_PAGE, page * CASES_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [search, items.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return <section className="pharmacist-clinical-page">
    <PharmacistPageHeader
      title={title}
      description={description}
      onOpenNav={onOpenNav}
      search={search}
      onSearch={onSearch}
      searchPlaceholder="Search patient, reference, or status"
    />
    <PharmacistCaseTable
      title={`${title} cases`}
      description={`${filtered.length} ${filtered.length === 1 ? "case" : "cases"} match the current view.`}
      kind={kind}
      items={paginatedItems}
      loading={loading}
      onOpen={(item) => onSelect(item.id)}
    />
    {pageCount > 1 ? <PharmacistPagination page={page} pageCount={pageCount} onPageChange={setPage} /> : null}
    {selectedId ? <PharmacistCaseModal title={modalTitle || `${title} details`} onClose={() => onSelect(null)}>{children}</PharmacistCaseModal> : null}
  </section>;
}

function PharmacistCaseTable({ title, description, kind, items, loading = false, compact = false, onOpen = null, onViewAll = null }) {
  const columns = compact
    ? ["Patient", "Reference", "Date", "Status"]
    : kind === "mtm"
      ? ["Patient", "Reference", "Scheduled", "Payment", "Status"]
      : ["Patient", "Reference", "Scheduled", "Updated", "Status"];
  const openItem = (item) => onOpen?.(item);
  const renderCells = (item) => {
    const status = <span className={`doctor-mobile-status-pill ${statusTone(item.status)}`} key="status">{titleCase(item.status)}</span>;
    if (compact) {
      return [
        <div className="doctor-table-meta" key="patient"><strong className="doctor-table-cell-name">{patientName(item)}</strong></div>,
        <strong className="doctor-table-cell-strong" key="reference">{caseReference(item, kind)}</strong>,
        <span key="date">{caseDate(item)}</span>,
        status,
      ];
    }
    if (kind === "mtm") {
      return [
        <div className="doctor-table-meta" key="patient"><strong className="doctor-table-cell-name">{patientName(item)}</strong><span>{item.patient?.email || "Assigned patient"}</span></div>,
        <strong className="doctor-table-cell-strong" key="reference">{caseReference(item, kind)}</strong>,
        <span key="scheduled">{item.scheduled_at ? shortDate(item.scheduled_at) : "Not scheduled"}</span>,
        <span key="payment">{titleCase(item.payment?.payment_state || item.payment_state || "Pending")}</span>,
        status,
      ];
    }
    return [
      <div className="doctor-table-meta" key="patient"><strong className="doctor-table-cell-name">{patientName(item)}</strong><span>{item.patient?.email || "Assigned patient"}</span></div>,
      <strong className="doctor-table-cell-strong" key="reference">{caseReference(item, kind)}</strong>,
      <span key="scheduled">{item.scheduled_at ? shortDate(item.scheduled_at) : "Not scheduled"}</span>,
      <span key="updated">{shortDate(item.updated_at || item.created_at)}</span>,
      status,
    ];
  };

  return <section className="table-panel doctor-appointments-panel pharmacist-case-table-panel">
    <div className="appointment-panel-header">
      <div className="doctor-appointments-header-copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {onViewAll ? <button type="button" className="btn text" onClick={onViewAll}>View all</button> : null}
    </div>
    <div className="table-scroll pharmacist-case-table-wrap">
      <table className="doctor-appointments-table pharmacist-case-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {loading ? Array.from({ length: compact ? 4 : 6 }, (_, row) => <tr key={`case-skeleton-${row}`}>{columns.map((column) => <td key={column}><SkeletonBox className="skeleton-line skeleton-line-md" /></td>)}</tr>) : null}
          {!loading && items.length ? items.map((item) => <tr
            className={onOpen ? "doctor-appointment-row" : ""}
            key={item.id}
            role={onOpen ? "button" : undefined}
            tabIndex={onOpen ? 0 : undefined}
            aria-label={onOpen ? `Open ${kind === "mtm" ? "MTM" : "IV Therapy"} details for ${patientName(item)}` : undefined}
            onClick={onOpen ? () => openItem(item) : undefined}
            onKeyDown={onOpen ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openItem(item);
              }
            } : undefined}
          >{renderCells(item).map((cell, index) => <td key={columns[index]}>{cell}</td>)}</tr>) : null}
          {!loading && !items.length ? <tr><td className="doctor-table-empty" colSpan={columns.length}>No assigned cases match this view.</td></tr> : null}
        </tbody>
      </table>
    </div>
    <div className="pharmacist-case-mobile-list">
      {loading ? Array.from({ length: compact ? 4 : 6 }, (_, index) => <div className="doctor-mobile-overview-item" key={`mobile-case-skeleton-${index}`}><SkeletonBox className="skeleton-line skeleton-line-md" /></div>) : null}
      {!loading && items.length ? items.map((item) => <article
        className={`doctor-mobile-overview-item ${onOpen ? "is-interactive" : ""}`.trim()}
        key={item.id}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? () => openItem(item) : undefined}
        onKeyDown={onOpen ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openItem(item);
          }
        } : undefined}
      >
        <span className="doctor-mobile-overview-icon" aria-hidden="true">{iconFor(kind === "mtm" ? "mtm" : "iv-therapy")}</span>
        <span className="doctor-mobile-overview-copy"><strong>{patientName(item)}</strong><span>{caseReference(item, kind)}</span><span>{caseDate(item)}</span></span>
        <span className={`doctor-mobile-status-pill ${statusTone(item.status)}`}>{titleCase(item.status)}</span>
      </article>) : null}
      {!loading && !items.length ? <div className="doctor-mobile-empty-card">No assigned cases match this view.</div> : null}
    </div>
  </section>;
}

function PharmacistPagination({ page, pageCount, onPageChange }) {
  return <div className="doctor-pagination pharmacist-case-pagination" aria-label="Case pagination">
    <button className="btn secondary small" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
    <div className="doctor-pagination-status"><strong>Page {page}</strong><span>of {pageCount}</span></div>
    <button className="btn secondary small" type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
  </div>;
}

function PharmacistCaseModal({ title, onClose, children }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      modalRef.current?.focus();
      modalRef.current?.querySelector(".modal-body")?.scrollTo({ top: 0 });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(<div className="app-modal-layer app-modal-layer-top is-open pharmacist-case-modal-layer">
    <button className="app-modal-backdrop" type="button" aria-label={`Close ${title}`} onClick={onClose} />
    <section className="modal-frame detail-flat-modal pharmacist-case-modal" role="dialog" aria-modal="true" aria-label={title} ref={modalRef} tabIndex="-1">
      <div className="modal-head"><div><p className="section-kicker">Assigned care</p><h2>{title}</h2></div><button className="icon-button" type="button" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
      <div className="modal-body" tabIndex="-1">{children}</div>
    </section>
  </div>, document.body);
}

function MtmWorkspace({ session, items, query, onNotice, onOpenNav }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState("");
  const [declineValidation, setDeclineValidation] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [attached, setAttached] = useState([]);
  const selected = items.find((item) => String(item.id) === String(selectedId)) || null;
  const status = String(selected?.status || "").toLowerCase();
  const isReviewStage = ["submitted", "under_review"].includes(status);
  const isScheduled = status === "scheduled";
  // Both parties opened their join link inside the meeting window, so the consultation happened.
  const consultationStarted = String(selected?.attendance_status || "") === "attended";

  useEffect(() => {
    const plan = selected?.action_plan && typeof selected.action_plan === "object" && !Array.isArray(selected.action_plan) ? selected.action_plan : {};
    const draftProducts = Array.isArray(plan.products) ? plan.products : selected?.attached_products;
    setNotes(String(plan.note || ""));
    setDeclineValidation("");
    setAttached(Array.isArray(draftProducts) ? draftProducts.map((item) => ({ product_id: Number(item.product_id), name: String(item.name || "") })).filter((item) => item.product_id) : []);
    setProductSearch("");
    // Draft state is reloaded when a different case is opened, not on every background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const productsQuery = useSWR(
    session && selected && productSearch.trim().length >= 2 ? ["pharmacist-mtm-products", selected.id, productSearch] : null,
    () => apiRequest(session, `/pharmacist/mtm-requests/${selected.id}/pharmacy-products`, { params: { search: productSearch } }),
    { revalidateOnFocus: false }
  );
  const productResults = listItems(productsQuery.data).filter((product) => !attached.some((item) => item.product_id === product.id)).slice(0, 6);

  async function action(actionName, body = {}, { close = false, message = "MTM case updated." } = {}) {
    if (!selected || busy) return;
    setBusy(actionName);
    try {
      await apiRequest(session, `/pharmacist/mtm-requests/${selected.id}/${actionName}`, { method: "POST", body });
      await query.mutate();
      if (close) setSelectedId(null);
      onNotice(message, "success");
    } catch (error) {
      onNotice(error?.message || "The MTM case could not be updated.", "error");
    } finally {
      setBusy("");
    }
  }

  function declineRequest() {
    const reason = notes.trim();
    if (!reason) {
      setDeclineValidation("Add a clinical note explaining why this request is being declined.");
      return;
    }
    setDeclineValidation("");
    void action("decline", { reason }, { close: true, message: "Request declined." });
  }

  async function completeConsultation() {
    if (!selected || busy) return;
    setBusy("consultation-complete");
    try {
      if (attached.length) {
        await apiRequest(session, `/pharmacist/mtm-requests/${selected.id}/attach-products`, {
          method: "POST",
          body: { items: attached.map((item) => ({ product_id: item.product_id, quantity: 1 })) },
        });
      }
      await apiRequest(session, `/pharmacist/mtm-requests/${selected.id}/consultation-complete`, {
        method: "POST",
        body: { consultation_notes: { note: notes, products: attached } },
      });
      await query.mutate();
      setSelectedId(null);
      onNotice("Consultation completed. The patient has been notified.", "success");
    } catch (error) {
      onNotice(error?.message || "The consultation could not be completed.", "error");
    } finally {
      setBusy("");
    }
  }

  async function downloadAttachment() {
    if (!selected || busy) return;
    setBusy("document");
    try {
      const blob = await apiFileRequest(session, `/pharmacist/mtm-requests/${selected.id}/document`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${String(selected.request_reference || `mtm-${selected.id}`).toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onNotice(error?.message || "The MTM document is not available yet.", "error");
    } finally {
      setBusy("");
    }
  }

  function addProduct(product) {
    setAttached((current) => current.some((item) => item.product_id === product.id) ? current : [...current, { product_id: product.id, name: product.name }]);
    setProductSearch("");
  }

  const attachmentButton = <button className="doctor-mobile-action-button secondary pharmacist-attachment-button" type="button" disabled={busy === "document" || !selected?.document?.available} onClick={downloadAttachment}>
    {selected?.document?.available ? "Download attachment" : "Attachment not ready"}
  </button>;

  return <WorkspaceShell
    title="Medication Therapy Management"
    description="Review and document only the MTM cases assigned to you."
    modalTitle="Medication Therapy Management"
    kind="mtm"
    items={items}
    loading={query.isLoading}
    selectedId={selectedId}
    onSelect={setSelectedId}
    search={search}
    onSearch={setSearch}
    onOpenNav={onOpenNav}
  >
    {selected ? <article className="pharmacist-detail-card pharmacist-modal-detail-card">
      <div className="pharmacist-detail-head"><div><p className="eyebrow">{selected.request_reference || `MTM #${selected.id}`}</p><h2>{patientName(selected)}</h2></div><span className={`doctor-mobile-status-pill ${statusTone(selected.status)}`}>{titleCase(selected.status)}</span></div>

      {isScheduled ? <div className="pharmacist-detail-facts pharmacist-detail-facts-wide">
        <div><span>Patient</span><strong>{patientName(selected)}</strong></div>
        <div><span>Date</span><strong>{consultationDate(selected)}</strong></div>
        <div><span>Time</span><strong>{consultationTime(selected)}</strong></div>
        <div><span>Location</span><strong>Google Meet</strong></div>
      </div> : <div className="pharmacist-detail-facts">
        <div><span>Created</span><strong>{shortDate(selected.created_at)}</strong></div>
        <div><span>Scheduled</span><strong>{selected.scheduled_at ? consultationDate(selected) : "Not scheduled"}</strong></div>
        <div><span>Payment state</span><strong>{titleCase(selected.payment?.state || selected.payment?.payment_state || selected.payment_state || "Pending")}</strong></div>
      </div>}

      <div className="pharmacist-action-row pharmacist-attachment-row">{attachmentButton}</div>

      {isReviewStage ? <>
        <label className="doctor-mobile-form-field"><span>Clinical note or action plan</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="Record a concise clinical note." /></label>
        <div className="doctor-mobile-card-actions pharmacist-action-row">
          <button className="doctor-mobile-action-button primary" type="button" disabled={Boolean(busy)} onClick={() => action("approve", {}, { message: "Request approved and scheduled." })}>{busy === "approve" ? <BrandedSpinner label="Approving request" /> : "Approve"}</button>
          <button className="doctor-mobile-action-button danger" type="button" disabled={Boolean(busy)} onClick={declineRequest}>{busy === "decline" ? <BrandedSpinner label="Declining request" /> : "Decline"}</button>
        </div>
        {declineValidation ? <p className="pharmacist-action-error" role="alert">{declineValidation}</p> : !notes.trim() ? <p className="pharmacist-action-hint">Add a clinical note to record a decline reason.</p> : null}
      </> : null}

      {isScheduled ? <>
        <div className="doctor-mobile-card-actions pharmacist-action-row">
          {consultationStarted
            ? <button className="doctor-mobile-action-button primary" type="button" disabled={Boolean(busy)} onClick={completeConsultation}>{busy === "consultation-complete" ? <BrandedSpinner label="Completing consultation" /> : "Complete consultation"}</button>
            : <a className="doctor-mobile-action-button primary pharmacist-join-link" href={selected.pharmacist_join_url || "#"} target="_blank" rel="noopener noreferrer" aria-disabled={!selected.pharmacist_join_url}>Join meeting</a>}
          {consultationStarted
            ? <button className="doctor-mobile-action-button secondary" type="button" disabled={Boolean(busy)} onClick={() => action("action-plan", { action_plan: { note: notes, products: attached } }, { close: true, message: "Saved as draft." })}>{busy === "action-plan" ? <BrandedSpinner label="Saving action plan" /> : "Save action plan"}</button>
            : <button className="doctor-mobile-action-button secondary" type="button" disabled={Boolean(busy)} onClick={() => action("reschedule", {}, { close: true, message: "The patient has been asked to pick a new slot." })}>{busy === "reschedule" ? <BrandedSpinner label="Requesting reschedule" /> : "Reschedule"}</button>}
        </div>
        {consultationStarted ? <>
          <label className="doctor-mobile-form-field"><span>Clinical note or action plan</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="Record a concise clinical note." /></label>
          <section className="pharmacist-product-picker">
            <div className="doctor-mobile-page-head"><div><p className="eyebrow">Assigned-case tools</p><h3>Medication products</h3></div></div>
            <div className="pharmacist-product-field">
              <div className="pharmacist-product-tags">
                {attached.map((item) => <span className="pharmacist-product-tag" key={item.product_id}>
                  {item.name}
                  <button type="button" aria-label={`Remove ${item.name}`} onClick={() => setAttached((current) => current.filter((row) => row.product_id !== item.product_id))}>×</button>
                </span>)}
                <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={attached.length ? "Add another product" : "Search products for this action plan"} aria-label="Search pharmacy products" />
              </div>
              {productSearch.trim().length >= 2 ? <div className="pharmacist-product-suggestions" role="listbox" aria-label="Product results">
                {productsQuery.isLoading ? <p className="pharmacist-product-empty">Searching products...</p> : null}
                {!productsQuery.isLoading && !productResults.length ? <p className="pharmacist-product-empty">No products match this search.</p> : null}
                {productResults.map((product) => <button type="button" role="option" aria-selected="false" key={product.id} onClick={() => addProduct(product)}>
                  <strong>{product.name}</strong>
                  <small>{product.sku || "Pharmacy product"}</small>
                </button>)}
              </div> : null}
            </div>
          </section>
        </> : null}
      </> : null}

      {!isReviewStage && !isScheduled ? <p className="pharmacist-action-hint">{
        status === "approved"
          ? "Waiting for the patient to pick a consultation slot."
          : "This case has no pending pharmacist action."
      }</p> : null}
    </article> : <div className="doctor-mobile-empty-card">Select an assigned MTM case.</div>}
  </WorkspaceShell>;
}

function IvWorkspace({ session, items, query, onNotice, onOpenNav }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const selected = items.find((item) => String(item.id) === String(selectedId)) || null;

  useEffect(() => {
    if (!session || !selectedId) {
      setDetail(null);
      return;
    }
    apiRequest(session, `/staff/care-requests/iv-therapy/${selectedId}`).then((payload) => setDetail(payload?.request || null)).catch(() => setDetail(null));
  }, [session, selectedId]);

  async function transition(nextStatus) {
    if (!selected || busy) return;
    setBusy(nextStatus);
    try {
      const payload = await apiRequest(session, `/staff/care-requests/iv-therapy/${selected.id}`, {
        method: "PATCH",
        body: { status: nextStatus, patient_safe_message: `Your IV Therapy request is now ${titleCase(nextStatus)}.` },
      });
      setDetail(payload?.request || null);
      await query.mutate();
      onNotice("IV Therapy case updated.", "success");
    } catch (error) {
      onNotice(error?.message || "The IV Therapy case could not be updated.", "error");
    } finally {
      setBusy("");
    }
  }

  const current = detail || selected;
  return <WorkspaceShell title="IV Therapy" description="Review only IV Therapy cases assigned to your pharmacist account." kind="iv" items={items} loading={query.isLoading} selectedId={selectedId} onSelect={setSelectedId} search={search} onSearch={setSearch} onOpenNav={onOpenNav}>
    {current ? <article className="pharmacist-detail-card pharmacist-modal-detail-card">
      <div className="pharmacist-detail-head"><div><p className="eyebrow">{current.reference || `IV #${current.id}`}</p><h2>{patientName(current)}</h2></div><span className={`doctor-mobile-status-pill ${statusTone(current.status)}`}>{titleCase(current.status)}</span></div>
      <div className="pharmacist-detail-facts">
        <div><span>Assigned clinician</span><strong>{current.assignee?.name || "You"}</strong></div>
        <div><span>Scheduled</span><strong>{current.scheduled_at ? shortDate(current.scheduled_at) : "Not scheduled"}</strong></div>
        <div><span>Updated</span><strong>{shortDate(current.updated_at)}</strong></div>
      </div>
      <ClinicalDetails value={current.request_details} />
      <div className="pharmacist-action-row">
        {(current.next_action || []).filter((status) => !["cancelled"].includes(status)).map((status) => <button className={`doctor-mobile-action-button ${status === "declined" ? "danger" : "primary"}`} type="button" disabled={Boolean(busy)} key={status} onClick={() => transition(status)}>{titleCase(status)}</button>)}
      </div>
    </article> : <div className="doctor-mobile-empty-card">Select an assigned IV Therapy case.</div>}
  </WorkspaceShell>;
}

function ClinicalDetails({ value }) {
  if (!value || typeof value !== "object") return null;
  const rows = Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item)).slice(0, 12);
  if (!rows.length) return null;
  return <dl className="pharmacist-clinical-details">{rows.map(([key, item]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{String(item)}</dd></div>)}</dl>;
}

function AvailabilityWorkspace({ session, availability, loading, mutate, onNotice, onOpenNav }) {
  const [draft, setDraft] = useState(availability);
  const [saving, setSaving] = useState(false);
  const frames = useMemo(() => buildAvailabilityTimeFrames(DEFAULT_SLOT_INTERVAL_MINUTES), []);
  // The parent rebuilds `availability` on every render, so compare by value: a background
  // refresh must never reset the draft and discard unsaved edits.
  const savedSignature = JSON.stringify(normalizeAvailability(availability));
  useEffect(() => setDraft(JSON.parse(savedSignature)), [savedSignature]);
  const selectedFramesByDay = useMemo(() => WEEKDAYS.reduce((result, day) => ({
    ...result,
    [day]: getSelectedAvailabilityFrames(draft[day], DEFAULT_SLOT_INTERVAL_MINUTES, frames),
  }), {}), [draft, frames]);
  const savedFramesByDay = useMemo(() => {
    const saved = JSON.parse(savedSignature);
    return WEEKDAYS.reduce((result, day) => ({
      ...result,
      [day]: getSelectedAvailabilityFrames(saved[day], DEFAULT_SLOT_INTERVAL_MINUTES, frames),
    }), {});
  }, [savedSignature, frames]);
  const changedDays = WEEKDAYS.filter((day) => selectedFramesByDay[day].join("|") !== savedFramesByDay[day].join("|"));
  const hasChanges = changedDays.length > 0;
  const activeDays = WEEKDAYS.filter((day) => selectedFramesByDay[day].length).length;
  const totalSlots = WEEKDAYS.reduce((sum, day) => sum + selectedFramesByDay[day].length, 0);
  const morningFrames = frames.filter((time) => Number(time.slice(0, 2)) < 12);
  const afternoonFrames = frames.filter((time) => Number(time.slice(0, 2)) >= 12 && Number(time.slice(0, 2)) < 17);
  const eveningFrames = frames.filter((time) => Number(time.slice(0, 2)) >= 17);

  function applyPreset(day, preset) {
    setDraft((current) => {
      const next = normalizeAvailability(current);
      if (preset === "clear") {
        next[day] = [];
        return next;
      }
      const presetFrames = preset === "morning" ? morningFrames : preset === "afternoon" ? afternoonFrames : frames;
      next[day] = buildAvailabilityRangesFromFrames(presetFrames, DEFAULT_SLOT_INTERVAL_MINUTES);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const payload = await apiRequest(session, "/pharmacist/availability", { method: "PATCH", body: { availability: normalizeAvailability(draft) } });
      await mutate(payload, { revalidate: false });
      onNotice("Availability updated.", "success");
    } catch (error) {
      onNotice(error?.message || "Availability could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  }

  return <section className="page-view active pharmacist-availability-editor" data-page-panel="availability">
    <PharmacistPageHeader
      title="Availability"
      description="Set the days and times patients can book an MTM consultation with you."
      onOpenNav={onOpenNav}
    />
    <div className="availability-layout">
      <aside className="summary-column">
        <section className="section-card pad">
          <div className="card-title-row">
            <div><h2 className="card-title">Weekly summary</h2><p className="card-copy">A quick view of what patients can book this week.</p></div>
            <span className={`status-pill ${activeDays ? "success" : "warning"}`}>{activeDays ? "Live schedule" : "Needs setup"}</span>
          </div>
          <div className="stat-grid" aria-label="Weekly availability statistics">
            <div className="stat"><span className="stat-label">Active days</span><strong className="stat-value">{activeDays}</strong></div>
            <div className="stat"><span className="stat-label">Bookable slots</span><strong className="stat-value">{totalSlots}</strong></div>
            <div className="stat"><span className="stat-label">First slot</span><strong className="stat-value">{totalSlots ? formatAvailabilityLabel(frames[0]) : "None"}</strong></div>
            <div className="stat"><span className="stat-label">Last slot</span><strong className="stat-value">{totalSlots ? formatAvailabilityLabel(frames[frames.length - 1]) : "None"}</strong></div>
          </div>
        </section>
      </aside>
      <section className="schedule-column">
        <div className="schedule-intro"><div><h2>Daily slot editor</h2><p>Open a day, turn it on or off, then choose the time slots patients can book.</p></div></div>
      {WEEKDAYS.map((day) => {
        const selected = selectedFramesByDay[day];
        const enabled = Boolean(selected.length);
        const changed = changedDays.includes(day);
        return <details className={`day-card ${enabled ? "" : "closed"} ${changed ? "has-unsaved-changes" : ""}`.trim()} key={day} open>
          <summary className="day-summary">
            <div className="day-heading"><div><h3 className="day-name">{titleCase(day)}</h3><p className="day-note"><span>{selected.length}</span> selected slots - {enabled ? `starts ${formatAvailabilityLabel(selected[0])}` : "patients cannot book this day"}</p></div></div>
            <div className="summary-right">
              {changed ? <button
                className="btn primary pharmacist-day-save"
                type="button"
                disabled={loading || saving}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  save();
                }}
              >{saving ? "Saving..." : "Save changes"}</button> : null}
              <label className="switch day-summary-switch" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={enabled} disabled={loading || saving} aria-label={`Allow bookings on ${titleCase(day)}`} onClick={(event) => event.stopPropagation()} onChange={(event) => setDraft((current) => toggleAvailabilityDay(current, day, event.target.checked, DEFAULT_SLOT_INTERVAL_MINUTES))} />
                <span className="switch-ui" aria-hidden="true" />
              </label>
              <span className={`status-pill ${enabled ? "success" : "warning"}`}>{enabled ? "Bookable" : "Unavailable"}</span>
              <span className="chevron"><svg className="icon" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            </div>
          </summary>
          <div className="day-body">
            <div className="day-controls"><div className="quick-card"><span className="toggle-title">Quick select</span><span className="toggle-copy">Use presets, then adjust individual slots below.</span><div className="quick-actions">
              <button className="btn soft" type="button" onClick={() => applyPreset(day, "morning")}>Morning</button>
              <button className="btn soft" type="button" onClick={() => applyPreset(day, "afternoon")}>Afternoon</button>
              <button className="btn soft" type="button" onClick={() => applyPreset(day, "full")}>Full day</button>
              <button className="btn soft" type="button" onClick={() => applyPreset(day, "clear")}>Clear</button>
            </div></div></div>
            <div className="closed-message">This day is currently unavailable. Turn it back on to allow patients to book selected slots.</div>
            <div className="day-body-content">
              {[["Morning", "8:00 AM - 11:30 AM", morningFrames], ["Afternoon", "12:00 PM - 4:30 PM", afternoonFrames], ["Evening", "5:00 PM - 7:30 PM", eveningFrames]].map(([label, caption, slotFrames]) => <section className="slot-section" key={`${day}-${label}`}>
                <div className="slot-section-head"><h4 className="slot-section-title">{label}</h4><span className="slot-section-caption">{caption}</span></div>
                <div className="slot-grid">{slotFrames.map((time) => <button className={`slot-chip ${selected.includes(time) ? "active" : ""}`.trim()} type="button" disabled={!enabled || saving} aria-pressed={selected.includes(time)} key={time} onClick={() => setDraft((current) => toggleAvailabilityFrame(current, day, time, DEFAULT_SLOT_INTERVAL_MINUTES))}>{formatAvailabilityLabel(time)}</button>)}</div>
              </section>)}
            </div>
          </div>
        </details>;
      })}
      </section>
    </div>
    {hasChanges ? <div className="pharmacist-availability-savebar">
      <button className="btn primary" type="button" disabled={loading || saving} onClick={save}>{saving ? "Saving changes..." : "Save changes"}</button>
    </div> : null}
  </section>;
}

function PharmacistBootSkeleton() {
  return <div className="doctor-flow-shell"><section className="app-shell"><aside className="sidebar"><div className="brand"><SkeletonBox className="skeleton-avatar" /><SkeletonBox className="skeleton-line skeleton-line-md" /></div></aside><main className="main"><div className="page-body"><div className="pharmacist-clinical-dashboard"><SkeletonBox className="skeleton-line skeleton-line-lg" /><div className="doctor-mobile-metric-grid">{[1, 2, 3].map((item) => <div className="doctor-mobile-metric-card" key={item}><SkeletonBox className="skeleton-line skeleton-line-md" /></div>)}</div></div></div></main></section></div>;
}
