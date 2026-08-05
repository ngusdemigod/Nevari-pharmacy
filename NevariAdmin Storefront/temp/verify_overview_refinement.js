const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const pageSource = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const chartSource = fs.readFileSync(path.join(root, "app/components/RevenueOverviewCard.js"), "utf8");

  const overviewCards = pageSource.match(/currentPage === "overview"[\s\S]*?<AdminMetricCards[\s\S]*?cards=\{\[([\s\S]*?)\]\}/)?.[1] || "";
  const cardCount = (overviewCards.match(/\{ label:/g) || []).length;
  if (cardCount !== 4 || overviewCards.includes('label: "Prescriptions"')) {
    throw new Error(`Expected four Overview cards without Prescriptions; found ${cardCount}.`);
  }
  if (chartSource.includes("<CartesianGrid")) {
    throw new Error("Revenue chart still renders internal Cartesian grid lines.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <label class="revenue-overview-label revenue-overview-label-select">
            <span class="sr-only">Revenue granularity</span>
            <select class="revenue-overview-select" aria-label="Revenue granularity">
              <option>All revenue · Monthly</option>
            </select>
          </label>
        </main>
      `);
      await page.addStyleTag({ path: path.join(root, "app/globals.css") });

      const select = page.locator(".revenue-overview-select");
      const style = await select.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          height: Math.round(element.getBoundingClientRect().height),
          radius: computed.borderRadius,
          background: computed.backgroundColor
        };
      });
      if (style.height !== 48 || style.radius !== "12px" || style.background !== "rgb(255, 255, 255)") {
        throw new Error(`Unexpected chart dropdown styling at ${width}px: ${JSON.stringify(style)}`);
      }

      await select.focus();
      await page.waitForTimeout(200);
      const focusRing = await select.evaluate((element) => getComputedStyle(element).boxShadow);
      if (focusRing === "none" || focusRing.includes("rgba(0, 0, 0, 0)")) {
        throw new Error(`Missing chart dropdown focus ring at ${width}px.`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(`Overview dropdown overflows at ${width}px.`);

      console.log(`${width}px`, JSON.stringify({ cardCount, style, focusRing, overflow }));
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
