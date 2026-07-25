const { chromium } = require('playwright');

async function main() {
  const siteUrl = String(process.env.NEVARI_SITE_URL || '').replace(/\/$/, '');
  const username = process.env.NEVARI_ADMIN_USER || '';
  const password = process.env.NEVARI_ADMIN_PASSWORD || '';
  if (!siteUrl || !username || !password) throw new Error('Required environment variables are missing.');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${siteUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    await Promise.all([page.waitForLoadState('domcontentloaded'), page.locator('#wp-submit').click()]);
    await page.goto(`${siteUrl}/wp-admin/plugins.php`, { waitUntil: 'domcontentloaded' });
    const allRows = page.locator('tr[data-plugin]');
    const allPaths = await allRows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-plugin') || ''));
    process.stdout.write(JSON.stringify({ allPaths }, null, 2));
    let row = page.locator('tr[data-plugin]').filter({ hasText: 'Nevari Checkout' }).first();
    let text = String(await row.innerText()).replace(/\s+/g, ' ').trim();
    let active = String(await row.getAttribute('class') || '').split(/\s+/).includes('active');
    let activation = {};
    if (!active) {
      const activate = row.getByText('Activate', { exact: true });
      if (await activate.count() !== 1) throw new Error(`Activate control not found: ${text}`);
      activation.href = await activate.getAttribute('href');
      await page.goto(new URL(activation.href, page.url()).toString(), { waitUntil: 'domcontentloaded' });
      activation.url = page.url();
      const activationBody = String(await page.locator('body').innerText()).replace(/\s+/g, ' ');
      activation.text = activationBody.slice(0, 1800);
      activation.errors = activationBody.match(/.{0,100}(?:fatal|error|failed|does not exist|cannot be activated).{0,180}/ig) || [];
      activation.errorLinks = await page.locator('.error a, .notice-error a').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, href: node.href })));
    }
    await page.goto(`${siteUrl}/wp-admin/plugins.php`, { waitUntil: 'domcontentloaded' });
    row = page.locator('tr[data-plugin]').filter({ hasText: 'Nevari Checkout' }).first();
    text = String(await row.innerText()).replace(/\s+/g, ' ').trim();
    active = String(await row.getAttribute('class') || '').split(/\s+/).includes('active');
    const notices = await page.locator('.notice, .error, #message').allInnerTexts();
    process.stdout.write(JSON.stringify({ active, row: text, activation, notices: notices.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean) }, null, 2));
    if (!active) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
