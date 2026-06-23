const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

async function probePort(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    const response = await page.goto(`http://127.0.0.1:${port}/admin/storefront/login`, {
      waitUntil: "domcontentloaded",
      timeout: 8000,
    });
    await page.waitForTimeout(1200);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasStorefront = /Signin to your storefront|Storefront logo|Nevari|Sign in to your admin dashboard|Log in/i.test(bodyText);
    return {
      port,
      status: response ? response.status() : null,
      hasStorefront,
      bodyText,
    };
  } catch (error) {
    return {
      port,
      error: String(error && error.message ? error.message : error),
      hasStorefront: false,
      bodyText: "",
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ports = [3000, 3001, 3002, 3003];
  const probes = [];

  for (const port of ports) {
    probes.push(await probePort(browser, port));
  }

  const match = probes.find((item) => item.hasStorefront);
  if (!match) {
    await browser.close();
    console.log(JSON.stringify({ ok: false, reason: "storefront_not_found", probes }, null, 2));
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleMessages = [];
  page.on("console", (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`http://127.0.0.1:${match.port}/admin/storefront/login`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await page.evaluate(() => {
    window.localStorage.removeItem("nevari_admin_storefront_session");
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(6000);

  const subtitle = await page.locator(".auth-subtitle").first().textContent().catch(() => "");
  const authTitle = await page.locator(".auth-title").first().textContent().catch(() => "");
  const verificationHeadingCount = await page.getByRole("heading", { name: /verify your login/i }).count();
  const verificationCodeCount = await page.locator('input[name="verificationCode"]').count();
  const signInVisible = await page.getByRole("button", { name: /sign in/i }).count();
  const bodyText = await page.locator("body").innerText().catch(() => "");

  await page.screenshot({ path: "temp/admin-otp-verify.png", fullPage: true });
  await browser.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        port: match.port,
        authTitle,
        subtitle,
        verificationHeadingCount,
        verificationCodeCount,
        signInVisible,
        bodyText: bodyText.slice(0, 500),
        consoleMessages,
        screenshot: "temp/admin-otp-verify.png",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
