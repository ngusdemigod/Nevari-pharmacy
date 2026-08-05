const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <div class="staff-row-actions">
            <button class="staff-action-icon staff-action-ban" aria-label="Ban"></button>
            <button class="staff-action-icon staff-action-suspend" aria-label="Suspend"></button>
            <button class="staff-action-icon staff-action-reset-password" aria-label="Reset password"></button>
          </div>
          <div class="staff-modal-actions">
            <button class="pill-button staff-modal-action staff-action-ban">Ban</button>
            <button class="pill-button staff-modal-action staff-action-suspend">Suspend</button>
            <button class="pill-button staff-modal-action staff-action-reset-password">Reset password</button>
          </div>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });

      const styles = await page.locator(".staff-row-actions button").evaluateAll((buttons) => buttons.map((button) => {
        const style = getComputedStyle(button);
        return {
          color: style.color,
          border: style.borderColor,
          background: style.backgroundColor
        };
      }));

      if (new Set(styles.map((style) => style.background)).size !== 3) {
        throw new Error(`Staff actions are not semantically differentiated at ${width}px: ${JSON.stringify(styles)}`);
      }

      await page.locator('[aria-label="Ban"]').focus();
      const outline = await page.locator('[aria-label="Ban"]').evaluate((button) => getComputedStyle(button).outlineStyle);
      if (outline === "none") throw new Error(`Missing keyboard focus at ${width}px.`);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(`Staff action controls overflow at ${width}px.`);

      console.log(`${width}px`, JSON.stringify({ styles, outline, overflow }));
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
