const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const identityBlock = source.slice(source.indexOf('if (stepKey === "identity")'), source.indexOf('if (stepKey === "commerce")'));
  const commerceBlock = source.slice(source.indexOf('if (stepKey === "commerce")'), source.indexOf('if (stepKey === "prescription")'));
  if (identityBlock.includes("category:") || identityBlock.includes("tags:") || !commerceBlock.includes("category:") || !commerceBlock.includes("tags:")) {
    throw new Error("Category and tag validation are not scoped to the commerce step.");
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 850 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`
      <div class="page-shell nevari-admin-storefront">
      <div class="app-modal-layer">
        <section class="admin-surface-modal product-editor-modal modal-design-system-parity product-editor-create-mode">
          <div class="product-create-step-scroll">
            <div class="creation-field product-create-primary-image-field product-create-images-widget">
              <div class="product-create-images-heading"><span>Product images</span><small>Add up to 6 images. The first image will be used as the cover.</small></div>
              <div class="product-create-images-list">
                ${["One", "Two", "Three"].map((name, index) => `
                  <div class="product-create-image-tile ${index === 0 ? "is-cover" : ""}">
                    <span class="product-create-image-drag"></span>
                    <img alt="${name}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23f3eee6'/%3E%3C/svg%3E">
                    <button class="product-create-image-remove">×</button>
                    <button class="product-create-image-cover">Cover</button>
                  </div>`).join("")}
                <button class="product-create-images-add"><span>Add images</span></button>
                <span class="product-create-images-loading"><span class="nevari-branded-spinner"></span></span>
              </div>
            </div>
          </div>
        </section>
      </div>
      </div>
    `);
    await page.addStyleTag({ path: path.join(root, "app/globals.css") });
    await page.evaluate(() => {
      document.querySelectorAll(".product-create-image-cover").forEach((button) => {
        button.addEventListener("click", () => {
          const tile = button.closest(".product-create-image-tile");
          const list = tile.parentElement;
          list.querySelector(".is-cover")?.classList.remove("is-cover");
          tile.classList.add("is-cover");
          list.prepend(tile);
        });
      });
    });

    const tiles = page.locator(".product-create-image-tile");
    const spinner = await page.locator(".nevari-branded-spinner").boundingBox();
    await page.locator(".product-create-images-loading").evaluate((element) => element.remove());
    const secondCover = tiles.nth(1).locator(".product-create-image-cover");
    await page.waitForTimeout(220);
    const hiddenOpacity = await secondCover.evaluate((element) => getComputedStyle(element).opacity);
    await tiles.nth(1).hover();
    await page.waitForTimeout(220);
    const hoverOpacity = await secondCover.evaluate((element) => getComputedStyle(element).opacity);
    await secondCover.click();
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      contentBorder: getComputedStyle(document.querySelector(".product-create-step-scroll")).borderTopWidth,
      coverCount: document.querySelectorAll(".product-create-image-tile.is-cover").length,
      firstAlt: document.querySelector(".product-create-image-tile img").alt,
    }));
    Object.assign(result, {
      viewport: viewport.width,
      hiddenOpacity,
      hoverOpacity,
      spinner: spinner ? [Math.round(spinner.width), Math.round(spinner.height)] : null,
    });
    if (result.overflow || result.contentBorder !== "0px" || result.coverCount !== 1 || result.firstAlt !== "Two"
      || hiddenOpacity !== "0" || hoverOpacity !== "1" || String(result.spinner) !== "24,24") {
      throw new Error(`Responsive media verification failed: ${JSON.stringify(result)}`);
    }
    results.push(result);
    await page.screenshot({ path: `temp/create-product-combined-media-${viewport.width}.png`, fullPage: true });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
