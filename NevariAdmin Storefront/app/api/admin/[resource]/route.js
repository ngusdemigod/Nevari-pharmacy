import { createHmac } from "node:crypto";
import {
  isAllowedUrl,
  sanitizeText
} from "../../../lib/inputValidation";

const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;
const SESSION_MARKER = "server-session";

const RESOURCE_PATHS = {
  orders: "/orders",
  products: "/products",
  customers: "/customers",
  categories: "/products/categories",
  tags: "/products/tags",
  appointments: "/appointments",
  prescriptions: "/prescriptions",
  mtm: "/admin/mtm-requests",
  "iv-therapy": "/pharmacist/iv-therapy-requests",
  "care-iv": "/staff/care-requests/iv-therapy",
  "care-nurse": "/staff/care-requests/nurse",
  users: "/admin/users",
  patients: "/admin/users",
  nurses: "/admin/nurses",
  doctors: "/doctors",
  emails: "/emails/logs",
  audit: "/audit-logs"
};

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigins() {
  return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeBaseUrl(value))
    .filter(Boolean);
}

function cookieName(frontendType) {
  return `nevari_access_${String(frontendType || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`;
}

function requestCookie(request, name) {
  const fromNextRequest = request.cookies?.get?.(name)?.value;
  if (fromNextRequest) return fromNextRequest;
  const match = String(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function assertFrontendRequest(request) {
  const requestOrigin = new URL(request.url).origin;
  const frontendOrigin = normalizeBaseUrl(request.headers.get("x-nevari-frontend-origin"));
  const origin = normalizeBaseUrl(request.headers.get("origin"));
  if (!frontendOrigin || frontendOrigin !== requestOrigin || (origin && origin !== requestOrigin)) {
    throw new Error("Same-origin frontend request is required.");
  }
}

function signedFrontendHeaders(request) {
  const secret = String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
  const frontendType = String(request.headers.get("x-nevari-frontend-type") || "").trim();
  if (!secret) {
    throw new Error("Proxy signing secret is not configured.");
  }
  if (!frontendType) {
    return {};
  }
  const frontendOrigin = new URL(request.url).origin;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${timestamp}\n${frontendType}\n${frontendOrigin}`;
  return {
    "x-nevari-frontend-type": frontendType,
    "x-nevari-frontend-origin": frontendOrigin,
    "x-nevari-proxy-timestamp": timestamp,
    "x-nevari-proxy-signature": createHmac("sha256", secret).update(message).digest("hex")
  };
}

function assertAllowedTarget(target) {
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Unsupported protocol.");
  }

  const allowlist = allowedOrigins();
  if (!allowlist.length || !allowlist.includes(target.origin)) {
    throw new Error("Target origin is not allowed.");
  }
}

export async function GET(request, context) {
  try {
    assertFrontendRequest(request);
    const params = await context.params;
    const resource = sanitizeText(params?.resource, { max: 40 });
    const upstreamPath = RESOURCE_PATHS[resource];
    if (!upstreamPath) {
      return Response.json({ success: false, error: { message: "Unknown admin resource." } }, { status: 404 });
    }

    const requestUrl = new URL(request.url);
    const baseUrl = normalizeBaseUrl(requestUrl.searchParams.get("baseUrl"));
    if (!baseUrl || !isAllowedUrl(baseUrl, allowedOrigins())) {
      return Response.json({ success: false, error: { message: "Missing baseUrl." } }, { status: 400 });
    }

    const target = new URL(`${baseUrl}/wp-json/${API_NAMESPACE}${upstreamPath}`);
    assertAllowedTarget(target);
    requestUrl.searchParams.forEach((value, key) => {
      if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key) || String(value).length > 240 || /[<>{}`]/.test(String(value))) {
        throw new Error("Invalid query parameter.");
      }
      if (key !== "baseUrl") {
        target.searchParams.set(key, sanitizeText(value, { max: 240 }));
      }
    });

    const headers = new Headers();
    ["accept"].forEach((name) => {
      const value = request.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    });
    const frontendType = String(request.headers.get("x-nevari-frontend-type") || "").trim();
    const accessToken = requestCookie(request, cookieName(frontendType));
    const requestedAuthorization = String(request.headers.get("authorization") || "");
    if (accessToken) {
      headers.set("authorization", `Bearer ${accessToken}`);
    } else if (requestedAuthorization && requestedAuthorization !== `Bearer ${SESSION_MARKER}`) {
      headers.set("authorization", requestedAuthorization);
    }
    Object.entries(signedFrontendHeaders(request)).forEach(([name, value]) => headers.set(name, value));

    const response = await fetch(target, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Admin resource request failed." } },
      { status: 400 }
    );
  }
}
