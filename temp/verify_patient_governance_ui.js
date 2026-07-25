const fs = require("fs");
const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "NevariAdmin Storefront/app/admin/storefront/page.js"), "utf8");
const staffSource = fs.readFileSync(path.join(root, "NevariAdmin Storefront/app/components/StaffDirectory.js"), "utf8");
const resetSource = fs.readFileSync(path.join(root, "NevariAdmin Storefront/app/reset-password/page-client.js"), "utf8");
const governanceSource = fs.readFileSync(path.join(root, "nevari-pharmacy-core/includes/class-nevari-user-governance.php"), "utf8");
const authSource = fs.readFileSync(path.join(root, "nevari-pharmacy-core/includes/class-nevari-auth.php"), "utf8");
const roleProxySource = fs.readFileSync(path.join(root, "NevariAdmin Storefront/app/api/admin/customers/[customerId]/privilege-escalation/route.js"), "utf8");
const stylesheetPath = path.join(root, "NevariAdmin Storefront/app/globals.css");

const fixture = `
  <main class="nevari-admin-storefront" style="min-height:100vh;padding:24px;background:#fff">
    <section class="panel table-panel admin-flat-table-section">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Patient</th><th>Actions</th></tr></thead>
          <tbody><tr><td>Patient One</td><td><div class="staff-row-actions">
            <button id="ban-action" class="staff-action-icon" type="button" data-tooltip="Ban"><svg viewBox="0 0 24 24"><path d="M5 5l14 14"/></svg></button>
            <button id="suspend-action" class="staff-action-icon" type="button" data-tooltip="Suspend"><svg viewBox="0 0 24 24"><path d="M9 8l6 8"/></svg></button>
            <button id="reset-action" class="staff-action-icon" type="button" data-tooltip="Reset password"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2 5"/></svg></button>
          </div></td></tr></tbody>
        </table>
      </div>
    </section>
    <section class="customer-detail-popup admin-surface-modal" style="position:relative;margin:24px auto 0">
      <div class="customer-detail-grid">
        <div class="detail-item-card customer-detail-wide patient-governance-card">
          <strong>Account actions</strong>
          <span class="muted">Manage this patient’s dashboard access or send a secure password reset link.</span>
          <div class="patient-governance-actions">
            <button class="pill-button danger">Ban patient</button>
            <button class="pill-button danger">Suspend patient</button>
            <button class="pill-button"><span class="nevari-branded-spinner staff-button-spinner"></span><span>Reset password</span></button>
          </div>
        </div>
      </div>
    </section>
    <article class="customer-privilege-auth-modal auth-screen-card" style="position:relative;margin:24px auto 0">
      <div class="auth-form auth-reference-form auth-otp-form">
        <div class="auth-otp-card">
          <h2 class="auth-otp-title">Approve Upgrade</h2>
          <input class="auth-otp-hidden-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Role change verification code" />
          <div class="auth-otp-boxes" role="group" aria-label="Role change verification code digits">
            ${Array.from({ length: 6 }, (_, index) => `<button class="auth-otp-box" aria-label="Digit ${index + 1}"></button>`).join("")}
          </div>
          <p class="customer-privilege-otp-status">OTP sent to ig********@gmail.com.</p>
          <div class="customer-privilege-otp-actions">
            <button class="pill-button">Cancel</button>
            <button class="auth-primary-button auth-otp-submit"><span class="nevari-branded-spinner staff-button-spinner"></span><span>Approving...</span></button>
          </div>
        </div>
      </div>
    </article>
  </main>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const responsive = [];
  for (const width of [375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.setContent(fixture);
    await page.addStyleTag({ path: stylesheetPath });
    await page.locator("#ban-action").evaluate((button) => {
      button.innerHTML = '<span class="nevari-branded-spinner staff-icon-spinner" aria-hidden="true"></span>';
      button.disabled = true;
    });
    const result = await page.evaluate(() => {
      const modal = document.querySelector(".customer-privilege-auth-modal");
      const otpBoxes = [...document.querySelectorAll(".auth-otp-box")];
      const detailButtons = [...document.querySelectorAll(".patient-governance-actions button")];
      const clicked = document.querySelector("#ban-action");
      return {
        width: window.innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        modalBackground: getComputedStyle(modal).backgroundColor,
        modalShadow: getComputedStyle(modal).boxShadow,
        otpBoxCount: otpBoxes.length,
        otpBoxesVisible: otpBoxes.every((box) => box.getBoundingClientRect().width > 0),
        fullTextDetailActions: detailButtons.every((button) => button.textContent.trim().length > 0 && !button.querySelector("svg")),
        clickedSpinnerVisible: clicked.querySelector(".staff-icon-spinner")?.getBoundingClientRect().width > 0,
        untouchedButtonsKeepIcons: ["suspend-action", "reset-action"].every((id) => document.getElementById(id).querySelector("svg"))
      };
    });
    responsive.push(result);
    await page.close();
  }
  await browser.close();

  const sourceChecks = {
    roleUpdatesGovernance: governanceSource.includes("'managed_role' => $target_role") && governanceSource.includes("START TRANSACTION"),
    roleRevokesSessions: governanceSource.includes("self::revoke_sessions($target_id)"),
    targetAwarePermissions: governanceSource.includes("$required_permission = in_array($target_role, self::PATIENT_ROLES"),
    adminResetAvoidsWordPressFlow: governanceSource.includes("request_dashboard_password_reset_for_user") && !governanceSource.includes("retrieve_password("),
    resetLinkUsesFrontendType: authSource.includes("'frontend_type' => sanitize_key"),
    blockedUserCanCompleteReset: authSource.includes("if (!self::user_role_can_access_frontend($user"),
    resetScreenRoutesByFrontend: resetSource.includes("FRONTEND_BY_TYPE") && resetSource.includes("config.loginPath"),
    csrfRequiredForUpgrade: roleProxySource.includes('requestCookie(request, "nevari_csrf")') && roleProxySource.includes('"x-nevari-csrf"'),
    patientCacheOptimisticallyRemovesUpgrade: pageSource.includes("items.filter((item) => String(item.user_id || item.id) !== upgradedUserId"),
    bothGovernedScopesRevalidate: pageSource.includes("globalMutate(isGovernedUsersKey"),
    patientDetailActionsPresent: pageSource.includes("patient-governance-actions") && pageSource.includes('patientDetailActionButton("reset-password"'),
    rowButtonsUsePressedSpinner: pageSource.includes("tableActionLoading === `patient-${userId}-${action}`") && staffSource.includes("staff-icon-spinner"),
    otpReusesAuthTemplate: pageSource.includes("auth-form auth-reference-form auth-otp-form") && pageSource.includes("auth-otp-boxes"),
    otpModalIsMinimal: pageSource.includes('"Approve Upgrade"')
      && !pageSource.includes("customer-privilege-otp-copy")
      && !pageSource.includes("customer-privilege-otp-topbar")
      && !pageSource.includes("Recipient: {customerPrivilegeOtp.maskedEmail")
  };

  const failedResponsive = responsive.some((item) => item.horizontalOverflow
    || item.modalBackground !== "rgb(255, 255, 255)"
    || item.modalShadow !== "none"
    || item.otpBoxCount !== 6
    || !item.otpBoxesVisible
    || !item.fullTextDetailActions
    || !item.clickedSpinnerVisible
    || !item.untouchedButtonsKeepIcons);
  const failedSource = Object.values(sourceChecks).some((value) => !value);
  process.stdout.write(`${JSON.stringify({ sourceChecks, responsive }, null, 2)}\n`);
  if (failedResponsive || failedSource) process.exit(1);
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
