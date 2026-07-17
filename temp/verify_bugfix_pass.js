const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = "http://127.0.0.1:3000";
const patientStorageKey = "nevari_patient_dashboard_session";
const authSecuritySettingsKey = "nevari_global_auth_security_settings";
const shotDir = path.join(__dirname, "bugfix-pass");
const fs = require("fs");
fs.mkdirSync(shotDir, { recursive: true });

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

function success(data) {
  return { success: true, data };
}

function json(route, data, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(success(data)) });
}

function proxyPath(route) {
  return new URL(route.request().url()).searchParams.get("path") || "";
}

function patientSession() {
  return {
    baseUrl: "https://nevarihealth.com",
    frontendType: "patient_dashboard",
    frontendOrigin: baseUrl,
    frontendUrl: `${baseUrl}/dashboard`,
    paired: true,
    siteName: "Nevari Pharmacy",
    siteLogo: "/ne.webp",
    accessToken: "server-session",
    refreshToken: "refresh",
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: { id: 7, display_name: "Harry", email: "harry@example.com", roles: ["customer"] },
  };
}

const activeSubscription = {
  plan: "Nevari Access Pro",
  plan_key: "nevari_access_pro",
  status: "active",
  is_paid: true,
  entitlements: ["therapy_management", "refills", "consultations"],
  frequency: "monthly",
  amount: 1000,
  monthlyEquivalent: 1000,
  currency: "NGN",
  start_date: "2026-06-02T00:00:00Z",
  next_payment_date: "2026-08-02T00:00:00Z",
};

async function mockDashboardRoutes(page, { ssoCalls } = {}) {
  await page.route("**/api/nevari-proxy**", async (route) => {
    const apiPath = proxyPath(route);
    const method = route.request().method();

    if (apiPath === "/sso/wordpress/start" && method === "POST") {
      if (ssoCalls) ssoCalls.push(apiPath);
      return json(route, {
        transaction_id: "txn-1",
        state: "state-1",
        complete_url: "https://nevarihealth.com/?nevari_sso_action=wordpress_complete&transaction=txn-1&state=state-1",
        expires_in: 300,
      });
    }
    if (apiPath === "/dashboard/patient") {
      return json(route, {
        store_currency: "NGN",
        store_timezone: "Africa/Lagos",
        profile: { id: 7, display_name: "Harry", email: "harry@example.com" },
        settings: {},
        prescriptions: { recent: [] },
        appointments: { recent: [] },
      });
    }
    if (apiPath === "/customers/me/settings") return json(route, {});
    if (apiPath === "/subscriptions/me") return json(route, activeSubscription);
    if (apiPath === "/subscriptions/me/history") return json(route, { items: [] });
    if (apiPath === "/mtm-requests" || apiPath === "/iv-therapy-requests" || apiPath === "/nurse-requests") {
      return json(route, { items: [] });
    }
    return json(route, []);
  });
  // Never let the test actually leave for the WP origin.
  await page.route("https://nevarihealth.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>WP SSO LANDING</body></html>" })
  );
}

async function newDashboardPage(browser, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await context.addInitScript((state) => {
    window.localStorage.setItem(state.patientStorageKey, JSON.stringify(state.session));
    window.localStorage.setItem(state.authSecuritySettingsKey, JSON.stringify({ globalTwoStepVerification: false }));
  }, { patientStorageKey, authSecuritySettingsKey, session: patientSession() });
  const page = await context.newPage();
  await mockDashboardRoutes(page, opts);
  return { context, page };
}

async function testPayPage(browser) {
  const context = await browser.newContext({ viewport: { width: 360, height: 700 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const initCalls = [];
  await page.route("**/api/nevari-proxy**", async (route) => {
    const apiPath = proxyPath(route);
    if (apiPath.endsWith("/payment-data")) {
      return json(route, {
        entity_type: "appointment",
        appointment_id: 51,
        invoice_number: "NVH-APT-00031",
        payment_status: "pending",
        currency: "NGN",
        customer: { name: "Harry", email: "james.harryxcel@gmail.com" },
        totals: { total: 5000, balance_due: 5000 },
        items: [
          { name: "Consultation with angus doctor", qty: 1, total: 5000 },
          { name: "Line two", qty: 1, total: 0 },
          { name: "Line three", qty: 1, total: 0 },
        ],
        available_gateways: ["paystack"],
      });
    }
    if (apiPath.includes("/payment/initialize")) {
      initCalls.push(apiPath);
      return json(route, { payment_url: "https://checkout.paystack.test/pay/abc123" });
    }
    return json(route, []);
  });
  await page.route("https://checkout.paystack.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>PAYSTACK CHECKOUT</body></html>" })
  );

  await page.goto(`${baseUrl}/pay/NVH-APT-00031?base_url=https://nevarihealth.com`, { waitUntil: "networkidle" });
  await page.waitForSelector(".paywall-card h1", { timeout: 60000 });
  await page.screenshot({ path: path.join(shotDir, "pay-page-top.png") });

  const bodyClass = await page.evaluate(() => document.body.className);
  record("pay: body has paywall-mode class", bodyClass.includes("paywall-mode"), bodyClass);

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
  }));
  record(
    "pay: page is taller than viewport and scrollable overflow",
    metrics.scrollHeight > metrics.innerHeight && metrics.bodyOverflowY !== "hidden" && metrics.htmlOverflowY !== "hidden",
    JSON.stringify(metrics)
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
  const scrolled = await page.evaluate(() => window.scrollY);
  record("pay: window actually scrolls (scrollY > 0)", scrolled > 0, `scrollY=${scrolled}`);
  await page.screenshot({ path: path.join(shotDir, "pay-page-bottom.png") });

  const payButton = page.locator(".gateway-button").first();
  await payButton.scrollIntoViewIfNeeded();
  const visible = await payButton.isVisible();
  record("pay: gateway button reachable/visible", visible);

  await Promise.all([
    page.waitForURL("https://checkout.paystack.test/**", { timeout: 15000 }),
    payButton.click(),
  ]);
  record("pay: click initializes payment and redirects to gateway", initCalls.length === 1, initCalls.join(","));
  await context.close();
}

async function dismissProfileReminder(page) {
  // The "complete your profile" overlay appears on a delay and intercepts
  // pointer events; wait for it, then dismiss so drawer interactions work.
  const overlay = page.locator(".customer-profile-reminder-overlay");
  await overlay.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  const remindLater = page.locator(".customer-profile-reminder-secondary");
  if (await remindLater.count().catch(() => 0)) {
    await remindLater.first().click().catch(() => {});
    await overlay.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  }
}

async function testSsoHandoff(browser) {
  const ssoCalls = [];
  const { context, page } = await newDashboardPage(browser, { ssoCalls });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("button[aria-label='Open menu']", { timeout: 60000 });
  await dismissProfileReminder(page);
  await page.locator("button[aria-label='Open menu']").first().click();
  const storeItem = page.locator(".customer-mobile-drawer-item", { hasText: "Pharmacy" }).first();
  await storeItem.waitFor({ state: "visible", timeout: 30000 });
  await Promise.all([
    page.waitForURL("https://nevarihealth.com/**", { timeout: 15000 }),
    storeItem.click(),
  ]);
  const landedUrl = page.url();
  record("sso: store click calls /sso/wordpress/start", ssoCalls.length === 1, ssoCalls.join(","));
  record(
    "sso: browser lands on WP SSO complete URL",
    landedUrl.includes("nevari_sso_action=wordpress_complete") && landedUrl.includes("transaction=txn-1"),
    landedUrl
  );
  await context.close();
}

async function testNurseRequestPage(browser) {
  const { context, page } = await newDashboardPage(browser);
  await page.goto(`${baseUrl}/dashboard?page=request`, { waitUntil: "networkidle" });
  await page.waitForSelector(".customer-mobile-step-title", { timeout: 60000 });
  await page.screenshot({ path: path.join(shotDir, "nurse-request-step1.png"), fullPage: true });

  const bodyText = await page.evaluate(() => document.body.innerText);
  record("nurse: no stray backtick-n text on page", !bodyText.includes("`n"), "");
  record("nurse: no mojibake sequences on page", !bodyText.includes("Ãƒ") && !bodyText.includes("Ã¢"), "");
  await context.close();
}

async function testMtmContinue(browser) {
  const { context, page } = await newDashboardPage(browser);
  await page.goto(`${baseUrl}/dashboard?page=therapy`, { waitUntil: "networkidle" });
  const requestMtm = page.locator("button", { hasText: "Request MTM" }).first();
  await requestMtm.waitFor({ state: "visible", timeout: 60000 });
  await requestMtm.click();
  await page.waitForSelector(".customer-mtm-sticky-actions", { timeout: 60000 });
  await page.screenshot({ path: path.join(shotDir, "mtm-step1.png"), fullPage: true });

  const continueButton = page.locator(".customer-mtm-sticky-actions .customer-mobile-primary-button").first();
  await continueButton.waitFor({ state: "visible", timeout: 30000 });
  const disabled = await continueButton.isDisabled();
  record("mtm: Continue button is clickable (not hard-disabled)", !disabled);

  await continueButton.click();
  await page.waitForTimeout(400);
  const errorCount = await page.locator(".customer-mobile-field-error").count();
  record("mtm: clicking Continue surfaces validation errors", errorCount > 0, `errors=${errorCount}`);
  await page.screenshot({ path: path.join(shotDir, "mtm-validation-errors.png"), fullPage: true });
  await context.close();
}

async function testSubscriptionHamburger(browser) {
  const { context, page } = await newDashboardPage(browser);
  await page.goto(`${baseUrl}/dashboard?page=subscription-management`, { waitUntil: "networkidle" });
  await page.waitForSelector(".customer-subscription-management-shell", { timeout: 60000 });

  const menuOnManagePlan = page.locator(".customer-subscription-management-shell .subscription-menu-button");
  record("subscription: hamburger visible on Manage Plan (active subscriber)", await menuOnManagePlan.first().isVisible());
  await page.screenshot({ path: path.join(shotDir, "subscription-manage-plan.png"), fullPage: true });

  await page.locator(".customer-subscription-management-tabs button", { hasText: "History" }).click();
  await page.waitForTimeout(300);
  record("subscription: hamburger visible on History tab", await menuOnManagePlan.first().isVisible());
  await page.screenshot({ path: path.join(shotDir, "subscription-history.png"), fullPage: true });

  await menuOnManagePlan.first().click();
  await page.waitForTimeout(400);
  const drawerOpen = await page.locator(".customer-mobile-drawer-layer.open").count();
  record("subscription: hamburger opens the drawer", drawerOpen === 1);
  await context.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    await testPayPage(browser);
    await testSsoHandoff(browser);
    await testNurseRequestPage(browser);
    await testMtmContinue(browser);
    await testSubscriptionHamburger(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error("VERIFY SCRIPT ERROR:", error);
  process.exit(1);
});
