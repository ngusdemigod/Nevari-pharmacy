const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  };
}

async function metricValues(page, label) {
  return page.getByRole("region", { name: label }).locator(".admin-metric-card-value").allTextContents();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(() => {
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.example.test",
      frontendType: "storefront",
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: {
        id: 1,
        roles: ["administrator"],
        storefront_permissions: ["patients", "mtm"],
        display_name: "Verification Admin",
      },
      currentPage: "overview",
    }));
  });

  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const proxyPath = url.searchParams.get("path") || "";
    if (url.pathname === "/api/admin/users" || url.pathname === "/api/admin/patients") {
      const page = Number(url.searchParams.get("page") || 1);
      await route.fulfill(json({
        items: [{
          user_id: page,
          display_name: `Patient page ${page}`,
          user_email: `patient${page}@example.test`,
          managed_role: "customer",
          account_status: "active",
          orders: page,
          spend: page * 1000,
          appointments: page,
        }],
        pagination: { page, per_page: 10, total: 20, pages: 2 },
        metrics: { total: 20, orders: 45, spend: 125000, appointments: 31 },
      }));
      return;
    }
    if (url.pathname === "/api/admin/mtm") {
      const page = Number(url.searchParams.get("page") || 1);
      await route.fulfill(json({
        items: [{
          id: page,
          request_reference: `MTM-${page}`,
          status: page === 1 ? "submitted" : "completed",
          patient: { name: `Patient ${page}`, email: `patient${page}@example.test` },
        }],
        pagination: { page, per_page: 10, total: 20, pages: 2 },
        metrics: { total: 20, submitted: 8, scheduled: 7, completed: 5 },
      }));
      return;
    }
    if (proxyPath === "/auth/google-config") {
      await route.fulfill(json({ enabled: false, client_id: "" }));
      return;
    }
    if (url.pathname === "/api/reauth-test") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ success: false }),
      });
      return;
    }
    await route.fulfill(json([]));
  });

  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3002/admin/storefront", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });

  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await page.getByRole("region", { name: "Patient metrics" }).waitFor();
  const patientPageOne = await metricValues(page, "Patient metrics");
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (url.pathname === "/api/admin/users" || url.pathname === "/api/admin/patients")
        && url.searchParams.get("page") === "2";
    }),
    page.getByRole("button", { name: "Next", exact: true }).click(),
  ]);
  const patientPageTwo = await metricValues(page, "Patient metrics");

  await page.getByRole("button", { name: "MTM", exact: true }).click();
  await page.getByRole("region", { name: "MTM metrics" }).waitFor();
  const mtmPageOne = await metricValues(page, "MTM metrics");
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/admin/mtm" && url.searchParams.get("page") === "2";
    }),
    page.getByRole("button", { name: "Next", exact: true }).click(),
  ]);
  const mtmPageTwo = await metricValues(page, "MTM metrics");

  if (JSON.stringify(patientPageOne) !== JSON.stringify(patientPageTwo)) {
    throw new Error(`Patient metrics changed after pagination: ${patientPageOne} -> ${patientPageTwo}`);
  }
  if (JSON.stringify(mtmPageOne) !== JSON.stringify(mtmPageTwo)) {
    throw new Error(`MTM metrics changed after pagination: ${mtmPageOne} -> ${mtmPageTwo}`);
  }

  await page.evaluate(() => {
    void fetch("/api/reauth-test");
  });
  const dialog = page.getByRole("dialog", { name: "Sign in to continue" });
  await dialog.waitFor();
  const identifier = dialog.getByRole("textbox", { name: "Username or email" });
  await identifier.fill("Nadmin");
  if (await identifier.inputValue() !== "Nadmin") throw new Error("Username input was rejected.");
  await identifier.fill("admin@example.test");
  if (await identifier.inputValue() !== "admin@example.test") throw new Error("Email input was rejected.");

  await page.screenshot({
    path: "temp/stable-metrics-and-username-email-verified.png",
    fullPage: true,
  });
  console.log(JSON.stringify({
    patientMetrics: patientPageTwo,
    mtmMetrics: mtmPageTwo,
    usernameAccepted: true,
    emailAccepted: true,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
