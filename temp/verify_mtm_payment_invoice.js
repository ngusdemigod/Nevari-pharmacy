const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = process.env.NEVARI_TEST_BASE_URL || "http://127.0.0.1:3000";

async function mockProxy(page) {
  await page.route("**/api/nevari-proxy**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path") || "";
    let data;
    if (path.includes("/booking-context")) {
      data = {
        request_reference: "MTM-000021",
        payment_state: "pending",
        slot_state: "reserved_pending_payment",
        slot_hold_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        reserved_start_at: "2026-07-25 11:00:00",
        duration_minutes: 30,
        currency: "NGN",
        fee: 25000,
        payment_url: `${baseUrl}/pay/NVH-INV-03032?payment_token=test-token&return_to=%2Fdashboard%2Ftherapy%2F21`
      };
    } else {
      data = {
        invoice_number: "NVH-INV-03032",
        order_id: 3032,
        order_number: "3032",
        payment_status: "unpaid",
        customer: { name: "Ada Patient", email: "ada@example.com" },
        mtm_request: {
          id: 21,
          reference: "MTM-000021",
          patient_name: "Ada Patient",
          status: "under_review",
          pharmacist_name: "Test Pharmacist",
          selected_availability: "2026-07-25 11:00:00",
          duration_minutes: 30,
          timezone: "Africa/Lagos",
          consultation_method: "Google Meet"
        },
        items: [{ name: "Medication Therapy Management consultation", qty: 1, total: 25000 }],
        totals: { total: 25000, balance_due: 25000 },
        currency: "NGN",
        available_gateways: ["paystack"]
      };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewportSize: viewport });
    await mockProxy(page);
    await page.addInitScript(() => {
      localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
        accessToken: "server-session",
        expiresAt: Date.now() + 3600000,
        baseUrl: "https://example.test",
        user: { role: "patient", roles: ["patient"], display_name: "Ada Patient" }
      }));
    });

    await page.goto(`${baseUrl}/pay/NVH-INV-03032?payment_token=test-token&return_to=%2Fdashboard%2Ftherapy%2F21`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Order details" }).waitFor();
    await page.getByText("MTM-000021", { exact: true }).waitFor();
    await page.getByText("Ada Patient", { exact: true }).first().waitFor();
    await page.getByText("Test Pharmacist", { exact: true }).waitFor();
    await page.getByText("30 minutes", { exact: true }).waitFor();
    await page.getByText("Google Meet", { exact: true }).waitFor();
    await page.getByText("Medication Therapy Management consultation x 1", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Go back" }).waitFor();
    const invoiceStyles = await page.getByRole("heading", { name: "Order details" }).evaluate((element) => {
      const card = element.closest(".paywall-card");
      return { fontSize: getComputedStyle(element).fontSize, borderWidth: getComputedStyle(card).borderTopWidth };
    });
    if (invoiceStyles.fontSize !== "24px" || invoiceStyles.borderWidth !== "0px") {
      throw new Error(`Invoice styling failed at ${viewport.width}px: ${JSON.stringify(invoiceStyles)}`);
    }
    await page.screenshot({ path: `temp/mtm-payment-invoice-${viewport.width}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log("Playwright MTM payment and invoice verification passed at 375px and 1280px.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
