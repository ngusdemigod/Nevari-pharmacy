const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const requiredMarkup = [
    'className="staff-modal-overlay"',
    'className="staff-fullscreen-modal detail-flat-modal subscription-plan-details-modal"',
    'className="staff-modal-header subscription-plan-details-header"',
    'className="staff-modal-body subscription-plan-details-body"',
    'className="modal-actions subscription-plan-details-actions"',
    'aria-label="Close subscription details"'
  ];
  for (const marker of requiredMarkup) {
    if (!source.includes(marker)) throw new Error(`Missing shared modal template marker: ${marker}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.setContent(`
        <div class="staff-modal-overlay">
          <article class="staff-fullscreen-modal detail-flat-modal subscription-plan-details-modal" role="dialog" aria-modal="true">
            <header class="staff-modal-header subscription-plan-details-header">
              <div class="staff-modal-identity subscription-plan-details-identity">
                <span class="subscription-plan-details-avatar">NA</span>
                <div><p>Subscription plan</p><h2>Nevari Access Pro</h2><span>Managed subscription plan.</span></div>
              </div>
              <div class="subscription-plan-details-header-actions">
                <span class="chip success">Active</span>
                <button class="icon-button" aria-label="Close subscription details">×</button>
              </div>
            </header>
            <div class="staff-modal-body subscription-plan-details-body">
              <div class="segmented-mini nevari-storefront-tabs subscription-details-tabs"><button class="active">Details</button><button>Users</button></div>
              <section class="subscription-plan-details-section">
                <dl class="subscription-plan-details-grid"><div><dt>Price</dt><dd>NGN 1,000</dd></div><div><dt>Billing cycle</dt><dd>Monthly</dd></div></dl>
              </section>
            </div>
            <footer class="modal-actions subscription-plan-details-actions"><button class="subscription-details-pill subscription-details-pill-danger">Delete subscription plan</button></footer>
          </article>
        </div>
      `);
      await page.addStyleTag({ path: path.join(root, "app/globals.css") });

      const result = await page.locator(".subscription-plan-details-modal").evaluate((modal) => {
        const rect = modal.getBoundingClientRect();
        const style = getComputedStyle(modal);
        const overlay = getComputedStyle(modal.parentElement);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          radius: style.borderRadius,
          display: style.display,
          overlayPosition: overlay.position,
          overflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });
      if (result.display !== "flex" || result.overlayPosition !== "fixed" || result.overflow) {
        throw new Error(`Invalid Subscription modal template at ${width}px: ${JSON.stringify(result)}`);
      }
      if (width >= 768 && result.radius !== "30px") {
        throw new Error(`Subscription modal does not use shared desktop radius at ${width}px.`);
      }

      const closeSize = await page.locator('[aria-label="Close subscription details"]').evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });
      if (closeSize.width < 40 || closeSize.height < 40) {
        throw new Error(`Subscription close target is too small at ${width}px: ${JSON.stringify(closeSize)}`);
      }

      console.log(`${width}px`, JSON.stringify({ result, closeSize }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
