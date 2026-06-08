import { generateMtmTemplatePdf } from "../../../../../lib/mtmPdf.js";
import { isAllowedUrl, isValidId, sanitizeText } from "../../../../../lib/inputValidation";

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

async function proxyRequest(origin, session, path, { method = "GET", body } = {}) {
  const response = await fetch(proxyUrl(origin, session.baseUrl, path), {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType || "pharmacist_dashboard",
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

export async function POST(request, { params }) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const frontendType = sanitizeText(url.searchParams.get("frontendType") || "pharmacist_dashboard", { max: 40 });
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

    const mtmPayload = await proxyRequest(url.origin, session, `/pharmacist/mtm-requests/${encodeURIComponent(requestId)}`);
    const mtmRequest = mtmPayload?.request || null;
    if (!mtmRequest) {
      return Response.json({ success: false, error: { message: "MTM request could not be loaded." } }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const approvedPdfSnapshot = {
      ...mtmRequest,
      status: "approved",
      status_label: "Approved",
      reviewed_at: mtmRequest?.reviewed_at || nowIso,
      approved_at: mtmRequest?.approved_at || nowIso,
      updated_at: nowIso,
    };
    const generated = await generateMtmTemplatePdf(approvedPdfSnapshot, { mode: "cached" });
    const approvePayload = await proxyRequest(url.origin, session, `/pharmacist/mtm-requests/${encodeURIComponent(requestId)}/approve`, {
      method: "POST",
      body: {
        approval_email_attachments: [{
          filename: generated.filename,
          mime_type: "application/pdf",
          content_type: "application/pdf",
          base64: Buffer.from(generated.pdf).toString("base64"),
        }],
      },
    });

    return Response.json({
      success: true,
      data: approvePayload,
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "Unable to approve the MTM request." } }, { status: Number(error?.status || 500) });
  }
}
