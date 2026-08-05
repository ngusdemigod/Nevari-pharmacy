const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const pageSource = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const restSource = fs.readFileSync(path.join(root, "../nevari-pharmacy-core/includes/class-nevari-rest.php"), "utf8");
  const pluginSource = fs.readFileSync(path.join(root, "../nevari-pharmacy-core/includes/class-nevari-plugin.php"), "utf8");

  const checks = {
    emptyOrderDefaults: /firstName:\s*""[\s\S]*status:\s*""[\s\S]*deliveryMethod:\s*""/.test(pageSource),
    ajaxProductSearch: /deferredOrderCreateSearch\.length >= 2/.test(pageSource),
    ajaxPatientSearch: /deferredOrderCreateCustomerSearch\.length >= 2/.test(pageSource),
    multiItemTable: pageSource.includes('className="order-create-items-table"'),
    noOrderPreview: !pageSource.match(/order-create-shell[\s\S]*?<aside className="creation-side">/),
    threeProductSteps: ["Identity", "Pricing and inventory", "Prescription"].every((label) => pageSource.includes(`label: "${label}"`)),
    exclusiveProductSteps: [0, 1, 2].every((step) => pageSource.includes(`productCreateStep === ${step}`)),
    readonlySku: pageSource.includes('readOnly aria-readonly="true"'),
    allowedEditorTools: ["bold", "underline", "insertUnorderedList", "fontSize"].every((command) => pageSource.includes(`formatProductDescription("${command}"`)),
    orderPrescriptionSection: pageSource.includes('className="order-product-prescriptions"'),
    serverSnapshot: restSource.includes("$order_item->add_meta_data('_nevari_product_prescription'"),
    customerEmailSection: pluginSource.includes("render_customer_order_prescriptions_email"),
    strictSanitizer: restSource.includes("'font' => ['size' => true]") && !restSource.match(/sanitize_product_prescription_html[\s\S]{0,500}'a'\s*=>/)
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  if (failed.length) throw new Error(`Source checks failed: ${failed.join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="order-create-popup admin-surface-modal">
            <div class="order-create-shell"><section class="creation-main order-create-full-width">
              <section class="order-create-items-column">
                <div class="order-create-results">
                  ${Array.from({ length: 7 }, (_, index) => `<button class="consultation-search-result"><span class="order-create-product-thumb"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></span><span>Product ${index + 1}</span></button>`).join("")}
                </div>
              </section>
            </section></div>
          </section>
          <section class="product-editor-create-mode">
            <div class="product-editor-shell"><div class="product-editor-form-column">
              <button class="product-create-featured-picker"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></button>
              <div class="product-create-gallery-manager">${Array.from({ length: 8 }, () => `<div class="product-thumbnail"><button class="product-thumbnail-surface"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></button></div>`).join("")}</div>
            </div></div>
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.join(root, "app/globals.css") });

      const imageSizes = await page.locator(".order-create-product-thumb, .product-create-featured-picker, .product-create-gallery-manager img").evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      }));
      if (imageSizes.some(([itemWidth, itemHeight]) => itemWidth !== 50 || itemHeight !== 50)) {
        throw new Error(`Media sizing failed at ${width}px: ${JSON.stringify(imageSizes)}`);
      }

      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        orderWidth: Math.round(document.querySelector(".order-create-full-width").getBoundingClientRect().width),
        shellWidth: Math.round(document.querySelector(".order-create-shell").getBoundingClientRect().width),
        galleryRows: new Set(Array.from(document.querySelectorAll(".product-create-gallery-manager img")).map((image) => Math.round(image.getBoundingClientRect().top))).size
      }));
      if (layout.overflow || layout.orderWidth < layout.shellWidth - 48 || (width <= 390 && layout.galleryRows < 2)) {
        throw new Error(`Responsive layout failed at ${width}px: ${JSON.stringify(layout)}`);
      }
      console.log(`${width}px`, JSON.stringify({ checks, imageSizes: imageSizes.slice(0, 3), layout }));
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
