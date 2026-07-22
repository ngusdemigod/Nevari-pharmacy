"use client";

import { useState } from "react";
import useSWR from "swr";

export default function GovernedUsersPanel({ session }) {
  const [role, setRole] = useState("nurse");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const query = new URLSearchParams({ baseUrl: session.baseUrl || "", role, per_page: "50" });
  if (status) query.set("status", status);
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
        headers: { "content-type": "application/json", "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType },
        body: JSON.stringify({ baseUrl: session.baseUrl, reason: "Store Admin decision" }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to update user.");
      setMessage("User status updated.");
      await mutate();
    } catch (actionError) { setMessage(actionError.message); }
    finally { setBusy(""); }
  }

  return <section className="panel table-panel governed-users-panel">
    <div className="panel-header">
      <div><p className="section-kicker">User governance</p><h2>Nurse applications and account access</h2></div>
      <div className="governed-user-filters">
        <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="nurse">Nurses</option><option value="patient">Patients</option><option value="doctor">Doctors</option><option value="pharmacist">Pharmacists</option></select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="banned">Banned</option></select></label>
      </div>
    </div>
    {message ? <p className="receipt-feedback" role="status">{message}</p> : null}
    {error ? <p className="form-error" role="alert">{error.message}</p> : null}
    <div className="table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Licence</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {isLoading ? <tr><td colSpan="5">Loading users…</td></tr> : users.length ? users.map((user) => <tr key={user.user_id}>
        <td><strong>{user.display_name}</strong><br/><small>{user.user_email}</small></td><td>{user.managed_role}</td><td>{user.license_number || "—"}</td><td><span className={`status-pill ${user.account_status === "approved" ? "success" : user.account_status === "pending_review" ? "warning" : "danger"}`}>{String(user.account_status).replaceAll("_", " ")}</span></td>
        <td><div className="governed-user-actions">
          {user.managed_role === "nurse" && user.account_status !== "approved" ? <button type="button" className="pill-button" disabled={busy} onClick={() => act(user, "approve")}>{busy === `${user.user_id}:approve` ? "Saving…" : "Approve"}</button> : null}
          {user.managed_role === "nurse" && user.account_status === "pending_review" ? <button type="button" className="pill-button" disabled={busy} onClick={() => act(user, "decline")}>Decline</button> : null}
          {user.account_status === "banned" ? <button type="button" className="pill-button" disabled={busy} onClick={() => act(user, "unban")}>Unban</button> : user.account_status === "approved" ? <button type="button" className="pill-button danger" disabled={busy} onClick={() => act(user, "ban")}>Ban</button> : null}
        </div></td>
      </tr>) : <tr><td colSpan="5">No matching users.</td></tr>}
    </tbody></table></div>
  </section>;
}
