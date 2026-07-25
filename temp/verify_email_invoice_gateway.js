const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = process.env.NEVARI_TEST_BASE_URL || "http://127.0.0.1:3010";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const requests = [];

  await page.route("**/api/nevari-proxy**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.searchParams.get("path") || "";
    requests.push({ method: request.method(), path: apiPath });
    if (apiPath === "/invoices/NVH-APT-00042/payment-data") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            entity_type: "appointment",
            invoice_number: "NVH-APT-00042",
            appointment_id: 42,
            payment_status: "pending",
            customer: { name: "Ada Patient", email: "ada@example.test" },
            items: [{ name: "Doctor consultation", qty: 1, total: 5000 }],
            totals: { total: 5000, balance_due: 5000 },
            currency: "NGN",
            available_gateways: ["paystack"]
          }
        })
      });
    }
    if (apiPath === "/appointments/42/payment/initialize") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { payment_url: `${baseUrl}/gateway-started` } })
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false }) });
  });

  await page.goto(`${baseUrl}/pay/NVH-APT-00042?payment_token=signed-email-token`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "NVH-APT-00042" }).waitFor();
  if (requests.some((entry) => entry.path.includes("/payment/initialize"))) {
    throw new Error("Gateway checkout initialized before the invoice was shown.");
  }
  await page.getByRole("button", { name: "Make payment" }).click();
  await page.waitForURL(`${baseUrl}/gateway-started`);

  const invoiceIndex = requests.findIndex((entry) => entry.method === "GET" && entry.path === "/invoices/NVH-APT-00042/payment-data");
  const initializeIndex = requests.findIndex((entry) => entry.method === "POST" && entry.path === "/appointments/42/payment/initialize");
  if (invoiceIndex < 0 || initializeIndex <= invoiceIndex) {
    throw new Error(`Invalid payment sequence: ${JSON.stringify(requests)}`);
  }

  console.log(JSON.stringify({ ok: true, sequence: requests }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
