const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = "http://127.0.0.1:3000";
const output = path.join(process.cwd(), "temp", "playwright-care-journeys");
fs.mkdirSync(output, { recursive: true });

function success(data) { return { success: true, data }; }
function proxyPath(request) { return new URL(request.url()).searchParams.get("path") || ""; }
function session(user, frontendType = "patient_dashboard") {
  return { baseUrl: "https://nevarihealth.com", frontendType, frontendOrigin: baseUrl, frontendUrl: `${baseUrl}/dashboard`, paired: true, accessToken: "server-session", refreshToken: "server-session", expiresAt: Date.now() + 3600000, user };
}

async function fulfill(route, data, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(success(data)) });
}

async function verifyPatientMtm(browser, viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 900 });
  await context.addInitScript(({ value }) => localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify(value)), { value: session({ id: 41, display_name: "Journey Patient", email: "patient@example.test", roles: ["customer"] }) });
  const page = await context.newPage();
  const errors = [];
  let reserveCount = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/nevari-proxy**", async (route) => {
    const request = route.request();
    const apiPath = proxyPath(request);
    if (apiPath === "/dashboard/patient") return fulfill(route, { store_currency: "NGN", store_timezone: "Africa/Lagos", profile: { id: 41, display_name: "Journey Patient", email: "patient@example.test", roles: ["customer"] }, settings: {}, prescriptions: { recent: [] }, appointments: { recent: [] } });
    if (apiPath === "/subscriptions/me") return fulfill(route, { status: "active", is_paid: true, plan: "Nevari Access Pro" });
    if (apiPath === "/mtm-requests") return fulfill(route, { items: [{ id: 77, request_reference: "MTM-000077", status: "under_review", created_at: "2026-07-22 10:00:00", assigned_pharmacist_user_id: 9, assigned_pharmacist_name: "Test Pharmacist", payment: { state: "quota_reserved", required: false }, slot_reservation: { state: "unreserved", start_at: null }, medication_profile: { medications: [] }, document: { available: false } }] });
    if (apiPath === "/mtm-requests/77/booking-context") return fulfill(route, { mtm_request_id: 77, payment_required: false, payment_state: "quota_reserved", currency: "NGN", fee: 0, quota_remaining: 3, slot_state: reserveCount ? "reserved" : "unreserved", reserved_start_at: reserveCount ? "2026-07-25T09:00:00Z" : null, available_slots: reserveCount ? [] : [{ start_at: "2026-07-25T09:00:00Z", end_at: "2026-07-25T09:30:00Z" }] });
    if (apiPath === "/mtm-requests/77/reserve-slot" && request.method() === "POST") { reserveCount += 1; return fulfill(route, { request: { id: 77 } }); }
    if (["/orders", "/appointments", "/doctors", "/customers/me/settings", "/nurse-requests", "/iv-therapy-requests"].includes(apiPath)) return fulfill(route, apiPath === "/customers/me/settings" ? {} : []);
    return fulfill(route, []);
  });
  await page.goto(`${baseUrl}/dashboard?view=therapy`, { waitUntil: "networkidle" });
  const reminder = page.locator(".customer-profile-reminder-overlay");
  if (await reminder.isVisible().catch(() => false)) await page.locator(".customer-profile-reminder-secondary").click();
  const menu = page.getByRole("button", { name: "Open menu" }).first();
  if (viewport.width >= 960) {
    await page.getByText("Medication Therapy Management", { exact: true }).first().click();
  } else if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.locator(".customer-mobile-drawer-item").filter({ hasText: "Medication Therapy Management" }).click();
  }
  const historyTab = page.locator(".customer-mobile-pill-tab").filter({ hasText: /^History$/ });
  try { await historyTab.waitFor({ state: "visible", timeout: 10000 }); } catch {
    await page.screenshot({ path: path.join(output, `mtm-${viewport.width}-failure.png`), fullPage: true });
    throw new Error(`MTM history tab missing at ${viewport.width}px. Page errors: ${errors.join(" | ")}. Text: ${(await page.locator("body").innerText()).slice(0, 700)}`);
  }
  await historyTab.click();
  await page.getByText("MTM-000077", { exact: true }).click();
  await page.getByText("Pro consultation credit reserved", { exact: true }).waitFor();
  await page.locator("select[id^='mtm-slot-']").selectOption("2026-07-25T09:00:00Z");
  await page.getByRole("button", { name: "Reserve slot" }).click();
  await page.getByText("reserved pending clinical approval", { exact: false }).waitFor();
  if (reserveCount !== 1 || errors.length) throw new Error(`MTM recovery failed: reserve=${reserveCount}; errors=${errors.join(" | ")}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("MTM modal has horizontal overflow.");
  await page.screenshot({ path: path.join(output, `mtm-${viewport.width}.png`), fullPage: true });
  await context.close();
  return { viewport: viewport.width, reserveCount, overflow };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const viewport of [{ width: 375, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) results.push(await verifyPatientMtm(browser, viewport));
    process.stdout.write(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
