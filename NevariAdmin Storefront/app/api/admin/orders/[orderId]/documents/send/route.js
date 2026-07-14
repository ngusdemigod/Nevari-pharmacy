import { chromium } from "playwright";
import { documentFilename, renderDocumentHtml } from "../../../../../../lib/documentHtml";
import {
  escapeHtml,
  isAllowedUrl,
  isValidId,
  rejectUnknownFields,
  sanitizeText
} from "../../../../../../lib/inputValidation";

const API_NAMESPACE = "nevari/v1";
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
  const origin = normalizeBaseUrl(request.headers.get("origin"));
  if (origin && origin !== requestOrigin) {
    throw new Error("Cross-origin document requests are not allowed.");
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
      "Content-Type": "application/json",
      Authorization: session.accessToken ? `Bearer ${session.accessToken}` : "",
      "X-Nevari-Frontend-Type": session.frontendType || "store_admin",
      "X-Nevari-Frontend-Origin": session.frontendOrigin || origin
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "Request failed.");
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

function emailTemplateKey(documentType) {
  if (documentType === "receipt") return "receipt_document_email";
  if (documentType === "prescription") return "prescription_document_email";
  return "invoice_document_email";
}

function fallbackSubject(documentType, data) {
  const number = documentType === "receipt" ? data.receipt_number : documentType === "prescription" ? data.prescription_number : data.invoice_number;
  return `${documentType[0].toUpperCase()}${documentType.slice(1)} for order #${data.order_number || number}`;
}

function fallbackBody(documentType, data, paymentUrl = "") {
  const title = documentType[0].toUpperCase() + documentType.slice(1);
  const paymentLink = documentType === "invoice" && paymentUrl && Number(data?.totals?.balance_due || 0) > 0
    ? `<p><a href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener noreferrer">Pay now</a></p>`
    : "";
  return `<p>Hello ${escapeHtml(data.customer?.name || "Patient")},</p><p>Your ${escapeHtml(title.toLowerCase())} for order <strong>#${escapeHtml(data.order_number)}</strong> is attached.</p>${paymentLink}<p>Thank you for choosing Nevari Health.</p>`;
}

function fallbackText(documentType, data, paymentUrl = "") {
  const title = documentType[0].toUpperCase() + documentType.slice(1);
  const paymentText = documentType === "invoice" && paymentUrl && Number(data?.totals?.balance_due || 0) > 0
    ? ` Pay now: ${paymentUrl}`
    : "";
  return `Hello ${data.customer?.name || "Patient"}, your ${title.toLowerCase()} for order #${data.order_number} is attached.${paymentText}`;
}

function appPaymentUrl(appOrigin, invoiceNumber, paymentToken) {
  if (!appOrigin || !invoiceNumber || !paymentToken) return "";
  return `${String(appOrigin).replace(/\/+$/, "")}/pay/${encodeURIComponent(String(invoiceNumber))}?role=patient&payment_token=${encodeURIComponent(String(paymentToken))}`;
}

export async function POST(request, { params }) {
  try {
    assertFrontendRequest(request);
    const body = await request.json().catch(() => ({}));
    const unknownFieldError = rejectUnknownFields(body, ["document_type", "frontendType", "baseUrl", "appOrigin", "fallback_variables"]);
    if (unknownFieldError) {
      return Response.json({ success: false, error: { message: unknownFieldError } }, { status: 400 });
    }
    if (body.fallback_variables !== undefined && (!body.fallback_variables || typeof body.fallback_variables !== "object" || Array.isArray(body.fallback_variables))) {
      return Response.json({ success: false, error: { message: "fallback_variables must be an object." } }, { status: 400 });
    }
    const documentType = String(body.document_type || "invoice").toLowerCase();
    if (!ALLOWED_TYPES.has(documentType)) {
      return Response.json({ success: false, error: { message: "Invalid document type." } }, { status: 422 });
    }
    const frontendType = sanitizeText(body.frontendType || "storefront", { max: 40 });
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(frontendType)) {
      return Response.json({ success: false, error: { message: "Invalid frontend type." } }, { status: 422 });
    }
    const accessToken = requestCookie(request, cookieName(frontendType));
    if (!body.baseUrl || !isAllowedUrl(body.baseUrl) || !accessToken) {
      return Response.json({ success: false, error: { message: "Admin session is required to send documents." } }, { status: 401 });
    }

    const origin = new URL(request.url).origin;
    const orderId = sanitizeText(params.orderId, { max: 80 });
    if (!isValidId(orderId)) {
      return Response.json({ success: false, error: { message: "Invalid order id." } }, { status: 422 });
    }
    const session = {
      baseUrl: sanitizeText(body.baseUrl, { max: 300 }),
      accessToken,
      frontendType,
      frontendOrigin: origin
    };
    const data = await proxyRequest(origin, session, `/orders/${encodeURIComponent(orderId)}/document-data`);
    const appOrigin = sanitizeText(body.appOrigin || origin, { max: 300 });
    if (!isAllowedUrl(appOrigin)) {
      return Response.json({ success: false, error: { message: "Invalid application origin." } }, { status: 422 });
    }
    const paymentUrl = documentType === "invoice" ? appPaymentUrl(appOrigin, data.invoice_number, data.payment_token) : "";
    const renderData = documentType === "invoice"
      ? { ...data, branded_payment_url: paymentUrl, payment_url: paymentUrl }
      : data;
    const html = renderDocumentHtml(renderData, documentType, { appOrigin });
    const pdf = await htmlToPdf(html);
    const total = new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency || "USD" }).format(Number(data?.totals?.total || 0));
    const balanceDue = new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency || "USD" }).format(Number(data?.totals?.balance_due || 0));
    const paymentLinkHtml = paymentUrl ? `<a href="${paymentUrl}" target="_blank" rel="noopener noreferrer">Pay now</a>` : "";

    await proxyRequest(origin, session, "/emails/send", {
      method: "POST",
      body: {
        template_key: emailTemplateKey(documentType),
        recipient_email: data.customer?.email,
        send_now: true,
        related_object_type: "order",
        related_object_id: data.order_id,
        subject: fallbackSubject(documentType, data),
        body_html: fallbackBody(documentType, data, paymentUrl),
        body_text: fallbackText(documentType, data, paymentUrl),
        variables: {
          ...Object.fromEntries(Object.entries(body.fallback_variables || {}).map(([key, value]) => [
            sanitizeText(key, { max: 60 }),
            sanitizeText(value, { max: 500 })
          ])),
          customer_name: data.customer?.name || "Patient",
          customer_email: data.customer?.email || "",
          order_id: String(data.order_id || ""),
          invoice_number: data.invoice_number || "",
          receipt_number: data.receipt_number || "",
          prescription_number: data.prescription_number || "",
          total,
          balance_due: balanceDue,
          payment_status: data.payment_status || "",
          branded_payment_url: paymentUrl,
          payment_link: paymentUrl,
          payment_link_html: documentType === "invoice" ? paymentLinkHtml : ""
        },
        attachments: [{
          filename: documentFilename(data, documentType),
          content_type: "application/pdf",
          mime_type: "application/pdf",
          base64: Buffer.from(pdf).toString("base64")
        }]
      }
    });

    return Response.json({
      success: true,
      message: `${documentType[0].toUpperCase()}${documentType.slice(1)} email sent successfully.`,
      data: {
        recipient_email: data.customer?.email || "",
        payment_link: paymentUrl,
        attachment_filename: documentFilename(data, documentType)
      }
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "Document email could not be sent." } }, { status: 500 });
  }
}
