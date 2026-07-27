"use client";

import { useState } from "react";
import useSWR from "swr";
import { adminStatusTone } from "./admin-status";

export default function GovernedUsersPanel({ session }) {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const query = new URLSearchParams({ baseUrl: session.baseUrl || "", scope: "staff", page: String(page), per_page: "20" });
  const key = session?.baseUrl ? `/api/admin/users?${query}` : null;
  const { data, error, isLoading, mutate } = useSWR(key, async (url) => {
    const response = await fetch(url, { headers: { "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType } });
    const result = await response.json();
    if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to load users.");
    return result.data;
  });
  const users = Array.isArray(data?.items) ? data.items : [];

  async function act(user, action) {
    const id = `${user.user_id}:${action}`;
    setBusy(id); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.user_id}/${action}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType, "x-nevari-csrf": decodeURIComponent(document.cookie.match(/(?:^|;\s*)nevari_csrf=([^;]+)/)?.[1] || "") },
        body: JSON.stringify({ baseUrl: session.baseUrl, reason: "Store Admin decision" }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to update user.");
      setMessage("User status updated.");
      await mutate();
    } catch (actionError) { setMessage(actionError.message); }
    finally { setBusy(""); }
  }

  const pagination = data?.pagination || { page: 1, pages: 1, total: users.length };
  return <section className="panel table-panel governed-users-panel staff-directory-panel">
    <div className="panel-header">
      <div><h2>Nevari Staffs</h2></div>
    </div>
    {message ? <p className="receipt-feedback" role="status">{message}</p> : null}
    {error ? <p className="form-error" role="alert">{error.message}</p> : null}
    <div className="table-scroll"><table><thead><tr><th>Staff</th><th>Role</th><th>Date joined</th><th>Status</th><th>Linked Patients</th><th>Actions</th></tr></thead><tbody>
      {isLoading ? <tr><td colSpan="5">Loading users…</td></tr> : users.length ? users.map((user) => <tr key={user.user_id}>
        <td><strong>{user.display_name}</strong><br/><small>{user.user_email}</small></td><td>{user.managed_role}</td><td>{user.license_number || "—"}</td><td><span className={`status-pill ${adminStatusTone(user.account_status)}`}>{String(user.account_status).replaceAll("_", " ")}</span></td>
        <td><div className="governed-user-actions">
          {user.managed_role === "nurse" && user.account_status !== "approved" ? <button type="button" className="pill-button" disabled={busy} onClick={() => act(user, "approve")}>{busy === `${user.user_id}:approve` ? "Saving…" : "Approve"}</button> : null}
          {user.managed_role === "nurse" && user.account_status === "pending_review" ? <button type="button" className="pill-button" disabled={busy} onClick={() => act(user, "decline")}>Decline</button> : null}
          {user.account_status === "banned" ? <button type="button" className="pill-button" disabled={busy} onClick={() => act(user, "unban")}>Unban</button> : user.account_status === "approved" ? <button type="button" className="pill-button danger" disabled={busy} onClick={() => act(user, "ban")}>Ban</button> : null}
        </div></td>
      </tr>) : <tr><td colSpan="5">No matching users.</td></tr>}
    </tbody></table></div>
    <div className="pagination-row"><button className="page-item" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button><span className="pagination-summary">Page {pagination.page} of {pagination.pages} · {pagination.total} staff</span><button className="page-item" type="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>
  </section>;
}
