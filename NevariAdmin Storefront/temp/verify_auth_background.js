const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const checks = [
  { name: 'desktop', width: 1440, expected: 'Frame 1984078457.png' },
  { name: 'mobile-430', width: 430, expected: 'Frame 1984078458.png' },
  { name: 'mobile-375', width: 375, expected: 'Frame 1984078458.png' },
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

      assert.match(backgroundImage, new RegExp(check.expected.replace('.', '\\.') + '$'));
      console.log(`${check.name}: ${backgroundImage}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
