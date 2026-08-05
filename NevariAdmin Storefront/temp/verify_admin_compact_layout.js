const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="page-view active">
            <div class="admin-metric-grid">
              ${Array.from({ length: 4 }, (_, index) => `<article class="admin-metric-card admin-metric-card-blue">Metric ${index + 1}</article>`).join("")}
            </div>
            <section class="table-panel dashboard-table-shell orders-table-shell">
              <div class="panel-header">
                <div><h2>Orders</h2></div>
                <div class="toolbar"><div class="filter-bar order-queue-tabs"><button>All</button><button>Pending</button></div></div>
              </div>
              <div class="table-scroll">
                <table><tbody><tr>
                  <td><span class="status-pill success">Active</span></td>
                  <td><span class="status-pill error">Suspended</span></td>
                  <td><span class="status-pill error">Banned</span></td>
                  <td>
                    <button class="staff-action-icon patient-action-button patient-action-ban">B</button>
                    <button class="staff-action-icon patient-action-button patient-action-suspend">S</button>
                    <button class="staff-action-icon patient-action-button patient-action-reset-password">R</button>
                  </td>
                </tr></tbody></table>
              </div>
            </section>
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });

      const layout = await page.evaluate(() => {
        const metrics = document.querySelector(".admin-metric-grid").getBoundingClientRect();
        const details = document.querySelector(".orders-table-shell").getBoundingClientRect();
        const heading = document.querySelector(".orders-table-shell h2").getBoundingClientRect();
        const filters = document.querySelector(".order-queue-tabs").getBoundingClientRect();
        const style = (selector) => {
          const computed = getComputedStyle(document.querySelector(selector));
          return { color: computed.color, background: computed.backgroundColor, border: computed.borderColor };
        };

        return {
          sectionGap: Math.round(details.top - metrics.bottom),
          filterOffset: Math.round(filters.left - heading.left),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          active: style(".status-pill.success"),
          suspended: style(".status-pill.error"),
          ban: style(".patient-action-ban"),
          suspend: style(".patient-action-suspend"),
          reset: style(".patient-action-reset-password")
        };
      });

      if (layout.sectionGap > 16 || layout.sectionGap < 0) {
        throw new Error(`Unexpected section gap at ${width}px: ${JSON.stringify(layout)}`);
      }
      if (Math.abs(layout.filterOffset) > 1) {
        throw new Error(`Filters are not left aligned at ${width}px: ${JSON.stringify(layout)}`);
      }
      if (layout.overflow) {
        throw new Error(`Layout overflows at ${width}px.`);
      }
      if (layout.active.background === layout.suspended.background) {
        throw new Error(`Patient statuses are not differentiated at ${width}px.`);
      }
      if (new Set([layout.ban.background, layout.suspend.background, layout.reset.background]).size !== 3) {
        throw new Error(`Patient actions are not differentiated at ${width}px.`);
      }
      if ([layout.ban, layout.suspend].some((tone) => tone.background === tone.color)) {
        throw new Error(`Patient action uses a solid fill at ${width}px.`);
      }

      console.log(`${width}px`, JSON.stringify(layout));
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
