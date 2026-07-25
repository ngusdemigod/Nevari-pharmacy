const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1896, height: 952 } });
  await page.goto('http://127.0.0.1:3000/admin/storefront', { waitUntil: 'networkidle' });
  console.log(await page.title());
  console.log((await page.textContent('body')).slice(0, 1200));
  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/product-editor-page.png', fullPage: true });
  await browser.close();
})();
