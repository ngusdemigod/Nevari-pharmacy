const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");
const TEST_ORIGIN = String(process.env.TEST_ORIGIN || "http://127.0.0.1:3000").replace(/\/+$/, "");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 375, height: 812 }]) {
    const context = await browser.newContext({ viewport });
    let readCount = 0;
    let writeCount = 0;
    let authCount = 0;

    await context.route("https://www.google.com/recaptcha/api.js**", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: 'window.grecaptcha={ready:function(callback){callback();},execute:function(){return Promise.resolve("reauth-token");}};',
    }));
    await context.route("**/api/session-test-read", (route) => {
      readCount += 1;
      return route.fulfill({
        status: readCount === 1 ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(readCount === 1 ? { error: { code: "session_expired" } } : { ok: true }),
      });
    });
    await context.route("**/api/session-test-write", (route) => {
      writeCount += 1;
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "session_expired" } }),
      });
    });
    await context.route("**/api/nevari-proxy?**", (route) => {
      const path = new URL(route.request().url()).searchParams.get("path");
      if (path === "/auth/login") {
        authCount += 1;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              access_token: "server-session",
              refresh_token: "server-session",
              expires_in: 900,
              user: { id: 77, display_name: "Session Test", roles: ["patient"] },
            },
          }),
        });
      }
      return route.continue();
    });

    const page = await context.newPage();
    await page.goto(`${TEST_ORIGIN}/consultation`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const draft = page.locator("form textarea").first();
    await draft.fill("Unsaved consultation draft");
    const startingUrl = page.url();

    await page.evaluate(() => {
      window.__sessionRead = fetch("/api/session-test-read").then((response) => response.status);
    });
    const dialog = page.getByRole("dialog", { name: "Sign in to continue" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByLabel("Email").fill("patient@example.com");
    await dialog.getByLabel("Password").fill("Password123");
    await dialog.getByRole("button", { name: "Sign in and continue" }).click();
    await dialog.waitFor({ state: "detached" });
    const readStatus = await page.evaluate(() => window.__sessionRead);

    await page.evaluate(() => {
      window.__sessionWrite = fetch("/api/session-test-write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: "must-not-replay" }),
      }).then((response) => response.status);
    });
    const secondDialog = page.getByRole("dialog", { name: "Sign in to continue" });
    await secondDialog.waitFor({ state: "visible" });
    const writeStatus = await page.evaluate(() => window.__sessionWrite);
    await secondDialog.getByLabel("Email").fill("patient@example.com");
    await secondDialog.getByLabel("Password").fill("Password123");
    await secondDialog.getByRole("button", { name: "Sign in and continue" }).click();
    await secondDialog.waitFor({ state: "detached" });

    const result = {
      viewport: viewport.name,
      sameUrl: page.url() === startingUrl,
      draftPreserved: await draft.inputValue() === "Unsaved consultation draft",
      readRetried: readCount === 2 && readStatus === 200,
      writeNotRetried: writeCount === 1 && writeStatus === 401,
      authenticatedTwice: authCount === 2,
      bodyUnlocked: await page.evaluate(() => document.body.style.overflow === ""),
    };
    await page.screenshot({ path: `temp/session-reauth-${viewport.name}.png`, fullPage: true });
    results.push(result);
    await context.close();
  }

  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => Object.values(result).some((value) => value === false))) {
    throw new Error("Session reauthentication verification failed.");
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
