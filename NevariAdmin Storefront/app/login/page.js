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

function formatTopbarDate() {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
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
  const url = new URL(`${normalizeBaseUrl(session.baseUrl)}/wp-json/${API_NAMESPACE}${path}`);
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
  const [data, setData] = useState(emptyData);
  const [audit, setAudit] = useState({ category: "orders", status: "all", source: "all" });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedAuditIndex, setSelectedAuditIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authGate, setAuthGate] = useState({ visible: true, stage: "setup" });
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

      setData({
        dashboard: dashboardPayload.data || {},
        orders,
        orderDetails,
        appointments: appointmentsPayload.data || [],
        prescriptions,
        prescriptionDetails,
        prescriptionHistory,
        emails: emailsPayload.data || [],
        doctors: doctorsPayload.data || [],
        products: productsPayload.data || [],
        auditEvents: []
      });

      await fetchAuditEvents(activeSession, audit, deferredSearch);
      setSyncStatus({
        text: `Live • ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
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

  const dashboard = data.dashboard || {};
  const sales = dashboard.sales || {};
  const consultations = dashboard.consultations || {};
  const prescriptionsSummary = dashboard.prescriptions || {};
  const emailsSummary = dashboard.emails || {};
  const doctorMap = new Map((data.doctors || []).map((doctor) => [doctor.user_id || doctor.id, doctor.display_name]));
  const query = deferredSearch.trim().toLowerCase();
  const siteName = session.siteName || DEFAULT_SITE_NAME;
  const siteLogo = session.siteLogo || "/ne.webp";

  const rxHolds = (data.orderDetails || []).filter((order) => ["on_hold", "on-hold"].includes(order.rx_status || order.status)).length;
  const appointmentInProgress = Number(consultations.requested || 0) + Number(consultations.confirmed || 0);
  const emailTotal = Number(emailsSummary.sent_today || 0) + Number(emailsSummary.failed_today || 0);
  const emailFailureRate = emailTotal ? (Number(emailsSummary.failed_today || 0) / emailTotal) * 100 : 0;

  const revenueDays = (() => {
    const orders = data.orderDetails || [];
    const now = new Date();
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(now.getDate() - offset);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const total = orders
        .filter((order) => {
          const created = new Date(order.created_at);
          return !Number.isNaN(created.getTime()) && created >= day && created < next;
        })
        .reduce((sum, order) => sum + Number(order.total || 0), 0);
      days.push({
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        total
      });
    }
    return days;
  })();

  const chartMax = Math.max(...revenueDays.map((day) => day.total), 1);
  const chartColors = ["#b9996d", "#d99860", "#d8cab6", "#344a6e", "#5c6d89", "#adb7c8", "#b9996d"];

  const legendItems = [
    { color: "teal", label: "Orders awaiting review", value: (data.orderDetails || []).filter((order) => ["pending", "on-hold"].includes(order.status)).length },
    { color: "rose", label: "Assigned prescriptions", value: prescriptionsSummary.assigned || 0 },
    { color: "lime", label: "Completed consultations", value: consultations.completed || 0 },
    { color: "violet", label: "Email failures today", value: emailsSummary.failed_today || 0 }
  ];

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
    return normalizeText(searchText).includes(query);
  });

  const filteredEmails = (data.emails || []).filter((email) =>
    normalizeText(`${email.recipient_email} ${email.template_key} ${email.status} ${email.related_object_type} ${email.provider}`).includes(query)
  );

  const filteredAppointments = (data.appointments || []).filter((appointment) =>
    normalizeText(`${appointment.status} ${appointment.reason} ${appointment.type} ${appointment.patient_user_id} ${appointment.doctor_user_id}`).includes(query)
  );

  const filteredPrescriptions = (data.prescriptionDetails || []).filter((prescription) =>
    normalizeText(`${prescription.prescription_number} ${prescription.status} ${prescription.patient_user_id} ${prescription.doctor_user_id} ${prescription.diagnosis}`).includes(query)
  );

  const filteredProducts = (data.products || []).filter((product) => {
    const rules = product.pharmacy_rules || {};
    return normalizeText(`${product.name} ${product.sku} ${product.badge?.label} ${product.badge?.key} ${product.stock_status} ${rules.rx_required} ${rules.otc} ${rules.consultation_required}`).includes(query);
  });

  const filteredDoctors = (data.doctors || []).filter((doctor) =>
    normalizeText(`${doctor.display_name} ${doctor.email} ${doctor.specialty} ${doctor.location} ${doctor.user_id}`).includes(query)
  );

  const paymentRows = filteredOrders.map((order) => {
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
      .filter((row) => normalizeText(`${row.label} ${row.email} ${row.id}`).includes(query))
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
              <label className="search-field" htmlFor="globalSearch">
                <InlineIcon id="i-search" />
                <input
                  id="globalSearch"
                  type="search"
                  placeholder="Search order, patient, doctor, product, audit event"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
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
              <button className="pill-button" type="button">
                <InlineIcon id="i-calendar" />
                <span>{formatTopbarDate()}</span>
              </button>
              <button className="icon-button" type="button"><InlineIcon id="i-bell" /></button>
              <button className="icon-button" type="button" onClick={() => switchPage("settings")}><InlineIcon id="i-settings" /></button>
              <div className="user-chip">
                <div className="user-avatar">
                  {getInitials(session.user?.display_name || siteName)}
                </div>
                <div className="user-meta">
                  <strong>{session.user?.display_name || siteName}</strong>
                  <span>{session.user?.roles?.join(", ") || (session.paired ? "Paired frontend" : "WordPress pairing required")}</span>
                </div>
              </div>
            </div>
          </header>

          <div className="pages-stack">
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
                        <button className="segment active" type="button">Week</button>
                        <button className="segment" type="button">Live</button>
                      </div>
                    </div>
                    <div className="bar-chart">
                      {revenueDays.map((day, index) => (
                        <div className="bar-col" key={day.label}>
                          <div className="bar-shell">
                            <div className="bar-fill" style={{ height: `${Math.max(16, (day.total / chartMax) * 190)}px`, backgroundColor: chartColors[index] }} />
                          </div>
                          <div className="bar-note">
                            <strong>{formatMoney(day.total)}</strong>
                            <span>{day.label}</span>
                          </div>
                        </div>
                      ))}
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
                        <p className="section-kicker">Today’s appointments</p>
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
                            <tr key={order.id}>
                              <td><div className="table-title"><strong>#{order.number}</strong><span className="muted">{formatDate(order.created_at, true)}</span></div></td>
                              <td><div className="table-title"><strong>{patientLabel(order.customer_id)}</strong><span className="muted">WordPress user {order.customer_id || "guest"}</span></div></td>
                              <td>{(order.items || []).length ? `${order.items.length} items: ${(order.items || []).slice(0, 2).map((item) => item.name).join(", ")}` : "order details unavailable"}</td>
                              <td>{prescription ? `${prescription.prescription_number} • ${prescription.status}` : (order.prescription_id ? `Prescription #${order.prescription_id}` : "No linked prescription")}</td>
                              <td><StatusPill value={order.rx_status || order.status}>{order.rx_status || order.status}</StatusPill></td>
                              <td>{formatMoney(order.total || 0, order.currency || "USD")}</td>
                              <td>{order.rx_status === "on_hold" ? "Release hold" : (order.prescription_id ? "Review linkage" : "Link prescription")}</td>
                            </tr>
                          );
                        }) : (
                          <tr><td colSpan="7" className="muted">No orders match the current search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
