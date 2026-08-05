const { chromium } = require("playwright");
const path = require("path");

const filterButtons = (labels) => labels.map((label) => `<button class="filter-btn">${label}</button>`).join("");

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="page-view active filter-test-page">
            <section class="table-panel dashboard-table-shell orders-table-shell filter-test-section">
              <div class="panel-header"><div><h2>Orders</h2></div><div class="toolbar"><div class="filter-bar order-queue-tabs">${filterButtons(["All", "Needs RX", "Awaiting payment"])}</div></div></div>
            </section>
            <section class="table-panel dashboard-table-shell payments-table-shell filter-test-section">
              <div class="panel-header"><div><h2>Payments</h2></div><div class="toolbar"><div class="filter-bar">${filterButtons(["All", "Completed", "Pending", "Failed", "Refunded"])}</div></div></div>
            </section>
            <section class="table-panel dashboard-table-shell products-table-shell filter-test-section">
              <div class="panel-header products-panel-header"><div><h2>Products</h2></div><div class="filter-bar products-segmented-bar">${filterButtons(["All products", "Categories"])}</div></div>
              <div class="filter-bar products-filter-bar">${filterButtons(["All", "Published", "Draft", "In stock", "Out of stock"])}</div>
            </section>
            <section class="subscription-surface filter-test-section">
              <h2>Subscriptions</h2>
              <div class="users-toolbar"><div class="segmented-mini">${filterButtons(["All", "Active", "Past due"])}</div></div>
            </section>
            <section class="panel audit-panel filter-test-section">
              <div class="panel-header audit-header"><div><h2>Audit center</h2></div><div class="toolbar"><label>Status<select><option>All</option></select></label><label>Source<select><option>All</option></select></label></div></div>
              <div class="audit-tabs">${filterButtons(["Orders", "Payments", "Security"])}</div>
            </section>
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });
      await page.addStyleTag({ content: `
        body { margin: 0; }
        .filter-test-page { padding: 20px; }
        .filter-test-section { width: 100%; }
      ` });

      const offsets = await page.locator(".filter-test-section").evaluateAll((sections) => sections.flatMap((section) => {
        const headingLeft = section.querySelector("h2")?.getBoundingClientRect().left ?? section.getBoundingClientRect().left;
        return Array.from(section.querySelectorAll(":scope > .filter-bar, :scope > .users-toolbar > .segmented-mini, :scope > .audit-tabs, :scope > .panel-header > .filter-bar, :scope > .panel-header > .toolbar"))
          .map((filter) => ({
            section: section.querySelector("h2")?.textContent || "Unknown",
            offset: Math.round(filter.getBoundingClientRect().left - headingLeft)
          }));
      }));

      const misaligned = offsets.filter(({ offset }) => Math.abs(offset) > 1);
      if (misaligned.length) {
        throw new Error(`Right-aligned filters at ${width}px: ${JSON.stringify(misaligned)}`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) {
        throw new Error(`Filter groups create page overflow at ${width}px.`);
      }

      console.log(`${width}px`, JSON.stringify(offsets));
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
