import { createHmac, timingSafeEqual } from "node:crypto";
import { buildMtmPdfFingerprint } from "./mtmPdf.js";

const MTM_PDF_TOKEN_PURPOSE = "mtm_submission_pdf";
const TOKEN_TTL_SECONDS = 10 * 60;

function base64urlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

function signingSecret() {
  const secret = String(
    process.env.NEVARI_MTM_PDF_SIGNING_SECRET
    || process.env.NEVARI_PROXY_SIGNING_SECRET
    || ""
  ).trim();
  return secret;
}

function signPayload(encodedPayload) {
  const secret = signingSecret();
  if (secret.length < 32) {
    throw new Error("MTM PDF signing is not configured.");
  }
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

function requestReferenceValue(requestData) {
  return String(requestData?.request_reference || requestData?.id || "").trim();
}

export function createMtmPdfSnapshotToken(requestData, options = {}) {
  const requestId = String(requestData?.id || "").trim();
  if (!requestId) {
    throw new Error("MTM request id is required for PDF snapshot signing.");
  }
  const customerUserId = String(options.userId || requestData?.customer_user_id || "").trim();
  if (!customerUserId) {
    throw new Error("Patient id is required for PDF snapshot signing.");
  }
  const fingerprint = options.fingerprint || buildMtmPdfFingerprint(requestData);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  const payload = {
    v: 1,
    purpose: MTM_PDF_TOKEN_PURPOSE,
    requestId,
    requestReference: requestReferenceValue(requestData),
    customerUserId,
    fingerprint,
    iat: issuedAt,
    exp: expiresAt,
  };
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = base64urlEncode(signPayload(encodedPayload));
  return {
    token: `${encodedPayload}.${signature}`,
    fingerprint,
    issuedAt,
    expiresAt,
  };
}

export function verifyMtmPdfSnapshotToken(token) {
  const [encodedPayload, encodedSignature] = String(token || "").trim().split(".");
  if (!encodedPayload || !encodedSignature) {
    throw new Error("Invalid MTM PDF snapshot token.");
  }
  const secret = signingSecret();
  if (secret.length < 32 || encodedSignature === "unsigned") {
    throw new Error("MTM PDF signing is not configured.");
  }
  const expectedSignature = signPayload(encodedPayload);
  const actualSignature = base64urlDecode(encodedSignature);
  if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) {
    throw new Error("Invalid MTM PDF snapshot token signature.");
  }
  const payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  if (!payload || payload.purpose !== MTM_PDF_TOKEN_PURPOSE) {
    throw new Error("Invalid MTM PDF snapshot token payload.");
  }
  if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    throw new Error("MTM PDF snapshot token has expired.");
  }
  return payload;
}
