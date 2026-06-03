const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const DANGEROUS_MARKUP = /[<>`]/g;
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/i
];

export function sanitizeText(value, { max = 500, allowMarkup = false } = {}) {
  const text = String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = allowMarkup ? text : text.replace(DANGEROUS_MARKUP, "");
  return cleaned.slice(0, max);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function rejectUnknownFields(input, allowedFields, label = "payload") {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return `${label} must be an object.`;
  }
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  return unknown.length ? `${label} contains unsupported fields.` : "";
}

export function isValidEmail(value) {
  const text = sanitizeText(value, { max: 254 });
  return !text || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text);
}

export function isValidPhone(value) {
  const text = sanitizeText(value, { max: 24 });
  return /^[0-9+\-()\s]{7,24}$/.test(text);
}

export function isValidDateKey(value) {
  const text = sanitizeText(value, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00`);
  return !Number.isNaN(date.getTime()) && text === date.toISOString().slice(0, 10);
}

export function isValidTimeKey(value) {
  const text = sanitizeText(value, { max: 5 });
  if (!/^\d{2}:\d{2}$/.test(text)) return false;
  const [hour, minute] = text.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isFutureDateTime(date, time) {
  if (!isValidDateKey(date) || !isValidTimeKey(time)) return false;
  const value = new Date(`${date}T${time}:00`);
  return !Number.isNaN(value.getTime()) && value.getTime() >= Date.now();
}

export function isPastDateKey(value) {
  if (!isValidDateKey(value)) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [year, month, day] = String(value).split("-").map(Number);
  const input = new Date(year, month - 1, day).getTime();
  return input < today;
}

export function isValidId(value, { max = 80 } = {}) {
  const text = sanitizeText(value, { max });
  return /^[a-zA-Z0-9_-]{1,80}$/.test(text);
}

export function isValidPath(value) {
  const text = sanitizeText(value, { max: 240 });
  return /^\/[a-zA-Z0-9/_-]*(?:\?[a-zA-Z0-9._~=&%-]*)?$/.test(text) && !text.includes("..") && !text.includes("//");
}

export function isAllowedUrl(value, allowedOrigins = []) {
  const text = sanitizeText(value, { max: 300 });
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return false;
    return !allowedOrigins.length || allowedOrigins.includes(url.origin.replace(/\/+$/, ""));
  } catch {
    return false;
  }
}

export function safeFileName(value, { max = 180 } = {}) {
  return sanitizeText(value, { max }).replace(/[\\/:*?"|]/g, "").slice(0, max);
}

export function invalidJson(message, field = "payload", status = 400) {
  return Response.json({ success: false, error: { field, message } }, { status });
}

export function invalidNextJson(NextResponse, message, field = "payload", status = 400) {
  return NextResponse.json({ ok: false, error: { field, message } }, { status });
}
