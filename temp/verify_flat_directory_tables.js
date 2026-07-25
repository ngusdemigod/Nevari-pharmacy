const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const stylesheetPath = path.resolve(__dirname, "../NevariAdmin Storefront/app/globals.css");
const table = (label, tableClass = "table-scroll") => `
  <div class="${tableClass}" data-table="${label}">
    <table><thead><tr><th>Reference</th><th>Status</th></tr></thead><tbody><tr><td>${label}</td><td>Active</td></tr></tbody></table>
  </div>
`;
const section = (label, extraClass = "") => `
  <section class="panel table-panel admin-flat-table-section ${extraClass}" data-outer="${label}">
    <div class="panel-header"><div><h2>${label}</h2><p>Directory description</p></div></div>
    ${table(label)}
  </section>
`;
const fixture = `
  <main class="nevari-admin-storefront" style="display:grid;gap:32px">
    ${section("Nurse Requests")}
    ${section("Consultations", "consultation-directory-panel")}
    ${section("Staff", "staff-directory-panel")}
    ${section("Patients", "patient-directory-panel")}
    <section class="page-view active subscriptions-page">
      <section class="subscription-surface" data-subscription-surface>
        <div class="surface-content" data-subscription-content>
          <article class="subscription-plans-panel admin-flat-table-section" data-outer="Subscriptions">
            <div class="panel-header"><div><h2>Subscriptions</h2></div></div>
            ${table("Subscriptions", "table-wrap users-table-wrap")}
          </article>
        </div>
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
    const result = await page.evaluate(() => {
      const px = (value) => Math.round(parseFloat(value) * 100) / 100;
      const outers = [...document.querySelectorAll("[data-outer]")].map((element) => {
        const style = getComputedStyle(element);
        return {
          name: element.dataset.outer,
          border: px(style.borderTopWidth),
          padding: px(style.paddingTop),
          background: style.backgroundColor,
        };
      });
      const tables = [...document.querySelectorAll("[data-table]")].map((element) => {
        const style = getComputedStyle(element);
        return {
          name: element.dataset.table,
          border: px(style.borderTopWidth),
          padding: px(style.paddingTop),
        };
      });
      const subscriptionSurface = getComputedStyle(document.querySelector("[data-subscription-surface]"));
      const subscriptionContent = getComputedStyle(document.querySelector("[data-subscription-content]"));
      return {
        outers,
        tables,
        subscriptionSurfaceBorder: px(subscriptionSurface.borderTopWidth),
        subscriptionSurfacePadding: px(subscriptionSurface.paddingTop),
        subscriptionContentPadding: px(subscriptionContent.paddingTop),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    results.push({ width, ...result });
    await page.screenshot({ path: `temp/flat-directory-tables-${width}.png`, fullPage: true });
    await page.close();
  }

  await browser.close();
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  const failed = results.some((result) => (
    result.outers.some((outer) => outer.border !== 0 || outer.padding !== 0)
    || result.tables.some((tableResult) => tableResult.border !== 1 || tableResult.padding !== (result.width <= 720 ? 14 : 20))
    || result.subscriptionSurfaceBorder !== 0
    || result.subscriptionSurfacePadding !== 0
    || result.subscriptionContentPadding !== 0
    || result.horizontalOverflow
  ));
  if (failed) process.exit(1);
})();
