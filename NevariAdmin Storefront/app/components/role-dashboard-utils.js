"use client";

import { FRONTENDS } from "./frontend-config";
import { createPairingRequiredError, isPairingRequiredPayload, resetToPairingState } from "./role-session";

export const STORAGE_KEY = FRONTENDS.patient.storageKey;
export const DEFAULT_SESSION = {
  baseUrl: "",
  frontendType: FRONTENDS.patient.type,
  frontendOrigin: "",
  frontendUrl: "",
  paired: false,
  siteName: "",
  siteLogo: "",
  accessToken: "",
  refreshToken: "",
  expiresAt: 0,
  user: null
};

export function hydrateStoredSession(frontend = "patient") {
  if (typeof window === "undefined") {
    return DEFAULT_SESSION;
  }
  try {
    const config = FRONTENDS[frontend] || FRONTENDS.patient;
    const ownSession = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
    const adminSession = JSON.parse(localStorage.getItem(FRONTENDS.admin.storageKey) || "{}");
    const isSharedFrontend = config.type !== FRONTENDS.admin.type;
    const sharedConnection = isSharedFrontend ? {
      baseUrl: adminSession.baseUrl || "",
      frontendOrigin: adminSession.frontendOrigin || "",
      frontendUrl: adminSession.frontendUrl || "",
      paired: Boolean(adminSession.paired),
      siteName: adminSession.siteName || "",
      siteLogo: adminSession.siteLogo || ""
    } : {};
    const nextSession = { ...DEFAULT_SESSION, ...sharedConnection, ...ownSession, frontendType: config.type };

    if (isSharedFrontend) {
      nextSession.baseUrl = sharedConnection.baseUrl;
      nextSession.paired = sharedConnection.paired;
      nextSession.siteName = sharedConnection.siteName;
      nextSession.siteLogo = sharedConnection.siteLogo;
    }

    if (isSharedFrontend) {
      nextSession.frontendOrigin = window.location.origin === "null" ? "null" : window.location.origin;
      nextSession.frontendUrl = window.location.origin === "null" ? "null" : window.location.href;
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

export async function apiRequest(session, path, { method = "GET", params = {}, body, suppressHttpError = false } = {}) {
  const response = await fetch(buildUrl(session, path, params), {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType,
      "X-Nevari-Frontend-Origin": session.frontendOrigin || window.location.origin
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (isPairingRequiredPayload(payload)) {
    resetToPairingState();
    throw createPairingRequiredError(payload?.error?.message || payload?.message);
  }
  if ((!response.ok || !payload?.success) && !suppressHttpError) {
    throw new Error(payload?.error?.message || "Request failed.");
  }
  if (!response.ok || !payload?.success) {
    return null;
  }
  return payload.data;
}

export function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

export function shortDate(value, withTime = false) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
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
