const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = "http://127.0.0.1:3000";
const patientStorageKey = "nevari_patient_dashboard_session";
const authSecuritySettingsKey = "nevari_global_auth_security_settings";
const legacySettingsKey = "nevari_customer_frontend_settings";
const scopedSettingsKey = (value) => `${legacySettingsKey}:${value}`;
const customerCacheKey = (value) => `nevari:patient:customer-dashboard:${value}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function success(data) {
  return { success: true, data };
}

function requestSearchParams(route) {
  return new URL(route.request().url()).searchParams;
}

function requestProxyPath(route) {
  return requestSearchParams(route).get("path") || "";
}

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(success(data)),
  });
}

function buildPatientSession(user) {
  return {
    baseUrl: "https://nevarihealth.com",
    frontendType: "patient_dashboard",
    frontendOrigin: baseUrl,
    frontendUrl: `${baseUrl}/dashboard`,
    paired: true,
    siteName: "Nevari Pharmacy",
    siteLogo: "/ne.webp",
    accessToken: "server-session",
    refreshToken: "refresh",
    expiresAt: Date.now() + 60 * 60 * 1000,
    user,
  };
}

async function mockCustomerRoutes(page, data) {
  await page.route("**/api/nevari-proxy**", async (route) => {
    const request = route.request();
    const apiPath = requestProxyPath(route);

    if (apiPath === "/dashboard/patient") {
      if (data.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, data.delayMs));
      }
      return json(route, {
        store_currency: "NGN",
        store_timezone: "Africa/Lagos",
        profile: data.profile,
        settings: data.settings,
        prescriptions: { recent: [] },
        appointments: { recent: [] },
      });
    }

    if (apiPath === "/customers/me/settings") {
      if (request.method() !== "GET") {
        data.settings = { ...data.settings, ...JSON.parse(request.postData() || "{}") };
      }
      return json(route, data.settings);
    }

    if (apiPath === "/subscriptions/me") {
      return json(route, {
        plan: "Nevari Access Pro",
        plan_key: "nevari_access_pro",
        status: "active",
        frequency: "monthly",
        amount: 1000,
        monthlyEquivalent: 1000,
        currency: "NGN",
        next_payment_date: "2026-07-20T00:00:00Z",
      });
    }

    if (apiPath === "/orders" || apiPath === "/appointments" || apiPath === "/doctors") {
      return json(route, []);
    }

    if (apiPath === "/auth/logout" || apiPath === "/sso/logout") {
      return json(route, { logged_out: true });
    }

    return json(route, []);
  });
}

async function openCustomerProfile(page) {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("button[aria-label='Open menu']", { timeout: 60000 });
  await page.locator("button[aria-label='Open menu']").first().click();
  const profileItem = page.locator(".customer-mobile-drawer-item", { hasText: "Profile" }).first();
  await profileItem.waitFor({ state: "visible", timeout: 30000 });
  await profileItem.click();
  await page.locator(".customer-mobile-field", { hasText: "Display Name:" }).locator("input").first().waitFor({ state: "visible", timeout: 30000 });
}

async function readIdentity(page) {
  const welcomeText = String(await page.locator("text=Welcome back").first().textContent() || "").trim();
  const displayName = await page.locator(".customer-mobile-field", { hasText: "Display Name:" }).locator("input").first().inputValue();
  const email = await page.locator(".customer-mobile-field", { hasText: /^Email:/ }).locator("input[readonly]").first().inputValue();
  return { welcomeText, displayName, email };
}

async function newPageWithState(browser, initScriptArg, routeData) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await context.addInitScript((state) => {
    window.localStorage.setItem(state.patientStorageKey, JSON.stringify(state.session));
    window.localStorage.setItem(state.authSecuritySettingsKey, JSON.stringify({ globalTwoStepVerification: false }));
    if (state.legacySettings) {
      window.localStorage.setItem(state.legacySettingsKey, JSON.stringify(state.legacySettings));
    }
    if (state.scopedSettings) {
      Object.entries(state.scopedSettings).forEach(([key, value]) => {
        window.localStorage.setItem(key, JSON.stringify(value));
      });
    }
    if (state.cachedState) {
      window.sessionStorage.setItem(state.cacheKey, JSON.stringify({ cachedAt: Date.now(), data: { state: state.cachedState } }));
    }
  }, initScriptArg);
  const page = await context.newPage();
  await mockCustomerRoutes(page, routeData);
  return { context, page };
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  const customerA = {
    id: 7,
    email: "customer@example.com",
    display_name: "Ncustomer",
    roles: ["customer"],
  };
  const customerB = {
    id: 8,
    email: "second@example.com",
    display_name: "Second Customer",
    roles: ["customer"],
  };

  try {
    const scenarioOne = await newPageWithState(browser, {
      patientStorageKey,
      authSecuritySettingsKey,
      legacySettingsKey,
      session: buildPatientSession(customerA),
      legacySettings: {
        displayName: "Baritor John Ekun",
        email: "baritorjohn@gmail.com",
        phone: "08099999999",
      },
      scopedSettings: null,
      cachedState: null,
      cacheKey: customerCacheKey(customerA.id),
    }, {
      delayMs: 0,
      profile: {
        id: 7,
        email: "customer@example.com",
        display_name: "Ncustomer",
        avatar_url: "",
        roles: ["customer"],
      },
      settings: {
        displayName: "Ncustomer",
        email: "customer@example.com",
        phone: "08012345678",
        address: "12 Adeola Odeku Street",
        timezone: "Africa/Lagos",
      },
    });
    await openCustomerProfile(scenarioOne.page);
    const scenarioOneIdentity = await readIdentity(scenarioOne.page);
    assert(scenarioOneIdentity.displayName === "Ncustomer", `Legacy settings leaked display name: ${scenarioOneIdentity.displayName}`);
    assert(scenarioOneIdentity.email === "customer@example.com", `Legacy settings leaked email: ${scenarioOneIdentity.email}`);
    const scenarioOneStorage = await scenarioOne.page.evaluate(({ legacySettingsKey, scopedKey }) => ({
      legacyExists: Boolean(window.localStorage.getItem(legacySettingsKey)),
      scopedExists: Boolean(window.localStorage.getItem(scopedKey)),
    }), { legacySettingsKey, scopedKey: scopedSettingsKey(customerA.id) });
    assert(!scenarioOneStorage.legacyExists, "Legacy customer settings key was not cleared.");
    assert(scenarioOneStorage.scopedExists, "Scoped customer settings key was not created.");
    await scenarioOne.context.close();

    const scenarioTwo = await newPageWithState(browser, {
      patientStorageKey,
      authSecuritySettingsKey,
      legacySettingsKey,
      session: buildPatientSession(customerA),
      legacySettings: null,
      scopedSettings: null,
      cachedState: {
        error: "",
        dashboard: {
          profile: {
            id: 88,
            email: "baritorjohn@gmail.com",
            display_name: "Baritor John Ekun",
          },
          store_currency: "NGN",
          store_timezone: "Africa/Lagos",
        },
        settings: {},
        orders: [],
        appointments: [],
        doctors: [],
        doctorsUnavailable: false,
      },
      cacheKey: customerCacheKey(customerA.id),
    }, {
      delayMs: 1500,
      profile: {
        id: 7,
        email: "customer@example.com",
        display_name: "Ncustomer",
        avatar_url: "",
        roles: ["customer"],
      },
      settings: {
        displayName: "Ncustomer",
        email: "customer@example.com",
        phone: "08012345678",
        address: "12 Adeola Odeku Street",
        timezone: "Africa/Lagos",
      },
    });
    await openCustomerProfile(scenarioTwo.page);
    const scenarioTwoIdentity = await readIdentity(scenarioTwo.page);
    assert(!/baritor/i.test(JSON.stringify(scenarioTwoIdentity)), `Cached foreign profile leaked into UI: ${JSON.stringify(scenarioTwoIdentity)}`);
    await scenarioTwo.context.close();

    const scopedAKey = scopedSettingsKey(customerA.id);
    const scopedBKey = scopedSettingsKey(customerB.id);
    const scenarioThree = await newPageWithState(browser, {
      patientStorageKey,
      authSecuritySettingsKey,
      legacySettingsKey,
      session: buildPatientSession(customerB),
      legacySettings: null,
      scopedSettings: {
        [scopedAKey]: {
          displayName: "Baritor John Ekun",
          email: "baritorjohn@gmail.com",
          phone: "08099999999",
        },
      },
      cachedState: null,
      cacheKey: customerCacheKey(customerB.id),
    }, {
      delayMs: 0,
      profile: {
        id: 8,
        email: "second@example.com",
        display_name: "Second Customer",
        avatar_url: "",
        roles: ["customer"],
      },
      settings: {
        displayName: "Second Customer",
        email: "second@example.com",
        phone: "08077777777",
        address: "8 Broad Street",
        timezone: "Africa/Lagos",
      },
    });
    await openCustomerProfile(scenarioThree.page);
    const scenarioThreeIdentity = await readIdentity(scenarioThree.page);
    assert(scenarioThreeIdentity.displayName === "Second Customer", `Another user's scoped display name leaked: ${scenarioThreeIdentity.displayName}`);
    assert(scenarioThreeIdentity.email === "second@example.com", `Another user's email leaked: ${scenarioThreeIdentity.email}`);
    const scenarioThreeStorage = await scenarioThree.page.evaluate(({ scopedAKey, scopedBKey }) => ({
      scopedA: Boolean(window.localStorage.getItem(scopedAKey)),
      scopedB: Boolean(window.localStorage.getItem(scopedBKey)),
    }), { scopedAKey, scopedBKey });
    assert(scenarioThreeStorage.scopedA, "Existing scoped settings for customer A should remain isolated.");
    assert(scenarioThreeStorage.scopedB, "Scoped settings for customer B were not created.");
    await scenarioThree.context.close();

    console.log(JSON.stringify({ ok: true }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});


