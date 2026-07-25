const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const baseUrl = "http://127.0.0.1:3002";
const STORAGE_KEY = "nevari_admin_storefront_session";

function success(data) {
  return { success: true, data, meta: {} };
}

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(success(data)),
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  const session = {
    baseUrl: "https://nevarihealth.com",
    frontendType: "storefront",
    frontendOrigin: baseUrl,
    frontendUrl: `${baseUrl}/admin/storefront`,
    paired: true,
    siteName: "Nevari Pharmacy",
    siteLogo: "",
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: {
      id: 1,
      display_name: "angus igbani",
      email: "angus@example.com",
      roles: ["administrator"],
      avatar_url: "",
    },
  };

  await context.addInitScript((state) => {
    window.localStorage.setItem(state.key, JSON.stringify(state.session));
  }, { key: STORAGE_KEY, session });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("**/api/admin/summary**", (route) => json(route, {
    dashboard: {
      sales: { today: 0, month: 0, pending: 0 },
      consultations: {},
      prescriptions: {},
      emails: {},
      store_currency: "NGN",
      store_timezone: "Africa/Lagos",
    },
  }));

  await page.route("**/api/admin/**", (route) => json(route, []));
  await page.route("**/api/nevari-proxy**", (route) => json(route, { user: session.user }));

  await page.goto(`${baseUrl}/admin/storefront`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".topbar", { timeout: 30000 });
  await page.waitForTimeout(1500);

  const topbarActionsText = await page.locator(".topbar-actions").innerText().catch(() => "");
  const pillButtonCount = await page.locator(".topbar-actions .pill-button").count();
  const settingsIconCount = await page.locator(".topbar-actions button[class='icon-button']").count();
  const createButtonCount = await page.locator(".topbar-actions .btn-add-icon").count();
  const userChipCount = await page.locator(".topbar-actions .user-chip-button").count();

  await page.locator(".topbar").screenshot({ path: "temp/topbar-after-cleanup.png" });
  await page.screenshot({ path: "temp/admin-overview-after-cleanup.png", fullPage: false });

  await browser.close();

  console.log(JSON.stringify({
    ok: true,
    topbarActionsText,
    pillButtonCount,
    settingsIconCount,
    createButtonCount,
    userChipCount,
    consoleErrors: consoleErrors.slice(0, 15),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
