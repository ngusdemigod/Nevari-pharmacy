const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const directory = "D:/dev/nevari-pharmacy-core/temp/flat-detail-modals";
const items = [
  ["Order details reference", "order-details-reference-desktop.png"],
  ["Payment receipt", "payment-receipt-desktop.png"],
  ["Patient details", "patient-details-desktop.png"],
  ["Staff details", "staff-details-desktop.png"],
  ["MTM details", "mtm-details-desktop.png"],
  ["Nurse request details", "nurse-request-details-desktop.png"]
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; background: #e9eef5; font-family: Arial, sans-serif; color: #10233f; }
          h1 { margin: 0 0 20px; font-size: 24px; }
          main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
          figure { margin: 0; padding: 14px; border: 1px solid #cad5e3; border-radius: 16px; background: #fff; }
          figcaption { margin-bottom: 10px; font-size: 15px; font-weight: 700; }
          img { display: block; width: 100%; height: auto; border: 1px solid #d8e2f0; border-radius: 12px; }
        </style>
      </head>
      <body>
        <h1>Nevari flat detail modal comparison</h1>
        <main>
          ${items.map(([label, file]) => {
            const data = fs.readFileSync(path.join(directory, file)).toString("base64");
            return `<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${data}" alt="${label}"></figure>`;
          }).join("")}
        </main>
      </body>
    </html>
  `, { waitUntil: "load" });
  await page.screenshot({
    path: "D:/dev/nevari-pharmacy-core/temp/flat-detail-modals/desktop-comparison.png",
    fullPage: true
  });
  await browser.close();
})();
