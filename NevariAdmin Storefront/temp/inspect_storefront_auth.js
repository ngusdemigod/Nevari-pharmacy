const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (msg) => console.log(`console:${msg.type()}: ${msg.text()}`));
  await page.goto('http://127.0.0.1:3001/admin/storefront', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('url:', page.url());
  console.log('title:', await page.title());
  console.log('body:', (await page.textContent('body')).slice(0, 2000));
  console.log('inputs:', await page.locator('input').evaluateAll((els) => els.map((el) => ({ name: el.getAttribute('name'), type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder') }))));
  console.log('buttons:', await page.locator('button').evaluateAll((els) => els.slice(0, 20).map((el) => el.textContent?.trim())));
  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/admin-storefront-auth-inspect.png', fullPage: true });
  await browser.close();
})();
