const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const APP_URL = "http://127.0.0.1:3001";
const pages = ["Products", "Orders", "Payments", "Patients", "Staffs", "Consultations", "MTM", "IV Therapy", "Nurse Requests"];

function success(data) {
  return JSON.stringify({ success: true, data });
}

async function preparePage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ appUrl }) => {
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.com",
      frontendType: "storefront",
      frontendOrigin: appUrl,
      frontendUrl: `${appUrl}/admin/storefront`,
      paired: true,
      siteName: "Nevari Pharmacy",
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: {
        id: 1,
        display_name: "Metrics Admin",
        email: "admin@example.com",
        roles: ["administrator"],
        storefront_permissions: ["products", "orders", "payments", "patients", "staff", "consultations", "mtm", "iv-therapy", "nurse-requests"],
      },
    }));
  }, { appUrl: APP_URL });
  await context.route("**/api/subscriptions/events?**", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: 'event: ready\ndata: {"ok":true}\n\n' }));
  await context.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const proxyPath = url.searchParams.get("path") || "";
    if (proxyPath === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: success({ user: { id: 1, display_name: "Metrics Admin", email: "admin@example.com", roles: ["administrator"], storefront_permissions: ["products", "orders", "payments", "patients", "staff", "consultations", "mtm", "iv-therapy", "nurse-requests"] } }),
      });
    }
    if (url.pathname.includes("/api/admin/users")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: success({ items: [], pagination: { page: 1, pages: 1, total: 0 } }) });
    }
    if (url.pathname.includes("/api/admin/care-nurse") || url.pathname.includes("/api/admin/nurses")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: success({ items: [] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: success([]) });
  });
  const page = await context.newPage();
  await page.goto(`${APP_URL}/admin/storefront`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator(".nav-groups").waitFor({ state: "visible", timeout: 120000 });
  return { context, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await preparePage(browser, { width: 1440, height: 1000 });
  const results = {};

  for (const pageName of pages) {
    await desktop.page.getByText(pageName, { exact: true }).first().click();
    const grid = desktop.page.locator(".page-view.active .admin-metric-grid").first();
    await grid.waitFor({ state: "visible", timeout: 30000 });
    const cards = grid.locator(".admin-metric-card");
    results[pageName] = {
      cards: await cards.count(),
      columns: await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
      shadows: await cards.evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element).boxShadow))]),
      weights: await cards.evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element.querySelector(".admin-metric-card-value")).fontWeight))]),
    };
  }

  await desktop.page.screenshot({ path: "temp/admin-metrics-desktop.png", fullPage: true });
  await desktop.context.close();

  const mobile = await preparePage(browser, { width: 390, height: 844 });
  await mobile.page.getByRole("button", { name: /menu/i }).first().click().catch(() => {});
  await mobile.page.getByText("Products", { exact: true }).first().click();
  const mobileGrid = mobile.page.locator(".page-view.active .admin-metric-grid").first();
  await mobileGrid.waitFor({ state: "visible", timeout: 30000 });
  results.mobile = {
    cards: await mobileGrid.locator(".admin-metric-card").count(),
    columns: await mobileGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    horizontalOverflow: await mobile.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  };
  await mobile.page.screenshot({ path: "temp/admin-metrics-mobile.png", fullPage: true });
  await mobile.context.close();
  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  Object.entries(results).forEach(([name, result]) => {
    if (result.cards !== 4) throw new Error(`${name}: expected four cards, found ${result.cards}.`);
    if (name !== "mobile" && result.columns !== 4) throw new Error(`${name}: expected four desktop columns.`);
  });
  if (results.mobile.columns !== 1 || results.mobile.horizontalOverflow) throw new Error("Mobile metric layout failed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
