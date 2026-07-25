# Changelog

## 1.3.2 - 2026-07-18

- Added a legacy adapter-filename compatibility loader so partial or mixed upgrades cannot fatal on the former `class-nevari-checkout-adapter.php` typo.
- Deferred plugin runtime initialization to `init` priority 5 to avoid WordPress 6.7+ just-in-time translation notices.
- Hardened package regression checks for every commerce-module dependency and the compatibility loader.
- Matched the supplied cart, checkout, and order-progress desktop proportions and corrected theme CSS overrides affecting form and action controls.
- Added granular responsive Elementor Style controls for every visible widget group: wrapper, columns, headings, rows, controls, progress, summaries, cards, fields, payments, review strip, tips, coupons, totals, timeline, order items, pagination, and sidebar cards.
- Changed the default Cart presentation to the proposed outlined decrement, plain quantity, circular increment, and text Remove action; the optional trash action remains available.
- Made the secondary WooCommerce order-status label optional and hidden by default while preserving accessible live polling announcements.

## 1.3.0 - 2026-07-17

- Matched the supplied cart, checkout, and order-progress desktop proportions and corrected theme CSS overrides affecting form and action controls.
- Added granular responsive Elementor Style controls for every visible widget group: wrapper, columns, headings, rows, controls, progress, summaries, cards, fields, payments, review strip, tips, coupons, totals, timeline, order items, pagination, and sidebar cards.
- Changed the default Cart presentation to the proposed outlined decrement, plain quantity, circular increment, and text Remove action; the optional trash action remains available.
- Made the secondary WooCommerce order-status label optional and hidden by default while preserving accessible live polling announcements.

## 1.2.2 - 2026-07-17

- Fixed the cart-page fatal by resolving WooCommerce's `WC_Shipping_Zones` class from the global namespace inside the namespaced commerce adapter.
- Added a regression contract for the shipping-zone namespace resolution.

## 1.2.1 - 2026-07-17

- Fixed the production module loader filename so `class-woocommerce-adapter.php` is loaded correctly on Linux hosts.
- Added package require-path verification to prevent another activation build with a missing include.
## 1.2.0 - 2026-07-17

- Added independent `nevari-cart`, `nevari-checkout`, and `nevari-order-progress` Elementor widgets under **Nevari Checkout**.
- Replaced cart, checkout, and order-received compatibility output with the same canonical server-rendered views used by the widgets.
- Added responsive mockup-aligned CSS, accessible vanilla-JavaScript enhancement, editor-only marked sample data, RTL, and reduced-motion behavior.
- Hardened cart/coupon AJAX with purpose nonces, session checks, method validation, stock-aware quantities, rate limits, and data-only snapshots.
- Added fieldless WooCommerce gateway discovery and native WooCommerce checkout/gateway processing.
- Added signed fixed/percentage/plugin-defined tips, local-delivery field validation, same-site success redirects, and checkout idempotency.
- Added ownership/key-authorized order rendering plus signed, rate-limited status polling.
- Preserved existing shortcodes, WooCommerce page URLs, product experience, and product-reviews integration.
- Raised the plugin version from 1.1.0 to 1.2.0.
