const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isLocalDevelopmentHostname(hostname) {
  if (isProduction()) return false;
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export async function verifyRecaptchaToken(token, expectedAction, remoteIp = "") {
  const secret = String(process.env.RECAPTCHA_SECRET_KEY || "").trim();
  if (!secret) {
    return isProduction()
      ? { ok: false, code: "captcha_required" }
      : { ok: true, skipped: true };
  }
  if (!token) return { ok: false, code: "captcha_required" };

  const body = new URLSearchParams({ secret, response: String(token) });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    const minimumScore = Math.min(1, Math.max(0, Number(process.env.RECAPTCHA_MIN_SCORE || 0.5)));
    const allowedHostnames = String(process.env.RECAPTCHA_ALLOWED_HOSTNAMES || "")
      .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const verifiedHostname = String(result.hostname || "").trim().toLowerCase();
    const hostnameAllowed = !allowedHostnames.length
      || allowedHostnames.includes(verifiedHostname)
      || isLocalDevelopmentHostname(verifiedHostname);
    return {
      ok: Boolean(result.success)
        && result.action === expectedAction
        && Number(result.score || 0) >= minimumScore
        && hostnameAllowed,
      code: "captcha_failed",
    };
  } catch {
    return { ok: false, code: "captcha_failed" };
  }
}
