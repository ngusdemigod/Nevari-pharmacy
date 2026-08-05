const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../NevariAdmin Storefront/node_modules/playwright"));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const source = path.resolve(__dirname, "../docs/nevari-admin-dashboard-handbook.html");
  const output = path.resolve(__dirname, "../docs/Nevari-Administrator-Dashboard-Handbook.pdf");

  await page.goto(`file:///${source.replace(/\\/g, "/")}`, { waitUntil: "load" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false
  });
  console.log(output);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
