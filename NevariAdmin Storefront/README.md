# NevariAdmin Storefront

Next.js App Router storefront frontend for the Nevari pharmacy workflow.

## Files

- `app/layout.js` - Next.js root layout
- `app/page.js` - Next.js entry page that renders the storefront shell
- `app/globals.css` - global design system and responsive layout
- `public/storefront-app.js` - client-side rendering for metrics, operational tables, auth, and audit filtering
- `index.html` - legacy static markup source used during migration

## Run

This frontend is self-hostable as static files.

Install dependencies:

```powershell
cd "C:\Users\USER\Downloads\nevari-pharmacy-core\NevariAdmin Storefront"
npm install
```

Run locally:

```powershell
cd "C:\Users\USER\Downloads\nevari-pharmacy-core\NevariAdmin Storefront"
npm run dev -- --hostname 0.0.0.0 --port 4173
```

Then open `http://localhost:4173`.

Docker Desktop:

```powershell
cd "C:\Users\USER\Downloads\nevari-pharmacy-core"
docker compose up -d --build
```

## Live WordPress connection

The storefront now uses a first-time pairing flow before login:

1. In WordPress Admin, open `Nevari Pharmacy -> Connections`
2. Generate a one-time code for `Storefront`
3. Open this frontend and enter the pairing code
4. After pairing succeeds, sign in with WordPress credentials

The storefront then authenticates against the plugin REST API:

- `POST /wp-json/nevari/v1/auth/login`
- `POST /wp-json/nevari/v1/auth/refresh`
- `POST /wp-json/nevari/v1/connections/verify`
- `POST /wp-json/nevari/v1/connections/register`
- `GET /wp-json/nevari/v1/dashboard/store-admin`
- supporting live data endpoints for orders, appointments, prescriptions, doctors, emails, products, and audit logs

Session tokens are stored in browser local storage for this frontend.

## Cross-origin note

The plugin now sends CORS headers for Nevari REST routes when the request origin matches the allowed list.

Default allowed origins:

- the WordPress `home_url()`
- the WordPress `site_url()`
- `null` for local `file://` usage

If you host this storefront on a different domain, add that origin through the `nevari_allowed_origins` WordPress filter.

## Scope

The UI is shaped around the Nevari overview:

- WooCommerce sales and order queue
- consultation and prescription operations
- email performance
- audit categories for orders, payments, security, consultation, and emails
