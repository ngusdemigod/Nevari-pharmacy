import { generateMtmTemplatePdf } from "../../../../lib/mtmPdf.js";
import { isAllowedUrl, isValidId, sanitizeText } from "../../../../lib/inputValidation";

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
      "X-Nevari-Frontend-Type": session.frontendType || "patient",
      "X-Nevari-Frontend-Origin": session.frontendOrigin || origin,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const error = new Error(payload?.error?.message || "MTM data could not be loaded.");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function requestPathForFrontend(frontendType, requestId) {
  const type = String(frontendType || "").toLowerCase();
  if (type.includes("admin") || type.includes("pharmacist")) {
    return `/pharmacist/mtm-requests/${encodeURIComponent(requestId)}`;
  }
  return `/mtm-requests/${encodeURIComponent(requestId)}`;
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

    const payload = await proxyRequest(url.origin, session, requestPathForFrontend(frontendType, requestId));
    const data = payload?.request || null;
    if (!data) {
      return Response.json({ success: false, error: { message: "MTM request could not be loaded." } }, { status: 404 });
    }

    const generated = await generateMtmTemplatePdf(data, { mode: "cached" });
    return new Response(generated.pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${generated.filename}\"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "PDF could not be generated." } }, { status: Number(error?.status || 500) });
  }
}
