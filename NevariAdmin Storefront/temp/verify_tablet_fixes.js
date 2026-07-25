const { chromium } = require("playwright");

const baseUrl = "https://dev-dash-nevarihealth.vercel.app";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 704, height: 920 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator(".auth-snackbar").waitFor({ state: "visible", timeout: 30000 });
  const noticeBox = await page.locator(".auth-snackbar").boundingBox();
  if (!noticeBox) throw new Error("Auth notice did not render.");
  if (noticeBox.height > 240) throw new Error(`Auth notice is too tall: ${noticeBox.height}`);
  if (noticeBox.width > 672) throw new Error(`Auth notice is too wide: ${noticeBox.width}`);
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.className = "appointment-booking-cta";
    button.innerHTML = '<span class="appointment-booking-cta-label">Book an appointment</span><span class="appointment-booking-cta-icon" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span>';
    document.body.appendChild(button);
  });
  const labelMetrics = await page.locator(".appointment-booking-cta-label").last().evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    fontSize: window.getComputedStyle(node).fontSize,
    text: node.textContent,
  }));
  if (labelMetrics.scrollWidth > labelMetrics.clientWidth + 1) {
    throw new Error(`Appointment CTA label still clips: ${JSON.stringify(labelMetrics)}`);
  }
  await page.screenshot({ path: "temp/playwright-customer-verify/tablet-notice-cta-preview.png", fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ ok: true, noticeBox, labelMetrics }, null, 2));
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});