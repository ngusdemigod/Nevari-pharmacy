const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures = [];
  page.on("response", (response) => {
    if (response.url().includes("/admin/storefront") && response.status() >= 500) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("pageerror", (error) => {
    if (/ENOENT|_document\.js|\.next\\server/i.test(error.message)) failures.push(error.message);
  });
  const response = await page.goto("http://127.0.0.1:3000/admin/storefront", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  if (!response || response.status() >= 500 || failures.length) {
    throw new Error(`Runtime recovery failed: ${JSON.stringify({ status: response?.status(), failures })}`);
  }
  console.log(JSON.stringify({ status: response.status(), title: await page.title(), failures }));
  await page.screenshot({ path: "temp/next-runtime-recovery.png", fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
