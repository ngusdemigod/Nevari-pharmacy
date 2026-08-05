const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const targets = [
  ["development", "https://dev-dash-nevarihealth.vercel.app"],
  ["production", "https://dash.nevarihealth.com"]
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const [environment, baseUrl] of targets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(`${baseUrl}/admin/storefront/login`, {
      waitUntil: "networkidle",
      timeout: 90000
    });
    const title = await page.title();
    const body = (await page.locator("body").innerText()).trim();
    const hasLoginForm = await page.locator("form").count() > 0;

    await page.screenshot({
      path: `D:/dev/nevari-pharmacy-core/temp/deployed-${environment}-login.png`,
      fullPage: true
    });
    results.push({
      environment,
      url: page.url(),
      status: response?.status() || 0,
      title,
      hasLoginForm,
      bodyPreview: body.slice(0, 160),
      consoleErrors,
      pageErrors
    });
    await page.close();
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
