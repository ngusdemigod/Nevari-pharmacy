const VERIFY_URLS = [
  "https://www.google.com/recaptcha/api/siteverify",
  "https://www.recaptcha.net/recaptcha/api/siteverify",
];
const LOCAL_DEVELOPMENT_TOKEN = "nevari-local-development";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isLocalDevelopmentHostname(hostname) {
  if (isProduction()) return false;
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export async function verifyRecaptchaToken(token, expectedAction, remoteIp = "", allowLocalDevelopment = false) {
  const secret = String(process.env.RECAPTCHA_SECRET_KEY || "").trim();
  if (!secret) {
    return isProduction()
      ? { ok: false, code: "captcha_required" }
      : { ok: true, skipped: true };
  }
  if (!token) return { ok: false, code: "captcha_required" };
  if (!isProduction() && allowLocalDevelopment && String(token) === LOCAL_DEVELOPMENT_TOKEN) {
    return { ok: true, localDevelopment: true };
  }

  const body = new URLSearchParams({ secret, response: String(token) });
  if (remoteIp) body.set("remoteip", remoteIp);
  let result = null;
  for (const verifyUrl of VERIFY_URLS) {
    try {
      const response = await fetch(verifyUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        result = await response.json();
        break;
      }
    } catch {
      // Try Google's supported alternate reCAPTCHA domain before failing closed.
    }
  }
  if (!result) return { ok: false, code: "captcha_failed" };

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
}
