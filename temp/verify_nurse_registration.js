const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const baseUrl = process.env.NEVARI_TEST_BASE_URL || "http://127.0.0.1:3000";
  const output = path.join(__dirname, "playwright-nurse-registration");
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const viewport of [{ name: "mobile", width: 375, height: 844 }, { name: "tablet", width: 768, height: 1024 }, { name: "desktop", width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    let postCount = 0;
    await page.route("**/api/nurse-registration**", async (route) => { postCount += 1; return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { message: "Your application was received and is awaiting review." } }),
    }); });
    await page.goto(`${baseUrl}/nurse-registration`, { waitUntil: "networkidle" });
    await page.locator('button[type="submit"]').evaluate((button) => button.click());
    const validationVisible = await page.locator(".field-error").filter({ hasText: "Enter" }).first().isVisible();
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Okafor");
    await page.getByLabel("Email").fill("ada.nurse@example.com");
    await page.getByLabel("Phone number").fill("+2348012345678");
    await page.getByLabel("Nursing licence number").fill("RN-12345");
    await page.getByLabel("Password").fill("SecureNurse123");
    await page.getByRole("checkbox").check();
    await page.waitForTimeout(100);
    const hitTarget = await page.locator('button[type="submit"]').evaluate((button) => {
      const box = button.getBoundingClientRect();
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { tag: target?.tagName || "", className: target?.className || "" };
    });
    await page.evaluate(() => { window.__nurseSubmitCount = 0; document.querySelector("form")?.addEventListener("submit", () => { window.__nurseSubmitCount += 1; }); });
    await page.locator('button[type="submit"]').evaluate((button) => button.click());
    await page.waitForTimeout(500);
    const visibleErrors = await page.locator(".field-error, .form-error").allTextContents();
    if (visibleErrors.some((value) => String(value).trim())) {
      throw new Error(`Unexpected validation errors at ${viewport.name}: ${visibleErrors.filter(Boolean).join(" | ")}`);
    }
    if (postCount !== 1) {
      await page.screenshot({ path: path.join(output, `${viewport.name}-failure.png`), fullPage: true });
      const values = await page.locator("input").evaluateAll((inputs) => inputs.map((input) => ({ name: input.name, type: input.type, value: input.value, checked: input.checked })));
      const buttonText = await page.getByRole("button").last().textContent();
      const submitEvents = await page.evaluate(() => window.__nurseSubmitCount);
      throw new Error(`Expected one registration POST at ${viewport.name}, received ${postCount}. Submit events: ${submitEvents}. Button: ${buttonText}. Runtime: ${runtimeErrors.join(" | ")}. Values: ${JSON.stringify(values)} Errors: ${JSON.stringify(visibleErrors)}`);
    }
    await page.getByRole("heading", { name: "Application received" }).waitFor({ timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await page.screenshot({ path: path.join(output, `${viewport.name}.png`), fullPage: true });
    results.push({ viewport: viewport.name, validationVisible, success: true, horizontalOverflow: overflow, hitTarget });
    await page.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(results, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
