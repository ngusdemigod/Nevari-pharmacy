const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  const handbookPath = path.resolve(__dirname, "../docs/nevari-admin-dashboard-handbook.html");
  const handbookDir = path.dirname(handbookPath);
  let handbookHtml = fs.readFileSync(handbookPath, "utf8");
  handbookHtml = handbookHtml.replace(/src="([^"]+)"/g, (match, source) => {
    if (/^(data:|https?:)/i.test(source)) return match;
    const imagePath = path.resolve(handbookDir, source);
    const extension = path.extname(imagePath).slice(1).toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    const encoded = fs.readFileSync(imagePath).toString("base64");
    return `src="data:${mime};base64,${encoded}"`;
  });
  await page.setContent(handbookHtml, { waitUntil: "networkidle" });

  await page.emulateMedia({ media: "print" });
  await page.screenshot({
    path: path.resolve(__dirname, "nevari-admin-dashboard-handbook-preview.png"),
    fullPage: true,
  });
  await page.pdf({
    path: path.resolve(__dirname, "../docs/Nevari-Admin-Dashboard-Walkthrough.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });

  const diagnostics = await page.evaluate(() => ({
    title: document.title,
    pages: document.querySelectorAll(".page").length,
    images: Array.from(document.images).map((image) => ({
      src: image.getAttribute("src"),
      loaded: image.complete && image.naturalWidth > 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  console.log(JSON.stringify(diagnostics, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
