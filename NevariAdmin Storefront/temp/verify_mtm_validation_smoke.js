const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:3006/login", { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible", timeout: 30000 });
  const title = await page.title();
  const hasLogin = await page.getByText(/Log in|Sign in/i).first().isVisible({ timeout: 10000 }).catch(() => false);
  await page.screenshot({ path: "temp/playwright-customer-verify/mtm-validation-smoke-login.png", fullPage: true });
  await browser.close();
  if (!hasLogin) throw new Error("Login screen did not render for MTM validation smoke check.");
  console.log(JSON.stringify({ ok: true, title, hasLogin }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});