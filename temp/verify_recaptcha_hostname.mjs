import { verifyRecaptchaToken } from "../NevariAdmin Storefront/app/lib/recaptcha-server.js";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.RECAPTCHA_SECRET_KEY;
const originalAllowed = process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
const originalNodeEnv = process.env.NODE_ENV;

async function verify(hostname, environment) {
  process.env.NODE_ENV = environment;
  process.env.RECAPTCHA_SECRET_KEY = "test-secret";
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "dash.nevarihealth.com,dev-dash-nevarihealth.vercel.app";
  globalThis.fetch = async () => ({
    json: async () => ({ success: true, action: "public_submit", score: 0.9, hostname }),
  });
  return verifyRecaptchaToken("test-token", "public_submit");
}

try {
  const localDevelopment = await verify("localhost", "development");
  const loopbackDevelopment = await verify("127.0.0.1", "development");
  const deployedProduction = await verify("dash.nevarihealth.com", "production");
  const localProduction = await verify("localhost", "production");
  if (!localDevelopment.ok || !loopbackDevelopment.ok || !deployedProduction.ok || localProduction.ok) {
    throw new Error(`Unexpected hostname verification result: ${JSON.stringify({ localDevelopment, loopbackDevelopment, deployedProduction, localProduction })}`);
  }
  console.log("reCAPTCHA hostname verification passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env.RECAPTCHA_SECRET_KEY = originalSecret;
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = originalAllowed;
  process.env.NODE_ENV = originalNodeEnv;
}
