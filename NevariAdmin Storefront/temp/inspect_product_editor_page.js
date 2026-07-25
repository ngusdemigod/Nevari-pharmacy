const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1896, height: 952 } });
  await page.goto('http://127.0.0.1:3001/admin/storefront', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  console.log(await page.title());
  console.log((await page.textContent('body')).slice(0, 1000));
  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/product-editor-page-3001.png', fullPage: true });
  await browser.close();
})();
