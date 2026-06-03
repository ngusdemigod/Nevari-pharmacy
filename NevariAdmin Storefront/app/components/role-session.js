"use client";

import { FRONTENDS } from "./frontend-config";

export const PAIRING_REQUIRED_ERROR_CODE = "frontend_pairing_required";
export const SESSION_MARKER = "server-session";
const SESSION_EXPIRY_SKEW_MS = 30 * 1000;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function currentOriginValue() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin === "null" ? "null" : window.location.origin;
}

function isSessionUsable(session) {
  if (!session || typeof session !== "object") {
    return false;
  }
  const hasAccessToken = Boolean(String(session.accessToken || "").trim());
  const expiresAt = Number(session.expiresAt || 0);
  return hasAccessToken && Number.isFinite(expiresAt) && Date.now() < (expiresAt - SESSION_EXPIRY_SKEW_MS);
}

function clearAllDashboardCaches() {
  if (typeof window === "undefined") {
    return;
  }
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    const keysToRemove = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith("nevari:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  });
}

export function defaultSession(config) {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? currentOriginValue() : "";
  const href = hasWindow ? window.location.href : "";
  return {
    baseUrl: normalizeBaseUrl(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || ""),
    frontendType: config.type,
    frontendOrigin: origin,
    frontendUrl: origin === "null" ? "null" : href,
    paired: true,
    siteName: "",
    siteLogo: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  };
}

export function loadSession(config) {
  if (typeof window === "undefined") {
    return defaultSession(config);
  }
  try {
    const ownSession = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
    if (ownSession.accessToken && ownSession.accessToken !== SESSION_MARKER) {
      ownSession.accessToken = "";
      ownSession.refreshToken = "";
      ownSession.expiresAt = 0;
      ownSession.user = null;
      localStorage.setItem(config.storageKey, JSON.stringify(ownSession));
    }
    const adminSession = JSON.parse(localStorage.getItem("nevari_admin_storefront_session") || "{}");
    const isSharedFrontend = config.type !== "storefront";
    const sharedConnection = isSharedFrontend ? {
      baseUrl: ownSession.baseUrl || adminSession.baseUrl || normalizeBaseUrl(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || ""),
      frontendOrigin: ownSession.frontendOrigin || adminSession.frontendOrigin || "",
      frontendUrl: ownSession.frontendUrl || adminSession.frontendUrl || "",
      paired: Boolean(ownSession.paired || adminSession.paired),
      siteName: ownSession.siteName || adminSession.siteName || "",
      siteLogo: ownSession.siteLogo || adminSession.siteLogo || ""
    } : {};
    const nextSession = { ...defaultSession(config), ...sharedConnection, ...ownSession, frontendType: config.type };

    if (isSharedFrontend) {
      nextSession.baseUrl = sharedConnection.baseUrl;
      nextSession.paired = true;
      nextSession.siteName = sharedConnection.siteName;
      nextSession.siteLogo = sharedConnection.siteLogo;
    }
    nextSession.paired = true;

    // Origin is request context, not persisted connection data.
    nextSession.frontendOrigin = currentOriginValue();
    nextSession.frontendUrl = nextSession.frontendOrigin === "null" ? "null" : window.location.href;

    if (!isSessionUsable(nextSession)) {
      return { ...nextSession, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
    }

    return nextSession;
  } catch {
    return defaultSession(config);
  }
}

export function isPairingRequiredPayload(payload) {
  return false;
}

export function createPairingRequiredError(message = "This frontend is not paired with the pharmacy installation.") {
  const error = new Error(message);
  error.code = PAIRING_REQUIRED_ERROR_CODE;
  return error;
}

export function isPairingRequiredError(error) {
  return error?.code === PAIRING_REQUIRED_ERROR_CODE;
}

export function clearStoredSessions() {
  if (typeof window === "undefined") {
    return;
  }

  Object.values(FRONTENDS).forEach((frontend) => {
    localStorage.removeItem(frontend.storageKey);
  });
  clearAllDashboardCaches();
}

export function resetToPairingState() {
  clearStoredSessions();

  if (typeof window !== "undefined") {
    window.location.replace(FRONTENDS.admin.loginPath);
  }
}

export function saveSession(config, session) {
  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const safeSession = {
    ...session,
    accessToken: session?.accessToken ? SESSION_MARKER : "",
    refreshToken: session?.refreshToken ? SESSION_MARKER : "",
    user: session?.user ? {
      id: session.user.id || "",
      display_name: session.user.display_name || session.user.name || "",
      email: session.user.email || "",
      role: session.user.role || "",
      roles
    } : null
  };
  localStorage.setItem(config.storageKey, JSON.stringify(safeSession));
}

export function clearSessionAuth(config, session) {
  const nextSession = {
    ...defaultSession(config),
    ...session,
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  };
  saveSession(config, nextSession);
  clearAllDashboardCaches();
  return nextSession;
}

export function buildUrl(session, path) {
  const url = new URL("/api/nevari-proxy", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", String(session.baseUrl || "").replace(/\/+$/, ""));
  url.searchParams.set("path", path);
  return url.toString();
}

export function frontendContext(session) {
  const frontendOrigin = currentOriginValue() || session.frontendOrigin;
  return {
    frontend_type: session.frontendType,
    frontend_origin: frontendOrigin,
    frontend_url: frontendOrigin === "null" ? "null" : (typeof window !== "undefined" ? window.location.href : session.frontendUrl)
  };
}
