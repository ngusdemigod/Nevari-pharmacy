const path = require('path');
const { chromium } = require(path.join(process.cwd(), 'NevariAdmin Storefront', 'node_modules', 'playwright'));

const BASE_URL = 'http://localhost:3000';
const USERNAME = 'Ncustomer';
const PASSWORD = 'Ncustomer@2026!!!';
const AUTH_SECURITY_SETTINGS_KEY = 'nevari_global_auth_security_settings';

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
    await page.waitForTimeout(800);
    const snapshot = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map((node) => ({
        text: (node.textContent || '').trim(),
        ariaLabel: node.getAttribute('aria-label') || '',
        className: node.className || '',
        visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
        disabled: Boolean(node.disabled),
      })).filter((entry) => entry.visible);
      const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((node) => (node.textContent || '').trim()).filter(Boolean);
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
      return {
        title: document.title,
        location: window.location.href,
        headings,
        buttons,
        bodyText,
      };
    });
    console.log(JSON.stringify({ ok: true, snapshot }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
