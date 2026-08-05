const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.setContent(`
        <main class="staff-fullscreen-modal detail-flat-modal staff-directory-detail-modal">
          <section class="staff-access-section">
            <label class="detail-field">
              <span>Role</span>
              <select aria-label="Role"><option>Administrator</option></select>
            </label>
            <div>
              <h3>Dashboard permissions</h3>
              <p>Remove a tag to revoke access or add an available area.</p>
              <div class="staff-permission-tags">
                ${Array.from({ length: 10 }, (_, index) => `<button class="staff-permission-tag">Permission ${index + 1}</button>`).join("")}
              </div>
              <label class="detail-field">
                <span>Add permission</span>
                <select aria-label="Add permission"><option>Select an area</option></select>
              </label>
            </div>
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });
      await page.addStyleTag({ content: "body { margin: 20px; }" });

      const results = await page.locator(".staff-access-section select").evaluateAll((selects) => selects.map((select) => {
        const box = select.getBoundingClientRect();
        const style = getComputedStyle(select);
        const label = select.closest(".detail-field");
        const arrow = getComputedStyle(label, "::after");
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          radius: style.borderRadius,
          appearance: style.appearance,
          background: style.backgroundColor,
          arrow: arrow.content
        };
      }));

      if (results.length !== 2 || results.some((result) => result.height !== 48 || result.width <= 0 || result.radius !== "12px" || result.background !== "rgb(255, 255, 255)" || result.arrow === "none")) {
        throw new Error(`Invalid Staff Details select styling at ${width}px: ${JSON.stringify(results)}`);
      }

      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      const focusedControl = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      const focusRing = await page.locator('select[aria-label="Role"]').evaluate((select) => getComputedStyle(select).boxShadow);
      if (focusedControl !== "Role") {
        throw new Error(`Keyboard navigation did not reach the Role dropdown at ${width}px.`);
      }
      if (focusRing === "none") {
        throw new Error(`Missing keyboard focus treatment at ${width}px.`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) {
        throw new Error(`Dropdown layout overflows at ${width}px.`);
      }

      console.log(`${width}px`, JSON.stringify({ results, focusRing }));
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
