const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const sourceChecks = {
    productColumns: source.includes("product-create-details-columns"),
    editableEmail: source.includes('value={orderCreateForm.email}') && source.includes("email: event.target.value"),
    editablePhone: source.includes('value={orderCreateForm.phone}') && source.includes("phone: event.target.value"),
    decrement: source.includes("Decrease quantity for"),
    increment: source.includes("Increase quantity for"),
    removeRetained: source.includes("order-create-remove-item"),
    subtotal: source.includes("order-create-line-summary"),
  };
  const failures = Object.entries(sourceChecks).filter(([, passed]) => !passed).map(([key]) => key);
  if (failures.length) throw new Error(`Source checks failed: ${failures.join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 850 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`
      <main class="page-shell nevari-admin-storefront">
        <div class="app-modal-layer">
          <section class="admin-surface-modal order-create-popup modal-design-system-parity">
            <form class="order-create-form">
              <header class="modal-head"><h3>Create order</h3><p>Create a manual storefront order, link products, define payment state and prepare fulfilment.</p></header>
              <div class="order-create-shell">
                <section class="creation-main order-create-full-width">
                  <div class="creation-section-title order-create-customer-heading"><span>Patient and order details</span></div>
                  <div class="creation-field-grid order-create-patient-name"><div class="creation-field"><label>Patient name</label><input class="form-control" placeholder="Search customer by name, email, or phone"></div></div>
                  <div class="creation-field-grid creation-field-grid-two order-create-contact-fields">
                    <div class="creation-field"><label>Email address</label><input class="form-control"></div>
                    <div class="creation-field"><label>Phone number</label><input class="form-control"></div>
                  </div>
                  <div class="creation-field-grid order-create-payment-field"><div class="creation-field"><label>Payment status</label><select class="form-control"><option>Select payment status</option></select></div></div>
                  <section class="order-create-items-column">
                    <div class="order-create-items-header"><div><span class="section-kicker">Order items</span><h4>Products</h4></div></div>
                    <div class="order-product-search-field creation-field"><label>Add another product</label><input class="form-control" placeholder="Search product by name, SKU, or brand"></div>
                    <div class="order-create-table-scroll"><table class="order-create-items-table"><tbody><tr>
                      <td><div class="order-product-cell"><span class="order-create-selected-image"></span><strong>Classic Ceramic Mug</strong></div></td>
                      <td><div class="order-create-quantity-control"><button disabled>−</button><input class="order-create-quantity-input" value="1"><button class="order-create-quantity-add">+</button></div></td>
                      <td class="order-create-item-price">₦12,500</td>
                      <td><button class="icon-button order-create-remove-item">×</button></td>
                    </tr></tbody></table></div>
                    <div class="order-create-line-summary"><span>1 item selected</span><span>Subtotal <strong>₦12,500</strong></span></div>
                  </section>
                  <div class="creation-field-grid order-create-delivery-field"><div class="creation-field"><label>Delivery method</label><select class="form-control"><option>Select delivery method</option></select></div></div>
                  <div class="creation-field-grid order-create-note-field"><div class="creation-field"><label>Prescription note</label><textarea class="form-control"></textarea></div></div>
                </section>
              </div>
              <footer class="stacked-order-popup-actions modal-actions"><button class="pill-button">Cancel</button><button class="button-primary">Create Order</button></footer>
            </form>
          </section>
        </div>
        <div class="app-modal-layer product-test-layer">
          <section class="product-editor-modal product-editor-create-mode modal-design-system-parity">
            <div class="product-create-details-columns">
              <div class="product-create-details-primary">
                <label class="creation-field"><span>Product name</span><input class="form-control"></label>
                <label class="creation-field"><span>Unit price</span><input class="form-control"></label>
                <label class="creation-field"><span>Sales price</span><input class="form-control"></label>
              </div>
              <label class="creation-field product-create-description-column"><span>Short description</span><textarea class="form-control"></textarea></label>
            </div>
          </section>
        </div>
      </main>
    `);
    await page.addStyleTag({ path: path.join(root, "app/globals.css") });
    const layout = await page.evaluate(() => {
      const productColumns = getComputedStyle(document.querySelector(".product-create-details-columns")).gridTemplateColumns.split(" ").length;
      const orderGrid = getComputedStyle(document.querySelector(".order-create-full-width")).gridTemplateColumns.split(" ").length;
      const fieldHeights = Array.from(document.querySelectorAll(".order-create-popup input.form-control, .order-create-popup select.form-control")).map((element) => Math.round(element.getBoundingClientRect().height));
      const quantity = document.querySelector(".order-create-quantity-control").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        productColumns,
        orderGrid,
        fieldHeights,
        quantity: [Math.round(quantity.width), Math.round(quantity.height)],
        trashVisible: document.querySelector(".order-create-remove-item").getBoundingClientRect().width > 0,
      };
    });
    const expectedColumns = viewport.width <= 820 ? 1 : 2;
    if (layout.overflow || layout.productColumns !== expectedColumns || layout.orderGrid !== expectedColumns
      || layout.fieldHeights.some((height) => height !== 42) || !layout.trashVisible || layout.quantity[1] !== 38) {
      throw new Error(`${viewport.width}px verification failed: ${JSON.stringify(layout)}`);
    }
    results.push({ viewport: viewport.width, ...layout });
    await page.locator(".product-test-layer").evaluate((element) => {
      element.style.display = "none";
    });
    await page.locator(".order-create-popup").screenshot({ path: `temp/create-order-reference-${viewport.width}.png` });
    await page.close();
  }
  console.log(JSON.stringify({ sourceChecks, results }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
