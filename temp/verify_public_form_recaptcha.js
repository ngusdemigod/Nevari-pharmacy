const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let receivedToken = '';
  let requestSeen = false;
  await context.route('https://www.google.com/recaptcha/api.js**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.grecaptcha={ready:function(callback){callback();},execute:function(){return Promise.resolve("public-form-captcha-token");}};'
  }));
  await context.route('**/api/nurse-registration', route => {
    requestSeen = true;
    receivedToken = route.request().headers()['x-nevari-recaptcha-token'] || '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/nurse-registration', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('Nurse');
  await page.getByLabel('Email').fill('nurse-test@example.com');
  await page.getByLabel('Phone number').fill('+2348000000000');
  await page.getByLabel('Nursing licence number').fill('RN-TEST-123');
  await page.getByLabel('Password').fill('SafePassword123');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await page.waitForTimeout(500);
  console.log(JSON.stringify({ requestSeen, tokenAttached: receivedToken === 'public-form-captcha-token', errors: await page.locator('.field-error').allTextContents() }));
  if (receivedToken !== 'public-form-captcha-token') throw new Error('Public form did not attach reCAPTCHA.');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
