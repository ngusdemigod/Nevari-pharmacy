const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('response', async (response) => {
    const url = response.url();
    if (response.status() >= 400 || url.includes('/auth/login') || url.includes('/api/nevari-proxy') || url.includes('/api/admin/')) {
      let body = '';
      try { body = await response.text(); } catch {}
      console.log('RESPONSE', response.status(), url, body.slice(0, 1200));
    }
  });
  await page.goto('http://127.0.0.1:3000/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const inputs = page.locator('input');
  await inputs.nth(0).fill('Nadmin');
  await inputs.nth(1).fill('Nadmin@2026!!!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(8000);
  console.log('finalUrl', page.url());
  console.log('body', (await page.textContent('body')).slice(0, 1200));
  await browser.close();
})();
