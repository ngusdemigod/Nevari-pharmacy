const { chromium } = require('playwright');

async function main() {
  const siteUrl = String(process.env.NEVARI_SITE_URL || '').replace(/\/$/, '');
  const username = process.env.NEVARI_ADMIN_USER || '';
  const password = process.env.NEVARI_ADMIN_PASSWORD || '';
  const expectedVersion = process.env.NEVARI_EXPECTED_VERSION || '1.3.0';

  if (!siteUrl || !username || !password) {
    throw new Error('Required verification environment variables are missing.');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = {};

  try {
    const loginResponse = await page.goto(`${siteUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
    results.loginPageStatus = loginResponse ? loginResponse.status() : null;
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.locator('#wp-submit').click(),
    ]);

    results.loginSucceeded = page.url().includes('/wp-admin/');
    if (!results.loginSucceeded) {
      results.loginError = await page.locator('#login_error').textContent().catch(() => 'Login did not reach wp-admin.');
      throw new Error('WordPress login failed.');
    }

    const pluginsResponse = await page.goto(`${siteUrl}/wp-admin/plugins.php`, { waitUntil: 'domcontentloaded' });
    results.pluginsPageStatus = pluginsResponse ? pluginsResponse.status() : null;
    const pluginRow = page.locator('tr[data-plugin="nevari-checkout/nevari-checkout.php"]');
    results.pluginFound = (await pluginRow.count()) === 1;
    results.pluginActive = results.pluginFound && (await pluginRow.getAttribute('class') || '').split(/\s+/).includes('active');
    results.pluginText = results.pluginFound ? String(await pluginRow.innerText()).replace(/\s+/g, ' ').trim() : '';
    results.versionOk = new RegExp(`Version\\s+${expectedVersion.replace('.', '\\.')}\\b`, 'i').test(results.pluginText);

    const cartResponse = await page.goto(`${siteUrl}/cart/?nevari_playwright=122`, { waitUntil: 'domcontentloaded' });
    results.cartStatus = cartResponse ? cartResponse.status() : null;
    results.cartUrl = page.url();
    results.criticalError = (await page.locator('body').innerText()).includes('There has been a critical error on this website.');
    results.cartWidgetCount = await page.locator('[data-nevari-widget="cart"], .nevari-cart-widget').count();
    results.assetVersion130 = await page.evaluate(() => Array.from(document.querySelectorAll('link[href],script[src]')).some((node) => {
      const url = node.getAttribute('href') || node.getAttribute('src') || '';
      return url.includes('nevari-commerce-widgets') && new RegExp(`[?&]ver=${expectedVersion.replace('.', '\\.')}(?:&|$)`).test(url);
    }));
    await page.screenshot({ path: 'temp/nevari-cart-1.2.2-live.png', fullPage: true });

    const checkoutResponse = await page.goto(`${siteUrl}/checkout/?nevari_playwright=122`, { waitUntil: 'domcontentloaded' });
    results.checkoutInitialStatus = checkoutResponse ? checkoutResponse.status() : null;
    results.checkoutFinalUrl = page.url();
    results.checkoutCriticalError = (await page.locator('body').innerText()).includes('There has been a critical error on this website.');
    results.checkoutWidgetCount = await page.locator('[data-nevari-widget=checkout], .nevari-checkout-widget').count();
    results.fullNameFields = await page.locator('input[name=nevari_full_name]').count();
    results.emailFields = await page.locator('input[name=billing_email]').count();
    results.addressFields = await page.locator('input[name=nevari_delivery_address]').count();
    results.paymentChoices = await page.locator('input[name=payment_method]').count();
    results.rawCardFields = await page.locator('input[name*=card_number i], input[name*=cvv i], input[name*=expiry i]').count();
    await page.setViewportSize({ width: 320, height: 800 });
    results.checkoutOverflow320 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await page.screenshot({ path: 'temp/nevari-checkout-1.2.2-live-320.png', fullPage: true });

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

    if (!results.loginSucceeded || !results.pluginFound || !results.pluginActive || !results.versionOk || results.cartStatus !== 200 || results.criticalError || results.cartWidgetCount < 1 || !results.assetVersion130 || results.checkoutCriticalError || results.checkoutWidgetCount < 1 || results.fullNameFields < 1 || results.emailFields < 1 || results.addressFields < 1 || results.paymentChoices < 1 || results.rawCardFields !== 0 || results.checkoutOverflow320) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
