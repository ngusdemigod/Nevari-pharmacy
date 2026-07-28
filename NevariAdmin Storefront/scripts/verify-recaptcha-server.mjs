import { verifyRecaptchaToken } from "../app/lib/recaptcha-server.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  RECAPTCHA_MIN_SCORE: process.env.RECAPTCHA_MIN_SCORE,
  RECAPTCHA_ALLOWED_HOSTNAMES: process.env.RECAPTCHA_ALLOWED_HOSTNAMES,
};

function setEnvironment() {
  process.env.NODE_ENV = "production";
  process.env.RECAPTCHA_SECRET_KEY = "test-secret";
  process.env.RECAPTCHA_MIN_SCORE = "0.5";
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "dash.nevarihealth.com,dev-dash-nevarihealth.vercel.app";
}

async function runCase(name, response, expectedOk) {
  globalThis.fetch = async () => {
    if (response instanceof Error) throw response;
    return { ok: response.httpOk !== false, json: async () => response };
  };
  const result = await verifyRecaptchaToken("test-token", "public_submit", "203.0.113.10");
  if (result.ok !== expectedOk || (!expectedOk && result.code !== "captcha_failed")) {
    throw new Error(`${name} failed: ${JSON.stringify(result)}`);
  }
  return name;
}

try {
  setEnvironment();
  const passed = [];
  passed.push(await runCase("valid", { success: true, action: "public_submit", score: 0.9, hostname: "dev-dash-nevarihealth.vercel.app" }, true));
  passed.push(await runCase("invalid", { success: false, action: "public_submit", score: 0.9, hostname: "dev-dash-nevarihealth.vercel.app" }, false));
  passed.push(await runCase("low-score", { success: true, action: "public_submit", score: 0.2, hostname: "dev-dash-nevarihealth.vercel.app" }, false));
  passed.push(await runCase("wrong-action", { success: true, action: "other_action", score: 0.9, hostname: "dev-dash-nevarihealth.vercel.app" }, false));
  passed.push(await runCase("wrong-hostname", { success: true, action: "public_submit", score: 0.9, hostname: "untrusted.example" }, false));
  passed.push(await runCase("verification-http-error", { httpOk: false }, false));
  passed.push(await runCase("verification-timeout", new Error("timeout"), false));

  const missingToken = await verifyRecaptchaToken("", "public_submit");
  if (missingToken.ok || missingToken.code !== "captcha_required") {
    throw new Error(`missing-token failed: ${JSON.stringify(missingToken)}`);
  }
  passed.push("missing-token");

  delete process.env.RECAPTCHA_SECRET_KEY;
  const missingSecret = await verifyRecaptchaToken("test-token", "public_submit");
  if (missingSecret.ok || missingSecret.code !== "captcha_required") {
    throw new Error(`missing-secret failed: ${JSON.stringify(missingSecret)}`);
  }
  passed.push("missing-secret");

  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  Object.entries(originalEnvironment).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}
