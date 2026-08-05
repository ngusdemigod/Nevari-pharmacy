const { chromium } = require("playwright");

const baseUrl = "http://127.0.0.1:3002/admin/storefront";

function json(data) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staffSearches = [];

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
        storefront_permissions: ["products", "staff"],
        display_name: "Search Verification Admin",
      },
      currentPage: "overview",
    }));
  });

  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const proxyPath = url.searchParams.get("path") || "";
    if (proxyPath.startsWith("/auth/")) {
      await route.fulfill(json({
        access_token: "server-session",
        refresh_token: "server-session",
        expires_in: 3600,
        user: {
          id: 1,
          roles: ["administrator"],
          storefront_permissions: ["products", "staff"],
          display_name: "Search Verification Admin",
        },
      }));
      return;
    }
    if (url.pathname === "/api/admin/products") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const products = [
        { id: 1, name: "Amoxicillin", sku: "AMX-001", status: "publish", stock_status: "in stock", price: 5000 },
        { id: 2, name: "Vitamin C", sku: "VIT-002", status: "publish", stock_status: "in stock", price: 2500 },
      ].filter((item) => !search || `${item.name} ${item.sku}`.toLowerCase().includes(search));
      await route.fulfill(json(products));
      return;
    }
    if (url.pathname === "/api/admin/users" && url.searchParams.get("scope") === "staff") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      staffSearches.push(search);
      const rows = [
        { user_id: 10, display_name: "Ada Doctor", user_email: "ada@example.test", managed_role: "doctor", account_status: "approved" },
        { user_id: 11, display_name: "Bola Nurse", user_email: "bola@example.test", managed_role: "nurse", account_status: "approved" },
      ].filter((item) => !search || `${item.display_name} ${item.user_email} ${item.managed_role}`.toLowerCase().includes(search));
      await route.fulfill(json({ items: rows, pagination: { page: 1, pages: 1, total: rows.length } }));
      return;
    }
    await route.fulfill(json([]));
  });

  const page = await context.newPage();
  page.on("request", (request) => {
    if (request.url().includes("/api/")) console.log("REQUEST", request.url());
  });
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("CONSOLE", message.text());
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  console.log(JSON.stringify({ url: page.url(), title: await page.title() }));
  console.log(await page.getByRole("button").allTextContents());
  console.log((await page.locator("body").innerText()).slice(0, 1200));

  await page.getByRole("button", { name: "Products" }).click();
  const search = page.locator("#globalSearch");
  await search.fill("Vitamin");
  await page.waitForTimeout(500);
  await page.getByText("Vitamin C", { exact: true }).first().waitFor();
  if (await page.getByText("Amoxicillin", { exact: true }).count()) throw new Error("Product search left a non-matching row visible.");

  await page.getByRole("button", { name: "Staffs" }).click();
  if (await search.inputValue()) throw new Error("Search was not cleared when the active page changed.");
  await search.fill("Bola");
  await page.waitForTimeout(500);
  await page.getByText("Bola Nurse", { exact: true }).waitFor();
  if (staffSearches.includes("vitamin")) throw new Error(`Previous-page search leaked into the staff query: ${JSON.stringify(staffSearches)}`);
  if (!staffSearches.includes("bola")) throw new Error(`Staff search was not sent through the scoped API key: ${JSON.stringify(staffSearches)}`);
  await page.getByText("Bola Nurse", { exact: true }).click();
  const staffDialog = page.getByRole("dialog", { name: "Bola Nurse" });
  await staffDialog.waitFor();
  await staffDialog.getByText("Role", { exact: true }).waitFor();

  await page.screenshot({ path: "temp/active-page-search-staff.png", fullPage: true });
  console.log(JSON.stringify({ productFilter: true, pageIsolation: true, scopedStaffQuery: staffSearches, roleManagementVisible: true }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
