"use client";

import { FRONTENDS } from "./frontend-config";

export const PAIRING_REQUIRED_ERROR_CODE = "frontend_pairing_required";

export function defaultSession(config) {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  const href = hasWindow ? window.location.href : "";
  return {
    baseUrl: "",
    frontendType: config.type,
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

export function loadSession(config) {
  if (typeof window === "undefined") {
    return defaultSession(config);
  }
  try {
    const ownSession = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
    const adminSession = JSON.parse(localStorage.getItem("nevari_admin_storefront_session") || "{}");
    const isSharedFrontend = config.type !== "storefront";
    const sharedConnection = isSharedFrontend ? {
      baseUrl: adminSession.baseUrl || "",
      frontendOrigin: adminSession.frontendOrigin || "",
      frontendUrl: adminSession.frontendUrl || "",
      paired: Boolean(adminSession.paired),
      siteName: adminSession.siteName || "",
      siteLogo: adminSession.siteLogo || ""
    } : {};
    const nextSession = { ...defaultSession(config), ...sharedConnection, ...ownSession, frontendType: config.type };

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
    return defaultSession(config);
  }
}

export function isPairingRequiredPayload(payload) {
  const code = String(payload?.code || payload?.error?.code || "");
  const message = String(payload?.error?.message || payload?.message || "");
  return code === "untrusted_frontend" || /not paired with the pharmacy installation/i.test(message);
}

export function createPairingRequiredError(message = "This frontend is not paired with the pharmacy installation.") {
  const error = new Error(message);
  error.code = PAIRING_REQUIRED_ERROR_CODE;
  return error;
}

export function isPairingRequiredError(error) {
  return error?.code === PAIRING_REQUIRED_ERROR_CODE || /not paired with the pharmacy installation/i.test(String(error?.message || ""));
}

export function clearStoredSessions() {
  if (typeof window === "undefined") {
    return;
  }

  Object.values(FRONTENDS).forEach((frontend) => {
    localStorage.removeItem(frontend.storageKey);
  });
}

export function resetToPairingState() {
  clearStoredSessions();

  if (typeof window !== "undefined") {
    window.location.replace(FRONTENDS.admin.setupPath);
  }
}

export function saveSession(config, session) {
  localStorage.setItem(config.storageKey, JSON.stringify(session));
}

export function buildUrl(session, path) {
  const url = new URL("/api/nevari-proxy", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", String(session.baseUrl || "").replace(/\/+$/, ""));
  url.searchParams.set("path", path);
  return url.toString();
}

export function frontendContext(session) {
  return {
    frontend_type: session.frontendType,
    frontend_origin: session.frontendOrigin,
    frontend_url: session.frontendUrl
  };
}
