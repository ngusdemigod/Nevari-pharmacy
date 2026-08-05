const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');
const readline = require('node:readline');

const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const lines = [];
input.on('line', line => {
  lines.push(line);
  if (lines.length === 2) input.close();
});

async function run() {
  const [username, password] = lines;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const apiResponses = [];
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || "" }));
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) {
      const body = await response.json().catch(() => null);
      apiResponses.push({ path: `${url.pathname}${url.search}`, status: response.status(), body });
    }
  });
  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(5000);
    await page.getByLabel('Email').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(10000);
    const visibleText = await page.locator('body').innerText();
    await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/customer-login-result.png', fullPage: true });
    console.log(JSON.stringify({
      url: page.url(),
      spamErrorVisible: visibleText.includes('Spam protection verification failed'),
      apiResponses,
      failedRequests,
      errors
    }, null, 2));
  } finally {
    await browser.close();
  }
}

input.on('close', () => run().catch(error => {
  console.error(error);
  process.exit(1);
}));
