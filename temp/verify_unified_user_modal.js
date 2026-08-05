const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    const requests = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) requests.push(request.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("http://127.0.0.1:3001/admin/storefront", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    const addButton = page.getByRole("button", { name: "Create new record" });
    const available = await addButton.isVisible().catch(() => false);
    if (available) {
      await addButton.click();
      const userItem = page.getByRole("menuitem", { name: "New user account" });
      await userItem.click();
      await page.getByRole("heading", { name: "New user account" }).waitFor();
      const modal = page.getByRole("dialog");
      const box = await modal.boundingBox();
      const roles = await modal.locator('select').first().locator("option").allTextContents();
      const submitLabel = await modal.locator('button[type="submit"]').textContent();
      const overflow = await modal.evaluate((element) => element.scrollWidth > element.clientWidth);
      await page.screenshot({
        path: `D:/dev/nevari-pharmacy-core/temp/unified-user-modal-${viewport.width}.png`,
        fullPage: true
      });
      results.push({ viewport, available, box, roles, submitLabel, overflow, consoleErrors });
    } else {
      results.push({ viewport, available, url: page.url(), body: (await page.textContent("body") || "").slice(0, 180), requests, consoleErrors });
    }
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
