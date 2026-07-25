const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.PHARMACIST_VERIFY_URL || "http://127.0.0.1:3004";
const outputDir = path.join(__dirname, "playwright-pharmacist-clinical");
fs.mkdirSync(outputDir, { recursive: true });

const mtm = {
  id: 31,
  request_reference: "MTM-000031",
  status: "scheduled",
  created_at: "2026-07-20 09:00:00",
  scheduled_at: "2026-07-25 10:00:00",
  payment_state: "paid",
  patient: { name: "Amara Patient" },
};
const iv = {
  id: 18,
  reference: "IVT-000018",
  status: "under_review",
  created_at: "2026-07-21 09:00:00",
  updated_at: "2026-07-24 09:00:00",
  patient: { name: "Bola Patient" },
  assignee: { id: 44, name: "Test Pharmacist" },
  next_action: ["approved", "declined"],
};

async function verifyViewport(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const requestedPaths = [];
  const mutations = [];
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("403 (Forbidden)")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("nevari_pharmacist_dashboard_session", JSON.stringify({
      accessToken: "server-session",
      expiresAt: Date.now() + 3600000,
      baseUrl: "https://nevarihealth.com",
      frontendType: "pharmacist_dashboard",
      user: { id: 44, display_name: "Test Pharmacist", email: "pharmacist@example.test", roles: ["pharmacist"] },
    }));
  });
  await page.route("**/api/nevari-proxy**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.searchParams.get("path") || "";
    requestedPaths.push(apiPath);
    if (request.method() !== "GET") mutations.push({ path: apiPath, method: request.method(), body: request.postDataJSON() });
    let data = {};
    if (apiPath === "/pharmacist/mtm-requests") data = { items: [mtm], pagination: { total: 1 } };
    if (apiPath === "/staff/care-requests/iv-therapy") data = { items: [iv], pagination: { total: 1 } };
    if (apiPath === "/pharmacist/availability") data = { availability: { monday: [{ start: "09:00", end: "10:00" }] } };
    if (apiPath === "/staff/care-requests/iv-therapy/18") data = { request: { ...iv, request_details: { main_goal: "Hydration and wellness" } } };
    if (apiPath === "/pharmacist/mtm-requests/31/pharmacy-products") data = { items: [{ id: 7, name: "Vitamin Support", sku: "VIT-7", price: 5000 }] };
    if (apiPath.includes("/pharmacist/mtm-requests/31/") && request.method() !== "GET") data = { request: mtm };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
  });

  await page.goto(`${baseUrl}/admin/pharmacist?view=products`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByRole("heading", { name: /Welcome, Test/ }).waitFor();
  const adminBoundaryStatus = await page.evaluate(async () => {
    const response = await fetch("/api/admin/products?baseUrl=https%3A%2F%2Fnevarihealth.com", {
      headers: {
        "x-nevari-frontend-origin": window.location.origin,
        "x-nevari-frontend-type": "pharmacist_dashboard",
      },
    });
    return { status: response.status, body: await response.text() };
  });
  if (adminBoundaryStatus.status !== 403) throw new Error(`Admin server boundary returned ${adminBoundaryStatus.status}, expected 403: ${adminBoundaryStatus.body}`);
  const navLabels = await page.locator(".dashboard-side-nav .nav-list .nav-item").allTextContents();
  if (navLabels.join("|") !== "Overview|MTM|IV Therapy|Availability") throw new Error(`Unexpected navigation: ${navLabels.join("|")}`);
  if (requestedPaths.some((value) => /^\/(products|orders|payments|dashboard\/store-admin)/.test(value))) throw new Error(`Forbidden request emitted: ${requestedPaths.join(", ")}`);

  const navigate = async (label) => {
    if (width <= 1100) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.locator(`.dashboard-side-nav.is-open button[aria-label="${label}"]`).click();
      return;
    }
    await page.locator(`.dashboard-side-nav button[aria-label="${label}"]`).click();
  };

  await navigate("MTM");
  await page.getByRole("heading", { name: "Medication Therapy Management" }).waitFor();
  await page.getByText("Amara Patient").first().click();
  await page.getByPlaceholder("Search products for this action plan").fill("vitamin");
  await page.getByRole("button", { name: /Vitamin Support/ }).click();
  await page.getByRole("button", { name: "Attach products" }).click();

  await navigate("IV Therapy");
  await page.getByRole("heading", { name: "IV Therapy", exact: true }).waitFor();
  await page.getByText("Bola Patient").first().click();
  await page.getByText("Hydration and wellness").waitFor();

  await navigate("Availability");
  await page.getByRole("heading", { name: "Availability", exact: true }).waitFor();
  await page.getByRole("button", { name: "Save availability" }).click();

  const bodyWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (bodyWidth.scroll > bodyWidth.client + 1) throw new Error(`Horizontal overflow at ${width}px: ${bodyWidth.scroll}/${bodyWidth.client}`);
  if (errors.length) throw new Error(`Browser errors at ${width}px: ${errors.join(" | ")}`);
  await page.screenshot({ path: path.join(outputDir, `pharmacist-${width}.png`), fullPage: true });
  await page.close();
  return { width, navLabels, requestedPaths: [...new Set(requestedPaths)], mutations };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [[375, 812], [768, 900], [1024, 900], [1440, 1000]]) {
    results.push(await verifyViewport(browser, viewport[0], viewport[1]));
  }
  await browser.close();
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(`PASS pharmacist clinical dashboard at ${results.map((item) => item.width).join(", ")}px`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
