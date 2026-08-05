const path = require("node:path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const card = (index) => `
  <article class="admin-metric-card admin-metric-card-${["blue", "sand", "mint", "lavender"][index]}">
    <span class="admin-metric-card-head">
      <span class="admin-metric-card-label">Metric ${index + 1}</span>
      <span class="admin-metric-card-icon" aria-hidden="true"><svg width="18" height="18"></svg></span>
    </span>
    <span class="admin-metric-card-value">${(index + 1) * 12}</span>
    <span class="admin-metric-card-note">Supporting metric description</span>
  </article>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 900 },
    tablet: { width: 1024, height: 768 },
    mobile: { width: 390, height: 844 },
  })) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`<main class="nevari-admin-storefront"><section class="admin-metric-grid">${[0, 1, 2, 3].map(card).join("")}</section></main>`);
    await page.addStyleTag({ path: path.join(__dirname, "..", "NevariAdmin Storefront", "app", "globals.css") });
    const grid = page.locator(".admin-metric-grid");
    const cards = grid.locator(".admin-metric-card");
    results[name] = {
      cards: await cards.count(),
      columns: await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
      colors: await cards.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor)),
      shadows: await cards.evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element).boxShadow))]),
      valueWeights: await cards.evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element.querySelector(".admin-metric-card-value")).fontWeight))]),
      heights: await cards.evaluateAll((elements) => [...new Set(elements.map((element) => element.getBoundingClientRect().height))]),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    };
    await page.screenshot({ path: `temp/admin-metric-styles-${name}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (results.desktop.cards !== 4 || results.desktop.columns !== 4) throw new Error("Desktop cards are not four-up.");
  if (results.tablet.columns !== 2) throw new Error("Tablet cards are not two-up.");
  if (results.mobile.columns !== 1 || results.mobile.overflow) throw new Error("Mobile cards do not stack cleanly.");
  if (results.desktop.shadows.some((shadow) => shadow !== "none")) throw new Error("Metric cards contain a drop shadow.");
  if (results.desktop.valueWeights.some((weight) => Number(weight) > 400)) throw new Error("Metric values use bold text.");
  if ([results.desktop, results.tablet, results.mobile].some((result) => result.heights.length !== 1 || result.heights[0] !== 196)) throw new Error("Metric cards do not share the fixed 196px height.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
