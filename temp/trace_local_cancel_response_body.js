const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.cwd(), 'NevariAdmin Storefront', 'node_modules', 'playwright'));

const BASE_URL = 'http://localhost:3000';
const USERNAME = 'Ncustomer';
const PASSWORD = 'Ncustomer@2026!!!';
const AUTH_SECURITY_SETTINGS_KEY = 'nevari_global_auth_security_settings';
const OUTPUT_DIR = path.join(process.cwd(), 'temp', 'playwright-subscription-verify');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'local-cancel-response-body.json');

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

async function readResponseBody(response) {
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
    await page.locator('.customer-subscription-management-cta').waitFor({ state: 'visible' });
    await page.locator('.customer-subscription-management-cta').click();
    await page.getByText('Active Subscription').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /^Cancel plan$/i }).first().click();
    await page.getByText('Are you sure?').waitFor({ state: 'visible' });
    const responsePromise = page.waitForResponse((response) => response.url().includes('/subscriptions/cancel') && response.request().method() === 'POST', { timeout: 45000 });
    await page.getByRole('button', { name: /^Cancel plan$/i }).last().click();
    const response = await responsePromise;
    const responseBody = await readResponseBody(response);

    const result = {
      ok: true,
      baseUrl: BASE_URL,
      requestUrl: response.url(),
      status: response.status(),
      responseBody,
      bodyExcerpt: await page.locator('body').textContent().then((value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 800)).catch(() => ''),
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  const result = { ok: false, baseUrl: BASE_URL, error: error.message };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
});
