const { chromium } = require('playwright');

async function login(page, siteUrl, username, password) {
  await page.goto(`${siteUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.locator('#wp-submit').click(),
  ]);
  if (!page.url().includes('/wp-admin/')) {
    throw new Error('WordPress login failed.');
  }
}

async function inspectWidget(page, selector, screenshotPath) {
  const widget = page.locator(selector).first();
  await widget.waitFor({ state: 'visible' });
  await widget.screenshot({ path: screenshotPath });
  return page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    const rect = (selector) => {
      const element = root.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        display: styles.display,
        fontFamily: styles.fontFamily,
        fontSize: styles.fontSize,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
      };
    };
    const rootBox = root.getBoundingClientRect();
    return {
      root: {
        x: Math.round(rootBox.x),
        y: Math.round(rootBox.y),
        width: Math.round(rootBox.width),
        height: Math.round(rootBox.height),
      },
      title: rect('.nevari-page-title'),
      layout: rect('.nevari-cart-layout, .nevari-checkout-layout, .nevari-order-layout'),
      main: rect('.nevari-cart-items, .nevari-checkout-main, .nevari-order-main'),
      summary: rect('.nevari-cart-summary, .nevari-checkout-summary, .nevari-order-side'),
      firstCard: rect('.nevari-cart-row, .nevari-checkout-card, .nevari-order-item'),
      childCount: root.querySelectorAll('*').length,
    };
  }, selector);
}

async function main() {
  const siteUrl = String(process.env.NEVARI_SITE_URL || '').replace(/\/$/, '');
  const username = process.env.NEVARI_ADMIN_USER || '';
  const password = process.env.NEVARI_ADMIN_PASSWORD || '';
  if (!siteUrl || !username || !password) throw new Error('Missing verification environment variables.');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 846 } });
  const results = {};
  try {
    await login(page, siteUrl, username, password);

    await page.goto(`${siteUrl}/cart/?nevari_visual_audit=1`, { waitUntil: 'networkidle' });
    results.cartPage = {
      viewport: await page.viewportSize(),
      document: await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })),
      widget: await inspectWidget(page, '.nevari-cart-widget', 'temp/nevari-cart-widget-live-1536.png'),
    };
    await page.screenshot({ path: 'temp/nevari-cart-page-live-1536.png', fullPage: true });

    await page.goto(`${siteUrl}/checkout/?nevari_visual_audit=1`, { waitUntil: 'networkidle' });
    results.checkoutPage = {
      viewport: await page.viewportSize(),
      document: await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })),
      widget: await inspectWidget(page, '.nevari-checkout-widget', 'temp/nevari-checkout-widget-live-1536.png'),
    };
    await page.screenshot({ path: 'temp/nevari-checkout-page-live-1536.png', fullPage: true });

    await page.goto(`${siteUrl}/my-account/orders/`, { waitUntil: 'domcontentloaded' });
    results.orderContexts = {
      viewOrderLinks: await page.locator('a[href*="/view-order/"]').count(),
      payOrderLinks: await page.locator('a[href*="order-pay"], a[href*="pay_for_order"]').count(),
      orderProgressWidgets: await page.locator('.nevari-order-widget, [data-nevari-widget="order-progress"]').count(),
    };

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
