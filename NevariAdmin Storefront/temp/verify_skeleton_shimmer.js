const { chromium } = require("playwright");
const path = require("path");

async function inspect(page) {
  return page.locator(".skeleton").first().evaluate((node) => {
    const base = getComputedStyle(node);
    const shimmer = getComputedStyle(node, "::after");
    return {
      base: base.backgroundColor,
      animationName: shimmer.animationName,
      animationDuration: shimmer.animationDuration,
      animationTiming: shimmer.animationTimingFunction,
      gradient: shimmer.backgroundImage,
      transform: shimmer.transform
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 600 } });
      await page.setContent(`
        <main style="padding:24px;background:#fff">
          <div class="skeleton skeleton-block"></div>
          <div style="margin-top:18px;background:#f6f0e8;padding:20px"><span class="skeleton skeleton-line skeleton-line-lg" style="display:block"></span></div>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });

      const start = await inspect(page);
      await page.waitForTimeout(180);
      const moving = await inspect(page);

      if (start.base === "rgba(0, 0, 0, 0)" || !start.gradient.includes("0.92") || start.animationName !== "nevari-shimmer" || start.animationDuration !== "1.35s" || start.animationTiming !== "linear") {
        throw new Error(`Shimmer contrast/configuration failed at ${width}px: ${JSON.stringify(start)}`);
      }
      if (start.transform === moving.transform) {
        throw new Error(`Shimmer is not visibly moving at ${width}px.`);
      }

      await page.emulateMedia({ reducedMotion: "reduce" });
      const reduced = await inspect(page);
      if (reduced.animationName !== "none") {
        throw new Error(`Reduced-motion preference is not respected at ${width}px.`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) {
        throw new Error(`Skeleton causes overflow at ${width}px.`);
      }

      console.log(`${width}px`, JSON.stringify({ start, movingTransform: moving.transform, reducedAnimation: reduced.animationName }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
