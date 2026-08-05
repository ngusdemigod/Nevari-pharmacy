const { chromium } = require("playwright");

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8/8AAAAASUVORK5CYII=",
  "base64",
);

async function openProductCreator(page) {
  await page.getByRole("button", { name: "Create new record" }).click({ force: true });
  await page.getByRole("menuitem", { name: "New Product" }).click({ force: true });
  const modal = page.locator(".product-editor-create-mode");
  await modal.waitFor({ state: "visible" });
  return modal;
}

async function fillRequiredDetails(modal) {
  await modal.getByLabel("Product name").fill("Loratadine 10mg");
  await modal.getByLabel("Unit price").fill("18");
  await modal.getByLabel("Sales price").fill("15");
  await modal.getByLabel("Short description").fill("Non-drowsy daily allergy relief.");
  await modal.locator('input[type="file"]').setInputFiles({
    name: "loratadine.png",
    mimeType: "image/png",
    buffer: pngBuffer,
  });
  try {
    await modal.locator(".product-create-image-tile").waitFor({ timeout: 5000 });
  } catch (error) {
    console.error("Product image state:", await modal.innerText());
    throw error;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 850 },
    { width: 375, height: 812 },
  ];
  const results = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      document.cookie = "nevari_csrf=playwright-csrf; path=/";
      localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
        baseUrl: "https://nevarihealth.com",
        frontendType: "storefront",
        paired: true,
        accessToken: "server-session",
        refreshToken: "server-session",
        expiresAt: Date.now() + 3600000,
        user: {
          id: 1,
          roles: ["administrator"],
          display_name: "Preview Admin",
        },
        currentPage: "products",
      }));
    });

    await context.route(/https:\/\/[^/]*sentry\.io\/.*/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }));

    let nextMediaId = 8100;
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.searchParams.get("path") || "";
      let body = {};
      if (request.method() === "POST") {
        try {
          body = request.postDataJSON() || {};
        } catch {
          body = {};
        }
      }

      if (
        request.method() === "POST"
        && (path.endsWith("/products/media") || Boolean(body.filename && body.data_base64))
      ) {
        nextMediaId += 1;
        await new Promise((resolve) => setTimeout(resolve, 180));
        return route.fulfill(json({
          success: true,
          data: {
            id: nextMediaId,
            src: `data:image/png;base64,${pngBuffer.toString("base64")}`,
            alt: "Loratadine product image",
          },
        }));
      }

      if (
        request.method() === "POST"
        && (path.endsWith("/products") || Boolean(body.name && body.status))
      ) {
        return route.fulfill(json({
          success: true,
          data: {
            id: 9401,
            name: "Loratadine 10mg",
            status: "draft",
          },
        }));
      }

      if (url.pathname.includes("summary")) {
        return route.fulfill(json({
          success: true,
          data: {
            dashboard: {},
            recent_orders: [],
          },
        }));
      }

      if (path === "/products/categories" || url.pathname.endsWith("/api/admin/categories")) {
        return route.fulfill(json({ success: true, data: [{ id: 1, name: "Medicine" }] }));
      }

      if (path === "/products/tags" || url.pathname.endsWith("/api/admin/tags")) {
        return route.fulfill(json({ success: true, data: [{ id: 1, name: "Allergy" }] }));
      }

      return route.fulfill(json({ success: true, data: [] }));
    });

    const browserErrors = [];
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto("http://127.0.0.1:3002/admin/storefront", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    await page.locator(".auth-gate").evaluate((element) => {
      element.hidden = true;
      element.style.display = "none";
    }).catch(() => null);

    let modal = await openProductCreator(page);
    const nextButton = modal.getByRole("button", { name: "Next", exact: true });
    const initiallyDisabled = await nextButton.isDisabled();
    await fillRequiredDetails(modal);
    await nextButton.waitFor({ state: "visible" });
    const enabledAfterValid = !(await nextButton.isDisabled());

    const metrics = await modal.evaluate((element) => {
      const box = (selector) => element.querySelector(selector)?.getBoundingClientRect();
      const modalBox = element.getBoundingClientRect();
      const shell = element.querySelector(".product-editor-shell");
      const form = element.querySelector(".product-editor-form");
      const header = element.querySelector(".product-editor-header");
      const close = element.querySelector(".product-editor-close-button");
      const name = box(".product-create-name-row");
      const images = box(".product-create-images-widget");
      const prices = box(".product-create-price-row");
      const unit = box(".product-create-price-row .creation-field:nth-child(1)");
      const sale = box(".product-create-price-row .creation-field:nth-child(2)");
      const description = box(".product-create-description-column");
      const textarea = box(".product-create-description-column textarea");
      const gallery = box(".product-create-images-list");
      const addTile = box(".product-create-images-add");
      const footer = box(".product-editor-footer");
      const shellBox = shell?.getBoundingClientRect();
      const formBox = form?.getBoundingClientRect();
      const headerBox = header?.getBoundingClientRect();
      const closeBox = close?.getBoundingClientRect();
      const desktopRow = window.innerWidth > 720;
      return {
        modalWidth: Math.round(modalBox.width),
        modalHeight: Math.round(modalBox.height),
        viewportHeight: window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        shellHorizontalOverflow: shell ? shell.scrollWidth > shell.clientWidth + 1 : true,
        flatSurface: getComputedStyle(element).boxShadow === "none"
          && getComputedStyle(element).backgroundImage === "none",
        naturalFooterGap: shellBox && footer ? Math.round(footer.top - shellBox.bottom) : null,
        contentFitted: Boolean(formBox && Math.abs(modalBox.bottom - formBox.bottom - 1) <= 2),
        headerHeight: headerBox ? Math.round(headerBox.height) : null,
        closeContained: Boolean(closeBox
          && closeBox.top >= modalBox.top
          && closeBox.right <= modalBox.right
          && closeBox.bottom <= headerBox.bottom),
        footerContained: Boolean(footer && footer.bottom <= modalBox.bottom),
        ordered: Boolean(name && images && prices && description
          && name.top < images.top
          && images.top < prices.top
          && images.top < description.top),
        sameDesktopRow: desktopRow
          ? Boolean(unit && sale && description
            && Math.abs(unit.top - sale.top) <= 1
            && Math.abs(unit.top - description.top) <= 1)
          : true,
        stackedMobile: desktopRow
          ? true
          : Boolean(unit && sale && description && unit.top < sale.top && sale.top < description.top),
        balancedWidths: desktopRow
          ? Boolean(unit && sale && description
            && Math.abs(unit.width - sale.width) <= 2
            && Math.abs(description.width - (unit.width + sale.width + 16)) <= 4)
          : true,
        textareaHeight: textarea ? Math.round(textarea.height) : null,
        galleryHeight: gallery ? Math.round(gallery.height) : null,
        addTile: addTile ? [Math.round(addTile.width), Math.round(addTile.height)] : null,
        labelTransform: getComputedStyle(element.querySelector(".product-create-name-row > span")).textTransform,
        reducedMotionAnimation: getComputedStyle(element.querySelector(".product-create-image-tile")).animationName,
        visibleStepIndicator: /\bStep\s+[123]\b/i.test(element.innerText),
      };
    });

    await nextButton.focus();
    await page.keyboard.press("Tab");
    const focusWrapped = await modal.getByRole("button", { name: "Close product creator" }).evaluate(
      (element) => document.activeElement === element,
    );

    await page.locator(".snackbar").waitFor({ state: "detached", timeout: 5000 }).catch(() => null);
    await page.screenshot({
      path: `temp/product-details-redesign-${viewport.width}.png`,
      fullPage: true,
    });

    let dismissedDirty = false;
    page.once("dialog", async (dialog) => {
      dismissedDirty = dialog.message() === "Discard unsaved changes?";
      await dialog.dismiss();
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const remainedAfterDismiss = await modal.isVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "detached" });
    const focusRestored = await page.getByRole("button", { name: "Create new record" }).evaluate(
      (element) => document.activeElement === element,
    );

    let draftSnackbarVisible = true;
    if (viewport.width === 1440) {
      modal = await openProductCreator(page);
      await modal.getByLabel("Product name").fill("Saved draft product");
      await modal.getByRole("button", { name: "Save draft", exact: true }).click();
      const draftSnackbar = page.locator(".snackbar-message", { hasText: "Draft saved" });
      await draftSnackbar.waitFor({ state: "visible", timeout: 8000 });
      draftSnackbarVisible = await draftSnackbar.isVisible();
    }

    const result = {
      viewport: viewport.width,
      initiallyDisabled,
      enabledAfterValid,
      focusWrapped,
      dismissedDirty,
      remainedAfterDismiss,
      focusRestored,
      draftSnackbar: draftSnackbarVisible,
      browserErrors,
      ...metrics,
    };
    results.push(result);

    const failed = !result.initiallyDisabled
      || !result.enabledAfterValid
      || !result.focusWrapped
      || !result.dismissedDirty
      || !result.remainedAfterDismiss
      || !result.focusRestored
      || !result.draftSnackbar
      || result.browserErrors.length
      || result.modalWidth > 1000
      || result.modalHeight >= result.viewportHeight
      || result.horizontalOverflow
      || result.shellHorizontalOverflow
      || !result.flatSurface
      || result.naturalFooterGap !== 0
      || !result.contentFitted
      || (viewport.width > 720 && result.modalHeight > 650)
      || (viewport.width <= 620 && result.headerHeight > 110)
      || !result.closeContained
      || !result.footerContained
      || !result.ordered
      || !result.sameDesktopRow
      || !result.stackedMobile
      || !result.balancedWidths
      || result.textareaHeight > 70
      || result.galleryHeight > 104
      || String(result.addTile) !== "96,96"
      || result.labelTransform !== "none"
      || result.reducedMotionAnimation !== "none"
      || result.visibleStepIndicator;

    if (failed) {
      throw new Error(`Product Details verification failed: ${JSON.stringify(result)}`);
    }

    await context.close();
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
