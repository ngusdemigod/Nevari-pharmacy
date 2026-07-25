const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
  await page.setContent(`
    <main class="nevari-admin-storefront">
      <section class="mtm-table-panel">
        <table><tbody>
          <tr role="button" tabindex="0"><td>MTM-000001</td><td>Submitted</td></tr>
          <tr><td>Loading row</td><td>Not interactive</td></tr>
        </tbody></table>
      </section>
    </main>
  `);
  await page.addStyleTag({ path: path.resolve(__dirname, "../NevariAdmin Storefront/app/globals.css") });

  const interactiveRow = page.locator('tr[role="button"]');
  const interactiveCell = interactiveRow.locator("td").first();
  const passiveRow = page.locator("tbody tr").nth(1);
  const beforeHover = {
    rowCursor: await interactiveRow.evaluate((element) => getComputedStyle(element).cursor),
    cellCursor: await interactiveCell.evaluate((element) => getComputedStyle(element).cursor),
    passiveCursor: await passiveRow.evaluate((element) => getComputedStyle(element).cursor),
  };
  await interactiveCell.hover();
  const hoverBackground = await interactiveCell.evaluate((element) => getComputedStyle(element).backgroundColor);
  await interactiveRow.focus();
  const focusOutline = await interactiveRow.evaluate((element) => getComputedStyle(element).outlineStyle);
  const result = { ...beforeHover, hoverBackground, focusOutline };

  await page.screenshot({ path: "temp/mtm-row-cursor.png", fullPage: true });
  await browser.close();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (
    result.rowCursor !== "pointer"
    || result.cellCursor !== "pointer"
    || result.passiveCursor === "pointer"
    || result.hoverBackground !== "rgb(246, 249, 252)"
    || result.focusOutline !== "solid"
  ) process.exit(1);
})();
