You are working inside the existing Admin Storefront dashboard codebase. Your task is to update the UI layout of the existing popup/modals only, using the exact modal mockups already available in `main nevari design system.html`.

Do not change dashboard functionality. Do not change API calls, form submission logic, state management, validation, routing, event handlers, permissions, existing data flow, table actions, or backend integration. This is a UI refactor only. Preserve all existing functional behaviour and wire the new layouts into the existing popup components.

Open `main nevari design system.html` and locate the modal system around the shared live modal shell:

`<div class="rx-live-modal" id="rxLiveModal" aria-hidden="true">`
`<article class="modal-frame">`
`.modal-head`
`.modal-body`
`.modal-actions`

Use this as the base modal structure for all Admin Storefront popups. Copy or carefully port only the necessary CSS from the design system so the admin dashboard remains visually coherent. The required style groups are:

`:root` design tokens, especially primary navy, beige accent, success, warning, danger, muted text, border lines, radius, shadows and font variables.

Core reusable components:
`.btn`
`.btn-primary`
`.btn-outline`
`.btn-danger`
`.btn-icon`
`.chip`
`.form-control`
`.ui-icon`
`.rx-live-modal`
`.modal-frame`
`.modal-head`
`.modal-body`
`.modal-actions`

Popup shell behaviour:
The modal overlay must use the same navy translucent backdrop and blur.
The modal frame must have the same rounded corners, warm off-white surface, soft border, shadow and glass effect.
The modal header and footer must remain sticky.
Only the modal body should scroll.
The close button must remain in the top-right.
Mobile responsiveness must follow the design system rules.

Now locate and port the creation popup system from the design system:

`.creation-popup-layout`
`.creation-main`
`.creation-side`
`.creation-section-title`
`.creation-field-grid`
`.creation-field`
`.upload-box`
`.creation-avatar-preview`
`.creation-product-preview`
`.creation-summary-list`
`.creation-choice`
`.time-choice-row`
`.creation-popup-note`
`.creation-frame`

Apply the matching creation templates to these existing Admin Storefront popups:

1. Existing “Create profile” or “Add staff/user” popup
   Use `popup-template-profile` and `popup-actions-profile`.
   The layout should have a large left form panel for staff identity, first name, last name, email, phone, role, branch, profile image upload and permissions. The right preview card should show initials, name, role, status, access level, branch and helper note.

2. Existing “Create product” popup
   Use `popup-template-product` and `popup-actions-product`.
   The layout should include product name, SKU, category, strength/dosage, unit price, stock quantity, expiry date, prescription rule, product image upload and description. The right preview card should show product image/icon, product title, category, price, stock and prescription rule.

3. Existing “Create order” popup
   Use `popup-template-order` and `popup-actions-order`.
   The layout should include customer name, email, phone, payment status, product, quantity, delivery method, prescription and internal note. The right preview card should show customer, selected product, total and payment status.

4. Existing “New appointment” popup
   Use `popup-template-appointment` and `popup-actions-appointment`.
   The layout should include patient name, consultation type, doctor, date, available time slots and reason for visit. The right preview card should show patient, consultation type, doctor, date and selected time.

Next locate and port the redesigned detail modal system from the design system:

`.detail-frame`
`.detail-modal-shell`
`.detail-panel`
`.detail-panel-head`
`.detail-grid-main`
`.detail-grid-2`
`.detail-grid-3`
`.detail-tabs`
`.detail-tab`
`.detail-tab-panel`
`.detail-field-grid`
`.detail-field`
`.detail-input`
`.detail-select`
`.detail-textarea`
`.currency-input`
`.rich-editor-shell`
`.rich-toolbar`
`.rich-editor`
`.media-gallery-card`
`.product-photo`
`.upload-dropzone`

Also port the operational/document styles:

`.ops-hero`
`.ops-title-line`
`.ops-subline`
`.ops-hero-actions`
`.ops-icon-btn`
`.ops-kpi-grid`
`.ops-kpi`
`.ops-grid-2`
`.ops-panel`
`.ops-panel-head`
`.ops-info-grid`
`.ops-info-item`
`.ops-table`
`.ops-product-cell`
`.ops-timeline-clean`
`.ops-time-item`
`.payment-hero-card`
`.payment-hero-actions`
`.document-shell`
`.document-toolbar`
`.document-paper`
`.document-header`
`.doc-brand`
`.doc-mark`
`.doc-type`
`.doc-meta-grid`
`.doc-meta`
`.doc-table-wrap`
`.doc-table`
`.doc-total-box`
`.doc-total-row`
`.doc-footer`
`.prescription-alert`
`.rx-instructions`
`.rx-instruction-card`

Apply the matching detail templates to these existing Admin Storefront popups:

5. Existing product edit popup
   Use `detail-template-product` and `detail-actions-product`.
   This should become the “Loratadine 10mg / Product Editor” style layout: left media gallery, right tabbed product editor with Details, Tags & Organization, and Inventory & Shipping. Preserve current product edit fields and save/delete functionality.

6. Existing order details popup
   Use `detail-template-order` and `detail-actions-order`.
   This should become the “Order #1610 / Order Details” style layout: top fulfilment hero, KPI strip, customer information card, fulfilment timeline, product/order panels and footer actions. Preserve existing order update, close, customer email, invoice, print and prescription actions.

7. Existing payment review / payment approval popup
   Use `detail-template-payment` and `detail-actions-payment`.
   This should become the “Payment Receipt Review” style layout: top payment receipt hero, large navy total-paid band, customer/RX/reference cards, customer information, capture summary and approval controls. Preserve flag payment, close and approve payment functionality.

8. Existing receipt preview / generated receipt popup
   Use `detail-template-receipt` and `detail-actions-receipt`.
   This should become the “Receipt RCT-2026-1612 / Receipt Design” document layout: official receipt preview, print/send buttons, pharmacy identity, amount received band, received-from card, payment method card, receipt item table and footer actions. Preserve print receipt, close and email/send receipt functionality.

9. Existing prescription preview / verify prescription popup
   Use `detail-template-prescriptiondoc` and `detail-actions-prescriptiondoc`.
   This should become the “Prescription RX-2026-0842 / Prescription Design” document layout: prescription document preview, print/verify buttons, pharmacy identity, prescription warning, patient card, prescriber card, medicine table, instructions and verification actions. Preserve download RX, close and mark verified functionality.

Implementation rules:

Use the design system HTML as the source of truth for class names, spacing, border radius, shadows, typography, modal dimensions and responsive behaviour.

Do not hardcode the demo values permanently if the existing dashboard already has real data. Replace demo text with existing data bindings, props, state values or template variables while keeping the same visual structure.

Do not remove existing submit handlers. The new primary buttons must call the same functions currently used by the old popups.

Do not break current forms. Keep all current field names, controlled inputs, validation messages, hidden IDs, payload structure and existing disabled/loading states.

Do not introduce new backend logic.

Do not introduce unrelated libraries.

Scope any copied CSS so it does not damage the rest of the dashboard. Prefer a wrapper such as `.admin-storefront`, `.nevari-admin`, or the existing admin dashboard root. Avoid global overrides unless they are already part of the design system variables and are safe.

Use the existing dashboard icon system where available. If the project already has icons, map them to the same visual roles as the design system icons. Keep icons outline-based, navy, clean and minimal.

Make sure every modal has:
proper `role="dialog"`,
`aria-modal="true"`,
close button,
escape/outside close behaviour if already supported,
sticky header,
scrollable content body,
sticky footer actions,
responsive mobile layout.

Acceptance criteria:

The UI of each popup should visually match the design system screenshots exactly in layout, spacing, colours, typography, rounded corners, borders and shadows.

The create profile, create product, create order and new appointment popups should use the creation popup layout.

The product editor, order details, payment receipt review, receipt preview and prescription preview popups should use the detail/document modal layouts.

The dashboard should behave exactly as before after the UI update.

No existing functionality should be removed, renamed, disabled or rewritten unnecessarily.

After implementation, test all respective popups from the Admin Storefront:
open,
close,
scroll,
fill fields,
switch tabs,
upload area click,
change selectable pills,
save/create,
approve payment,
flag payment,
print/email receipt,
open/verify prescription,
update order.

Fix any visual overflow, mobile overflow or broken sticky footer/header behaviour before finalising.


Important profile modal replacement rule:

The new `Create profile` modal must not be limited to staff/admin profile creation only. It should replace the two separate existing creation modals currently used for creating doctors and customers.

Where the dashboard currently opens a “Create Doctor” modal, it should now open this same unified profile creation modal, using doctor-relevant fields, role selection, branch assignment and the existing doctor creation submit logic.

Where the dashboard currently opens a “Create Customer” modal, it should now open this same unified profile creation modal, using customer-relevant fields, contact details and the existing customer creation submit logic.

Do not remove the doctor or customer creation functionality. Only replace the old separate modal UI layouts with the unified design-system profile modal layout. Preserve the existing data handling, validation, state, API calls, submit handlers and success/error behaviour for both doctor creation and customer creation.

The unified profile modal should be flexible enough to adapt based on context:

* Doctor creation context should show doctor/profile-specific fields and save through the existing doctor creation flow.
* Customer creation context should show customer/profile-specific fields and save through the existing customer creation flow.
* Staff/admin creation context should continue to use the staff profile creation flow where applicable.

The visual layout must remain consistent with `popup-template-profile` from `main nevari design system.html`, but the form content, labels and submit action should adapt to the entity being created.
