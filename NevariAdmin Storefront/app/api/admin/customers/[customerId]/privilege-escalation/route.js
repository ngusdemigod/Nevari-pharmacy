import { createHmac } from "node:crypto";
import {
  isAllowedUrl,
  isValidId,
  rejectUnknownFields,
  sanitizeText
} from "../../../../../lib/inputValidation";

const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;
const SESSION_MARKER = "server-session";
const ALLOWED_TARGET_ROLES = new Set(["doctor", "pharmacist", "customer"]);

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

function buildTarget(baseUrl, path) {
  const target = new URL(`${normalizeBaseUrl(baseUrl)}/wp-json/${API_NAMESPACE}${path}`);
  assertAllowedTarget(target);
  return target;
}

function resolveRoles(record = null) {
  const collect = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(collect);
    if (typeof value === "object") {
      return Object.entries(value).flatMap(([key, nested]) => (
        nested === true || nested === 1 || nested === "1" ? [key] : collect(nested)
      ));
    }
    return [value];
  };

  const values = [
    record?.role,
    record?.roles,
    record?.wp_role,
    record?.wp_roles,
    record?.user_role,
    record?.user_roles,
    record?.capabilities,
    record?.user?.role,
    record?.user?.roles,
    record?.user?.wp_roles,
    record?.user?.capabilities
  ]
    .flatMap(collect)
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(values));
}

function isAdmin(record = null) {
  return resolveRoles(record).some((role) => role === "admin" || role === "administrator");
}

async function upstreamJson(request, session, path, { method = "GET", body } = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (session.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  Object.entries(signedFrontendHeaders(request)).forEach(([name, value]) => headers.set(name, value));

  const response = await fetch(buildTarget(session.baseUrl, path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && !payload.success)) {
    return {
      ok: false,
      status: response.status,
      payload: payload || { success: false, error: { message: response.statusText || "Upstream request failed." } }
    };
  }

  return { ok: true, status: response.status, payload: payload || { success: true } };
}

export async function POST(request, { params }) {
  try {
    assertFrontendRequest(request);

    const url = new URL(request.url);
    const baseUrl = normalizeBaseUrl(url.searchParams.get("baseUrl"));
    if (!baseUrl || !isAllowedUrl(baseUrl, allowedOrigins())) {
      return Response.json({ success: false, error: { message: "Missing baseUrl." } }, { status: 400 });
    }

    const resolvedParams = await params;
    const customerId = sanitizeText(resolvedParams?.customerId, { max: 80 });
    if (!isValidId(customerId)) {
      return Response.json({ success: false, error: { message: "Invalid customer id." } }, { status: 422 });
    }

    const body = await request.json().catch(() => null);
    const unknownFields = rejectUnknownFields(body, ["target_role", "challenge_id", "code"], "payload");
    if (unknownFields) {
      return Response.json({ success: false, error: { message: unknownFields } }, { status: 400 });
    }

    const targetRole = sanitizeText(body?.target_role, { max: 40 }).toLowerCase();
    const challengeId = sanitizeText(body?.challenge_id, { max: 120 });
    const code = sanitizeText(body?.code, { max: 12 });
    if (!ALLOWED_TARGET_ROLES.has(targetRole)) {
      return Response.json({ success: false, error: { message: "Unsupported target role." } }, { status: 422 });
    }
    if (!challengeId || !code) {
      return Response.json({ success: false, error: { message: "OTP verification is required." } }, { status: 422 });
    }

    const frontendType = sanitizeText(request.headers.get("x-nevari-frontend-type") || "storefront", { max: 40 });
    const session = {
      baseUrl,
      accessToken: requestCookie(request, cookieName(frontendType)),
      frontendType,
      frontendOrigin: url.origin
    };
    const csrfCookie = requestCookie(request, "nevari_csrf");
    const csrfHeader = String(request.headers.get("x-nevari-csrf") || "").trim();
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return Response.json({ success: false, error: { message: "CSRF validation failed." } }, { status: 403 });
    }
    if (!session.accessToken || session.accessToken === SESSION_MARKER) {
      return Response.json({ success: false, error: { message: "Authenticated session is required." } }, { status: 401 });
    }

    const meResult = await upstreamJson(request, session, "/auth/me");
    if (!meResult.ok) {
      return Response.json(meResult.payload, { status: meResult.status || 401 });
    }
    const viewer = meResult.payload?.data?.user || meResult.payload?.data || null;
    if (!isAdmin(viewer)) {
      return Response.json({ success: false, error: { message: "Only admins can change user roles." } }, { status: 403 });
    }

    const verifyResult = await upstreamJson(request, session, "/auth/verify-code", {
      method: "POST",
      body: {
        challenge_id: challengeId,
        code,
        frontend_type: frontendType,
        frontend_origin: url.origin,
        frontend_url: `${url.origin}/admin/storefront`
      }
    });
    if (!verifyResult.ok) {
      return Response.json(verifyResult.payload, { status: verifyResult.status || 400 });
    }

    const roleResult = await upstreamJson(request, session, `/admin/users/${encodeURIComponent(customerId)}/role`, {
      method: "POST",
      body: {
        target_role: targetRole,
        verified_by_user_id: viewer?.id || viewer?.user_id || "",
        reason: "Role change approved with storefront OTP verification"
      }
    });
    if (!roleResult.ok) {
      return Response.json(roleResult.payload, { status: roleResult.status || 400 });
    }

    return Response.json({
      success: true,
      data: {
        user: roleResult.payload?.data?.user || null,
        from_role: roleResult.payload?.data?.from_role || "",
        target_role: targetRole,
        notification: roleResult.payload?.data?.notification || { queued: true, warning: "" },
        message: roleResult.payload?.data?.message || `User updated to ${targetRole}.`
      }
    });
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "User role change failed." } },
      { status: Number(error?.status || 400) }
    );
  }
}
