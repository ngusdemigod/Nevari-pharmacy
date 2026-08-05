const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const outputDir = path.resolve(__dirname, "admin-walkthrough-updated");

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  };
}

async function settle(page) {
  await page.waitForTimeout(1800);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
}

async function capture(page, name) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: false,
  });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
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
        storefront_permissions: [
          "analytics", "products", "orders", "payments", "patients",
          "subscriptions", "staff", "consultations", "mtm",
          "iv-therapy", "nurse-requests", "logs",
        ],
        display_name: "Nevari Administrator",
      },
      currentPage: "overview",
    }));
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/products") {
      await route.fulfill(json([
        { id: 101, name: "Vitamin C 1000 mg", sku: "NEV-VITC-1000", status: "publish", stock_status: "in stock", stock_quantity: 42, price: 8500, categories: [{ name: "Vitamins" }] },
        { id: 102, name: "Paracetamol 500 mg", sku: "NEV-PCM-500", status: "publish", stock_status: "in stock", stock_quantity: 18, price: 3200, categories: [{ name: "Pain Relief" }] },
      ]));
      return;
    }
    if (url.pathname === "/api/admin/users") {
      const staff = url.searchParams.get("scope") === "staff";
      const items = staff
        ? [
          { user_id: 201, display_name: "Demo Pharmacist", user_email: "pharmacist@example.test", managed_role: "pharmacist", account_status: "approved" },
          { user_id: 202, display_name: "Demo Nurse", user_email: "nurse@example.test", managed_role: "nurse", account_status: "pending" },
        ]
        : [
          { user_id: 301, display_name: "Demo Patient", user_email: "patient@example.test", managed_role: "customer", account_status: "active", orders: 2 },
        ];
      await route.fulfill(json({ items, pagination: { page: 1, pages: 1, total: items.length } }));
      return;
    }
    if (url.pathname === "/api/admin/orders") {
      await route.fulfill(json([
        { id: 4001, number: "4001", status: "processing", total: "11700", currency: "NGN", billing: { first_name: "Demo", last_name: "Patient" }, line_items: [{ name: "Vitamin C 1000 mg", quantity: 1 }] },
      ]));
      return;
    }
    await route.fulfill(json([]));
  });
  const page = await context.newPage();

  page.on("dialog", (dialog) => dialog.dismiss());
  await page.goto("http://127.0.0.1:3002/admin/storefront", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await settle(page);

  await capture(page, "overview");

  const pages = [
    ["Products", "products"],
    ["Orders", "orders"],
    ["Payments", "payments"],
    ["Patients", "user-accounts"],
    ["Subscriptions", "subscriptions"],
    ["Staffs", "staff"],
    ["MTM", "mtm"],
    ["IV Therapy", "iv-therapy"],
    ["Nurse Requests", "nurse-requests"],
    ["Analytics", "analytics"],
  ];

  for (const [label, name] of pages) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await settle(page);
    await capture(page, name);
  }

  await page.getByRole("button", { name: "Products", exact: true }).click();
  await settle(page);
  await page.getByRole("button", { name: "Create new record" }).click();
  await page.getByRole("menuitem", { name: "New Product" }).click();
  await settle(page);
  await capture(page, "product-create");
  await page.getByRole("button", { name: /close/i }).first().click().catch(() => null);

  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const loginPage = await publicContext.newPage();
  await loginPage.goto("http://127.0.0.1:3002/admin/storefront/login", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await loginPage.screenshot({
    path: path.join(outputDir, "login.png"),
    fullPage: false,
  });
  await publicContext.close();

  const files = fs.readdirSync(outputDir).filter((file) => file.endsWith(".png"));
  console.log(JSON.stringify({ files, count: files.length, url: page.url() }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
