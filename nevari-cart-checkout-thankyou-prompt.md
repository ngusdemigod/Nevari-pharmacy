# Build Prompt: Nevari Checkout Elementor Widgets Extension

You are a senior WordPress, Elementor, PHP, JavaScript, UX, accessibility, and payment-integration engineer.

## Objective

Extend the existing **Nevari Checkout** WordPress plugin with a production-ready Elementor integration that recreates the supplied cart, checkout, and order-progress screens as separate Elementor widgets.

The result must look as close as possible to the supplied reference screens while remaining responsive, accessible, secure, maintainable, and fully configurable from Elementor.

Do not create a disconnected demo. Integrate with the current Nevari Checkout plugin’s real cart, checkout, customer, payment, and order data. Inspect the existing plugin first and reuse its services, hooks, models, templates, sessions, routes, order APIs, and payment adapters wherever possible.

Do not modify Elementor core, WordPress core, or third-party plugin files.

---

## Required Elementor widgets

Create these three independent widgets:

1. **Nevari Cart**
   - Widget slug: `nevari-cart`
   - Purpose: display and manage the active cart.

2. **Nevari Checkout**
   - Widget slug: `nevari-checkout`
   - Purpose: collect delivery details, select a payment method, review the order, apply a coupon, select a tip, and place the order.

3. **Nevari Order Progress**
   - Widget slug: `nevari-order-progress`
   - Purpose: display the placed-order confirmation, animated status indicator, timeline, purchased items, payment summary, and delivery address.

Place all three widgets in an Elementor category named **Nevari Checkout**.

Build shared internal PHP view components and shared CSS/JavaScript utilities where appropriate, but keep each widget independently usable on any Elementor page.

---

## Mandatory discovery and integration phase

Before writing the implementation:

1. Inspect the current Nevari Checkout plugin structure.
2. Identify:
   - Plugin namespace and bootstrap mechanism.
   - Cart/session service.
   - Product and pricing models.
   - Coupon, fees, delivery, and tip calculations.
   - Customer and delivery-address service.
   - Order creation and order-status service.
   - Existing AJAX or REST endpoints.
   - Existing Paystack and Flutterwave adapters.
   - Existing hooks, filters, templates, and frontend assets.
3. Produce a short integration map showing which existing service or hook will power each widget feature.
4. Never duplicate business logic already provided by Nevari Checkout.
5. Where the plugin has no stable integration point, add a small adapter layer and documented WordPress actions/filters rather than tightly coupling widget classes to internal implementation details.
6. Preserve backward compatibility with existing Nevari Checkout pages and shortcodes.

If the Nevari Checkout plugin is WooCommerce-backed, use WooCommerce CRUD, cart, checkout, session, customer, order, tax, shipping, coupon, and payment APIs. Do not use direct SQL for WooCommerce data.

---

## Plugin architecture

Add the Elementor feature as a namespaced module inside the current Nevari Checkout plugin unless the existing architecture clearly requires a companion add-on.

Suggested namespace:

`Nevari\Checkout\Elementor`

Suggested structure:

```text
nevari-checkout/
├── includes/
│   └── elementor/
│       ├── class-module.php
│       ├── class-widget-category.php
│       ├── contracts/
│       ├── adapters/
│       ├── services/
│       ├── widgets/
│       │   ├── class-cart-widget.php
│       │   ├── class-checkout-widget.php
│       │   └── class-order-progress-widget.php
│       ├── controls/
│       └── views/
├── assets/
│   ├── css/nevari-elementor-widgets.css
│   └── js/nevari-elementor-widgets.js
├── languages/
├── tests/
└── readme-elementor.md
```

Requirements:

- Prevent direct file access with an `ABSPATH` check.
- Use unique namespaces, class names, function names, option names, action names, filter names, REST namespaces, script handles, and CSS prefixes.
- Register widgets through Elementor’s supported widget registration hook.
- Register styles and scripts with WordPress and declare them through each widget’s dependency methods so assets load only when needed.
- Do not enqueue widget assets globally.
- Avoid deprecated Elementor Schemes APIs.
- Use Elementor Global Colors and Global Fonts where supported.
- Keep frontend markup server-rendered and progressively enhance it with JavaScript.
- Use a unique root class and `{{WRAPPER}}` selectors so widget styles never leak into the theme, other Elementor widgets, or other Nevari widgets.
- Use CSS custom properties generated from Elementor controls to reduce repeated CSS.
- Use WordPress coding standards and PHP type declarations where compatible with the plugin’s minimum PHP version.
- Add minimum supported WordPress, PHP, Elementor, and Nevari Checkout versions.
- Show a safe admin notice when a required dependency is missing or incompatible.

---

## Visual design baseline

Use the supplied screenshots as the primary visual reference.

### Default typography

- Default font family: `"Product Sans", Arial, Helvetica, sans-serif`.
- Do not bundle or redistribute Product Sans font files.
- Allow every text group to inherit Elementor Global Fonts or select another family.
- Default page title: 28–32 px desktop, 24–28 px tablet, 22–24 px mobile.
- Default body text: 14–16 px.
- Default small/meta text: 11–13 px.
- Use medium weight for headings and buttons, regular weight for body text.

### Default palette

Use editable Elementor controls with these visual defaults:

- Primary navy: `#0B3A68`
- Deeper navy: `#062F5F`
- Bright accent blue: `#16A8E5`
- Success green: `#19C43A`
- Price orange: `#FF8A00`
- Main text: `#111827`
- Secondary text: `#8A9099`
- Border: `#E7E9EE`
- Soft surface: `#F7F8FA`
- White: `#FFFFFF`
- Error: `#D92D20`

### Default geometry

- Main content max width: 1180–1240 px.
- Desktop page padding: 32–48 px.
- Tablet page padding: 24 px.
- Mobile page padding: 16 px.
- Card radius: 12–14 px.
- Pill button radius: 999 px.
- Product image size: 58–64 px desktop.
- Quantity control buttons: 32–36 px circles.
- Primary action height: 46–50 px.
- Thin dividers: 1 px.
- Use generous white space and restrained shadows.

### Icon rendering rule

Do not use text characters such as `+`, `−`, arrows, or checkmarks when their glyph metrics can cause visual misalignment.

Use one of these approaches:

- Inline SVG with `viewBox`, centered through flex/grid.
- CSS pseudo-elements that draw horizontal and vertical strokes.

All icons must be mathematically centered. Native button appearance must be reset. A circular control must render a single border only, never a doubled ring.

---

## Shared Elementor control requirements

Every visible element must have appropriate controls. Place content and behavior settings in the **Content** tab and all visual styling in the **Style** tab.

Use Elementor responsive controls where values can reasonably differ between desktop, tablet, and mobile.

For each applicable element, expose:

- Show/hide toggle.
- Text or label.
- HTML tag where safe.
- Alignment.
- Width and max width.
- Height and min height.
- Typography.
- Text color.
- Link color.
- Icon color.
- Background type and color.
- Border type, width, and color.
- Border radius.
- Box shadow.
- Padding.
- Margin.
- Gap and row/column gap.
- Icon size.
- Image size and radius.
- Normal, hover, focus, active/selected, disabled, loading, success, and error states where relevant.
- Transition duration.
- Responsive visibility.

Use Elementor group controls where appropriate:

- Typography.
- Background.
- Border.
- Box shadow.
- Text shadow only where useful.

Do not add meaningless controls. Every control must visibly affect the correct element and must be scoped with `{{WRAPPER}}`.

---

# Widget 1: Nevari Cart

## User flow

1. The widget loads the current active cart.
2. The customer can increase or decrease item quantity.
3. Quantity changes update item totals, fees, delivery progress, subtotal, and checkout total without a full-page reload.
4. The customer can remove an item.
5. Removing the final item shows the empty-cart state.
6. The customer can proceed to the configured checkout page.
7. The checkout button is disabled while totals are updating.
8. Failed updates restore the previous value and display an accessible inline error.

## Required layout

Desktop:

- Back link at top left.
- Large “Your Cart” heading.
- Two-column layout:
  - Left: item list.
  - Right: delivery progress and order summary.
- Item row contains:
  - Product image.
  - Product name.
  - Sale/current price.
  - Struck-through regular price.
  - Remove/trash action.
  - Quantity decrement button.
  - Quantity value.
  - Quantity increment button.
  - Optional text remove action.
- Right column contains:
  - Free-delivery progress bar and message.
  - Items total.
  - Delivery fee.
  - Subtotal.
  - Full-width navy checkout button.

Tablet and mobile:

- Stack the item list and summary.
- Keep quantity buttons easy to tap.
- Prevent product names and price blocks from colliding with controls.
- Allow summary to become sticky only when enabled and when it does not obscure content.

## Cart Content-tab controls

### Data and behavior

- Data source: active Nevari cart.
- Editor preview data: live cart or sample data, editor only.
- Update mode: immediate or manual update button.
- Quantity update debounce in milliseconds.
- Minimum and maximum quantity behavior.
- Checkout page selector or URL fallback.
- Continue-shopping URL.
- Open checkout in same tab or new tab.
- Sticky summary toggle and offset.

### Header

- Show back link.
- Back link label.
- Back link URL.
- Heading text.
- Heading HTML tag.

### Product row

- Show product image.
- Show product title.
- Show current price.
- Show regular price.
- Show remove icon.
- Show remove text.
- Remove text label.
- Show quantity selector.
- Quantity aria-label templates.
- Product title link toggle.

### Delivery progress

- Show progress block.
- Progress message before threshold.
- Progress message after threshold.
- Threshold source: automatic or manual preview value.
- Show progress amount text.

### Summary

- Summary heading.
- Items total label.
- Delivery fee label.
- Subtotal label.
- Checkout button label.
- Checkout button icon toggle and icon selection.

### Empty state

- Empty heading.
- Empty message.
- Continue-shopping button label and URL.

## Cart Style-tab sections

Create separate style sections for:

1. Page wrapper.
2. Back link.
3. Page heading.
4. Main two-column layout.
5. Item list container.
6. Item row.
7. Row divider.
8. Product image.
9. Product title.
10. Current price.
11. Regular price.
12. Remove icon button.
13. Remove text link.
14. Quantity wrapper.
15. Decrement button.
16. Increment button.
17. Quantity value.
18. Delivery-progress wrapper.
19. Progress track.
20. Progress fill.
21. Progress text.
22. Summary container.
23. Summary heading.
24. Summary label rows.
25. Summary values.
26. Subtotal row.
27. Checkout button.
28. Loading state.
29. Error message.
30. Empty-cart state.

Quantity buttons must support independent controls for size, border, background, icon stroke thickness, icon length, icon color, hover, focus, disabled, and active state.

---

# Widget 2: Nevari Checkout

## User flow

1. Customer opens the checkout screen with the active cart.
2. Customer enters or selects delivery information.
3. Customer selects one payment method.
4. Customer reviews the order.
5. Customer optionally selects a delivery tip.
6. Customer optionally applies or removes a coupon.
7. Totals recalculate through the Nevari Checkout backend.
8. Customer accepts required terms where configured.
9. Customer clicks “Place Order”.
10. The widget validates all fields client-side for usability and validates everything again server-side.
11. The order is created only once.
12. For Paystack or Flutterwave, initiate the existing secure hosted/tokenized gateway flow.
13. For Pay on Delivery, create the order using the plugin’s offline payment workflow.
14. On success, redirect to or reveal the Nevari Order Progress page.
15. On failure, keep entered non-sensitive data and display an accessible error summary plus inline errors.

## Required layout

Desktop:

- Back link and “Checkout” heading.
- Two-column layout:
  - Left: Delivery Information, Payment Method, Review Order.
  - Right: Order Summary, Delivery Tip, Coupon, Total, terms, Place Order.
- Left-side sections use bordered cards with rounded corners.
- Right-side Place Order button is a large rounded navy pill.

Mobile:

- Single-column flow in this order:
  1. Delivery information.
  2. Payment method.
  3. Review order.
  4. Tip.
  5. Coupon.
  6. Summary and total.
  7. Terms.
  8. Place Order.

## Payment method requirement

Remove all visible raw card-number, CVV, and expiry-date fields from this widget.

Display payment methods as a selectable grid:

- Grid supports 1–3 columns responsively.
- It supports up to nine methods in a 3×3 layout.
- Default methods:
  1. Paystack.
  2. Flutterwave.
  3. Pay on Delivery.
- Each option is a real radio input with a custom visual card.
- Entire card is clickable.
- Selected option has a clearly visible selected border, background, and indicator.
- Include gateway logo/icon, title, optional description, and optional fee note.
- Do not expose secret keys or gateway credentials in Elementor.
- Payment-method availability must come from the Nevari Checkout plugin and current order context.

## Checkout Content-tab controls

### General

- Editor preview mode: live cart or sample checkout data, editor only.
- Checkout section order, using a safe predefined ordering control.
- Show/hide back link.
- Back label and URL.
- Page heading and HTML tag.
- Sticky summary toggle and offset.

### Delivery information

- Section title.
- Section icon toggle.
- Expand/collapse behavior.
- Default expanded state.
- Address input mode: plugin default, saved-address selector, or configured field layout.
- Field labels and placeholders only where the plugin allows overrides.
- Show required markers.
- Show field descriptions.

Never allow Elementor settings to remove server-required checkout fields.

### Payment methods

- Section title.
- Payment methods source: enabled Nevari methods.
- Editor-only repeater preview with up to nine entries.
- Grid columns for desktop, tablet, and mobile.
- Show logo.
- Show title.
- Show description.
- Show fee note.
- Selected-indicator icon.

The frontend list must use the plugin’s enabled methods, not arbitrary editor-only preview items.

### Review order

- Section title.
- Show product thumbnails.
- Maximum visible thumbnails before “+N”.
- Show item count.
- Show product names.
- Show quantities.
- Show prices.
- Link to cart toggle and URL.

### Delivery tip

- Show/hide.
- Heading.
- Helper text.
- Tip source: fixed amount, percentage, or plugin-defined.
- Preset values.
- “Other” label.
- Custom-tip minimum and maximum.

### Coupon

- Show/hide.
- Heading.
- Add-coupon label.
- Input placeholder.
- Apply label.
- Remove label.

### Order summary

- Heading.
- Items total label.
- Delivery fee label.
- Service fee label.
- Discount label.
- Tax label.
- Tip label.
- Total label.
- Hide unavailable rows.

### Terms and action

- Terms text, sanitized with an allowed-HTML policy.
- Terms checkbox toggle when required by the plugin.
- Place-order button label.
- Loading label.
- Success label.
- Optional button icon.
- Success redirect page selector.

## Checkout Style-tab sections

Create separate style sections for:

1. Page wrapper.
2. Header and back link.
3. Page heading.
4. Two-column layout.
5. Checkout section card.
6. Section title row.
7. Section title.
8. Section icon.
9. Section chevron.
10. Expanded and collapsed states.
11. Form labels.
12. Required marker.
13. Text inputs.
14. Select fields.
15. Textareas.
16. Checkbox and radio inputs.
17. Input placeholder.
18. Input focus state.
19. Input error state.
20. Input error text.
21. Payment grid wrapper.
22. Payment option card.
23. Payment option logo.
24. Payment option title.
25. Payment option description.
26. Payment option fee note.
27. Payment option selected indicator.
28. Payment option normal, hover, focus, selected, and disabled states.
29. Review-order container.
30. Review thumbnails.
31. “+N” thumbnail.
32. Review product text.
33. Summary wrapper.
34. Summary heading.
35. Summary rows and dividers.
36. Summary labels.
37. Summary values.
38. Tip heading and helper.
39. Tip chips.
40. Custom-tip field.
41. Coupon row.
42. Coupon trigger.
43. Coupon input and buttons.
44. Total row.
45. Terms text and links.
46. Place-order button.
47. Button loading spinner.
48. Checkout error summary.
49. Success message.

The payment grid must include responsive column controls, grid gap, option min height, logo size, internal alignment, content alignment, and selected-state styling.

---

# Widget 3: Nevari Order Progress

## User flow

1. After a successful order, show an animated confirmation state.
2. Load the order only when the current customer/session is authorized to view it.
3. Display the current order status and completed/upcoming milestones.
4. Optionally refresh the order status at a configured interval.
5. Announce status changes through a polite `aria-live` region.
6. Display purchased items with pagination when required.
7. Display order number, totals, payment method, and delivery address.
8. Provide a back link or continue-shopping link.
9. Stop polling when the order reaches a final state or when the tab is hidden for an extended period.

## Required layout

Desktop:

- Back link and “Order in Progress” heading.
- Left main column:
  - Large success/check icon.
  - “Order is Placed” message.
  - Three-stage or configurable status timeline.
  - Item list/table.
  - Pagination.
- Right sidebar:
  - Order Summary card.
  - Paid With card.
  - Delivery Address card.

### Item-list border requirement

The order-items section must have no left border and no right border by default.

Keep only the header divider, row dividers, and optional bottom/pagination divider. Expose independent Elementor controls so an editor can enable or disable top, right, bottom, and left borders.

### Checkmark animation requirement

Use an inline SVG checkmark:

- Circle may scale or pulse once.
- Check stroke draws from start to end using `stroke-dasharray` and `stroke-dashoffset`.
- Optional subtle success halo.
- Animation runs once on initial reveal by default.
- Editor controls for enable/disable, duration, delay, easing, pulse scale, halo opacity, and repeat behavior.
- Respect `prefers-reduced-motion`; show the final static check without movement when reduced motion is requested.

## Order Progress Content-tab controls

### Data

- Order source: order ID from Nevari success context, current query variable, or securely signed order key.
- Editor preview order: sample data only in Elementor editor.
- Unauthorized-order message.
- Missing-order message.
- Auto-refresh toggle.
- Refresh interval with a safe minimum.

### Header and confirmation

- Back link toggle, label, and URL.
- Page heading and HTML tag.
- Success title.
- Success icon toggle.
- Animation toggle.
- Animation duration.
- Animation delay.
- Pulse toggle.
- Halo toggle.

### Timeline

- Show/hide timeline.
- Milestone source: plugin-defined statuses.
- Editor preview milestone labels.
- Date/time format.
- Show milestone date.
- Show completed icon.
- Show active icon.
- Show upcoming icon.

### Item list

- Items heading.
- Quantity-column heading.
- Show product image.
- Show product title.
- Show current price.
- Show regular price.
- Show quantity badge.
- Rows per page.
- Show pagination.
- Previous and next aria-labels.

### Summary cards

- Order Summary heading.
- Order number label.
- Fee labels.
- Total label.
- Paid With heading.
- Delivery Address heading.
- Show gateway icon.
- Show address icon.
- Show address link where available.

## Order Progress Style-tab sections

Create separate style sections for:

1. Page wrapper.
2. Header and back link.
3. Page heading.
4. Main/sidebar layout.
5. Confirmation wrapper.
6. Success circle.
7. Checkmark stroke.
8. Check halo.
9. Success title.
10. Timeline wrapper.
11. Timeline track.
12. Completed track.
13. Timeline marker.
14. Completed marker.
15. Active marker.
16. Upcoming marker.
17. Timeline label.
18. Timeline date.
19. Item-list wrapper.
20. Item-list top border.
21. Item-list right border.
22. Item-list bottom border.
23. Item-list left border.
24. Item header.
25. Item row.
26. Row divider.
27. Product image.
28. Product title.
29. Current price.
30. Regular price.
31. Quantity badge.
32. Pagination wrapper.
33. Pagination arrow.
34. Pagination number.
35. Active page.
36. Summary card.
37. Summary-card heading.
38. Summary-card labels.
39. Summary-card values.
40. Order-number link.
41. Payment-method icon and text.
42. Address icon and link.
43. Loading skeleton.
44. Empty, missing, and unauthorized states.

---

## Elementor editor experience

- All widgets must render a useful preview in the Elementor editor even when no live cart or order session exists.
- Sample data must be explicitly marked as editor preview and must never appear on the published frontend.
- Use conditional controls so irrelevant controls are hidden.
- Keep control sections logically grouped and named.
- Add helpful descriptions for payment, data-source, animation, and security-sensitive settings.
- Do not expose secrets, webhook URLs, private API keys, raw order tokens, or personally identifiable data in Elementor controls.
- Support copy/paste styles and Elementor responsive mode.
- Reinitialize JavaScript correctly after Elementor editor rerenders a widget.

---

## Responsive behavior

Support desktop, tablet, and mobile using Elementor responsive controls and the site’s configured breakpoints.

### Desktop

- Cart and checkout: approximately 65/35 or 68/32 two-column ratio.
- Order progress: approximately 66/34 two-column ratio.
- Payment methods: three columns by default.

### Tablet

- Allow two-column or stacked layouts through a responsive control.
- Payment methods: two columns by default.

### Mobile

- Single-column layout.
- Payment methods: one column by default, with an optional two-column setting.
- Full-width primary buttons.
- Minimum 44×44 px interactive hit areas where practical.
- No horizontal scrolling at 320 px viewport width.
- Long product names, addresses, order IDs, and prices must wrap safely.

---

## Accessibility requirements

Meet WCAG 2.2 AA behavior wherever practical.

- Use semantic headings and landmarks.
- Use real buttons for actions and real links for navigation.
- Use real radio inputs for payment selection.
- Ensure visible keyboard focus.
- Maintain logical tab order.
- Add accessible names to icon-only controls.
- Use `aria-current` for active pagination.
- Use `aria-live="polite"` for cart totals, checkout errors, and order-status updates.
- Use `aria-busy` during asynchronous updates.
- Associate errors with fields using `aria-describedby`.
- Do not rely on color alone for selected, completed, success, or error states.
- Ensure sufficient text and control contrast.
- Respect reduced-motion preferences.
- Keep focus in a predictable location after cart updates, coupon updates, checkout errors, and successful order placement.

---

## Security requirements

Follow WordPress and Elementor plugin security best practices throughout.

### Input and output

- Validate input against strict allowlists whenever possible.
- Sanitize input according to its type.
- Use `wp_unslash()` before sanitizing request values where appropriate.
- Escape all output at the point of rendering.
- Use context-specific escaping such as `esc_html()`, `esc_attr()`, `esc_url()`, `esc_js()`, and `wp_kses_post()`.
- Never use sanitization functions as a replacement for output escaping.
- Restrict rich text to an explicit allowed-HTML policy.

### Authorization and CSRF

- Use nonces for all state-changing AJAX or REST operations.
- Treat nonces as CSRF protection, not authorization.
- Check user capabilities for administrative settings and privileged order actions.
- For guest carts and guest checkout, validate the Nevari session, a short-lived signed cart token, order key, or equivalent ownership proof.
- Prevent insecure direct object reference: never return an order solely because a numeric order ID was supplied.
- Register REST endpoints under a unique namespace such as `nevari-checkout/v1` and provide a strict `permission_callback` for every route.
- Use GET only for read-only operations and POST/PUT/PATCH/DELETE for state changes.

### Payments

- Never collect, process, store, or log raw card numbers, CVV values, or expiry dates in these widgets.
- Use the existing Paystack and Flutterwave hosted/tokenized integration.
- Keep secret keys server-side only.
- Verify gateway callbacks and webhooks server-side using the provider’s signature mechanism.
- Verify transaction amount, currency, order reference, and final status server-side before marking an order paid.
- Add idempotency protection so repeated callbacks or double clicks cannot create or pay an order twice.
- Disable the Place Order button while a request is active, but never rely on the disabled button as the only duplicate-order protection.

### Database and requests

- Prefer Nevari or WooCommerce APIs over direct database access.
- If custom SQL is unavoidable, use `$wpdb->prepare()` and strict types.
- Do not trust client-calculated prices, fees, tips, discounts, taxes, delivery charges, or totals.
- Recalculate and validate all monetary values server-side.
- Use `wp_safe_redirect()` for internal redirects.
- Validate external redirect hosts against an allowlist.
- Rate-limit sensitive public endpoints such as coupon checks, payment initialization, and order-status polling.
- Return generic public errors while logging safe diagnostic context server-side.
- Never log payment secrets, full addresses, full order tokens, or unnecessary personally identifiable information.

### WordPress administration

- Protect settings saves with capability checks and nonces.
- Sanitize every saved option.
- Do not delete existing Nevari Checkout data on deactivation.
- Remove only data created by this Elementor module on uninstall, and only when an explicit “delete data on uninstall” option is enabled.

---

## Performance requirements

- Load CSS and JavaScript only on pages containing the relevant widget.
- Use one small shared stylesheet and one small shared script unless per-widget splitting is measurably better.
- Prefer vanilla JavaScript unless the existing plugin already standardizes on another dependency.
- Do not bundle duplicate copies of libraries already supplied by WordPress or Elementor.
- Debounce quantity, coupon, and status-polling requests.
- Abort stale frontend requests.
- Pause polling when the document is hidden.
- Stop polling at final order statuses.
- Use responsive image functions and appropriate image sizes.
- Avoid cumulative layout shift by reserving media and status-icon dimensions.
- Do not cache customer-specific cart, checkout, or order HTML in a public full-page cache.
- Ensure the widgets remain usable when JavaScript fails; destructive and checkout actions may show a safe fallback message when a secure non-JavaScript flow is unavailable.

---

## Extensibility requirements

Add documented hooks without exposing sensitive information.

Suggested filters and actions:

```php
nevari_elementor_cart_view_data
nevari_elementor_checkout_view_data
nevari_elementor_order_progress_view_data
nevari_elementor_payment_methods
nevari_elementor_order_milestones
nevari_elementor_widget_default_tokens
nevari_elementor_before_cart_render
nevari_elementor_after_cart_render
nevari_elementor_before_checkout_render
nevari_elementor_after_checkout_render
nevari_elementor_before_order_progress_render
nevari_elementor_after_order_progress_render
```

Prefix all hooks consistently and document their parameters and escaping expectations.

---

## JavaScript behavior

Build a small namespaced frontend controller.

Required modules:

- Cart quantity update.
- Cart item removal.
- Delivery-progress update.
- Coupon apply/remove.
- Tip selection/custom tip.
- Payment-method selection.
- Checkout validation and submission.
- Order-status polling.
- Checkmark reveal animation.
- Pagination.
- Elementor editor reinitialization.

Requirements:

- Initialize each widget from a `data-widget-id` root.
- Never query or mutate elements outside that widget root.
- Use event delegation where appropriate.
- Prevent duplicate initialization.
- Support multiple instances of the same widget on one page without ID collisions.
- Use localized runtime configuration for public endpoint URLs, nonces, translated strings, and safe public settings only.
- Do not localize secrets or private order data.
- Provide clear loading, success, and error state classes.
- Dispatch custom DOM events after successful cart, checkout, and order-status changes.

---

## CSS requirements

- Prefix all classes with `nevari-`.
- Scope all control-generated selectors with `{{WRAPPER}}`.
- Use logical properties where practical.
- Reset native button styles only inside widget roots.
- Do not use `!important` unless there is a documented interoperability reason.
- Use CSS variables for frequently customized values.
- Ensure the quantity minus button has exactly one circular border.
- Center plus/minus lines with grid or flex and SVG/CSS geometry.
- Remove left and right borders from the order-items table by default.
- Ensure selected payment cards have a clear visual state.
- Do not hard-code a single screenshot viewport; preserve the visual hierarchy across breakpoints.

---

## Internationalization and localization

- Wrap all PHP strings in the plugin text domain.
- Escape translated output.
- Make frontend strings translatable through `wp_set_script_translations()` or localized data where appropriate.
- Support RTL layouts.
- Format prices, dates, times, numbers, and addresses through WordPress, Nevari, WooCommerce, or site locale APIs rather than manual formatting.

---

## Testing requirements

Provide automated and manual tests.

### PHP tests

- Widget registration.
- Dependency checks.
- Sanitization and validation.
- Authorization and order ownership.
- Cart update endpoints.
- Coupon endpoint.
- Order creation idempotency.
- Order-status endpoint.
- Payment callback verification adapters.

### Browser tests

- Cart quantity increment/decrement.
- Remove item.
- Empty cart.
- Responsive stacking.
- Payment method keyboard selection.
- Coupon apply/remove.
- Tip selection.
- Checkout validation.
- Prevent double submission.
- Successful Pay on Delivery order.
- Payment-gateway handoff mocked in tests.
- Animated checkmark and reduced-motion behavior.
- Order-status polling.
- Pagination.
- Multiple widget instances.
- Elementor editor preview and rerender.

### Security tests

- CSRF rejection.
- Unauthorized order access rejection.
- Tampered totals rejection.
- Invalid coupon payload rejection.
- Stored and reflected XSS attempts.
- SQL injection payloads.
- Open redirect attempts.
- Replay/double-submit behavior.
- Invalid payment callback signatures.

### Visual regression tests

Capture desktop, tablet, and mobile screenshots for all three widgets and compare them against approved reference baselines.

Include explicit regression checks for:

- Centered plus/minus icons.
- No doubled minus-button ring.
- No left/right border on the order-items section.
- Animated checkmark.
- Three-column payment method layout on desktop.

---

## Acceptance criteria

The work is complete only when:

1. All three widgets appear in the Elementor editor under “Nevari Checkout”.
2. Each widget can be inserted and configured independently.
3. Published widgets use real Nevari cart/order data.
4. Editor sample data never leaks to the frontend.
5. The default design closely matches the supplied screenshots.
6. Product Sans is the default family when available, with safe fallbacks.
7. Every visible visual element has relevant Style-tab controls.
8. Controls work responsively and do not leak styles.
9. Quantity icons are perfectly centered.
10. The decrement button has one border, not a double ring.
11. The order-items section has no left or right border by default.
12. The success checkmark animates and respects reduced motion.
13. Checkout payment methods appear as a selectable grid with Paystack, Flutterwave, and Pay on Delivery defaults.
14. No raw card fields appear in the Elementor checkout widget.
15. Cart and checkout totals are always calculated server-side.
16. Unauthorized users cannot view another customer’s order.
17. Assets load only when the associated widget is used.
18. Widgets work with multiple instances, Elementor editor rerenders, responsive breakpoints, RTL, and keyboard navigation.
19. No PHP notices, JavaScript console errors, accessibility-critical errors, or coding-standard violations remain.
20. Existing Nevari Checkout functionality remains backward compatible.

---

## Required deliverables

Return:

1. A brief architecture and integration report.
2. The complete production-ready source code, not pseudocode.
3. A file tree.
4. Installation or upgrade instructions.
5. Elementor usage instructions for each widget.
6. A full control inventory for Content and Style tabs.
7. REST/AJAX endpoint documentation.
8. Hook/filter documentation.
9. Security notes and threat-model summary.
10. Automated tests and instructions to run them.
11. Visual-regression screenshots at desktop, tablet, and mobile sizes.
12. A changelog entry for the Nevari Checkout plugin.

Do not stop after generating markup. Deliver a working, integrated WordPress/Elementor implementation.
