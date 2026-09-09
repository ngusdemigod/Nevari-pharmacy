const RECOVERABLE_CLINICAL_ROUTES = new Set([
  "/api/customer/iv-therapy",
  "/api/customer/nurse-requests",
]);

export function isRecoverableClinicalMutation(url, method) {
  let parsed;
  try {
    parsed = new URL(String(url || ""), "http://localhost");
  } catch {
    return false;
  }
  return String(method || "GET").toUpperCase() === "POST"
    && RECOVERABLE_CLINICAL_ROUTES.has(parsed.pathname);
}

export function validIdempotencyKey(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(String(value || ""));
}

export function ensureIdempotencyKey(headers, createKey = () => crypto.randomUUID()) {
  const nextHeaders = new Headers(headers || {});
  const existing = nextHeaders.get("Idempotency-Key");
  if (validIdempotencyKey(existing)) return nextHeaders;
  nextHeaders.set("Idempotency-Key", createKey());
  return nextHeaders;
}

export function shouldRecoverMutation({ responseStatus, requestUrl, method, retryCount }) {
  return Number(responseStatus) === 401
    && Number(retryCount || 0) === 0
    && isRecoverableClinicalMutation(requestUrl, method);
}
