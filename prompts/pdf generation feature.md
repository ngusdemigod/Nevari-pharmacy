I already have the invoice, receipt, and prescription document design created.

Do not redesign the invoice.
Do not redesign the dashboard.
Only implement the missing payment, PDF, and email sending features where necessary.

This system is for Nevari Pharmacy and connects a Next.js dashboard with WooCommerce through the nevari-pharmacy-core WordPress plugin.

Main goal:
When an invoice PDF is generated, the Pay Now button inside the PDF must be an actual clickable link/button. When the customer clicks Pay Now, they should be taken to a secure payment page/paywall where they can pay for the exact WooCommerce order using the existing payment gateway integrations already available inside nevari-pharmacy-core: Paystack, Flutterwave, and Stripe.

After payment is successful, the payment must be automatically tied to the WooCommerce order and the order status/payment status must update correctly.

Important rules:
- Invoice can show Pay Now.
- Receipt must never show Pay Now.
- Prescription must never show Pay Now.
- Paid, completed, cancelled, refunded, or zero-balance invoices must not show Pay Now.
- The Pay Now button must remain clickable inside the exported PDF and emailed PDF.
- The email must be sent through the existing email templating system.
- Do not create a separate hardcoded email system unless absolutely necessary.
- Do not trust payment status from the frontend.
- nevari-pharmacy-core must remain the source of truth for order status, payment status, payment URL, totals, and gateway/payment handling.

Feature 1: Clickable Pay Now button inside PDF

Add a real anchor link to the invoice template:

<a
  href="{branded_payment_url}"
  className="pay-now-button"
  target="_blank"
  rel="noopener noreferrer"
>
  Pay Now
</a>

The link should point to a branded payment route, not directly expose the raw WooCommerce payment URL.

Example:

https://app.nevarihealth.com/pay/NVH-INV-001570

The button must:
- Be visible in the browser preview
- Be visible in the exported PDF
- Remain clickable in the PDF
- Remain clickable when the PDF is sent by email

Use server-side PDF generation with Playwright or Puppeteer so anchor links remain clickable.

Do not use screenshot-based PDF generation because screenshots will make the Pay Now button unclickable.

Feature 2: Branded payment route / paywall

Create a Next.js route:

/pay/[invoiceNumber]

Example:

/pay/NVH-INV-001570

This page should:

1. Receive the invoice number.
2. Call nevari-pharmacy-core to get fresh order/payment data.
3. Verify the invoice/order exists.
4. Verify the order still needs payment.
5. If already paid, redirect the user to the receipt page.
6. If payment is still required, show a clean payment page/paywall.
7. Display:
   - Invoice number
   - Customer name
   - Order number
   - Total amount
   - Balance due
   - Available payment gateways
8. Allow customer to pay using the gateway integrations already available inside nevari-pharmacy-core:
   - Paystack
   - Flutterwave
   - Stripe

The paywall must not calculate payment amount on the frontend.
The amount must come from nevari-pharmacy-core/WooCommerce.

Feature 3: Payment gateway flow

The nevari-pharmacy-core plugin already has payment gateway integrations for Paystack, Flutterwave, and Stripe.

Use those existing integrations where necessary.

Required flow:

1. Customer clicks Pay Now in the PDF.
2. Customer lands on:

   /pay/{invoiceNumber}

3. Next.js calls nevari-pharmacy-core:

   GET /wp-json/nevari/v1/orders/{order_id}/document-data

   or

   GET /wp-json/nevari/v1/invoices/{invoice_number}/payment-data

4. Plugin returns:
   - Order ID
   - Invoice number
   - Customer details
   - Order status
   - Payment status
   - Balance due
   - Available gateways
   - Payment initialization data

5. Customer selects Paystack, Flutterwave, or Stripe.
6. Next.js calls a secure payment initialization endpoint in nevari-pharmacy-core:

   POST /wp-json/nevari/v1/orders/{order_id}/payment/initialize

   Body:

   {
     "gateway": "paystack"
   }

7. nevari-pharmacy-core initializes the payment using the selected gateway.
8. The payment must include metadata tying it to the WooCommerce order:

   {
     "order_id": 1570,
     "invoice_number": "NVH-INV-001570",
     "customer_email": "customer@email.com",
     "source": "invoice_pdf_pay_now"
   }

9. Customer completes payment on the gateway.
10. Gateway redirects or sends webhook/callback to nevari-pharmacy-core.
11. nevari-pharmacy-core verifies the transaction server-side.
12. If payment is successful:
    - Mark WooCommerce order as paid
    - Call the correct WooCommerce payment completion method
    - Save transaction reference
    - Save gateway used
    - Update order status properly
    - Generate receipt availability
13. Redirect customer to receipt/success page.

Feature 4: Payment verification and order update

Payment success must never be trusted from the frontend alone.

nevari-pharmacy-core must verify payments server-side using the selected gateway API.

For successful payment:

- Paystack: verify transaction reference server-side
- Flutterwave: verify transaction ID/reference server-side
- Stripe: verify payment intent/session server-side

After verification, update the WooCommerce order.

Use WooCommerce methods like:

$order = wc_get_order($order_id);

if ($order && $order->needs_payment()) {
  $order->payment_complete($transaction_id);
  $order->add_order_note('Payment completed via invoice Pay Now link. Gateway: Paystack. Reference: ' . $transaction_id);
  $order->save();
}

Do not manually mark the order as paid without gateway verification.

Feature 5: Backend payment endpoints

Add or update these endpoints in nevari-pharmacy-core:

1. Get document data:

GET /wp-json/nevari/v1/orders/{order_id}/document-data

Returns invoice, receipt, prescription, customer, items, totals, and payment status.

2. Get invoice payment data:

GET /wp-json/nevari/v1/invoices/{invoice_number}/payment-data

Returns:

{
  "order_id": 1570,
  "invoice_number": "NVH-INV-001570",
  "payment_status": "unpaid",
  "order_status": "pending",
  "customer": {
    "name": "angus customer",
    "email": "cloud.ngus@gmail.com"
  },
  "totals": {
    "total": 210,
    "amount_paid": 0,
    "balance_due": 210
  },
  "currency": "NGN",
  "available_gateways": ["paystack", "flutterwave", "stripe"]
}

3. Initialize payment:

POST /wp-json/nevari/v1/orders/{order_id}/payment/initialize

Body:

{
  "gateway": "paystack"
}

Response:

{
  "success": true,
  "gateway": "paystack",
  "payment_url": "https://gateway-payment-link.com/...",
  "reference": "NVH-1570-XXXX"
}

4. Verify payment:

POST /wp-json/nevari/v1/orders/{order_id}/payment/verify

Body:

{
  "gateway": "paystack",
  "reference": "NVH-1570-XXXX"
}

5. Gateway webhook/callback endpoints:

POST /wp-json/nevari/v1/payments/paystack/webhook
POST /wp-json/nevari/v1/payments/flutterwave/webhook
POST /wp-json/nevari/v1/payments/stripe/webhook

Each webhook must:
- Verify gateway signature/security
- Confirm transaction status
- Find the WooCommerce order using metadata/reference
- Update the order if payment is successful
- Avoid double-processing already paid orders
- Log payment result as an order note

Feature 6: Send generated document by email

There is already an email templating system in the application.

Use the existing email templating system to send all document emails.

Do not hardcode email HTML directly inside the send endpoint unless the existing email system requires template variables.

When the admin clicks the Send Email button:

1. Detect the active document type:
   - invoice
   - receipt
   - prescription

2. Generate the current document as a PDF server-side.

3. Send the email using the existing email templating system.

4. Attach the generated PDF.

5. Use the correct template based on document type.

Recommended email template keys:

- invoice_document_email
- receipt_document_email
- prescription_document_email

Email variables to pass into the existing templating system:

{
  "customer_name": "angus customer",
  "customer_email": "cloud.ngus@gmail.com",
  "order_id": 1570,
  "invoice_number": "NVH-INV-001570",
  "receipt_number": "NVH-RCP-001570",
  "prescription_number": "NVH-RX-001570",
  "total": "₦210.00",
  "balance_due": "₦210.00",
  "payment_status": "unpaid",
  "branded_payment_url": "https://app.nevarihealth.com/pay/NVH-INV-001570"
}

Invoice email behavior:
- Use the invoice email template.
- Attach the invoice PDF.
- Include branded payment link if payment is required.
- The attached invoice PDF must also contain the clickable Pay Now button.

Receipt email behavior:
- Use the receipt email template.
- Attach the receipt PDF.
- Do not include Pay Now.
- Do not include payment link.

Prescription email behavior:
- Use the prescription email template.
- Attach the prescription PDF.
- Do not include Pay Now.
- Do not include payment link.

Feature 7: Send Email API route

Create or update the Next.js endpoint:

POST /api/admin/orders/[orderId]/documents/send

Body:

{
  "document_type": "invoice"
}

Allowed document types:

- invoice
- receipt
- prescription

This endpoint should:

1. Validate admin session.
2. Fetch fresh document data from nevari-pharmacy-core.
3. Generate PDF server-side.
4. Pass email variables to the existing email templating system.
5. Attach the PDF.
6. Send the email to the customer.
7. Return success or error response.

Example response:

{
  "success": true,
  "message": "Invoice email sent successfully."
}

Feature 8: PDF generation requirements

Use server-side HTML-to-PDF generation.

Recommended:
- Playwright
- Puppeteer

PDF rules:
- Generate from real HTML, not image screenshot.
- Preserve anchor links.
- Preserve the Pay Now link.
- Use A4 size.
- Use print-safe CSS.
- Hide toolbar/admin buttons.
- Do not include dashboard UI.
- Do not include Send Email button.
- Do not include Print button.
- Add page-break support for long item tables.
- Make the PDF suitable as an email attachment.

Example CSS:

@media print {
  .no-print {
    display: none !important;
  }

  body {
    background: #ffffff;
  }

  .document-page {
    box-shadow: none;
    margin: 0;
    width: 100%;
  }

  a.pay-now-button {
    text-decoration: none;
  }

  tr {
    page-break-inside: avoid;
  }
}

Feature 9: Frontend button behavior

In the document preview page, add these buttons outside the printable area:

- Print / Save PDF
- Send Email

The Send Email button should:
- Show loading state
- Disable while sending
- Send the active document type
- Show success toast/message
- Show error toast/message if failed

Example:

<button
  type="button"
  className="no-print"
  disabled={isSending}
  onClick={() => handleSendEmail(activeDocumentType)}
>
  {isSending ? "Sending..." : "Send Email"}
</button>

Feature 10: Pay Now visibility rules

Show Pay Now only when all are true:

- document type is invoice
- balance_due > 0
- payment_status is unpaid
- order_status is pending, awaiting-payment, or requires-payment
- branded_payment_url exists

Hide Pay Now when:

- document type is receipt
- document type is prescription
- payment_status is paid
- order_status is completed
- order_status is cancelled
- order_status is refunded
- balance_due is 0
- payment URL is missing

Feature 11: Security requirements

- Only authenticated admins can send documents.
- Customers should only access payment pages using valid invoice/order references.
- Do not trust amount from frontend.
- Do not trust payment status from frontend.
- Verify payment server-side.
- Use gateway webhooks/callbacks for final confirmation.
- Prevent duplicate payment processing.
- Never mark order as paid unless gateway verification succeeds.
- Use existing nevari-pharmacy-core gateway integrations.
- Use the existing email templating system.
- Do not expose secret keys to the frontend.
- Do not expose raw gateway secrets in PDFs or emails.

Required output:

1. Update invoice template so Pay Now is an actual clickable PDF link.
2. Add branded payment route: /pay/[invoiceNumber].
3. Build payment page/paywall using fresh data from nevari-pharmacy-core.
4. Connect payment flow to existing Paystack, Flutterwave, and Stripe integrations in nevari-pharmacy-core.
5. Ensure successful payment updates the WooCommerce order automatically.
6. Add payment verification and webhook/callback handling.
7. Add Send Email button.
8. Generate PDF server-side with clickable links.
9. Send PDF through the existing email templating system.
10. Keep invoice, receipt, and prescription design consistent.
11. Do not redesign the dashboard.
12. Make sure receipt and prescription never show Pay Now.

Final rule:
The Pay Now button in the invoice PDF must be a real clickable payment link, and every successful payment must be verified server-side and tied back to the correct WooCommerce order automatically.


- on the orders details, orders list item, and the payments page let the button open up the print directly in a prrint dialoge while the download should open up the pdf viewer  
- the status on the generated PDF document should be more visible so users can know the state of the document 
- remove the reciept/invoice number right on top of the reciept/invoice date completely from the PDF 
- the paynow button should not open the woocommerce checkout, but a custom page that displays the order details and items linked to the payment gateway fields on the plugin that is not empty, but if all has non empty fields, let the custom checkout page show all methods, when payment is complete let the said order be updated

- let the custom payment system work as explained here [pdf generation feature.md](prompts/pdf generation feature.md) 