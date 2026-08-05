const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  const helperUrl = pathToFileURL(path.resolve(__dirname, "../app/components/admin-status.js")).href;
  const { adminStatusTone } = await import(helperUrl);
  const statuses = [
    "completed", "pending_review", "processing", "failed", "refunded",
    "draft", "active", "scheduled", "cancelled", "inactive"
  ];
  const expected = [
    "success", "warning", "processing", "error", "refunded",
    "neutral", "success", "processing", "error", "neutral"
  ];
  const tones = statuses.map(adminStatusTone);

  if (JSON.stringify(tones) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected semantic tones: ${JSON.stringify({ statuses, tones, expected })}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="status-test-grid">
            ${statuses.map((status, index) => (
              `<span class="status-pill ${tones[index]}" data-tone="${tones[index]}">${status.replaceAll("_", " ")}</span>`
            )).join("")}
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });
      await page.addStyleTag({ content: `
        body { margin: 16px; }
        .status-test-grid { display: flex; flex-wrap: wrap; gap: 12px; }
      ` });

      const result = await page.locator(".status-pill").evaluateAll((nodes) => nodes.map((node) => {
        const style = getComputedStyle(node);
        const dot = getComputedStyle(node, "::before");
        return {
          tone: node.dataset.tone,
          text: node.textContent.trim(),
          color: style.color,
          background: style.backgroundColor,
          border: style.borderColor,
          dot: dot.content
        };
      }));

      for (const item of result) {
        if (!item.text || item.dot === "none" || item.dot === "normal") {
          throw new Error(`Status loses its text/dot cue at ${width}px: ${JSON.stringify(item)}`);
        }
        if (item.background === "rgba(0, 0, 0, 0)" || item.color === item.background) {
          throw new Error(`Status has no visible semantic color at ${width}px: ${JSON.stringify(item)}`);
        }
      }

      const palette = new Map(result.map((item) => [item.tone, item.background]));
      if (new Set(palette.values()).size !== palette.size) {
        throw new Error(`Semantic tones share backgrounds at ${width}px: ${JSON.stringify([...palette])}`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) {
        throw new Error(`Status pills introduce horizontal overflow at ${width}px.`);
      }

      console.log(`${width}px`, JSON.stringify([...palette]));
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
