const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of [375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto("http://127.0.0.1:3010/admin/storefront", { waitUntil: "networkidle", timeout: 60000 });
    results.push({
      width,
      status: response?.status() || 0,
      url: page.url(),
      title: await page.title(),
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      errors
    });
    await page.screenshot({ path: `temp/admin-permissions-${width}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (results.some((result) => result.status >= 400 || result.horizontalOverflow || result.errors.length)) process.exit(1);
})();
