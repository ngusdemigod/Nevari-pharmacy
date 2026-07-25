const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const USERNAME = "Ncustomer";
const PASSWORD = "Ncustomer@2026!!!";
const OUTPUT_DIR = path.join(process.cwd(), "temp", "playwright-customer-verify");
const AUTH_SECURITY_SETTINGS_KEY = "nevari_global_auth_security_settings";
const CANDIDATES = ["http://localhost:3000", "http://localhost:3003", "http://localhost:3001"];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function text(locator) {
  return locator.textContent().then((value) => String(value || "").trim());
}

async function login(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(([storageKey, storageValue]) => {
    window.localStorage.setItem(storageKey, storageValue);
  }, [
    AUTH_SECURITY_SETTINGS_KEY,
    JSON.stringify({ globalTwoStepVerification: false }),
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    const loginPayload = await page.evaluate(async ({ username, password }) => {
      const baseUrl = "https://nevarihealth.com";
      const endpoint = new URL("/api/nevari-proxy", window.location.origin);
      endpoint.searchParams.set("baseUrl", baseUrl);
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
      throw new Error(`Direct auth/login failed: ${JSON.stringify(loginPayload?.payload || null)}`);
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

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.locator("text=Welcome back").first().waitFor({ state: "visible", timeout: 60000 });

    return { browser, page, baseUrl };
  } catch (error) {
    try {
      await page.screenshot({ path: path.join(OUTPUT_DIR, `login-failure-${baseUrl.replace(/[^a-z0-9]+/gi, "-")}.png`), fullPage: true });
    } catch {}
    await browser.close();
    throw error;
  }
}

async function openDrawer(page) {
  const menuButton = page.getByRole("button", { name: /open menu/i }).first();
  await menuButton.waitFor({ state: "visible", timeout: 30000 });
  await menuButton.click();
  await page.locator(".customer-mobile-drawer-layer.open").waitFor({ state: "visible", timeout: 30000 });
}

async function openProfile(page) {
  await openDrawer(page);
  const profileItem = page.locator(".customer-mobile-drawer-item", { hasText: "Profile" }).first();
  await profileItem.waitFor({ state: "visible", timeout: 30000 });
  await profileItem.click();
  await page.locator(".customer-mobile-upload-group, .customer-profile-card").first().waitFor({ state: "visible", timeout: 30000 });
}

async function readProfileIdentity(page) {
  const welcomeText = await text(page.locator("text=Welcome back").first());
  const displayNameInput = page.locator(".customer-mobile-field", { hasText: "Display Name:" }).locator("input").first();
  const profileEmailInput = page.locator(".customer-mobile-field", { hasText: /^Email:/ }).locator("input[readonly]").first();

  await displayNameInput.waitFor({ state: "visible", timeout: 30000 });
  await profileEmailInput.waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: path.join(OUTPUT_DIR, "profile-identity.png"), fullPage: false });

  return {
    welcomeText,
    displayName: await displayNameInput.inputValue(),
    email: await profileEmailInput.inputValue(),
  };
}

async function verify() {
  let session = null;
  const errors = [];
  for (const baseUrl of CANDIDATES) {
    try {
      session = await login(baseUrl);
      break;
    } catch (error) {
      errors.push(`${baseUrl}: ${error.message}`);
    }
  }

  if (!session) {
    throw new Error(`Unable to sign in with Playwright. ${errors.join(" | ")}`);
  }

  const { browser, page, baseUrl } = session;
  try {
    await openProfile(page);
    const identity = await readProfileIdentity(page);
    const failures = [];
    if (!/Ncustomer/i.test(identity.welcomeText)) {
      failures.push(`Welcome text did not resolve to Ncustomer: ${identity.welcomeText}`);
    }
    if (identity.displayName !== "Ncustomer") {
      failures.push(`Display name input resolved to "${identity.displayName}" instead of "Ncustomer"`);
    }
    if (!["ncustomer@gmail.com", "customer@example.com"].includes(identity.email)) {
      failures.push(`Profile email resolved to "${identity.email}"`);
    }
    if (/baritorjohn@gmail.com/i.test(identity.email) || /baritor/i.test(identity.welcomeText) || /baritor/i.test(identity.displayName)) {
      failures.push("Profile identity still leaked another customer's data.");
    }

    console.log(JSON.stringify({ ok: failures.length === 0, baseUrl, identity, failures }, null, 2));
    if (failures.length) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

verify().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});

