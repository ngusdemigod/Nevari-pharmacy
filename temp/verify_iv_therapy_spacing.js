const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const stylesheetPath = path.resolve(__dirname, "../NevariAdmin Storefront/app/globals.css");
const fixture = `
  <main class="nevari-admin-storefront">
    <section class="page-view active iv-therapy-page" style="min-height:800px">
      <section class="operations-grid mtm-summary-row" data-testid="metrics">
        <article class="panel compact mtm-summary-panel">
          <div class="mini-stat-grid mtm-summary-grid">
            <div class="mini-stat"><span>Total</span><strong>0</strong><small>tracked IV therapy requests</small></div>
            <div class="mini-stat"><span>Submitted</span><strong>0</strong><small>awaiting staff review</small></div>
            <div class="mini-stat"><span>Consented</span><strong>0</strong><small>customers approved treatment</small></div>
            <div class="mini-stat"><span>Therapy types</span><strong>0</strong><small>distinct request categories</small></div>
          </div>
        </article>
      </section>
      <section class="operations-grid mtm-registry-row" data-testid="registry">
        <section class="table-panel dashboard-table-shell mtm-table-shell mtm-table-panel">
          <div class="panel-header"><div><h2>All customer IV therapy requests</h2></div></div>
          <div class="table-scroll"><table><tbody><tr><td>No requests</td></tr></tbody></table></div>
        </section>
      </section>
    </section>
  </main>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const width of [375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(fixture);
    await page.addStyleTag({ path: stylesheetPath });
    const measurement = await page.evaluate(() => {
      const metrics = document.querySelector('[data-testid="metrics"]').getBoundingClientRect();
      const metricsGrid = document.querySelector(".mtm-summary-grid").getBoundingClientRect();
      const metricsPanel = document.querySelector(".mtm-summary-panel").getBoundingClientRect();
      const registry = document.querySelector('[data-testid="registry"]').getBoundingClientRect();
      return {
        gap: Math.round((registry.top - metrics.bottom) * 100) / 100,
        visualGap: Math.round((registry.top - metricsGrid.bottom) * 100) / 100,
        rowHeight: Math.round(metrics.height * 100) / 100,
        panelHeight: Math.round(metricsPanel.height * 100) / 100,
        gridHeight: Math.round(metricsGrid.height * 100) / 100,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    results.push({ width, ...measurement });
    await page.screenshot({ path: `temp/iv-therapy-spacing-${width}.png`, fullPage: true });
    await page.close();
  }

  await browser.close();
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (results.some((result) => result.visualGap !== 24 || result.horizontalOverflow)) process.exit(1);
})();
