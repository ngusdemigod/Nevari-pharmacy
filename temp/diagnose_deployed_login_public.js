const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

async function main() {
  const target = process.argv[2] || "https://dev-dash-nevarihealth.vercel.app/login";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const apiResponses = [];
  const failures = [];
  const consoleErrors = [];

  page.on("requestfailed", (request) => failures.push({
    path: new URL(request.url()).pathname,
    error: request.failure()?.errorText || ""
  }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) {
      apiResponses.push({
        path: url.pathname,
        status: response.status(),
        statusText: response.statusText(),
        headers: {
          server: response.headers()["server"] || "",
          requestId: response.headers()["x-vercel-id"] || "",
          upstreamRequestId: response.headers()["x-nevari-request-id"] || ""
        },
        body: await response.json().catch(() => null)
      });
    }
  });

  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(5000);
    await page.getByLabel(/email/i).fill("invalid-login-diagnostic@example.com");
    await page.getByLabel(/password/i).fill("Invalid-Diagnostic-Password-123!");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForTimeout(10000);
    console.log(JSON.stringify({
      target,
      finalUrl: page.url(),
      notice: await page.locator(".auth-notice, [role='alert']").allTextContents().catch(() => []),
      recaptchaLoaded: await page.evaluate(() => Boolean(window.grecaptcha)),
      apiResponses,
      failures,
      consoleErrors
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
