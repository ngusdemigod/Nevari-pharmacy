"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BrandedLoadingScreen } from "../../components/BrandedSpinner";
import { DEFAULT_NEVARI_BASE_URL, FRONTENDS } from "../../components/frontend-config";

const SESSION_MARKER = "server-session";
const DEFAULT_SESSION = {
  baseUrl: String(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL).trim().replace(/\/+$/, ""),
  frontendType: FRONTENDS.patient.type,
  frontendOrigin: "",
  frontendUrl: "",
  accessToken: ""
};

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function hydrateSession(frontend = "patient", queryBaseUrl = "") {
  if (typeof window === "undefined") return DEFAULT_SESSION;
  const config = FRONTENDS[frontend] || FRONTENDS.patient;
  const own = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
  if (own.accessToken && own.accessToken !== SESSION_MARKER) {
    own.accessToken = "";
    own.refreshToken = "";
    own.expiresAt = 0;
    own.user = null;
    localStorage.setItem(config.storageKey, JSON.stringify(own));
  }
  const admin = JSON.parse(localStorage.getItem(FRONTENDS.admin.storageKey) || "{}");
  const shared = config.type !== FRONTENDS.admin.type ? {
    baseUrl: normalizeBaseUrl(queryBaseUrl) || normalizeBaseUrl(admin.baseUrl) || DEFAULT_SESSION.baseUrl,
    frontendOrigin: window.location.origin,
    frontendUrl: window.location.href
  } : {};
  return {
    ...DEFAULT_SESSION,
    ...shared,
    ...own,
    baseUrl: normalizeBaseUrl(queryBaseUrl) || normalizeBaseUrl(own.baseUrl) || normalizeBaseUrl(shared.baseUrl) || DEFAULT_SESSION.baseUrl,
    frontendType: config.type,
    frontendOrigin: window.location.origin,
    frontendUrl: window.location.href
  };
}

function buildUrl(session, path, params = null) {
  const url = new URL("/api/nevari-proxy", window.location.origin);
  url.searchParams.set("baseUrl", String(session.baseUrl || "").replace(/\/+$/, ""));
  url.searchParams.set("path", path);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function request(session, path, { method = "GET", body, params } = {}) {
  const response = await fetch(buildUrl(session, path, params), {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType,
      "X-Nevari-Frontend-Origin": window.location.origin
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "Request failed.");
  }
  return payload.data;
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function titleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ordinal(index) {
  return ["1st", "2nd", "3rd"][index] || `${index + 1}th`;
}

function callbackReference(searchParams, gateway) {
  if (gateway === "flutterwave") {
    return searchParams.get("tx_ref") || searchParams.get("reference") || searchParams.get("transaction_id") || "";
  }
  return searchParams.get("reference") || searchParams.get("trxref") || searchParams.get("session_id") || "";
}

function InlineSpinner() {
  return <span className="paywall-spinner" aria-label="Loading payment details" />;
}

function PaywallPageContent() {
  const { invoiceRef } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [session, setSession] = useState(DEFAULT_SESSION);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeGateway, setActiveGateway] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const paymentToken = searchParams.get("payment_token") || "";

  useEffect(() => {
    const role = searchParams.get("role") || "patient";
    const frontend = role === "admin" ? "admin" : role === "doctor" ? "doctor" : "patient";
    setSession(hydrateSession(frontend, searchParams.get("base_url") || ""));
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      if (!session.baseUrl) {
        if (active) {
          setData(null);
          setError("Payment page is missing the store connection details. Reopen the payment link from your dashboard or configure the store base URL.");
          setLoading(false);
        }
        return;
      }
      try {
        const payload = await request(session, `/invoices/${encodeURIComponent(String(invoiceRef || ""))}/payment-data`, {
          params: { payment_token: paymentToken }
        });
        if (!active) return;
        const status = String(payload.payment_status || payload.order_status || "").toLowerCase();
        const terminal = ["paid", "completed", "cancelled", "refunded"].includes(status) || Number(payload?.totals?.balance_due || 0) <= 0;
        if (terminal) {
          setData(payload);
          openPaymentSuccess(payload);
          return;
        }
        setData(payload);
        setActiveGateway(payload.available_gateways?.[0] || "");
      } catch (nextError) {
        if (active) setError(String(nextError?.message || "Payment data could not be loaded."));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [invoiceRef, router, searchParams, session]);

  useEffect(() => {
    let active = true;
    async function verifyRedirect() {
        if (!session.baseUrl || !(data?.order_id || data?.appointment_id)) return;
        const gateway = searchParams.get("gateway");
        const reference = callbackReference(searchParams, gateway);
        if (!gateway || !reference) return;
        setSubmitting(true);
        setError("");
        try {
          const path = data?.entity_type === "appointment"
            ? `/appointments/${data.appointment_id}/payment/verify`
            : `/orders/${data.order_id}/payment/verify`;
          const verified = await request(session, path, {
            method: "POST",
            body: { gateway, reference, payment_token: paymentToken }
          });
          if (active && verified?.paid) {
            openPaymentSuccess(data);
          }
      } catch (nextError) {
        if (active) setError(String(nextError?.message || "Payment verification failed."));
      } finally {
        if (active) setSubmitting(false);
      }
    }
    verifyRedirect();
    return () => {
      active = false;
    };
  }, [data, router, searchParams, session]);

  const gateways = useMemo(() => data?.available_gateways || [], [data]);
  const items = useMemo(() => data?.items || [], [data]);

  function receiptViewerUrl(orderId) {
    const role = searchParams.get("role") || "patient";
    return `/admin/orders/${encodeURIComponent(orderId)}/documents?role=${encodeURIComponent(role)}&tab=receipt&statusMode=payment`;
  }

  function openPaymentSuccess(payload) {
    if (payload?.entity_type === "appointment") {
      const role = searchParams.get("role") || "patient";
      const dashboardPath = role === "doctor" ? "/admin/doctor/dashboard" : role === "admin" ? "/admin/storefront" : "/dashboard";
      const appointmentId = payload?.appointment_id || data?.appointment_id || "";
      const appointmentQuery = appointmentId ? `?appointment=${encodeURIComponent(String(appointmentId))}` : "";
      window.location.href = `${dashboardPath}${appointmentQuery}`;
      return;
    }
    if (payload?.order_id) {
      window.location.href = receiptViewerUrl(payload.order_id);
    }
  }

  async function startPayment(gateway = activeGateway) {
    if (!(data?.order_id || data?.appointment_id) || !gateway) return;
    setActiveGateway(gateway);
    setSubmitting(true);
    setError("");
    try {
      const callbackParams = new URLSearchParams({
        role: searchParams.get("role") || "patient",
        gateway,
        payment_token: paymentToken
      });
      if (session.baseUrl) {
        callbackParams.set("base_url", session.baseUrl);
      }
      const callbackUrl = `${window.location.origin}/pay/${encodeURIComponent(data.invoice_number)}?${callbackParams.toString()}`;
      const path = data?.entity_type === "appointment"
        ? `/appointments/${data.appointment_id}/payment/initialize`
        : `/orders/${data.order_id}/payment/initialize`;
      const payload = await request(session, path, {
        method: "POST",
        body: { gateway, callback_url: callbackUrl, payment_token: paymentToken }
      });
      if (!payload?.payment_url) {
        throw new Error("Gateway did not return a payment URL.");
      }
      window.location.href = payload.payment_url;
    } catch (nextError) {
      setError(String(nextError?.message || "Payment could not be started."));
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="paywall-page"><section className="paywall-card paywall-card-loading"><InlineSpinner /></section></main>;
  }
  if (error && !data) {
    return <main className="paywall-page"><section className="paywall-card error">{error}</section></main>;
  }
  if (!data) {
    return <main className="paywall-page"><section className="paywall-card paywall-card-loading"><InlineSpinner /></section></main>;
  }

  return (
    <main className="paywall-page">
      <section className="paywall-card">
        <img src="/ne.webp" alt="Nevari" className="paywall-logo" />
        <p className="paywall-kicker">Secure invoice payment</p>
        <h1>{data.invoice_number}</h1>
        <div className="paywall-grid">
          <span>Patient</span><strong>{data.customer?.name || "Patient"}</strong>
          <span>Email</span><strong>{data.customer?.email || "n/a"}</strong>
            <span>{data?.entity_type === "appointment" ? "Appointment" : "Order"}</span><strong>{data?.entity_type === "appointment" ? `#${data.appointment_id}` : `#${data.order_number || data.order_id}`}</strong>
          <span>Status</span><strong>{titleCase(data.payment_status || data.order_status)}</strong>
          <span>Total</span><strong>{money(data?.totals?.total, data.currency)}</strong>
          <span>Balance due</span><strong>{money(data?.totals?.balance_due, data.currency)}</strong>
        </div>
        <div className="paywall-items">
            <h2>{data?.entity_type === "appointment" ? "Appointment details" : "Order items"}</h2>
          {items.length ? items.map((item, index) => (
            <div className="paywall-item" key={`${item.name || "item"}-${index}`}>
              <span>{item.name || "Item"} x {item.qty || item.quantity || 1}</span>
              <strong>{money(item.total ?? item.rate ?? item.price, data.currency)}</strong>
            </div>
            )) : <p className="paywall-muted">No line items were returned for this invoice.</p>}
        </div>
        <div className="gateway-list">
          {gateways.map((gateway, index) => (
            <button className="gateway-button active" type="button" key={gateway} onClick={() => startPayment(gateway)} disabled={submitting}>
              {submitting && activeGateway === gateway ? "Starting payment..." : gateways.length === 1 ? "Make payment" : `Pay with ${ordinal(index)} ${titleCase(gateway)}`}
            </button>
          ))}
        </div>
        {!gateways.length ? <p className="paywall-error">No payment method is configured for this invoice yet.</p> : null}
        {error ? <p className="paywall-error">{error}</p> : null}
      </section>
      <style jsx>{`
        .paywall-page { min-height: 100vh; background: #f4f6f8; padding: 24px; color: #111; box-sizing: border-box; overflow-y: auto; }
        .paywall-card { width: min(520px, 100%); margin: 0 auto; background: #fff; padding: 36px; border: 1px solid #dfe7f0; box-shadow: 0 24px 80px rgba(14, 41, 85, .12); box-sizing: border-box; }
        .paywall-card-loading { min-height: 220px; display: grid; place-items: center; }
        .paywall-card.error { color: #9f2f2f; }
        .paywall-spinner {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 2px solid rgba(14, 41, 85, 0.18);
          border-top-color: #0E2955;
          animation: paywallSpin .72s linear infinite;
        }
        .paywall-logo { width: 72px; height: 72px; object-fit: contain; }
        .paywall-kicker { margin-top: 18px; color: #0E2955; text-transform: uppercase; font-weight: 700; font-size: 12px; }
        h1 { margin: 8px 0 24px; color: #0E2955; font-size: 36px; line-height: 1.1; overflow-wrap: anywhere; }
        .paywall-grid { display: grid; grid-template-columns: 130px 1fr; gap: 8px 18px; margin-bottom: 24px; }
        .paywall-grid span { color: #7c8796; min-width: 0; }
        .paywall-grid strong { text-align: right; min-width: 0; overflow-wrap: anywhere; }
        .paywall-items { border-top: 1px solid #e4eaf2; border-bottom: 1px solid #e4eaf2; padding: 16px 0; margin-bottom: 20px; }
        .paywall-items h2 { margin: 0 0 10px; color: #0E2955; font-size: 16px; }
        .paywall-item { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; color: #1f2a37; }
        .paywall-item span { min-width: 0; overflow-wrap: anywhere; }
        .paywall-item strong { white-space: nowrap; }
        .paywall-muted { margin: 0; color: #7c8796; }
        .gateway-list { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 18px; }
        .gateway-button { border: 1px solid #0E2955; background: #0E2955; color: #fff; padding: 14px 18px; font-weight: 800; border-radius: 8px; font-size: 15px; }
        .gateway-button:disabled { opacity: .65; cursor: wait; }
        .paywall-error { margin-top: 14px; color: #9f2f2f; font-weight: 700; }
        @keyframes paywallSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 720px) {
          .paywall-page { padding: 12px; }
          .paywall-card { padding: 18px; }
          h1 { font-size: 26px; margin-bottom: 16px; }
          .paywall-grid { grid-template-columns: 1fr; gap: 4px; }
          .paywall-grid strong { text-align: left; margin-bottom: 8px; }
          .gateway-button { width: 100%; }
        }
      `}</style>
    </main>
  );
}

export default function PaywallPage() {
  return (
    <Suspense fallback={<BrandedLoadingScreen label="Loading payment details" />}>
      <PaywallPageContent />
    </Suspense>
  );
}
