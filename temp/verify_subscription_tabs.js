const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const BASE_URL = "http://localhost:3100";
const history = {
  items: [
    { id: "payment-1", type: "payment", status: "successful", title: "Payment successful", description: "Nevari Access Pro subscription payment", amount: 5000, currency: "NGN", reference: "SUB-OK-001", occurred_at: "2026-07-14T08:00:00Z" },
    { id: "payment-2", type: "payment", status: "failed", title: "Payment failed", description: "Nevari Access Pro subscription payment", amount: 5000, currency: "NGN", reference: "SUB-FAIL-002", occurred_at: "2026-06-14T08:00:00Z" },
    { id: "status-3", type: "subscription", status: "deactivated", title: "Subscription deactivated", description: "Nevari Access Pro membership status changed", amount: 0, currency: "NGN", reference: "", occurred_at: "2026-05-14T08:00:00Z" },
    { id: "status-4", type: "subscription", status: "paused", title: "Subscription paused", description: "Nevari Access Pro membership status changed", amount: 0, currency: "NGN", reference: "", occurred_at: "2026-04-14T08:00:00Z" },
  ],
  page: 1,
  per_page: 50,
  total: 4,
  total_pages: 1,
};

function subscriptionPayload(active) {
  if (!active) {
    return { plan: "Free", plan_key: "free", status: "free", frequency: "free", amount: 5000, currency: "NGN", entitlements: [] };
  }
  return {
    plan: "Nevari Access Pro",
    plan_key: "nevari_access_pro",
    tier: "pro",
    status: "active",
    frequency: "monthly",
    amount: 5000,
    amount_kobo: 5000,
    currency: "NGN",
    start_date: "2026-01-10T08:00:00Z",
    next_payment_date: "2026-08-10T08:00:00Z",
    entitlements: ["therapy_management", "refills"],
    can_refill: true,
    can_access_therapy_management: true,
  };
}

async function openAccessPage(browser, { active, cancelMode = "none", viewport }) {
  let activeState = active;
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("nevari_patient_dashboard_session", JSON.stringify({
      baseUrl: "https://example.test",
      frontendType: "patient_dashboard",
      frontendOrigin: window.location.origin,
      frontendUrl: `${window.location.origin}/dashboard`,
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: { id: 8101, display_name: "Test Patient", email: "patient@example.test", role: "customer", roles: ["customer"] },
    }));
  });

  const page = await context.newPage();
  await page.route("**/api/nevari-proxy**", async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.searchParams.get("path") || "";
    let data = [];
    if (apiPath === "/dashboard/patient") {
      data = { profile: { id: 8101, email: "patient@example.test", display_name: "Test Patient", roles: ["customer"] }, settings: { displayName: "Test Patient", email: "patient@example.test", phone: "08012345678" }, metrics: {} };
    } else if (apiPath === "/subscriptions/me") {
      data = subscriptionPayload(activeState);
    } else if (apiPath === "/subscriptions/me/history") {
      data = history;
    } else if (apiPath === "/subscriptions/cancel") {
      if (cancelMode === "failure") {
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "Cancellation failed safely." }) });
        return;
      }
      activeState = false;
      data = subscriptionPayload(false);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
  });

  await page.goto(`${BASE_URL}/dashboard?page=subscription-management`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("tab", { name: "Subscription" }).waitFor({ state: "visible", timeout: 60000 });
  return { context, page };
}

async function verifyCancellationReload(browser) {
  const { context, page } = await openAccessPage(browser, { active: true, cancelMode: "success", viewport: { width: 1440, height: 1000 } });
  try {
    await page.getByRole("button", { name: "Manage Plan" }).click();
    await page.getByRole("button", { name: "Cancel Plan" }).click();
    const reload = page.waitForNavigation({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Cancel Plan" }).click();
    await reload;
    await page.getByRole("button", { name: /Subscribe for/i }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }

  const failed = await openAccessPage(browser, { active: true, cancelMode: "failure", viewport: { width: 1440, height: 1000 } });
  try {
    let navigations = 0;
    failed.page.on("framenavigated", () => { navigations += 1; });
    await failed.page.getByRole("button", { name: "Manage Plan" }).click();
    await failed.page.getByRole("button", { name: "Cancel Plan" }).click();
    await failed.page.getByRole("button", { name: "Cancel Plan" }).click();
    await failed.page.locator(".customer-subscription-dialog-error").waitFor({ state: "visible" });
    await failed.page.waitForTimeout(500);
    if (navigations !== 0) throw new Error("Failed cancellation reloaded the dashboard.");
  } finally {
    await failed.context.close();
  }
}

async function verifySubscribed(browser) {
  const { context, page } = await openAccessPage(browser, { active: true, viewport: { width: 1440, height: 1000 } });
  try {
    if (await page.getByRole("button", { name: "Back to profile" }).count()) throw new Error("Back button remains on the default Access Pro screen.");
    if (await page.getByText("Renewal cancelled", { exact: true }).count()) throw new Error("Renewal cancelled remains on the default Access Pro screen.");
    await page.getByRole("button", { name: "Manage Plan" }).waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "History" }).click();
    for (const label of ["Payment successful", "Payment failed", "Subscription deactivated", "Subscription paused"]) {
      await page.getByText(label, { exact: true }).waitFor({ state: "visible" });
    }
    await page.getByText("NGN 5,000", { exact: false }).first().waitFor({ state: "visible" }).catch(async () => {
      await page.getByText(/5,000/).first().waitFor({ state: "visible" });
    });
  } finally {
    await context.close();
  }
}

async function verifyFreeMobile(browser) {
  const { context, page } = await openAccessPage(browser, { active: false, viewport: { width: 390, height: 844 } });
  try {
    const accessPaywallText = await page.locator(".subscription-shell").innerText();
    await page.getByRole("button", { name: "Open menu" }).click();
    const accessLink = page.getByRole("button", { name: "Nevari Access Pro" });
    await accessLink.waitFor({ state: "visible" });
    if (!(await accessLink.evaluate((node) => node.classList.contains("active")))) throw new Error("Access Pro drawer link is not active.");
    await accessLink.click();
    await page.locator(".customer-mobile-drawer-layer.open").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /Subscribe for/i }).waitFor({ state: "visible" });
    if (await page.getByText("Renewal cancelled", { exact: true }).count()) throw new Error("Renewal cancelled appears for a free patient.");
    if (await page.getByRole("button", { name: "Back to profile" }).count()) throw new Error("Back button appears on mobile.");
    await page.getByRole("tab", { name: "History" }).click();
    await page.getByText("Payment history", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "Subscription" }).click();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Medication Therapy Management" }).click();
    await page.locator(".subscription-shell").waitFor({ state: "visible" });
    const mtmPaywallText = await page.locator(".subscription-shell").innerText();
    if (mtmPaywallText !== accessPaywallText) throw new Error("Access Pro and MTM non-Pro paywalls differ.");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > 390) throw new Error(`Mobile Access Pro page overflows horizontally: ${scrollWidth}px.`);
  } finally {
    await context.close();
  }
}

async function verifyProfileReminderDismissal(browser) {
  const { context, page } = await openAccessPage(browser, { active: false, viewport: { width: 1440, height: 1000 } });
  try {
    const openReminder = async () => {
      await page.goto(`${BASE_URL}/dashboard?page=overview`, { waitUntil: "networkidle" });
      await page.getByRole("dialog", { name: /Keep your profile up to date/i }).waitFor({ state: "visible" });
    };
    await openReminder();
    await page.getByRole("button", { name: "Dismiss profile reminder" }).click();
    await page.getByRole("dialog", { name: /Keep your profile up to date/i }).waitFor({ state: "hidden" });
    await openReminder();
    await page.getByRole("button", { name: "Remind me later" }).click();
    await page.getByRole("dialog", { name: /Keep your profile up to date/i }).waitFor({ state: "hidden" });
    await openReminder();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: /Keep your profile up to date/i }).waitFor({ state: "hidden" });
    await openReminder();
    await page.locator(".customer-profile-reminder-overlay").click({ position: { x: 4, y: 4 } });
    await page.getByRole("dialog", { name: /Keep your profile up to date/i }).waitFor({ state: "hidden" });
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await verifySubscribed(browser);
    await verifyFreeMobile(browser);
    await verifyCancellationReload(browser);
    console.log(JSON.stringify({ ok: true, subscribedDesktop: true, freeMobile: true, historyStatuses: true, mobileDrawer: true, sharedPaywall: true, cancellationReload: true }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
