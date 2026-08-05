const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:3002/admin/storefront";

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const currentYear = new Date().getFullYear();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

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
        display_name: "Revenue Preview Admin",
      },
      currentPage: "overview",
    }));
  });

  await context.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const requestedPath = url.searchParams.get("path") || "";
    if (requestedPath === "/orders") {
      return route.fulfill(json({
        success: true,
        data: [
          { id: 1, status: "completed", total: "200000.00", created_at: `${currentYear}-02-10T10:00:00Z` },
          { id: 2, status: "processing", total: "139198.80", created_at: `${currentYear}-06-15T10:00:00Z` },
          { id: 3, status: "pending", total: "900000.00", created_at: `${currentYear}-07-01T10:00:00Z` },
        ],
      }));
    }
    return route.fulfill(json({ success: true, data: [] }));
  });

  await context.route("**/api/admin/summary**", (route) => route.fulfill(json({
    success: true,
    data: {
      dashboard: {
        sales: {
          today: "45172.40",
          week: "103250.00",
          month: "120000.00",
          currency: "NGN",
        },
        store_currency: "NGN",
        consultations: {},
        prescriptions: {},
        emails: {},
      },
      recent_orders: [],
    },
  })));

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector(".nevari-admin-storefront", { timeout: 120000 });
    await page.locator(".auth-gate").evaluate((element) => {
      element.hidden = true;
      element.style.display = "none";
    }).catch(() => null);

    const processedCard = page.locator(".overview-admin-metrics .admin-metric-card").filter({ hasText: "Processed today" });
    await processedCard.waitFor({ state: "visible" });
    await processedCard.getByText("₦45,172.40", { exact: true }).waitFor();
    await processedCard.getByText("₦103,250.00 processed this week", { exact: true }).waitFor();

    const graph = page.locator(".revenue-overview-card");
    await graph.getByRole("combobox", { name: "Processed revenue granularity" }).waitFor();
    await graph.getByText("₦339,198.80", { exact: true }).waitFor();

    const selectedPeriod = await graph.getByRole("combobox").inputValue();
    const selectedLabel = await graph.getByRole("combobox").locator("option:checked").textContent();
    if (selectedPeriod !== "monthly" || selectedLabel.trim() !== "Processed revenue · This year") {
      throw new Error(`Unexpected graph period: ${JSON.stringify({ selectedPeriod, selectedLabel })}`);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) {
      throw new Error("Overview revenue UI overflows horizontally.");
    }
    if (consoleErrors.length) {
      throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
    }

    await page.screenshot({ path: "temp/processed-revenue-scopes-1440.png", fullPage: true });
    console.log(JSON.stringify({
      card: "₦45,172.40 processed today",
      note: "₦103,250.00 processed this week",
      graph: "₦339,198.80 processed this year",
      pendingOrderExcluded: true,
      overflow,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
