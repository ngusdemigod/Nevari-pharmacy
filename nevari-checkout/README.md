# Nevari Checkout

Nevari Checkout 1.3.2 provides secure, responsive WooCommerce cart, checkout, and order-progress interfaces. One canonical server-rendered implementation powers Elementor widgets, existing shortcodes, and automatic WooCommerce page replacement.

## Requirements

- WordPress 6.2+
- WooCommerce 7.0+
- PHP 7.4+
- Elementor 3.15+ for Elementor widgets

## Commerce widgets

Elementor registers a **Nevari Checkout** category containing:

- `nevari-cart`
- `nevari-checkout`
- `nevari-order-progress`

Existing `[nevari_cart]`, `[nevari_cart_page]`, `[nevari_checkout]`, and `[nevari_checkout_page]` shortcodes and standard WooCommerce Cart/Checkout URLs remain supported. Pages that already render the matching Elementor widget are not replaced again.

Cart totals, stock, coupons, shipping, taxes, fees, tips, gateways, checkout processing, and orders stay authoritative in WooCommerce. Payment cards are never collected by these widgets. Enabled fieldless gateway objects, including hosted and offline gateways, keep their existing native processing.

Order access requires logged-in customer ownership or the matching guest order key. Status polling uses a short-lived signed token and never exposes the order key or gateway transaction reference.

## Product and reviews modules

The existing product experience and WooCommerce-native verified-owner reviews integration remain unchanged. Version 1.3.2 scopes the new commerce CSS/JavaScript to commerce widget/page renders and retains the existing product-page asset path.

## Install or upgrade

1. Back up the site.
2. Replace the old `nevari-checkout` directory with the 1.3.2 package.
3. Activate **Nevari Checkout** and clear site/CDN caches.
4. Confirm the Cart and Checkout assignments under WooCommerce settings.
5. Add the widgets through Elementor where desired.

See `ELEMENTOR-COMMERCE.md` for the architecture, control inventory, AJAX and hook reference, security model, test commands, and success-page setup.

## Production packaging

Development-only Composer dependencies, tests, reports, and `vendor/` are excluded from the production ZIP through `.distignore`.
