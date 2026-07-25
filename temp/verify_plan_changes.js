const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  let checkInCount = 0;

  await page.route("**/api/appointment/join/test-token", async (route) => {
    if (route.request().method() === "POST") checkInCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          state: "active",
          message: "Your appointment is ready.",
          redirect_url: "https://meet.google.com/abc-defg-hij",
          notify: { disabled: false, cooldown_seconds: 0 },
        },
      }),
    });
  });

  await page.goto("https://dash-nevarihealth-e2q7q92vb-ngusdemigods-projects.vercel.app/appointment/join/test-token", { waitUntil: "domcontentloaded" });
  await page.getByText(/Opening your appointment in a new tab in 10s/i).waitFor({ state: "visible", timeout: 30000 });
  const joinButton = page.getByRole("button", { name: "Join now" });
  await joinButton.waitFor({ state: "visible" });
  await page.screenshot({ path: "temp/playwright-customer-verify/appointment-countdown-375.png", fullPage: true });
  await page.waitForTimeout(1100);
  const countdownText = await page.getByRole("status").textContent();
  if (!/9s|8s/.test(String(countdownText))) throw new Error(`Countdown did not advance: ${countdownText}`);
  await joinButton.click();
  await page.waitForTimeout(500);
  if (checkInCount !== 1) throw new Error(`Expected one participant check-in POST, received ${checkInCount}`);
  console.log(JSON.stringify({ ok: true, countdownText, checkInCount }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
