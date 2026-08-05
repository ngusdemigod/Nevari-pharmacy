const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const subscriptionRequests = [];
  const errors = [];

  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("https://www.google.com/recaptcha/api.js**", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: 'window.grecaptcha={ready:function(callback){callback();},execute:function(){return Promise.resolve("playwright-captcha-token");}};',
  }));
  await context.route("**/api/subscriptions/events?**", (route) => {
    subscriptionRequests.push({ kind: "stream", url: route.request().url() });
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'event: ready\ndata: {"ok":true}\n\n',
    });
  });
  await context.route("**/api/nevari-proxy?**", (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path");
    if (path === "/auth/google-config") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { enabled: false } }) });
    }
    if (path === "/auth/login") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "set-cookie": "nevari_access_storefront=test-token; Path=/; HttpOnly; SameSite=Strict" },
        body: JSON.stringify({
          success: true,
          data: {
            access_token: "server-session",
            refresh_token: "server-session",
            expires_in: 3600,
            user: {
              id: 1,
              roles: ["administrator"],
              display_name: "Playwright Admin",
              storefront_permissions: ["subscriptions"],
            },
          },
        }),
      });
    }
    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 1,
              roles: ["administrator"],
              display_name: "Playwright Admin",
              storefront_permissions: ["subscriptions"],
            },
          },
        }),
      });
    }
    if (path === "/subscriptions/admin") {
      subscriptionRequests.push({ kind: "plans", url: route.request().url() });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            plans: [{
              id: 7,
              plan_key: "nevari_access_pro",
              name: "Nevari Access Pro",
              price: "NGN 25,000",
              interval: "monthly",
              users: 12,
              status: "active",
              checkout_type: "auto_generated",
            }],
            users: [],
            total_subscriptions: 12,
            active_subscriptions: 12,
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
  });

  await page.goto("http://localhost:3000/admin/storefront/login", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByLabel("Email").fill("playwright-admin");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/admin/storefront**", { timeout: 60000 });
  await page.getByText("Subscriptions", { exact: true }).first().click();
  await page.getByText("Nevari Access Pro", { exact: true }).waitFor({ state: "visible", timeout: 60000 });

  const result = {
    planVisible: await page.getByText("Nevari Access Pro", { exact: true }).isVisible(),
    skeletonRows: await page.locator(".subscription-plans-panel .skeleton").count(),
    plansRequests: subscriptionRequests.filter((item) => item.kind === "plans").length,
    streamRequests: subscriptionRequests.filter((item) => item.kind === "stream").length,
    errors,
  };
  await page.screenshot({ path: "temp/subscription-plans-fixed.png", fullPage: true });
  console.log(JSON.stringify(result, null, 2));
  if (!result.planVisible || result.skeletonRows > 0 || result.plansRequests < 1) {
    throw new Error("Subscription plans did not leave the loading state.");
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
