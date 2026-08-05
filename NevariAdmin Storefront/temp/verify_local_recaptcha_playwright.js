const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/admin/storefront/login", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const scriptRequests = [];
  page.on("request", (request) => {
    if (/recaptcha\/api\.js/.test(request.url())) scriptRequests.push(request.url());
  });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/nurse-registration", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nevari-recaptcha-token": "nevari-local-development",
      },
      body: JSON.stringify({ unexpected: true }),
    });
    return { status: response.status, payload: await response.json() };
  });
  if (result.status !== 422 || result.payload?.error?.code?.startsWith("captcha_")) {
    throw new Error(`Local reCAPTCHA verification did not pass securely: ${JSON.stringify(result)}`);
  }
  if (scriptRequests.length) {
    throw new Error(`Local auth still requested external reCAPTCHA scripts: ${JSON.stringify(scriptRequests)}`);
  }
  console.log(JSON.stringify({ ...result, externalRecaptchaRequests: scriptRequests.length }));
  await page.screenshot({ path: "temp/local-recaptcha-recovery.png", fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
