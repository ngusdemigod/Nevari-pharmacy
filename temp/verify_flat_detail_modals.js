const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const outputDir = "D:/dev/nevari-pharmacy-core/temp/flat-detail-modals";

const order = {
  id: 2964,
  number: "2964",
  status: "pending",
  payment_status: "pending",
  rx_status: "clear",
  total: 25000,
  created_at: "2026-07-23T00:13:00Z",
  customer_id: 42,
  billing: {
    first_name: "Angus",
    last_name: "Customer",
    email: "angus.customer@example.test",
    phone: "+234 800 000 0000",
    address_1: "12 Nevari Avenue",
    city: "Lagos",
    state: "Lagos",
    country: "NG"
  },
  shipping: {
    first_name: "Angus",
    last_name: "Customer",
    address_1: "12 Nevari Avenue",
    city: "Lagos",
    state: "Lagos",
    country: "NG"
  },
  totals: {
    subtotal: 25000,
    grand_total: 25000,
    items_count: 2,
    shipping_total: 0,
    shipping_tax: 0,
    discount_total: 0,
    tax_total: 0
  },
  items: [
    { id: 1, name: "Loratadine 10mg", sku: "NEV-LOR-10", quantity: 1, unit_price: 10000, total: 10000, stock_status: "instock" },
    { id: 2, name: "Vitamin C 1000mg", sku: "NEV-VIT-C", quantity: 1, unit_price: 15000, total: 15000, stock_status: "instock" }
  ],
  order_notes: []
};

const patient = {
  id: 42,
  user_id: 42,
  display_name: "Angus Customer",
  first_name: "Angus",
  last_name: "Customer",
  user_email: "angus.customer@example.test",
  email: "angus.customer@example.test",
  roles: ["customer"],
  account_status: "approved",
  order_count: 3,
  total_spend: 75000,
  appointments: 2,
  prescriptions: 1,
  last_activity: "2026-07-23T10:00:00Z"
};

const mtmRequest = {
  id: 71,
  request_reference: "MTM-000071",
  customer_user_id: 42,
  patient: { name: "Angus Customer" },
  status: "submitted",
  status_label: "Submitted",
  created_at: "2026-07-23T09:30:00Z",
  scheduled_at: null,
  attendance_status: "pending",
  assigned_pharmacist_name: "",
  order_id: 2964,
  medication_profile: {
    medications: [{ name: "Loratadine 10mg" }, { name: "Vitamin C 1000mg" }],
    notes: "Review dosage and timing."
  },
  medical_history: { primaryDiagnosis: "Seasonal allergies" },
  additional_information: { notes: "Patient requested a complete medication review." },
  document: { available: false }
};

const staff = {
  user_id: 88,
  display_name: "Dr Ada Nwosu",
  user_email: "ada.nwosu@example.test",
  managed_role: "doctor",
  roles: ["doctor"],
  account_status: "approved",
  date_joined: "2026-01-12",
  last_activity: "2026-07-23",
  phone: "+234 800 111 2222",
  license_number: "MDCN-TEST-88",
  linked_patients: 14,
  permissions: ["patients", "consultations", "mtm"]
};

const nurseRequest = {
  id: 501,
  reference: "NR-000501",
  patient: { name: "Angus Customer" },
  status: "submitted",
  status_label: "Submitted",
  assignee: null,
  scheduled_at: null
};

const summary = {
  dashboard: {
    currency: "NGN",
    sales: { today: 25000, pending: 25000 },
    orders: { today: 1 },
    products: { total: 2 },
    customers: { total: 1 }
  },
  recent_orders: [order]
};

function response(data, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(data)
  };
}

async function inspectModal(page, selector, name, viewportLabel) {
  const modal = page.locator(selector).first();
  await modal.waitFor({ state: "visible", timeout: 30000 });
  const evidence = await modal.evaluate((element) => {
    const style = getComputedStyle(element);
    const body = element.querySelector(".modal-body, .staff-modal-body");
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      borderRadius: style.borderRadius,
      width: Math.round(element.getBoundingClientRect().width),
      height: Math.round(element.getBoundingClientRect().height),
      bodyOverflowX: body ? body.scrollWidth - body.clientWidth : 0
    };
  });
  if (evidence.backgroundColor !== "rgb(255, 255, 255)") throw new Error(`${name}: modal background is not white`);
  if (evidence.backgroundImage !== "none") throw new Error(`${name}: modal still has a gradient/image`);
  if (evidence.boxShadow !== "none") throw new Error(`${name}: modal still has a shadow`);
  if (evidence.bodyOverflowX > 2) throw new Error(`${name}: modal body overflows horizontally by ${evidence.bodyOverflowX}px`);
  await modal.screenshot({ path: `${outputDir}/${name}-${viewportLabel}.png` });
  return evidence;
}

async function openSection(page, pageId) {
  await page.evaluate((nextPage) => {
    const key = "nevari_admin_storefront_session";
    const session = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...session, currentPage: nextPage }));
  }, pageId);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector(".nevari-admin-storefront", { timeout: 240000 });
  await page.locator(".auth-gate").evaluate((element) => {
    element.hidden = true;
    element.style.display = "none";
  }).catch(() => null);
  await page.waitForTimeout(1200);
}

async function runViewport(browser, viewport, label) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    if (localStorage.getItem("nevari_admin_storefront_session")) return;
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.example.test",
      frontendType: "storefront",
      paired: true,
      siteName: "Nevari Pharmacy",
      accessToken: "mock-server-session",
      refreshToken: "",
      expiresAt: Date.now() + 3600000,
      user: {
        id: 1,
        email: "preview.admin@example.test",
        role: "store_admin",
        roles: ["store_admin"],
        display_name: "Preview Admin"
      },
      currentPage: "payments"
    }));
  });

  await context.route("**/monitoring**", (route) => route.fulfill({ status: 204, body: "" }));
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === "/api/admin/summary") return route.fulfill(response({ success: true, data: summary }));
    if (pathname === "/api/admin/orders") return route.fulfill(response({ success: true, data: [order] }));
    if (pathname === "/api/admin/patients" || pathname === "/api/admin/customers") {
      return route.fulfill(response({ success: true, data: { items: [patient], pagination: { page: 1, pages: 1, total: 1 } } }));
    }
    if (pathname === "/api/admin/mtm") {
      return route.fulfill(response({ success: true, data: { items: [mtmRequest], pagination: { page: 1, pages: 1, total: 1 } } }));
    }
    if (pathname === "/api/admin/users") {
      return route.fulfill(response({ success: true, data: { items: [staff], pagination: { page: 1, pages: 1, total: 1 } } }));
    }
    if (pathname === "/api/admin/care-nurse") {
      return route.fulfill(response({ success: true, data: { items: [nurseRequest] } }));
    }
    if (pathname === "/api/admin/nurses") {
      return route.fulfill(response({ success: true, data: { items: [{ user_id: 95, display_name: "Nurse Ife Okafor" }] } }));
    }
    if (pathname.startsWith("/api/admin/")) {
      return route.fulfill(response({ success: true, data: [] }));
    }
    if (pathname === "/api/nevari-proxy") {
      const proxyPath = url.searchParams.get("path") || "";
      if (proxyPath === `/orders/${order.id}`) return route.fulfill(response({ success: true, data: order }));
      if (proxyPath === "/orders") return route.fulfill(response({ success: true, data: [order] }));
      if (proxyPath === `/nurse-requests/${nurseRequest.id}/documents`) {
        return route.fulfill(response({ success: true, data: { items: [] } }));
      }
      return route.fulfill(response({ success: true, data: [] }));
    }
    return route.fulfill(response({ success: true, data: [] }));
  });

  const page = await context.newPage();
  const consoleErrors = [];
  let stage = "payments";
  page.on("console", async (message) => {
    if (message.type() !== "error") return;
    const values = await Promise.all(message.args().map((argument) => argument.jsonValue().catch(() => null)));
    const location = message.location();
    consoleErrors.push(`${stage}: ${message.text()} @ ${location.url || "unknown"}:${location.lineNumber || 0} ${JSON.stringify(values)}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${stage}: ${error.message}`));

  await page.goto("http://127.0.0.1:3000/admin/storefront", {
    waitUntil: "domcontentloaded",
    timeout: 240000
  });
  await page.waitForSelector(".nevari-admin-storefront", { timeout: 240000 });
  await page.locator(".auth-gate").evaluate((element) => {
    element.hidden = true;
    element.style.display = "none";
  }).catch(() => null);
  await page.waitForTimeout(1500);

  const results = {};

  const paymentRow = page.locator(".payments-table tbody tr").first();
  await paymentRow.click();
  results.payment = await inspectModal(page, ".payment-receipt-detail-modal", "payment-receipt", label);
  await page.locator(".payment-receipt-detail-modal").getByRole("button", { name: "Close payment receipt" }).click();
  await page.locator(".payment-receipt-detail-modal").waitFor({ state: "detached", timeout: 30000 });

  stage = "orders";
  await openSection(page, "orders");
  await page.locator("table tbody tr").first().click();
  await page.locator(".order-modal").waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".order-modal").screenshot({ path: `${outputDir}/order-details-reference-${label}.png` });
  await page.locator(".order-modal").getByRole("button", { name: "Close order details" }).click();
  await page.locator(".order-modal").waitFor({ state: "detached", timeout: 30000 });

  stage = "customers";
  await openSection(page, "customers");
  await page.locator(".patient-directory-panel tbody tr").first().click();
  results.patient = await inspectModal(page, ".patient-detail-modal", "patient-details", label);
  await page.locator(".patient-detail-modal").getByRole("button", { name: "Close patient details" }).click();
  await page.locator(".patient-detail-modal").waitFor({ state: "detached", timeout: 30000 });

  stage = "doctors";
  await openSection(page, "doctors");
  await page.locator(".staff-directory-panel tbody tr").first().click();
  results.staff = await inspectModal(page, ".staff-directory-detail-modal", "staff-details", label);
  await page.getByRole("button", { name: "Close staff details" }).click();
  await page.locator(".staff-directory-detail-modal").waitFor({ state: "detached", timeout: 30000 });

  stage = "mtm";
  await openSection(page, "mtm");
  await page.locator(".mtm-table-panel tbody tr").first().click();
  results.mtm = await inspectModal(page, ".mtm-detail-modal", "mtm-details", label);
  await page.locator(".mtm-detail-modal").getByRole("button", { name: "Close MTM preview" }).click();
  await page.locator(".mtm-detail-modal").waitFor({ state: "detached", timeout: 30000 });

  stage = "nurse-requests";
  await openSection(page, "nurse-requests");
  await page.getByRole("button", { name: "Manage" }).first().click();
  results.nurse = await inspectModal(page, ".nurse-request-details-modal", "nurse-request-details", label);
  await page.locator(".nurse-request-details-modal").getByRole("button", { name: "Close Nurse Request details" }).click();
  await page.locator(".nurse-request-details-modal").waitFor({ state: "detached", timeout: 30000 });

  const overlayCount = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
  const bodyHasContent = (await page.locator("body").innerText()).trim().length > 0;
  if (overlayCount) throw new Error(`Framework error overlay detected at ${label}`);
  if (!bodyHasContent) throw new Error(`Blank page detected at ${label}`);
  if (consoleErrors.length) throw new Error(`Browser errors at ${label}: ${consoleErrors.join(" | ")}`);

  await context.close();
  return results;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await runViewport(browser, { width: 1440, height: 900 }, "desktop");
    const mobile = await runViewport(browser, { width: 375, height: 812 }, "mobile");
    console.log(JSON.stringify({ desktop, mobile, status: "passed" }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
