const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.cwd(), 'NevariAdmin Storefront', 'node_modules', 'playwright'));

const BASE_URL = 'https://dash.nevarihealth.com';
const USERNAME = 'Ncustomer';
const PASSWORD = 'Ncustomer@2026!!!';
const AUTH_SECURITY_SETTINGS_KEY = 'nevari_global_auth_security_settings';
const OUTPUT_DIR = path.join(process.cwd(), 'temp', 'playwright-subscription-verify');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'live-cancel-result.json');
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, 'live-cancel-result.png');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function loginAndOpenProfile(page) {
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
      frontendUrl: `${window.location.origin}/dashboard?page=profile`,
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

  await page.goto(`${BASE_URL}/dashboard?page=profile`, { waitUntil: 'networkidle' });
  await page.locator('.nevari-subscription-card--full, .nevari-subscription-compact-card').first().waitFor({ state: 'visible' });
}

async function readResponsePayload(response) {
  const contentType = String(response.headers()['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

async function openSubscriptionActions(page) {
  const directCancelButton = page.getByRole('button', { name: /^Cancel subscription$/i }).first();
  if (await directCancelButton.isVisible().catch(() => false)) {
    return directCancelButton;
  }

  const openViewButton = page.getByRole('button', { name: /^View$/i }).first();
  if (await openViewButton.isVisible().catch(() => false)) {
    await openViewButton.click();
    const sheetCancelButton = page.getByRole('button', { name: /^Cancel subscription$/i }).first();
    await sheetCancelButton.waitFor({ state: 'visible' });
    return sheetCancelButton;
  }

  await directCancelButton.waitFor({ state: 'visible' });
  return directCancelButton;
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
    await loginAndOpenProfile(page);

    const launchCancelButton = await openSubscriptionActions(page);
    await launchCancelButton.click();

    const modal = page.locator('.customer-confirmation-modal');
    await modal.waitFor({ state: 'visible' });
    await page.getByText('Cancel your subscription?').waitFor({ state: 'visible' });

    const responsePromise = page.waitForResponse((response) => {
      return response.url().includes('/subscriptions/cancel') && response.request().method() === 'POST';
    }, { timeout: 45000 });

    const confirmButton = modal.getByRole('button', { name: /^Cancel subscription$/i }).last();
    await confirmButton.click();

    const response = await responsePromise;
    const responseBody = await readResponsePayload(response);

    const errorMessage = await page.locator('text=Paystack cancellation details are missing').first().textContent().catch(() => '');
    const successToast = await page.locator('text=Subscription cancelled.').first().textContent().catch(() => '');
    const statusText = await page.locator('.customer-subscription-management-status, .nevari-subscription-status-pill, .chip').first().textContent().catch(() => '');

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    const result = {
      ok: response.ok(),
      baseUrl: BASE_URL,
      requestUrl: response.url(),
      httpStatus: response.status(),
      responseBody,
      ui: {
        errorMessage: String(errorMessage || '').trim(),
        successToast: String(successToast || '').trim(),
        statusText: String(statusText || '').trim(),
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
