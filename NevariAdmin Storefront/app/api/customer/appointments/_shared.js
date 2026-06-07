import { escapeHtml, isAllowedUrl } from "../../../lib/inputValidation";

const SESSION_MARKER = "server-session";
const PATIENT_FRONTEND_TYPE = "patient_dashboard";

export function resolveApiBase(baseUrl) {
  const cleaned = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.includes("/wp-json/nevari/v1")) return cleaned;
  if (cleaned.includes("/wp-json/")) return `${cleaned}/nevari/v1`;
  return `${cleaned}/wp-json/nevari/v1`;
}

function cookieName(kind, frontendType = PATIENT_FRONTEND_TYPE) {
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

export function resolveCustomerSession(request, { baseUrl = "", accessToken = "" } = {}) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const cookieAccessToken = requestCookie(request, cookieName("access"));
  const fallbackBodyToken = String(accessToken || "").trim();
  const normalizedFallbackToken = fallbackBodyToken && fallbackBodyToken !== SESSION_MARKER ? fallbackBodyToken : "";

  return {
    baseUrl: normalizedBaseUrl,
    accessToken: cookieAccessToken || normalizedFallbackToken,
  };
}

export function customerSessionError(message = "Your session has expired. Sign in again to continue.") {
  return {
    ok: false,
    status: 401,
    data: { error: { code: "session_expired", message } },
    raw: "",
  };
}

export function isUpstreamAuthFailure(response) {
  const status = Number(response?.status || 0);
  const code = String(response?.data?.code || response?.data?.error?.code || "").trim().toLowerCase();
  return status === 401
    || status === 403
    || code === "rest_forbidden"
    || code === "forbidden";
}

export function upstreamErrorMessage(response) {
  const payload = response?.data;
  return String(
    payload?.error?.message
    || payload?.message
    || payload?.data?.message
    || payload?.errors?.[0]?.message
    || ""
  ).trim();
}

export async function requestUpstreamJson(baseUrl, accessToken, path, { method = "GET", body, params } = {}) {
  const apiBase = resolveApiBase(baseUrl);
  if (!apiBase || !isAllowedUrl(apiBase)) {
    return { ok: false, status: 400, data: { error: { message: "Backend URL is invalid." } }, raw: "" };
  }
  const endpoint = new URL(`${apiBase}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      endpoint.searchParams.set(key, String(value));
    }
  });

  const headers = {
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };

  const response = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text().catch(() => "");
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  return {
    ok: response.ok && data?.success !== false,
    status: response.status,
    data,
    raw: raw || ""
  };
}

export function findMeetLink(...sources) {
  const values = sources.flatMap((source) => {
    if (!source || typeof source !== "object") {
      return [];
    }
    return [
      source.join_url,
      source.meet_link,
      source.google_meet_link,
      source.meeting_link,
      source.meeting_url,
      source.join_url,
      source.join_link,
      source.calendar?.meet_link
    ];
  });
  return values.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) || "";
}

export function resolveAppointmentInvoiceRef(checkout) {
  if (!checkout || typeof checkout !== "object") {
    return "";
  }
  const directInvoice =
    checkout.invoice_number
    || checkout.invoice_ref
    || checkout.order?.invoice_number
    || checkout.order?.invoice_ref
    || "";
  if (typeof directInvoice === "string" && directInvoice.trim()) {
    return directInvoice.trim();
  }
  const rawOrderNumber =
    checkout.order_number
    || checkout.order?.number
    || checkout.order_id
    || checkout.order?.id
    || "";
  const digits = String(rawOrderNumber || "").replace(/\D+/g, "");
  if (!digits) {
    return "";
  }
  return `NVH-INV-${digits.padStart(5, "0")}`;
}

export function buildBrandedAppointmentPaymentUrl(appOrigin, checkout, appointment = null, role = "patient") {
  const origin = String(appOrigin || "").trim().replace(/\/+$/, "");
  const invoiceRef = resolveAppointmentInvoiceRef(checkout);
  const paymentToken = String(
    checkout?.payment_token
    || checkout?.order?.payment_token
    || appointment?.payment_token
    || appointment?.order?.payment_token
    || ""
  ).trim();
  const baseUrl = String(
    checkout?.baseUrl
    || checkout?.base_url
    || checkout?.order?.baseUrl
    || checkout?.order?.base_url
    || appointment?.baseUrl
    || appointment?.base_url
    || appointment?.order?.baseUrl
    || appointment?.order?.base_url
    || ""
  ).trim().replace(/\/+$/, "");
  if (!origin || !invoiceRef || !paymentToken) {
    return "";
  }
  const params = new URLSearchParams({
    role: String(role || "patient"),
    payment_token: paymentToken
  });
  if (baseUrl) {
    params.set("base_url", baseUrl);
  }
  return `${origin}/pay/${encodeURIComponent(invoiceRef)}?${params.toString()}`;
}

export function formatAppointmentDateLabel(startAt, timeZone = "Africa/Lagos") {
  if (!startAt) {
    return "Pending";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(startAt));
  } catch {
    return "Pending";
  }
}

export function formatAppointmentTimeLabel(startAt, timeZone = "Africa/Lagos") {
  if (!startAt) {
    return "Pending";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(new Date(startAt));
  } catch {
    return "Pending";
  }
}

export function buildPaymentButtonHtml(url, label = "Pay Now") {
  const href = String(url || "").trim();
  if (!href) {
    return "";
  }
  return `<div style="margin:24px 0 12px;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a></div>`;
}

export function absoluteFrontendUrl(origin, path = "/") {
  const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path || "/").trim();
  if (!normalizedOrigin) {
    return "";
  }
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }
  const resolvedPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `${normalizedOrigin}${resolvedPath}`;
}

export function formatCurrencyAmount(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "";
  }
  const resolvedCurrency = String(currency || "USD").trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: resolvedCurrency }).format(amount);
  } catch {
    return `${amount} ${resolvedCurrency}`.trim();
  }
}

export function buildEmailHtmlVariable(html, text = "") {
  const normalizedHtml = String(html || "").trim();
  if (!normalizedHtml) {
    return "";
  }
  return {
    html: normalizedHtml,
    text: String(text || "").trim() || normalizedHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  };
}

export function buildEmailLinkHtml(url, label) {
  const href = String(url || "").trim();
  if (!href) {
    return "";
  }
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || href)}</a>`;
}

export function buildEmailLinkVariable(url, label, { button = false } = {}) {
  const href = String(url || "").trim();
  if (!href) {
    return "";
  }
  const html = button ? buildPaymentButtonHtml(href, label || "Open Link") : buildEmailLinkHtml(href, label || href);
  return buildEmailHtmlVariable(html, href);
}

export async function sendUpstreamEmail(baseUrl, accessToken, payload) {
  if (!baseUrl || !accessToken) {
    return { sent: false, reason: "missing_credentials" };
  }
  try {
    const response = await requestUpstreamJson(baseUrl, accessToken, "/emails/send", {
      method: "POST",
      body: payload
    });
    if (!response.ok) {
      return { sent: false, reason: `http_${response.status}`, message: upstreamErrorMessage(response) };
    }
    return { sent: true, status: response.status, data: response.data };
  } catch (error) {
    return { sent: false, reason: "network_error", message: String(error?.message || error || "Unknown error") };
  }
}
