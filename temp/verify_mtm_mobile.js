const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));
const { PDFDocument } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "pdf-lib"));

const BASE_URL = "http://localhost:3001";
const USERNAME = process.env.NEVARI_TEST_PATIENT_USERNAME || "Ncustomer";
const PASSWORD = process.env.NEVARI_TEST_PATIENT_PASSWORD || "Ncustomer@2026!!!";
const BACKEND_URL = "https://nevarihealth.com";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

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
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Nevari-Frontend-Type": "patient_dashboard", "X-Nevari-Frontend-Origin": window.location.origin },
      body: JSON.stringify({ username, password, frontend_type: "patient_dashboard", frontend_origin: window.location.origin, frontend_url: `${window.location.origin}/dashboard`, global_two_step_verification: false, two_factor_required: false, require_verification: false, require_otp: false }),
    });
    return { ok: response.ok, status: response.status, retryAfter: response.headers.get("retry-after"), payload: await response.json().catch(() => null) };
  }, { username: USERNAME, password: PASSWORD, backendUrl: BACKEND_URL });
  if (result.status === 429) {
    assert(attempt < 2, "Patient login remained rate-limited after bounded retries.");
    const delay = Math.min(60, Math.max(5, Number(result.retryAfter || 15)));
    await page.waitForTimeout(delay * 1000);
    return setSession(page, attempt + 1);
  }
  assert(result.ok && result.payload?.success, `Patient login failed with status ${result.status}.`);
  const data = result.payload.data;
  await page.evaluate(({ data, backendUrl }) => {
    const roles = Array.isArray(data.user?.roles) ? data.user.roles : [];
    localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({ baseUrl: backendUrl, frontendType: "patient_dashboard", frontendOrigin: location.origin, frontendUrl: `${location.origin}/dashboard`, paired: true, accessToken: "server-session", refreshToken: "server-session", expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000, user: { ...data.user, roles } }));
  }, { data, backendUrl: BACKEND_URL });
}

async function fillField(page, labelText, value) {
  const field = page.locator("label.customer-mobile-field").filter({ hasText: labelText }).first();
  await field.scrollIntoViewIfNeeded();
  const control = field.locator("input:not([type=file]), textarea, select").last();
  const tag = await control.evaluate((element) => element.tagName);
  if (tag === "SELECT") await control.selectOption({ label: value });
  else await control.fill(value);
}

async function continueMtm(page) {
  await page.locator(".customer-mtm-sticky-actions .customer-mobile-primary-button").click();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`PAGE_ERROR: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") console.error(`BROWSER_ERROR: ${message.text()}`); });
  page.setDefaultTimeout(30000);
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await setSession(page);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.getByText("Welcome back", { exact: false }).first().waitFor({ state: "visible", timeout: 60000 });
    const reminderButton = page.locator(".customer-profile-reminder-secondary");
    await page.locator(".customer-profile-reminder-overlay").waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    if (await page.locator(".customer-profile-reminder-overlay").count()) {
      await reminderButton.waitFor({ state: "attached" });
      await reminderButton.click({ force: true });
      await page.locator(".customer-profile-reminder-overlay").waitFor({ state: "detached" });
    }
    await page.getByRole("button", { name: "Open menu" }).first().click();
    await page.locator(".customer-mobile-drawer-item").filter({ hasText: "Medication Therapy Management" }).click();
    const requestTab = page.locator(".customer-mobile-pill-tab").filter({ hasText: /^Request$/ });
    await page.waitForTimeout(1000);
    await requestTab.click({ force: true });
    await page.locator(".customer-mtm-mobile-flow").waitFor({ state: "visible", timeout: 5000 }).catch(async () => requestTab.click({ force: true }));
    await page.locator(".customer-mtm-mobile-flow").waitFor({ state: "visible" });
    await page.getByText(/Step 1 of 6/).first().waitFor({ state: "visible" });

    const controlMetrics = await page.locator(".customer-mobile-field input:not([type=file]), .customer-mobile-field select").evaluateAll((controls) => controls.slice(0, 10).map((control) => ({ fontSize: getComputedStyle(control).fontSize, height: control.getBoundingClientRect().height, hint: control.getAttribute("enterkeyhint") })));
    assert(controlMetrics.length > 0 && controlMetrics.every((item) => parseFloat(item.fontSize) >= 16), "A mobile field is below 16px and may zoom on iOS.");
    assert(controlMetrics.every((item) => item.height >= 47.5), `A mobile field or dropdown is materially shorter than 48px: ${JSON.stringify(controlMetrics)}`);
    assert(controlMetrics.every((item) => item.hint === "next"), "A single-line field is missing enterkeyhint=next.");

    await fillField(page, "Name:", "Nevari MTM Test Patient");
    await fillField(page, "Age", "35");
    await fillField(page, "DOB", "1991-01-01");
    await fillField(page, "Gender", "Female");
    await fillField(page, "Address", "12 Test Avenue, Lagos");
    await fillField(page, "Phone Number", "08012345678");
    await fillField(page, "Preferred Contact Method", "Email");
    await continueMtm(page);
    await page.waitForTimeout(1500);
    if (!await page.getByText(/Step 2 of 6/).count()) {
      const state = await page.locator("label.customer-mobile-field").evaluateAll((labels) => labels.map((label) => ({ label: label.querySelector("span")?.textContent, value: label.querySelector("input,select")?.value, error: label.querySelector("small")?.textContent })).filter((item) => item.error || !item.value));
      throw new Error(`Step 1 did not validate: ${JSON.stringify(state)}`);
    }

    await fillField(page, "Caregiver / Next of Kin Name", "Test Caregiver");
    await fillField(page, "Relationship", "Sibling");
    await fillField(page, "Phone Number", "08012345679");
    await fillField(page, "Email Address", "caregiver@example.com");
    await fillField(page, "Consent to Discuss Care", "Yes");
    await continueMtm(page);

    await fillField(page, "Primary Diagnosis", "Hypertension");
    await fillField(page, "Past Medical History", "Routine follow-up");
    const chronicInput = page.locator("#mtm-chronic-conditions");
    await chronicInput.fill("Hypertension,");
    const allergyInput = page.locator("#mtm-drugAllergies");
    assert(await allergyInput.getAttribute("placeholder") === "enter a drug allegy followed by a comma", "Drug allergy placeholder is incorrect.");
    await allergyInput.fill("Penicillin,");
    await page.locator("#mtm-drugIntolerances").fill("Codeine,");
    assert(await page.locator(".customer-mtm-token", { hasText: "Penicillin" }).count() === 1, "Token input did not create a chip.");
    const labInput = page.locator("input[type=file]").first();
    await labInput.setInputFiles({ name: "lab-result.png", mimeType: "image/png", buffer: PNG });
    await continueMtm(page);

    assert(await page.locator(".customer-mtm-floating-add-dock").count() === 0, "Floating Add Medication control is still present.");
    const medicationFile = page.locator(".customer-mtm-medication-group input[type=file]").first();
    await medicationFile.setInputFiles({ name: "current-medication.png", mimeType: "image/png", buffer: PNG });
    await fillField(page, "Prescribing Doctor", "Dr Test Pharmacist");
    await fillField(page, "Notes", "Take as prescribed with food.");
    await page.getByRole("button", { name: "Add Medication" }).click();
    assert(await page.locator(".customer-mtm-medication-group").count() === 2, "Add Medication did not append a second group.");
    await page.locator(".customer-mtm-medication-group").nth(1).getByRole("button", { name: /Remove medication/ }).click();
    await page.locator("#mtm-reasonForDiscontinuation").fill("Side effects,");
    await page.locator("#mtm-otcMedications").fill("Paracetamol,");
    await page.locator("#mtm-herbalProducts").fill("Ginger,");
    await page.locator("#mtm-supplements").fill("Vitamin D,");
    await continueMtm(page);

    await page.locator(".customer-mobile-option-row").first().click();
    await continueMtm(page);
    await page.getByText("Review your MTM assessment", { exact: true }).waitFor({ state: "visible" });
    assert(await page.locator(".customer-mtm-review-card").count() >= 5, "Review step does not contain the expected grouped cards.");
    const actionGap = await page.locator(".customer-mtm-sticky-actions").evaluate((element) => getComputedStyle(element).gap);
    assert(actionGap === "8px", `CTA spacing is ${actionGap}, expected 8px.`);

    const popupPromise = page.waitForEvent("popup", { timeout: 30000 });
    await page.getByRole("button", { name: "Submit MTM Assessment" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded", { timeout: 90000 }).catch(() => {});
    await page.getByText("MTM assessment submitted successfully", { exact: false }).waitFor({ state: "visible", timeout: 120000 });
    const pdfFrame = popup.locator('iframe[title="Nevari MTM Assessment PDF"]');
    await pdfFrame.waitFor({ state: "attached", timeout: 30000 });
    const pdfUrl = await pdfFrame.getAttribute("src");
    assert(pdfUrl?.startsWith("blob:"), `Submitted PDF viewer does not contain a Blob URL: ${pdfUrl}`);
    const pdfBase64 = await popup.evaluate(async () => {
      const source = document.querySelector('iframe[title="Nevari MTM Assessment PDF"]')?.src;
      const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return btoa(binary);
    });
    const pdf = await PDFDocument.load(Buffer.from(pdfBase64, "base64"));
    assert(pdf.getPageCount() >= 6, `PDF has ${pdf.getPageCount()} pages; uploaded image pages were not appended.`);

    await page.screenshot({ path: "temp/playwright-customer-verify/mtm-mobile-review.png", fullPage: true });
    console.log(JSON.stringify({ ok: true, controls: controlMetrics.length, reviewCards: await page.locator(".customer-mtm-review-card").count(), pdfPages: pdf.getPageCount(), popupUrl: "blob:verified" }, null, 2));
  } catch (error) {
    await page.screenshot({ path: "temp/playwright-customer-verify/mtm-mobile-failure.png", fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ ok: false, error: error.message, url: page.url(), text: (await page.locator("body").innerText().catch(() => "")).slice(0, 1500) }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
