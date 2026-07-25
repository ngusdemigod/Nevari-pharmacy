const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3003/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(await page.evaluate(async () => {
    const css = await fetch(Array.from(document.styleSheets)[0].href).then((response) => response.text());
    return {
      marker: css.includes('Profile tabs and notification controls'),
      profileMatches: [...css.matchAll(/[^{}]*customer-profile-desktop-tabs[^{}]*\{[^}]*\}/g)].map((match) => match[0]).slice(-8),
      toggleMatches: [...css.matchAll(/[^{}]*customer-profile-desktop-notifications input[^{}]*\{[^}]*\}/g)].map((match) => match[0]).slice(-4),
    };
  }));
  await browser.close();
})();
