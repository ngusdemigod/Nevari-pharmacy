import { chromium } from "playwright";
import { documentFilename, renderDocumentHtml } from "../../../../../../lib/documentHtml";
import {
  isAllowedUrl,
  isValidId,
  sanitizeText
} from "../../../../../../lib/inputValidation";

const ALLOWED_TYPES = new Set(["invoice", "receipt", "prescription"]);

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

async function proxyRequest(origin, session, path) {
  const response = await fetch(proxyUrl(origin, session.baseUrl, path), {
    headers: {
      Accept: "application/json",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType || "patient",
      "X-Nevari-Frontend-Origin": session.frontendOrigin || origin
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "Document data could not be loaded.");
  }
  return payload.data;
}

async function htmlToPdf(html) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" }
    });
  } finally {
    await browser.close();
  }
}

export async function GET(request, { params }) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const documentType = String(url.searchParams.get("document_type") || "receipt").toLowerCase();
    if (!ALLOWED_TYPES.has(documentType)) {
      return Response.json({ success: false, error: { message: "Invalid document type." } }, { status: 422 });
    }
    const frontendType = sanitizeText(url.searchParams.get("frontendType") || "patient", { max: 40 });
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(frontendType)) {
      return Response.json({ success: false, error: { message: "Invalid frontend type." } }, { status: 422 });
    }
    const baseUrl = sanitizeText(url.searchParams.get("baseUrl") || "", { max: 300 });
    const orderId = sanitizeText(params.orderId, { max: 80 });
    if (!isValidId(orderId)) {
      return Response.json({ success: false, error: { message: "Invalid order id." } }, { status: 422 });
    }
    if (!isAllowedUrl(baseUrl)) {
      return Response.json({ success: false, error: { message: "Invalid backend URL." } }, { status: 422 });
    }
    const session = {
      baseUrl,
      accessToken: requestCookie(request, cookieName(frontendType)),
      frontendType,
      frontendOrigin: url.origin
    };
    if (!session.baseUrl || !session.accessToken) {
      return Response.json({ success: false, error: { message: "Authenticated session is required." } }, { status: 401 });
    }

    const data = await proxyRequest(url.origin, session, `/orders/${encodeURIComponent(orderId)}/document-data`);
    const statusMode = url.searchParams.get("statusMode") === "payment" ? "payment" : "order";
    const html = renderDocumentHtml(data, documentType, { appOrigin: url.origin, statusMode });
    const pdf = await htmlToPdf(html);
    const filename = documentFilename(data, documentType);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "PDF could not be generated." } }, { status: 500 });
  }
}
