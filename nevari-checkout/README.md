# Nevari Checkout

Nevari Checkout is a WooCommerce customization plugin that replaces the default cart, checkout, and order-received screens with custom templates and behaviors tailored for the Nevari storefront.

## What it does

- Replaces the WooCommerce cart page content with a custom cart layout.
- Replaces the WooCommerce checkout page content with a custom two-column checkout layout.
- Replaces the WooCommerce order received / thank-you page with a custom order summary view.
- Loads custom CSS and JavaScript only on product, cart, and checkout pages.
- Supports AJAX cart quantity updates on the front end.
- Makes default WooCommerce checkout fields optional where needed.
- Validates and saves custom checkout fields during order creation.
- Applies a configurable tip fee during checkout.
- Stores tip selection in the checkout session while the order review updates.
- Applies free shipping automatically when the cart reaches a configured threshold.

## Product experience module

The plugin also includes a product experience module that extends single product pages and review handling.

- Uses WooCommerce's native product comment/review system instead of a separate review table or custom post type.
- Enforces logged-in verified-owner eligibility before showing or accepting a review form.
- Renders a custom review layout with rating summaries, verified-owner badges, pagination, and a scroll-to-form action.
- Provides custom single product templates for hero, details, reviews, and add-to-cart sections.
- Exposes shortcodes for reviews and AJAX add-to-cart behavior.
- Adds admin settings for review module behavior and add-to-cart button styling.

## Admin settings

The main plugin adds a WooCommerce submenu page named **Nevari Checkout**.

Current settings include:

- Free shipping threshold

The product experience module also registers additional WooCommerce settings pages for:

- Reviews module options
- Add-to-cart button options

## Front-end behavior

The plugin enqueues assets only when needed, using the following conditions:

- Checkout page
- Cart page
- Product page

JavaScript behavior includes:

- Updating cart quantities without a full page refresh
- Rebinding custom UI after checkout updates
- Handling custom cart control interactions

## File structure

- `Nevari-checkout.php` - plugin bootstrap file with the WordPress plugin header
- `includes/class-nevari-checkout.php` - main implementation for checkout, cart, and order-received overrides
- `includes/class-nevari-product-experience.php` - product page, review, shortcode, and admin module
- `assets/` - CSS and JavaScript assets
- `templates/` - WooCommerce template overrides used by the product experience module

## Installation

1. Upload the `Nevari-checkout` folder into `wp-content/plugins/`.
2. Make sure WooCommerce is installed and active.
3. Activate **Nevari Checkout** from the WordPress Plugins screen.

## Notes

- The plugin depends on WooCommerce functions and templates.
- If WooCommerce is not active, the plugin will not provide its intended storefront behavior.
- The root file must be `Nevari-checkout.php` for WordPress to recognize the package correctly.
