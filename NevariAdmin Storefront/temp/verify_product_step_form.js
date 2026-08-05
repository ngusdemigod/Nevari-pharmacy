const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const requiredSourceChecks = {
    threePages: ["Product details", "Stock & shipping", "Prescription"].every((label) => source.includes(`label: "${label}"`)),
    imageRequired: source.includes('image: productEditMedia.length ? "" : "Add a product image."'),
    tagsRequired: source.includes('"Select at least one tag."'),
    stockRequired: source.includes('"Enter a valid stock quantity."'),
    publishRevalidatesAllPages: source.includes("for (let index = 0; index < PRODUCT_CREATE_STEPS.length; index += 1)"),
    draftIntent: source.includes('data-intent="draft"'),
    createMultiple: source.includes("Publish and start a new product"),
    goBack: source.includes(">Go back</button>"),
    noStepStrip: !source.includes('className="product-create-stepper" role="tablist"'),
    rasterEmptyState: source.includes('src="/product-image-placeholder.png"')
  };
  if (!fs.existsSync(path.join(root, "public/product-image-placeholder.png"))) {
    throw new Error("Product image placeholder asset is missing.");
  }
  const failed = Object.entries(requiredSourceChecks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`Source checks failed: ${failed.join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 850 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(`
        <div class="app-modal-layer">
          <section class="product-editor-modal modal-design-system-parity product-editor-create-mode">
            <form class="product-editor-form">
              <header class="product-editor-header"><h3>Create product</h3></header>
              <div class="product-editor-shell">
                <div class="product-editor-form-column">
                  <div class="product-editor-form-card product-create-form-layout">
                    <div class="product-create-stepper">
                      <button class="product-create-step-pill active"><span>Step 1</span><strong>Product details</strong></button>
                      <button class="product-create-step-pill"><span>Step 2</span><strong>Stock &amp; shipping</strong></button>
                      <button class="product-create-step-pill"><span>Step 3</span><strong>Prescription</strong></button>
                    </div>
                    <div class="product-create-step-head"><div><h4>Product details</h4></div><p class="popup-support-copy">Add product details.</p></div>
                    <div class="product-create-step-scroll">
                      <div class="product-create-step-panel">
                        <div class="product-create-primary-image-row">
                          <button class="product-create-featured-picker"></button>
                          <div><button>Upload image</button><small>PNG or JPG</small></div>
                        </div>
                        <div class="creation-field-row creation-field-row-two product-create-taxonomy-row"><input><input></div>
                        <div class="creation-field-row creation-field-row-two product-create-price-row"><input><input></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <footer class="product-editor-footer"><div class="product-editor-footer-end"><label class="product-create-multiple"><input type="checkbox"><span>Create multiple</span><small>Publish and start a new product</small></label><div class="product-editor-actions"><button>Save draft</button><button>Next</button></div></div></footer>
            </form>
          </section>
        </div>
      `);
      await page.addStyleTag({ path: path.join(root, "app/globals.css") });
      const layout = await page.evaluate(() => {
        const modal = document.querySelector(".product-editor-create-mode").getBoundingClientRect();
        const scroll = document.querySelector(".product-create-step-scroll").getBoundingClientRect();
        const steps = getComputedStyle(document.querySelector(".product-create-stepper"));
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          modalWidth: Math.round(modal.width),
          modalHeight: Math.round(modal.height),
          scrollHeight: Math.round(scroll.height),
          stepDisplay: steps.display,
          stepColumns: steps.gridTemplateColumns.split(" ").length
        };
      });
      if (layout.overflow || layout.modalWidth > viewport.width || layout.modalHeight > viewport.height || layout.scrollHeight < 100 || layout.stepDisplay !== "none") {
        throw new Error(`${viewport.width}px layout failed: ${JSON.stringify(layout)}`);
      }
      console.log(`${viewport.width}px`, JSON.stringify(layout));
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
