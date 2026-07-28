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

The storefront authenticates directly against the plugin REST API:

- `POST /wp-json/nevari/v1/auth/login`
- `POST /wp-json/nevari/v1/auth/refresh`
- `GET /wp-json/nevari/v1/dashboard/store-admin`
- supporting live data endpoints for orders, appointments, prescriptions, doctors, emails, products, and audit logs

Set `NEVARI_PROXY_ALLOWED_ORIGINS` on the Next.js server to the comma-separated list of WordPress origins this deployment may contact, for example:

```powershell
$env:NEVARI_PROXY_ALLOWED_ORIGINS="https://pharmacy.example.com"
```

Set a long random `NEVARI_PROXY_SIGNING_SECRET` on both the Next.js deployment and the WordPress runtime. The Next.js proxy signs its server-derived storefront origin; the plugin rejects unsigned or replayed frontend-origin headers.

```powershell
$env:NEVARI_PROXY_SIGNING_SECRET="<random-secret-at-least-32-bytes>"
```

In WordPress, expose the same value through the environment or define it in `wp-config.php`:

```php
define('NEVARI_PROXY_SIGNING_SECRET', '<same-random-secret>');
```

If WordPress is behind a trusted reverse proxy and rate limits/audit logs must use forwarded visitor IPs, configure only the immediate proxy IP addresses in WordPress:

```php
define('NEVARI_TRUSTED_PROXY_IPS', '203.0.113.10,203.0.113.11');
```

If `NEVARI_TRUSTED_PROXY_IPS` is not configured, rate limits and audit events use the direct connection address and ignore `X-Forwarded-For`.

The proxy rejects requests when either required configuration value is missing, when the target is outside the allowlist, when the target uses a private-network hostname, or when a browser request does not identify the deployed app origin.

Session bearer tokens are held in server-managed `HttpOnly`, `SameSite=Strict` cookies. Browser storage contains only non-secret connection/UI state and a session-presence marker.

## Sentry

This storefront is wired for full-stack Sentry monitoring through Next.js App Router instrumentation.

Environment variables:

```powershell
$env:NEXT_PUBLIC_SENTRY_DSN="<browser-dsn>"
$env:SENTRY_DSN="<server-dsn-or-same-as-browser>"
$env:SENTRY_AUTH_TOKEN="<sentry-auth-token-for-source-map-upload>"
$env:SENTRY_ORG="<sentry-org-slug>"
$env:SENTRY_PROJECT="<sentry-project-slug>"
$env:SENTRY_ENVIRONMENT="production"
$env:SENTRY_RELEASE="<optional-release-name>"
```

Notes:

- Source map upload is enabled only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set.

### PostHog analytics

Set the public project key and the ingest host for your PostHog region:

```powershell
$env:NEXT_PUBLIC_POSTHOG_KEY="<project-key>"
$env:NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
```

The dashboard captures sanitized pathname-only pageviews. Autocapture, session replay,
surveys, heatmaps, performance capture, query strings, and automatic user identification
are disabled because the application handles patient and prescription data. Do not add
patient details, medication information, email addresses, phone numbers, tokens, or payment
data to custom analytics events.
- Session Replay is intentionally not enabled.
- Request bodies, cookies, auth headers, and common patient/customer fields are scrubbed before events are sent.

### reCAPTCHA v3

Public unauthenticated writes through the signed proxy use invisible Google reCAPTCHA v3.
Set the public site key and keep the verification secret server-only:

```powershell
$env:NEXT_PUBLIC_RECAPTCHA_SITE_KEY="<site-key>"
$env:RECAPTCHA_SECRET_KEY="<server-secret>"
$env:RECAPTCHA_MIN_SCORE="0.5"
$env:RECAPTCHA_ALLOWED_HOSTNAMES="dash.nevarihealth.com,dev-dash-nevarihealth.vercel.app"
```

Production requests fail closed when the secret is missing. Never expose
`RECAPTCHA_SECRET_KEY`, store CAPTCHA tokens, or include them in analytics and logs.

Protected unauthenticated submissions are password and Google login, customer
registration, password-reset request and confirmation, verification-code submit
and resend, and nurse registration. The browser sends the short-lived token only
to the same-origin Next.js route in `X-Nevari-Recaptcha-Token`; the route verifies
and removes it before forwarding to WordPress. Authenticated writes use the
HttpOnly session, CSRF validation, role checks, and resource ownership instead.

Because `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is compiled into the browser bundle, add
or change it in the intended Vercel environment before building and redeploying.
The client and server retry through Google's supported `recaptcha.net` domain
when `google.com` is unavailable. Localhost development uses a development-only
same-origin marker; production continues to require provider verification.
The server secret must never use the `NEXT_PUBLIC_` prefix.

## Cross-origin note

The plugin now sends CORS headers for Nevari REST routes when the request origin matches the allowed list.

Default allowed origins:

- the WordPress `home_url()`
- the WordPress `site_url()`
- `http://localhost` and `https://localhost` on any port
- `http://127.0.0.1` and `https://127.0.0.1` on any port
- `http://[::1]` and `https://[::1]` on any port
- `null` for local `file://` usage

If you host this storefront on a different domain, add that origin through the `nevari_allowed_origins` WordPress filter.

## Scope

The UI is shaped around the Nevari overview:

- WooCommerce sales and order queue
- consultation and prescription operations
- email performance
- audit categories for orders, payments, security, consultation, and emails
