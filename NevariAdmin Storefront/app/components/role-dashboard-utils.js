"use client";

import { DEFAULT_NEVARI_BASE_URL, FRONTENDS } from "./frontend-config";
import { createPairingRequiredError, isPairingRequiredPayload, performGlobalLogout, resetToPairingState } from "./role-session";

export const STORAGE_KEY = FRONTENDS.patient.storageKey;
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_EXPIRY_SKEW_MS = 30 * 1000;
const STORE_CURRENCY_KEY = "nevari_store_currency";
const STORE_TIMEZONE_KEY = "nevari_store_timezone";
const FALLBACK_STORE_CURRENCY = "USD";
const FALLBACK_STORE_TIMEZONE = "UTC";
const SESSION_MARKER = "server-session";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveRuntimeBaseUrl(value) {
  const configured = configuredBaseUrl(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || "");
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    return configured;
  }
  if (normalized === normalizeBaseUrl(DEFAULT_NEVARI_BASE_URL) && configured !== normalized) {
    return configured;
  }
  return normalized;
}

function configuredBaseUrl(value) {
  return normalizeBaseUrl(value || DEFAULT_NEVARI_BASE_URL);
}

function currentOriginValue() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin === "null" ? "null" : window.location.origin;
}

export const DEFAULT_SESSION = {
  baseUrl: resolveRuntimeBaseUrl(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || ""),
  frontendType: FRONTENDS.patient.type,
  frontendOrigin: "",
  frontendUrl: "",
  paired: true,
  siteName: "",
  siteLogo: "",
  accessToken: "",
  refreshToken: "",
  expiresAt: 0,
  user: null
};

export function isSessionUsable(session) {
  if (!session || typeof session !== "object") {
    return false;
  }
  const hasAccessToken = Boolean(String(session.accessToken || "").trim());
  const expiresAt = Number(session.expiresAt || 0);
  return hasAccessToken && Number.isFinite(expiresAt) && Date.now() < (expiresAt - SESSION_EXPIRY_SKEW_MS);
}

export function hydrateStoredSession(frontend = "patient") {
  if (typeof window === "undefined") {
    return DEFAULT_SESSION;
  }
  try {
    const config = FRONTENDS[frontend] || FRONTENDS.patient;
    const ownSession = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
    if (ownSession.accessToken && ownSession.accessToken !== SESSION_MARKER) {
      ownSession.accessToken = "";
      ownSession.refreshToken = "";
      ownSession.expiresAt = 0;
      ownSession.user = null;
      localStorage.setItem(config.storageKey, JSON.stringify(ownSession));
    }
    const adminSession = JSON.parse(localStorage.getItem(FRONTENDS.admin.storageKey) || "{}");
    const isSharedFrontend = config.type !== FRONTENDS.admin.type;
    const sharedConnection = isSharedFrontend ? {
      baseUrl: resolveRuntimeBaseUrl(ownSession.baseUrl || adminSession.baseUrl || process.env.NEXT_PUBLIC_NEVARI_BASE_URL || ""),
      frontendOrigin: ownSession.frontendOrigin || adminSession.frontendOrigin || "",
      frontendUrl: ownSession.frontendUrl || adminSession.frontendUrl || "",
      paired: true,
      siteName: ownSession.siteName || adminSession.siteName || "",
      siteLogo: ownSession.siteLogo || adminSession.siteLogo || ""
    } : {};
    const nextSession = { ...DEFAULT_SESSION, ...sharedConnection, ...ownSession, frontendType: config.type };

    if (isSharedFrontend) {
      nextSession.baseUrl = resolveRuntimeBaseUrl(sharedConnection.baseUrl);
      nextSession.paired = true;
      nextSession.siteName = sharedConnection.siteName;
      nextSession.siteLogo = sharedConnection.siteLogo;
    }

    nextSession.baseUrl = resolveRuntimeBaseUrl(nextSession.baseUrl);
    nextSession.paired = true;

    nextSession.frontendOrigin = currentOriginValue();
    nextSession.frontendUrl = nextSession.frontendOrigin === "null" ? "null" : window.location.href;

    if (!isSessionUsable(nextSession)) {
      return { ...nextSession, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
    }

    return nextSession;
  } catch {
    return DEFAULT_SESSION;
  }
}

export function buildUrl(session, path, params = {}) {
  const url = new URL("/api/nevari-proxy", window.location.origin);
  url.searchParams.set("baseUrl", String(session.baseUrl || "").replace(/\/+$/, ""));
  url.searchParams.set("path", path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function createApiError(payload, response) {
  const error = new Error(payload?.error?.message || "Request failed.");
  error.code = payload?.error?.code || "";
  error.status = response?.status || 0;
  error.details = payload?.error?.details || null;
  return error;
}

function frontendConfigForSession(session) {
  return Object.values(FRONTENDS).find((frontend) => frontend.type === session?.frontendType) || FRONTENDS.patient;
}

function isUnauthorizedPayload(payload, response) {
  const status = Number(response?.status || 0);
  const code = String(payload?.error?.code || payload?.code || "").trim().toLowerCase();
  return status === 401 || status === 403 || code === "session_expired" || code === "rest_forbidden" || code === "forbidden";
}

function forceSessionLogout(session) {
  if (typeof window === "undefined") {
    return;
  }
  const frontend = frontendConfigForSession(session);
  clearDashboardCacheForFrontend(frontend === FRONTENDS.patient ? "patient" : frontend.type, session?.user?.id);
  performGlobalLogout(frontend, session).finally(() => {
    window.location.replace(frontend.loginPath);
  });
}

export async function apiRequest(session, path, { method = "GET", params = {}, body, suppressHttpError = false } = {}) {
  const requestParams = suppressHttpError ? { ...params, softFail: "1" } : params;
  const response = await fetch(buildUrl(session, path, requestParams), {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType,
      "X-Nevari-Frontend-Origin": currentOriginValue()
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (isPairingRequiredPayload(payload)) {
    resetToPairingState();
    throw createPairingRequiredError(payload?.error?.message || payload?.message);
  }
  if (isUnauthorizedPayload(payload, response)) {
    forceSessionLogout(session);
    throw createApiError(payload, response);
  }
  if ((!response.ok || !payload?.success) && !suppressHttpError) {
    throw createApiError(payload, response);
  }
  if (!response.ok || !payload?.success) {
    return null;
  }
  return payload.data;
}

/** Downloads a binary endpoint (PDF/ICS) through the signed proxy and returns it as a Blob. */
export async function apiFileRequest(session, path, params = {}) {
  const response = await fetch(buildUrl(session, path, params), {
    headers: {
      Accept: "application/pdf",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType,
      "X-Nevari-Frontend-Origin": currentOriginValue()
    }
  });
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("application/pdf")) {
    const payload = await response.json().catch(() => null);
    throw createApiError(payload, response);
  }
  return response.blob();
}

export function describeDashboardFetchError(error) {
  const code = String(error?.code || "");
  const status = Number(error?.status || error?.details?.status || 0);
  const message = String(error?.message || "");

  if (code === "upstream_unavailable" || status === 503) {
    return "The pharmacy server is temporarily unavailable. Some live dashboard sections could not be loaded.";
  }
  if (code === "upstream_timeout" || status === 504) {
    return "The pharmacy server is responding too slowly. Some live dashboard sections could not be loaded.";
  }
  if (code === "upstream_unreachable" || status === 502) {
    return "The pharmacy server could not be reached. Check connectivity and WordPress availability.";
  }
  return message || "Request failed.";
}

export function buildDashboardCacheKey(frontend, scope = "dashboard", userId = "anonymous") {
  return `nevari:${frontend}:${scope}:${userId}`;
}

export function readDashboardCache(key, maxAgeMs = DASHBOARD_CACHE_TTL_MS) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    window.localStorage.removeItem(key);
    const cached = JSON.parse(window.sessionStorage.getItem(key) || "null");
    if (!cached?.cachedAt || !cached?.data) {
      return null;
    }
    if (maxAgeMs > 0 && (Date.now() - Number(cached.cachedAt)) > maxAgeMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

export function clearDashboardCacheForFrontend(frontend, userId) {
  if (typeof window === "undefined") {
    return;
  }
  const prefix = `nevari:${frontend}:`;
  const resolvedUserId = String(userId || "anonymous");
  const keysToRemove = [];
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(prefix)) {
        continue;
      }
      if (key.endsWith(`:${resolvedUserId}`) || key.includes(":dashboard:")) {
        keysToRemove.push([storage, key]);
      }
    }
  });
  keysToRemove.forEach(([storage, key]) => storage.removeItem(key));
}

export function writeDashboardCache(key, data) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      cachedAt: Date.now(),
      data
    }));
  } catch {}
}

export function rememberStoreContext(context = {}) {
  if (typeof window === "undefined") {
    return;
  }
  const currency = normalizeCurrency(context.store_currency || context.currency);
  const timezone = normalizeTimeZone(context.store_timezone || context.timezone);
  if (currency) {
    window.localStorage.setItem(STORE_CURRENCY_KEY, currency);
  }
  if (timezone) {
    window.localStorage.setItem(STORE_TIMEZONE_KEY, timezone);
  }
}

export function storedStoreCurrency() {
  if (typeof window === "undefined") {
    return FALLBACK_STORE_CURRENCY;
  }
  return normalizeCurrency(window.localStorage.getItem(STORE_CURRENCY_KEY)) || FALLBACK_STORE_CURRENCY;
}

export function storedStoreTimeZone() {
  if (typeof window === "undefined") {
    return FALLBACK_STORE_TIMEZONE;
  }
  return normalizeTimeZone(window.localStorage.getItem(STORE_TIMEZONE_KEY)) || FALLBACK_STORE_TIMEZONE;
}

export function money(value, currency = storedStoreCurrency()) {
  const resolvedCurrency = normalizeCurrency(currency) || storedStoreCurrency();
  return new Intl.NumberFormat("en-US", { style: "currency", currency: resolvedCurrency }).format(Number(value || 0));
}

export function shortDate(value, withTime = false, timeZone = storedStoreTimeZone()) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone) || storedStoreTimeZone(),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined
  }).format(new Date(value));
}

export function titleCase(value) {
  return String(value || "n/a").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function fitTextToContainer(element, { minFontSize = 18, step = 0.5 } = {}) {
  if (!element || typeof window === "undefined") {
    return;
  }

  const style = window.getComputedStyle(element);
  const baseFontSize = Number.parseFloat(element.dataset.baseFontSize || style.fontSize);
  if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) {
    return;
  }

  element.dataset.baseFontSize = String(baseFontSize);
  element.style.fontSize = `${baseFontSize}px`;

  let fontSize = baseFontSize;
  let attempts = 0;
  while (attempts < 40 && fontSize > minFontSize && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)) {
    fontSize = Math.max(minFontSize, fontSize - step);
    element.style.fontSize = `${fontSize}px`;
    attempts += 1;
  }
}

function normalizeOrderTypeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function flattenOrderText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => flattenOrderText(item)).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return flattenOrderText(
      value.name
      || value.label
      || value.title
      || value.product_name
      || value.service_name
      || value.item_name
      || value.type
    );
  }
  return String(value || "").trim();
}

function collectOrderSearchText(order = {}) {
  return [
    order?.order_type,
    order?.type,
    order?.kind,
    order?.service_type,
    order?.meta?.order_type,
    order?.meta?.service_type,
    order?.meta?.kind,
    order?.appointment_id,
    order?.consultation_id,
    order?.meeting_url,
    order?.meeting_link,
    order?.google_meet_link,
    order?.meet_link,
    order?.customer_note,
    order?.order_note,
    order?.notes,
    order?.reason,
    order?.items_summary,
    order?.items,
    order?.line_items
  ].map((item) => flattenOrderText(item)).filter(Boolean).join(" ").toLowerCase();
}

export function getOrderTypeMeta(order = {}) {
  const explicitType = normalizeOrderTypeValue(
    order?.order_type
    || order?.type
    || order?.kind
    || order?.service_type
    || order?.meta?.order_type
    || order?.meta?.service_type
    || order?.meta?.kind
  );
  const consultationMarkers = [
    "consultation",
    "consult",
    "appointment",
    "telehealth",
    "telemedicine",
    "video-consultation",
    "video-consult",
    "online-consultation"
  ];
  const productMarkers = [
    "product",
    "products",
    "goods",
    "retail",
    "prescription",
    "rx"
  ];

  if (consultationMarkers.some((marker) => explicitType === marker || explicitType.includes(marker))) {
    return {
      key: "consultation",
      label: "Consultation",
      tone: "warning",
      description: "Consultation-linked order"
    };
  }

  if (productMarkers.some((marker) => explicitType === marker || explicitType.includes(marker))) {
    return {
      key: "product",
      label: "Product order",
      tone: "success",
      description: "Product order"
    };
  }

  const searchableText = collectOrderSearchText(order);
  if (/consultation|appointment|telehealth|telemedicine|google meet|meet\.google\.com/i.test(searchableText)) {
    return {
      key: "consultation",
      label: "Consultation",
      tone: "warning",
      description: "Consultation-linked order"
    };
  }

  return {
    key: "product",
    label: "Product order",
    tone: "success",
    description: "Product order"
  };
}

export function monthGrid(selectedDate, markedDates = new Set()) {
  const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      day: date.getDate(),
      muted: date.getMonth() !== selectedDate.getMonth(),
      selected: key === selectedDate.toISOString().slice(0, 10),
      marked: markedDates.has(key)
    };
  });
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return "";
  }
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(0);
    return currency;
  } catch {
    return "";
  }
}

function normalizeTimeZone(value) {
  const timeZone = String(value || "").trim();
  if (!timeZone) {
    return "";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "";
  }
}
