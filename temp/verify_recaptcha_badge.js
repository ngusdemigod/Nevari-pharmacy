const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);

  const results = {};
  for (const [name, path] of [
    ["login", "/login"],
    ["nurse", "/nurse-registration"],
    ["reset", "/reset-password?key=test&login=test"],
  ]) {
    await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: "commit", timeout: 60000 });
    await page.locator(".recaptcha-disclosure").waitFor({ state: "visible" });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".recaptcha-disclosure")).fontSize === "11px",
    );
    await page.evaluate(() => {
      const badge = document.createElement("div");
      badge.className = "grecaptcha-badge";
      badge.textContent = "reCAPTCHA";
      document.body.appendChild(badge);
    });

    results[name] = await page.evaluate(() => {
      const disclosure = document.querySelector(".recaptcha-disclosure");
      const badge = document.querySelector(".grecaptcha-badge");
      return {
        disclosureVisible: Boolean(disclosure && disclosure.getBoundingClientRect().height),
        disclosureFontSize: getComputedStyle(disclosure).fontSize,
        privacyLink: disclosure?.querySelector('a[href="https://policies.google.com/privacy"]')?.href,
        termsLink: disclosure?.querySelector('a[href="https://policies.google.com/terms"]')?.href,
        badgeVisibility: getComputedStyle(badge).visibility,
        badgeRuleLoaded: Array.from(document.styleSheets).some((sheet) => {
          try {
            return Array.from(sheet.cssRules).some((rule) => rule.selectorText === ".grecaptcha-badge");
          } catch {
            return false;
          }
        }),
      };
    });
  }

  await page.goto("http://127.0.0.1:3000/login", { waitUntil: "commit", timeout: 60000 });
  await page.locator(".recaptcha-disclosure").waitFor({ state: "visible" });
  await page.screenshot({ path: "temp/recaptcha-badge-hidden.png", fullPage: true });
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

