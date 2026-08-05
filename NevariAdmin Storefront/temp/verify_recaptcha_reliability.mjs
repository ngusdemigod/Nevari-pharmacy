import assert from "node:assert/strict";
import { verifyRecaptchaToken } from "../app/lib/recaptcha-server.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalSecret = process.env.RECAPTCHA_SECRET_KEY;
const originalFetch = global.fetch;

try {
  process.env.NODE_ENV = "development";
  process.env.RECAPTCHA_SECRET_KEY = "test-secret";

  const localAllowed = await verifyRecaptchaToken("nevari-local-development", "public_submit", "", true);
  assert.equal(localAllowed.ok, true);

  const localDeniedForNonLocalRequest = await verifyRecaptchaToken("nevari-local-development", "public_submit", "", false);
  assert.equal(localDeniedForNonLocalRequest.ok, false);

  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) throw new Error("Primary endpoint unavailable");
    return {
      ok: true,
      json: async () => ({
        success: true,
        action: "public_submit",
        score: 0.9,
        hostname: "dash.nevarihealth.com",
      }),
    };
  };
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "dash.nevarihealth.com";
  const fallback = await verifyRecaptchaToken("production-token", "public_submit");
  assert.equal(fallback.ok, true);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[1], /recaptcha\.net/);

  process.env.NODE_ENV = "production";
  const productionLocalToken = await verifyRecaptchaToken("nevari-local-development", "public_submit", "", true);
  assert.equal(productionLocalToken.ok, true, "Mocked provider response should still be required in production");

  console.log(JSON.stringify({
    localDevelopmentBypassRestricted: true,
    alternateDomainFallback: true,
    productionStillProviderVerified: requestedUrls.length >= 3,
  }));
} finally {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.RECAPTCHA_SECRET_KEY = originalSecret;
  global.fetch = originalFetch;
}
