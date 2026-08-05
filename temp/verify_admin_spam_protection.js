const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const proxyResponses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/api/nevari-proxy')) {
      proxyResponses.push({ status: response.status(), body: await response.json().catch(() => null) });
    }
  });
  await page.goto('http://127.0.0.1:3001/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByLabel('Email').fill('recaptcha-test@example.com');
  await page.getByLabel('Password').fill('NotARealPassword123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForTimeout(5000);
  const body = await page.locator('body').innerText();
  console.log(JSON.stringify({
    loaded: true,
    spamErrorVisible: body.includes('Spam protection verification failed'),
    proxyResponses,
    pageErrors: errors
  }));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
