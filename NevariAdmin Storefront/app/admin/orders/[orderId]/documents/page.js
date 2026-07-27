"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { BrandedLoadingScreen } from "../../../../components/BrandedSpinner";
import { FRONTENDS } from "../../../../components/frontend-config";
import { renderDocumentHtml } from "../../../../lib/documentHtml";

const SESSION_MARKER = "server-session";
const DEFAULT_SESSION = {
  baseUrl: "",
  frontendType: FRONTENDS.patient.type,
  frontendOrigin: "",
  frontendUrl: "",
  paired: false,
  siteName: "",
  siteLogo: "",
  accessToken: ""
};

function hydrateSession(frontend = "patient") {
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
    baseUrl: admin.baseUrl || "",
    frontendOrigin: window.location.origin,
    frontendUrl: window.location.href,
    paired: Boolean(admin.paired),
    siteName: admin.siteName || "",
    siteLogo: admin.siteLogo || ""
  } : {};
  return { ...DEFAULT_SESSION, ...shared, ...own, frontendType: config.type, frontendOrigin: window.location.origin, frontendUrl: window.location.href };
}

function buildUrl(session, path) {
  const url = new URL("/api/nevari-proxy", window.location.origin);
  url.searchParams.set("baseUrl", String(session.baseUrl || "").replace(/\/+$/, ""));
  url.searchParams.set("path", path);
  return url.toString();
}

async function request(session, path) {
  const response = await fetch(buildUrl(session, path), {
    headers: {
      Accept: "application/json",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType,
      "X-Nevari-Frontend-Origin": window.location.origin
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const details = payload?.error?.details;
    const suffix = details?.upstream || details?.path ? ` (${details?.upstream || details?.path})` : "";
    throw new Error(payload?.error?.message ? `${payload.error.message}${suffix}` : `Request failed for ${path}.`);
  }
  return payload.data;
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function shortDate(value, withTime = false) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined
  }).format(new Date(value));
}

function titleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseOrderId(orderId, invoiceNumber = "") {
  const numeric = Number(orderId);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const match = String(invoiceNumber || "").match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function buildPaymentUrl(orderId, invoiceNumber, role = "admin", paymentToken = "") {
  if (!paymentToken) return "";
  return `/pay/${encodeURIComponent(invoiceNumber)}?role=${encodeURIComponent(role)}&payment_token=${encodeURIComponent(paymentToken)}`;
}

function withBrandedPaymentUrl(data, role = "admin") {
  if (!data?.invoice_number || !data?.payment_token || typeof window === "undefined") return data;
  const paymentUrl = `${window.location.origin}${buildPaymentUrl(data.order_id, data.invoice_number, role, data.payment_token)}`;
  return { ...data, payment_url: paymentUrl, branded_payment_url: paymentUrl };
}

function normalizeDocumentData(rawOrder, prescription = null, role = "admin") {
  const order = rawOrder || {};
  const orderNumber = order.number || order.id || "";
  const invoiceNumber = `NVH-INV-${String(orderNumber).padStart(5, "0")}`;
  const items = (order.items || []).map((item) => {
    const qty = Number(item.quantity || 1);
    const rate = Number(item.unit_price || item.price || 0);
    return {
      name: item.name || "Item",
      qty,
      rate,
      tax: Number(item.tax_total || 0),
      discount: Number(item.discount_total || 0),
      total: Number(item.total ?? (qty * rate))
    };
  });
  const subtotal = Number(order?.totals?.subtotal || 0);
  const discount = Number(order?.totals?.discount_total || 0);
  const tax = Number(order?.totals?.tax_total || 0);
  const shipping = Number(order?.totals?.shipping_total || 0) + Number(order?.totals?.shipping_tax || 0);
  const amountPaid = Number(order?.totals?.paid_total || 0);
  const total = Number(order?.totals?.grand_total || order?.total || 0);
  const balanceDue = Math.max(0, total - amountPaid);
  return {
    order_id: order.id,
    order_number: orderNumber,
    invoice_number: invoiceNumber,
    receipt_number: `NVH-RCP-${String(orderNumber).padStart(5, "0")}`,
    prescription_number: `NVH-RX-${String(order.prescription_id || order.id || "").padStart(5, "0")}`,
    order_status: String(order.status || ""),
    payment_status: String(order.payment_status || ""),
    payment_url: "",
    branded_payment_url: "",
    invoice_date: order.created_at,
    due_date: order.due_date || order.created_at,
    customer: {
      name: order?.billing ? `${order.billing.first_name || ""} ${order.billing.last_name || ""}`.trim() || "Patient" : "Patient",
      email: order?.billing?.email || "",
      phone: order?.billing?.phone || "",
      address: [order?.billing?.address_1, order?.billing?.address_2, order?.billing?.city, order?.billing?.state, order?.billing?.postcode, order?.billing?.country].filter(Boolean).join(", ")
    },
    items,
    totals: { subtotal, discount, tax, shipping, total, amount_paid: amountPaid, balance_due: balanceDue },
    payment_method: order.payment_method_title || order.payment_method || "",
    payment_reference: order.transaction_id || "",
    diagnosis: prescription?.diagnosis || "",
    doctor_name: prescription?.doctor_name || order?.assigned_doctor?.display_name || "",
    doctor_email: prescription?.doctor_email || order?.assigned_doctor?.email || "",
    doctor_notes: prescription?.instructions || "",
    medications: prescription?.medications || []
  };
}

function OrderDocumentsPageContent() {
  const { orderId } = useParams();
  const searchParams = useSearchParams();
  const previewRef = useRef(null);
  const previewShellRef = useRef(null);
  const role = searchParams.get("role") || "admin";
  const statusMode = searchParams.get("statusMode") === "payment" ? "payment" : "order";
  const queryTab = String(searchParams.get("tab") || "invoice").toLowerCase();
  const activeDocumentType = ["invoice", "receipt", "prescription"].includes(queryTab) ? queryTab : "invoice";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const frontend = role === "doctor" ? "doctor" : role === "patient" ? "patient" : "admin";
        const session = hydrateSession(frontend);
        const endpointOrderId = parseOrderId(String(orderId || ""));
        if (!endpointOrderId) {
          throw new Error("Invalid order ID.");
        }

        let payload = null;
        let documentDataError = null;
        let orderDataError = null;
        try {
          payload = await request(session, `/orders/${endpointOrderId}/document-data`);
        } catch (requestError) {
          documentDataError = requestError;
          payload = null;
        }

        if (!payload) {
          let rawOrder = null;
          try {
            rawOrder = await request(session, `/orders/${endpointOrderId}`);
          } catch (requestError) {
            orderDataError = requestError;
          }
          if (!rawOrder) {
            throw orderDataError || documentDataError || new Error("Could not load order document data.");
          }
          let prescription = null;
          if (rawOrder?.prescription_id) {
            try {
              prescription = await request(session, `/prescriptions/${rawOrder.prescription_id}`);
            } catch {}
          }
          payload = normalizeDocumentData(rawOrder, prescription, role);
        }

        if (mounted) {
          setData(withBrandedPaymentUrl(payload, role));
        }
      } catch (nextError) {
        if (mounted) {
          setError(String(nextError?.message || "Could not load document data."));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [orderId, role]);

  useEffect(() => {
    if (!loading && data && searchParams.get("print") === "1" && typeof window !== "undefined") {
      window.setTimeout(() => printPage(), 500);
    }
  }, [data, loading, searchParams]);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell) return undefined;
    const fitPreview = () => {
      const availableWidth = Math.max(280, shell.clientWidth);
      setPreviewScale(Math.min(1, availableWidth / 850));
    };
    fitPreview();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fitPreview) : null;
    observer?.observe(shell);
    window.addEventListener("resize", fitPreview);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fitPreview);
    };
  }, [data]);

  const documentHtml = useMemo(() => {
    if (!data || typeof window === "undefined") return "";
    return renderDocumentHtml(data, activeDocumentType, { appOrigin: window.location.origin, statusMode });
  }, [data, activeDocumentType, statusMode]);

  function printPage() {
    const frameWindow = previewRef.current?.contentWindow;
    if (frameWindow) {
      frameWindow.focus();
      frameWindow.print();
      return;
    }
    if (typeof window !== "undefined") window.print();
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Loading document data...</main>;
  }
  if (error || !data) {
    return <main style={{ padding: 24, color: "#9f2f2f" }}>{error || "Unable to render documents."}</main>;
  }

  return (
    <main style={{ background: "#f2f5fa", minHeight: "100vh", padding: 20 }}>
      <div className="doc-toolbar">
        <div />
        <div>
          <button className="doc-btn" type="button" onClick={printPage}>Print / Save PDF</button>
        </div>
      </div>
      <div
        ref={previewShellRef}
        className="document-preview-shell"
        style={{ height: `${1120 * previewScale + 24}px` }}
      >
        <iframe
          ref={previewRef}
          className="document-preview"
          title={`${titleCase(activeDocumentType)} preview`}
          srcDoc={documentHtml}
          style={{ transform: `scale(${previewScale})` }}
        />
      </div>
      <style jsx>{`
        :global(:root) { --nevari-primary-blue: #0E2955; }
        .doc-toolbar { max-width: 850px; margin: 0 auto 10px; display: flex; justify-content: space-between; gap: 8px; }
        .doc-btn { border: 1px solid #dce4ef; background: #fff; color: var(--nevari-primary-blue); border-radius: 8px; padding: 9px 14px; font-weight: 700; margin-left: 6px; }
        .doc-btn:disabled { opacity: .6; cursor: wait; }
        .doc-secondary-action { max-width: 850px; margin: 0 auto 10px; text-align: right; }
        .document-preview-shell { width: 100%; max-width: 850px; margin: 0 auto; overflow: hidden; }
        .document-preview { display: block; width: 850px; height: 1120px; margin: 12px 0; transform-origin: top left; background: #fff; border: 0; box-shadow: 0 0 0 1px #dce4ef; }

        @media print {
          .doc-toolbar, .no-print, .doc-secondary-action { display: none !important; }
          main { background: #fff !important; padding: 0 !important; }
          .document-preview { width: 100%; height: 100vh; margin: 0; box-shadow: none; }
          @page { size: A4; margin: 8mm; }
        }
        @media (max-width: 900px) {
          main { padding: 12px !important; }
          .doc-toolbar { flex-direction: column; max-width: 100%; }
          .doc-btn { margin-left: 0; width: 100%; }
          .document-preview-shell { margin-inline: auto; }
        }
      `}</style>
    </main>
  );
}

export default function OrderDocumentsPage() {
  return (
    <Suspense fallback={<BrandedLoadingScreen label="Loading document data" />}>
      <OrderDocumentsPageContent />
    </Suspense>
  );
}
