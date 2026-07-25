const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3003/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyClass: document.body.className,
    authGate: document.querySelector('.auth-gate')?.outerHTML.slice(0, 260),
    backgroundImage: document.querySelector('.auth-gate') ? getComputedStyle(document.querySelector('.auth-gate')).backgroundImage : null,
    stylesheets: Array.from(document.styleSheets).map((sheet) => sheet.href),
  })));
  await browser.close();
})();
