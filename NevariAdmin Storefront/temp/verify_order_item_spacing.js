const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 850 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`
      <main class="nevari-admin-storefront">
        <div class="app-modal-layer">
          <section class="order-create-popup admin-surface-modal creation-frame">
            <section class="order-create-items-column">
              <div class="order-create-items-header"><div><h4>Order items</h4><span>Add products to this order</span></div></div>
              <div class="creation-field order-product-search-field"><input id="order-create-product-search" class="form-control" placeholder="Search product by name, SKU, or brand"></div>
              <div class="order-create-table-scroll">
                <table class="order-create-items-table"><tbody><tr>
                  <td><div class="order-product-cell"><span class="order-create-selected-image"></span><span class="order-product-copy"><strong>Ciprofloxacin 500mg</strong><small>Product catalog item</small></span></div></td>
                  <td><div class="order-create-quantity-control"><button disabled>−</button><input type="number" class="order-create-quantity-input" value="1"><button class="order-create-quantity-add">+</button></div></td>
                  <td class="order-create-item-price">NGN 14.00</td>
                  <td><button class="order-create-remove-item">×</button></td>
                </tr></tbody></table>
              </div>
              <div class="order-create-line-summary"><span>1 item selected</span><span>Subtotal <strong>NGN 14.00</strong></span></div>
            </section>
          </section>
        </div>
      </main>
    `);
    await page.addStyleTag({ path: path.join(root, "app/globals.css") });

    const layout = await page.evaluate(() => {
      const column = document.querySelector(".order-create-items-column");
      const children = [...column.children].map((element) => element.getBoundingClientRect());
      const quantity = document.querySelector(".order-create-quantity-control").getBoundingClientRect();
      const controls = [...document.querySelectorAll(".order-create-quantity-control > *")].map((element) => element.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        gaps: children.slice(1).map((rect, index) => Math.round(rect.top - children[index].bottom)),
        quantity: [Math.round(quantity.width), Math.round(quantity.height)],
        controlHeights: controls.map((rect) => Math.round(rect.height)),
        controlTopOffsets: controls.map((rect) => Math.round(rect.top - quantity.top)),
      };
    });

    const valid = !layout.overflow
      && layout.gaps.every((gap) => gap === 12)
      && layout.quantity[0] === 112
      && layout.quantity[1] === 38
      && layout.controlHeights.every((height) => height === 36)
      && layout.controlTopOffsets.every((offset) => offset === 1);
    if (!valid) throw new Error(`${viewport.width}px verification failed: ${JSON.stringify(layout)}`);
    results.push({ viewport: viewport.width, ...layout });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
