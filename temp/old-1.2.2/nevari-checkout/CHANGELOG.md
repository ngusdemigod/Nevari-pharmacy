# Changelog

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
