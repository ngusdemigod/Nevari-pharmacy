const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3003/admin/storefront/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(await page.evaluate(async () => {
    const css = await fetch(Array.from(document.styleSheets)[0].href).then((response) => response.text());
    const matches = [...css.matchAll(/[^{}]*auth-gate[^{}]*\{[^}]*\}/g)].map((match) => match[0]);
    return {
      hasDesktopAsset: css.includes('Frame 1984078457'),
      hasMobileAsset: css.includes('Frame 1984078458'),
      matches: matches.slice(0, 10),
      noneRules: css.match(/[^{}]*background-image:\s*none[^{}]*\}/g)?.slice(-10) || [],
    };
  }));
  await browser.close();
})();
