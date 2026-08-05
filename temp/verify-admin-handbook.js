const fs = require("fs");
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../NevariAdmin Storefront/node_modules/playwright"));
const { PDFDocument } = require(path.resolve(__dirname, "../NevariAdmin Storefront/node_modules/pdf-lib"));

(async () => {
  const source = path.resolve(__dirname, "../docs/nevari-admin-dashboard-handbook.html");
  const pdfPath = path.resolve(__dirname, "../docs/Nevari-Administrator-Dashboard-Handbook.pdf");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`file:///${source.replace(/\\/g, "/")}`, { waitUntil: "load" });
  const report = await page.evaluate(() => ({
    title: document.title,
    sections: document.querySelectorAll("section.page").length,
    images: [...document.images].map((image) => ({
      source: image.getAttribute("src"),
      loaded: image.complete && image.naturalWidth > 0
    }))
  }));
  await page.screenshot({
    path: path.resolve(__dirname, "admin-handbook-full-preview.png"),
    fullPage: true
  });
  const pdf = await PDFDocument.load(fs.readFileSync(pdfPath));
  report.pdfPages = pdf.getPageCount();
  report.consoleErrors = errors;
  report.failedImages = report.images.filter((image) => !image.loaded);
  console.log(JSON.stringify(report, null, 2));
  if (report.sections !== 16 || report.pdfPages !== 16 || report.failedImages.length || errors.length) {
    process.exitCode = 1;
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
