const { chromium } = require("playwright");

function json(data) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(data) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.com",
      frontendType: "storefront",
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: { id: 1, roles: ["administrator"], display_name: "Preview Admin" },
      currentPage: "products"
    }));
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("summary")) {
      return route.fulfill(json({ success: true, data: { dashboard: {}, recent_orders: [] } }));
    }
    return route.fulfill(json({ success: true, data: [] }));
  });

  const page = await context.newPage();
  await page.goto("http://localhost:3000/admin/storefront", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.locator(".auth-gate").evaluate((element) => {
    element.hidden = true;
    element.style.display = "none";
  }).catch(() => null);
  await page.getByRole("button", { name: "Create new record" }).click({ force: true });
  await page.getByRole("menuitem", { name: "New Product" }).click({ force: true });
  await page.waitForTimeout(1000);

  const modal = page.locator(".product-editor-create-mode");
  const stepStrip = modal.locator(".product-create-stepper");
  const media = modal.locator(".product-create-primary-image-field");
  const details = modal.locator(".product-create-name-row");
  const placeholders = modal.locator('img[src="/product-image-placeholder.png"]');
  const featuredPlaceholderBox = await modal.locator(".product-create-featured-picker").boundingBox();
  const galleryPlaceholderBox = await modal.locator(".product-create-gallery-placeholder").boundingBox();
  const mediaBox = await media.boundingBox();
  const detailsBox = await details.boundingBox();
  const result = {
    modal: await modal.count(),
    stepStrip: await stepStrip.count(),
    placeholders: await placeholders.count(),
    mediaLeftOfDetails: Boolean(mediaBox && detailsBox && mediaBox.x < detailsBox.x),
    featuredPlaceholderBox,
    galleryPlaceholderBox,
  };
  if (result.modal !== 1 || result.stepStrip !== 0 || result.placeholders < 2 || !result.mediaLeftOfDetails
    || !featuredPlaceholderBox || featuredPlaceholderBox.width < 200 || featuredPlaceholderBox.height < 200) {
    throw new Error(`Create product layout failed: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify(result));
  await page.screenshot({ path: "temp/create-product-media-layout.png", fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
