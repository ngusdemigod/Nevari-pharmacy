import { isAllowedUrl, isValidId, sanitizeText } from "../../../../lib/inputValidation";
import { proxyRawRequest } from "../../_server.js";

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

export async function GET(request, { params }) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const frontendType = sanitizeText(url.searchParams.get("frontendType") || "patient", { max: 40 });
    const baseUrl = sanitizeText(url.searchParams.get("baseUrl") || "", { max: 300 });
    const resolvedParams = await params;
    const requestId = sanitizeText(resolvedParams.requestId, { max: 80 });
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

    const upstream = await proxyRawRequest(url.origin, session, `/mtm-requests/${encodeURIComponent(requestId)}/document`, {
      headers: { Accept: "application/pdf" },
    });
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "PDF could not be generated." } }, { status: Number(error?.status || 500) });
  }
}
