const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const storefrontSource = fs.readFileSync(path.resolve(__dirname, "../app/admin/storefront/page.js"), "utf8");
const metricSource = fs.readFileSync(path.resolve(__dirname, "../app/components/AdminMetricCards.js"), "utf8");
const tones = ["blue", "sand", "blue", "sand", "mint", "lavender"];
const labels = ["Total revenue", "Revenue today", "Consultations today", "Prescriptions", "Active products", "Orders in progress"];

async function main() {
  for (const label of labels) {
    if (!storefrontSource.includes(`label: "${label}"`)) {
      throw new Error(`Overview metric was lost: ${label}`);
    }
  }
  if (!storefrontSource.includes('className="overview-admin-metrics"') || !storefrontSource.includes("maxCards={8}") || !metricSource.includes("cards.slice(0, maxCards)")) {
    throw new Error("Overview is not using the shared multi-card metric design.");
  }
  if (storefrontSource.includes('<section className="metric-grid">')) {
    throw new Error("Legacy Overview metric cards are still rendered.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="admin-metric-grid overview-admin-metrics">
            ${tones.map((tone, index) => `
              <article class="admin-metric-card admin-metric-card-${tone}">
                <span class="admin-metric-card-head"><span class="admin-metric-card-label">${labels[index]}</span><span class="admin-metric-card-icon"><svg viewBox="0 0 24 24"></svg></span></span>
                <span class="admin-metric-card-value">${index < 2 ? "NGN 0" : "0"}</span>
                <span class="admin-metric-card-note">Current operational metric</span>
              </article>
            `).join("")}
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });
      await page.addStyleTag({ content: "body{margin:0}.nevari-admin-storefront{padding:18px}" });

      const cards = await page.locator(".admin-metric-card").evaluateAll((nodes) => nodes.map((node) => {
        const style = getComputedStyle(node);
        const icon = getComputedStyle(node.querySelector(".admin-metric-card-icon"));
        return {
          height: Math.round(node.getBoundingClientRect().height),
          top: Math.round(node.getBoundingClientRect().top),
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          shadow: style.boxShadow,
          fontWeight: getComputedStyle(node.querySelector(".admin-metric-card-value")).fontWeight,
          iconWidth: Math.round(node.querySelector(".admin-metric-card-icon").getBoundingClientRect().width),
          iconRadius: icon.borderRadius
        };
      }));

      const expectedColumns = width > 1200 ? 4 : width > 680 ? 2 : 1;
      const firstRowTop = cards[0].top;
      const actualColumns = cards.filter((card) => card.top === firstRowTop).length;
      const distinctColors = new Set(cards.map((card) => card.background)).size;
      if (cards.some((card) => card.height !== 196 || card.backgroundImage !== "none" || card.shadow !== "none" || card.fontWeight !== "400" || card.iconWidth !== 38 || card.iconRadius !== "50%")) {
        throw new Error(`Card styling mismatch at ${width}px: ${JSON.stringify(cards)}`);
      }
      if (actualColumns !== expectedColumns || distinctColors !== 4) {
        throw new Error(`Grid/color mismatch at ${width}px: ${JSON.stringify({ actualColumns, expectedColumns, distinctColors })}`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) {
        throw new Error(`Overview metrics overflow at ${width}px.`);
      }
      console.log(`${width}px`, JSON.stringify({ cards: cards.length, columns: actualColumns, distinctColors }));
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
