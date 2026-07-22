import { isAllowedUrl, isValidId, sanitizeText } from "../../lib/inputValidation";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function cookieName(frontendType) {
  return `nevari_access_${String(frontendType || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`;
}

export function requestCookie(request, name) {
  const fromNextRequest = request.cookies?.get?.(name)?.value;
  if (fromNextRequest) return fromNextRequest;
  const match = String(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function assertFrontendRequest(request) {
  const requestOrigin = new URL(request.url).origin;
  const frontendOrigin = normalizeBaseUrl(request.headers.get("x-nevari-frontend-origin"));
  const origin = normalizeBaseUrl(request.headers.get("origin"));
  if (!frontendOrigin || frontendOrigin !== requestOrigin || (origin && origin !== requestOrigin)) {
    throw new Error("Same-origin frontend request is required.");
  }
}

function proxyUrl(origin, baseUrl, path) {
  const url = new URL("/api/nevari-proxy", origin);
  url.searchParams.set("baseUrl", normalizeBaseUrl(baseUrl));
  url.searchParams.set("path", path);
  return url.toString();
}

export function buildFrontendSession(request, url, frontendType, baseUrl) {
  const session = {
    baseUrl: sanitizeText(baseUrl || "", { max: 300 }),
    accessToken: requestCookie(request, cookieName(frontendType)),
    frontendType: sanitizeText(frontendType || "patient", { max: 40 }),
    frontendOrigin: url.origin,
  };
  return session;
}

export function validateFrontendSession(session) {
  if (!isAllowedUrl(session.baseUrl)) {
    return Response.json({ success: false, error: { message: "Invalid backend URL." } }, { status: 422 });
  }
  if (!session.baseUrl || !session.accessToken) {
    return Response.json({ success: false, error: { message: "Authenticated session is required." } }, { status: 401 });
  }
  return null;
}

export function assertCsrfRequest(request) {
  const cookie = requestCookie(request, "nevari_csrf");
  const header = String(request.headers.get("x-nevari-csrf") || "").trim();
  if (!cookie || !header || cookie !== header) {
    const error = new Error("CSRF validation failed.");
    error.status = 403;
    throw error;
  }
}

export async function proxyRawRequest(origin, session, path, { method = "GET", body, headers = {} } = {}) {
  return fetch(proxyUrl(origin, session.baseUrl, path), {
    method,
    headers: {
      Accept: headers.Accept || "application/json",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType || "patient",
      "X-Nevari-Frontend-Origin": session.frontendOrigin || origin,
      ...headers,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
}

export async function proxyRequest(origin, session, path, { method = "GET", body } = {}) {
  const response = await fetch(proxyUrl(origin, session.baseUrl, path), {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType || "patient",
      "X-Nevari-Frontend-Origin": session.frontendOrigin || origin,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const error = new Error(payload?.error?.message || "MTM request could not be processed.");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function validateRequestId(requestId) {
  return isValidId(requestId);
}
