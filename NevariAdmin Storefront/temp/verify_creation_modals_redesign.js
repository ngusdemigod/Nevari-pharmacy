const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:3002/admin/storefront";
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 850 },
  { width: 768, height: 850 },
  { width: 375, height: 812 },
];

function json(data, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(data) };
}

async function createContext(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.example.test",
      frontendType: "storefront",
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: { id: 1, roles: ["administrator"], display_name: "Modal QA Admin" },
      currentPage: "overview",
    }));
  });
  await context.route("**/api/**", (route) => route.fulfill(json({ success: true, data: [] })));
  return context;
}

async function openCreation(page, label) {
  await page.getByRole("button", { name: "Create new record" }).click({ force: true });
  await page.getByRole("menuitem", { name: label }).click({ force: true });
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  return dialog;
}

async function inspectDialog(dialog, viewport, kind) {
  const result = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const body = element.querySelector(":is(.order-create-shell, .creation-modal__body, .user-account-create, .product-editor-shell)");
    const field = element.querySelector("input:not([type=file]):not([type=checkbox]), select, textarea");
    return {
      width: Math.round(rect.width),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      radius: style.borderRadius,
      background: style.backgroundColor,
      image: style.backgroundImage,
      shadow: style.boxShadow,
      fieldRadius: field ? getComputedStyle(field).borderRadius : "",
      horizontalOverflow: body ? body.scrollWidth - body.clientWidth : 0,
      viewportOverflow: document.documentElement.scrollWidth - window.innerWidth,
      activeInside: element.contains(document.activeElement),
      height: Math.round(rect.height),
    };
  });

  const expectedRadius = viewport.width <= 620 ? "14px" : "18px";
  if (
    result.width > Math.min(1000, viewport.width)
    || result.top < 0
    || result.bottom > viewport.height + 1
    || result.radius !== expectedRadius
    || result.background !== "rgb(255, 255, 255)"
    || result.image !== "none"
    || result.shadow !== "none"
    || result.fieldRadius !== "12px"
    || result.horizontalOverflow > 2
    || result.viewportOverflow > 2
    || !result.activeInside
  ) {
    throw new Error(`${kind} layout/accessibility failed at ${viewport.width}px: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyFocusTrap(page, dialog, kind) {
  const focusables = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=true]");
  await focusables.last().focus();
  await page.keyboard.press("Tab");
  if (!await dialog.evaluate((element) => element.contains(document.activeElement))) {
    throw new Error(`${kind}: focus escaped the dialog`);
  }
}

async function closeAndVerifyRestore(page, dialog) {
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(30);
  const activeLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (activeLabel !== "Create new record") {
    throw new Error(`Focus restoration failed; active label was ${activeLabel}`);
  }
}

async function verifyDirtyDismissal(page, dialog) {
  const firstInput = dialog.locator("input:not([type=file]):not([type=checkbox])").first();
  await firstInput.fill("Unsaved value");

  page.once("dialog", (prompt) => prompt.dismiss());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(40);
  if (!await dialog.isVisible()) throw new Error("Dirty modal closed after discard was cancelled");

  page.once("dialog", (prompt) => prompt.accept());
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const browserErrors = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await createContext(browser, viewport);
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(`${viewport.width}: ${message.text()}`);
      });
      page.on("pageerror", (error) => browserErrors.push(`${viewport.width}: ${error.message}`));

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector(".nevari-admin-storefront", { timeout: 30000 });
      await page.locator(".auth-gate").evaluate((element) => {
        element.hidden = true;
        element.style.display = "none";
      }).catch(() => null);

      for (const [label, kind] of [
        ["New Consultation", "appointment"],
        ["New Order", "order"],
        ["New user account", "user"],
        ["New Product", "product"],
      ]) {
        const dialog = await openCreation(page, label);
        results.push({ viewport: viewport.width, kind, ...(await inspectDialog(dialog, viewport, kind)) });

        if (kind === "appointment") {
          if (await dialog.getByText("Consultation type", { exact: true }).count()) {
            throw new Error("Appointment exposes a consultation type control");
          }
          if (await dialog.locator(".consultation-week-day").count() !== 5) {
            throw new Error("Appointment does not show five compact date choices");
          }
        }

        if (kind === "order") {
          for (const labelText of ["Payment status", "Delivery method", "Fulfilment note"]) {
            if (!await dialog.getByText(labelText, { exact: false }).count()) throw new Error(`Order missing ${labelText}`);
          }
          if (viewport.width === 1440) {
            await dialog.getByRole("button", { name: "Enter customer details manually" }).click();
          }
        }

        if (kind === "user" && await dialog.locator(".user-account-grid").count() !== 1) {
          throw new Error("User modal is missing its identity grid");
        }

        if (kind === "product") {
          const text = await dialog.innerText();
          if (/\bStep\s+[123]\b/i.test(text) || await dialog.locator(".product-create-step-head").count()) {
            throw new Error("Product creator exposes a step indicator");
          }
          const name = dialog.getByText("Product name", { exact: true });
          const images = dialog.getByText("Product images", { exact: true });
          if (await name.count() !== 1 || await images.count() !== 1) throw new Error("Product screen one fields are missing");
          const nameBox = await name.boundingBox();
          const imagesBox = await images.boundingBox();
          if (!nameBox || !imagesBox || nameBox.y >= imagesBox.y) throw new Error("Product name does not precede image gallery");
        }

        await verifyFocusTrap(page, dialog, kind);
        if (viewport.width === 1440 && kind === "order") {
          await verifyDirtyDismissal(page, dialog);
        } else {
          await closeAndVerifyRestore(page, dialog);
        }
      }

      await context.close();
    }

    if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
