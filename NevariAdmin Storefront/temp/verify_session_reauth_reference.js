const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 563, height: 887 }, deviceScaleFactor: 1 });

  await page.route("**/api/nevari-proxy**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path") || "";
    if (path === "/auth/google-config") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { enabled: false, client_id: "" } }) });
    }
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false }) });
  });
  await page.route("**/api/mock-session-expired", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));

  await page.goto("http://127.0.0.1:3002/consultation", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => fetch("/api/nevari-proxy?path=%2Fsso%2Flogout", { method: "POST" }));
  await page.waitForTimeout(150);
  if (await page.locator(".session-reauth-dialog").count()) throw new Error("Logout incorrectly opened session reauthentication.");

  await page.evaluate(() => fetch("/api/mock-session-expired"));
  await page.locator(".session-reauth-dialog").waitFor({ state: "visible" });
  const title = await page.locator("#session-reauth-title").textContent();
  const labels = await page.locator(".session-reauth-form label > span:first-child").allTextContents();
  if (title !== "Log in" || labels.join("|") !== "Email|Password") throw new Error(`Unexpected form copy: ${title} / ${labels.join("|")}`);
  await page.screenshot({ path: "temp/session-reauth-reference.png", fullPage: true });

  const box = await page.locator(".session-reauth-dialog").boundingBox();
  console.log(JSON.stringify({ title, labels, box, logoutDidNotTrigger: true }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
