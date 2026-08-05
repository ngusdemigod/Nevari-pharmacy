const { chromium } = require("playwright");

function json(data) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(data) };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 850 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
        baseUrl: "https://nevarihealth.com",
        frontendType: "storefront",
        paired: true,
        accessToken: "server-session",
        refreshToken: "server-session",
        expiresAt: Date.now() + 3600000,
        user: { id: 1, roles: ["administrator"], display_name: "Preview Admin" },
        currentPage: "products",
      }));
    });

    let mediaId = 9000;
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.searchParams.get("path") || "";
      if (route.request().method() === "POST") {
        mediaId += 1;
        const assignedMediaId = mediaId;
        await new Promise((resolve) => setTimeout(resolve, 350));
        return route.fulfill(json({
          success: true,
          data: {
            id: assignedMediaId,
            src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23f3eee6'/%3E%3Ccircle cx='150' cy='150' r='80' fill='%23d8c7ad'/%3E%3C/svg%3E`,
            alt: `Product image ${assignedMediaId}`,
          },
        }));
      }
      if (url.pathname.includes("summary")) {
        return route.fulfill(json({ success: true, data: { dashboard: {}, recent_orders: [] } }));
      }
      if (path === "/products/categories" || url.pathname.endsWith("/api/admin/categories")) {
        return route.fulfill(json({ success: true, data: [{ id: 1, name: "Medicine" }] }));
      }
      if (path === "/products/tags" || url.pathname.endsWith("/api/admin/tags")) {
        return route.fulfill(json({ success: true, data: [{ id: 1, name: "Allergy" }] }));
      }
      return route.fulfill(json({ success: true, data: [] }));
    });

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") console.error("browser:", message.text());
    });
    page.on("requestfailed", (request) => console.error("requestfailed:", request.method(), request.url(), request.failure()));
    await page.goto("http://127.0.0.1:3002/admin/storefront", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4500);
    await page.locator(".auth-gate").evaluate((element) => {
      element.hidden = true;
      element.style.display = "none";
    }).catch(() => null);
    await page.getByRole("button", { name: "Create new record" }).click({ force: true });
    await page.getByRole("menuitem", { name: "New Product" }).click({ force: true });

    const modal = page.locator(".product-editor-create-mode");
    await modal.waitFor();
    const input = modal.locator('input[type="file"]');
    let spinnerBox = null;
    for (const [index, name] of ["one.png", "two.png", "three.png"].entries()) {
      const upload = input.setInputFiles({
        name,
        mimeType: "image/png",
        buffer: Buffer.from(name),
      });
      await page.waitForSelector(".product-create-images-loading .nevari-branded-spinner");
      spinnerBox ||= await modal.locator(".product-create-images-loading .nevari-branded-spinner").boundingBox();
      await upload;
      try {
        await modal.locator(".product-create-image-tile").nth(index).waitFor({ timeout: 5000 });
      } catch (error) {
        console.error("upload-state", await page.locator("body").innerText());
        throw error;
      }
    }

    const tiles = modal.locator(".product-create-image-tile");
    const secondCover = tiles.nth(1).locator(".product-create-image-cover");
    const hiddenOpacity = await secondCover.evaluate((element) => getComputedStyle(element).opacity);
    await tiles.nth(1).hover();
    const hoverOpacity = await secondCover.evaluate((element) => getComputedStyle(element).opacity);
    const promotedAlt = await tiles.nth(1).locator("img").getAttribute("alt");
    await secondCover.click();
    const firstAlt = await tiles.first().locator("img").getAttribute("alt");
    const initialTileCount = await tiles.count();
    const initialCoverCount = await modal.locator(".product-create-image-tile.is-cover").count();

    await modal.locator('input[placeholder="e.g. Loratadine 10mg"]').fill("Test product");
    await modal.locator('textarea[placeholder="Add a short customer friendly description"]').fill("Customer friendly description");
    await modal.locator('input[type="number"]').nth(0).fill("10");
    await modal.locator('input[type="number"]').nth(1).fill("8");
    await modal.getByRole("button", { name: "Next", exact: true }).click();
    await modal.getByText("Stock & shipping", { exact: true }).waitFor();
    await modal.locator('input[type="number"]').fill("24");
    await modal.locator("select").selectOption({ index: 1 });
    await modal.locator('input[placeholder="Type to search categories"]').fill("Medicine");
    await modal.locator(".product-create-taxonomy-row").getByRole("button", { name: "Add", exact: true }).first().click();
    await modal.locator('input[placeholder="Type to search tags"]').fill("Allergy");
    await modal.locator(".product-create-taxonomy-row").getByRole("button", { name: "Add", exact: true }).last().click();
    await modal.getByRole("button", { name: "Next", exact: true }).click();
    await modal.getByRole("heading", { name: "Prescription", exact: true }).waitFor();
    const editorBox = await modal.locator(".product-prescription-editor").boundingBox();
    const multipleBox = await modal.getByText("Create multiple", { exact: true }).boundingBox();

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      contentBorder: getComputedStyle(document.querySelector(".product-create-step-scroll")).borderTopWidth,
    }));

    const result = {
      viewport: viewport.width,
      ...layout,
      tileCount: initialTileCount,
      coverCount: initialCoverCount,
      spinner: spinnerBox ? [Math.round(spinnerBox.width), Math.round(spinnerBox.height)] : null,
      hiddenOpacity,
      hoverOpacity,
      promoted: firstAlt === promotedAlt,
      advancedWithoutTaxonomy: await modal.getByText("Stock & shipping", { exact: true }).isVisible(),
      prescriptionScreen: Boolean(editorBox && multipleBox && editorBox.y < multipleBox.y),
      visibleStepIndicator: /\bStep\s+[123]\b/i.test(await modal.innerText()),
    };
    results.push(result);

    if (
      result.overflow
      || result.contentBorder !== "0px"
      || result.tileCount !== 3
      || result.coverCount !== 1
      || String(result.spinner) !== "24,24"
      || !result.promoted
      || !result.prescriptionScreen
      || result.visibleStepIndicator
    ) {
      throw new Error(`Verification failed: ${JSON.stringify(result)}`);
    }

    await page.screenshot({ path: `temp/create-product-combined-media-${viewport.width}.png`, fullPage: true });
    await context.close();
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
