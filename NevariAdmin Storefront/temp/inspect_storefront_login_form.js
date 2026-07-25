const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://127.0.0.1:3000/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const formHtml = await page.locator('form').first().evaluate((node) => node.outerHTML);
  console.log(formHtml);
  const buttonState = await page.getByRole('button', { name: /sign in/i }).evaluate((node) => ({ disabled: node.disabled, type: node.getAttribute('type') }));
  console.log('buttonState', JSON.stringify(buttonState));
  const inputs = await page.locator('input').evaluateAll((els) => els.map((el) => ({ outerHTML: el.outerHTML })));
  console.log(JSON.stringify(inputs, null, 2));
  await browser.close();
})();
