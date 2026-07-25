const assert = require('node:assert/strict');
const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [430, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://localhost:3001/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.locator('.auth-gate').waitFor({ state: 'visible', timeout: 10000 });
      const backgroundImage = await page.locator('.auth-gate').evaluate((element) => (
        window.getComputedStyle(element).backgroundImage
      ));
      assert.ok(backgroundImage.includes('Frame%201984078458.png'), `mobile-${width} background mismatch: ${backgroundImage}`);
      console.log(`mobile-${width}: PASS (${backgroundImage})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
