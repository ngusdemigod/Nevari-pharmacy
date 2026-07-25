const { chromium } = require('playwright');

const previewProduct = {
  id: 1570,
  name: 'Loratadine 10mg',
  short_description: '',
  description: 'Non drowsy antihistamine used to relieve allergy symptoms such as sneezing, runny nose and itchy eyes. Confirm dosage guidance before checkout where needed.',
  regular_price: '6.80',
  sale_price: '',
  price: '6.80',
  sku: 'NEV-LOR-10',
  stock_quantity: 184,
  stock_status: 'instock',
  status: 'publish',
  weight: '0.08 kg',
  shipping_class_name: 'Standard pharmacy item',
  shipping_information: 'Standard pharmacy item',
  pharmacy_rules: { rx_required: false, consultation_required: false, otc: true },
  categories: [{ id: 1, name: 'Allergy & Cold', slug: 'allergy-cold' }],
  tags: [{ id: 1, name: 'allergy' }, { id: 2, name: 'antihistamine' }, { id: 3, name: 'loratadine' }],
  images: [{ id: 9001, src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='820' height='820' viewBox='0 0 820 820'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23eef3fb'/%3E%3Cstop offset='1' stop-color='%23eadfce'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='820' height='820' rx='48' fill='url(%23g)'/%3E%3Ccircle cx='295' cy='195' r='104' fill='rgba(255,255,255,0.88)'/%3E%3C/svg%3E", alt: 'Loratadine 10mg' }]
};
const recentOrders = [];
const dashboardSummary = { dashboard: { sales: { today: 0 }, orders: { today: 1 }, products: { total: 1 }, customers: { total: 1 } }, recent_orders: recentOrders };
function json(data) { return { status: 200, contentType: 'application/json', body: JSON.stringify(data) }; }
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1896, height: 952 } });
  await context.addInitScript(() => {
    localStorage.setItem('nevari_admin_storefront_session', JSON.stringify({
      baseUrl: 'https://nevarihealth.com', frontendType: 'storefront', paired: true, siteName: 'Nevari Pharmacy', accessToken: 'server-session', refreshToken: 'server-session', expiresAt: Date.now() + 3600000,
      user: { id: 1, email: 'preview@nevari.local', role: 'store_admin', roles: ['store_admin'], display_name: 'Preview Admin' }, currentPage: 'products'
    }));
  });
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname.startsWith('/api/admin/')) {
      const routeKey = pathname.replace('/api/admin/', '');
      const payloads = { summary: { success: true, data: dashboardSummary }, products: { success: true, data: [previewProduct] }, categories: { success: true, data: [{ id: 1, name: 'Allergy & Cold', slug: 'allergy-cold' }] }, tags: { success: true, data: [{ id: 1, name: 'allergy' }, { id: 2, name: 'antihistamine' }, { id: 3, name: 'loratadine' }] }, orders: { success: true, data: recentOrders }, customers: { success: true, data: [] }, doctors: { success: true, data: [] }, appointments: { success: true, data: [] }, emails: { success: true, data: [] }, mtm: { success: true, data: [] }, 'iv-therapy': { success: true, data: [] } };
      return route.fulfill(json(payloads[routeKey] || { success: true, data: [] }));
    }
    if (pathname === '/api/nevari-proxy') {
      const proxyPath = url.searchParams.get('path') || '';
      if (proxyPath === '/dashboard/store-admin') return route.fulfill(json({ success: true, data: dashboardSummary.dashboard }));
      if (proxyPath === '/orders') return route.fulfill(json({ success: true, data: recentOrders }));
      if (proxyPath === '/products') return route.fulfill(json({ success: true, data: [previewProduct] }));
      if (proxyPath === '/products/categories') return route.fulfill(json({ success: true, data: [{ id: 1, name: 'Allergy & Cold', slug: 'allergy-cold' }] }));
      if (proxyPath === '/doctors/settings') return route.fulfill(json({ success: true, data: {} }));
      if (['/appointments','/prescriptions','/emails/logs','/doctors','/audit-logs'].includes(proxyPath)) return route.fulfill(json({ success: true, data: [] }));
      if (proxyPath.startsWith('/orders/') || proxyPath.startsWith('/prescriptions/')) return route.fulfill(json({ success: true, data: {} }));
      return route.fulfill(json({ success: true, data: [] }));
    }
    return route.fulfill(json({ success: true, data: [] }));
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/admin/storefront', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  await page.locator('.auth-gate').evaluate((el) => { el.hidden = true; el.style.display = 'none'; }).catch(() => null);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /edit/i }).first().click({ force: true });
  await page.waitForTimeout(2500);
  const modal = page.locator('.product-editor-modal').first();
  console.log('modalCount', await modal.count());
  if (await modal.count()) {
    console.log('modalBox', JSON.stringify(await modal.boundingBox()));
    console.log('mediaBox', JSON.stringify(await page.locator('.product-editor-media-column').first().boundingBox()));
  }
  await page.screenshot({ path: 'D:/dev/nevari-pharmacy-core/temp/product-editor-modal-mocked-open.png', fullPage: true });
  await browser.close();
})();
