const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(process.cwd(), "NevariAdmin Storefront", "node_modules", "playwright"));

const source = fs.readFileSync(path.join(process.cwd(), "NevariAdmin Storefront", "app", "_customer-dashboard.js"), "utf8");
const modalStart = source.indexOf("function OrderDetailsModal");
const modalEnd = source.indexOf("function AvailableTimePage", modalStart);
const modalSource = source.slice(modalStart, modalEnd);

if (!modalSource.includes('String(order?.status || "").toLowerCase() === "completed"')) {
  throw new Error("Order details modal does not gate refills to completed orders.");
}
if (modalSource.indexOf("Open receipt") < 0 || modalSource.indexOf("Refill Order") < 0 || modalSource.indexOf("Open receipt") > modalSource.indexOf("Refill Order")) {
  throw new Error("Order details modal does not place Open receipt before Refill Order.");
}
if (!source.includes('String(order.status || "").toLowerCase() === "completed" && (order.can_refill || order.refill_available)')) {
  throw new Error("Mobile refill action is not restricted to completed refillable orders.");
}

const orders = [
  { number: "C-1001", status: "completed", canRefill: true },
  { number: "P-1002", status: "processing", canRefill: true },
  { number: "C-1003", status: "completed", canRefill: false },
];

function renderOrders() {
  return orders.map((order) => {
    const showRefill = order.status === "completed" && order.canRefill;
    return `<article class="order-card" data-order="${order.number}">
      <strong>Order ${order.number}</strong><span>${order.status}</span>
      <div class="actions">
        ${order.status === "completed" ? '<button type="button">Open receipt</button>' : ""}
        ${showRefill ? '<button type="button">Refill Order</button>' : ""}
      </div>
    </article>`;
  }).join("");
}

async function verifyViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;font:16px Arial;color:#17211b;background:#f6f8f6}.dashboard{max-width:1100px;margin:auto;padding:24px}.orders{display:grid;gap:16px}.order-card{background:white;border:1px solid #dce4de;border-radius:16px;padding:18px;display:grid;gap:12px}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions button{min-height:44px;padding:10px 16px;border-radius:10px;border:1px solid #1b4332;background:white}.actions button:last-child{background:#1b4332;color:white}@media(max-width:480px){.dashboard{padding:16px}.actions{flex-direction:column}.actions button{width:100%}}
  </style></head><body><main class="dashboard"><h1>Patient Orders</h1><section class="orders">${renderOrders()}</section></main></body></html>`);

  const completed = page.locator('[data-order="C-1001"] .actions button');
  const completedLabels = (await completed.allTextContents()).map((value) => value.trim());
  if (JSON.stringify(completedLabels) !== JSON.stringify(["Open receipt", "Refill Order"])) {
    throw new Error(`Completed CTA order is incorrect at ${viewport.width}px: ${JSON.stringify(completedLabels)}`);
  }
  if (await page.locator('[data-order="P-1002"]', { hasText: "Refill Order" }).count()) {
    throw new Error("Processing order exposes Refill Order.");
  }
  if (await page.locator('[data-order="C-1003"]', { hasText: "Refill Order" }).count()) {
    throw new Error("Non-refillable completed order exposes Refill Order.");
  }
  if (/\\bCustomer(s)?\\b/.test(await page.locator("body").innerText())) {
    throw new Error("Patient order fixture contains Customer terminology.");
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > viewport.width) {
    throw new Error(`Horizontal overflow at ${viewport.width}px: ${scrollWidth}px.`);
  }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await verifyViewport(browser, { width: 1440, height: 1000 });
    await verifyViewport(browser, { width: 390, height: 844 });
    console.log(JSON.stringify({ ok: true, sourceAssertions: true, desktop: true, mobile: true }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
