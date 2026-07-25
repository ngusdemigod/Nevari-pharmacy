const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = process.env.NEVARI_TEST_BASE_URL || "http://127.0.0.1:3000";

function assert(value, message) {
  if (!value) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  const stored = await page.request.post(`${baseUrl}/api/auth/continuation`, {
    data: { path: "/dashboard?page=appointment#reservation" }
  });
  assert(stored.ok(), `Continuation POST failed: ${stored.status()}`);
  const read = await page.request.get(`${baseUrl}/api/auth/continuation`);
  const continuation = await read.json();
  assert(continuation.path === "/dashboard?page=appointment#reservation", "Continuation path was not preserved.");
  const rejected = await page.request.post(`${baseUrl}/api/auth/continuation`, {
    data: { path: "https://attacker.example/steal" }
  });
  assert(rejected.status() === 422, "External continuation path was not rejected.");

  await page.goto(`${baseUrl}/login?expired=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main, form", { timeout: 30000 });
  const loginUrl = new URL(page.url());
  assert(loginUrl.pathname === "/login", "Expired session escaped the login blocker.");

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div class="customer-confirmation-modal customer-appointment-confirmation-modal">
        <section class="customer-flow-status-page customer-flow-status-page-warning customer-flow-status-page-modal">
          <div class="customer-flow-status-card customer-flow-status-card-checkout">
            <header class="customer-flow-status-head">
              <div class="customer-flow-status-icon is-warning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2"/></svg></div>
              <div class="customer-reservation-countdown"><strong>04:59</strong></div>
              <h2>Appointment reserved</h2>
              <p>Complete payment to confirm your consultation.</p>
            </header>
            <section class="customer-flow-amount-card"><div><span class="customer-flow-amount-label">Amount due</span><strong class="customer-flow-amount-value">NGN 5,000.00</strong></div><span class="customer-flow-status-pill is-processing">Pending payment</span></section>
            <section class="customer-flow-status-panel customer-flow-status-panel-soft">
              <div class="customer-flow-kv-list"><div class="customer-flow-kv-row"><span>Doctor</span><strong>angus doctor</strong></div><div class="customer-flow-kv-row"><span>Date</span><strong>Jul 25, 2026</strong></div><div class="customer-flow-kv-row"><span>Time</span><strong>01:00 PM</strong></div><div class="customer-flow-kv-row"><span>Amount</span><strong>NGN 5,000.00</strong></div></div>
            </section>
            <div class="customer-flow-status-actions"><a class="customer-mobile-primary-button customer-flow-status-link">Proceed to payment</a><button class="customer-mobile-secondary-button">I have made payment</button><button class="customer-mobile-secondary-button customer-flow-status-danger-button">Cancel Appointment</button></div>
          </div>
        </section>
      </div>`;
  });
  const card = page.locator(".customer-flow-status-card-checkout");
  const style = await card.evaluate((element) => {
    const computed = getComputedStyle(element);
    const button = getComputedStyle(document.querySelector(".customer-flow-status-actions button"));
    const heading = getComputedStyle(document.querySelector(".customer-flow-status-head h2"));
    const amount = getComputedStyle(document.querySelector(".customer-flow-amount-card"));
    return { border: computed.borderTopWidth, shadow: computed.boxShadow, background: computed.backgroundColor, buttonSize: button.fontSize, buttonWeight: button.fontWeight, buttonRadius: button.borderRadius, headingSize: heading.fontSize, headingWeight: heading.fontWeight, amountBackground: amount.backgroundColor };
  });
  assert(style.border === "0px", `Reservation card has an outer border: ${style.border}`);
  assert(style.shadow === "none", `Reservation card has a shadow: ${style.shadow}`);
  assert(style.background === "rgb(255, 255, 255)", `Reservation background is not white: ${style.background}`);
  assert(style.buttonSize === "14px" && style.buttonWeight === "300", `Button typography mismatch: ${style.buttonSize}/${style.buttonWeight}`);
  assert(style.buttonRadius === "9999px", `Button is not fully rounded: ${style.buttonRadius}`);
  assert(style.headingSize === "24px" && style.headingWeight === "300", `Heading typography mismatch: ${style.headingSize}/${style.headingWeight}`);
  assert(style.amountBackground === "rgb(226, 239, 252)", `Amount due background mismatch: ${style.amountBackground}`);
  assert(await page.getByText("Time remaining").count() === 0, "Time remaining label is still visible.");
  await page.screenshot({ path: "temp/playwright-customer-verify/appointment-reservation-flat-375.png", fullPage: true });

  console.log(JSON.stringify({ ok: true, continuation: continuation.path, style }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
