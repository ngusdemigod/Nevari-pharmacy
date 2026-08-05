const fs = require("fs");
const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const appSource = fs.readFileSync(path.resolve(__dirname, "../NevariAdmin Storefront/app/admin/storefront/page.js"), "utf8");
const stylesheetPath = path.resolve(__dirname, "../NevariAdmin Storefront/app/globals.css");
const fixture = `
  <main class="app-modal-layer">
    <article class="subscription-plan-details-modal">
      <header class="subscription-plan-details-header">
        <div class="subscription-plan-details-identity">
          <span class="subscription-plan-details-avatar">NP</span>
          <div><p>Subscription plan</p><h2>Nevari Pro</h2><span>Managed Nevari subscription plan.</span></div>
        </div>
        <div class="subscription-plan-details-header-actions"><span class="chip success">Active</span><button class="subscription-details-pill subscription-details-pill-secondary">Close details</button></div>
      </header>
      <div class="subscription-plan-details-body">
        <div class="segmented-mini nevari-storefront-tabs subscription-details-tabs"><button class="active">Details</button><button>Users</button></div>
        <section class="subscription-plan-details-section">
          <dl class="subscription-plan-details-grid">
            <div><dt>Price</dt><dd class="subscription-inline-price">NGN 30,000 <button class="subscription-inline-edit-button">Edit</button></dd></div><div><dt>Billing cycle</dt><dd>Monthly</dd></div><div><dt>Subscribed users</dt><dd>16</dd></div>
            <div><dt>Gateway/source</dt><dd>Paystack</dd></div><div><dt>Plan key</dt><dd>nevari-pro</dd></div><div><dt>Checkout type</dt><dd>Auto generated</dd></div>
          </dl>
        </section>
      </div>
      <footer class="subscription-plan-details-actions">
        <button class="subscription-details-pill subscription-details-pill-danger"><span class="nevari-branded-spinner staff-button-spinner"></span><span>Deleting...</span></button>
      </footer>
    </article>
  </main>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const width of [375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(fixture);
    await page.addStyleTag({ path: stylesheetPath });
    const result = await page.evaluate(() => {
      const modal = document.querySelector(".subscription-plan-details-modal");
      const avatar = document.querySelector(".subscription-plan-details-avatar");
      const actions = [...document.querySelectorAll(".subscription-plan-details-actions button")];
      const style = getComputedStyle(modal);
      return {
        background: style.backgroundColor,
        shadow: style.boxShadow,
        avatarRadius: getComputedStyle(avatar).borderRadius,
        fullscreen: modal.getBoundingClientRect().width === innerWidth && modal.getBoundingClientRect().height === innerHeight,
        textPills: actions.every((button) => button.textContent.trim() && !button.querySelector("svg") && parseFloat(getComputedStyle(button).borderRadius) >= 20),
        visibleSpinners: [...document.querySelectorAll(".subscription-plan-details-actions .nevari-branded-spinner")].every((spinner) => spinner.getBoundingClientRect().width > 0),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    results.push({ width, ...result });
    await page.screenshot({ path: `NevariAdmin Storefront/temp/subscription-details-modal-portalled-${width}.png`, fullPage: true });
    await page.close();
  }

  await browser.close();
  const sourceChecks = {
    portalledToDocumentBody: appSource.includes("subscriptionDetailsOpen && selectedSubscriptionPlan && typeof document") && appSource.includes("document.body"),
    detailsAndUsersTabsPresent: appSource.includes('aria-label="Subscription plan sections"'),
    refreshButtonRemoved: !appSource.includes("Refresh details"),
    editButtonRemoved: !appSource.includes("Edit subscription plan"),
    inlinePriceEditPresent: appSource.includes('aria-label="Edit subscription price"'),
    rowOpensDetails: appSource.includes("openSubscriptionDetails(plan)"),
    inlineDetailsPanelRemoved: !appSource.includes('className="panel subscription-details-panel"'),
  };
  process.stdout.write(`${JSON.stringify({ sourceChecks, results }, null, 2)}\n`);
  const failed = Object.values(sourceChecks).some((value) => !value) || results.some((result) => (
    result.background !== "rgb(255, 255, 255)"
    || result.shadow !== "none"
    || result.avatarRadius !== "50%"
    || !result.fullscreen
    || !result.textPills
    || !result.visibleSpinners
    || result.horizontalOverflow
  ));
  if (failed) process.exit(1);
})();
