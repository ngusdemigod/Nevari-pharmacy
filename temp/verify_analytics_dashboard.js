const { chromium } = require('../NevariAdmin Storefront/node_modules/playwright');

const analytics = {
  success: true,
  data: {
    range: '30d',
    compare: true,
    generated_at: new Date().toISOString(),
    growth: {
      generated_at: new Date().toISOString(),
      data_status: 'ready',
      metrics: {
        unique_visitors: { value: 24680, previous: 22722, change: 8.6 },
        registration_completion: { value: 72, previous: 69.2, change: 2.8, denominator: 'Of people who started registration' },
        consultation_submission: { value: 65, previous: 63.5, change: 1.5, denominator: 'Of people who started a consultation' },
        appointment_booking: { value: 51.6, previous: 52.5, change: -0.9, denominator: 'Of people who started appointment booking' },
        payment_completion: { value: 74.7, previous: 70.6, change: 4.1, denominator: 'Of people who reached payment' },
        subscription_conversion: { value: 49, previous: 46.8, change: 2.2, denominator: 'Of people who viewed a subscription option' },
        return_7_day: { value: 42, previous: 40.3, change: 1.7 },
        return_30_day: { value: 25, previous: 24.2, change: .8 }
      },
      journey: [
        ['$pageview', 'Visited the service', 24680, null],
        ['registration_started', 'Started registration', 12440, 49.6],
        ['registration_completed', 'Completed registration', 8960, 28],
        ['consultation_submitted', 'Submitted consultation', 5824, 35],
        ['appointment_booked', 'Booked appointment', 3008, 48.4],
        ['payment_completed', 'Completed payment', 2248, 25.3],
        ['subscription_started', 'Started subscription', 1102, 51]
      ].map(([key,label,count,drop_off_percent]) => ({ key,label,count,drop_off_percent })),
      devices: [{ key: 'mobile', label: 'Mobile', percent: 62 }, { key: 'desktop', label: 'Desktop', percent: 31 }, { key: 'tablet', label: 'Tablet', percent: 7 }],
      roles: [{ key: 'patient', label: 'Patients', percent: 68 }, { key: 'doctor', label: 'Doctors', percent: 17 }, { key: 'pharmacist', label: 'Pharmacy staff', percent: 10 }, { key: 'other', label: 'Other', percent: 5 }],
      visitors: []
    },
    commerce: {
      range: '30d',
      generated_at: new Date().toISOString(),
      currency: 'USD',
      commerce: { gross_sales: 184200, completed_orders: 1248, average_order_value: 147.6, on_time_fulfillment_percent: 91.4, previous: { gross_sales: 169000, completed_orders: 1180 } },
      products: { page: 1, per_page: 10, total: 3, items: [
        { product_id: 1, variation_id: 0, name: 'Loratadine 10mg', sku: 'NEV-LOR-10', quantity: 342, sales: 23256, stock_status: 'in_stock' },
        { product_id: 2, variation_id: 0, name: 'Vitamin D3', sku: 'NEV-D3', quantity: 219, sales: 17520, stock_status: 'low_stock' },
        { product_id: 3, variation_id: 0, name: 'Blood Pressure Monitor', sku: 'NEV-BPM', quantity: 94, sales: 14100, stock_status: 'out_of_stock' }
      ]},
      inventory: { in_stock: 182, low_stock: 12, out_of_stock: 6, available_percent: 97, attention: [
        { product_id: 2, name: 'Vitamin D3', sku: 'NEV-D3', status: 'low_stock', quantity: 2 },
        { product_id: 3, name: 'Blood Pressure Monitor', sku: 'NEV-BPM', status: 'out_of_stock', quantity: 0 }
      ]},
      order_outcomes: [{ status: 'completed', count: 1248, percent: 78 }, { status: 'processing', count: 208, percent: 13 }, { status: 'cancelled', count: 80, percent: 5 }, { status: 'refunded', count: 64, percent: 4 }],
      data_status: 'ready'
    }
  }
};

function json(data) { return { status: 200, contentType: 'application/json', body: JSON.stringify(data) }; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const widths = [1440, 1024, 768, 390];
  const results = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem('nevari_admin_storefront_session', JSON.stringify({
        baseUrl: 'https://nevarihealth.com', frontendType: 'storefront', paired: true, siteName: 'Nevari Pharmacy',
        accessToken: 'server-session', refreshToken: 'server-session', expiresAt: Date.now() + 3600000,
        user: { roles: ['store_admin'], display_name: 'Preview Admin', storefront_permissions: ['analytics'] },
        currentPage: 'analytics'
      }));
    });
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/admin/analytics/summary') return route.fulfill(json(analytics));
      if (url.pathname === '/api/admin/summary') return route.fulfill(json({ success: true, data: { dashboard: {}, recent_orders: [] } }));
      return route.fulfill(json({ success: true, data: [] }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/admin/storefront', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('#analytics-title').waitFor({ timeout: 120000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const nav = await page.locator('.nav-item').allTextContents();
    await page.screenshot({ path: `D:/dev/nevari-pharmacy-core/temp/analytics-${width}.png`, fullPage: true });
    results.push({ width, overflow, errors, nav: nav.slice(0, 4) });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
