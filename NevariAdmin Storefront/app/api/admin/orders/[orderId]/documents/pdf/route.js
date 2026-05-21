import { chromium } from "playwright";
import { documentFilename, renderDocumentHtml } from "../../../../../../lib/documentHtml";

const ALLOWED_TYPES = new Set(["invoice", "receipt", "prescription"]);

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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
    const url = new URL(request.url);
    const documentType = String(url.searchParams.get("document_type") || "receipt").toLowerCase();
    if (!ALLOWED_TYPES.has(documentType)) {
      return Response.json({ success: false, error: { message: "Invalid document type." } }, { status: 422 });
    }
    const session = {
      baseUrl: url.searchParams.get("baseUrl") || "",
      accessToken: url.searchParams.get("accessToken") || "",
      frontendType: url.searchParams.get("frontendType") || "patient",
      frontendOrigin: url.searchParams.get("frontendOrigin") || url.origin
    };
    if (!session.baseUrl) {
      return Response.json({ success: false, error: { message: "WordPress base URL is required." } }, { status: 422 });
    }

    const data = await proxyRequest(url.origin, session, `/orders/${encodeURIComponent(params.orderId)}/document-data`);
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
