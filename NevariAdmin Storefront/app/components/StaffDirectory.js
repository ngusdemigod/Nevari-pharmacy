"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { swrKeys, withBaseUrl } from "../../lib/swrKeys";

const labels = { ban: "Ban", unban: "Unban", approve: "Approve", decline: "Decline", suspend: "Suspend", "reset-password": "Reset password" };
const iconPaths = { ban: "M5 5l14 14M7 4h10l2 4v12H5V8l2-4", unban: "M5 12l4 4L19 6", approve: "M5 12l4 4L19 6", decline: "M6 6l12 12M18 6L6 18", suspend: "M9 8l6 8M15 8l-6 8M4 12h3m10 0h3", "reset-password": "M4 12a8 8 0 111.8 5M4 17v-5h5M12 8v5l3 2" };
const roles = [
  ["administrator", "Administrator"],
  ["store_admin", "Store Manager"],
  ["doctor", "Doctor"],
  ["pharmacist", "Pharmacist"],
  ["nurse", "Nurse"]
];
const permissionLabels = {
  products: "Products", orders: "Orders", payments: "Payments", patients: "Patients",
  consultations: "Consultations", mtm: "MTM", "iv-therapy": "IV Therapy",
  "nurse-requests": "Nurse Requests", logs: "Logs", staff: "Staff Management",
  subscriptions: "Subscription Management"
};

function initials(value) {
  return String(value || "Staff").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function numberedPages(page, pages) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  return Array.from({ length: Math.min(5, pages) }, (_, index) => start + index);
}

export default function StaffDirectory({ session }) {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const closeRef = useRef(null);
  const isAdministrator = (session.user?.roles || []).includes("administrator");
  const key = session.baseUrl ? swrKeys.admin.users(withBaseUrl(session, { scope: "staff", page, per_page: 10 })) : null;
  const { data, error, isLoading, mutate } = useSWR(key, async (url) => {
    const response = await fetch(url, { headers: { "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType } });
    const payload = await response.json();
    if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Unable to load staff.");
    return payload.data;
  });
  const rows = Array.isArray(data?.items) ? data.items : [];
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };
  const pages = useMemo(() => numberedPages(Number(pagination.page || page), Number(pagination.pages || 1)), [page, pagination.page, pagination.pages]);

  useEffect(() => {
    mutate();
  }, [page, mutate]);

  useEffect(() => {
    if (!selected) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = overflow; };
  }, [selected]);

  async function requestAction(user, name, extra = {}) {
    setBusy(`${user.user_id}:${name}`);
    setNotice(null);
    try {
      const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)nevari_csrf=([^;]+)/)?.[1] || "");
      const response = await fetch(`/api/admin/users/${user.user_id}/${name}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType, "x-nevari-csrf": csrf },
        body: JSON.stringify({ baseUrl: session.baseUrl, reason: "Storefront administrator action", ...extra })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Unable to update staff.");
      await mutate();
      const updated = payload.data?.user || { ...user, account_status: payload.data?.status || user.account_status };
      setSelected((value) => value ? { ...value, ...updated } : value);
      setNotice({
        tone: payload.data?.notification?.warning ? "warning" : "success",
        message: payload.data?.notification?.warning || (name === "reset-password" ? "Dashboard password reset email sent." : "Staff account updated.")
      });
    } catch (actionError) {
      setNotice({ tone: "error", message: actionError.message || "Unable to update staff." });
    } finally {
      setBusy("");
    }
  }

  function actionButton(user, name) {
    const loading = busy === `${user.user_id}:${name}`;
    return <button key={name} className="staff-action-icon" type="button" aria-label={labels[name]} data-tooltip={loading ? `${labels[name]} in progress` : labels[name]} disabled={Boolean(busy)} onClick={(event) => { event.stopPropagation(); requestAction(user, name); }}>{loading ? <span className="nevari-branded-spinner staff-icon-spinner" aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths[name]} /></svg>}</button>;
  }

  function modalActionButton(user, name, className = "pill-button") {
    const loading = busy === `${user.user_id}:${name}`;
    return <button key={name} className={className} type="button" disabled={Boolean(busy)} onClick={() => requestAction(user, name)}>{loading ? <span className="nevari-branded-spinner staff-button-spinner" aria-label={`${labels[name]} in progress`} /> : null}<span>{labels[name]}</span></button>;
  }

  function avatar(user, large = false) {
    return <span className={`customer-list-avatar ${large ? "staff-modal-avatar" : ""}`}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials(user.display_name || user.user_email)}</span>;
  }

  const modal = selected && typeof document !== "undefined" ? createPortal(
    <div className="staff-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="staff-fullscreen-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title">
        <header className="staff-modal-header">
          <div className="staff-modal-identity">{avatar(selected, true)}<div><p className="section-kicker">Staff details</p><h2 id="staff-modal-title">{selected.display_name}</h2><p>{selected.user_email}</p></div></div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Close staff details" onClick={() => setSelected(null)}>×</button>
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
            <label className="detail-field"><span>Role</span><select value={selected.managed_role === "shop_manager" ? "store_admin" : selected.managed_role} disabled={Boolean(busy)} onChange={(event) => requestAction(selected, "access", { role: event.target.value, permissions: selected.permissions || [] })}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div><h3>Dashboard permissions</h3><p>Remove a tag to revoke access or add an available area.</p>
              <div className="staff-permission-tags">{(selected.permissions || []).map((permission) => <button key={permission} className="staff-permission-tag" type="button" disabled={Boolean(busy) || selected.managed_role === "administrator"} onClick={() => requestAction(selected, "access", { role: selected.managed_role, permissions: selected.permissions.filter((item) => item !== permission) })}>{permissionLabels[permission] || permission}<span aria-hidden="true">×</span></button>)}</div>
              <label className="detail-field"><span>Add permission</span><select defaultValue="" disabled={Boolean(busy)} onChange={(event) => { if (event.target.value) requestAction(selected, "access", { role: selected.managed_role, permissions: [...(selected.permissions || []), event.target.value] }); event.target.value = ""; }}><option value="">Select an area</option>{Object.entries(permissionLabels).filter(([key]) => !(selected.permissions || []).includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
          </section> : null}
          <div className="staff-modal-actions">{selected.account_status === "pending_review" ? <>{modalActionButton(selected, "approve", "pill-button primary")}{modalActionButton(selected, "decline", "pill-button danger")}</> : null}{selected.account_status === "banned" ? modalActionButton(selected, "unban", "pill-button primary") : modalActionButton(selected, "ban", "pill-button danger")}{selected.account_status !== "suspended" ? modalActionButton(selected, "suspend") : null}{modalActionButton(selected, "reset-password")}</div>
        </div>
      </section>
    </div>, document.body
  ) : null;

  return <section className="staff-directory-page"><div className="section-heading"><h2>Nevari Staff</h2></div>
    <section className="panel table-panel staff-directory-panel admin-flat-table-section">
      {error ? <p className="form-error" role="alert">{error.message}</p> : null}
      <div className="table-scroll"><table><thead><tr><th>Staff</th><th>Role</th><th>Last activity</th><th>Status</th><th>Linked Patients</th><th>Actions</th></tr></thead><tbody>
        {isLoading ? Array.from({ length: 6 }, (_, row) => <tr className="table-skeleton-row" key={`staff-skeleton-${row}`}>{Array.from({ length: 6 }, (_, column) => <td key={column}><span className={`skeleton skeleton-line ${column % 2 ? "skeleton-line-md" : "skeleton-line-lg"}`} /></td>)}</tr>) : rows.length ? rows.map((user) => <tr key={user.user_id} className={`table-row-button ${user.account_status === "pending_review" ? "staff-row-review" : ""}`} tabIndex={0} onClick={() => setSelected(user)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(user); }}><td><div className="customer-list-profile">{avatar(user)}<span><strong>{user.display_name}</strong><small>{user.user_email}</small></span></div></td><td>{roles.find(([value]) => value === user.managed_role)?.[1] || user.managed_role}</td><td>{user.last_activity || user.date_joined || "—"}</td><td><span className={`status-pill ${user.account_status === "approved" ? "success" : user.account_status === "pending_review" ? "warning" : "danger"}`}>{user.account_status === "pending_review" ? "Awaiting review" : String(user.account_status).replaceAll("_", " ")}</span></td><td>{user.linked_patients || 0}</td><td><div className="staff-row-actions">{user.account_status === "banned" ? actionButton(user, "unban") : actionButton(user, "ban")}{user.account_status === "pending_review" ? actionButton(user, "approve") : null}{user.account_status !== "suspended" ? actionButton(user, "suspend") : null}{actionButton(user, "reset-password")}</div></td></tr>) : <tr><td colSpan="6">No matching staff.</td></tr>}
      </tbody></table></div>
      <div className="pagination-row"><div className="pagination"><button className="page-item" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Prev</button>{pages.map((value) => <button key={value} className={`page-item ${value === page ? "active" : ""}`} aria-current={value === page ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}<button className="page-item" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div><div className="pagination-summary">Showing {rows.length ? `${((page - 1) * 10) + 1}-${Math.min(page * 10, pagination.total)}` : "0"} of {pagination.total} staff records</div></div>
    </section>{modal}{notice?.message ? <div className={`snackbar ${notice.tone || "info"} staff-snackbar`} role="status" aria-live="polite"><span>{notice.message}</span><button className="auth-snackbar-close" type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div> : null}
  </section>;
}
