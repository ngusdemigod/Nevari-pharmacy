const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

async function loginAndInspect() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3001/login", { waitUntil: "networkidle" });
  const loginPayload = await page.evaluate(async () => {
    const endpoint = new URL("/api/nevari-proxy", window.location.origin);
    endpoint.searchParams.set("baseUrl", "https://nevarihealth.com");
    endpoint.searchParams.set("path", "/auth/login");
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Nevari-Frontend-Type": "patient_dashboard",
        "X-Nevari-Frontend-Origin": window.location.origin,
      },
      body: JSON.stringify({
        username: "Ncustomer",
        password: "Ncustomer@2026!!!",
        frontend_type: "patient_dashboard",
        frontend_origin: window.location.origin,
        frontend_url: window.location.href,
      }),
    });
    return response.json();
  });
  const data = loginPayload.data;
  await page.evaluate(({ expiresIn, user }) => {
    window.localStorage.setItem("nevari_global_auth_security_settings", JSON.stringify({ globalTwoStepVerification: false }));
    window.localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
      baseUrl: "https://nevarihealth.com",
      frontendType: "patient_dashboard",
      frontendOrigin: window.location.origin,
      frontendUrl: `${window.location.origin}/dashboard`,
      paired: true,
      siteName: "",
      siteLogo: "",
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + (Number(expiresIn || 0) * 1000),
      user,
    }));
  }, { expiresIn: data.expires_in, user: data.user });
  await page.goto("http://localhost:3001/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /open menu/i }).first().click();
  await page.locator(".customer-mobile-drawer-layer.open").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /appointments/i }).first().click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "temp/playwright-customer-verify/appointments-inspect.png", fullPage: false });
  const result = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".customer-mobile-visit-row")).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent.trim().slice(0, 120),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    });
    const tabs = Array.from(document.querySelectorAll(".customer-mobile-pill-tab")).map((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        text: el.textContent.trim(),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        color: style.color,
        background: style.backgroundColor,
        display: style.display,
        visibility: style.visibility,
      };
    });
    const list = document.querySelector(".customer-mobile-appointment-history-list, .customer-mobile-empty-state");
    const shell = document.querySelector(".customer-appointment-layout");
    const panel = document.querySelector(".customer-appointment-list-panel");
    const listRect = list?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    return {
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.slice(0, 500),
      rootHtml: document.body.innerHTML.slice(0, 1200),
      bodyHeight: document.body.scrollHeight,
      rows,
      tabs,
      listText: list?.textContent?.trim() || "",
      listRect: listRect ? { top: listRect.top, bottom: listRect.bottom, height: listRect.height } : null,
      shellRect: shellRect ? { top: shellRect.top, bottom: shellRect.bottom, height: shellRect.height } : null,
      panelRect: panelRect ? { top: panelRect.top, bottom: panelRect.bottom, height: panelRect.height } : null,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

loginAndInspect().catch((error) => {
  console.error(error);
  process.exit(1);
});
