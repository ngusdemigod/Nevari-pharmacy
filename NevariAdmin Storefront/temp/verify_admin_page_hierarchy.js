const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const storefrontSource = fs.readFileSync(path.resolve(__dirname, "../app/admin/storefront/page.js"), "utf8");
const staffSource = fs.readFileSync(path.resolve(__dirname, "../app/components/StaffDirectory.js"), "utf8");
const nurseSource = fs.readFileSync(path.resolve(__dirname, "../app/components/NurseRequestAdminPanel.js"), "utf8");

function assertSourceHierarchy(source, label) {
  const heading = source.indexOf("<AdminPageHeading");
  const metrics = source.indexOf("<AdminMetricCards", heading);
  const details = source.indexOf("<section", metrics + 1);

  if (heading < 0 || metrics < heading || details < metrics) {
    throw new Error(`${label} does not follow title > metrics > details in source.`);
  }
}

async function main() {
  assertSourceHierarchy(staffSource, "Staff");
  assertSourceHierarchy(nurseSource, "Nurse Requests");

  const pageTitles = [
    "Nevari Pharmacy Orders",
    "Payments",
    "Patients",
    "All customer therapy requests",
    "All customer IV therapy requests",
    "Pharmaceutical Products"
  ];
  for (const title of pageTitles) {
    const headingIndex = storefrontSource.indexOf(`<AdminPageHeading title="${title}"`);
    const metricsIndex = storefrontSource.indexOf("<AdminMetricCards", headingIndex);
    if (headingIndex < 0 || metricsIndex < headingIndex) {
      throw new Error(`${title} is not above its metrics.`);
    }
  }
  if (!storefrontSource.includes("<AdminPageHeading title={`${formatStatusLabel(consultationFilter)} consultations`} />")) {
    throw new Error("Consultations page heading is not above its metrics.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="page-view active hierarchy-fixture">
            <header class="admin-page-heading"><h1>Pharmaceutical Products</h1><p>Manage the storefront catalogue.</p></header>
            <div class="admin-metric-grid">
              ${Array.from({ length: 4 }, (_, index) => `<article class="admin-metric-card admin-metric-card-blue">Metric ${index + 1}</article>`).join("")}
            </div>
            <section class="table-panel dashboard-table-shell"><div class="table-scroll"><table><tbody><tr><td>Details</td></tr></tbody></table></div></section>
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });
      await page.addStyleTag({ content: "body{margin:0}.hierarchy-fixture{padding:20px}" });

      const result = await page.evaluate(() => {
        const title = document.querySelector(".admin-page-heading").getBoundingClientRect();
        const metrics = document.querySelector(".admin-metric-grid").getBoundingClientRect();
        const details = document.querySelector(".dashboard-table-shell").getBoundingClientRect();
        return {
          titleTop: Math.round(title.top),
          titleBottom: Math.round(title.bottom),
          metricsTop: Math.round(metrics.top),
          metricsBottom: Math.round(metrics.bottom),
          detailsTop: Math.round(details.top),
          fontWeight: getComputedStyle(document.querySelector(".admin-page-heading h1")).fontWeight,
          overflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      if (!(result.titleBottom < result.metricsTop && result.metricsBottom < result.detailsTop)) {
        throw new Error(`Incorrect hierarchy at ${width}px: ${JSON.stringify(result)}`);
      }
      if (result.fontWeight !== "400" || result.overflow) {
        throw new Error(`Heading styling/overflow failed at ${width}px: ${JSON.stringify(result)}`);
      }
      console.log(`${width}px`, JSON.stringify(result));
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
