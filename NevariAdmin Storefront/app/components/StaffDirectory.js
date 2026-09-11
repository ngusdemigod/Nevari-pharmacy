"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { swrKeys, withBaseUrl } from "../../lib/swrKeys";
import AdminMetricCards from "./AdminMetricCards";
import { adminStatusTone } from "./admin-status";

const labels = { ban: "Ban", unban: "Unban", approve: "Approve", decline: "Decline", suspend: "Suspend", "reset-password": "Reset password" };
const iconPaths = { ban: "M5 5l14 14M7 4h10l2 4v12H5V8l2-4", unban: "M5 12l4 4L19 6", approve: "M5 12l4 4L19 6", decline: "M6 6l12 12M18 6L6 18", suspend: "M9 8l6 8M15 8l-6 8M4 12h3m10 0h3", "reset-password": "M4 12a8 8 0 111.8 5M4 17v-5h5M12 8v5l3 2" };
const roles = [
  ["store_admin", "Store Manager"],
  ["doctor", "Doctor"],
  ["pharmacist", "Pharmacist"],
  ["nurse", "Nurse"]
];
const permissionLabels = {
  products: "Products", orders: "Orders", payments: "Payments", patients: "Patients",
  consultations: "Consultations", mtm: "MTM", "iv-therapy": "IV Therapy",
  "nurse-requests": "Nurse Requests", logs: "Logs", staff: "Staff Management",
  subscriptions: "Subscription Management", analytics: "Analytics"
};

function canCustomizeDashboardPermissions(role) {
  return ["administrator", "store_admin", "shop_manager"].includes(role === "shop_manager" ? "store_admin" : role);
}

function initials(value) {
  return String(value || "Staff").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function numberedPages(page, pages) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  return Array.from({ length: Math.min(5, pages) }, (_, index) => start + index);
}

export default function StaffDirectory({ session, search = "", refreshRequest = null, onRequestRoleChange = null }) {
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionReason, setActionReason] = useState("");
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const confirmationDialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const isAdministrator = (session.user?.roles || []).includes("administrator");
  const normalizedSearch = String(search || "").trim().slice(0, 100);
  const key = session.baseUrl ? swrKeys.admin.users(withBaseUrl(session, { scope: "staff", page, per_page: 10, search: normalizedSearch, role: roleFilter, status: statusFilter })) : null;
  const { data, error, isLoading, mutate } = useSWR(key, async (url) => {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType }
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Unable to load staff.");
    return payload.data;
  });
  const rows = Array.isArray(data?.items) ? data.items : [];
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const getters = {
      staff: (user) => user.display_name || user.user_email,
      role: (user) => user.managed_role,
      activity: (user) => user.last_activity || user.date_joined,
      status: (user) => user.account_status,
      patients: (user) => Number(user.linked_patients || 0)
    };
    const getter = getters[sort.key];
    if (!getter) return rows;
    const direction = sort.direction === "desc" ? -1 : 1;
    return [...rows].sort((left, right) => String(getter(left) ?? "").localeCompare(String(getter(right) ?? ""), undefined, { numeric: true, sensitivity: "base" }) * direction);
  }, [rows, sort]);
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };
  const pages = useMemo(() => numberedPages(Number(pagination.page || page), Number(pagination.pages || 1)), [page, pagination.page, pagination.pages]);
  const selectedRole = selected?.managed_role === "shop_manager" ? "store_admin" : selected?.managed_role;
  const selectedCanCustomizePermissions = canCustomizeDashboardPermissions(selectedRole);
  const selectedRoleOptions = isAdministrator
    ? [["administrator", "Administrator"], ...roles]
    : roles;
  function sortableHeader(key, label) {
    const active = sort.key === key;
    const direction = active ? sort.direction : "none";
    return <th aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}><button className="sortable-table-header" type="button" onClick={() => setSort({ key, direction: active && sort.direction === "asc" ? "desc" : "asc" })}><span>{label}</span><span className={`sort-direction ${direction}`} aria-hidden="true" /></button></th>;
  }

  function closeModal() {
    setSelected(null);
    setPendingAction(null);
    setActionReason("");
  }

  useEffect(() => {
    mutate();
  }, [page, mutate]);

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    if (!selected) return undefined;
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (pendingAction) {
        if (event.key === "Escape") {
          setPendingAction(null);
          setActionReason("");
          return;
        }
        if (event.key !== "Tab") return;
        const confirmationFocusable = Array.from(confirmationDialogRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
        if (!confirmationFocusable.length) return;
        const confirmationFirst = confirmationFocusable[0];
        const confirmationLast = confirmationFocusable[confirmationFocusable.length - 1];
        if (event.shiftKey && document.activeElement === confirmationFirst) {
          event.preventDefault();
          confirmationLast.focus();
        } else if (!event.shiftKey && document.activeElement === confirmationLast) {
          event.preventDefault();
          confirmationFirst.focus();
        }
        return;
      }
      if (event.key === "Escape") {
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
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
    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      returnFocusRef.current?.focus?.();
    };
  }, [selected, pendingAction]);

  useEffect(() => {
    if (!notice?.message) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 6000 : 3600);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!selected) return;
    const refreshed = rows.find((user) => String(user.user_id) === String(selected.user_id));
    if (refreshed) {
      setSelected((current) => current ? { ...current, ...refreshed } : current);
    }
  }, [rows, selected?.user_id]);

  useEffect(() => {
    if (!refreshRequest?.nonce || !refreshRequest?.userId) return undefined;

    const refreshedUser = refreshRequest.user || {};
    const refreshUserId = String(refreshRequest.userId);
    const patchDirectoryUser = (current) => {
      if (!Array.isArray(current?.items)) return current;
      return {
        ...current,
        items: current.items.map((item) => String(item.user_id || item.id) === refreshUserId
          ? { ...item, ...refreshedUser }
          : item)
      };
    };

    setSelected((current) => String(current?.user_id || current?.id || "") === refreshUserId
      ? { ...current, ...refreshedUser }
      : current);
    void mutate(patchDirectoryUser, { revalidate: true });
    return undefined;
  }, [mutate, refreshRequest]);

  function requestAction(user, name, extra = {}) {
    if (["ban", "suspend", "decline", "reset-password", "access"].includes(name)) {
      setPendingAction({ user, name, extra });
      setActionReason("");
      setNotice(null);
      return;
    }
    void executeAction(user, name, extra, "Storefront administrator action");
  }

  async function executeAction(user, name, extra = {}, reason = "") {
    setBusy(`${user.user_id}:${name}`);
    setNotice(null);
    try {
      const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)nevari_csrf=([^;]+)/)?.[1] || "");
      const response = await fetch(`/api/admin/users/${user.user_id}/${name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType, "x-nevari-csrf": csrf },
        body: JSON.stringify({ baseUrl: session.baseUrl, ...extra, reason: reason || "Storefront administrator action" })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Unable to update staff.");
      const updated = payload.data?.user || { ...user, account_status: payload.data?.status || user.account_status };
      const confirmedUser = { ...user, ...updated };
      const patchDirectoryUser = (current) => {
        if (!Array.isArray(current?.items)) return current;
        return {
          ...current,
          items: current.items.map((item) => String(item.user_id || item.id) === String(user.user_id || user.id)
            ? { ...item, ...confirmedUser }
            : item)
        };
      };
      await mutate(patchDirectoryUser, false);
      setSelected((value) => value ? { ...value, ...confirmedUser } : value);
      try {
        await mutate();
      } catch {
        // The mutation already succeeded; keep the confirmed response visible if refresh is temporarily unavailable.
      }
      await mutate(patchDirectoryUser, false);
      setSelected((value) => value ? { ...value, ...confirmedUser } : value);
      setNotice({
        tone: payload.data?.notification?.warning ? "warning" : "success",
        message: payload.data?.notification?.warning || (name === "reset-password" ? "Dashboard password reset email sent." : "Staff account updated.")
      });
      setPendingAction(null);
      setActionReason("");
    } catch (actionError) {
      setNotice({ tone: "error", message: actionError.message || "Unable to update staff." });
    } finally {
      setBusy("");
    }
  }

  function submitPendingAction(event) {
    event.preventDefault();
    const reason = actionReason.trim();
    if (!pendingAction || !reason) return;
    void executeAction(pendingAction.user, pendingAction.name, pendingAction.extra, reason);
  }

  function changeSelectedRole(user, role) {
    if (typeof onRequestRoleChange !== "function") {
      setNotice({ tone: "error", message: "Two-factor role verification is unavailable. Reload the dashboard and try again." });
      return;
    }
    onRequestRoleChange(user, role);
  }

  function actionButton(user, name) {
    const loading = busy === `${user.user_id}:${name}`;
    return <button key={name} className={`staff-action-icon staff-action-${name}`} type="button" aria-label={labels[name]} data-tooltip={loading ? `${labels[name]} in progress` : labels[name]} disabled={Boolean(busy)} onClick={(event) => { event.stopPropagation(); requestAction(user, name); }}>{loading ? <span className="nevari-branded-spinner staff-icon-spinner" aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths[name]} /></svg>}</button>;
  }

  function modalActionButton(user, name, className = "pill-button staff-modal-action") {
    const loading = busy === `${user.user_id}:${name}`;
    return <button key={name} className={`${className} staff-action-${name}`} type="button" disabled={Boolean(busy)} onClick={() => requestAction(user, name)}>{loading ? <span className="nevari-branded-spinner staff-button-spinner" aria-label={`${labels[name]} in progress`} /> : null}<span>{labels[name]}</span></button>;
  }

  function avatar(user, large = false) {
    return <span className={`customer-list-avatar ${large ? "staff-modal-avatar" : ""}`}>{user.avatar_url ? <img src={user.avatar_url} alt={`${user.display_name || "Staff"} profile`} /> : initials(user.display_name || user.user_email)}</span>;
  }

  const modal = selected && typeof document !== "undefined" ? createPortal(
    <div className="staff-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <section ref={dialogRef} className="staff-fullscreen-modal detail-flat-modal staff-directory-detail-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title">
        <header className="staff-modal-header">
          <div className="staff-modal-identity">{avatar(selected, true)}<div><p className="section-kicker">Staff details</p><h2 id="staff-modal-title">{selected.display_name}</h2><p>{selected.user_email}</p></div></div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Close staff details" onClick={closeModal}>×</button>
        </header>
        <div className="staff-modal-body">
          <dl className="staff-detail-grid">
            <div><dt>Status</dt><dd>{String(selected.account_status || "approved").replaceAll("_", " ")}</dd></div>
            <div><dt>Date joined</dt><dd>{selected.date_joined || "—"}</dd></div>
            <div><dt>Last activity</dt><dd>{selected.last_activity || selected.date_joined || "—"}</dd></div>
            <div><dt>Phone</dt><dd>{selected.phone || "—"}</dd></div>
            <div><dt>License</dt><dd>{selected.license_number || "—"}</dd></div>
            <div><dt>Linked patients</dt><dd>{selected.linked_patients || 0}</dd></div>
          </dl>
          {isAdministrator ? <section className="staff-access-section">
            <label className="detail-field"><span>Role</span><select value={selected.managed_role === "shop_manager" ? "store_admin" : selected.managed_role} disabled={Boolean(busy)} onChange={(event) => changeSelectedRole(selected, event.target.value)}>{selectedRoleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {selectedCanCustomizePermissions ? <div><h3>Dashboard permissions</h3><p>Remove a tag to revoke access or add an available area.</p>
              <div className="staff-permission-tags">{(selected.permissions || []).map((permission) => <button key={permission} className="staff-permission-tag" type="button" disabled={Boolean(busy) || selected.managed_role === "administrator"} onClick={() => requestAction(selected, "access", { role: selected.managed_role, permissions: selected.permissions.filter((item) => item !== permission) })}>{permissionLabels[permission] || permission}<span aria-hidden="true">×</span></button>)}</div>
              <label className="detail-field"><span>Add permission</span><select defaultValue="" disabled={Boolean(busy)} onChange={(event) => { if (event.target.value) requestAction(selected, "access", { role: selected.managed_role, permissions: [...(selected.permissions || []), event.target.value] }); event.target.value = ""; }}><option value="">Select an area</option>{Object.entries(permissionLabels).filter(([key]) => !(selected.permissions || []).includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div> : <div className="staff-permission-restriction"><h3>Role-based dashboard access</h3><p>Custom dashboard permissions are available only to Administrator and Store Manager roles. This role uses its protected default access.</p></div>}
          </section> : null}
          {notice?.message ? <p className={`staff-modal-notice ${notice.tone || "info"}`} role="status" aria-live="polite">{notice.message}</p> : null}
          <div className="staff-modal-actions">{selected.account_status === "pending_review" ? <>{modalActionButton(selected, "approve")}{modalActionButton(selected, "decline")}</> : null}{selected.account_status === "banned" ? modalActionButton(selected, "unban") : modalActionButton(selected, "ban")}{selected.account_status !== "suspended" ? modalActionButton(selected, "suspend") : null}{modalActionButton(selected, "reset-password")}</div>
        </div>
      </section>
    </div>, document.body
  ) : null;

  const confirmationModal = pendingAction && typeof document !== "undefined" ? createPortal(
    <div className="staff-confirmation-overlay" role="presentation">
      <section ref={confirmationDialogRef} className="staff-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="staff-confirmation-title" aria-describedby="staff-confirmation-description">
        <form className="staff-action-confirmation" onSubmit={submitPendingAction}>
          <div><strong id="staff-confirmation-title">Confirm {labels[pendingAction.name]?.toLowerCase() || "access change"}</strong><p id="staff-confirmation-description">This action is recorded in the security audit log.</p></div>
          <label><span>Reason</span><textarea autoFocus required maxLength={500} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Enter the reason for this action" /></label>
          <div className="staff-action-confirmation-buttons"><button className="pill-button" type="button" disabled={Boolean(busy)} onClick={() => { setPendingAction(null); setActionReason(""); }}>Cancel</button><button className="pill-button primary" type="submit" disabled={Boolean(busy) || !actionReason.trim()}>{busy ? <span className="nevari-branded-spinner staff-button-spinner" aria-label="Updating staff account" /> : null}<span>Confirm</span></button></div>
        </form>
      </section>
    </div>, document.body
  ) : null;

  const staffMetrics = [
    { label: "Total staff", value: pagination.total || rows.length, note: "Staff accounts in the directory", icon: "users" },
    { label: "Active staff", value: rows.filter((user) => user.account_status === "approved").length, note: "Approved accounts on this page", icon: "userCheck" },
    { label: "Pending review", value: rows.filter((user) => user.account_status === "pending_review").length, note: "Accounts awaiting approval", icon: "clockAlert" },
    { label: "Linked patients", value: rows.reduce((total, user) => total + Number(user.linked_patients || 0), 0), note: "Patient links on this page", icon: "userLinks" },
  ];

  return <section className="staff-directory-page">
    <AdminMetricCards cards={staffMetrics} ariaLabel="Staff metrics" loading={isLoading} />
    <div className="segmented-mini nevari-storefront-tabs" aria-label="Staff directory filters">
      <label><span className="sr-only">Filter staff by role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="sr-only">Filter staff by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="approved">Approved</option><option value="pending_review">Pending review</option><option value="suspended">Suspended</option><option value="banned">Banned</option><option value="declined">Declined</option></select></label>
    </div>
    <section className="panel table-panel staff-directory-panel admin-flat-table-section">
      {error ? <p className="form-error" role="alert">{error.message}</p> : null}
      <div className="table-scroll"><table><thead><tr>{sortableHeader("staff", "Staff")}{sortableHeader("role", "Role")}{sortableHeader("activity", "Last activity")}{sortableHeader("status", "Status")}{sortableHeader("patients", "Linked Patients")}<th>Actions</th></tr></thead><tbody>
        {isLoading ? Array.from({ length: 6 }, (_, row) => <tr className="table-skeleton-row" key={`staff-skeleton-${row}`}>{Array.from({ length: 6 }, (_, column) => <td key={column}><span className={`skeleton skeleton-line ${column % 2 ? "skeleton-line-md" : "skeleton-line-lg"}`} /></td>)}</tr>) : sortedRows.length ? sortedRows.map((user) => <tr key={user.user_id} className={`table-row-button ${user.account_status === "pending_review" ? "staff-row-review" : ""}`} tabIndex={0} onClick={() => setSelected(user)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(user); }}><td><div className="customer-list-profile">{avatar(user)}<span><strong>{user.display_name}</strong><small>{user.user_email}</small></span></div></td><td>{roles.find(([value]) => value === user.managed_role)?.[1] || user.managed_role}</td><td>{user.last_activity || user.date_joined || "—"}</td><td><span className={`status-pill ${adminStatusTone(user.account_status)}`}>{user.account_status === "pending_review" ? "Awaiting review" : String(user.account_status).replaceAll("_", " ")}</span></td><td>{user.linked_patients || 0}</td><td><div className="staff-row-actions">{user.account_status === "banned" ? actionButton(user, "unban") : actionButton(user, "ban")}{user.account_status === "pending_review" ? actionButton(user, "approve") : null}{user.account_status !== "suspended" ? actionButton(user, "suspend") : null}{actionButton(user, "reset-password")}</div></td></tr>) : <tr><td colSpan="6">No matching staff.</td></tr>}
      </tbody></table></div>
      <div className="pagination-row"><div className="pagination"><button className="page-item" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Prev</button>{pages.map((value) => <button key={value} className={`page-item ${value === page ? "active" : ""}`} aria-current={value === page ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}<button className="page-item" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div><div className="pagination-summary">Showing {rows.length ? `${((page - 1) * 10) + 1}-${Math.min(page * 10, pagination.total)}` : "0"} of {pagination.total} staff records</div></div>
    </section>{modal}{confirmationModal}{notice?.message ? <div className={`snackbar ${notice.tone || "info"} staff-snackbar`} role="status" aria-live="polite"><span>{notice.message}</span><button className="auth-snackbar-close" type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div> : null}
  </section>;
}
