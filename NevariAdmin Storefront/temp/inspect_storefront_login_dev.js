const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://127.0.0.1:3000/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('url:', page.url());
  console.log('title:', await page.title());
  console.log('body:', (await page.textContent('body')).slice(0, 1500));
  console.log('inputs:', await page.locator('input').evaluateAll((els) => els.map((el) => ({ name: el.getAttribute('name'), type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder') }))));
  console.log('buttons:', await page.locator('button').evaluateAll((els) => els.slice(0, 20).map((el) => el.textContent?.trim())));
  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/admin-storefront-login-dev-inspect.png', fullPage: true });
  await browser.close();
})();
