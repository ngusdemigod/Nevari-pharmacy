const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.cwd(), 'NevariAdmin Storefront', 'node_modules', 'playwright'));

const BASE_URL = 'http://localhost:3000';
const USERNAME = 'Ncustomer';
const PASSWORD = 'Ncustomer@2026!!!';
const AUTH_SECURITY_SETTINGS_KEY = 'nevari_global_auth_security_settings';
const OUTPUT_DIR = path.join(process.cwd(), 'temp', 'playwright-subscription-verify');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'local-subscription-management-result.json');
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, 'local-subscription-management.png');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

  const loginPayload = await page.evaluate(async ({ username, password }) => {
    const endpoint = new URL('/api/nevari-proxy', window.location.origin);
    endpoint.searchParams.set('baseUrl', 'https://nevarihealth.com');
    endpoint.searchParams.set('path', '/auth/login');
    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Nevari-Frontend-Type': 'patient_dashboard',
        'X-Nevari-Frontend-Origin': window.location.origin,
      },
      body: JSON.stringify({
        username,
        password,
        frontend_type: 'patient_dashboard',
        frontend_origin: window.location.origin,
        frontend_url: window.location.href,
        global_two_step_verification: false,
        two_factor_required: false,
        require_verification: false,
        require_otp: false,
      }),
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, payload };
  }, { username: USERNAME, password: PASSWORD });

  if (!loginPayload?.ok || !loginPayload?.payload?.success || !loginPayload?.payload?.data?.access_token) {
    throw new Error(`Login failed: ${JSON.stringify(loginPayload?.payload || null)}`);
  }

  const data = loginPayload.payload.data;
  await page.evaluate(({ expiresIn, user }) => {
    const roles = Array.isArray(user?.roles) ? user.roles.map((value) => String(value || '').trim()).filter(Boolean) : [];
    window.localStorage.setItem('nevari_patient_dashboard_session', JSON.stringify({
      baseUrl: 'https://nevarihealth.com',
      frontendType: 'patient_dashboard',
      frontendOrigin: window.location.origin,
      frontendUrl: `${window.location.origin}/dashboard?page=subscription-management`,
      paired: true,
      siteName: '',
      siteLogo: '',
      accessToken: 'server-session',
      refreshToken: 'server-session',
      expiresAt: Date.now() + (Number(expiresIn || 0) * 1000),
      user: user ? {
        id: user.id || '',
        display_name: user.display_name || user.name || '',
        email: user.email || '',
        avatar_url: user.avatar_url || user.avatarUrl || user.picture || '',
        role: user.role || '',
        roles,
      } : null,
    }));
  }, { expiresIn: data.expires_in, user: data.user });
}

async function visibleButtons(page) {
  return page.locator('button').evaluateAll((nodes) => nodes
    .map((node) => ({
      text: (node.textContent || '').trim(),
      ariaLabel: node.getAttribute('aria-label') || '',
      className: node.className || '',
      visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
    }))
    .filter((entry) => entry.visible));
}

async function readResponsePayload(response) {
  const contentType = String(response.headers()['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [
    AUTH_SECURITY_SETTINGS_KEY,
    JSON.stringify({ globalTwoStepVerification: false }),
  ]);

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);

  try {
    await login(page);
    await page.goto(`${BASE_URL}/dashboard?page=subscription-management`, { waitUntil: 'networkidle' });
    await page.locator('h1, .customer-subscription-management-shell, .nevari-subscription-card--full').first().waitFor({ state: 'visible' });

    const initialButtons = await visibleButtons(page);
    let cancelRequest = null;
    let cancelResponseBody = null;
    let cancelErrorText = '';
    let successText = '';

    const managePlanButton = page.getByRole('button', { name: /^Manage Plan$/i }).first();
    const cancelSubscriptionButton = page.getByRole('button', { name: /^Cancel subscription$/i }).first();

    if (await cancelSubscriptionButton.isVisible().catch(() => false)) {
      await cancelSubscriptionButton.click();
      const confirmButton = page.getByRole('button', { name: /^Cancel subscription$/i }).last();
      await page.getByText('Cancel your subscription?').waitFor({ state: 'visible' });
      const responsePromise = page.waitForResponse((response) => response.url().includes('/subscriptions/cancel') && response.request().method() === 'POST', { timeout: 45000 });
      await confirmButton.click();
      cancelRequest = await responsePromise;
    } else if (await managePlanButton.isVisible().catch(() => false)) {
      await managePlanButton.click();
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    if (cancelRequest) {
      cancelResponseBody = await readResponsePayload(cancelRequest);
      cancelErrorText = await page.locator('text=Paystack cancellation details are missing').first().textContent().catch(() => '');
      successText = await page.locator('text=Subscription cancelled.').first().textContent().catch(() => '');
    }

    const afterButtons = await visibleButtons(page);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    const result = {
      ok: true,
      baseUrl: BASE_URL,
      currentUrl: page.url(),
      initialButtons,
      afterButtons,
      cancelAttempted: Boolean(cancelRequest),
      cancelHttpStatus: cancelRequest ? cancelRequest.status() : null,
      cancelResponseBody,
      ui: {
        cancelErrorText: String(cancelErrorText || '').trim(),
        successText: String(successText || '').trim(),
      },
      screenshot: SCREENSHOT_PATH,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  const result = {
    ok: false,
    baseUrl: BASE_URL,
    error: error.message,
    screenshot: SCREENSHOT_PATH,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
});
