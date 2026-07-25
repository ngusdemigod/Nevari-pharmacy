const { chromium } = require('playwright');

async function getPluginRow(page) {
  const rows = page.locator('tr[data-plugin]');
  const paths = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-plugin') || ''));
  let index = paths.indexOf('nevari-checkout/nevari-checkout.php');
  if (index < 0) index = paths.findIndex((value) => value.endsWith('/nevari-checkout.php'));
  if (index < 0) throw new Error(`Nevari Checkout plugin row was not found. Paths: ${paths.join(', ')}`);
  return rows.nth(index);
}

async function main() {
  const siteUrl = String(process.env.NEVARI_SITE_URL || '').replace(/\/$/, '');
  const username = process.env.NEVARI_ADMIN_USER || '';
  const password = process.env.NEVARI_ADMIN_PASSWORD || '';
  const zipPath = process.env.NEVARI_PLUGIN_ZIP || '';
  const expectedVersion = process.env.NEVARI_EXPECTED_VERSION || '1.3.0';

  if (!siteUrl || !username || !password || !zipPath) {
    throw new Error('Required deployment environment variables are missing.');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${siteUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.locator('#wp-submit').click(),
    ]);
    if (!page.url().includes('/wp-admin/')) throw new Error('WordPress login failed.');

    await page.goto(`${siteUrl}/wp-admin/plugin-install.php?tab=upload`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type=file]').setInputFiles(zipPath);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.locator('#install-plugin-submit').click(),
    ]);

    const replace = page.getByRole('button', { name: /replace current with uploaded/i });
    const replaceLink = page.getByRole('link', { name: /replace current with uploaded/i });
    await page.screenshot({ path: 'temp/nevari-checkout-upload-response.png', fullPage: true });
    process.stdout.write(JSON.stringify({ uploadUrl: page.url(), replaceButtons: await replace.count(), replaceLinks: await replaceLink.count(), uploadText: String(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1400) }, null, 2));
    if (await replace.count()) {
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), replace.click()]);
    } else if (await replaceLink.count()) {
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), replaceLink.click()]);
    }

    const body = await page.locator('body').innerText();
    if (/critical error|installation failed|destination folder already exists/i.test(body)) {
      throw new Error('Plugin replacement did not complete successfully.');
    }

    await page.goto(`${siteUrl}/wp-admin/plugins.php`, { waitUntil: 'domcontentloaded' });
    const row = await getPluginRow(page);
    let text = String(await row.innerText()).replace(/\s+/g, ' ').trim();
    let active = String(await row.getAttribute('class') || '').split(/\s+/).includes('active');
    if (!active) {
      const activate = row.getByText('Activate', { exact: true });
      if (await activate.count() !== 1) throw new Error(`Plugin is inactive and its Activate link was not found: ${text}`);
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), activate.click()]);
      await page.goto(`${siteUrl}/wp-admin/plugins.php`, { waitUntil: 'domcontentloaded' });
      const activeRow = await getPluginRow(page);
      text = String(await activeRow.innerText()).replace(/\s+/g, ' ').trim();
      active = String(await activeRow.getAttribute('class') || '').split(/\s+/).includes('active');
    }
    await page.screenshot({ path: 'temp/nevari-checkout-1.3.0-deployed.png', fullPage: true });
    const versionOk = new RegExp(`Version\\s+${expectedVersion.replace('.', '\\.')}\\b`, 'i').test(text);
    process.stdout.write(JSON.stringify({ active, expectedVersion, versionOk }, null, 2));
    if (!active || !versionOk) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
