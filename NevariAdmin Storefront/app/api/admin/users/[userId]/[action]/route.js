import { createHmac } from "node:crypto";
import { isAllowedUrl, rejectUnknownFields, sanitizeText } from "../../../../../lib/inputValidation";

const API_NAMESPACE = "nevari/v1";
const ACTIONS = new Set(["approve", "decline", "ban", "unban"]);

function normalize(value) { return String(value || "").trim().replace(/\/+$/, ""); }
function allowedOrigins() { return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "").split(",").map(normalize).filter(Boolean); }
function cookieName(frontendType) { return `nevari_access_${String(frontendType || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`; }

export async function PATCH(request, context) {
  try {
    const origin = new URL(request.url).origin;
    if (normalize(request.headers.get("origin")) !== origin || normalize(request.headers.get("x-nevari-frontend-origin")) !== origin) {
      return Response.json({ success: false, error: { message: "Same-origin request required." } }, { status: 403 });
    }
    const { userId, action } = await context.params;
    if (!/^\d+$/.test(String(userId)) || !ACTIONS.has(action)) {
      return Response.json({ success: false, error: { message: "Invalid governance action." } }, { status: 422 });
    }
    const body = await request.json().catch(() => ({}));
    const unknown = rejectUnknownFields(body, ["baseUrl", "reason"]);
    if (unknown) return Response.json({ success: false, error: { message: unknown } }, { status: 422 });
    const baseUrl = normalize(body.baseUrl);
    if (!baseUrl || !isAllowedUrl(baseUrl, allowedOrigins())) {
      return Response.json({ success: false, error: { message: "Backend URL is not allowed." } }, { status: 400 });
    }
    const frontendType = sanitizeText(request.headers.get("x-nevari-frontend-type"), { max: 40 });
    const accessToken = request.cookies.get(cookieName(frontendType))?.value || "";
    const secret = String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
    if (!accessToken || !secret) return Response.json({ success: false, error: { message: "Authenticated session required." } }, { status: 401 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret).update(`${timestamp}\n${frontendType}\n${origin}`).digest("hex");
    const response = await fetch(`${baseUrl}/wp-json/${API_NAMESPACE}/admin/users/${userId}/${action}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-nevari-frontend-type": frontendType,
        "x-nevari-frontend-origin": origin,
        "x-nevari-proxy-timestamp": timestamp,
        "x-nevari-proxy-signature": signature,
      },
      body: JSON.stringify({ reason: sanitizeText(body.reason, { max: 500 }) }),
      signal: AbortSignal.timeout(20000),
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ success: false, error: { message: "Unable to update this user." } }, { status: 400 });
  }
}
