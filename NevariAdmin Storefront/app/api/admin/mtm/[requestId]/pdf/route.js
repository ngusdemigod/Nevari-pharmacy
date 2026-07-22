import { auditMtmPdfEvent } from "../../../../../lib/mtmPdf";
import { isAllowedUrl, isValidId, sanitizeText } from "../../../../../lib/inputValidation";
import { proxyRawRequest } from "../../../../mtm/_server.js";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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
  if (origin && origin !== requestOrigin) {
    throw new Error("Same-origin frontend request is required.");
  }
  if (frontendOrigin && frontendOrigin !== requestOrigin) {
    throw new Error("Same-origin frontend request is required.");
  }
}

function proxyUrl(origin, baseUrl, path) {
  const url = new URL("/api/nevari-proxy", origin);
  url.searchParams.set("baseUrl", normalizeBaseUrl(baseUrl));
  url.searchParams.set("path", path);
  return url.toString();
}

async function proxyRequest(origin, session, path) {
  const response = await fetch(proxyUrl(origin, session.baseUrl, path), {
    headers: {
      Accept: "application/json",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType || "storefront",
      "X-Nevari-Frontend-Origin": session.frontendOrigin || origin,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = payload?.error?.message || "MTM data could not be loaded.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function deriveViewerRole(frontendType, me) {
  const roles = Array.isArray(me?.roles) ? me.roles : [];
  const normalizedRoles = roles.map((role) => String(role || "").toLowerCase());
  if (normalizedRoles.includes("pharmacist") || String(frontendType).includes("pharmacist")) {
    return "pharmacist";
  }
  return "admin";
}

function viewerUserId(viewer) {
  return Number(viewer?.id || viewer?.user_id || 0);
}

export async function GET(request, { params }) {
  let requestId = "";
  let viewer = null;
  let viewerRole = "";
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const frontendType = sanitizeText(url.searchParams.get("frontendType") || "storefront", { max: 40 });
    const baseUrl = sanitizeText(url.searchParams.get("baseUrl") || "", { max: 300 });
    const resolvedParams = await params;
    requestId = sanitizeText(resolvedParams.requestId, { max: 80 });
    if (!isValidId(requestId)) {
      return Response.json({ success: false, error: { message: "Invalid MTM request id." } }, { status: 422 });
    }
    if (!isAllowedUrl(baseUrl)) {
      return Response.json({ success: false, error: { message: "Invalid backend URL." } }, { status: 422 });
    }

    const session = {
      baseUrl,
      accessToken: requestCookie(request, cookieName(frontendType)),
      frontendType,
      frontendOrigin: url.origin,
    };
    if (!session.baseUrl || !session.accessToken) {
      return Response.json({ success: false, error: { message: "Authenticated session is required." } }, { status: 401 });
    }

    const [payload, mePayload] = await Promise.all([
      proxyRequest(url.origin, session, `/pharmacist/mtm-requests/${encodeURIComponent(requestId)}`),
      proxyRequest(url.origin, session, "/auth/me"),
    ]);
    const data = payload?.request || null;
    viewer = mePayload?.user || mePayload || null;
    viewerRole = deriveViewerRole(frontendType, viewer);

    if (!data) {
      await auditMtmPdfEvent(request, {
        requestId,
        actorUserId: viewerUserId(viewer),
        actorRole: viewerRole,
        result: "not_found",
      });
      return Response.json({ success: false, error: { message: "MTM request could not be loaded." } }, { status: 404 });
    }

    const upstream = await proxyRawRequest(url.origin, session, `/mtm-requests/${encodeURIComponent(requestId)}/document`, {
      headers: { Accept: "application/pdf" },
    });
    await auditMtmPdfEvent(request, {
      requestId: Number(data?.id || requestId),
      actorUserId: viewerUserId(viewer),
      actorRole: viewerRole,
      result: upstream.ok ? "canonical_download" : "canonical_unavailable",
      requestReference: data?.request_reference || "",
    });
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    await auditMtmPdfEvent(request, {
      requestId,
      actorUserId: viewerUserId(viewer),
      actorRole: viewerRole || "unknown",
      result: "error",
      message: error?.message || "PDF could not be generated.",
    }).catch(() => {});
    return Response.json({ success: false, error: { message: error?.message || "PDF could not be generated." } }, { status: Number(error?.status || 500) });
  }
}
