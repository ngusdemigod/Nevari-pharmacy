const { chromium } = require("playwright");
const baseUrl = process.env.PHARMACIST_VERIFY_URL || "http://127.0.0.1:3000";

const availability = {
  sunday: [{ start: "09:00", end: "20:00" }],
  monday: [{ start: "08:00", end: "17:00" }],
};

async function verify(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
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
    const url = new URL(route.request().url());
    const apiPath = url.searchParams.get("path");
    const data = apiPath === "/pharmacist/availability"
      ? { availability }
      : { items: [], pagination: { total: 0 } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
  });
  await page.goto(`${baseUrl}/admin/pharmacist?view=availability`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByRole("heading", { name: "Daily slot editor" }).waitFor();
  await page.getByText("Weekly summary").waitFor();
  await page.getByText("Quick select").first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error(`Horizontal overflow at ${width}px`);
  if (width <= 720 && await page.locator(".bottom-nav.desktop-bottom-nav").isVisible()) {
    throw new Error("Mobile bottom navigation is still visible");
  }
  if (browserErrors.length) throw new Error(browserErrors.join(" | "));
  await page.screenshot({ path: `temp/pharmacist-availability-${width}.png`, fullPage: true });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await verify(browser, 1440, 1000);
  await verify(browser, 1024, 900);
  await verify(browser, 768, 900);
  await verify(browser, 375, 812);
  await browser.close();
  console.log("PASS pharmacist availability doctor parity at 1440px and 375px");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
