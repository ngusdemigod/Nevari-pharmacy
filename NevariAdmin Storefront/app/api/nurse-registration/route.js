import { createHmac } from "node:crypto";
import { isAllowedUrl, rejectUnknownFields, sanitizeText } from "../../lib/inputValidation";
import { verifyRecaptchaToken } from "../../lib/recaptcha-server";

const API_NAMESPACE = "nevari/v1";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigins() {
  return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeUrl)
    .filter(Boolean);
}

export async function POST(request) {
  try {
    const requestOrigin = new URL(request.url).origin;
    if (normalizeUrl(request.headers.get("origin")) !== requestOrigin) {
      return Response.json({ success: false, error: { message: "Same-origin request required." } }, { status: 403 });
    }
    const captcha = await verifyRecaptchaToken(
      request.headers.get("x-nevari-recaptcha-token") || "",
      "public_submit",
      String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    );
    if (!captcha.ok) {
      return Response.json(
        { success: false, error: { code: captcha.code, message: "Spam protection verification failed. Please try again." } },
        { status: 403 }
      );
    }
    const body = await request.json();
    const unknown = rejectUnknownFields(body, ["baseUrl", "first_name", "last_name", "email", "phone", "license_number", "password", "consent"]);
    if (unknown) {
      return Response.json({ success: false, error: { message: unknown } }, { status: 422 });
    }
    const baseUrl = normalizeUrl(body.baseUrl);
    const allowlist = allowedOrigins();
    if (!baseUrl || !isAllowedUrl(baseUrl, allowlist)) {
      return Response.json({ success: false, error: { message: "Backend URL is not allowed." } }, { status: 400 });
    }
    const secret = String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
    if (!secret) {
      return Response.json({ success: false, error: { message: "Registration service is unavailable." } }, { status: 503 });
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const frontendType = "nurse_registration";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}\n${frontendType}\n${requestOrigin}`)
      .digest("hex");
    const payload = {
      first_name: sanitizeText(body.first_name, { max: 80 }),
      last_name: sanitizeText(body.last_name, { max: 80 }),
      email: sanitizeText(body.email, { max: 254 }),
      phone: sanitizeText(body.phone, { max: 40 }),
      license_number: sanitizeText(body.license_number, { max: 80 }),
      password: String(body.password || "").slice(0, 256),
      consent: body.consent === true,
    };
    const response = await fetch(`${baseUrl}/wp-json/${API_NAMESPACE}/auth/register-nurse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nevari-frontend-type": frontendType,
        "x-nevari-frontend-origin": requestOrigin,
        "x-nevari-proxy-timestamp": timestamp,
        "x-nevari-proxy-signature": signature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({ success: false, error: { message: "Registration service returned an invalid response." } }));
    return Response.json(result, { status: response.status });
  } catch {
    return Response.json({ success: false, error: { message: "The application could not be submitted." } }, { status: 400 });
  }
}
