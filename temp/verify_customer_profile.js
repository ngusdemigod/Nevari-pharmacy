const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const USERNAME = "Ncustomer";
const PASSWORD = "Ncustomer@2026!!!";
const OUTPUT_DIR = path.join(process.cwd(), "temp", "playwright-customer-verify");
const AUTH_SECURITY_SETTINGS_KEY = "nevari_global_auth_security_settings";
const CANDIDATES = ["http://localhost:3001", "http://localhost:3000"];

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
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
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

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 60000 }),
      page.locator("text=Welcome back").waitFor({ state: "visible", timeout: 60000 }),
    ]);

    return { browser, context, page, baseUrl };
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
  await menuButton.click();
  await page.locator(".customer-mobile-drawer-layer.open").waitFor({ state: "visible" });
}

async function navigateFromDrawer(page, label) {
  await openDrawer(page);
  const item = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  await item.click();
}

async function captureHeaderMetrics(page, name, headingPattern) {
  const searchBar = page.locator(".customer-mobile-searchbar").first();
  const heading = page.getByRole("heading", { name: headingPattern }).first();
  try {
    await searchBar.waitFor({ state: "visible", timeout: 60000 });
    await heading.waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    const failurePath = path.join(OUTPUT_DIR, `${name}-header-failure.png`);
    await page.screenshot({ path: failurePath, fullPage: false }).catch(() => {});
    throw new Error(`${name} header was not visible. Screenshot: ${failurePath}`);
  }

  const searchBox = await searchBar.boundingBox();
  const headingBox = await heading.boundingBox();
  const screenshotPath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  return {
    name,
    screenshot: screenshotPath,
    searchTop: searchBox ? Number(searchBox.y.toFixed(1)) : null,
    headingTop: headingBox ? Number(headingBox.y.toFixed(1)) : null,
    clipped: !searchBox || !headingBox || searchBox.y < 8 || headingBox.y < 56,
  };
}

async function fillVisibleInputs(page, valuesByLabel = {}) {
  const fields = page.locator(".customer-mobile-step-panel .customer-mobile-field");
  const count = await fields.count();
  for (let index = 0; index < count; index += 1) {
    const field = fields.nth(index);
    const label = String(await text(field.locator("span").first())).replace(/:$/, "");
    const select = field.locator("select");
    const input = field.locator("input");
    const textarea = field.locator("textarea");

    if (await select.count()) {
      const options = select.locator("option");
      const optionCount = await options.count();
      if (optionCount > 1) {
        await select.selectOption({ index: 1 });
      }
      continue;
    }

    if (await textarea.count()) {
      await textarea.fill(valuesByLabel[label] || "Test response");
      continue;
    }

    if (await input.count()) {
      const inputType = await input.getAttribute("type");
      if (inputType === "file") {
        continue;
      }
      const value = valuesByLabel[label]
        || (inputType === "date" ? "1996-01-01"
          : inputType === "email" ? "customer@example.com"
          : inputType === "tel" ? "08012345678"
          : label.toLowerCase().includes("age") ? "30"
          : label.toLowerCase().includes("blood pressure") ? "120/80"
          : label.toLowerCase().includes("blood glucose") ? "96"
          : "Test value");
      await input.fill(value);
    }
  }
}

async function continueMtm(page) {
  const button = page.locator(".customer-mobile-sticky-actions .customer-mobile-primary-button").first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

async function goToMtmStep4(page) {
  await fillVisibleInputs(page, {
    Name: "Test Customer",
    Address: "12 Adeola Odeku Street",
    "City/State": "Lagos",
    "Phone Number": "08012345678",
    "Emergency Contact": "08012345679",
  });
  await continueMtm(page);

  await page.locator("text=Step 2 of 6").waitFor({ state: "visible" });
  await fillVisibleInputs(page, {
    "Caregiver / Next of Kin Name": "Jane Doe",
    Relationship: "Sibling",
    "Phone Number": "08012345678",
    "Email Address": "caregiver@example.com",
    Address: "12 Adeola Odeku Street",
  });
  await continueMtm(page);

  await page.locator("text=Step 3 of 6").waitFor({ state: "visible" });
  await fillVisibleInputs(page, {
    Height: "172 cm",
    Weight: "70 kg",
    "Blood Pressure": "120/80",
    "Blood Glucose/HbA1c": "96",
    "Primary Diagnosis": "Hypertension",
    "Secondary Diagnosis": "Diabetes",
    "Chronic Conditions": "None",
    "Past Medical History": "None",
    "Past Surgical History": "Appendectomy",
    Allergies: "None",
    "Current Medications": "Amlodipine",
    "Clinical Monitoring Parameters": "Blood pressure",
  });
  await continueMtm(page);

  await page.locator("text=Step 4 of 6").waitFor({ state: "visible" });
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
  const results = {
    baseUrl,
    overview: null,
    appointments: null,
    ivTherapy: null,
    mtm: null,
    appointmentActiveTab: "",
    appointmentTabs: null,
    appointmentList: null,
    appointmentAddButton: null,
  };

  try {
    await page.waitForLoadState("networkidle");

    results.overview = await captureHeaderMetrics(page, "overview", /overview/i);

    await navigateFromDrawer(page, "Appointments");
    await page.waitForLoadState("networkidle");
    results.appointments = await captureHeaderMetrics(page, "appointments", /appointments/i);
    results.appointmentActiveTab = await text(page.locator(".customer-mobile-pill-tab.active").first());
    const appointmentTabsLocator = page.locator(".customer-mobile-appointment-tabs, .customer-mobile-pill-tabs").first();
    await appointmentTabsLocator.waitFor({ state: "visible", timeout: 20000 });
    results.appointmentTabs = await appointmentTabsLocator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: Number(rect.top.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        viewportHeight: window.innerHeight,
      };
    });
    const appointmentListLocator = page.locator(".customer-mobile-visit-row, .customer-mobile-empty-state").first();
    await appointmentListLocator.waitFor({ state: "visible", timeout: 20000 });
    results.appointmentList = await appointmentListLocator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: Number(rect.top.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        viewportHeight: window.innerHeight,
      };
    });
    const appointmentAddButton = page.locator(".customer-mobile-appointment-booknow-btn").first();
    await appointmentAddButton.waitFor({ state: "visible", timeout: 20000 });
    results.appointmentAddButton = await appointmentAddButton.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        top: Number(rect.top.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        position: style.position,
        zIndex: style.zIndex,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    await navigateFromDrawer(page, "Medical Therapy Management");
    await page.waitForLoadState("networkidle");
    const mtmHeader = await captureHeaderMetrics(page, "mtm", /medical therapy management/i);
    await goToMtmStep4(page);
    const addButton = page.locator(".customer-mtm-floating-add-dock .customer-mobile-add-medication-button").first();
    await addButton.waitFor({ state: "visible" });
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "mtm-step4.png"), fullPage: false });
    const addRect = await addButton.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dock = element.closest(".customer-mtm-floating-add-dock");
      const dockStyle = dock ? window.getComputedStyle(dock) : null;
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        viewportHeight: window.innerHeight,
        dockPosition: dockStyle ? dockStyle.position : "",
        dockBottom: dockStyle ? dockStyle.bottom : "",
        dockTransform: dockStyle ? dockStyle.transform : "",
        dockDisplay: dockStyle ? dockStyle.display : "",
      };
    });
    results.mtm = {
      ...mtmHeader,
      addButtonVisible: await addButton.isVisible(),
      addButtonTop: addRect ? Number(addRect.top.toFixed(1)) : null,
      addButtonBottom: addRect ? Number(addRect.bottom.toFixed(1)) : null,
      dockPosition: addRect?.dockPosition || "",
      dockBottom: addRect?.dockBottom || "",
      dockTransform: addRect?.dockTransform || "",
      dockDisplay: addRect?.dockDisplay || "",
      stickyWithinViewport: Boolean(addRect && addRect.top >= 0 && addRect.bottom <= addRect.viewportHeight),
    };

    await navigateFromDrawer(page, "IV Therapy");
    await page.waitForLoadState("networkidle");
    results.ivTherapy = await captureHeaderMetrics(page, "iv-therapy", /iv therapy/i);

    const failures = [];
    for (const key of ["overview", "appointments", "ivTherapy"]) {
      if (results[key]?.clipped) {
        failures.push(`${key} header still appears clipped`);
      }
    }
    if (!/upcoming/i.test(results.appointmentActiveTab)) {
      failures.push(`appointments default active tab is "${results.appointmentActiveTab}" instead of Upcoming`);
    }
    if (!results.appointmentTabs || results.appointmentTabs.top < 96 || results.appointmentTabs.top > 160 || results.appointmentTabs.bottom > results.appointmentTabs.viewportHeight) {
      failures.push("appointments tabs are still clipped by the fixed mobile header");
    }
    if (!results.appointmentList || results.appointmentList.top < 140 || results.appointmentList.bottom > results.appointmentList.viewportHeight + 4) {
      failures.push("appointments list is not fully starting below the mobile header and tabs");
    }
    if (
      !results.appointmentAddButton
      || results.appointmentAddButton.position !== "fixed"
      || results.appointmentAddButton.bottom > results.appointmentAddButton.viewportHeight - 12
      || results.appointmentAddButton.top < results.appointmentAddButton.viewportHeight - 140
      || results.appointmentAddButton.right < results.appointmentAddButton.viewportWidth - 80
    ) {
      failures.push("appointments add button is not floating at the bottom-right of the viewport");
    }
    if (!results.mtm?.addButtonVisible || !results.mtm?.stickyWithinViewport) {
      failures.push("MTM sticky add button did not stay within the viewport on step 4");
    }

    console.log(JSON.stringify({ ok: failures.length === 0, failures, results }, null, 2));

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
