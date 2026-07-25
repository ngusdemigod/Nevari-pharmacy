"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";

async function getJson(url, session) {
  const response = await fetch(url, { headers: { "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": session.frontendType } });
  const result = await response.json();
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to load care requests.");
  return result.data;
}

export default function NurseRequestAdminPanel({ session }) {
  const [selectedId, setSelectedId] = useState("");
  const [nurseId, setNurseId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const query = new URLSearchParams({ baseUrl: session.baseUrl || "", per_page: "50" });
  const requestsQuery = useSWR(session?.baseUrl ? `/api/admin/care-nurse?${query}` : null, (url) => getJson(url, session), { revalidateOnMount: true, revalidateIfStale: true, dedupingInterval: 0 });
  const nursesQuery = useSWR(session?.baseUrl ? `/api/admin/nurses?${query}` : null, (url) => getJson(url, session), { revalidateOnMount: true, revalidateIfStale: true, dedupingInterval: 0 });
  const requests = requestsQuery.data?.items || [];
  const nurses = nursesQuery.data?.items || [];
  const selected = requests.find((item) => String(item.id) === String(selectedId));
  const documentsPath = selected ? `/nurse-requests/${selected.id}/documents` : "";
  const documentsUrl = selected ? `/api/nevari-proxy?${new URLSearchParams({ baseUrl: session.baseUrl || "", path: documentsPath })}` : null;
  const documentsQuery = useSWR(documentsUrl, (url) => getJson(url, session));
  const documents = documentsQuery.data?.items || [];

  function csrfToken() {
    return decodeURIComponent(document.cookie.match(/(?:^|;\s*)nevari_csrf=([^;]+)/)?.[1] || "");
  }

  async function filePayload(file) {
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    const allowed = { pdf:"application/pdf", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg" };
    if (!allowed[extension] || file.type !== allowed[extension]) throw new Error("Only PDF, PNG, and JPEG files are allowed.");
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Select a non-empty file no larger than 10MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let index=0; index<bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index,index+0x8000));
    return { name:file.name, declared_mime:file.type, content_base64:btoa(binary) };
  }

  async function uploadDocument(file, replaceDocumentId = 0) {
    if (!file || !selected) return;
    setDocumentBusy(true); setDocumentError("");
    try {
      const payload = await filePayload(file);
      if (replaceDocumentId) payload.replace_document_id = replaceDocumentId;
      const response = await fetch(documentsUrl,{method:"POST",headers:{"content-type":"application/json","x-nevari-frontend-origin":window.location.origin,"x-nevari-frontend-type":session.frontendType,"x-nevari-csrf":csrfToken()},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok||!result?.success) throw new Error(result?.error?.message||"Unable to upload document.");
      await documentsQuery.mutate();
    } catch(error){setDocumentError(error.message);} finally{setDocumentBusy(false);}
  }

  async function removeDocument(documentId) {
    setDocumentBusy(true); setDocumentError("");
    try {
      const url=`/api/nevari-proxy?${new URLSearchParams({baseUrl:session.baseUrl||"",path:`${documentsPath}/${documentId}`})}`;
      const response=await fetch(url,{method:"DELETE",headers:{"x-nevari-frontend-origin":window.location.origin,"x-nevari-frontend-type":session.frontendType,"x-nevari-csrf":csrfToken()}});
      const result=await response.json(); if(!response.ok||!result?.success)throw new Error(result?.error?.message||"Unable to remove document.");
      await documentsQuery.mutate();
    }catch(error){setDocumentError(error.message);}finally{setDocumentBusy(false);}
  }

  async function downloadDocument(document) {
    setDocumentError("");
    try {
      const url=`/api/nevari-proxy?${new URLSearchParams({baseUrl:session.baseUrl||"",path:`${documentsPath}/${document.id}/download`})}`;
      const response=await fetch(url,{headers:{"x-nevari-frontend-origin":window.location.origin,"x-nevari-frontend-type":session.frontendType}});
      if(!response.ok)throw new Error("Unable to download document.");
      const blob=await response.blob(); const objectUrl=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=objectUrl; anchor.download=document.name; anchor.click(); URL.revokeObjectURL(objectUrl);
    }catch(error){setDocumentError(error.message);}
  }

  async function transition(status) {
    if (!selected) return;
    setBusy(true); setMessage("");
    try {
      const body = { baseUrl: session.baseUrl, status, patient_safe_message: status === "nurse_assigned" ? "A nurse has been assigned to your request." : "Your nurse visit status has been updated." };
      if (nurseId) body.nurse_user_id = Number(nurseId);
      if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      const response = await fetch(`/api/admin/care/nurse/${selected.id}`, { method:"PATCH", headers:{"content-type":"application/json","x-nevari-frontend-origin":window.location.origin,"x-nevari-frontend-type":session.frontendType}, body:JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to update request.");
      setMessage("Nurse Request updated."); await requestsQuery.mutate();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return <section className="page-view active nurse-requests-page"><section className="panel table-panel admin-flat-table-section">
    <div className="panel-header"><div><p className="section-kicker">Care operations</p><h2>Nurse Requests</h2><p>Every request requires manual nurse selection and scheduling.</p></div></div>
    {message ? <p className="receipt-feedback" role="status">{message}</p> : null}
    {requestsQuery.error ? <p className="form-error">{requestsQuery.error.message}</p> : null}
    <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Patient</th><th>Status</th><th>Assignee</th><th>Schedule</th><th>Action</th></tr></thead><tbody>
      {requestsQuery.isLoading ? Array.from({length:6},(_,row)=><tr className="table-skeleton-row" key={`nurse-skeleton-${row}`}>{Array.from({length:6},(_,column)=><td key={column}><span className={`skeleton skeleton-line ${column%2?"skeleton-line-md":"skeleton-line-lg"}`} /></td>)}</tr>) : requests.length ? requests.map((item) => <tr key={item.id} className="table-row-button" tabIndex={0} onClick={() => { setSelectedId(String(item.id)); setNurseId(String(item.assignee?.id || "")); }}><td>{item.reference}</td><td>{item.patient?.name}</td><td><span className="status-pill warning">{item.status_label}</span></td><td>{item.assignee?.name || "Unassigned"}</td><td>{item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : "Not scheduled"}</td><td><button className="pill-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(String(item.id)); setNurseId(String(item.assignee?.id || "")); }}>Manage</button></td></tr>) : <tr><td colSpan="6">No Nurse Requests.</td></tr>}
    </tbody></table></div>
  </section>
  {selected && typeof document !== "undefined" ? createPortal(<div className="app-modal-layer app-modal-layer-top is-open"><button className="app-modal-backdrop" type="button" aria-label="Close Nurse Request details" onClick={() => setSelectedId("")} /><section className="modal-frame nurse-assignment-panel nurse-request-details-modal detail-flat-modal" role="dialog" aria-modal="true" aria-label="Nurse Request details"><div className="modal-head"><div><p className="section-kicker">{selected.reference}</p><h2>Nurse Request details</h2></div><button className="icon-button" type="button" aria-label="Close Nurse Request details" onClick={() => setSelectedId("")}>×</button></div><div className="modal-body">
    <div className="nurse-assignment-fields"><label><span>Approved nurse</span><select value={nurseId} onChange={(event) => setNurseId(event.target.value)}><option value="">Select nurse</option>{nurses.map((nurse) => <option key={nurse.user_id} value={nurse.user_id}>{nurse.display_name}</option>)}</select></label><label><span>Future visit date and time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label></div>
    <div className="governed-user-actions"><button className="pill-button" type="button" disabled={busy || selected.status !== "submitted"} onClick={() => transition("under_review")}>{busy?<span className="nevari-branded-spinner staff-button-spinner" />:null}Start review</button><button className="button-primary" type="button" disabled={busy || !nurseId || selected.status !== "under_review"} onClick={() => transition("nurse_assigned")}>{busy?<span className="nevari-branded-spinner staff-button-spinner" />:null}Assign nurse</button><button className="button-primary" type="button" disabled={busy || !nurseId || !scheduledAt || selected.status !== "nurse_assigned"} onClick={() => transition("scheduled")}>{busy?<span className="nevari-branded-spinner staff-button-spinner" />:null}Confirm schedule</button><button className="pill-button danger" type="button" disabled={busy || ["completed","cancelled","declined"].includes(selected.status)} onClick={() => transition("cancelled")}>{busy?<span className="nevari-branded-spinner staff-button-spinner" />:null}Cancel</button></div>
    <div className="patient-safe-documents"><div className="panel-header"><div><p className="section-kicker">Patient-safe files</p><h3>Visit documents</h3></div><label className="pill-button">{documentBusy?"Working…":"Upload document"}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden disabled={documentBusy} onChange={(event)=>{const file=event.target.files?.[0];event.target.value="";uploadDocument(file);}} /></label></div>
      {documentError?<p className="form-error" role="alert">{documentError}</p>:null}
      {documentsQuery.isLoading?<p>Loading documents…</p>:documents.length?<div className="patient-safe-document-list">{documents.map((item)=><div className="patient-safe-document-row" key={item.id}><span className="patient-safe-document-name" title={item.name}>{item.name}</span><span>{Math.ceil(item.size/1024)} KB</span><button type="button" className="pill-button" onClick={()=>downloadDocument(item)}>Download</button><label className="pill-button">Replace<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden disabled={documentBusy} onChange={(event)=>{const file=event.target.files?.[0];event.target.value="";uploadDocument(file,item.id);}} /></label><button type="button" className="pill-button danger" disabled={documentBusy} onClick={()=>removeDocument(item.id)}>Remove</button></div>)}</div>:<p className="muted">No patient-safe documents uploaded.</p>}
    </div>
  </div></section></div>, document.body) : null}</section>;
}
