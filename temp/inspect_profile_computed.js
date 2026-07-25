const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3003/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.innerHTML = '<div class="customer-profile-desktop-tabs"><button class="active">User</button></div><div class="customer-profile-mobile-app"><div class="customer-mobile-profile-tabs"><button class="customer-mobile-pill-tab active">User</button></div></div>';
    document.body.appendChild(fixture);
    return Array.from(fixture.querySelectorAll('button')).map((button) => ({
      className: button.className,
      background: getComputedStyle(button).backgroundColor,
      color: getComputedStyle(button).color,
      matched: Array.from(document.styleSheets).flatMap((sheet) => {
        try { return Array.from(sheet.cssRules); } catch { return []; }
      }).filter((rule) => rule.selectorText && button.matches(rule.selectorText)).slice(-8).map((rule) => rule.cssText),
    }));
  }));
  await browser.close();
})();
