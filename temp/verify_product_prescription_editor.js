const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  };
}

const product = {
  id: 91,
  name: "Vitamin C",
  sku: "VIT-C-001",
  status: "publish",
  description: "<p><strong>Take one tablet</strong> daily after food.</p>",
  short_description: "Daily vitamin C supplement.",
  stock_status: "instock",
  stock_quantity: 20,
  regular_price: "3000",
  sale_price: "",
  price: "3000",
  categories: ["Vitamins"],
  tags: ["Supplement"],
  images: [{ id: 7, src: "http://127.0.0.1:3002/ne.webp", alt: "Vitamin C" }],
  meta_data: [{ key: "prescription_notes", value: "<p>Old prescription snapshot</p>" }],
};

async function verifyViewport(browser, viewport, screenshotName) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.example.test",
      frontendType: "storefront",
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: {
        id: 1,
        roles: ["administrator"],
        storefront_permissions: ["products"],
        display_name: "Verification Admin",
      },
      currentPage: "products",
    }));
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/products") {
      await route.fulfill(json([product]));
      return;
    }
    await route.fulfill(json([]));
  });

  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3002/admin/storefront", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.getByText("Vitamin C", { exact: true }).waitFor();
  await page.locator(".products-table .table-link", { hasText: "Vitamin C" }).click();

  const modal = page.getByRole("dialog", { name: "Vitamin C" });
  await modal.waitFor();
  const prescriptionLabel = modal.getByText("Prescription", { exact: true });
  const prescriptionLabelCount = await prescriptionLabel.count();
  if (prescriptionLabelCount < 1) {
    throw new Error(`The edit modal does not expose a Prescription field label. Modal text: ${(await modal.innerText()).slice(0, 800)}`);
  }
  if (await modal.getByText(/Long Description/i).count()) {
    throw new Error("The legacy Long Description label is still visible.");
  }

  const editor = modal.locator('[contenteditable="true"][aria-label="Product prescription"]');
  await editor.waitFor();
  const editorText = (await editor.textContent()).replace(/\s+/g, " ").trim();
  if (editorText !== "Take one tablet daily after food.") {
    throw new Error(`Expected the WooCommerce description in the prescription editor, received "${editorText}".`);
  }

  const footer = modal.locator(".product-editor-footer");
  const saveButton = modal.getByRole("button", { name: "Save Changes" });
  const spacing = await page.evaluate(({ modalSelector, footerSelector, saveSelector }) => {
    const dialog = document.querySelector(modalSelector);
    const footerNode = document.querySelector(footerSelector);
    const save = document.querySelector(saveSelector);
    const dialogRect = dialog.getBoundingClientRect();
    const footerRect = footerNode.getBoundingClientRect();
    const saveRect = save.getBoundingClientRect();
    const styles = getComputedStyle(footerNode);
    return {
      rightInset: Math.round(dialogRect.right - saveRect.right),
      bottomInset: Math.round(dialogRect.bottom - saveRect.bottom),
      paddingRight: styles.paddingRight,
      paddingBottom: styles.paddingBottom,
      footerHeight: Math.round(footerRect.height),
    };
  }, {
    modalSelector: ".product-editor-modal",
    footerSelector: ".product-editor-modal .product-editor-footer",
    saveSelector: ".product-editor-modal .product-save-button",
  });

  const expectedInset = viewport.width <= 680 ? 14 : 18;
  if (spacing.rightInset < expectedInset || spacing.bottomInset < expectedInset) {
    throw new Error(`CTA inset is too small: ${JSON.stringify(spacing)}.`);
  }

  await page.screenshot({ path: screenshotName, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await context.close();
  return { viewport, overflow, spacing, editorText };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [
    await verifyViewport(browser, { width: 1440, height: 1000 }, "temp/product-prescription-editor-1440.png"),
    await verifyViewport(browser, { width: 390, height: 844 }, "temp/product-prescription-editor-390.png"),
  ];
  console.log(JSON.stringify({ results, prescriptionField: true, legacyLabelRemoved: true }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
