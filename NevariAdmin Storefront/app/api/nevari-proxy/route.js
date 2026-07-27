import { createHmac, randomBytes } from "node:crypto";
import {
  isAllowedUrl,
  isValidPath,
  sanitizeText
} from "../../lib/inputValidation";
import { DEFAULT_NEVARI_BASE_URL } from "../../components/frontend-config";
import { verifyRecaptchaToken } from "../../lib/recaptcha-server";

const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;
const UPSTREAM_RETRY_COUNT = 1;
const SOFT_FAIL_TIMEOUT_MS = 8000;
const SOFT_FAIL_RETRY_COUNT = 0;
const inflightGetRequests = new Map();
const SESSION_MARKER = "server-session";
const CSRF_COOKIE_NAME = "nevari_csrf";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function configuredBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL);
}

function resolveLegacyBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  const configured = configuredBaseUrl();
  if (!normalized) {
    return configured;
  }
  if (normalized === "https://demo.nevarihealth.com" && configured && configured !== normalized) {
    return configured;
  }
  return normalized;
}

function allowedOrigins() {
  return Array.from(new Set([
    ...String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => normalizeBaseUrl(value))
      .filter(Boolean),
    configuredBaseUrl(),
    normalizeBaseUrl(DEFAULT_NEVARI_BASE_URL)
  ].filter(Boolean)));
}

function proxySigningSecret() {
  return String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
}

function cookieName(kind, frontendType) {
  return `nevari_${kind}_${String(frontendType || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`;
}

function requestCookie(request, name) {
  const fromNextRequest = request.cookies?.get?.(name)?.value;
  if (fromNextRequest) {
    return fromNextRequest;
  }
  const match = String(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function setSessionCookie(response, request, name, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Number(maxAge || 0))}${secure}`
  );
}

function setCsrfCookie(response, request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; SameSite=Strict; Max-Age=${Math.max(0, Number(maxAge || 0))}${secure}`
  );
}

function assertFrontendRequest(request) {
  const requestOrigin = new URL(request.url).origin;
  const frontendOrigin = normalizeBaseUrl(request.headers.get("x-nevari-frontend-origin"));
  if (!frontendOrigin || frontendOrigin !== requestOrigin) {
    throw new Error("Same-origin frontend request is required.");
  }
  const origin = normalizeBaseUrl(request.headers.get("origin"));
  if (origin && origin !== requestOrigin) {
    throw new Error("Cross-origin proxy requests are not allowed.");
  }
}

function assertCsrf(request, frontendType) {
  const method = String(request.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return;
  }

  const accessToken = requestCookie(request, cookieName("access", frontendType));
  if (!accessToken) {
    return;
  }

  const csrfCookie = requestCookie(request, CSRF_COOKIE_NAME);
  const csrfHeader = String(request.headers.get("x-nevari-csrf") || "").trim();
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new Error("CSRF validation failed.");
  }
}

function signedFrontendHeaders(request) {
  const frontendType = String(request.headers.get("x-nevari-frontend-type") || "").trim();
  if (!frontendType) {
    return {};
  }
  const frontendOrigin = new URL(request.url).origin;
  const headers = {
    "x-nevari-frontend-type": frontendType,
    "x-nevari-frontend-origin": frontendOrigin
  };
  const secret = proxySigningSecret();
  if (!secret) {
    return headers;
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${timestamp}\n${frontendType}\n${frontendOrigin}`;
  headers["x-nevari-proxy-timestamp"] = timestamp;
  headers["x-nevari-proxy-signature"] = createHmac("sha256", secret).update(message).digest("hex");
  return headers;
}

function isPrivateHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.startsWith("10.")
    || normalized.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || normalized.startsWith("169.254.");
}

function assertAllowedTarget(target) {
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Unsupported protocol.");
  }
  if (target.username || target.password) {
    throw new Error("Credentials in target URLs are not allowed.");
  }
  if (isPrivateHostname(target.hostname)) {
    throw new Error("Private network targets are not allowed.");
  }

  const allowlist = allowedOrigins();
  if (!allowlist.length) {
    throw new Error("Proxy allowlist is not configured.");
  }
  if (!allowlist.includes(target.origin)) {
    throw new Error("Target origin is not allowed.");
  }
}

function buildTargetUrl(requestUrl) {
  const url = new URL(requestUrl);
  const baseUrl = resolveLegacyBaseUrl(url.searchParams.get("baseUrl"));
  const path = sanitizeText(url.searchParams.get("path"), { max: 240 });

  if (!baseUrl) {
    throw new Error("Missing baseUrl.");
  }
  if (!isAllowedUrl(baseUrl, allowedOrigins())) {
    throw new Error(`Configured baseUrl is not allowed: ${baseUrl}`);
  }
  if (!path || !isValidPath(path)) {
    throw new Error("Missing path.");
  }

  const target = new URL(`${baseUrl}/wp-json/${API_NAMESPACE}${path}`);
  assertAllowedTarget(target);
  url.searchParams.forEach((value, key) => {
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key) || String(value).length > 500 || /[<>{}`]/.test(String(value))) {
      throw new Error("Invalid query parameter.");
    }
    if (key === "baseUrl" || key === "path" || key === "softFail" || key === "_viewer") {
      return;
    }
    target.searchParams.set(key, sanitizeText(value, { max: 500 }));
  });

  return target;
}

function shouldSoftFail(requestUrl) {
  const url = new URL(requestUrl);
  return url.searchParams.get("softFail") === "1";
}

function softFailStatus(status) {
  return Number(status) >= 500;
}

function assertFrontendPathAccess(frontendType, targetUrl) {
  if (!String(frontendType || "").toLowerCase().includes("pharmacist")) {
    return;
  }
  const marker = `/${API_NAMESPACE}`;
  const path = targetUrl.pathname.includes(marker)
    ? targetUrl.pathname.slice(targetUrl.pathname.indexOf(marker) + marker.length)
    : "";
  const allowed = path.startsWith("/auth/")
    || path.startsWith("/pharmacist/mtm-requests")
    || path === "/pharmacist/availability"
    || path.startsWith("/staff/care-requests/iv-therapy");
  if (!allowed) {
    const error = new Error("Pharmacist sessions can only access assigned clinical resources.");
    error.status = 403;
    throw error;
  }
}

function withSoftFailStatus(status, softFail) {
  return softFail && softFailStatus(status) ? 200 : status;
}

function effectiveAuthorization(headers) {
  if (!headers || typeof headers.get !== "function") {
    return "";
  }
  return String(headers.get("authorization") || "").trim();
}

async function proxyRequest(request, { params } = {}) {
  assertFrontendRequest(request);
  const targetUrl = buildTargetUrl(request.url);
  const softFail = shouldSoftFail(request.url);
  const headers = new Headers();
  const frontendType = String(request.headers.get("x-nevari-frontend-type") || "").trim();
  assertFrontendPathAccess(frontendType, targetUrl);
  assertCsrf(request, frontendType);
  const accessToken = requestCookie(request, cookieName("access", frontendType));
  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(String(request.method || "GET").toUpperCase());
  if (isMutating && !accessToken) {
    const remoteIp = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const verification = await verifyRecaptchaToken(
      request.headers.get("x-nevari-recaptcha-token") || "",
      "public_submit",
      remoteIp
    );
    if (!verification.ok) {
      return Response.json(
        { success: false, error: { code: verification.code, message: "Spam protection verification failed. Please try again." } },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const forwardedHeaders = [
    "accept",
    "content-type",
    "x-nevari-mtm-snapshot-token",
    "x-nevari-mtm-snapshot-fingerprint",
    "x-nevari-content-sha256",
  ];

  forwardedHeaders.forEach((name) => {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  });
  const requestedAuthorization = String(request.headers.get("authorization") || "");
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  } else if (requestedAuthorization && requestedAuthorization !== `Bearer ${SESSION_MARKER}`) {
    headers.set("authorization", requestedAuthorization);
  }
  Object.entries(signedFrontendHeaders(request)).forEach(([name, value]) => headers.set(name, value));
  headers.set("origin", new URL(request.url).origin);

  const init = {
    method: request.method,
    headers
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const binaryPdf = String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/pdf");
    const bodyText = binaryPdf ? "" : await request.text();
    if (targetUrl.pathname.endsWith("/auth/refresh") || targetUrl.pathname.endsWith("/auth/logout") || targetUrl.pathname.endsWith("/sso/logout")) {
      const body = JSON.parse(bodyText || "{}");
      const refreshToken = requestCookie(request, cookieName("refresh", frontendType));
      if (refreshToken) {
        body.refresh_token = refreshToken;
      }
      init.body = JSON.stringify(body);
    } else {
      init.body = binaryPdf ? await request.arrayBuffer() : bodyText;
    }
  }

  let response;
  try {
    response = await fetchWithDedupe(targetUrl, init, request.method, effectiveAuthorization(headers), softFail);
  } catch (error) {
    return buildTransportErrorResponse(error, targetUrl, softFail);
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.set("Cache-Control", "no-store");

  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("text/calendar") || contentType.toLowerCase().includes("application/pdf")) {
    return new Response(response.body, {
      status: withSoftFailStatus(response.status, softFail),
      statusText: response.statusText,
      headers: responseHeaders
    });
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    const rawBody = await response.text();
    const recoveredJson = extractJsonPayload(rawBody);

    if (recoveredJson) {
      return Response.json(recoveredJson, {
        status: withSoftFailStatus(response.status, softFail),
        headers: { "Cache-Control": "no-store" }
      });
    }

    const message = normalizeUpstreamErrorMessage(rawBody, response, targetUrl);
    return Response.json(
      {
        success: false,
        error: {
          code: response.status === 503 ? "upstream_unavailable" : "upstream_non_json_response",
          message,
          details: {
            status: response.status,
            statusText: response.statusText,
            path: targetUrl.pathname,
            upstream: `${targetUrl.origin}${targetUrl.pathname}`
          }
        }
      },
      { status: withSoftFailStatus(response.status || 502, softFail), headers: { "Cache-Control": "no-store" } }
    );
  }

  if (contentType.toLowerCase().includes("application/json")
      && ["/auth/login", "/auth/google-login", "/auth/register-customer", "/auth/verify-code", "/auth/refresh", "/auth/logout", "/sso/logout"].some((path) => targetUrl.pathname.endsWith(path))) {
    const payload = await response.json().catch(() => null);
    const outgoing = Response.json(payload || {}, {
      status: withSoftFailStatus(response.status, softFail),
      headers: responseHeaders
    });
    if (payload?.success && payload?.data?.access_token) {
      setSessionCookie(outgoing, request, cookieName("access", frontendType), payload.data.access_token, payload.data.expires_in || 3600);
      setSessionCookie(outgoing, request, cookieName("refresh", frontendType), payload.data.refresh_token || "", 30 * 24 * 60 * 60);
      setCsrfCookie(outgoing, request, randomBytes(24).toString("hex"), 30 * 24 * 60 * 60);
      payload.data.access_token = SESSION_MARKER;
      payload.data.refresh_token = SESSION_MARKER;
      return Response.json(payload, { status: response.status, headers: outgoing.headers });
    }
    if ((targetUrl.pathname.endsWith("/auth/logout") || targetUrl.pathname.endsWith("/sso/logout")) && payload?.success) {
      setSessionCookie(outgoing, request, cookieName("access", frontendType), "", 0);
      setSessionCookie(outgoing, request, cookieName("refresh", frontendType), "", 0);
      setCsrfCookie(outgoing, request, "", 0);
    }
    return outgoing;
  }

  return new Response(response.body, {
    status: withSoftFailStatus(response.status, softFail),
    statusText: response.statusText,
    headers: responseHeaders
  });
}

async function fetchWithDedupe(targetUrl, init, method, authorization = "", softFail = false) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    return fetchWithRetry(targetUrl, init, method, softFail);
  }

  const dedupeKey = `${normalizedMethod}:${targetUrl.toString()}:${authorization || ""}:${softFail ? "soft" : "hard"}`;
  if (inflightGetRequests.has(dedupeKey)) {
    return inflightGetRequests.get(dedupeKey);
  }

  const requestPromise = fetchWithRetry(targetUrl, init, method, softFail).finally(() => {
    inflightGetRequests.delete(dedupeKey);
  });
  inflightGetRequests.set(dedupeKey, requestPromise);
  return requestPromise;
}

async function fetchWithRetry(targetUrl, init, method, softFail = false) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const timeoutMs = softFail ? SOFT_FAIL_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS;
  const retryCount = softFail ? SOFT_FAIL_RETRY_COUNT : UPSTREAM_RETRY_COUNT;
  const maxAttempts = ["GET", "HEAD"].includes(normalizedMethod) ? retryCount + 1 : 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(targetUrl, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      lastError = error;
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      if (!isTimeout || attempt >= maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  throw lastError;
}

export async function GET(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: Number(error?.status || 400) }
    );
  }
}

export async function POST(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: Number(error?.status || 400) }
    );
  }
}

export async function PUT(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: Number(error?.status || 400) }
    );
  }
}

export async function DELETE(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: Number(error?.status || 400) }
    );
  }
}

export async function PATCH(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: Number(error?.status || 400) }
    );
  }
}

function htmlToTextMessage(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonPayload(value) {
  const text = String(value || "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function normalizeUpstreamErrorMessage(rawBody, response, targetUrl) {
  const text = htmlToTextMessage(rawBody);

  if (response.status === 503) {
    return "The pharmacy server is temporarily unavailable. Dashboard data could not be refreshed right now.";
  }

  return text || `WordPress returned ${response.status} for ${targetUrl.pathname}.`;
}

function buildTransportErrorResponse(error, targetUrl, softFail = false) {
  const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
  const status = isTimeout ? 504 : 502;

  return Response.json(
    {
      success: false,
      error: {
        code: isTimeout ? "upstream_timeout" : "upstream_unreachable",
        message: isTimeout
          ? "The pharmacy server took too long to respond. Try again shortly."
          : "Oops.. Connection error, Check your internet connection",
        details: {
          status,
          path: targetUrl.pathname,
          upstream: `${targetUrl.origin}${targetUrl.pathname}`
        }
      }
    },
    { status: withSoftFailStatus(status, softFail), headers: { "Cache-Control": "no-store" } }
  );
}
