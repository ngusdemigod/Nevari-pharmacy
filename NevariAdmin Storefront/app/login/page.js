"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "nevari_admin_storefront_session";
const API_NAMESPACE = "nevari/v1";
const FRONTEND_TYPE = "storefront";
const DEFAULT_SITE_NAME = "Nevari Pharmacy";

const LEGACY_PAGE_ALIASES = {
  queue: "orders",
  communications: "emails",
  team: "doctors",
  catalog: "products"
};

const FRONTEND_PAGES = [
  {
    label: "Command",
    items: [
      ["overview", "Overview", "i-layout"],
      ["orders", "Orders", "i-cart"],
      ["payments", "Payments", "i-credit-card"],
      ["customers", "Customers", "i-users"]
    ]
  },
  {
    label: "Care Ops",
    items: [
      ["consultations", "Consultations", "i-stethoscope"],
      ["prescriptions", "Prescriptions", "i-clipboard"],
      ["products", "Products", "i-pill"],
      ["doctors", "Doctors", "i-briefcase-medical"]
    ]
  },
  {
    label: "Trust",
    items: [
      ["emails", "Emails", "i-mail"],
      ["audit", "Audit Center", "i-shield"],
      ["settings", "Settings", "i-settings"]
    ]
  }
];

const SEARCH_PLACEHOLDERS = {
  orders: "Search orders",
  payments: "Search payments",
  customers: "Search patients",
  consultations: "Search appointments",
  prescriptions: "Search prescriptions",
  products: "Search products",
  doctors: "Search doctors",
  emails: "Search emails",
  audit: "Search audit events",
  settings: "Search settings",
  profile: "Search profile"
};

function defaultSession() {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  const href = hasWindow ? window.location.href : "";

  return {
    baseUrl: "",
    frontendType: FRONTEND_TYPE,
    frontendOrigin: origin === "null" ? "null" : origin,
    frontendUrl: origin === "null" ? "null" : href,
    paired: false,
    siteName: "",
    siteLogo: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  };
}

function emptyData() {
  return {
    dashboard: null,
    orders: [],
    orderDetails: [],
    appointments: [],
    prescriptions: [],
    prescriptionDetails: [],
    prescriptionHistory: [],
    emails: [],
    doctors: [],
    products: [],
    auditEvents: []
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePairingCode(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/NV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9]+/i);
  return match ? match[0] : raw;
}

function decodePairingBaseUrl(pairingCode) {
  const normalizedCode = normalizePairingCode(pairingCode);
  const parts = normalizedCode.split(".");
  if (parts.length < 3) {
    throw new Error("Pairing code is incomplete. Paste the full code from WordPress.");
  }

  const [version, encodedBaseUrl, secret] = parts;
  if (version.toUpperCase() !== "NV1" || !encodedBaseUrl || !secret) {
    throw new Error("Pairing code format is invalid.");
  }

  const base64 = encodedBaseUrl.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  let decoded = "";

  try {
    decoded = atob(padded);
  } catch {
    throw new Error("Pairing code format is invalid. Generate a new code and paste it exactly as shown in WordPress.");
  }

  const baseUrl = normalizeBaseUrl(decoded);
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("Pairing code did not contain a valid pharmacy URL.");
  }

  return baseUrl;
}

function formatMoney(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDate(value, withTime = false) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined
  }).format(date);
}

function formatStatusLabel(value) {
  return String(value || "n/a")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function joinNonEmpty(values, separator = " ") {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
}

function customerFullName(order) {
  const shippingName = joinNonEmpty([order?.shipping?.first_name, order?.shipping?.last_name]);
  if (shippingName) {
    return shippingName;
  }
  const billingName = joinNonEmpty([order?.billing?.first_name, order?.billing?.last_name]);
  return billingName || patientLabel(order?.customer_id);
}

function formatAddress(address) {
  if (!address) {
    return "No delivery address on file";
  }

  const lines = [
    joinNonEmpty([address.first_name, address.last_name]),
    address.company,
    joinNonEmpty([address.address_1, address.address_2]),
    joinNonEmpty([address.city, address.state, address.postcode], ", "),
    address.country
  ].filter(Boolean);

  return lines.length ? lines.join(", ") : "No delivery address on file";
}

function itemQuantityTotal(order) {
  if (order?.totals?.items_quantity !== undefined && order?.totals?.items_quantity !== null) {
    return Number(order.totals.items_quantity);
  }
  return (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function formatTopbarDate() {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function formatLiveLabel(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function toneClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["success", "fulfilled", "completed", "sent", "processing", "released", "trusted", "confirmed", "active"].includes(normalized)) {
    return "success";
  }
  if (["error", "failed", "cancelled", "invalid", "forbidden", "revoked"].includes(normalized)) {
    return "error";
  }
  if (["warning", "on_hold", "on-hold", "pending", "draft", "requested", "issued", "assigned_to_patient", "expired", "queued"].includes(normalized)) {
    return "warning";
  }
  return "info";
}

function patientLabel(userId) {
  return userId ? `Customer #${userId}` : "Guest checkout";
}

function normalizePageId(pageId) {
  return LEGACY_PAGE_ALIASES[pageId] || pageId || "overview";
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function safeNumber(value) {
  return Number(value || 0);
}

function getInitials(value) {
  return String(value || "NP")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "NP";
}

function isFileProtocol() {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

function describeRequestError(error) {
  const message = String(error?.message || "");
  if (!message || message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.") {
    if (isFileProtocol()) {
      return "Network request failed. This storefront is being opened with file://, which often breaks WordPress API requests. Serve this folder over http://localhost and verify the pharmacy CORS settings allow that origin.";
    }
    return "Network request failed. Verify the pharmacy URL is reachable and that the Nevari WordPress plugin allows this frontend origin.";
  }
  return message;
}

function extractApiErrorMessage(payload) {
  if (payload?.error?.message) {
    return String(payload.error.message);
  }
  if (payload?.message) {
    return String(payload.message);
  }
  return "";
}

function isRouteMissingPayload(payload) {
  return payload?.code === "rest_no_route" || payload?.error?.code === "rest_no_route";
}

function frontendContext(session) {
  return {
    frontend_type: session.frontendType,
    frontend_origin: session.frontendOrigin,
    frontend_url: session.frontendUrl
  };
}

function buildUrl(session, path, params = {}) {
  const url = new URL("/api/nevari-proxy", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", normalizeBaseUrl(session.baseUrl));
  url.searchParams.set("path", path);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function hydrateAuthSession(session, data) {
  return {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || session.refreshToken || "",
    expiresAt: Date.now() + (Number(data.expires_in || 0) * 1000),
    user: data.user || null
  };
}

function persistSessionSnapshot(session, currentPage) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, currentPage }));
  } catch (error) {
    console.warn("Could not persist storefront session", error);
  }
}

function InlineIcon({ id }) {
  return (
    <svg aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

function StatusPill({ value, children, className = "status-pill" }) {
  return <span className={`${className} ${toneClass(value)}`}>{children}</span>;
}

function SkeletonBox({ className = "" }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="i-layout" viewBox="0 0 24 24">
        <rect x="3" y="4" width="7" height="7" rx="2" />
        <rect x="14" y="4" width="7" height="4" rx="2" />
        <rect x="14" y="11" width="7" height="9" rx="2" />
        <rect x="3" y="14" width="7" height="6" rx="2" />
      </symbol>
      <symbol id="i-pill" viewBox="0 0 24 24">
        <path d="M10.5 20.5 3.5 13.5a5 5 0 1 1 7-7l7 7a5 5 0 1 1-7 7Z" />
        <path d="m8 8 8 8" />
      </symbol>
      <symbol id="i-cart" viewBox="0 0 24 24">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H7" />
      </symbol>
      <symbol id="i-stethoscope" viewBox="0 0 24 24">
        <path d="M6 3v5a4 4 0 0 0 8 0V3" />
        <path d="M10 17a6 6 0 0 0 12 0v-1" />
        <circle cx="20" cy="10" r="2" />
        <path d="M8 3h4" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3Z" />
        <path d="m9.5 12 1.7 1.7 3.8-4.2" />
      </symbol>
      <symbol id="i-mail" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>
      <symbol id="i-search" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </symbol>
      <symbol id="i-bell" viewBox="0 0 24 24">
        <path d="M15 17H5l1.5-2.5V10a5.5 5.5 0 0 1 11 0v4.5L19 17h-4" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </symbol>
      <symbol id="i-settings" viewBox="0 0 24 24">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="m4.9 4.9 2.1 2.1" />
        <path d="m17 17 2.1 2.1" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m4.9 19.1 2.1-2.1" />
        <path d="m17 7 2.1-2.1" />
        <circle cx="12" cy="12" r="4" />
      </symbol>
      <symbol id="i-more" viewBox="0 0 24 24">
        <circle cx="6" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="18" cy="12" r="1.6" />
      </symbol>
      <symbol id="i-arrow-up-right" viewBox="0 0 24 24">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </symbol>
      <symbol id="i-menu" viewBox="0 0 24 24">
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </symbol>
      <symbol id="i-filter" viewBox="0 0 24 24">
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </symbol>
      <symbol id="i-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </symbol>
      <symbol id="i-lock" viewBox="0 0 24 24">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      </symbol>
      <symbol id="i-link" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20" />
      </symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M3 10h18" />
      </symbol>
      <symbol id="i-credit-card" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </symbol>
      <symbol id="i-clipboard" viewBox="0 0 24 24">
        <rect x="6" y="5" width="12" height="16" rx="2" />
        <path d="M9 5.5h6" />
        <path d="M9 10h6" />
        <path d="M9 14h6" />
      </symbol>
      <symbol id="i-briefcase-medical" viewBox="0 0 24 24">
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        <path d="M12 10v6" />
        <path d="M9 13h6" />
      </symbol>
      <symbol id="i-refresh-cw" viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </symbol>
      <symbol id="i-printer" viewBox="0 0 24 24">
        <path d="M7 8V4h10v4" />
        <rect x="6" y="14" width="12" height="6" rx="2" />
        <rect x="4" y="8" width="16" height="8" rx="2" />
      </symbol>
      <symbol id="i-x" viewBox="0 0 24 24">
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </symbol>
      <symbol id="i-package" viewBox="0 0 24 24">
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" />
      </symbol>
    </svg>
  );
}

export default function Page() {
  const router = useRouter();
  const [session, setSession] = useState(defaultSession);
  const [currentPage, setCurrentPage] = useState("overview");
  const [trendMode, setTrendMode] = useState("week");
  const [data, setData] = useState(emptyData);
  const [audit, setAudit] = useState({ category: "orders", status: "all", source: "all" });
  const [search, setSearch] = useState("");
  const [liveSnapshots, setLiveSnapshots] = useState([]);
  const deferredSearch = useDeferredValue(search);
  const [selectedAuditIndex, setSelectedAuditIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authGate, setAuthGate] = useState({ visible: true, stage: "auth" });
  const [setupFeedback, setSetupFeedback] = useState("Enter the pairing code to trust this storefront.");
  const [authFeedback, setAuthFeedback] = useState("Not connected.");
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [setupPairingCode, setSetupPairingCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [authView, setAuthView] = useState("login");
  const [syncStatus, setSyncStatus] = useState({ text: "Disconnected", mode: "" });
  const [hydrated, setHydrated] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [selectedOrderDoctorId, setSelectedOrderDoctorId] = useState("");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState("");
  const [selectedOrderNote, setSelectedOrderNote] = useState("");
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderMutationLoading, setOrderMutationLoading] = useState(false);
  const [orderActionFeedback, setOrderActionFeedback] = useState("");
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const latestSessionRef = useRef(session);
  const refreshPromiseRef = useRef(null);
  const bootstrapStartedRef = useRef(false);

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession((prev) => ({ ...prev, ...parsed }));
        if (parsed.currentPage) {
          setCurrentPage(normalizePageId(parsed.currentPage));
        }
      }
    } catch (error) {
      console.error("Could not load stored session", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    persistSessionSnapshot(session, currentPage);
  }, [session, currentPage, hydrated]);

  useEffect(() => {
    document.body.classList.toggle("auth-locked", authGate.visible);
    return () => document.body.classList.remove("auth-locked");
  }, [authGate.visible]);

  useEffect(() => {
    if (currentPage !== "orders") {
      setSelectedOrderId(null);
      setSelectedOrderDetail(null);
      setSelectedOrderDoctorId("");
      setSelectedOrderStatus("");
      setSelectedOrderNote("");
      setOrderActionFeedback("");
      setOrderModalOpen(false);
    }
  }, [currentPage]);

  useEffect(() => {
    if (!selectedOrderId) {
      return;
    }
    const matchingOrder = (data.orderDetails || []).find((order) => order.id === selectedOrderId);
    if (matchingOrder && !selectedOrderDetail) {
      setSelectedOrderDetail(matchingOrder);
      setSelectedOrderDoctorId(matchingOrder.assigned_doctor_user_id ? String(matchingOrder.assigned_doctor_user_id) : "");
      setSelectedOrderStatus(matchingOrder.status || "");
      setSelectedOrderNote(matchingOrder.customer_note || "");
      setOrderModalOpen(true);
    }
  }, [data.orderDetails, selectedOrderDetail, selectedOrderId]);

  function showAuthGate(stage) {
    if (stage === "setup") {
      router.push("/initialsetup");
      return;
    }
    setAuthGate({ visible: true, stage });
    setAuthView("login");
  }

  function hideAuthGate() {
    setAuthGate((prev) => ({ ...prev, visible: false }));
  }

  function switchPage(pageId) {
    startTransition(() => {
      setCurrentPage(normalizePageId(pageId));
      setSidebarOpen(false);
    });
  }

  function syncOrderState(nextOrder) {
    setData((prev) => ({
      ...prev,
      orderDetails: (prev.orderDetails || []).map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order)),
      orders: (prev.orders || []).map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order))
    }));
    setSelectedOrderDetail(nextOrder);
    setSelectedOrderId(nextOrder.id);
  }

  function removeOrderState(orderId) {
    setData((prev) => ({
      ...prev,
      orderDetails: (prev.orderDetails || []).filter((order) => order.id !== orderId),
      orders: (prev.orders || []).filter((order) => order.id !== orderId)
    }));
    setSelectedOrderId(null);
    setSelectedOrderDetail(null);
    setSelectedOrderDoctorId("");
    setSelectedOrderStatus("");
    setSelectedOrderNote("");
    setOrderModalOpen(false);
  }

  async function openOrderDetails(orderId) {
    setSelectedOrderId(orderId);
    setOrderDetailLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${orderId}`);
      const nextOrder = payload?.data;
      if (nextOrder) {
        setSelectedOrderDetail(nextOrder);
        setSelectedOrderDoctorId(nextOrder.assigned_doctor_user_id ? String(nextOrder.assigned_doctor_user_id) : "");
        setSelectedOrderStatus(nextOrder.status || "");
        setSelectedOrderNote(nextOrder.customer_note || "");
        syncOrderState(nextOrder);
        setOrderModalOpen(true);
      }
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderDetailLoading(false);
    }
  }

  async function saveSelectedOrder() {
    if (!selectedOrderDetail) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${selectedOrderDetail.id}`, {
        method: "POST",
        body: {
          status: selectedOrderStatus,
          customer_note: selectedOrderNote
        }
      });
      syncOrderState(payload.data);
      setOrderActionFeedback("Order updated.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function assignSelectedOrderDoctor() {
    if (!selectedOrderDetail || !selectedOrderDoctorId) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${selectedOrderDetail.id}/assign-doctor`, {
        method: "POST",
        body: { doctor_user_id: Number(selectedOrderDoctorId) }
      });
      syncOrderState(payload.data);
      setOrderActionFeedback("Doctor assigned and notified.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function deleteSelectedOrder() {
    if (!selectedOrderDetail || typeof window === "undefined") {
      return;
    }
    if (!window.confirm(`Delete order #${selectedOrderDetail.number}?`)) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      await apiRequest(`/orders/${selectedOrderDetail.id}`, { method: "DELETE" });
      removeOrderState(selectedOrderDetail.id);
      setOrderActionFeedback("Order deleted.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  function printSelectedOrder() {
    if (typeof window === "undefined" || !selectedOrderDetail) {
      return;
    }
    window.print();
  }

  async function refundSelectedOrder() {
    if (!selectedOrderDetail) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${selectedOrderDetail.id}`, {
        method: "POST",
        body: {
          status: "refunded",
          customer_note: selectedOrderNote
        }
      });
      syncOrderState(payload.data);
      setSelectedOrderStatus(payload?.data?.status || "refunded");
      setOrderActionFeedback("Order marked as refunded. Capture gateway-side refund separately if required.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  function contactSelectedCustomer() {
    if (typeof window === "undefined" || !selectedOrderDetail) {
      return;
    }
    const email = selectedOrderDetail.billing?.email;
    const phone = selectedOrderDetail.billing?.phone;
    if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Order #${selectedOrderDetail.number}`)}`;
      return;
    }
    if (phone) {
      window.location.href = `tel:${phone}`;
      return;
    }
    setOrderActionFeedback("No customer email or phone number is available for contact.");
  }

  async function apiRequest(path, { method = "GET", body, params = {}, auth = true, retry = true } = {}, activeSession = session) {
    if (!activeSession.baseUrl) {
      throw new Error("WordPress base URL is not configured.");
    }

    if (auth && activeSession.refreshToken && Date.now() > (Number(activeSession.expiresAt) - 30_000)) {
      activeSession = await refreshSession(activeSession);
    }

    const headers = {
      Accept: "application/json",
      "X-Nevari-Frontend-Type": activeSession.frontendType,
      "X-Nevari-Frontend-Origin": activeSession.frontendOrigin
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (auth && activeSession.accessToken) {
      headers.Authorization = `Bearer ${activeSession.accessToken}`;
    }

    let response;
    try {
      response = await fetch(buildUrl(activeSession, path, params), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      throw new Error(describeRequestError(error));
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      if (response.status === 404) {
        throw new Error(`API route not found: ${path}. Verify the live WordPress site has the latest Nevari plugin with this endpoint enabled.`);
      }
      throw new Error("Unexpected API response.");
    }

    if ((response.status === 401 || response.status === 403) && auth && retry && activeSession.refreshToken) {
      const refreshed = await refreshSession(activeSession);
      return apiRequest(path, { method, body, params, auth, retry: false }, refreshed);
    }

    if (!response.ok || !payload?.success) {
      const message = extractApiErrorMessage(payload);
      if (response.status === 404 && isRouteMissingPayload(payload)) {
        throw new Error(`API route not found: ${path}. Verify the live WordPress site has the latest Nevari plugin with this endpoint enabled.`);
      }
      throw new Error(message || `Request failed with status ${response.status}.`);
    }

    return payload;
  }

  async function refreshSession(activeSession = session) {
    const workingSession = activeSession?.refreshToken ? activeSession : latestSessionRef.current;
    if (!workingSession?.refreshToken) {
      throw new Error("No refresh token is available.");
    }

    const latestSession = latestSessionRef.current;
    if (
      latestSession?.refreshToken &&
      latestSession.refreshToken !== workingSession.refreshToken &&
      Date.now() < Number(latestSession.expiresAt || 0) - 30_000
    ) {
      return latestSession;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      const payload = await apiRequest("/auth/refresh", {
        method: "POST",
        auth: false,
        body: {
          refresh_token: workingSession.refreshToken,
          ...frontendContext(workingSession)
        }
      }, workingSession);

      const nextSession = hydrateAuthSession(workingSession, payload.data);
      latestSessionRef.current = nextSession;
      setSession(nextSession);
      persistSessionSnapshot(nextSession, currentPage);
      return nextSession;
    })();

    refreshPromiseRef.current = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null;
      }
    }
  }

  async function fetchAuditEvents(activeSession = session, nextAudit = audit, nextSearch = deferredSearch) {
    if (!activeSession.accessToken) {
      setData((prev) => ({ ...prev, auditEvents: [] }));
      setSelectedAuditIndex(0);
      return;
    }

    const payload = await apiRequest("/audit-logs", {
      params: {
        category: nextAudit.category,
        status: nextAudit.status === "all" ? "" : nextAudit.status,
        source: nextAudit.source === "all" ? "" : nextAudit.source,
        search: nextSearch,
        per_page: 20
      }
    }, activeSession);

    const rows = payload.data || [];
    setData((prev) => ({ ...prev, auditEvents: rows }));
    setSelectedAuditIndex(0);
  }

  async function fetchAllData(activeSession = session) {
    setSyncStatus({ text: "Syncing...", mode: "" });
    setRefreshing(true);

    try {
      const [
        dashboardPayload,
        ordersPayload,
        appointmentsPayload,
        prescriptionsPayload,
        emailsPayload,
        doctorsPayload,
        productsPayload
      ] = await Promise.all([
        apiRequest("/dashboard/store-admin", {}, activeSession),
        apiRequest("/orders", { params: { per_page: 24 } }, activeSession),
        apiRequest("/appointments", { params: { per_page: 40 } }, activeSession),
        apiRequest("/prescriptions", { params: { per_page: 40 } }, activeSession),
        apiRequest("/emails/logs", { params: { per_page: 20 } }, activeSession),
        apiRequest("/doctors", { params: { per_page: 50 } }, activeSession),
        apiRequest("/products", { params: { per_page: 100 } }, activeSession)
      ]);

      const orders = ordersPayload.data || [];
      const prescriptions = prescriptionsPayload.data || [];

      const orderDetails = await Promise.all(
        orders.slice(0, 18).map((order) =>
          apiRequest(`/orders/${order.id}`, {}, activeSession).then((payload) => payload.data).catch(() => order)
        )
      );

      const prescriptionDetails = await Promise.all(
        prescriptions.slice(0, 18).map((prescription) =>
          apiRequest(`/prescriptions/${prescription.id}`, {}, activeSession).then((payload) => payload.data).catch(() => prescription)
        )
      );

      const prescriptionHistory = (
        await Promise.all(
          prescriptionDetails.slice(0, 8).map((prescription) =>
            apiRequest(`/prescriptions/${prescription.id}/history`, {}, activeSession)
              .then((payload) => (payload.data || []).map((item) => ({ ...item, prescription_id: prescription.id })))
              .catch(() => [])
          )
        )
      ).flat();

      const nextDashboard = dashboardPayload.data || {};
      const nextAppointments = appointmentsPayload.data || [];
      const nextEmails = emailsPayload.data || [];
      const nextDoctors = doctorsPayload.data || [];
      const nextProducts = productsPayload.data || [];

      setData({
        dashboard: nextDashboard,
        orders,
        orderDetails,
        appointments: nextAppointments,
        prescriptions,
        prescriptionDetails,
        prescriptionHistory,
        emails: nextEmails,
        doctors: nextDoctors,
        products: nextProducts,
        auditEvents: []
      });

      const now = new Date();
      const ordersToday = orderDetails.filter((order) => {
        const created = new Date(order.created_at);
        return !Number.isNaN(created.getTime()) &&
          created.getFullYear() === now.getFullYear() &&
          created.getMonth() === now.getMonth() &&
          created.getDate() === now.getDate();
      }).length;

      setLiveSnapshots((prev) => (
        [
          ...prev,
          {
            label: formatLiveLabel(now),
            total: safeNumber(nextDashboard.sales?.today || 0),
            volume: ordersToday
          }
        ].slice(-7)
      ));

      await fetchAuditEvents(activeSession, audit, deferredSearch);
      setSyncStatus({
        text: `Live | ${formatLiveLabel()}`,
        mode: "live"
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePairingSubmit(event) {
    event.preventDefault();
    setSetupSubmitting(true);
    setSetupFeedback("Verifying pairing code...");

    try {
      const baseUrl = decodePairingBaseUrl(setupPairingCode);
      const workingSession = { ...session, baseUrl: normalizeBaseUrl(baseUrl) };
      setSession(workingSession);

      const verifyPayload = await apiRequest("/connections/verify", {
        method: "POST",
        auth: false,
        body: {
          pairing_code: setupPairingCode,
          frontend_type: workingSession.frontendType,
          frontend_origin: workingSession.frontendOrigin,
          frontend_url: workingSession.frontendUrl
        }
      }, workingSession);

      const registerPayload = await apiRequest("/connections/register", {
        method: "POST",
        auth: false,
        body: {
          pairing_session_id: verifyPayload.data.pairing_session_id,
          frontend_type: workingSession.frontendType,
          frontend_origin: workingSession.frontendOrigin,
          frontend_url: workingSession.frontendUrl,
          connection_status: "trusted"
        }
      }, workingSession);

      const nextSession = {
        ...workingSession,
        paired: true,
        siteName: registerPayload.data.site_name || verifyPayload.data.site_name || "",
        siteLogo: registerPayload.data.site_logo || verifyPayload.data.site_logo || ""
      };

      setSession(nextSession);
      persistSessionSnapshot(nextSession, currentPage);
      setSetupFeedback("Pairing verified. Continue to sign in.");
      setSyncStatus({ text: "Paired", mode: "live" });
      showAuthGate("auth");
    } catch (error) {
      console.error(error);
      setSyncStatus({ text: "Pairing error", mode: "error" });
      setSetupFeedback(error.message || "Pairing failed.");
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthFeedback("Signing in...");

    try {
      const payload = await apiRequest("/auth/login", {
        method: "POST",
        auth: false,
        body: {
          username,
          password,
          ...frontendContext(session)
        }
      }, session);

      const nextSession = hydrateAuthSession(session, payload.data);
      setSession(nextSession);
      persistSessionSnapshot(nextSession, currentPage);
      setPassword("");
      setPasswordVisible(false);
      setAuthFeedback("Signed in.");
      hideAuthGate();

      try {
        await fetchAllData(nextSession);
      } catch (syncError) {
        console.error(syncError);
        setSyncStatus({ text: "Sync error", mode: "error" });
      }
    } catch (error) {
      console.error(error);
      setSyncStatus({ text: "Authentication error", mode: "error" });
      setAuthFeedback(error.message || "Login failed.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      setAuthFeedback("WordPress base URL is not configured.");
      return;
    }

    setResetSubmitting(true);
    setAuthFeedback("Sending reset instructions...");

    try {
      const body = new URLSearchParams({
        user_login: resetUsername,
        "wp-submit": "Get New Password",
        redirect_to: ""
      });

      await fetch(`${normalizeBaseUrl(session.baseUrl)}/wp-login.php?action=lostpassword`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString(),
        mode: "no-cors"
      });

      setAuthFeedback("If that account exists, password reset instructions have been sent.");
      setAuthView("login");
    } catch (error) {
      console.error(error);
      setAuthFeedback("Could not submit the reset request. Try again.");
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      if (session.refreshToken && session.accessToken) {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: {
            refresh_token: session.refreshToken,
            ...frontendContext(session)
          }
        }, session);
      }
    } catch (error) {
      console.warn(error);
    }

    const nextSession = { ...session, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
    setSession(nextSession);
    persistSessionSnapshot(nextSession, currentPage);
    setData(emptyData());
    setSyncStatus({ text: nextSession.paired ? "Paired" : "Disconnected", mode: "" });
    setAuthFeedback("Session cleared.");
    showAuthGate(nextSession.paired ? "auth" : "setup");
  }

  async function handleRefresh() {
    if (!session.accessToken || refreshing) {
      return;
    }

    try {
      await fetchAllData(session);
    } catch (error) {
      console.error(error);
      setSyncStatus({ text: "Sync error", mode: "error" });
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;

    let cancelled = false;

    async function bootstrap() {
      if (!session.paired) {
        router.replace("/initialsetup");
        setSetupFeedback(
          isFileProtocol()
            ? "Enter the one-time pairing code to trust this storefront. If requests fail, serve this folder over http://localhost instead of opening index.html directly."
            : "Enter the one-time pairing code to trust this storefront."
        );
        setSyncStatus({ text: "Pairing required", mode: "" });
        return;
      }

      setSyncStatus({ text: "Paired", mode: "live" });

      if (!session.refreshToken) {
        showAuthGate("auth");
        setAuthFeedback(
          isFileProtocol()
            ? "The storefront is paired. Sign in to load live data. If requests fail from file://, serve this folder over http://localhost first."
            : "The storefront is paired. Sign in to load live data."
        );
        return;
      }

      hideAuthGate();
      setSyncStatus({ text: "Restoring session...", mode: "" });

      let refreshed;
      try {
        refreshed = await refreshSession(session);
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        const nextSession = { ...session, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
        setSession(nextSession);
        showAuthGate("auth");
        setSyncStatus({ text: "Paired", mode: "live" });
        setAuthFeedback("Stored session expired. Sign in again.");
        return;
      }

      if (cancelled) {
        return;
      }

      try {
        await fetchAllData(refreshed);
        if (cancelled) {
          return;
        }
        hideAuthGate();
        setAuthFeedback("Session restored.");
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        hideAuthGate();
        setSyncStatus({ text: "Sync error", mode: "error" });
        setAuthFeedback("Session restored, but live data could not sync.");
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hydrated, router]);

  useEffect(() => {
    if (!session.accessToken) {
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        await fetchAuditEvents(session, audit, deferredSearch);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    }
    run();

    return () => {
      cancelled = true;
    };
  }, [audit.category, audit.status, audit.source, deferredSearch, session.accessToken]);

  useEffect(() => {
    if (trendMode !== "live" || !session.accessToken) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activeSession = latestSessionRef.current;
      if (!activeSession?.accessToken || refreshing) {
        return;
      }

      fetchAllData(activeSession).catch((error) => {
        console.error(error);
        setSyncStatus({ text: "Sync error", mode: "error" });
      });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [trendMode, session.accessToken, refreshing]);

  const dashboard = data.dashboard || {};
  const sales = dashboard.sales || {};
  const consultations = dashboard.consultations || {};
  const prescriptionsSummary = dashboard.prescriptions || {};
  const emailsSummary = dashboard.emails || {};
  const doctorMap = new Map((data.doctors || []).map((doctor) => [doctor.user_id || doctor.id, doctor.display_name]));
  const query = deferredSearch.trim().toLowerCase();
  const showPageSearch = currentPage !== "overview";
  const searchPlaceholder = SEARCH_PLACEHOLDERS[currentPage] || "Search this page";
  const matchesSearch = (text, enabled) => !enabled || !query || normalizeText(text).includes(query);
  const siteName = session.siteName || DEFAULT_SITE_NAME;
  const siteLogo = session.siteLogo || "/ne.webp";

  const rxHolds = (data.orderDetails || []).filter((order) => ["on_hold", "on-hold"].includes(order.rx_status || order.status)).length;
  const appointmentInProgress = Number(consultations.requested || 0) + Number(consultations.confirmed || 0);
  const emailTotal = Number(emailsSummary.sent_today || 0) + Number(emailsSummary.failed_today || 0);
  const emailFailureRate = emailTotal ? (Number(emailsSummary.failed_today || 0) / emailTotal) * 100 : 0;

  const weeklyTrend = (() => {
    const orders = data.orderDetails || [];
    const now = new Date();
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(now.getDate() - offset);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const dayOrders = orders
        .filter((order) => {
          const created = new Date(order.created_at);
          return !Number.isNaN(created.getTime()) && created >= day && created < next;
        });
      days.push({
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        total: dayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
        volume: dayOrders.length
      });
    }
    return days;
  })();

  const liveTrend = (() => {
    const placeholders = Array.from({ length: Math.max(0, 7 - liveSnapshots.length) }, (_, index) => ({
      label: index === 0 ? "Live" : "",
      total: 0,
      volume: 0,
      placeholder: true
    }));
    return [...placeholders, ...liveSnapshots];
  })();

  const trendSeries = trendMode === "live" ? liveTrend : weeklyTrend;
  const chartMax = Math.max(...trendSeries.map((day) => day.total), 1);
  const chartColors = ["#b9996d", "#d99860", "#d8cab6", "#344a6e", "#5c6d89", "#adb7c8", "#b9996d"];

  const legendItems = [
    { color: "teal", label: "Orders awaiting review", value: (data.orderDetails || []).filter((order) => ["pending", "on-hold"].includes(order.status)).length },
    { color: "rose", label: "Assigned prescriptions", value: prescriptionsSummary.assigned || 0 },
    { color: "lime", label: "Completed consultations", value: consultations.completed || 0 },
    { color: "violet", label: "Email failures today", value: emailsSummary.failed_today || 0 }
  ];

  const donutSegments = (() => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const total = Math.max(legendItems.reduce((sum, item) => sum + Number(item.value), 0), 1);
    let offset = 0;

    return legendItems.map((item) => {
      const segmentLength = (Number(item.value) / total) * circumference;
      const segment = {
        ...item,
        circumference,
        dasharray: `${segmentLength} ${circumference - segmentLength}`,
        dashoffset: -offset
      };
      offset += segmentLength;
      return segment;
    });
  })();

  const catalogItems = (() => {
    const products = data.products || [];
    const total = Math.max(products.length, 1);
    const rxRequired = products.filter((product) => product.pharmacy_rules?.rx_required).length;
    const consultationRequired = products.filter((product) => product.pharmacy_rules?.consultation_required).length;
    const otcCount = products.filter((product) => product.pharmacy_rules?.otc).length;
    const restrictedCount = products.filter((product) => product.pharmacy_rules?.restricted_visibility).length;

    return [
      { label: "Prescription needed", value: rxRequired, meterClass: "", width: Math.max(8, (rxRequired / total) * 100) },
      { label: "Consultation required", value: consultationRequired, meterClass: "mint-fill", width: Math.max(8, (consultationRequired / total) * 100) },
      { label: "OTC inventory", value: otcCount, meterClass: "lime-fill", width: Math.max(8, (otcCount / total) * 100) },
      { label: "Restricted visibility", value: restrictedCount, meterClass: "rose-fill", width: Math.max(8, (restrictedCount / total) * 100) }
    ];
  })();

  const teamItems = (() => {
    const prescriptionDetails = data.prescriptionDetails || [];
    const appointments = data.appointments || [];
    const activePatients = new Set([...appointments.map((item) => item.patient_user_id), ...prescriptionDetails.map((item) => item.patient_user_id)].filter(Boolean));
    return [
      { label: "Doctors", value: (data.doctors || []).length, note: `${(data.doctors || []).filter((doctor) => doctor.accepting_patients).length} accepting patients` },
      { label: "Linked patients", value: activePatients.size, note: "derived from consultations and prescriptions" },
      { label: "Draft prescriptions", value: prescriptionDetails.filter((item) => item.status === "draft").length, note: "awaiting issue review" },
      { label: "Awaiting assignment", value: prescriptionDetails.filter((item) => ["issued", "assigned_to_patient"].includes(item.status)).length, note: "patient notification queue" }
    ];
  })();

  const emailItems = (() => {
    const list = data.emails || [];
    const sent = list.filter((email) => email.status === "sent").length;
    const queued = list.filter((email) => email.status === "queued").length;
    const failed = list.filter((email) => email.status === "failed").length;
    const templates = new Set(list.map((email) => email.template_key).filter(Boolean));
    return [
      { label: "Queued", value: queued, note: "appointment and assignment notices" },
      { label: "Sent", value: sent, note: "recent delivery log entries" },
      { label: "Failed", value: failed, note: "provider or recipient issues" },
      { label: "Templates in use", value: templates.size, note: "visible in the current email log" }
    ];
  })();

  const filteredOrders = (data.orderDetails || []).filter((order) => {
    const names = (order.items || []).map((item) => item.name).join(" ");
    const searchText = `${order.number} ${order.status} ${order.rx_status || ""} ${names} ${order.customer_id || ""}`;
    return matchesSearch(searchText, currentPage === "orders");
  });

  const selectedOrderPrescription = selectedOrderDetail
    ? (data.prescriptionDetails || []).find((item) => item.id === selectedOrderDetail.prescription_id)
    : null;

  const selectedOrderDoctorProfile = selectedOrderDetail?.assigned_doctor_user_id
    ? (data.doctors || []).find((doctor) => Number(doctor.user_id) === Number(selectedOrderDetail.assigned_doctor_user_id))
    : null;

  const filteredEmails = (data.emails || []).filter((email) =>
    matchesSearch(`${email.recipient_email} ${email.template_key} ${email.status} ${email.related_object_type} ${email.provider}`, currentPage === "emails")
  );

  const filteredAppointments = (data.appointments || []).filter((appointment) =>
    matchesSearch(`${appointment.status} ${appointment.reason} ${appointment.type} ${appointment.patient_user_id} ${appointment.doctor_user_id}`, currentPage === "consultations")
  );

  const filteredPrescriptions = (data.prescriptionDetails || []).filter((prescription) =>
    matchesSearch(`${prescription.prescription_number} ${prescription.status} ${prescription.patient_user_id} ${prescription.doctor_user_id} ${prescription.diagnosis}`, currentPage === "prescriptions")
  );

  const filteredProducts = (data.products || []).filter((product) => {
    const rules = product.pharmacy_rules || {};
    return matchesSearch(`${product.name} ${product.sku} ${product.badge?.label} ${product.badge?.key} ${product.stock_status} ${rules.rx_required} ${rules.otc} ${rules.consultation_required}`, currentPage === "products");
  });

  const filteredDoctors = (data.doctors || []).filter((doctor) =>
    matchesSearch(`${doctor.display_name} ${doctor.email} ${doctor.specialties?.join(" ")} ${doctor.location} ${doctor.user_id}`, currentPage === "doctors")
  );

  const paymentRows = (data.orderDetails || [])
    .filter((order) => {
      const paymentStatus = order.payment_status || order.status || "pending";
      return matchesSearch(`${order.number} ${paymentStatus} ${order.rx_status || ""} ${order.customer_id || ""} ${order.total || 0}`, currentPage === "payments");
    })
    .map((order) => {
    const paymentStatus = order.payment_status || order.status || "pending";
    const held = ["on_hold", "on-hold"].includes(order.rx_status || "");
    return {
      id: order.id,
      number: order.number,
      customerLabel: patientLabel(order.customer_id),
      amount: safeNumber(order.total),
      currency: order.currency || "USD",
      paymentStatus,
      rxStatus: order.rx_status || "clear",
      createdAt: order.created_at,
      actionLabel: held ? "Resolve RX hold" : paymentStatus === "completed" ? "Archive payment" : "Review capture"
    };
  });

  const customerRows = (() => {
    const customerMap = new Map();

    (data.orderDetails || []).forEach((order) => {
      const key = order.customer_id || `guest-${order.billing?.email || order.number || order.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: patientLabel(order.customer_id),
        email: order.billing?.email || "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: order.created_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.orders += 1;
      current.spend += safeNumber(order.total);
      if (!current.email || current.email === "No email on file") {
        current.email = order.billing?.email || current.email;
      }
      if (order.created_at && (!current.lastActivity || new Date(order.created_at) > new Date(current.lastActivity))) {
        current.lastActivity = order.created_at;
      }
      customerMap.set(key, current);
    });

    (data.prescriptionDetails || []).forEach((prescription) => {
      const key = prescription.patient_user_id || `patient-rx-${prescription.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: patientLabel(prescription.patient_user_id),
        email: "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: prescription.updated_at || prescription.created_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.prescriptions += 1;
      if (prescription.updated_at && (!current.lastActivity || new Date(prescription.updated_at) > new Date(current.lastActivity))) {
        current.lastActivity = prescription.updated_at;
      }
      customerMap.set(key, current);
    });

    (data.appointments || []).forEach((appointment) => {
      const key = appointment.patient_user_id || `patient-appt-${appointment.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: patientLabel(appointment.patient_user_id),
        email: "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: appointment.updated_at || appointment.start_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.appointments += 1;
      if (appointment.start_at && (!current.lastActivity || new Date(appointment.start_at) > new Date(current.lastActivity))) {
        current.lastActivity = appointment.start_at;
      }
      customerMap.set(key, current);
    });

    return [...customerMap.values()]
      .filter((row) => matchesSearch(`${row.label} ${row.email} ${row.id}`, currentPage === "customers"))
      .sort((a, b) => safeNumber(b.spend) - safeNumber(a.spend))
      .slice(0, 18);
  })();

  const appointmentLanes = [
    { key: "requested", label: "Requested" },
    { key: "confirmed", label: "Confirmed" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Escalations", statuses: ["cancelled", "no_show"] }
  ];

  const sortedHistory = [...(data.prescriptionHistory || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  const selectedAuditEvent = data.auditEvents[selectedAuditIndex] || null;

  const todayAppointments = filteredAppointments
    .filter((appointment) => {
      const start = new Date(appointment.start_at);
      const today = new Date();
      return !Number.isNaN(start.getTime()) &&
        start.getFullYear() === today.getFullYear() &&
        start.getMonth() === today.getMonth() &&
        start.getDate() === today.getDate();
    })
    .slice(0, 6);

  const urgentItems = [
    {
      label: "RX holds",
      value: rxHolds,
      note: `${formatNumber(prescriptionsSummary.assigned || 0)} assignments pending`,
      action: "orders"
    },
    {
      label: "Consultation queue",
      value: appointmentInProgress,
      note: `${formatNumber(consultations.completed || 0)} completed today`,
      action: "consultations"
    },
    {
      label: "Email failures",
      value: emailsSummary.failed_today || 0,
      note: `${formatNumber(emailItems[0]?.value || 0)} still queued`,
      action: "emails"
    }
  ];

  const settingsCards = [
    {
      label: "Frontend type",
      value: session.frontendType || FRONTEND_TYPE,
      note: "paired storefront identity"
    },
    {
      label: "Connected base URL",
      value: session.baseUrl || "Not configured",
      note: "WordPress REST source"
    },
    {
      label: "Active role",
      value: session.user?.roles?.join(", ") || "Not authenticated",
      note: "current signed-in permissions"
    },
    {
      label: "Session state",
      value: session.accessToken ? "Authenticated" : "Awaiting sign-in",
      note: "refresh token kept locally for this frontend"
    }
  ];

  const profileCards = [
    {
      label: "Display name",
      value: session.user?.display_name || siteName,
      note: "visible in the storefront command center"
    },
    {
      label: "Email",
      value: session.user?.email || "Not available",
      note: "current authenticated WordPress account"
    },
    {
      label: "Role",
      value: session.user?.roles?.join(", ") || "Frontend guest",
      note: "active session permissions"
    },
    {
      label: "Connection",
      value: session.baseUrl || "Not configured",
      note: "paired WordPress environment"
    }
  ];

  const hasPrimaryData = Boolean(
    data.dashboard ||
    (data.orderDetails || []).length ||
    (data.appointments || []).length ||
    (data.prescriptionDetails || []).length ||
    (data.products || []).length ||
    (data.doctors || []).length ||
    (data.emails || []).length
  );
  const showPageSkeleton = Boolean(session.accessToken && refreshing && !hasPrimaryData);

  function renderMetricSkeletons(count = 4) {
    return Array.from({ length: count }, (_, index) => (
      <article className="metric-card skeleton-panel" key={`metric-skeleton-${index}`}>
        <div className="metric-row">
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <SkeletonBox className="skeleton-circle skeleton-circle-xs" />
        </div>
        <SkeletonBox className="skeleton-line skeleton-line-md" />
        <SkeletonBox className="skeleton-line skeleton-line-lg skeleton-line-tall" />
        <SkeletonBox className="skeleton-line skeleton-line-sm" />
      </article>
    ));
  }

  function renderTableRowSkeletons(count = 5, columns = 7) {
    return Array.from({ length: count }, (_, rowIndex) => (
      <tr key={`table-skeleton-${rowIndex}`}>
        {Array.from({ length: columns }, (_, columnIndex) => (
          <td key={`table-skeleton-${rowIndex}-${columnIndex}`}>
            <SkeletonBox className={`skeleton-line ${columnIndex % 3 === 0 ? "skeleton-line-lg" : columnIndex % 3 === 1 ? "skeleton-line-md" : "skeleton-line-sm"}`} />
          </td>
        ))}
      </tr>
    ));
  }

  function renderOrderDetailSkeleton() {
    return (
      <div className="order-detail-grid">
        <div className="order-detail-stack">
          <div className="mini-stat-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="mini-stat skeleton-panel" key={`order-stat-skeleton-${index}`}>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" />
                <SkeletonBox className="skeleton-line skeleton-line-sm" />
              </div>
            ))}
          </div>
          <div className="detail-form-grid">
            <div className="detail-field">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-pill" />
            </div>
            <div className="detail-field">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-pill" />
            </div>
            <div className="detail-field detail-field-wide">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-block" />
            </div>
          </div>
        </div>
        <div className="order-detail-stack">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="detail-item-card skeleton-panel" key={`order-detail-item-skeleton-${index}`}>
              <SkeletonBox className="skeleton-line skeleton-line-md" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderPageSkeleton() {
    if (currentPage === "overview") {
      return (
        <section className="page-view active">
          <section className="metrics-grid">
            {renderMetricSkeletons(4)}
          </section>
          <section className="analytics-grid">
            <article className="panel skeleton-panel">
              <div className="panel-header">
                <div>
                  <SkeletonBox className="skeleton-line skeleton-line-xs" />
                  <SkeletonBox className="skeleton-line skeleton-line-lg" />
                </div>
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </div>
              <div className="skeleton-chart-bars">
                {Array.from({ length: 7 }, (_, index) => (
                  <SkeletonBox className={`skeleton-bar skeleton-bar-${(index % 4) + 1}`} key={`overview-bar-${index}`} />
                ))}
              </div>
            </article>
            <article className="panel skeleton-panel">
              <div className="panel-header">
                <div>
                  <SkeletonBox className="skeleton-line skeleton-line-xs" />
                  <SkeletonBox className="skeleton-line skeleton-line-lg" />
                </div>
                <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
              </div>
              <div className="skeleton-donut-layout">
                <SkeletonBox className="skeleton-donut" />
                <div className="detail-list">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="detail-item-card skeleton-panel" key={`overview-legend-${index}`}>
                      <SkeletonBox className="skeleton-line skeleton-line-md" />
                      <SkeletonBox className="skeleton-line skeleton-line-sm" />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
        </section>
      );
    }

    if (currentPage === "orders") {
      return (
        <section className="page-view active">
          <section className="page-banner panel skeleton-panel">
            <div className="detail-list">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-line skeleton-line-lg" />
              <SkeletonBox className="skeleton-line skeleton-line-md" />
            </div>
            <div className="banner-stats">
              <div className="mini-stat skeleton-panel"><SkeletonBox className="skeleton-line skeleton-line-xs" /><SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" /></div>
              <div className="mini-stat skeleton-panel"><SkeletonBox className="skeleton-line skeleton-line-xs" /><SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" /></div>
            </div>
          </section>
          <section className="panel table-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-lg" />
              </div>
              <div className="toolbar">
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </div>
            </div>
            <div className="table-scroll">
              <table><tbody>{renderTableRowSkeletons(5, 7)}</tbody></table>
            </div>
          </section>
          <section className="panel order-detail-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-lg" />
              </div>
            </div>
            {renderOrderDetailSkeleton()}
          </section>
        </section>
      );
    }

    return (
      <section className="page-view active">
        <section className="panel table-panel skeleton-panel">
          <div className="panel-header">
            <div>
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-line skeleton-line-lg" />
            </div>
            <div className="toolbar">
              <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
            </div>
          </div>
          <div className="table-scroll">
            <table><tbody>{renderTableRowSkeletons(6, 7)}</tbody></table>
          </div>
        </section>
      </section>
    );
  }

  function renderCatalogBlock() {
    return catalogItems.length ? (
      <div className="stack-list">
        {catalogItems.map((item) => (
          <div key={item.label}>
            <div className="stack-row"><span>{item.label}</span><strong>{formatNumber(item.value)}</strong></div>
            <div className={`stack-meter ${item.meterClass}`}><span style={{ width: `${item.width}%` }} /></div>
          </div>
        ))}
      </div>
    ) : <div className="muted">Pair the frontend to load product rule counts.</div>;
  }

  function renderTeamBlock() {
    return (
      <div className="mini-stat-grid">
        {teamItems.map((item) => (
          <div className="mini-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
    );
  }

  function renderEmailBlock() {
    return (
      <div className="mini-stat-grid">
        {emailItems.map((item) => (
          <div className="mini-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <IconSprite />

      <div className="page-shell">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <div className="brand-mark brand-logo-shell">
                <img className="brand-logo" src={siteLogo} alt={`${siteName} logo`} />
              </div>
              <div>
                <strong>{siteName}</strong>
                <span>Store command center</span>
              </div>
            </div>

            <nav className="nav-groups" aria-label="Primary">
              {FRONTEND_PAGES.map((group) => (
                <div className="nav-group" key={group.label}>
                  <p className="nav-label">{group.label}</p>
                  {group.items.map(([pageId, label, icon]) => (
                    <button
                      key={pageId}
                      className={`nav-item ${currentPage === pageId ? "active" : ""}`}
                      onClick={() => switchPage(pageId)}
                      type="button"
                    >
                      <span className="nav-icon"><InlineIcon id={icon} /></span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </div>

          <div className="sidebar-card">
            <div className="sidebar-card-header">
              <div className="sidebar-orb" />
              <div>
                <strong>Operations Health</strong>
                <span>{formatNumber(rxHolds)} RX holds, {formatNumber(emailsSummary.failed_today || 0)} email failures today</span>
              </div>
            </div>
            <div className="sidebar-meter" aria-hidden="true">
              <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(18, 100 - emailFailureRate))}%` }} />
            </div>
            <button className="button-primary button-block" type="button" onClick={() => switchPage("audit")}>
              Open Audit Center
            </button>
          </div>
        </aside>

        <main className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-button mobile-only" type="button" aria-label="Toggle navigation" onClick={() => setSidebarOpen((prev) => !prev)}>
                <InlineIcon id="i-menu" />
              </button>
              {showPageSearch && (
                <label className="search-field" htmlFor="globalSearch">
                  <InlineIcon id="i-search" />
                  <input
                    id="globalSearch"
                    type="search"
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="topbar-actions">
              <button className="pill-button" type="button" onClick={() => (session.paired ? showAuthGate("auth") : router.push("/initialsetup"))}>
                <InlineIcon id="i-shield" />
                <span>{session.paired ? "Connection" : "Pair Storefront"}</span>
              </button>
              <span className={`sync-status ${syncStatus.mode}`.trim()}>{syncStatus.text}</span>
              <button className="pill-button" type="button" onClick={handleRefresh} disabled={!session.accessToken || refreshing}>
                <InlineIcon id="i-refresh-cw" />
                <span>{refreshing ? "Refreshing" : "Refresh"}</span>
              </button>
              <button className="pill-button" type="button" onClick={() => switchPage("consultations")}>
                <InlineIcon id="i-calendar" />
                <span>{formatTopbarDate()}</span>
              </button>
              <button className="icon-button" type="button" onClick={() => switchPage("audit")}><InlineIcon id="i-bell" /></button>
              <button className="icon-button" type="button" onClick={() => switchPage("settings")}><InlineIcon id="i-settings" /></button>
              <button className="user-chip user-chip-button" type="button" onClick={() => switchPage("profile")}>
                <div className="user-avatar">
                  {getInitials(session.user?.display_name || siteName)}
                </div>
                <div className="user-meta">
                  <strong>{session.user?.display_name || siteName}</strong>
                  <span>{session.user?.roles?.join(", ") || (session.paired ? "Paired frontend" : "WordPress pairing required")}</span>
                </div>
              </button>
            </div>
          </header>

          <div className="pages-stack">
            {showPageSkeleton ? renderPageSkeleton() : (
              <>
            {currentPage === "overview" && (
              <section className="page-view active">
                <section className="metrics-grid">
                  <article className="metric-card lime">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-cart" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("orders")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">Gross sales</span>
                    <strong>{formatMoney(sales.month || 0)}</strong>
                    <small><InlineIcon id="i-arrow-up-right" /> {formatMoney(sales.today || 0)} processed today</small>
                  </article>
                  <article className="metric-card mint">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-stethoscope" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("consultations")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">Appointments in progress</span>
                    <strong>{formatNumber(appointmentInProgress)}</strong>
                    <small>{formatNumber(consultations.confirmed || 0)} confirmed and {formatNumber(consultations.requested || 0)} requested</small>
                  </article>
                  <article className="metric-card rose">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-clipboard" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("prescriptions")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">RX holds</span>
                    <strong>{formatNumber(rxHolds)}</strong>
                    <small>{formatNumber(prescriptionsSummary.draft || 0)} draft and {formatNumber(prescriptionsSummary.expired || 0)} expired</small>
                  </article>
                  <article className="metric-card violet">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-mail" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("emails")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">Email failure rate</span>
                    <strong>{formatPercent(emailFailureRate)}</strong>
                    <small>{formatNumber(emailsSummary.failed_today || 0)} failed of {formatNumber(emailTotal)} processed today</small>
                  </article>
                </section>

                <section className="analytics-grid">
                  <article className="panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Commerce + care</p>
                        <h2>Weekly revenue and order velocity</h2>
                      </div>
                      <div className="segmented">
                        <button className={`segment ${trendMode === "week" ? "active" : ""}`} type="button" onClick={() => setTrendMode("week")}>Week</button>
                        <button
                          className={`segment ${trendMode === "live" ? "active" : ""}`}
                          type="button"
                          onClick={() => {
                            setTrendMode("live");
                            handleRefresh();
                          }}
                        >
                          Live
                        </button>
                      </div>
                    </div>
                    <div className="chart-scroll">
                    <div className="bar-chart">
                      {trendSeries.map((day, index) => (
                        <div className="bar-col" key={`${trendMode}-${day.label || "slot"}-${index}`}>
                          <div className="bar-shell">
                            <div
                              className={`bar-fill ${day.placeholder ? "placeholder" : ""}`}
                              style={{ height: `${Math.max(16, (day.total / chartMax) * 190)}px`, backgroundColor: chartColors[index] }}
                            />
                          </div>
                          <div className="bar-note">
                            <strong>{formatMoney(day.total)}</strong>
                            <span>{day.label}</span>
                            <small>{day.volume ? `${formatNumber(day.volume)} orders` : (trendMode === "live" ? "Waiting for updates" : "No orders")}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Operational mix</p>
                        <h2>Order and prescription states</h2>
                      </div>
                      <button className="icon-button" type="button" onClick={() => switchPage("audit")}><InlineIcon id="i-filter" /></button>
                    </div>
                    <div className="mix-layout">
                      <div className="donut-wrap">
                        <div className="donut-chart">
                          <svg className="donut-svg" viewBox="0 0 140 140" aria-hidden="true">
                            <circle className="donut-track" cx="70" cy="70" r="54" />
                            {donutSegments.map((item) => (
                              <circle
                                key={item.label}
                                className={`donut-segment ${item.color}`}
                                cx="70"
                                cy="70"
                                r="54"
                                strokeDasharray={item.dasharray}
                                strokeDashoffset={item.dashoffset}
                              />
                            ))}
                          </svg>
                          <div className="donut-center">
                            <span>Total active</span>
                            <strong>{formatNumber(legendItems.reduce((sum, item) => sum + Number(item.value), 0))}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="legend-list">
                        {legendItems.map((item) => (
                          <div className="legend-item" key={item.label}>
                            <span className={`legend-swatch ${item.color}`} />
                            <div><strong>{item.label}</strong><span>{formatNumber(item.value)}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </section>

                <section className="overview-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Priority queue</p>
                        <h2>Immediate operational focus</h2>
                      </div>
                    </div>
                    <div className="priority-list">
                      {urgentItems.map((item) => (
                        <button className="priority-card" key={item.label} type="button" onClick={() => switchPage(item.action)}>
                          <span>{item.label}</span>
                          <strong>{formatNumber(item.value)}</strong>
                          <small>{item.note}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Catalog controls</p>
                        <h2>Products by badge and type</h2>
                      </div>
                    </div>
                    {renderCatalogBlock()}
                  </article>
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Clinical team</p>
                        <h2>Doctors and patient access</h2>
                      </div>
                    </div>
                    {renderTeamBlock()}
                  </article>
                </section>

                <section className="overview-grid overview-grid-secondary">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Today's appointments</p>
                        <h2>Closest consultation slots</h2>
                      </div>
                      <button className="pill-button" type="button" onClick={() => switchPage("consultations")}>Open board</button>
                    </div>
                    <div className="signal-list">
                      {todayAppointments.length ? todayAppointments.map((item) => (
                        <div className="signal-row" key={item.id}>
                          <div>
                            <strong>{patientLabel(item.patient_user_id)}</strong>
                            <span>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</span>
                          </div>
                          <div className="signal-meta">
                            <StatusPill value={item.status}>{item.status}</StatusPill>
                            <small>{formatDate(item.start_at, true)}</small>
                          </div>
                        </div>
                      )) : <div className="muted">No appointments scheduled for today.</div>}
                    </div>
                  </article>
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Comms</p>
                        <h2>Email delivery health</h2>
                      </div>
                    </div>
                    {renderEmailBlock()}
                  </article>
                </section>
                </section>
            )}

            {currentPage === "orders" && (
              <section className="page-view active">
                <section className="page-banner panel">
                  <div>
                    <p className="section-kicker">Order operations</p>
                    <h2>Prescription-sensitive order queue</h2>
                    <p className="hero-text">Review WooCommerce orders that intersect with RX validation, payment state, or fulfillment risk.</p>
                  </div>
                  <div className="banner-stats">
                    <div className="mini-stat"><span>Orders loaded</span><strong>{formatNumber(filteredOrders.length)}</strong><small>scoped by current search</small></div>
                    <div className="mini-stat"><span>RX holds</span><strong>{formatNumber(rxHolds)}</strong><small>need release or linkage</small></div>
                  </div>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Fulfillment queue</p>
                      <h2>Orders requiring operational review</h2>
                    </div>
                    <div className="toolbar">
                      <button className="pill-button" type="button">Needs RX</button>
                      <button className="pill-button" type="button">Awaiting payment</button>
                      <button className="pill-button" type="button">Doctor follow-up</button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Patient</th>
                          <th>Product mix</th>
                          <th>Prescription</th>
                          <th>Status</th>
                          <th>Value</th>
                          <th>Next action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length ? filteredOrders.map((order) => {
                          const prescription = (data.prescriptionDetails || []).find((item) => item.id === order.prescription_id);
                          return (
                            <tr
                              key={order.id}
                              className={`interactive-row ${selectedOrderId === order.id ? "active" : ""}`}
                              onClick={() => openOrderDetails(order.id)}
                            >
                              <td><div className="table-title"><strong>#{order.number}</strong><span className="muted">{formatDate(order.created_at, true)}</span></div></td>
                              <td><div className="table-title"><strong>{patientLabel(order.customer_id)}</strong><span className="muted">WordPress user {order.customer_id || "guest"}</span></div></td>
                              <td>{(order.items || []).length ? `${order.items.length} items: ${(order.items || []).slice(0, 2).map((item) => item.name).join(", ")}` : "order details unavailable"}</td>
                              <td>{prescription ? `${prescription.prescription_number} • ${prescription.status}` : (order.prescription_id ? `Prescription #${order.prescription_id}` : "No linked prescription")}</td>
                              <td><StatusPill value={order.rx_status || order.status}>{order.rx_status || order.status}</StatusPill></td>
                              <td>{formatMoney(order.total || 0, order.currency || "USD")}</td>
                              <td>{order.assigned_doctor?.display_name || (order.rx_status === "on_hold" ? "Release hold" : (order.prescription_id ? "Review linkage" : "Assign doctor"))}</td>
                            </tr>
                          );
                        }) : (
                          <tr><td colSpan="7" className="muted">No orders match the current search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section
                  className={`panel order-detail-panel order-modal ${orderModalOpen ? "is-open" : "is-hidden"}`}
                  role="dialog"
                  aria-modal="true"
                  aria-label={selectedOrderDetail ? `Order #${selectedOrderDetail.number}` : "Order details"}
                >
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Order workspace</p>
                      <h2>{selectedOrderDetail ? `Order #${selectedOrderDetail.number}` : "Select an order"}</h2>
                    </div>
                    {selectedOrderDetail ? (
                      <div className="toolbar">
                        <button className="pill-button" type="button" onClick={() => switchPage("prescriptions")}>Open prescriptions</button>
                        <button className="pill-button" type="button" onClick={() => switchPage("consultations")}>Open consultations</button>
                        <button className="icon-button" type="button" aria-label="Close order details" onClick={() => setOrderModalOpen(false)}>
                          <InlineIcon id="i-x" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {orderDetailLoading ? (
                    renderOrderDetailSkeleton()
                  ) : selectedOrderDetail ? (
                    <div className="order-detail-page">
                      <div className="order-detail-header">
                        <div>
                          <p className="section-kicker">Header section</p>
                          <h3>Order #{selectedOrderDetail.number}</h3>
                          <div className="order-detail-meta">
                            <StatusPill value={selectedOrderDetail.status}>{formatStatusLabel(selectedOrderDetail.status)}</StatusPill>
                            <span>{formatDate(selectedOrderDetail.created_at, true)}</span>
                            <span>Payment: {formatStatusLabel(selectedOrderDetail.payment_status)}</span>
                          </div>
                        </div>
                        <div className="order-detail-actions">
                          <button className="pill-button" type="button" onClick={printSelectedOrder}>
                            <InlineIcon id="i-printer" />
                            Print Invoice
                          </button>
                          <button className="button-primary" type="button" onClick={saveSelectedOrder} disabled={orderMutationLoading}>
                            <InlineIcon id="i-package" />
                            {orderMutationLoading ? "Updating..." : "Update Status"}
                          </button>
                          <button className="pill-button" type="button" onClick={refundSelectedOrder} disabled={orderMutationLoading}>
                            <InlineIcon id="i-refresh-cw" />
                            Refund
                          </button>
                          <button className="pill-button" type="button" onClick={contactSelectedCustomer}>
                            <InlineIcon id="i-mail" />
                            Contact Customer
                          </button>
                          {!selectedOrderDetail.assigned_doctor_user_id ? (
                            <button className="pill-button" type="button" onClick={assignSelectedOrderDoctor} disabled={orderMutationLoading || !selectedOrderDoctorId}>
                              <InlineIcon id="i-user" />
                              Assign Doctor
                            </button>
                          ) : null}
                          <button className="pill-button danger" type="button" onClick={deleteSelectedOrder} disabled={orderMutationLoading}>
                            Delete Order
                          </button>
                        </div>
                      </div>
                      <div className="order-detail-grid">
                        <div className="order-detail-stack">
                          <div className="order-summary-grid">
                            {[
                              { label: "Total Amount", value: formatMoney(selectedOrderDetail.totals?.subtotal || 0, selectedOrderDetail.currency || "USD"), note: "item subtotal before adjustments" },
                              { label: "Items Count", value: formatNumber(itemQuantityTotal(selectedOrderDetail)), note: `${formatNumber(selectedOrderDetail.totals?.items_count || (selectedOrderDetail.items || []).length)} distinct line items` },
                              { label: "Shipping Fee", value: formatMoney((selectedOrderDetail.totals?.shipping_total || 0) + (selectedOrderDetail.totals?.shipping_tax || 0), selectedOrderDetail.currency || "USD"), note: "shipping and shipping tax" },
                              { label: "Discount Applied", value: formatMoney(selectedOrderDetail.totals?.discount_total || 0, selectedOrderDetail.currency || "USD"), note: "line and order discounts" },
                              { label: "Tax/VAT", value: formatMoney(selectedOrderDetail.totals?.tax_total || 0, selectedOrderDetail.currency || "USD"), note: "tax across all items" },
                              { label: "Final Payable Amount", value: formatMoney(selectedOrderDetail.totals?.grand_total || selectedOrderDetail.total || 0, selectedOrderDetail.currency || "USD"), note: selectedOrderDetail.rx_status ? `RX: ${formatStatusLabel(selectedOrderDetail.rx_status)}` : "order grand total" }
                            ].map((metric) => (
                              <div className="mini-stat order-mini-stat" key={metric.label}>
                                <span>{metric.label}</span>
                                <strong>{metric.value}</strong>
                                <small>{metric.note}</small>
                              </div>
                            ))}
                          </div>
                          <div className="detail-section">
                            <div className="panel-header">
                              <div>
                                <p className="section-kicker">Products</p>
                                <h3>Product list</h3>
                              </div>
                            </div>
                            <div className="table-scroll">
                              <table className="order-products-table">
                                <thead>
                                  <tr>
                                    <th>Product Image</th>
                                    <th>Product Name</th>
                                    <th>SKU</th>
                                    <th>Quantity</th>
                                    <th>Unit Price</th>
                                    <th>Discount</th>
                                    <th>Total Price</th>
                                    <th>Stock Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedOrderDetail.items || []).length ? selectedOrderDetail.items.map((item) => (
                                    <tr key={item.id}>
                                      <td>
                                        <div className="order-product-media">
                                          {item.image_url ? <img src={item.image_url} alt={item.name} className="order-product-image" /> : <div className="order-product-image order-product-fallback"><InlineIcon id="i-package" /></div>}
                                        </div>
                                      </td>
                                      <td>
                                        <div className="table-title">
                                          <strong>{item.name}</strong>
                                          <span className="muted">{item.rx_required ? "Doctor review required" : "Standard fulfilment"}</span>
                                        </div>
                                      </td>
                                      <td>{item.sku || "n/a"}</td>
                                      <td>{formatNumber(item.quantity)}</td>
                                      <td>{formatMoney(item.unit_price || 0, selectedOrderDetail.currency || "USD")}</td>
                                      <td>{formatMoney(item.discount_total || 0, selectedOrderDetail.currency || "USD")}</td>
                                      <td>{formatMoney(item.total || 0, selectedOrderDetail.currency || "USD")}</td>
                                      <td><StatusPill value={item.stock_status || "info"}>{formatStatusLabel(item.stock_status || (item.rx_required ? "rx required" : "available"))}</StatusPill></td>
                                    </tr>
                                  )) : (
                                    <tr><td colSpan="8" className="muted">No line items available.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="order-clinical-grid">
                            <div className="detail-section">
                              <div className="panel-header">
                                <div>
                                  <p className="section-kicker">Assigned doctor</p>
                                  <h3>{selectedOrderDetail.assigned_doctor?.display_name || "Unassigned"}</h3>
                                </div>
                              </div>
                              <div className="detail-list">
                                <div className="detail-item-card">
                                  <strong>{selectedOrderDetail.assigned_doctor?.email || "No doctor email available"}</strong>
                                  <span className="muted">{selectedOrderDoctorProfile?.specialties?.length ? selectedOrderDoctorProfile.specialties.join(", ") : "No specialty metadata available"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="detail-section">
                              <div className="panel-header">
                                <div>
                                  <p className="section-kicker">Doctor's prescription</p>
                                  <h3>{selectedOrderPrescription?.prescription_number || "No linked prescription"}</h3>
                                </div>
                              </div>
                              {selectedOrderPrescription ? (
                                <div className="detail-list">
                                  <div className="detail-item-card">
                                    <strong>{formatStatusLabel(selectedOrderPrescription.status)}</strong>
                                    <span className="muted">{selectedOrderPrescription.diagnosis || "No diagnosis recorded."}</span>
                                  </div>
                                  <div className="detail-item-card">
                                    <strong>Instructions</strong>
                                    <span className="muted">{selectedOrderPrescription.instructions || "No prescription instructions recorded."}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="muted">No prescription is linked to this order yet.</div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="order-detail-stack">
                          <div className="detail-section">
                            <div className="panel-header">
                              <div>
                                <p className="section-kicker">Customer Information Card</p>
                                <h3>{customerFullName(selectedOrderDetail)}</h3>
                              </div>
                            </div>
                            <div className="detail-list">
                              <div className="detail-item-card"><strong>Full Name</strong><span className="muted">{customerFullName(selectedOrderDetail)}</span></div>
                              <div className="detail-item-card"><strong>Email Address</strong><span className="muted">{selectedOrderDetail.billing?.email || "No email on file"}</span></div>
                              <div className="detail-item-card"><strong>Phone Number</strong><span className="muted">{selectedOrderDetail.billing?.phone || "No phone number on file"}</span></div>
                              <div className="detail-item-card"><strong>Delivery Address</strong><span className="muted">{formatAddress(selectedOrderDetail.shipping)}</span></div>
                              <div className="detail-item-card"><strong>Customer Notes</strong><span className="muted">{selectedOrderNote || "No customer note recorded."}</span></div>
                            </div>
                          </div>
                          <div className="detail-section">
                            <div className="panel-header">
                              <div>
                                <p className="section-kicker">Order controls</p>
                                <h3>Operational updates</h3>
                              </div>
                            </div>
                            <div className="detail-form-grid">
                              <label className="detail-field">
                                <span>Order Status</span>
                                <div className="select-wrap">
                                  <select value={selectedOrderStatus} onChange={(event) => setSelectedOrderStatus(event.target.value)}>
                                    {["pending", "awaiting-doctor", "awaiting-prescription", "processing", "on-hold", "completed", "cancelled", "failed", "refunded"].map((status) => (
                                      <option key={status} value={status}>{formatStatusLabel(status)}</option>
                                    ))}
                                  </select>
                                </div>
                              </label>
                              <label className="detail-field">
                                <span>Doctor Assignment</span>
                                <div className="select-wrap">
                                  <select value={selectedOrderDoctorId} onChange={(event) => setSelectedOrderDoctorId(event.target.value)} disabled={Boolean(selectedOrderDetail.assigned_doctor_user_id)}>
                                    <option value="">Select doctor</option>
                                    {(data.doctors || []).map((doctor) => (
                                      <option key={doctor.user_id} value={doctor.user_id}>{doctor.display_name}</option>
                                    ))}
                                  </select>
                                </div>
                              </label>
                              <label className="detail-field detail-field-wide">
                                <span>Customer Note</span>
                                <textarea value={selectedOrderNote} onChange={(event) => setSelectedOrderNote(event.target.value)} rows={4} />
                              </label>
                            </div>
                            {orderActionFeedback ? <div className="muted order-feedback">{orderActionFeedback}</div> : null}
                          </div>
                          <div className="detail-section">
                            <div className="panel-header">
                              <div>
                                <p className="section-kicker">Order notes</p>
                                <h3>Timeline</h3>
                              </div>
                            </div>
                            <div className="detail-list">
                              {(selectedOrderDetail.order_notes || []).length ? selectedOrderDetail.order_notes.map((note) => (
                                <div className="detail-item-card" key={note.id}>
                                  <strong>{formatDate(note.created_at, true)}</strong>
                                  <span className="muted">{note.content}</span>
                                </div>
                              )) : <div className="muted">No order notes recorded.</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="muted">Choose an order from the table to edit it, delete it, or assign a doctor.</div>
                  )}
                </section>
              </section>
            )}

            {currentPage === "payments" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Payment summary</p>
                        <h2>Revenue state</h2>
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      <div className="mini-stat"><span>Month revenue</span><strong>{formatMoney(sales.month || 0)}</strong><small>WooCommerce totals from dashboard</small></div>
                      <div className="mini-stat"><span>Today revenue</span><strong>{formatMoney(sales.today || 0)}</strong><small>processed today</small></div>
                      <div className="mini-stat"><span>Completed payments</span><strong>{formatNumber(paymentRows.filter((row) => row.paymentStatus === "completed").length)}</strong><small>current loaded set</small></div>
                      <div className="mini-stat"><span>Orders on hold</span><strong>{formatNumber(paymentRows.filter((row) => ["on_hold", "on-hold"].includes(row.rxStatus)).length)}</strong><small>payment blocked by RX workflow</small></div>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Payment ledger</p>
                      <h2>Order-level payment visibility</h2>
                    </div>
                    <div className="toolbar">
                      <button className="pill-button" type="button">Captured</button>
                      <button className="pill-button" type="button">Pending</button>
                      <button className="pill-button" type="button">RX blocked</button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Amount</th>
                          <th>Payment</th>
                          <th>RX state</th>
                          <th>Created</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentRows.length ? paymentRows.map((row) => (
                          <tr key={row.id}>
                            <td>#{row.number}</td>
                            <td>{row.customerLabel}</td>
                            <td>{formatMoney(row.amount, row.currency)}</td>
                            <td><StatusPill value={row.paymentStatus}>{row.paymentStatus}</StatusPill></td>
                            <td><StatusPill value={row.rxStatus}>{row.rxStatus}</StatusPill></td>
                            <td>{formatDate(row.createdAt, true)}</td>
                            <td>{row.actionLabel}</td>
                          </tr>
                        )) : <tr><td colSpan="7" className="muted">No payment rows match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "customers" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Patient and customer footprint</p>
                        <h2>Derived customer directory</h2>
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      <div className="mini-stat"><span>Visible customers</span><strong>{formatNumber(customerRows.length)}</strong><small>derived from orders, appointments, and prescriptions</small></div>
                      <div className="mini-stat"><span>Repeat customers</span><strong>{formatNumber(customerRows.filter((row) => row.orders > 1).length)}</strong><small>more than one order in current dataset</small></div>
                      <div className="mini-stat"><span>With prescriptions</span><strong>{formatNumber(customerRows.filter((row) => row.prescriptions > 0).length)}</strong><small>linked to active pharmacy workflow</small></div>
                      <div className="mini-stat"><span>With appointments</span><strong>{formatNumber(customerRows.filter((row) => row.appointments > 0).length)}</strong><small>consultation touchpoints</small></div>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Customer list</p>
                      <h2>Operational relationship snapshot</h2>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Email</th>
                          <th>Orders</th>
                          <th>Spend</th>
                          <th>Prescriptions</th>
                          <th>Appointments</th>
                          <th>Last activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerRows.length ? customerRows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.label}</td>
                            <td>{row.email}</td>
                            <td>{formatNumber(row.orders)}</td>
                            <td>{formatMoney(row.spend)}</td>
                            <td>{formatNumber(row.prescriptions)}</td>
                            <td>{formatNumber(row.appointments)}</td>
                            <td>{formatDate(row.lastActivity, true)}</td>
                          </tr>
                        )) : <tr><td colSpan="7" className="muted">No customer rows match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "consultations" && (
              <section className="page-view active">
                <section className="dual-table-grid">
                  <article className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Consultation flow</p>
                        <h2>Appointment status board</h2>
                      </div>
                      <button className="pill-button" type="button">Today only</button>
                    </div>
                    <div className="status-columns">
                      {appointmentLanes.map((lane) => {
                        const items = filteredAppointments
                          .filter((item) => lane.statuses ? lane.statuses.includes(item.status) : item.status === lane.key)
                          .slice(0, 4);
                        return (
                          <div className="status-lane" key={lane.label}>
                            <div className="lane-head">
                              <div><strong>{lane.label}</strong><div className="muted">{items.length} items</div></div>
                              <StatusPill value={lane.key} className="audit-pill">{formatNumber(items.length)}</StatusPill>
                            </div>
                            <div className="lane-list">
                              {items.length ? items.map((item) => (
                                <div className="lane-card" key={item.id}>
                                  <strong>{patientLabel(item.patient_user_id)}</strong>
                                  <small><span>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</span><span>{formatDate(item.start_at, true)}</span></small>
                                  <div className="muted">{item.reason || item.type}</div>
                                </div>
                              )) : <div className="lane-card"><div className="muted">No appointments in this lane.</div></div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>

                  <article className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Prescription history</p>
                        <h2>Recent assignment events</h2>
                      </div>
                      <button className="pill-button" type="button" onClick={() => switchPage("prescriptions")}>Open RX page</button>
                    </div>
                    <div className="history-list">
                      {sortedHistory.length ? sortedHistory.map((item, index) => {
                        const prescription = (data.prescriptionDetails || []).find((entry) => entry.id === item.prescription_id);
                        return (
                          <article className="history-card" key={`${item.prescription_id}-${item.created_at}-${index}`}>
                            <div className="history-meta">
                              <strong>{prescription?.prescription_number || `Prescription #${item.prescription_id}`}</strong>
                              <StatusPill value={item.new_status || item.action} className="audit-pill">{formatDate(item.created_at, true)}</StatusPill>
                            </div>
                            <p>{item.action} moved {item.previous_status || "new"} to {item.new_status}.</p>
                            <span>Actor user #{item.actor_user_id}{item.note ? ` • ${item.note}` : ""}</span>
                          </article>
                        );
                      }) : <article className="history-card"><p>No prescription history is available yet.</p></article>}
                    </div>
                  </article>
                </section>
              </section>
            )}

            {currentPage === "prescriptions" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Prescription program</p>
                        <h2>Status summary</h2>
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      <div className="mini-stat"><span>Draft</span><strong>{formatNumber(prescriptionsSummary.draft || 0)}</strong><small>awaiting issue review</small></div>
                      <div className="mini-stat"><span>Assigned</span><strong>{formatNumber(prescriptionsSummary.assigned || 0)}</strong><small>patient notification queue</small></div>
                      <div className="mini-stat"><span>Fulfilled</span><strong>{formatNumber(prescriptionsSummary.fulfilled || 0)}</strong><small>completed medication flow</small></div>
                      <div className="mini-stat"><span>Expired</span><strong>{formatNumber(prescriptionsSummary.expired || 0)}</strong><small>needs renewal handling</small></div>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Prescription registry</p>
                      <h2>Current patient medication instructions</h2>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Prescription</th>
                          <th>Patient</th>
                          <th>Doctor</th>
                          <th>Status</th>
                          <th>Issued</th>
                          <th>Valid until</th>
                          <th>Diagnosis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPrescriptions.length ? filteredPrescriptions.map((item) => (
                          <tr key={item.id}>
                            <td>{item.prescription_number || `Prescription #${item.id}`}</td>
                            <td>{patientLabel(item.patient_user_id)}</td>
                            <td>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</td>
                            <td><StatusPill value={item.status}>{item.status}</StatusPill></td>
                            <td>{formatDate(item.issued_at || item.created_at, true)}</td>
                            <td>{formatDate(item.valid_until)}</td>
                            <td>{item.diagnosis || "Diagnosis not recorded"}</td>
                          </tr>
                        )) : <tr><td colSpan="7" className="muted">No prescriptions match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "products" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Catalog controls</p>
                        <h2>Rule coverage</h2>
                      </div>
                    </div>
                    {renderCatalogBlock()}
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Product controls</p>
                      <h2>Medication visibility and fulfillment rules</h2>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Badge</th>
                          <th>RX rule</th>
                          <th>Consultation</th>
                          <th>OTC</th>
                          <th>Visibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.length ? filteredProducts.map((product) => {
                          const rules = product.pharmacy_rules || {};
                          return (
                            <tr key={product.id}>
                              <td>{product.name || `Product #${product.id}`}</td>
                              <td>{product.sku || "n/a"}</td>
                              <td>{product.badge?.label || product.badge?.key || "standard"}</td>
                              <td><StatusPill value={rules.rx_required ? "warning" : "success"}>{rules.rx_required ? "Required" : "Not required"}</StatusPill></td>
                              <td><StatusPill value={rules.consultation_required ? "warning" : "info"}>{rules.consultation_required ? "Required" : "Optional"}</StatusPill></td>
                              <td><StatusPill value={rules.otc ? "success" : "info"}>{rules.otc ? "OTC" : "Controlled"}</StatusPill></td>
                              <td>{rules.restricted_visibility ? "Restricted" : "Public catalog"}</td>
                            </tr>
                          );
                        }) : <tr><td colSpan="7" className="muted">No products match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "doctors" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Clinical team</p>
                        <h2>Doctor capacity and role coverage</h2>
                      </div>
                    </div>
                    {renderTeamBlock()}
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Doctor directory</p>
                      <h2>Assigned practitioners</h2>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Doctor</th>
                          <th>Email</th>
                          <th>Specialty</th>
                          <th>Location</th>
                          <th>Status</th>
                          <th>Accepting patients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDoctors.length ? filteredDoctors.map((doctor) => (
                          <tr key={doctor.user_id || doctor.id}>
                            <td>{doctor.display_name || `Doctor #${doctor.user_id || doctor.id}`}</td>
                            <td>{doctor.email || "n/a"}</td>
                            <td>{doctor.specialty || "General practice"}</td>
                            <td>{doctor.location || "Nevari network"}</td>
                            <td><StatusPill value={doctor.telehealth_enabled ? "success" : "info"}>{doctor.telehealth_enabled ? "Telehealth on" : "Telehealth off"}</StatusPill></td>
                            <td>{doctor.accepting_patients ? "Yes" : "No"}</td>
                          </tr>
                        )) : <tr><td colSpan="6" className="muted">No doctors match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "emails" && (
              <section className="page-view active">
                <section className="operations-grid single-page-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Comms</p>
                        <h2>Email delivery health</h2>
                      </div>
                    </div>
                    {renderEmailBlock()}
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Messaging</p>
                      <h2>Recent email log</h2>
                    </div>
                    <div className="toolbar">
                      <button className="pill-button" type="button">Assignment notices</button>
                      <button className="pill-button" type="button">Failures</button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Recipient</th>
                          <th>Template</th>
                          <th>Related object</th>
                          <th>Provider</th>
                          <th>Status</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmails.length ? filteredEmails.map((email, index) => (
                          <tr key={`${email.recipient_email}-${email.created_at || index}`}>
                            <td>{email.recipient_email}</td>
                            <td>{email.template_key || "custom"}</td>
                            <td>{email.related_object_type || "n/a"}{email.related_object_id ? ` #${email.related_object_id}` : ""}</td>
                            <td>{email.provider || "provider n/a"}</td>
                            <td><StatusPill value={email.status}>{email.status}</StatusPill></td>
                            <td>{formatDate(email.sent_at || email.failed_at || email.queued_at || email.created_at, true)}</td>
                          </tr>
                        )) : <tr><td colSpan="6" className="muted">No email log entries match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "audit" && (
              <section className="page-view active">
                <section className="panel audit-panel">
                  <div className="panel-header audit-header">
                    <div>
                      <p className="section-kicker">Compliance</p>
                      <h2>Audit center</h2>
                    </div>
                    <div className="toolbar">
                      <label className="select-wrap">
                        <span>Status</span>
                        <select value={audit.status} onChange={(event) => setAudit((prev) => ({ ...prev, status: event.target.value }))}>
                          <option value="all">All</option>
                          <option value="success">Success</option>
                          <option value="error">Error</option>
                        </select>
                      </label>
                      <label className="select-wrap">
                        <span>Source</span>
                        <select value={audit.source} onChange={(event) => setAudit((prev) => ({ ...prev, source: event.target.value }))}>
                          <option value="all">All</option>
                          <option value="woocommerce">WooCommerce</option>
                          <option value="nevari">Nevari</option>
                          <option value="wordpress">WordPress</option>
                          <option value="system">System</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="audit-tabs">
                    {["orders", "payments", "security", "consultation", "emails"].map((category) => (
                      <button
                        key={category}
                        className={`audit-tab ${category === audit.category ? "active" : ""}`}
                        type="button"
                        onClick={() => setAudit((prev) => ({ ...prev, category }))}
                      >
                        {category.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="audit-layout">
                    <div className="audit-table-wrap">
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Status</th>
                              <th>Severity</th>
                              <th>Source</th>
                              <th>Action</th>
                              <th>Actor</th>
                              <th>Object</th>
                              <th>Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.auditEvents.length ? data.auditEvents.map((event, index) => (
                              <tr
                                key={`${event.request_id || event.created_at}-${index}`}
                                className={`audit-row ${selectedAuditIndex === index ? "active" : ""}`}
                                onClick={() => setSelectedAuditIndex(index)}
                              >
                                <td>{formatDate(event.created_at, true)}</td>
                                <td><StatusPill value={event.status === "error" ? "error" : event.severity} className="audit-pill">{event.status}</StatusPill></td>
                                <td>{event.severity}</td>
                                <td>{event.source}</td>
                                <td>{event.action}</td>
                                <td><div className="table-title"><strong>{event.actor_user_id ? `User #${event.actor_user_id}` : "system"}</strong><span className="muted">{event.actor_role || "n/a"}</span></div></td>
                                <td>{event.object_type || "n/a"}{event.object_id ? ` #${event.object_id}` : ""}</td>
                                <td>{event.message || event.error_message || "No message"}</td>
                              </tr>
                            )) : <tr><td colSpan="8" className="muted">No audit events match the current filters.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <aside className="audit-detail">
                      {!selectedAuditEvent ? (
                        <div className="audit-detail-empty">
                          <span className="detail-icon"><InlineIcon id="i-shield" /></span>
                          <strong>Select an event</strong>
                          <p>View metadata, request id, IP address, and related pharmacy objects.</p>
                        </div>
                      ) : (
                        <div className="audit-detail-content">
                          <div>
                            <span className="section-kicker">Event detail</span>
                            <h3>{selectedAuditEvent.action}</h3>
                          </div>
                          <StatusPill value={selectedAuditEvent.status === "error" ? "error" : selectedAuditEvent.severity} className="audit-pill">
                            {selectedAuditEvent.status} • {selectedAuditEvent.severity}
                          </StatusPill>
                          <div className="detail-grid">
                            <div className="detail-block"><span>Timestamp</span><strong>{formatDate(selectedAuditEvent.created_at, true)}</strong></div>
                            <div className="detail-block"><span>Source</span><strong>{selectedAuditEvent.source}</strong></div>
                            <div className="detail-block"><span>Actor</span><strong>{selectedAuditEvent.actor_user_id ? `User #${selectedAuditEvent.actor_user_id}` : "system"}</strong></div>
                            <div className="detail-block"><span>Role</span><strong>{selectedAuditEvent.actor_role || "n/a"}</strong></div>
                            <div className="detail-block"><span>Request ID</span><strong>{selectedAuditEvent.request_id || "n/a"}</strong></div>
                            <div className="detail-block"><span>IP Address</span><strong>{selectedAuditEvent.actor_ip || "n/a"}</strong></div>
                          </div>
                          <div className="meta-block"><span>Message</span><pre>{selectedAuditEvent.message || selectedAuditEvent.error_message || "No message stored."}</pre></div>
                          <div className="meta-block"><span>Metadata JSON</span><pre>{JSON.stringify(selectedAuditEvent.metadata || {}, null, 2)}</pre></div>
                        </div>
                      )}
                    </aside>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "settings" && (
              <section className="page-view active">
                <section className="page-banner panel">
                  <div>
                    <p className="section-kicker">Storefront settings</p>
                    <h2>Connection and session state</h2>
                    <p className="hero-text">This page keeps the operational frontend grounded in the paired WordPress environment without touching the auth screens.</p>
                  </div>
                  <div className="banner-actions">
                    <button className="button-primary" type="button" onClick={() => showAuthGate("auth")}>Manage session</button>
                    <button className="pill-button" type="button" onClick={handleLogout}>Clear tokens</button>
                  </div>
                </section>
                <section className="settings-grid">
                  {settingsCards.map((card) => (
                    <article className="mini-stat" key={card.label}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.note}</small>
                    </article>
                  ))}
                </section>
              </section>
            )}

            {currentPage === "profile" && (
              <section className="page-view active">
                <section className="page-banner panel">
                  <div>
                    <p className="section-kicker">Profile</p>
                    <h2>Storefront account and identity</h2>
                    <p className="hero-text">Review the current signed-in user, paired environment, and storefront identity in one place.</p>
                  </div>
                  <div className="banner-actions">
                    <button className="button-primary" type="button" onClick={() => showAuthGate("auth")}>Manage session</button>
                    <button className="pill-button" type="button" onClick={() => switchPage("settings")}>Open settings</button>
                  </div>
                </section>
                <section className="settings-grid profile-grid">
                  {profileCards.map((card) => (
                    <article className="mini-stat" key={card.label}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.note}</small>
                    </article>
                  ))}
                </section>
              </section>
            )}
              </>
            )}
          </div>
        </main>
      </div>

      <div className="auth-gate" hidden={!authGate.visible}>
        <div className="auth-gate-shell">
          <section className="auth-card auth-screen-card">
            <div className="auth-card-body">
              <div className="auth-intro">
                <img className="auth-logo" src="/ne.webp" alt="Storefront logo" />
                <h1 className="auth-title">
                  {authView === "reset" ? "Reset your password" : "Signin to your storefront"}
                </h1>
              </div>
              <section hidden={authGate.stage !== "auth"}>
                {authView === "login" ? (
                  <form className="auth-form auth-reference-form" onSubmit={handleLoginSubmit}>
                    <label className="form-group">
                      <span>Username or email</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-user" /></span>
                        <input
                          name="loginIdentifier"
                          type="text"
                          autoComplete="off"
                          required
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                        />
                      </div>
                    </label>
                    <label className="form-group">
                      <span>Password</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-lock" /></span>
                        <input
                          name="password"
                          type={passwordVisible ? "text" : "password"}
                          autoComplete="off"
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <button className="input-suffix" type="button" onClick={() => setPasswordVisible((prev) => !prev)}>
                          {passwordVisible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </label>
                    <div className="auth-actions">
                      <button className="auth-primary-button" type="submit" disabled={authSubmitting}>
                        {authSubmitting ? "Signing in..." : "Sign In"}
                      </button>
                    </div>
                    <div className="auth-inline-links">
                      <button className="auth-text-link" type="button" onClick={() => setAuthView("reset")}>
                        Reset password
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="auth-form auth-reference-form" onSubmit={handleResetSubmit}>
                    <label className="form-group">
                      <span>Username or email</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-user" /></span>
                        <input
                          name="resetUsername"
                          type="text"
                          autoComplete="username email"
                          required
                          value={resetUsername}
                          onChange={(event) => setResetUsername(event.target.value)}
                        />
                      </div>
                    </label>
                    <div className="auth-actions">
                      <button className="auth-primary-button" type="submit" disabled={resetSubmitting}>
                        {resetSubmitting ? "Submitting..." : "Send Reset Link"}
                      </button>
                    </div>
                    <div className="auth-inline-links">
                      <button className="auth-text-link" type="button" onClick={() => setAuthView("login")}>
                        Back to login
                      </button>
                    </div>
                  </form>
                )}
                <p className="auth-feedback">{authFeedback}</p>
              </section>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
