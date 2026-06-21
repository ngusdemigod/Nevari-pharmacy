const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "NevariAdmin Storefront", "node_modules", "playwright"));

const baseUrl = "http://127.0.0.1:3002";
const patientStorageKey = "nevari_patient_dashboard_session";
const adminStorageKey = "nevari_admin_storefront_session";
const authSecuritySettingsKey = "nevari_global_auth_security_settings";

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

function buildPatientSession() {
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
    user: {
      id: 7,
      email: "customer@example.com",
      display_name: "Ncustomer",
      roles: ["customer"],
    },
  };
}

function buildAdminSession() {
  return {
    baseUrl: "https://nevarihealth.com",
    frontendType: "storefront",
    frontendOrigin: baseUrl,
    frontendUrl: `${baseUrl}/admin/storefront`,
    paired: true,
    siteName: "Nevari Pharmacy",
    siteLogo: "/ne.webp",
    accessToken: "server-session",
    refreshToken: "refresh",
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: {
      id: 1,
      email: "admin@example.com",
      display_name: "Nadmin",
      roles: ["administrator"],
    },
  };
}

async function mockCustomerRoutes(page) {
  let customerSettings = {
    displayName: "Ncustomer",
    email: "customer@example.com",
    phone: "08012345678",
    address: "12 Adeola Odeku Street",
    timezone: "Africa/Lagos",
    preferredConsultationType: "video",
    preferredDoctorIds: ["21"],
    emailReminders: true,
    appointmentReminders: true,
    prescriptionAlerts: true,
    paymentReceipts: true,
    marketingOptIn: false,
    refundTracking: true,
    twoFactorEnabled: false,
    savedMethods: [],
  };
  let settingsSaveCount = 0;

  await page.route("**/api/nevari-proxy**", async (route) => {
    const request = route.request();
    const apiPath = requestProxyPath(route);

    if (apiPath === "/dashboard/patient") {
      return json(route, {
        store_currency: "NGN",
        store_timezone: "Africa/Lagos",
        profile: {
          id: 7,
          email: "customer@example.com",
          display_name: "Ncustomer",
          avatar_url: "",
          phone: customerSettings.phone,
          address: customerSettings.address,
          roles: ["customer"],
        },
        settings: customerSettings,
        prescriptions: { recent: [] },
        appointments: { recent: [] },
      });
    }

    if (apiPath === "/customers/me/settings") {
      if (request.method() !== "GET") {
        settingsSaveCount += 1;
        customerSettings = { ...customerSettings, ...JSON.parse(request.postData() || "{}") };
      }
      return json(route, customerSettings);
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

    if (apiPath === "/orders" || apiPath === "/appointments") {
      return json(route, []);
    }

    if (apiPath === "/doctors") {
      return json(route, [
        {
          id: 21,
          user_id: 21,
          display_name: "Dr Ada",
          email: "ada@example.com",
          specialties: ["General medicine"],
        },
      ]);
    }

    return json(route, []);
  });

  return {
    getSettings: () => customerSettings,
    getSettingsSaveCount: () => settingsSaveCount,
  };
}

async function mockAdminRoutes(page) {
  await page.route("**/api/nevari-proxy**", async (route) => {
    const apiPath = requestProxyPath(route);

    if (apiPath === "/auth/google-config") {
      return json(route, { enabled: false, client_id: "" });
    }

    if (apiPath === "/auth/login") {
      return json(route, {
        access_token: "server-session",
        refresh_token: "refresh",
        expires_in: 3600,
        frontend: {
          type: "storefront",
          origin: baseUrl,
          url: `${baseUrl}/admin/storefront`,
        },
        user: {
          id: 1,
          email: "admin@example.com",
          display_name: "Nadmin",
          roles: ["administrator"],
        },
      });
    }

    return json(route, []);
  });

  await page.route("**/api/admin/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith("/summary")) {
      return json(route, {
        revenue_today: 0,
        consultations_today: 1,
        consultations_requested: 0,
        prescriptions_pending: 0,
        products_active: 15,
        orders_processing: 6,
        customers_total: 18,
      });
    }

    if (pathname.endsWith("/orders")) {
      return json(route, {
        items: [
          { id: 1001, number: "1001", total: "3200", created_at: "2026-01-12T10:00:00Z", status: "processing", payment_status: "completed", items_summary: [{ name: "Novagin" }] },
          { id: 1002, number: "1002", total: "4800", created_at: "2026-02-13T10:00:00Z", status: "processing", payment_status: "completed", items_summary: [{ name: "Novagin" }] },
          { id: 1003, number: "1003", total: "12000", created_at: "2026-03-11T10:00:00Z", status: "processing", payment_status: "completed", items_summary: [{ name: "Ciprofloxacin 500mg" }] },
          { id: 1004, number: "1004", total: "7300", created_at: "2026-04-15T10:00:00Z", status: "processing", payment_status: "completed", items_summary: [{ name: "Azithromycin 500mg" }] },
          { id: 1005, number: "1005", total: "9400", created_at: "2026-05-10T10:00:00Z", status: "processing", payment_status: "completed", items_summary: [{ name: "Salbutamol Inhaler" }] },
          { id: 1006, number: "1006", total: "8800", created_at: "2026-06-05T10:00:00Z", status: "processing", payment_status: "completed", items_summary: [{ name: "Loratadine 10mg" }] },
        ],
        total: 6,
      });
    }

    if (pathname.endsWith("/products")) {
      return json(route, {
        items: [
          {
            id: 401,
            name: "Ciprofloxacin 500mg",
            price: "4200",
            stock_quantity: 12,
            stock_status: "instock",
            images: [{ src: "/placeholder-product.png" }],
            categories: [{ name: "Antibiotics" }],
          },
        ],
        total: 1,
      });
    }

    if (
      pathname.endsWith("/appointments")
      || pathname.endsWith("/prescriptions")
      || pathname.endsWith("/audit")
      || pathname.endsWith("/customers")
      || pathname.endsWith("/categories")
      || pathname.endsWith("/tags")
      || pathname.endsWith("/doctors")
      || pathname.endsWith("/emails")
      || pathname.endsWith("/mtm")
      || pathname.endsWith("/iv-therapy")
    ) {
      return json(route, { items: [], total: 0 });
    }

    return json(route, []);
  });
}

async function ensureCustomerDashboardReady(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    const pageText = await page.locator("body").innerText().catch(() => "");
    if (!/404|not found/i.test(pageText)) {
      return;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error("Customer dashboard did not stabilize after repeated reloads.");
}

async function openCustomerProfile(page) {
  await page.waitForSelector(".customer-mobile-frame, .customer-mobile-app, button[aria-label='Open menu']", { timeout: 60000 });

  if (await page.locator(".customer-mobile-pill-tab", { hasText: "Notification Settings" }).count()) {
    return;
  }

  const openMenuButton = page.locator('button[aria-label="Open menu"]').first();
  await openMenuButton.waitFor({ state: "visible", timeout: 60000 });
  await openMenuButton.click();

  const profileItem = page.locator(".customer-mobile-drawer-item", { hasText: "Profile" }).first();
  await profileItem.waitFor({ state: "visible", timeout: 30000 });
  await profileItem.click();

  await page.waitForSelector(".customer-mobile-profile-tabs", { timeout: 30000 });
}

async function verifyCustomerDashboard(browser) {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  const routeState = await mockCustomerRoutes(page);

  await page.addInitScript(({ patientStorageKey, authSecuritySettingsKey, session }) => {
    window.localStorage.setItem(patientStorageKey, JSON.stringify(session));
    window.localStorage.setItem(authSecuritySettingsKey, JSON.stringify({ globalTwoStepVerification: false }));
  }, {
    patientStorageKey,
    authSecuritySettingsKey,
    session: buildPatientSession(),
  });

  await ensureCustomerDashboardReady(page);
  await openCustomerProfile(page);
  await page.waitForSelector(".customer-mobile-upload-group", { timeout: 30000 });

  const subscriptionCard = page.locator(".subscription-manage-card").first();
  await subscriptionCard.waitFor();
  const subscriptionCardStyle = await subscriptionCard.evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      backgroundImage: style.backgroundImage,
      color: style.color,
    };
  });
  assert(subscriptionCardStyle.backgroundImage && subscriptionCardStyle.backgroundImage !== "none", "Subscription card gradient is missing.");

  const uploadCardVisible = await page.locator(".customer-mobile-upload-group .customer-mobile-dropzone").isVisible();
  assert(uploadCardVisible, "Profile upload dropzone is not visible.");

  await page.locator(".customer-mobile-pill-tab", { hasText: "Notification Settings" }).click();
  await page.waitForSelector('label:has-text("Email Reminders") input');
  const emailReminderToggle = page.locator('label:has-text("Email Reminders") input');
  const initialChecked = await emailReminderToggle.isChecked();
  await emailReminderToggle.click();
  await page.waitForTimeout(1200);
  assert(routeState.getSettingsSaveCount() > 0, "Notification settings did not save for the logged-in user.");

  await ensureCustomerDashboardReady(page);
  await openCustomerProfile(page);
  await page.locator(".customer-mobile-pill-tab", { hasText: "Notification Settings" }).click();
  await page.waitForSelector('label:has-text("Email Reminders") input');
  await page.waitForTimeout(1200);
  const persistedChecked = await page.locator('label:has-text("Email Reminders") input').isChecked();
  assert(persistedChecked === !initialChecked, "Notification setting did not persist after reload.");

  await page.screenshot({ path: "C:/tmp/customer-profile-settings-verify.png", fullPage: true });
  await page.close();
}

async function verifyAdminDashboard(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await mockAdminRoutes(page);

  await page.addInitScript(({ authSecuritySettingsKey }) => {
    window.localStorage.setItem(authSecuritySettingsKey, JSON.stringify({ globalTwoStepVerification: false }));
  }, { authSecuritySettingsKey });

  await page.goto(`${baseUrl}/admin/storefront/login`, { waitUntil: "networkidle" });

  const inputs = page.locator("input");
  await inputs.nth(0).fill("Nadmin");
  await inputs.nth(1).fill("Nadmin@2026!!!");
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  await page.waitForURL("**/admin/storefront", { timeout: 20000 });
  await page.waitForSelector(".overview-v2-trend-select select");

  const otpPromptVisible = await page.locator(".subscription-otp-card, text=/one-time code|verification/i").count();
  assert(otpPromptVisible === 0, "Admin login still requires OTP.");

  const rangeOptions = await page.locator(".overview-v2-trend-select select option").allTextContents();
  assert(
    JSON.stringify(rangeOptions.map((item) => item.trim())) === JSON.stringify(["Yearly", "Monthly", "Weekly"]),
    `Unexpected revenue range options: ${rangeOptions.join(", ")}`
  );

  const overlap = await page.evaluate(() => {
    const sidebar = document.querySelector(".page-shell.nevari-admin-storefront .sidebar");
    const main = document.querySelector(".page-shell.nevari-admin-storefront .main-shell");
    if (!sidebar || !main) return null;
    const sidebarBox = sidebar.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    return {
      sidebarRight: sidebarBox.right,
      mainLeft: mainBox.left,
    };
  });
  assert(overlap && overlap.sidebarRight <= overlap.mainLeft + 1, `Admin sidebar overlaps main content (${JSON.stringify(overlap)}).`);

  const chartVisible = await page.locator(".trend-chart-svg").isVisible();
  assert(chartVisible, "Overview area chart is not visible.");

  await page.screenshot({ path: "C:/tmp/admin-overview-verify.png", fullPage: true });
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await verifyCustomerDashboard(browser);
    await verifyAdminDashboard(browser);
    console.log("VERIFIED: customer settings/profile and admin overview/login");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
