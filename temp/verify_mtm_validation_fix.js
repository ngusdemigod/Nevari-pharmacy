const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const BASE_URL = "http://localhost:3001";
const USERNAME = process.env.NEVARI_TEST_PATIENT_USERNAME || "Ncustomer";
const PASSWORD = process.env.NEVARI_TEST_PATIENT_PASSWORD || "Ncustomer@2026!!!";
const BACKEND_URL = "https://nevarihealth.com";
const VIEWPORT_WIDTH = Number(process.env.NEVARI_TEST_VIEWPORT_WIDTH || 390);
const VIEWPORT_HEIGHT = Number(process.env.NEVARI_TEST_VIEWPORT_HEIGHT || 844);
const NON_PRO_FLOW = process.env.NEVARI_TEST_MTM_PAYMENT_MODE === "non_pro";
const CONSENT_YES_CHECK = process.env.NEVARI_TEST_CONSENT_YES === "1";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const WEBP_SIGNATURE = Buffer.from("524946460400000057454250", "hex");

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function setSession(page, attempt = 0) {
  const result = await page.evaluate(async ({ username, password, backendUrl }) => {
    const endpoint = new URL("/api/nevari-proxy", window.location.origin);
    endpoint.searchParams.set("baseUrl", backendUrl);
    endpoint.searchParams.set("path", "/auth/login");
    const response = await fetch(endpoint, {
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
        frontend_url: window.location.origin + "/dashboard",
        global_two_step_verification: false,
        two_factor_required: false,
        require_verification: false,
        require_otp: false,
      }),
    });
    return {
      ok: response.ok,
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      payload: await response.json().catch(() => null),
    };
  }, { username: USERNAME, password: PASSWORD, backendUrl: BACKEND_URL });

  if (result.status === 429) {
    assert(attempt < 2, "Patient login remained rate-limited after bounded retries.");
    await page.waitForTimeout(Math.min(60, Math.max(5, Number(result.retryAfter || 15))) * 1000);
    return setSession(page, attempt + 1);
  }

  assert(result.ok && result.payload && result.payload.success, "Patient login failed with status " + result.status + ".");
  const data = result.payload.data;
  await page.evaluate(({ data, backendUrl }) => {
    const roles = Array.isArray(data.user && data.user.roles) ? data.user.roles : [];
    localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
      baseUrl: backendUrl,
      frontendType: "patient_dashboard",
      frontendOrigin: location.origin,
      frontendUrl: location.origin + "/dashboard",
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      user: { ...data.user, roles },
    }));
  }, { data, backendUrl: BACKEND_URL });
}

async function fillField(page, labelText, value) {
  const field = page.locator("label.customer-mobile-field").filter({ hasText: labelText }).first();
  await field.scrollIntoViewIfNeeded();
  const control = field.locator("input:not([type=file]), textarea, select").last();
  if (await control.evaluate((element) => element.tagName) === "SELECT") {
    await control.selectOption({ label: value });
  } else {
    await control.fill(value);
  }
}

async function continueMtm(page) {
  await page.locator(".customer-mtm-sticky-actions .customer-mobile-primary-button").click();
}

async function expectUploadError(input, file, expectedText) {
  await input.setInputFiles(file);
  await input.locator("xpath=ancestor::label[1]").getByText(expectedText, { exact: false }).waitFor({ state: "visible" });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  if (process.env.NEVARI_TEST_MOCK_AUTH === "1") {
    await page.route("**/api/nevari-proxy?**", async (route) => {
      const url = new URL(route.request().url());
      const apiPath = url.searchParams.get("path") || "";
      if (apiPath === "/auth/login") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { expires_in: 3600, user: { id: 1, display_name: "MTM Test Patient", roles: ["customer"] } } }) });
      }
      if (apiPath === "/subscriptions/me") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { status: "active", plan_key: "nevari_access_pro", tier: "pro", is_paid: true, can_access_therapy_management: true, free_consultations_remaining: 3, entitlements: ["therapy_management", "refills"] } }) });
      }
      if (apiPath === "/subscriptions/me/history") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { items: [], page: 1, per_page: 50, total: 0, total_pages: 1 } }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {} }) });
    });
  }

  try {
    await page.goto(BASE_URL + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await setSession(page);
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.getByText("Welcome back", { exact: false }).first().waitFor({ state: "visible", timeout: 60000 });

    const reminderOverlay = page.locator(".customer-profile-reminder-overlay");
    await reminderOverlay.waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    if (await reminderOverlay.count()) {
      await page.locator(".customer-profile-reminder-secondary").click({ force: true });
      await reminderOverlay.waitFor({ state: "detached" });
    }

    if (VIEWPORT_WIDTH >= 960) {
      await page.getByText("Medication Therapy Management", { exact: true }).first().click();
    } else {
      await page.getByRole("button", { name: "Open menu" }).first().click();
      await page.locator(".customer-mobile-drawer-item").filter({ hasText: "Medication Therapy Management" }).click();
    }
    const requestTab = page.locator(".customer-mobile-pill-tab").filter({ hasText: /^Request$/ });
    await page.waitForTimeout(1000);
    await requestTab.click({ force: true });
    await page.locator(".customer-mtm-mobile-flow").waitFor({ state: "visible", timeout: 5000 }).catch(async () => requestTab.click({ force: true }));
    await page.locator(".customer-mtm-mobile-flow").waitFor({ state: "visible" });
    await page.getByText(/Step 1 of 6/).first().waitFor({ state: "visible" });
    await page.waitForTimeout(500);

    await fillField(page, "Name:", "Nevari MTM Validation Patient");
    await fillField(page, "Age", "35");
    await fillField(page, "DOB", "1991-01-01");
    await fillField(page, "Gender", "Female");
    await fillField(page, "Address", "12 Test Avenue, Lagos");
    await fillField(page, "Phone Number", "08012345678");
    await fillField(page, "Preferred Contact Method", "Email");
    await continueMtm(page);
    await page.getByText(/Step 2 of 6/).first().waitFor({ state: "visible" });

    if (CONSENT_YES_CHECK) {
      await fillField(page, "Caregiver / Next of Kin Name", "Test Caregiver");
      await fillField(page, "Relationship", "Sibling");
      await fillField(page, "Phone Number", "08023456789");
      await fillField(page, "Consent to Discuss Care", "Yes");
      await continueMtm(page);
      await page.getByText(/Step 3 of 6/).first().waitFor({ state: "visible" });
      await fillField(page, "Primary Diagnosis", "Hypertension");
      await fillField(page, "Past Medical History", "Routine follow-up");
      await page.locator("#mtm-chronic-conditions").fill("Hypertension,");
      await page.locator("#mtm-drugAllergies").fill("Penicillin,");
      await continueMtm(page);
      await page.getByText(/Step 4 of 6/).first().waitFor({ state: "visible" });
      assert(await page.getByRole("button", { name: /Add another medication/i }).count() === 1, "Add another medication CTA is missing.");
      await page.screenshot({ path: `temp/playwright-customer-verify/mtm-consent-yes-${VIEWPORT_WIDTH}-success.png`, fullPage: true });
      console.log(JSON.stringify({ ok: true, consentYesRetainedFullFlow: true, addAnotherMedicationVisible: true }, null, 2));
      return;
    }

    await fillField(page, "Consent to Discuss Care", "No");
    await continueMtm(page);
    await page.getByText("Review your MTM assessment", { exact: true }).waitFor({ state: "visible" });
    assert(await page.getByText(/Step 3 of 6/).count() === 0, "Consent No did not skip clinical history.");
    assert(await page.getByText("Clinical history", { exact: true }).count() === 0, "Skipped clinical history remained in review.");
    assert(await page.getByText("Medication documents", { exact: true }).count() === 0, "Skipped medication documents remained in review.");
    assert(await page.getByText("Adherence", { exact: true }).count() === 0, "Skipped adherence remained in review.");
    await page.getByRole("button", { name: "Go Back" }).click();
    await page.getByText(/Step 2 of 6/).first().waitFor({ state: "visible" });
    await continueMtm(page);
    await page.getByText("Review your MTM assessment", { exact: true }).waitFor({ state: "visible" });
    assert(!(await page.locator("body").innerText()).includes("MTM images must be PNG"), "The review step still displayed the server MTM image validation message.");
    assert(await page.getByText(/Step 6 of 6 - Review Details/).count() === 1, "Step six was not renamed to Review Details.");
    assert(await page.getByRole("button", { name: "Select Availability" }).count() === 1, "The Select Availability CTA is missing.");
    assert(await page.getByRole("button", { name: "Submit MTM Assessment" }).count() === 0, "The old submit CTA is still visible.");

    let submittedPayload = null;
    await page.route("**/api/mtm/submit?**", async (route) => {
      submittedPayload = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            request: {
              id: 999999,
              customer_user_id: 1,
              status: "submitted",
              request_reference: "MTM-TEST-999999",
              assigned_pharmacist_user_id: 0,
              assigned_pharmacist_name: "",
              payment: { state: NON_PRO_FLOW ? "pending" : "quota_reserved", required: NON_PRO_FLOW },
              slot_reservation: { state: "unreserved", start_at: null },
            },
            payment_decision: NON_PRO_FLOW ? { payment_required: true, payment_state: "pending", currency: "NGN", fee: 25000, payment_url: "https://example.test/pay", next_action: "pay" } : { payment_required: false, payment_state: "quota_reserved", quota_remaining: 3, next_action: "select_slot" },
            pdf_snapshot: {
              fingerprint: "a".repeat(64),
              token: "playwright-test-token",
              issued_at: Date.now(),
              expires_at: Date.now() + 60000,
            },
          },
        }),
      });
    });
    await page.route("**/api/nevari-proxy?**", async (route) => {
      const url = new URL(route.request().url());
      const apiPath = url.searchParams.get("path") || "";
      if (apiPath === "/mtm-requests/999999/booking-context") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { mtm_request_id: 999999, assignment_state: "pending_selection", pharmacist_id: 0, pharmacist_name: "", payment_required: NON_PRO_FLOW, payment_state: NON_PRO_FLOW ? "pending" : "quota_reserved", payment_url: NON_PRO_FLOW ? "https://example.test/pay" : null, currency: "NGN", fee: NON_PRO_FLOW ? 25000 : 0, quota_remaining: NON_PRO_FLOW ? 0 : 3, slot_state: "unreserved", next_action: "select_slot", available_slots: [{ start_at: "2026-07-25T09:00:00Z", end_at: "2026-07-25T09:30:00Z" }] } }) });
      }
      if (apiPath === "/mtm-requests/999999/reserve-slot") {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { request: { id: 999999, customer_user_id: 1, status: "under_review", request_reference: "MTM-TEST-999999", assigned_pharmacist_user_id: 44, assigned_pharmacist_name: "Test Pharmacist", payment: { state: NON_PRO_FLOW ? "pending" : "quota_reserved", required: NON_PRO_FLOW }, slot_reservation: { state: NON_PRO_FLOW ? "reserved_pending_payment" : "reserved", start_at: "2026-07-25T09:00:00Z", end_at: "2026-07-25T09:30:00Z", hold_expires_at: NON_PRO_FLOW ? "2026-07-22T22:59:59Z" : null } }, payment_decision: NON_PRO_FLOW ? { payment_required: true, payment_state: "pending", currency: "NGN", fee: 25000, payment_url: "https://example.test/pay", next_action: "pay" } : { payment_required: false, payment_state: "quota_reserved", next_action: "select_slot" }, next_action: NON_PRO_FLOW ? "pay" : "success" } }) });
      }
      return route.continue();
    });
    await page.route("**/api/mtm/999999/submission-pdf?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { request: { id: 999999 } } }) }));
    await page.getByRole("button", { name: "Select Availability" }).click();
    await page.getByText("Choose your preferred time", { exact: true }).waitFor({ state: "visible", timeout: 120000 });
    assert(await page.getByRole("button", { name: "Confirm Availability" }).count() === 1, "Confirm Availability CTA is missing.");
    assert(await page.getByRole("button", { name: "Go Back" }).count() >= 1, "Availability Go Back CTA is missing.");
    const calendarSurfaces = await page.locator(".customer-mtm-availability-screen .appointment-surface-card, .customer-mtm-availability-screen .appointment-summary-card").evaluateAll((nodes) => nodes.map((node) => ({ image: getComputedStyle(node).backgroundImage, color: getComputedStyle(node).backgroundColor })));
    assert(calendarSurfaces.length === 2 && calendarSurfaces.every((surface) => surface.image === "none" && surface.color === "rgb(255, 255, 255)"), "MTM availability cards are not flat white surfaces.");
    await page.locator(".appointment-slot-button").first().click();
    await page.getByRole("button", { name: "Confirm Availability" }).click();
    await page.getByText("Finding available Pharmacists", { exact: true }).last().waitFor({ state: "visible" });
    if (NON_PRO_FLOW) {
      await page.getByText("Procees to payment", { exact: true }).waitFor({ state: "visible", timeout: 120000 });
      await page.getByRole("link", { name: "Continue to payment" }).waitFor({ state: "visible" });
    } else {
      await page.getByText("MTM availability selected successfully", { exact: false }).waitFor({ state: "visible", timeout: 120000 });
    }
    assert(submittedPayload && submittedPayload.emergency_contact.consentToDiscussCare === "No", "Submission did not preserve consent No.");
    assert(submittedPayload.attachments.length === 0, "Consent No submission retained attachments.");
    assert(Object.keys(submittedPayload.medical_history).length === 0, "Consent No submission retained clinical history.");
    assert(Object.keys(submittedPayload.medication_profile).length === 0, "Consent No submission retained medication details.");
    await page.screenshot({ path: `temp/playwright-customer-verify/mtm-availability-${VIEWPORT_WIDTH}-success.png`, fullPage: true });

    console.log(JSON.stringify({
      ok: true,
      consentNoSkippedClinicalSections: true,
      submissionSucceeded: true,
      availabilitySelected: true,
      paymentMode: NON_PRO_FLOW ? "non_pro" : "pro",
    }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `temp/playwright-customer-verify/mtm-availability-${VIEWPORT_WIDTH}-failure.png`, fullPage: true }).catch(() => {});
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      url: page.url(),
      text: (await page.locator("body").innerText().catch(() => "")).slice(0, 1800),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
