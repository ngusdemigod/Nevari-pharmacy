const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const response = await context.request.post(
    '/api/nevari-proxy?baseUrl=https%3A%2F%2Fnevarihealth.com&path=%2Fauth%2Flogin',
    {
      headers: {
        'content-type': 'application/json',
        'x-nevari-frontend-type': 'patient_dashboard',
        'x-nevari-frontend-origin': 'http://localhost:3000',
        origin: 'http://localhost:3000'
      },
      data: { username: 'captcha-enforcement-check', password: 'not-a-password' }
    }
  );
  const payload = await response.json();
  console.log(JSON.stringify({ status: response.status(), code: payload?.error?.code, message: payload?.error?.message }));
  if (response.status() !== 403 || !String(payload?.error?.code || '').startsWith('captcha_')) {
    throw new Error('Password login did not enforce reCAPTCHA.');
  }
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
