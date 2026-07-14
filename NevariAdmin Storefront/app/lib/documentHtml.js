function money(value, currency = "USD") {
  const code = String(currency || "USD").trim().toUpperCase();
  const locale = code === "NGN" ? "en-NG" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(Number(value || 0));
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
  }
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

function dateOnly(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function itemDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
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

export function mtmDocumentFilename(data) {
  const reference = String(data?.request_reference || data?.id || "request").replace(/[^a-z0-9_-]+/gi, "-");
  return `nevari-mtm-${reference}.pdf`;
}

export function renderDocumentHtml(data, documentType = "invoice", { appOrigin = "", statusMode = "order" } = {}) {
  const currency = data?.currency || "USD";
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
    : (data?.items || []).map((item) => {
      const consultationMeta = item?.is_consultation
        ? [
          item?.consultation_type ? `Consultation: ${item.consultation_type}` : "",
          item?.consultation_brief ? `Brief: ${item.consultation_brief}` : "",
          item?.consultation_when ? `When: ${item.consultation_when}` : ""
        ].filter(Boolean)
        : [];
      const consultationMetaHtml = consultationMeta.length
        ? `<div class="item-subtext">${consultationMeta.map((line) => escapeHtml(line)).join("<br />")}</div>`
        : "";
      return `
      <tr>
        <td>${escapeHtml(item.name || "Item")}${consultationMetaHtml}</td>
        <td class="text-right">${escapeHtml(money(item.rate, currency))}</td>
        <td class="text-right">${escapeHtml(item.qty || 1)}</td>
        <td class="text-right">${escapeHtml(money(item.tax, currency))}</td>
        <td class="text-right">${escapeHtml(money(item.discount, currency))}</td>
        <td class="text-right">${escapeHtml(money(item.total, currency))}</td>
      </tr>
    `;
    }).join("") || '<tr><td colspan="6">No items found.</td></tr>';

  if (!isPrescription) {
    const displayNumber = docNumber || data?.order_number || data?.order_id || "";
    const badgeLabel = documentType === "receipt" ? "Receipt" : "Invoice";
    const documentTitle = `${badgeLabel} #${displayNumber || ""}`.trim();
    const customer = data?.customer || {};
    const statusLabel = documentType === "receipt" ? "Paid" : (status.label || "Processing");
    const statusTone = String(documentType === "receipt" ? "success" : status.tone || "warning");
    const statusClass = statusTone === "success" ? "success" : statusTone === "error" ? "error" : "warning";
    const issueDate = dateOnly(data?.invoice_date || data?.created_at);
    const dueDate = documentType === "receipt" ? issueDate : dateOnly(data?.due_date || data?.invoice_date || data?.created_at);
    const footerNote = showPayNow
      ? `Payment link: <a href="${escapeHtml(payUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(payUrl)}</a><br>`
      : "";
    const itemRows = (data?.items || []).map((item) => {
      const tag = item?.tag || item?.type || (item?.is_consultation ? "Appointment" : "Product");
      const description = [
        item?.description,
        item?.consultation_type ? `Consultation: ${item.consultation_type}` : "",
        item?.consultation_brief ? `Brief: ${item.consultation_brief}` : "",
        item?.doctor_name || data?.doctor_name ? `Doctor: ${item?.doctor_name || data?.doctor_name}` : "",
      ].filter(Boolean).join(" · ");
      return `
      <tr>
        <td>
          <div class="item-name">${escapeHtml(item.name || "Item")}</div>
          ${description ? `<div class="item-desc">${escapeHtml(description)}</div>` : ""}
          <span class="tag">${escapeHtml(tag)}</span>
        </td>
        <td style="color:#6b7280; font-size:13px;">${escapeHtml(itemDate(item.date || item.created_at || item.consultation_when || data?.invoice_date))}</td>
        <td style="color:#6b7280;">${escapeHtml(item.qty || 1)}</td>
        <td>${escapeHtml(money(item.total ?? ((Number(item.qty || 1) || 1) * Number(item.rate || 0)), currency))}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="4">No items found.</td></tr>';
    const subtotal = Number(data?.totals?.subtotal || 0);
    const tax = Number(data?.totals?.tax || 0);
    const shipping = Number(data?.totals?.shipping || 0);
    const discount = Number(data?.totals?.discount || 0);
    const total = Number(data?.totals?.total || 0);
    const balance = documentType === "receipt" ? Number(data?.totals?.amount_paid || total || 0) : Number(data?.totals?.balance_due || total || 0);
    const totalLabel = documentType === "receipt" ? "Total Paid" : "Total Due";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Product+Sans:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, .inv-wrap { font-family: 'Product Sans', 'Google Sans', Inter, Arial, sans-serif; }
    body { background: #fff; color: #1a1a1a; }
    .inv-wrap { background: #fff; color: #1a1a1a; max-width: 720px; margin: 0 auto; padding: 48px 40px; }
    .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
    .brand-lockup { display: inline-flex; align-items: flex-start; gap: 14px; }
    .brand-logo { width: 42px; height: 42px; object-fit: contain; flex-shrink: 0; }
    .brand-name { font-size: 22px; font-weight: 700; color: #0A2A5E; letter-spacing: -0.3px; }
    .brand-sub { font-size: 12px; color: #6b7280; margin-top: 3px; letter-spacing: 0.5px; }
    .inv-badge { background: #0A2A5E; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; padding: 6px 14px; border-radius: 4px; text-transform: uppercase; }
    .inv-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 40px; }
    .meta-label { font-size: 11px; color: #9ca3af; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
    .meta-value { font-size: 14px; color: #1a1a1a; }
    .meta-value.highlight { color: #0A2A5E; font-weight: 700; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 0 0 32px; }
    .section-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #9ca3af; margin-bottom: 16px; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    .items-table thead th { font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; color: #9ca3af; padding: 0 0 10px; text-align: left; font-weight: 400; border-bottom: 1px solid #e5e7eb; }
    .items-table thead th:last-child { text-align: right; }
    .items-table tbody td { padding: 14px 0; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .items-table tbody td:last-child { text-align: right; }
    .item-name { font-size: 14px; color: #1a1a1a; }
    .item-desc { font-size: 12px; color: #9ca3af; margin-top: 2px; }
    .tag { display: inline-block; font-size: 10px; letter-spacing: 0.5px; background: #EEF2FF; color: #0A2A5E; padding: 2px 8px; border-radius: 3px; margin-top: 4px; text-transform: uppercase; font-weight: 700; }
    .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-bottom: 40px; }
    .total-row { display: flex; gap: 48px; font-size: 14px; color: #6b7280; }
    .total-row span:last-child { min-width: 96px; text-align: right; color: #1a1a1a; }
    .total-row.grand { font-size: 18px; font-weight: 700; color: #0A2A5E; padding-top: 12px; border-top: 2px solid #0A2A5E; margin-top: 4px; }
    .total-row.grand span:last-child { color: #0A2A5E; }
    .inv-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer-note { font-size: 12px; color: #9ca3af; max-width: 360px; line-height: 1.6; }
    .footer-note a { color: #0A2A5E; word-break: break-all; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px; letter-spacing: 0.3px; }
    .status-pill.success { color: #059669; background: #ECFDF5; border: 1px solid #6ee7b7; }
    .status-pill.warning { color: #92400e; background: #fffbeb; border: 1px solid #fcd34d; }
    .status-pill.error { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    @media (max-width: 560px) {
      .inv-wrap { padding: 28px 20px; }
      .inv-meta { grid-template-columns: 1fr; gap: 16px; }
      .inv-header { flex-direction: column; gap: 16px; }
      .inv-meta > div:last-child { text-align: left !important; }
      .items-table thead th:nth-child(2), .items-table tbody td:nth-child(2) { display: none; }
      .inv-footer { flex-direction: column; gap: 16px; align-items: flex-start; }
    }
    @media print {
      @page { margin: 0; }
      body { background: #fff; }
      .inv-wrap { max-width: 720px; padding: 40px; }
    }
  </style>
</head>
<body>
  <div class="inv-wrap">
    <h2 class="sr-only">Nevari Health ${escapeHtml(badgeLabel.toLowerCase())} for ${escapeHtml(customer.name || "Patient")}</h2>
    <div class="inv-header">
      <div class="brand-lockup">
        <img src="${escapeHtml(appOrigin)}/ne.webp" alt="Nevari logo" class="brand-logo" />
        <div>
          <div class="brand-name">Nevari Health</div>
          <div class="brand-sub">12 Adeola Odeku St, Victoria Island · Lagos, NG</div>
        </div>
      </div>
      <div class="inv-badge">${escapeHtml(badgeLabel)}</div>
    </div>
    <div class="inv-meta">
      <div>
        <div class="meta-label">Billed to</div>
        <div class="meta-value" style="font-size:15px; font-weight:700;">${escapeHtml(customer.name || "Patient")}</div>
        <div class="meta-value" style="color:#6b7280; margin-top:2px;">${escapeHtml(customer.email || "")}</div>
        <div class="meta-value" style="color:#6b7280;">${escapeHtml(customer.phone || "")}</div>
        ${customer.address ? `<div class="meta-value" style="color:#6b7280; margin-top:6px;">${escapeHtml(customer.address)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div>
          <div class="meta-label">${escapeHtml(badgeLabel)} no.</div>
          <div class="meta-value highlight">#${escapeHtml(displayNumber || "Pending")}</div>
        </div>
        <div style="margin-top:16px;">
          <div class="meta-label">Issue date</div>
          <div class="meta-value">${escapeHtml(issueDate)}</div>
        </div>
        <div style="margin-top:16px;">
          <div class="meta-label">${documentType === "receipt" ? "Paid date" : "Due date"}</div>
          <div class="meta-value">${escapeHtml(dueDate)}</div>
        </div>
      </div>
    </div>
    <hr class="divider">
    <div class="section-label">Appointments & Services</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:45%;">Description</th>
          <th style="width:20%;">Date</th>
          <th style="width:15%;">Qty</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>${escapeHtml(money(subtotal, currency))}</span></div>
      ${tax ? `<div class="total-row"><span>Tax</span><span>${escapeHtml(money(tax, currency))}</span></div>` : ""}
      ${shipping ? `<div class="total-row"><span>Shipping</span><span>${escapeHtml(money(shipping, currency))}</span></div>` : ""}
      ${discount ? `<div class="total-row"><span>Discount</span><span>-${escapeHtml(money(discount, currency))}</span></div>` : ""}
      <div class="total-row grand"><span>${escapeHtml(totalLabel)}</span><span>${escapeHtml(money(balance, currency))}</span></div>
    </div>
    <div class="inv-footer">
      <div class="footer-note">
        ${footerNote}
        Payment via approved Nevari Health payment channels.<br>
        For queries: billing@nevarihealth.com
      </div>
      <div class="status-pill ${escapeHtml(statusClass)}"><span class="dot"></span>${escapeHtml(statusLabel)}</div>
    </div>
  </div>
</body>
</html>`;
  }

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
    .item-subtext { margin-top: 6px; color: #4b5a73; font-size: 11px; line-height: 1.45; }
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
        <p class="section-label">${escapeHtml(isPrescription ? "Patient Details" : "Patient Details")}</p>
        <h2 class="company-name">${escapeHtml(data?.customer?.name || "Patient")}</h2>
        <p><strong>Email:</strong> ${escapeHtml(data?.customer?.email || "n/a")}</p>
        <p><strong>Phone:</strong> ${escapeHtml(data?.customer?.phone || "n/a")}</p>
        <p><strong>Patient ID:</strong> ${escapeHtml(data?.order_id || "n/a")}</p>
      </div>
      <div class="customer-address">
        <p class="section-label">Patient Address</p>
        <p>${escapeHtml(data?.customer?.address || "n/a")}</p>
      </div>
    </section>
    <table>
      <thead>${isPrescription
        ? '<tr><th>Medication</th><th class="text-right">Dosage</th><th class="text-right">Frequency</th><th class="text-right">Duration</th><th class="text-right">Instructions</th></tr>'
        : `<tr><th>Description</th><th class="text-right">Rate, ${escapeHtml(currency)}</th><th class="text-right">Qty</th><th class="text-right">Tax</th><th class="text-right">Disc</th><th class="text-right">Amount, ${escapeHtml(currency)}</th></tr>`}</thead>
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

export function renderMtmDocumentHtml(data, { appOrigin = "" } = {}) {
  const medications = Array.isArray(data?.medication_profile?.medications) ? data.medication_profile.medications : [];
  const patient = data?.patient || {};
  const emergency = data?.emergency_contact || {};
  const medical = data?.medical_history || {};
  const adherence = data?.adherence_assessment || {};
  const additional = data?.additional_information || {};
  const medicationRows = medications.map((item) => `
    <tr>
      <td>${escapeHtml(item.medicationName || "-")}</td>
      <td>${escapeHtml(item.dosage || "-")}</td>
      <td>${escapeHtml(item.frequency || "-")}</td>
      <td>${escapeHtml(item.route || "-")}</td>
      <td>${escapeHtml(item.indication || "-")}</td>
      <td>${escapeHtml(item.prescribingDoctor || "-")}</td>
    </tr>
  `).join("") || '<tr><td colspan="6">No medications submitted.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data?.request_reference || "MTM Request")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Product Sans", "Google Sans", "Inter", Arial, sans-serif; color: #111; background: #fff; margin: 0; }
    main { width: 860px; margin: 0 auto; padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .logo { width: 72px; height: 72px; object-fit: contain; }
    h1 { margin: 0 0 8px; color: #0E2955; font-size: 34px; }
    h2 { margin: 28px 0 10px; color: #0E2955; font-size: 18px; }
    p { margin: 0 0 6px; }
    .meta { text-align: right; font-size: 13px; color: #5b6474; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .card { border: 1px solid #e4e9f0; border-radius: 18px; padding: 16px; }
    .label { display: block; color: #5b6474; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { text-align: left; background: #0E2955; color: #fff; padding: 10px 12px; font-size: 11px; text-transform: uppercase; }
    td { border-bottom: 1px solid #e4e9f0; padding: 12px; font-size: 13px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #eef4fb; }
  </style>
</head>
<body>
  <main>
    <div class="header">
      <div>
        <img src="${escapeHtml(appOrigin)}/ne.webp" alt="Nevari logo" class="logo" />
        <h1>${escapeHtml(data?.request_reference || "MTM Request")}</h1>
        <p>${escapeHtml(patient.name || "Patient")}</p>
      </div>
      <div class="meta">
        <p><strong>Status:</strong> ${escapeHtml(data?.status_label || data?.status || "Submitted")}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(shortDate(data?.created_at))}</p>
        <p><strong>Scheduled:</strong> ${escapeHtml(shortDate(data?.scheduled_at))}</p>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <h2>Patient Details</h2>
        <p><span class="label">Name</span>${escapeHtml(patient.name || "-")}</p>
        <p><span class="label">Age</span>${escapeHtml(patient.age || "-")}</p>
        <p><span class="label">Phone</span>${escapeHtml(patient.phoneNumber || "-")}</p>
        <p><span class="label">Address</span>${escapeHtml(patient.address || "-")}</p>
      </section>
      <section class="card">
        <h2>Emergency Contact</h2>
        <p><span class="label">Name</span>${escapeHtml(emergency.caregiverName || "-")}</p>
        <p><span class="label">Relationship</span>${escapeHtml(emergency.relationship || "-")}</p>
        <p><span class="label">Phone</span>${escapeHtml(emergency.phoneNumber || "-")}</p>
        <p><span class="label">Email</span>${escapeHtml(emergency.emailAddress || "-")}</p>
      </section>
    </div>

    <section>
      <h2>Medical History</h2>
      <p><span class="label">Primary Diagnosis</span>${escapeHtml(medical.primaryDiagnosis || "-")}</p>
      <p><span class="label">Chronic Conditions</span>${escapeHtml(medical.chronicConditions || "-")}</p>
      <p><span class="label">Past Medical History</span>${escapeHtml(medical.pastMedicalHistory || "-")}</p>
      <p><span class="label">Drug Allergies</span>${escapeHtml(medical.drugAllergies || "-")}</p>
    </section>

    <section>
      <h2>Medications</h2>
      <table>
        <thead>
          <tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Route</th><th>Indication</th><th>Prescriber</th></tr>
        </thead>
        <tbody>${medicationRows}</tbody>
      </table>
    </section>

    <div class="grid">
      <section class="card">
        <h2>Adherence</h2>
        <p><span class="label">Barriers</span>${escapeHtml(Array.isArray(adherence.barriers) ? adherence.barriers.join(", ") : "-")}</p>
        <p><span class="label">Other</span>${escapeHtml(adherence.other || "-")}</p>
      </section>
      <section class="card">
        <h2>Additional Information</h2>
        <p><span class="label">Recent Changes</span>${escapeHtml(additional.recentMedicationChanges || "-")}</p>
        <p><span class="label">OTC Medications</span>${escapeHtml(additional.otcMedications || "-")}</p>
        <p><span class="label">Supplements</span>${escapeHtml(additional.supplements || "-")}</p>
      </section>
    </div>
  </main>
</body>
</html>`;
}
