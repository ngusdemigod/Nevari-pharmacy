function money(value, currency = "NGN") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function shortDate(value) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function canShowPayNow(data, documentType) {
  const status = String(data?.order_status || "").toLowerCase();
  const paymentStatus = String(data?.payment_status || "").toLowerCase();
  const allowedStatus = ["pending", "awaiting-payment", "requires-payment"].includes(status);
  const terminal = ["paid", "completed", "cancelled", "refunded"].includes(paymentStatus) || ["completed", "cancelled", "refunded"].includes(status);
  return documentType === "invoice"
    && allowedStatus
    && !terminal
    && Number(data?.totals?.balance_due || 0) > 0
    && Boolean(data?.branded_payment_url || data?.payment_url);
}

function absoluteUrl(value, appOrigin = "") {
  const url = String(value || "");
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  const origin = String(appOrigin || "").replace(/\/+$/, "");
  return origin && url.startsWith("/") ? `${origin}${url}` : url;
}

function normalizeStatusKey(value) {
  return String(value || "processing").trim().toLowerCase().replace(/_/g, "-");
}

function documentStatus(data, documentType, statusMode = "order") {
  const paymentStatus = normalizeStatusKey(data?.payment_status);
  const orderStatus = normalizeStatusKey(data?.order_status);
  let key = statusMode === "payment" ? paymentStatus : orderStatus;
  if (documentType === "receipt" && statusMode === "payment" && !key) key = "paid";
  if (!key) key = paymentStatus || "processing";

  if (["awaiting-doctor", "awaiting-prescription", "doctor-review", "requires-doctor"].includes(key)) {
    return { label: "Awaiting doctor", tone: "warning" };
  }
  if (["pending", "processing", "on-hold", "awaiting-payment", "requires-payment", "unpaid", "waiting"].includes(key)) {
    return { label: "Processing", tone: "warning" };
  }
  if (["in-delivery", "delivery", "out-for-delivery", "in delivery"].includes(key)) {
    return { label: "In delivery", tone: "warning" };
  }
  if (["paid"].includes(key) || (statusMode === "payment" && ["completed", "complete"].includes(key))) {
    return { label: "Paid", tone: "success" };
  }
  if (["completed", "complete"].includes(key)) {
    return { label: "Complete", tone: "success" };
  }
  if (["refunded"].includes(key)) {
    return { label: "Refunded", tone: "success" };
  }
  if (["failed", "cancelled", "canceled"].includes(key)) {
    return { label: "Failed", tone: "error" };
  }
  return { label: key.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), tone: "warning" };
}

export function documentFilename(data, documentType) {
  const number = documentType === "receipt" ? data?.receipt_number : documentType === "prescription" ? data?.prescription_number : data?.invoice_number;
  return `nevari-${documentType}-${String(number || data?.order_number || data?.order_id || "document").replace(/[^a-z0-9_-]+/gi, "-")}.pdf`;
}

export function renderDocumentHtml(data, documentType = "invoice", { appOrigin = "", statusMode = "order" } = {}) {
  const currency = data?.currency || "NGN";
  const isPrescription = documentType === "prescription";
  const title = documentType === "receipt"
    ? `Receipt #${data?.order_number || data?.receipt_number || ""}`
    : isPrescription
      ? `Prescription #${data?.prescription_number || ""}`
      : `Invoice #${data?.order_number || data?.invoice_number || ""}`;
  const docNumber = documentType === "receipt" ? data?.receipt_number : isPrescription ? data?.prescription_number : data?.invoice_number;
  const showPayNow = canShowPayNow(data, documentType);
  const payUrl = absoluteUrl(data?.branded_payment_url || data?.payment_url || "", appOrigin);
  const status = documentStatus(data, documentType, statusMode);
  const rows = isPrescription
    ? (data?.medications || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.name || item.medication || "-")}</td>
        <td class="text-right">${escapeHtml(item.dosage || "-")}</td>
        <td class="text-right">${escapeHtml(item.frequency || "-")}</td>
        <td class="text-right">${escapeHtml(item.duration || "-")}</td>
        <td class="text-right">${escapeHtml(item.instructions || "-")}</td>
      </tr>
    `).join("") || '<tr><td colspan="5">No medications added.</td></tr>'
    : (data?.items || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.name || "Item")}</td>
        <td class="text-right">${escapeHtml(money(item.rate, currency))}</td>
        <td class="text-right">${escapeHtml(item.qty || 1)}</td>
        <td class="text-right">${escapeHtml(money(item.tax, currency))}</td>
        <td class="text-right">${escapeHtml(money(item.discount, currency))}</td>
        <td class="text-right">${escapeHtml(money(item.total, currency))}</td>
      </tr>
    `).join("") || '<tr><td colspan="6">No items found.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Product Sans", "Google Sans", "Inter", Arial, sans-serif; background: #fff; color: #111; font-size: 13px; line-height: 1.5; }
    .invoice { width: 850px; min-height: 1100px; margin: 0 auto; background: #fff; padding: 55px 55px 45px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 45px; }
    .logo { width: 96px; height: 96px; object-fit: contain; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 48px; margin-bottom: 20px; letter-spacing: 1px; color: #0E2955; }
    .invoice-meta { display: grid; grid-template-columns: 160px 160px; gap: 6px 20px; font-size: 13px; justify-content: end; }
    .invoice-meta span { color: #8d96a6; text-align: left; }
    .invoice-meta strong { text-align: right; }
    .status-text { display: inline-block; justify-self: end; text-align: right !important; font-size: 16px; font-weight: 900; text-transform: uppercase; }
    .status-warning { color: #B45309; }
    .status-success { color: #15803D; }
    .status-error { color: #B91C1C; }
    .customer-row { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 36px; }
    .customer-details, .customer-address { width: 48%; }
    .customer-address { text-align: right; }
    .section-label { font-weight: 700; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; color: #0E2955; }
    .company-name { font-size: 20px; font-weight: 700; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 35px; }
    thead { background: #0E2955; color: #fff; }
    th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 500; text-transform: uppercase; }
    td { padding: 14px 12px; vertical-align: top; font-size: 13px; border-bottom: 1px solid #e4e9f0; }
    tbody tr:nth-child(even) { background: #eef4fb; }
    tr { page-break-inside: avoid; }
    .text-right { text-align: right; }
    .bottom-section { display: flex; justify-content: space-between; gap: 40px; }
    .payment-notes { width: 48%; }
    .payment-block { margin-bottom: 25px; }
    .payment-block h3, .prescription h3 { font-size: 16px; margin-bottom: 10px; color: #0E2955; }
    .pay-now-btn { display: inline-block; margin-top: 10px; background: #0E2955; color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 700; font-size: 14px; }
    .summary { width: 38%; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .summary-row strong { font-weight: 700; }
    .balance { background: #eef4fb; padding: 12px 14px; margin-top: 10px; font-size: 16px; font-weight: 700; }
    @media print {
      body { background: #fff; }
      .invoice { margin: 0; width: 100%; min-height: 100vh; }
      a.pay-now-btn { text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="invoice">
    <header class="header">
      <img src="${escapeHtml(appOrigin)}/ne.webp" alt="Nevari logo" class="logo" />
      <div class="invoice-title">
        <h1>${escapeHtml(title)}</h1>
        <div class="invoice-meta">
          <span>Status:</span><strong class="status-text status-${escapeHtml(status.tone)}">${escapeHtml(status.label)}</strong>
          ${isPrescription ? `<span>Prescription number:</span><strong>${escapeHtml(docNumber || "")}</strong>` : ""}
          <span>${escapeHtml(documentType === "receipt" ? "Receipt date:" : isPrescription ? "Issued date:" : "Invoice date:")}</span><strong>${escapeHtml(shortDate(data?.invoice_date))}</strong>
          <span>${escapeHtml(documentType === "invoice" ? "Due date:" : "Order date:")}</span><strong>${escapeHtml(shortDate(data?.due_date || data?.invoice_date))}</strong>
        </div>
      </div>
    </header>
    <section class="customer-row">
      <div class="customer-details">
        <p class="section-label">${escapeHtml(isPrescription ? "Patient Details" : "Customer Details")}</p>
        <h2 class="company-name">${escapeHtml(data?.customer?.name || "Customer")}</h2>
        <p><strong>Email:</strong> ${escapeHtml(data?.customer?.email || "n/a")}</p>
        <p><strong>Phone:</strong> ${escapeHtml(data?.customer?.phone || "n/a")}</p>
        <p><strong>Customer ID:</strong> ${escapeHtml(data?.order_id || "n/a")}</p>
      </div>
      <div class="customer-address">
        <p class="section-label">Customer Address</p>
        <p>${escapeHtml(data?.customer?.address || "n/a")}</p>
      </div>
    </section>
    <table>
      <thead>${isPrescription
        ? '<tr><th>Medication</th><th class="text-right">Dosage</th><th class="text-right">Frequency</th><th class="text-right">Duration</th><th class="text-right">Instructions</th></tr>'
        : '<tr><th>Description</th><th class="text-right">Rate, NGN</th><th class="text-right">Qty</th><th class="text-right">Tax</th><th class="text-right">Disc</th><th class="text-right">Amount, NGN</th></tr>'}</thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="bottom-section">
      <div class="payment-notes">
        <div class="payment-block">
          <h3>${escapeHtml(isPrescription ? "Doctor Notes" : "Payment")}</h3>
          <p>${escapeHtml(isPrescription ? (data?.doctor_notes || "Use medications only as prescribed.") : "Please pay to the hospital account listed on your patient profile.")}</p>
          ${showPayNow ? `<a class="pay-now-btn" href="${escapeHtml(payUrl)}" target="_blank" rel="noopener noreferrer">Pay Now</a>` : ""}
        </div>
      </div>
      <div class="summary">
        <div class="summary-row"><strong>Subtotal:</strong><strong>${escapeHtml(money(data?.totals?.subtotal || 0, currency))}</strong></div>
        <div class="summary-row"><span>Discount:</span><span>${escapeHtml(money(data?.totals?.discount || 0, currency))}</span></div>
        <div class="summary-row"><span>Shipping Cost:</span><span>${escapeHtml(money(data?.totals?.shipping || 0, currency))}</span></div>
        <div class="summary-row"><span>Sales Tax:</span><span>${escapeHtml(money(data?.totals?.tax || 0, currency))}</span></div>
        <div class="summary-row"><strong>Total:</strong><strong>${escapeHtml(money(data?.totals?.total || 0, currency))}</strong></div>
        <div class="summary-row"><span>Amount paid:</span><span>${escapeHtml(money(data?.totals?.amount_paid || 0, currency))}</span></div>
        <div class="summary-row balance"><span>Balance Due:</span><span>${escapeHtml(money(documentType === "receipt" ? 0 : (data?.totals?.balance_due || 0), currency))}</span></div>
      </div>
    </section>
  </main>
</body>
</html>`;
}
