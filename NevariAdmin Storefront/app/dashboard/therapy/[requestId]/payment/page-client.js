"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { BrandedSpinner } from "../../../../components/BrandedSpinner";
import { FRONTENDS } from "../../../../components/frontend-config";
import { setDocumentMetadata } from "../../../../components/page-metadata";
import { hydrateStoredSession } from "../../../../components/role-dashboard-utils";
import { fetchMtmBookingContext, fetchMtmRequest } from "../../../../lib/nevari-api";

function resolvePatientSession() {
  const session = hydrateStoredSession("patient");
  const roles = [...(Array.isArray(session?.user?.roles) ? session.user.roles : []), session?.user?.role]
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean);
  return session?.baseUrl && roles.some((role) => ["customer", "patient"].includes(role)) ? session : null;
}

function formatMoney(value, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: String(currency || "NGN").toUpperCase(),
      currencyDisplay: "code",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "NGN"} ${Number(value || 0).toFixed(2)}`;
  }
}

function formatDateTime(value) {
  if (!value) return "Unavailable";
  const normalized = String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function holdRemainingSeconds(value) {
  if (!value) return 0;
  const normalized = String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`;
  const expiresAt = new Date(normalized).getTime();
  return Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0;
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatStatus(value) {
  return String(value || "Pending")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nevariPaymentUrl(value) {
  if (typeof window === "undefined" || !value) return "";
  try {
    const url = new URL(String(value), window.location.origin);
    return /^\/pay\/[^/]+/i.test(url.pathname) ? url.toString() : "";
  } catch {
    return "";
  }
}

function PaymentStatusIcon({ tone = "warning" }) {
  return <span className={`customer-mtm-payment-status-icon is-${tone}`} aria-hidden="true">
    {tone === "success"
      ? <svg viewBox="0 0 24 24" fill="none"><path d="m6.5 12.5 3.4 3.4 7.8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : tone === "failure"
        ? <svg viewBox="0 0 24 24" fill="none"><path d="m8 8 8 8m0-8-8 8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      : <svg viewBox="0 0 24 24" fill="none"><path d="M12 7.5v5m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}
  </span>;
}

export default function MtmPaymentPageClient({ requestId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const requestPath = `/dashboard/therapy/${encodeURIComponent(String(requestId || ""))}/payment`;

  useEffect(() => {
    setDocumentMetadata("MTM Payment | Nevari Patient", "Complete your Medication Therapy Management payment securely.");
    const nextSession = resolvePatientSession();
    setSession(nextSession);
    setResolved(true);
    if (!nextSession) {
      router.replace(`${FRONTENDS.patient.loginPath}?next=${encodeURIComponent(requestPath)}`);
    }
  }, [requestPath, router]);

  const bookingQuery = useSWR(
    session && requestId ? ["customer-mtm-payment", String(requestId), session.baseUrl] : null,
    () => fetchMtmBookingContext(session, requestId),
    {
      revalidateOnFocus: true,
      refreshInterval: (data) => String(data?.payment_state || "") === "pending" ? 5000 : 0,
    }
  );
  const booking = bookingQuery.data || null;
  const paymentState = String(booking?.payment_state || "pending").toLowerCase();
  const slotState = String(booking?.slot_state || "").toLowerCase();
  const paid = ["paid", "quota_reserved"].includes(paymentState);
  const expired = slotState === "unreserved" && Boolean(booking?.slot_hold_expires_at);
  const canPay = paymentState === "pending" && slotState === "reserved_pending_payment";
  const paymentFailed = !paid && (searchParams.get("payment_result") === "failed" || expired);
  const confirmation = paid || paymentFailed;
  const paymentUrl = useMemo(() => nevariPaymentUrl(booking?.payment_url), [booking?.payment_url]);
  const requestQuery = useSWR(
    session && requestId && confirmation ? ["customer-mtm-payment-request", String(requestId), session.baseUrl] : null,
    () => fetchMtmRequest(session, requestId),
    { revalidateOnFocus: true }
  );
  const mtmRequest = requestQuery.data || null;
  const patientName = String(mtmRequest?.patient?.name || session?.user?.display_name || session?.user?.name || "Patient").trim();
  const documentAvailable = mtmRequest?.document?.available === true;
  const attachmentUrl = documentAvailable
    ? `/api/mtm/${encodeURIComponent(String(requestId))}/pdf?baseUrl=${encodeURIComponent(session?.baseUrl || "")}&frontendType=${encodeURIComponent(session?.frontendType || "patient")}`
    : "";

  useEffect(() => {
    if (!canPay || !booking?.slot_hold_expires_at) {
      setRemainingSeconds(0);
      return undefined;
    }
    const updateCountdown = () => {
      const nextSeconds = holdRemainingSeconds(booking.slot_hold_expires_at);
      setRemainingSeconds(nextSeconds);
      if (nextSeconds === 0) bookingQuery.mutate();
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [booking?.slot_hold_expires_at, bookingQuery, canPay]);

  if (!resolved || (session && bookingQuery.isLoading)) {
    return <main className="customer-mtm-payment-page customer-mtm-payment-loading"><BrandedSpinner label="Loading MTM payment" /></main>;
  }
  if (!session) {
    return <main className="customer-mtm-payment-page customer-mtm-payment-loading"><BrandedSpinner label="Opening sign in" /></main>;
  }

  return <main className="customer-mtm-payment-page">
    <section className="customer-mtm-payment-card" aria-live="polite">
      <PaymentStatusIcon tone={paid ? "success" : paymentFailed ? "failure" : "warning"} />

      {!confirmation && canPay ? <div className="customer-mtm-payment-countdown" aria-label="Payment time remaining" aria-live="polite">
        {formatCountdown(remainingSeconds)}
      </div> : null}

      <div className="customer-mtm-payment-copy">
        <h2>{paid ? "Payment Completed" : paymentFailed ? "Your payment failed" : "Complete Payment"}</h2>
      </div>

      {bookingQuery.error ? <div className="customer-mtm-payment-alert" role="alert">
        Payment details could not be loaded.
        <button type="button" onClick={() => bookingQuery.mutate()}>Retry</button>
      </div> : null}

      {booking && !confirmation ? <dl className="customer-mtm-payment-details">
        <div><dt>Request ID</dt><dd>{booking.request_reference || `MTM-${String(requestId).padStart(6, "0")}`}</dd></div>
        <div><dt>Appointment</dt><dd>{formatDateTime(booking.reserved_start_at)}</dd></div>
        <div><dt>Duration</dt><dd>{Number(booking.duration_minutes || 30)} minutes</dd></div>
        <div><dt>Amount</dt><dd>{formatMoney(booking.fee, booking.currency)}</dd></div>
      </dl> : null}

      {booking && confirmation ? <dl className="customer-mtm-payment-details customer-mtm-confirmation-details">
        <div><dt>Request status</dt><dd>{formatStatus(mtmRequest?.status_label || mtmRequest?.status || booking.status)}</dd></div>
        <div><dt>Request ID</dt><dd>{booking.request_reference || `MTM-${String(requestId).padStart(6, "0")}`}</dd></div>
        <div><dt>Patient name</dt><dd>{patientName}</dd></div>
        <div><dt>Appointment</dt><dd>{formatDateTime(booking.reserved_start_at)}</dd></div>
        <div>
          <dt>Attachment</dt>
          <dd>{attachmentUrl
            ? <a className="customer-mtm-payment-download" href={attachmentUrl} download>Download attachment</a>
            : "Not available"}</dd>
        </div>
      </dl> : null}

      <div className="customer-mtm-payment-actions">
        {!confirmation && canPay && paymentUrl ? <button className="customer-mobile-primary-button" type="button" onClick={() => window.location.assign(paymentUrl)}>Complete payment</button> : null}
        {canPay && booking && !paymentUrl ? <p className="customer-mtm-payment-alert" role="alert">Secure Paystack checkout is unavailable. Refresh this page or contact support with your request ID.</p> : null}
        <button className={confirmation ? "customer-mobile-primary-button" : "customer-mobile-secondary-button"} type="button" onClick={() => router.push(`/dashboard/therapy/${encodeURIComponent(String(requestId))}`)}>
          {confirmation ? "View Request Status" : "Go back"}
        </button>
      </div>
    </section>
  </main>;
}
