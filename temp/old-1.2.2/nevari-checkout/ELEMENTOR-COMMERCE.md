# Nevari Checkout Elementor Commerce Widgets

## Architecture and integration

Version 1.2.2 provides one canonical `Nevari\Checkout\Elementor` module. Its adapter reads product, stock, price, cart, customer, gateway, shipping, order, and status data through WooCommerce APIs. The renderer owns the server-rendered cart, checkout, and order-progress markup. Elementor widgets and the legacy page/shortcode compatibility layer both call those same renderer methods.

The module does not query `nevari-pharmacy-core` tables, add REST routes, collect card details, or implement a payment gateway. Hosted and offline payments continue through enabled WooCommerce gateway objects and native `wc-ajax=checkout` processing.

### File tree

```text
nevari-checkout/
  nevari-checkout.php
  includes/elementor/
    class-commerce-module.php
    class-woocommerce-adapter.php
    class-commerce-renderer.php
    class-checkout-service.php
    class-ajax-controller.php
    widgets/
      class-commerce-widget-base.php
      class-cart-widget.php
      class-checkout-widget.php
      class-order-progress-widget.php
  assets/css/nevari-commerce-widgets.css
  assets/js/nevari-commerce-widgets.js
  tests/test-commerce-static-contracts.php
```

## Upgrade and Elementor use

1. Back up the site and replace the previous `nevari-checkout` plugin folder with the 1.2.2 package.
2. Confirm WordPress 6.2+, WooCommerce 7.0+, PHP 7.4+, and Elementor 3.15+.
3. Activate the plugin and clear page/CDN caches.
4. In Elementor, open the **Nevari Checkout** category and insert `Nevari Cart`, `Nevari Checkout`, or `Nevari Order Progress`.
5. Keep the standard WooCommerce Cart and Checkout page assignments. Existing `[nevari_cart]`, `[nevari_cart_page]`, `[nevari_checkout]`, and `[nevari_checkout_page]` shortcodes remain compatible.
6. For a separate success page, place `Nevari Order Progress` on a published same-site page and select its numeric page ID in the Checkout widget. Zero keeps WooCommerce's standard order-received URL.

Automatic replacement is skipped when the page output already contains the corresponding Elementor widget. Assets are registered globally but enqueued only by a widget render, the cart/checkout compatibility page, or the existing product-page module.

## Content controls

Shared controls cover back-link visibility/label/URL, page heading and safe heading tag, sticky summary, responsive wrapper sizing, colors, typography, spacing, and header styling.

Cart controls include update mode, 100–2000 ms debounce (350 ms default), product image/regular-price/remove visibility, remove label, delivery-progress visibility, summary labels, checkout URL, and empty-cart copy/action.

Checkout controls include full-name/email/address labels and placeholders, payment/review headings, visible-thumbnail limit, tip visibility/source (`fixed`, `percentage`, or existing plugin settings), presets, custom limits, coupon visibility/copy/remove label, summary labels, terms copy, action/loading copy, and a validated success-page ID. Payment columns, gaps, cards, fields, selected states, tips, and primary action have scoped responsive style controls.

Order Progress controls include authorization/missing messages, polling toggle and 15–300 second interval, success copy/animation, timeline visibility, item headings, 1–24 rows per page (3 default), pagination, summary labels, confirmation/timeline styling, opt-in item borders, and sidebar styling. Left and right item-list borders are off by default.

## AJAX interfaces

All actions require POST, a purpose-specific nonce, an active WooCommerce session where applicable, strict input validation, and generic public errors.

| Action | Purpose | Nonce action |
|---|---|---|
| `nevari_get_cart_total` | Lightweight server cart snapshot | `nevari-cart-total` |
| `nevari_update_cart_quantity` | Validated quantity mutation | `nevari-update-cart` |
| `nevari_remove_cart_item` | Remove a key owned by the current cart session | `nevari-update-cart` |
| `nevari_apply_checkout_coupon` | Apply a validated coupon and recalculate | `nevari-checkout-coupon` |
| `nevari_remove_checkout_coupon` | Remove an applied coupon and recalculate | `nevari-checkout-coupon` |
| `nevari_get_order_progress` | Authorized lightweight status polling | `nevari-order-progress` |

Checkout totals and order placement remain native WooCommerce `wc-ajax=update_order_review` and `wc-ajax=checkout` operations.

## Hooks

- `nevari_elementor_cart_view_data`
- `nevari_elementor_checkout_view_data`
- `nevari_elementor_order_progress_view_data`
- `nevari_elementor_payment_methods`
- `nevari_elementor_tip_options`
- `nevari_elementor_order_milestones`
- `nevari_elementor_before_cart_render` / `nevari_elementor_after_cart_render`
- `nevari_elementor_before_checkout_render` / `nevari_elementor_after_checkout_render`
- `nevari_elementor_before_order_progress_render` / `nevari_elementor_after_order_progress_render`

View-data filters execute server-side. Extensions must preserve escaping, monetary server authority, gateway fieldlessness, and order authorization.

## Security and threat model

- Numeric order IDs never authorize access. Initial order rendering requires customer ownership or the matching guest order key. Polling uses a one-hour HMAC token derived from the authorized order key; the key is not localized or returned.
- Status polling is limited per order/IP, briefly object-cached after authorization, pauses in hidden tabs, and stops at terminal states.
- Checkout validates full name (2–150), email (valid and at most 254), and address (5–255) on the server. WooCommerce base location supplies the local country/state/city/postcode.
- Tip presets/custom limits are HMAC-signed and fees are recalculated from the verified server session. Client totals are ignored.
- Coupon attempts are rate-limited. Cart mutations validate the current-session key, product minimum/maximum, sold-individually rules, and stock.
- Only fieldless enabled WooCommerce gateways are shown, up to nine in configured order. No card number, CVV, expiry, transaction reference, secret, or gateway credential is rendered or stored.
- Checkout idempotency stores an HMAC of a per-session token and reuses only that session's pending order. The token rotates after creation.
- Success redirects accept only a published same-site WordPress page. Order ID and key are added only to that authorized redirect.
- New order metadata is limited to the sanitized exact full name, validated success-page ID, and hashed idempotency token. Delivery fields use native WooCommerce order fields; tips use native fee lines.

## Development verification

```powershell
composer install
composer test
composer phpcs
composer phpcompat
php -l includes/elementor/class-commerce-module.php
node --check assets/js/nevari-commerce-widgets.js
```

Composer dependencies, tests, reports, and `vendor/` are excluded from the production ZIP. Staging browser verification requires the environment variables documented in the delivery report; never commit those credentials.
