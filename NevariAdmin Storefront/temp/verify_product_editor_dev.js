const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1896, height: 952 } });
  page.on('console', (msg) => console.log(`console:${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => console.log(`pageerror: ${err.message}`));

  await page.goto('http://127.0.0.1:3000/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  const inputs = page.locator('input');
  await inputs.nth(0).fill('Nadmin');
  await inputs.nth(1).fill('Nadmin@2026!!!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.waitForTimeout(8000);
  await page.waitForLoadState('networkidle').catch(() => null);
  console.log('afterLoginUrl:', page.url());
  console.log('afterLoginBody:', (await page.textContent('body')).slice(0, 1500));
  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/admin-storefront-dev-after-login.png', fullPage: true });

  const productsTextButton = page.getByRole('button', { name: /products/i }).first();
  if (await productsTextButton.count()) {
    await productsTextButton.click().catch(() => null);
    await page.waitForTimeout(2500);
  }

  const editButton = page.getByRole('button', { name: /^edit$/i }).first();
  if (await editButton.count()) {
    await editButton.click();
    await page.waitForTimeout(2500);
  }

  const modal = page.locator('.product-editor-modal').first();
  console.log('modalCount:', await modal.count());
  if (await modal.count()) {
    console.log('modalBox:', JSON.stringify(await modal.boundingBox()));
    const mediaBox = await page.locator('.product-editor-media-column').first().boundingBox();
    console.log('mediaBox:', JSON.stringify(mediaBox));
    await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/product-editor-dev-modal.png', fullPage: true });
  }

  await browser.close();
})();
