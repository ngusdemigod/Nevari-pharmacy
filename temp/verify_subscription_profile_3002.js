const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const USERNAME = "Ncustomer";
const PASSWORD = "Ncustomer@2026!!!";
const AUTH_SECURITY_SETTINGS_KEY = "nevari_global_auth_security_settings";
const OUTPUT_DIR = path.join(process.cwd(), "temp", "playwright-subscription-verify");
const BASE_URL = "http://localhost:3002";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function login({ mobile }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(mobile ? {
    viewport: { width: 402, height: 874 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  } : {
    viewport: { width: 1440, height: 1024 },
  });

  await context.addInitScript(([storageKey, storageValue]) => {
    window.localStorage.setItem(storageKey, storageValue);
  }, [
    AUTH_SECURITY_SETTINGS_KEY,
    JSON.stringify({ globalTwoStepVerification: false }),
  ]);

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  const loginPayload = await page.evaluate(async ({ username, password }) => {
    const endpoint = new URL("/api/nevari-proxy", window.location.origin);
    endpoint.searchParams.set("baseUrl", "https://nevarihealth.com");
    endpoint.searchParams.set("path", "/auth/login");
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Nevari-Frontend-Type": "patient_dashboard",
        "X-Nevari-Frontend-Origin": window.location.origin,
      },
      body: JSON.stringify({
        username,
        password,
        frontend_type: "patient_dashboard",
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
    const roles = Array.isArray(user?.roles) ? user.roles.map((value) => String(value || "").trim()).filter(Boolean) : [];
    window.localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
      baseUrl: "https://nevarihealth.com",
      frontendType: "patient_dashboard",
      frontendOrigin: window.location.origin,
      frontendUrl: `${window.location.origin}/dashboard`,
      paired: true,
      siteName: "",
      siteLogo: "",
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + (Number(expiresIn || 0) * 1000),
      user: user ? {
        id: user.id || "",
        display_name: user.display_name || user.name || "",
        email: user.email || "",
        avatar_url: user.avatar_url || user.avatarUrl || user.picture || "",
        role: user.role || "",
        roles,
      } : null,
    }));
  }, { expiresIn: data.expires_in, user: data.user });

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("text=Welcome back").first().waitFor({ state: "visible" });
  return { browser, page };
}

async function openProfile(page, mobile) {
  if (mobile) {
    const menuButton = page.getByRole("button", { name: /open menu/i }).first();
    await menuButton.click();
    await page.locator(".customer-mobile-drawer-layer.open").waitFor({ state: "visible" });
    await page.locator(".customer-mobile-drawer-item", { hasText: "Profile" }).first().click();
  } else {
    const candidates = [
      page.getByRole("button", { name: /^Profile$/i }).first(),
      page.getByText(/^Profile$/i).first(),
      page.locator("button", { hasText: "Profile" }).first(),
    ];
    let opened = false;
    for (const candidate of candidates) {
      try {
        if (await candidate.isVisible()) {
          await candidate.click();
          opened = true;
          break;
        }
      } catch {}
    }
    if (!opened) {
      throw new Error("Unable to open profile on desktop.");
    }
  }

  await page.locator(".customer-profile-card, .customer-mobile-panel").first().waitFor({ state: "visible" });
}

async function verifyDesktop() {
  const { browser, page } = await login({ mobile: false });
  try {
    await openProfile(page, false);
    await page.locator(".nevari-subscription-card--full").first().waitFor({ state: "visible" });
    await page.locator(".customer-profile-upload-card").first().waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-profile-subscription.png"), fullPage: true });

    return {
      desktopVisible: await page.locator(".nevari-subscription-card--full").count(),
      compactVisible: await page.locator(".nevari-subscription-compact-card").count(),
    };
  } finally {
    await browser.close();
  }
}

async function verifyMobile() {
  const { browser, page } = await login({ mobile: true });
  try {
    await openProfile(page, true);
    const compactCard = page.locator(".nevari-subscription-compact-card").first();
    await compactCard.waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-profile-subscription.png"), fullPage: true });
    await compactCard.getByRole("button").first().click();
    await page.locator(".nevari-subscription-sheet-panel .nevari-subscription-card--full").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-profile-subscription-sheet.png"), fullPage: true });

    return {
      compactVisible: await page.locator(".nevari-subscription-compact-card").count(),
      sheetVisible: await page.locator(".nevari-subscription-sheet-panel .nevari-subscription-card--full").count(),
    };
  } finally {
    await browser.close();
  }
}

(async () => {
  const desktop = await verifyDesktop();
  const mobile = await verifyMobile();
  console.log(JSON.stringify({ ok: true, desktop, mobile, outputDir: OUTPUT_DIR }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, outputDir: OUTPUT_DIR }, null, 2));
  process.exit(1);
});
