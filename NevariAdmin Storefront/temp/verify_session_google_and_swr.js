const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.addInitScript(() => {
    window.google = {
      accounts: {
        id: {
          initialize(options) {
            window.__googleCallback = options.callback;
          },
          renderButton(element) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Sign in with Google";
            button.dataset.testid = "google-sign-in";
            element.appendChild(button);
          },
        },
      },
    };
  });

  await page.route("**/api/nevari-proxy?**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path");
    if (path === "/auth/google-config") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { enabled: true, client_id: "test-client-id" } }),
      });
      return;
    }
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false }) });
  });

  await page.goto("http://127.0.0.1:3002/nurse-registration", { waitUntil: "networkidle" });
  const fetchStatus = await page.evaluate(() => {
    void fetch("/api/nevari-proxy?baseUrl=https%3A%2F%2Fexample.com&path=%2Fprivate-data");
    return "requested";
  });
  console.log(JSON.stringify({ url: page.url(), fetchStatus }));
  const dialog = page.getByRole("dialog", { name: "Sign in to continue" });
  await dialog.waitFor();
  await page.getByTestId("google-sign-in").waitFor();

  const metrics = await dialog.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    width: element.getBoundingClientRect().width,
    viewportWidth: window.innerWidth,
    bodyOverflow: document.body.style.overflow,
  }));
  if (metrics.scrollHeight > metrics.clientHeight || metrics.width > metrics.viewportWidth || metrics.bodyOverflow !== "hidden") {
    throw new Error(`Session modal layout failed: ${JSON.stringify(metrics)}`);
  }

  await page.screenshot({ path: "temp/session-reauth-google-1280.png", fullPage: true });
  console.log(JSON.stringify({ googleButton: true, metrics, consoleErrors: errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
