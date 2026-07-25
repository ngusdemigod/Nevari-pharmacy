const assert = require('node:assert/strict');
const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const checks = [
    { name: 'desktop', width: 1440, height: 900, asset: 'Frame%201984078457.png' },
    { name: 'mobile-430', width: 430, height: 900, asset: 'Frame%201984078458.png' },
    { name: 'mobile-375', width: 375, height: 900, asset: 'Frame%201984078458.png' },
  ];
  try {
    for (const check of checks) {
      const page = await browser.newPage({ viewport: { width: check.width, height: check.height } });
      await page.goto('http://localhost:3003/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.auth-gate').waitFor({ state: 'visible', timeout: 15000 });
      const result = await page.evaluate(async () => {
        const gate = document.querySelector('.auth-gate');
        const shell = document.querySelector('.auth-gate-shell');
        const style = getComputedStyle(gate);
        const statuses = await Promise.all(['/Frame 1984078457.png', '/Frame 1984078458.png'].map(async (url) => (await fetch(url, { cache: 'no-store' })).status));
        return { backgroundImage: style.backgroundImage, backgroundPosition: style.backgroundPosition, backgroundSize: style.backgroundSize, shellMinHeight: getComputedStyle(shell).minHeight, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, statuses };
      });
      assert.match(result.backgroundImage, new RegExp(check.asset));
      assert.equal(result.backgroundPosition, '50% 100%');
      assert.equal(result.backgroundSize, '100% 100%');
      assert.equal(result.shellMinHeight, `${check.height}px`);
      assert.equal(result.overflow, false);
      assert.deepEqual(result.statuses, [200, 200]);
      await page.screenshot({ path: `NevariAdmin Storefront/temp/auth-background-${check.name}.png`, fullPage: true });
      console.log(`${check.name}: PASS`, result);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
