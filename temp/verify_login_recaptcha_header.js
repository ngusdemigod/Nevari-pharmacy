const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const testOrigin = String(process.env.TEST_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let receivedToken = '';
  const captchaEvents = [];
  context.on('requestfailed', request => {
    if (/recaptcha/i.test(request.url())) captchaEvents.push({ type: 'failed', url: request.url(), error: request.failure()?.errorText || '' });
  });
  context.on('response', response => {
    if (/recaptcha/i.test(response.url())) captchaEvents.push({ type: 'response', url: response.url(), status: response.status() });
  });
  if (process.env.MOCK_RECAPTCHA !== '0') {
    await context.route('https://www.google.com/recaptcha/api.js**', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.grecaptcha={ready:function(callback){callback();},execute:function(){return Promise.resolve("playwright-captcha-token");}};'
    }));
  }
  await context.route('**/api/nevari-proxy?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('path') === '/auth/google-config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) });
    }
    if (url.searchParams.get('path') === '/auth/login') {
      receivedToken = route.request().headers()['x-nevari-recaptcha-token'] || '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            access_token: 'server-session',
            refresh_token: 'server-session',
            expires_in: 900,
            user: { roles: ['customer'], display_name: 'Playwright Customer' }
          }
        })
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${testOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.getByLabel('Email').fill('recaptcha-header-test');
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForTimeout(process.env.MOCK_RECAPTCHA === '0' ? 10_000 : 1_500);
  const tokenAttached = process.env.MOCK_RECAPTCHA === '0'
    ? Boolean(receivedToken)
    : receivedToken === 'playwright-captcha-token';
  console.log(JSON.stringify({
    tokenAttached,
    captchaEvents,
    message: (await page.locator('body').innerText()).match(/Spam protection[^\n]*/)?.[0] || ''
  }));
  if (!tokenAttached) throw new Error('Login did not attach the reCAPTCHA token.');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
