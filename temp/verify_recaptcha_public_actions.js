const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const ORIGIN = "http://127.0.0.1:3000";
const LOGIN_ROUTES = [
  "/login",
  "/admin/storefront/login",
  "/admin/doctor/login",
  "/admin/pharmacist/login",
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const captured = [];
  let otpNextLogin = false;
  let googleEnabled = false;

  await context.route("https://www.google.com/recaptcha/api.js**", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: 'window.grecaptcha={ready:function(callback){callback();},execute:function(){return Promise.resolve("coverage-captcha-token");}};',
  }));
  await context.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: `window.google={accounts:{id:{
      initialize:function(config){window.__googleAuthConfig=config;},
      renderButton:function(element){var button=document.createElement("button");button.type="button";button.textContent="Mock Google Sign In";button.onclick=function(){window.__googleAuthConfig.callback({credential:"mock-google-credential"});};element.appendChild(button);}
    }}};`,
  }));
  await context.route("**/api/nevari-proxy?**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path");
    if (path === "/auth/google-config") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { enabled: googleEnabled, client_id: googleEnabled ? "test-client-id" : "" } }) });
    }
    if (path?.startsWith("/auth/")) {
      captured.push({
        path,
        token: route.request().headers()["x-nevari-recaptcha-token"] || "",
      });
      if (path === "/auth/login" && otpNextLogin) {
        otpNextLogin = false;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { verification_required: true, challenge_id: "test-challenge", masked_email: "t***@example.com", resend_cooldown: 0 } }),
        });
      }
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: { message: "Coverage request completed." } }),
      });
    }
    return route.continue();
  });

  for (const route of LOGIN_ROUTES) {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email").fill("coverage@example.com");
    await page.getByLabel("Password").fill("Coverage123");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForTimeout(150);
    await page.close();
  }

  otpNextLogin = true;
  const otpPage = await context.newPage();
  await otpPage.clock.install();
  await otpPage.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await otpPage.getByLabel("Email").fill("coverage@example.com");
  await otpPage.getByLabel("Password").fill("Coverage123");
  await otpPage.getByRole("button", { name: "Sign In", exact: true }).click();
  await otpPage.getByRole("textbox", { name: "Verification code" }).fill("123456");
  await otpPage.clock.runFor(61_000);
  await otpPage.getByRole("button", { name: "Resend code" }).click();
  await otpPage.waitForTimeout(150);
  await otpPage.getByRole("button", { name: "Verify Code" }).click();
  await otpPage.waitForTimeout(150);
  await otpPage.close();

  googleEnabled = true;
  const googlePage = await context.newPage();
  await googlePage.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await googlePage.getByRole("button", { name: "Mock Google Sign In" }).click();
  await googlePage.waitForTimeout(150);
  await googlePage.close();
  googleEnabled = false;

  const resetPage = await context.newPage();
  await resetPage.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await resetPage.getByRole("button", { name: "Reset password" }).click();
  await resetPage.getByLabel("Username or email").fill("coverage@example.com");
  await resetPage.getByRole("button", { name: "Send Reset Link" }).click();
  await resetPage.waitForTimeout(150);
  await resetPage.close();

  const registrationPage = await context.newPage();
  await registrationPage.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await registrationPage.getByRole("button", { name: "Create account" }).click();
  await registrationPage.getByLabel("First name").fill("Coverage");
  await registrationPage.getByLabel("Last name").fill("Test");
  await registrationPage.getByLabel("Email").fill("coverage@example.com");
  await registrationPage.getByLabel("Password").fill("Coverage123");
  await registrationPage.getByRole("button", { name: "Create Account" }).click();
  await registrationPage.waitForTimeout(150);
  await registrationPage.close();

  const passwordPage = await context.newPage();
  await passwordPage.goto(`${ORIGIN}/reset-password?login=coverage%40example.com&key=test-key&frontend_type=patient_dashboard`, { waitUntil: "domcontentloaded" });
  await passwordPage.getByLabel("New password").fill("Coverage123");
  await passwordPage.getByLabel("Confirm password").fill("Coverage123");
  await passwordPage.getByRole("button", { name: "Reset password" }).click();
  await passwordPage.waitForTimeout(150);
  await passwordPage.close();

  const protectedPaths = [
    "/auth/login",
    "/auth/password-reset",
    "/auth/register-customer",
    "/auth/password-reset/confirm",
    "/auth/verify-code",
    "/auth/resend-code",
    "/auth/google-login",
  ];
  const missing = protectedPaths.filter((path) => !captured.some((entry) => entry.path === path && entry.token === "coverage-captcha-token"));
  const loginCount = captured.filter((entry) => entry.path === "/auth/login" && entry.token === "coverage-captcha-token").length;
  const disclosures = {};
  for (const route of ["/login", "/admin/storefront/login", "/admin/doctor/login", "/admin/pharmacist/login", "/nurse-registration", "/reset-password?login=test&key=test&frontend_type=patient_dashboard"]) {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded" });
    await page.locator(".recaptcha-disclosure").waitFor({ state: "visible" });
    disclosures[route] = await page.locator(".recaptcha-disclosure").isVisible();
    await page.close();
  }

  console.log(JSON.stringify({ captured, loginCount, missing, disclosures }, null, 2));
  if (missing.length || loginCount < LOGIN_ROUTES.length || Object.values(disclosures).some((value) => !value)) {
    throw new Error("Public reCAPTCHA coverage failed.");
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
