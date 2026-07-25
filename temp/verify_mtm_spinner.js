const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const loaderHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparing MTM PDF</title><style>html,body{width:100%;height:100%;margin:0}body{display:grid;place-items:center;background:#f4f6f8}.nevari-branded-spinner{display:inline-grid;width:48px;height:48px;place-items:center;border-radius:999px;background:linear-gradient(rgba(255,255,255,.9),rgba(255,255,255,.9)),url('/Frame 95621.png') center/cover no-repeat;position:relative}.nevari-branded-spinner:after{content:"";width:48px;height:48px;border-radius:999px;border:3px solid rgba(11,50,109,.18);border-top-color:#0b326d;animation:spin .8s linear infinite;box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.nevari-branded-spinner:after{animation:none;border-color:rgba(11,50,109,.35);border-top-color:#0b326d}}</style></head><body><span class="nevari-branded-spinner" role="status" aria-label="Preparing MTM assessment PDF"><span class="sr-only">Preparing MTM assessment PDF</span></span></body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.setContent(loaderHtml);
    const spinner = page.getByRole("status", { name: "Preparing MTM assessment PDF" });
    await spinner.waitFor({ state: "visible" });
    const bodyText = await page.locator("body").innerText();
    if (bodyText.includes("Preparing your MTM assessment PDF...")) throw new Error("Legacy preparation text is visible.");
    const pseudoAnimation = await spinner.evaluate((element) => getComputedStyle(element, "::after").animationName);
    if (pseudoAnimation !== "none") throw new Error(`Reduced-motion spinner still animates: ${pseudoAnimation}`);
    const metrics = await spinner.boundingBox();
    if (!metrics || metrics.width !== 48 || metrics.height !== 48) throw new Error("Branded spinner dimensions are incorrect.");
    console.log(JSON.stringify({ ok: true, accessibleName: await spinner.getAttribute("aria-label"), reducedMotion: pseudoAnimation, dimensions: metrics }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
