const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const targetUrl =
  "https://dev-dash-nevarihealth.vercel.app/admin/storefront/login";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText || "Unknown request error",
    });
  });

  const response = await page.goto(targetUrl, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  const heading = await page.getByRole("heading", { name: "Log in" }).count();
  const form = await page.locator("form").count();

  await page.screenshot({
    path: "D:/dev/nevari-pharmacy-core/temp/deployed-development-login.png",
    fullPage: true,
  });

  const result = {
    url: page.url(),
    status: response?.status() || 0,
    title: await page.title(),
    hasLoginHeading: heading > 0,
    hasLoginForm: form > 0,
    consoleErrors,
    pageErrors,
    failedRequests,
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();

  if (
    result.status !== 200 ||
    !result.hasLoginHeading ||
    !result.hasLoginForm ||
    consoleErrors.length ||
    pageErrors.length ||
    failedRequests.length
  ) {
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
