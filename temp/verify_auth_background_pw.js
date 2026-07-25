const assert = require('node:assert/strict');
const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

const checks = [
  { name: 'desktop', width: 1440, expected: 'Frame%201984078457.png' },
  { name: 'mobile-430', width: 430, expected: 'Frame%201984078458.png' },
  { name: 'mobile-375', width: 375, expected: 'Frame%201984078458.png' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const check of checks) {
      const page = await browser.newPage({ viewport: { width: check.width, height: 900 } });
      await page.goto('http://localhost:3001/admin/storefront/login', { waitUntil: 'networkidle' });
      const backgroundImage = await page.locator('.auth-gate').evaluate((element) => (
        window.getComputedStyle(element).backgroundImage
      ));
      assert.ok(backgroundImage.includes(check.expected), `${check.name} background mismatch: ${backgroundImage}`);
      console.log(`${check.name}: PASS (${backgroundImage})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
