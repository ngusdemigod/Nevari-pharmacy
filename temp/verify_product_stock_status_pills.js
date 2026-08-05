const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  };
}

async function verifyViewport(browser, viewport, screenshotName) {
  const context = await browser.newContext({ viewport });
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
        storefront_permissions: ["products"],
        display_name: "Verification Admin",
      },
      currentPage: "products",
    }));
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/products") {
      await route.fulfill(json([
        { id: 1, name: "Available medicine", sku: "IN-001", status: "publish", stock_status: "instock", stock_quantity: 20, price: 2500 },
        { id: 2, name: "Unavailable medicine", sku: "OUT-001", status: "publish", stock_status: "outofstock", stock_quantity: 0, price: 3500 },
        { id: 3, name: "Unmanaged inventory", sku: "IN-002", status: "publish", stock_status: "instock", stock_quantity: null, price: 1500 },
      ]));
      return;
    }
    await route.fulfill(json([]));
  });

  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3002/admin/storefront", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.getByRole("region", { name: "Product metrics" }).waitFor();

  const inStock = page.locator(".products-table .status-pill.success");
  const outOfStock = page.locator(".products-table .status-pill.error");
  if (await inStock.count() !== 2) throw new Error("Expected two green In stock pills.");
  if (await outOfStock.count() !== 1) throw new Error("Expected one red Out of stock pill.");
  if ((await inStock.allTextContents()).some((text) => text.trim() !== "In stock")) {
    throw new Error("In stock labels were not normalized.");
  }
  if ((await outOfStock.textContent()).trim() !== "Out of stock") {
    throw new Error("Out of stock label was not normalized.");
  }
  const metricValues = await page.getByRole("region", { name: "Product metrics" }).locator(".admin-metric-card-value").allTextContents();
  if (metricValues[0]?.trim() !== "2") throw new Error(`Expected 2 in-stock products, received ${metricValues[0]}.`);
  await page.getByRole("button", { name: /^Out of stock 1$/ }).click();
  await page.getByText("Unavailable medicine", { exact: true }).waitFor();
  if (await page.getByText("Available medicine", { exact: true }).count()) {
    throw new Error("The out-of-stock filter included an in-stock product.");
  }

  await page.screenshot({ path: screenshotName, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await context.close();
  return { viewport, overflow };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [
    await verifyViewport(browser, { width: 1440, height: 1000 }, "temp/product-stock-status-pills-1440.png"),
    await verifyViewport(browser, { width: 390, height: 844 }, "temp/product-stock-status-pills-390.png"),
  ];
  console.log(JSON.stringify({ results, labels: ["In stock", "Out of stock"], statusPills: true }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
