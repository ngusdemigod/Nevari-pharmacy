const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    localStorage.setItem("nevari_pharmacist_dashboard_session", JSON.stringify({
      accessToken: "server-session",
      expiresAt: Date.now() + 3600000,
      baseUrl: "https://nevarihealth.com",
      user: { id: 44, display_name: "Test Pharmacist", email: "pharmacist@example.test", roles: ["pharmacist"] }
    }));
  });
  await page.route("**/api/nevari-proxy**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("path") === "/pharmacist/availability") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { availability: {} } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
  });
  await page.goto("http://127.0.0.1:3000/admin/pharmacist", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Set your weekly availability" }).waitFor();
  await page.getByRole("button", { name: /Set availability/ }).click();
  await page.getByRole("heading", { name: "Availability", exact: true }).waitFor();
  await page.getByText("Monday", { exact: true }).waitFor();
  await page.getByLabel("Available").first().check();
  await page.getByRole("button", { name: "Save availability" }).click();
  await page.screenshot({ path: "temp/playwright-pharmacist-availability.png", fullPage: true });
  console.log("PASS pharmacist availability reminder, navigation, form, and save request");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
