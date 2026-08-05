const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const baseUrl = "http://127.0.0.1:3100";

function success(data) {
  return JSON.stringify({ success: true, data });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [375, 390, 768, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() => {
        localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
          accessToken: "server-session",
          baseUrl: "https://nevarihealth.com",
          frontendType: "patient_dashboard",
          expiresAt: Date.now() + 3600000,
          user: { id: 7, role: "customer", roles: ["customer"] },
        }));
      });
      await page.route("**/api/nevari-proxy**", async (route) => {
        const url = new URL(route.request().url());
        const path = url.searchParams.get("path") || "";
        if (path.includes("/document-data")) {
          await route.fulfill({
            contentType: "application/json",
            body: success({
              order_id: 10,
              invoice_number: "NVH-INV-00010",
              invoice_date: "2026-07-25T10:00:00Z",
              customer: { name: "Patient", email: "", phone: "", address: "Lagos" },
              items: [{ name: "Medicine", qty: 1, rate: 2500, total: 2500 }],
              totals: { subtotal: 2500, total: 2500, amount_paid: 0, balance_due: 2500 },
            }),
          });
          return;
        }
        await route.fulfill({ contentType: "application/json", body: success({}) });
      });
      await page.goto(`${baseUrl}/admin/orders/10/documents?role=patient&tab=invoice`, { waitUntil: "networkidle" });
      const geometry = await page.locator(".document-preview-shell").evaluate((node) => ({
        shellWidth: node.getBoundingClientRect().width,
        viewportWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      if (geometry.shellWidth > geometry.viewportWidth || geometry.bodyScrollWidth > geometry.viewportWidth + 1) {
        throw new Error(`Invoice overflow at ${width}px: ${JSON.stringify(geometry)}`);
      }
      results.push(`invoice-fit-${width}`);
      await page.close();
    }

    const pharmacist = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pharmacist.addInitScript(() => {
      localStorage.setItem("nevari_pharmacist_dashboard_session", JSON.stringify({
        accessToken: "server-session",
        baseUrl: "https://nevarihealth.com",
        frontendType: "pharmacist_dashboard",
        expiresAt: Date.now() + 3600000,
        user: { id: 3, display_name: "Pharmacist", role: "pharmacist", roles: ["pharmacist"] },
      }));
    });
    await pharmacist.route("**/api/nevari-proxy**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.searchParams.get("path") || "";
      const data = path.includes("/pharmacist/mtm-requests")
        ? { items: [{ id: 24, request_reference: "MTM-000024", status: "under_review", patient: { name: "Test Patient" }, document: { available: true } }] }
        : path.includes("/staff/care-requests/iv-therapy")
          ? { items: [] }
          : path.includes("/pharmacist/availability")
            ? { availability: {} }
            : {};
      await route.fulfill({ contentType: "application/json", body: success(data) });
    });
    await pharmacist.goto(`${baseUrl}/admin/pharmacist?view=mtm`, { waitUntil: "networkidle" });
    const searchSize = await pharmacist.locator(".pharmacist-workspace-search input").evaluate((node) => getComputedStyle(node).fontSize);
    if (searchSize !== "16px") throw new Error(`Pharmacist search font is ${searchSize}`);
    await pharmacist.locator(".pharmacist-case-mobile-list .doctor-mobile-overview-item").first().click();
    await pharmacist.getByRole("button", { name: "Decline" }).click();
    await pharmacist.locator(".pharmacist-action-error").waitFor();
    results.push("pharmacist-decline-validation", "pharmacist-search-16px");
    await pharmacist.close();

    for (const route of ["/login", "/admin/doctor/login", "/admin/storefront/login"]) {
      const page = await browser.newPage({ viewport: { width: 375, height: 844 } });
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      if (await page.locator("body").evaluate((body) => body.scrollWidth > document.documentElement.clientWidth + 1)) {
        throw new Error(`Horizontal overflow on ${route}`);
      }
      results.push(`role-page-${route}`);
      await page.close();
    }
    process.stdout.write(`PASS ${results.join(", ")}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
