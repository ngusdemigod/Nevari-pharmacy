const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1896, height: 952 } });

  page.on('console', (msg) => console.log(`console:${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => console.log(`pageerror: ${err.message}`));

  await page.goto('http://127.0.0.1:3001/admin/storefront', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => null);

  const username = page.locator('input[name="loginIdentifier"], input[type="text"]');
  const password = page.locator('input[name="loginPassword"], input[type="password"]');
  await username.first().fill('Nadmin');
  await password.first().fill('Nadmin@2026!!!');

  const signInButton = page.getByRole('button', { name: /sign ?in/i }).first();
  await signInButton.click();
  await page.waitForTimeout(6000);
  await page.waitForLoadState('networkidle').catch(() => null);

  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/admin-storefront-after-login.png', fullPage: true });

  const productsNav = page.getByRole('button', { name: /products/i }).first();
  if (await productsNav.count()) {
    await productsNav.click().catch(() => null);
    await page.waitForTimeout(2500);
  }

  const editButton = page.getByRole('button', { name: /^edit$/i }).first();
  if (await editButton.count()) {
    await editButton.click();
  } else {
    const productLink = page.getByRole('button', { name: /loratadine|product/i }).first();
    if (await productLink.count()) {
      await productLink.click();
    }
  }

  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle').catch(() => null);

  const modal = page.locator('.product-editor-modal');
  if (await modal.count()) {
    const box = await modal.boundingBox();
    console.log('modalBox', JSON.stringify(box));
  } else {
    console.log('modalBox', 'not-found');
  }

  const leftCard = page.locator('.product-editor-media-column').first();
  if (await leftCard.count()) {
    const box = await leftCard.boundingBox();
    console.log('mediaBox', JSON.stringify(box));
  }

  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/product-editor-modal-verification.png', fullPage: true });
  await browser.close();
})();
