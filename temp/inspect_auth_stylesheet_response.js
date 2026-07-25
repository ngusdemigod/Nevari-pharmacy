const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3003/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(await page.evaluate(async () => {
    const href = Array.from(document.styleSheets)[0].href;
    const response = await fetch(href, { cache: 'no-store' });
    const text = await response.text();
    return { href, status: response.status, length: text.length, contentType: response.headers.get('content-type'), start: text.slice(0, 240) };
  }));
  await browser.close();
})();
