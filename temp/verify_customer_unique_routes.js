const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const BASE_URL = "http://127.0.0.1:3001";

function responseData(pathname) {
  if (pathname === "/customer-dashboard/summary") {
    return {
      dashboard: { profile: { display_name: "Ada Patient", email: "ada@example.com" } },
      orders: [],
      appointments: [],
      doctors: [],
      prescriptions: [],
    };
  }
  if (pathname === "/mtm-requests") {
    return { requests: [{ id: 21, request_reference: "MTM-000021", status: "submitted", patient: { name: "Ada Patient" } }] };
  }
  if (pathname.includes("/booking-context")) {
    return {
      request_reference: "MTM-000021",
      payment_state: "quota_reserved",
      slot_state: "unreserved",
      available_slots: [
        { start_at: "2026-07-25 10:00:00", end_at: "2026-07-25 10:30:00" },
        { start_at: "2026-07-25 11:00:00", end_at: "2026-07-25 11:30:00" },
        { start_at: "2026-07-26 09:00:00", end_at: "2026-07-26 09:30:00" },
      ],
    };
  }
  if (pathname.startsWith("/mtm-requests/")) {
    return { request: { id: 21, request_reference: "MTM-000021", status: "submitted", patient: { name: "Ada Patient" } } };
  }
  if (pathname.includes("subscription")) {
    return { subscription: null, free_consultations_remaining: 0 };
  }
  return [];
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(30000);
  await page.route("**/api/nevari-proxy**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.searchParams.get("path") || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: responseData(pathname) }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
      baseUrl: "https://example.test",
      frontendType: "patient_dashboard",
      frontendOrigin: location.origin,
      frontendUrl: `${location.origin}/dashboard`,
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: { id: 21, role: "patient", roles: ["patient"], display_name: "Ada Patient", email: "ada@example.com" },
    }));
  });

  await page.goto(`${BASE_URL}/dashboard/therapy/21`, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!page.url().includes("/dashboard/therapy/21")) throw new Error(`MTM detail route did not load: ${page.url()}`);

  const destinations = [
    ["Orders", "/dashboard/orders"],
    ["Appointments", "/dashboard/appointment"],
    ["Request a Nurse", "/dashboard/request"],
    ["Medication Therapy Management", "/dashboard/therapy"],
    ["IV Therapy", "/dashboard/iv-therapy"],
    ["Nevari Access Pro", "/dashboard/subscription-management"],
    ["Profile", "/dashboard/profile"],
    ["Overview", "/dashboard"],
  ];

  for (const [label, expectedPath] of destinations) {
    await page.getByRole("button", { name: "Open menu" }).first().click();
    await page.locator(".customer-mobile-drawer-item").filter({ hasText: label }).first().click();
    await page.waitForURL((url) => url.pathname === expectedPath);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    if (new URL(page.url()).pathname !== expectedPath) throw new Error(`${label} did not retain ${expectedPath} after reload.`);
    if (expectedPath !== "/dashboard/therapy" && new URL(page.url()).pathname.includes("/therapy/21")) {
      throw new Error(`${label} reopened the MTM request route.`);
    }
  }

  const unknownSectionResponse = await page.goto(`${BASE_URL}/dashboard/not-a-page`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const notFoundMarker = await page.locator('meta[name="next-error"]').getAttribute("content").catch(() => "");
  if (unknownSectionResponse?.status() !== 404 && notFoundMarker !== "not-found") {
    throw new Error(`Unknown dashboard section did not return a not-found response.`);
  }

  await page.screenshot({ path: "temp/customer-unique-routes-390.png", fullPage: true });
  await browser.close();
  console.log("Playwright unique customer routes verification passed, including refresh and fail-closed checks.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
