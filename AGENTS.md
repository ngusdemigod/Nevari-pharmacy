You are an expert WordPress/WooCommerce PHP engineer and Next.js
engineer helping me build Nevari Pharmacy.
Write clean, simple, maintainable code. Prioritize clarity over
unnecessary abstraction.
Think like a senior full-stack engineer working on a healthcare-adjacent
commerce platform where security and correctness matter more than speed.
---
## Project Overview
We are building Nevari Pharmacy, an online pharmacy platform built on
WordPress + WooCommerce with a decoupled Next.js admin/customer
dashboard.
The system includes:
- WooCommerce-backed product catalog, cart, and checkout (custom
  two-column checkout via the `nevari-checkout` plugin)
- Patient consultation booking and guest consultation flow
- Prescription management, including MTM (medication therapy
  management) and IV therapy request workflows
- Doctor, pharmacist, and store-admin role-based dashboards
- Nurse requests, subscriptions, and invoice/payment pages (Paystack)
- Email template management and delivery logs
- Audit logging across orders, payments, security, consultation, and
  emails
- SSO handoff between the WordPress backend and the Next.js dashboard
Keep the implementation simple and readable. This is a real production
system with patient and payment data — do not cut corners on
authorization or input validation to save time.
---
## Tech Stack
This repo has three components that ship independently:
- **`nevari-pharmacy-core/`** — WordPress plugin (PHP 7.4+, WP 6.2+,
  WooCommerce 7.0+). Owns REST API (`/wp-json/nevari/v1`), custom DB
  tables, roles/capabilities, Paystack integration, JWT auth, SSO.
- **`nevari-checkout/`** — WordPress plugin. Replaces the WooCommerce
  checkout page with a custom layout. Depends on WooCommerce.
- **`NevariAdmin Storefront/`** — Next.js 15 App Router app (React 19,
  plain JavaScript, no TypeScript). SWR for data fetching, Recharts for
  charts, Motion for animation, Sentry for monitoring. Talks to the
  plugin only through the signed `nevari-proxy` API route, never
  directly from the browser.
Do not introduce new major libraries, and do not add TypeScript,
a CSS framework, or a new state library, unless there is a strong
reason. Ask before installing anything new in either the PHP plugin
(composer) or the Next.js app (npm).
---
## Development Philosophy
Build feature by feature.
For every feature:
1. Read this file first.
2. Identify which component owns the change (plugin, checkout plugin,
   or dashboard) before writing code.
3. Keep the implementation simple.
4. Avoid overengineering.
5. Prefer readable code over clever code.
6. Build the smallest useful version first.
7. Refactor only when repetition appears.
---
## Decision Making
If something is unclear or could be improved, suggest a better
approach. If a new library would significantly help, recommend it,
explain why, and ask before adding it.
Do not install new libraries without approval.
When a change touches authorization, payments, or patient/prescription
data, state the security implication explicitly before proposing the
approach, even if not asked.
---
## Architecture
### `nevari-pharmacy-core/` (WordPress plugin)
```
nevari-pharmacy-core/
  nevari-pharmacy-core.php   # bootstraps, registers hooks
  includes/
    class-nevari-plugin.php        # central init/wiring
    class-nevari-activator.php     # activation, DB migrations, roles
    class-nevari-auth.php          # JWT auth
    class-nevari-sso.php           # SSO handoff to the dashboard
    class-nevari-rest.php          # REST controllers (large, split
                                    # new endpoint groups into their
                                    # own methods, not new files, unless
                                    # the file is already unreasonably
                                    # large)
    class-nevari-subscriptions.php
    class-nevari-mtm.php           # medication therapy management
    class-nevari-iv-therapy.php
    class-nevari-nurse-requests.php
    class-nevari-emails.php        # templates + delivery logs
    class-nevari-audit.php         # append-only audit logging
    class-nevari-connections.php
    class-nevari-paystack.php
    class-nevari-helpers.php
    class-nevari-admin.php         # wp-admin screens
  assets/                    # admin.css, admin.js
  templates/emails/          # email templates
```
Use WooCommerce native data for commerce (products, orders, payments,
customers). Use custom tables for pharmacy-specific, high-volume, or
lifecycle-heavy workflows (appointments, prescriptions, email logs,
audit logs). Do not duplicate WooCommerce functionality.
Every new REST route needs its own `permission_callback` that checks
role **and** resource ownership — do not rely on a route-level "is this
role allowed" check alone when the request also carries a resource ID
(order id, doctor id, prescription id). See `SECURITY_AUDIT.md` and
`SECURITY_DECISION_TRACKER.md` for the IDOR/CSRF issues already found
in this codebase; do not reintroduce that pattern in new endpoints.
### `nevari-checkout/` (WordPress plugin)
```
nevari-checkout/
  nevari-checkout.php
  includes/class-nevari-checkout.php
  assets/
  templates/
```
Only touches the WooCommerce checkout page rendering. Keep it decoupled
from `nevari-pharmacy-core` — it should not reach into the core
plugin's custom tables directly.
### `NevariAdmin Storefront/` (Next.js dashboard)
```
app/
  admin/{storefront,doctor,pharmacist,orders}/  # role dashboards
  api/                                          # route handlers
    nevari-proxy/     # signed proxy to the WordPress REST API
    sso/, admin/, customer/, pharmacist/, mtm/, subscriptions/,
    appointment/
  dashboard/, consultation/, subscription/, pay/[invoiceRef]/,
  appointment/join/, therapy/join/, sso/dashboard/
  components/        # shared UI (RoleLoginPage, RoleDashboardUtils,
                      # ModalScrim, RevenueOverviewCard, etc.)
  lib/                # documentHtml, mtmPdf*, inputValidation, nevari-api
  hooks/               # use-subscription, etc.
lib/                   # fetcher.js, swrKeys.js (top-level, shared SWR config)
hooks/                 # orders/, products/ data hooks
public/                # static assets
```
**app/\*/page.js** routes compose components and call hooks; keep large
reusable UI blocks and business logic out of them.
**app/components/** is for reusable UI, shared across more than one
role dashboard or route (e.g. `RoleLoginPage`, `ModalScrim`,
`BrandedSpinner`). Do not create a component for something used once.
**app/lib/** and top-level **lib/** hold framework-agnostic helpers
(PDF generation, input validation, the WordPress API client, SWR
fetcher/keys). Never put a secret key or the proxy signing secret in
anything under `app/` that ships to the browser — those belong in
server-only route handlers (`app/api/**/route.js`) or environment
variables read on the server.
**hooks/** holds SWR-based data hooks, organized by domain
(`hooks/orders`, `hooks/products`).
---
## UI Rules
Design references live at the repo root as static HTML/Figma-exported
mockups (e.g. `main nevari design system.html`, `customer
designsystem.html`, , `nevari_admin_design_system_md.md`).
`main nevari design system.html` is the design system for the **admin**
dashboard (`app/admin/{storefront,doctor,pharmacist,orders}`) — treat it
as the source of truth for admin-side layout, spacing, color, and
component styling.
For any UI task:
- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors,
  border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.

### Default admin storefront tabs

All tabbed controls in the admin storefront use the Nevari segmented-tab pattern:
- a pale blue-gray container with a thin border, 15px radius, and 5px inset padding;
- 42px minimum-height tab buttons with 12px radius and horizontally scrollable overflow;
- the active tab uses the Nevari navy background with white text;
- optional counts appear as compact badges beside the label;
- use semantic `tablist`/`tab`/`tabpanel` roles, `aria-selected`, keyboard-visible focus, and no layout-shifting hover effects.

Reuse the shared `.segmented-mini` / `.nevari-storefront-tabs` styling for Payments, Orders, Products, subscription details, patient-profile details, and future admin-storefront tabs. Do not build a page-specific replacement.

### Product creator redesign specification

The create-product modal uses flat white surfaces only: no gradients, drop shadows, or decorative card treatments. Use font size and spacing for hierarchy instead of bold text; button labels may retain their existing emphasis. Do not show a step-navigation strip above the active section. Product and gallery empty states use the approved raster placeholder image, never interface icons. Keep the media column anchored to the left with upload controls stacked beneath it. The create-multiple control sits in its own left-aligned footer area, separate from the right-aligned CTA group. The prescription editor expands to fill the available content area. Keep these rules scoped to the product creator and do not change unrelated features.
---
## Styling Rules
This project uses plain CSS, not a utility framework. Global styles
live in `NevariAdmin Storefront/app/globals.css` (dashboard) and
`NevariAdmin Storefront/styles.css` (legacy/shared). Reuse existing
classes and CSS custom properties before adding new ones. Do not
introduce Tailwind, NativeWind, CSS-in-JS, or a component library
without approval.
Use inline styles or CSS modules only for values that must be computed
at runtime (dynamic positioning, chart colors, animation values from
Motion). Everywhere else, use a class in the appropriate stylesheet.

For every customer-facing file upload field:
- Use the same corner radius as the surrounding form fields; upload controls are not pills.
- Validate extension, MIME type, file size, and file count as soon as files are selected, and repeat validation server-side.
- When a file is selected, provide inline Replace and Remove actions.
- Constrain long filenames to the available row width with ellipsis; never allow filenames to wrap, overflow, or resize the layout.
---
## Data/API Rule
All dashboard data comes from the WordPress REST API
(`/wp-json/nevari/v1/...`) through the signed `nevari-proxy` route —
never call the WordPress origin directly from client components.
1. Add or reuse a fetcher in `lib/fetcher.js` / `app/lib/nevari-api.js`.
2. Key SWR calls through `lib/swrKeys.js` so cache keys stay
   consistent across hooks.
3. Add role/permission checks on the PHP side; the dashboard should
   assume the API is the source of truth for what a role can see, not
   hide-and-hope in the UI.
---
## State Management
- SWR for server/remote state (orders, appointments, prescriptions,
  dashboard metrics) — see `hooks/orders`, `hooks/products`,
  `app/hooks/use-subscription.js`.
- Local React state for transient UI state (modals, form drafts,
  filters).
- Session state is a server-managed `HttpOnly`, `SameSite=Strict`
  cookie, not browser storage. Browser storage may only hold
  non-secret UI/connection state and a session-presence marker — never
  a bearer token.
---
## JavaScript
- This app is plain JavaScript (no TypeScript). Do not add `.ts`/`.tsx`
  files or introduce TypeScript tooling without approval.
- Use JSDoc comments only where a function's shape is genuinely
  non-obvious (complex payload shape, PDF token structure) — not on
  every function.
- Keep functions small and readable over clever.
---
## Feature Implementation
When building a feature:
1. Read this file first.
2. Identify which component(s) change: PHP plugin, checkout plugin,
   dashboard app, or more than one.
3. Keep changes focused. Do not rewrite unrelated code.
4. Follow existing patterns in the file/module you're editing.
5. If the feature crosses the plugin/dashboard boundary, get the REST
   contract right first (route, payload shape, permission callback)
   before writing the frontend hook against it.
6. Make sure the feature works end to end, including the
   unauthenticated/wrong-role case, not just the happy path.
7. Fix lint and any obvious type/runtime errors before finishing.
---
## Security
This codebase handles patient, prescription, and payment data, and has
a documented history of critical findings (`SECURITY_AUDIT.md`,
`SECURITY_DECISION_TRACKER.md`). Treat these as living documents — if
you fix or newly introduce something covered by them, keep them
updated to reflect the current state, not the state described within them at the time of the last update to that file.
Rules for any change touching auth, payments, or data access:
- Every REST endpoint needs an explicit `permission_callback` that
  checks role AND resource ownership when the request includes a
  resource id. Never rely on `__return_true` or a role-only check for
  an endpoint that returns or mutates a specific record.
- Validate and sanitize all input server-side (`sanitize_text_field`,
  prepared statements via `$wpdb->prepare`, etc.). Never interpolate
  request data into SQL or table names directly.
- State-changing REST routes (POST/PUT/DELETE) must be protected
  against CSRF — do not add a new mutating endpoint that skips nonce/
  token verification because existing ones do; flag existing gaps
  instead of copying them.
- Never expose secret keys (Paystack secret key, JWT signing secret,
  `NEVARI_PROXY_SIGNING_SECRET`, SSO client secret) in client-side code
  or in a response body. Server-to-server calls and token issuance
  happen in PHP or in Next.js server route handlers only.
- The Next.js proxy must keep validating: allowed origin list, a
  present and correct signing secret, and that private-network/
  non-allowlisted hosts are rejected.

### Checklist — review every change against this before calling it done

**Authorization / IDOR**
- Every REST route with a resource ID in the path or body (`order_id`, `doctor_id`,
  `prescription_id`, `invoice_ref`, `appointment_id`) checks *ownership*, not just
  role, and does it in the `permission_callback` — not inside the handler after
  the response has already been shaped.
- No endpoint uses `permission_callback => '__return_true'` unless the data it
  returns is genuinely public (and you've said so explicitly in the PR/commit).
- A doctor/pharmacist/store_admin role check never implicitly grants access to
  *another* doctor's/patient's records — role ≠ ownership.

**CSRF / state-changing requests**
- Every POST/PUT/DELETE/PATCH route added or touched has real CSRF protection
  (nonce, signed token, or equivalent) — don't copy an existing unprotected
  route as a template.
- Payment initialization/verification and webhook endpoints never trust a
  client-supplied action, amount, or order status; the server re-derives them.

**Injection**
- No table/column name or raw identifier is interpolated into SQL — use
  `$wpdb->prepare()` or an allowlist for identifiers, always.
- All REST input is sanitized/validated server-side (`sanitize_text_field`,
  type casts, explicit allowed-value checks) before use, not just validated
  client-side.

**Input sanitization**
- Sanitize on the way in, escape on the way out — every PHP value rendered
  into HTML, an attribute, a URL, or a shell/file path uses the matching
  WordPress helper (`sanitize_text_field`/`sanitize_email`/`sanitize_key` on
  input; `esc_html`/`esc_attr`/`esc_url`/`esc_js` on output) — this codebase
  already does this consistently in `includes/`, don't add a new field that
  skips it.
- Free-text fields that get rendered as HTML anywhere (email templates in
  `class-nevari-emails.php`, MTM/IV therapy notes, document generation in
  `app/lib/documentHtml.js` and `mtmPdf*`) are sanitized/escaped before
  rendering — never trust a stored string to already be safe HTML.
- Never introduce `dangerouslySetInnerHTML` (or PHP's raw `echo $user_input`)
  without passing the value through an explicit sanitizer first — this
  dashboard currently has none, keep it that way unless the sanitization is
  airtight.
- Validate type, length, and format (not just "is it set") for every input
  field — especially file uploads, doctor/prescription notes, and anything
  that flows into an audit log, email, or PDF.
- Reject unexpected/extra fields on write endpoints rather than silently
  passing them through to the database or WooCommerce meta.

**Auth, tokens, sessions**
- JWT/refresh-token secrets are long, random, and never fall back to a weak
  default if an env var is missing — fail closed, don't fail open.
- Refresh-token flows can't be used to silently re-mint elevated claims or
  bypass a revoked/expired session.
- Verification codes (SSO, invite, password reset) have an expiration and a
  bounded number of attempts.

**Rate limiting & abuse**
- Auth endpoints (login, refresh, registration, password reset) are
  rate-limited per IP/account.
- Public registration/consultation endpoints can't be used for account
  enumeration (don't reveal whether an email/account already exists via
  response timing or error text differences).

**Data exposure**
- Audit logs never store secrets, full payment card data, or raw tokens —
  log identifiers, not payloads.
- Error responses returned to the client never leak stack traces, file paths,
  SQL, or internal exception messages — log detail server-side, return a
  generic message.
- Nothing bearer-token-shaped or otherwise secret goes into browser
  `localStorage`/`sessionStorage` — session lives in the `HttpOnly`,
  `SameSite=Strict` cookie only.

**Payments & webhooks**
- Payment webhooks (Paystack) verify the provider signature; if a secret is
  missing, the webhook must reject the event, not accept it unsigned.
- Payment/document/invoice pages re-check authorization server-side on every
  load, even when reached via a tokenized link.

**Transport & headers**
- New API responses don't regress on standard security headers
  (`X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors, HSTS on the
  WordPress origin, etc.).
- Requests/responses have sane size limits — no unbounded body accepted on
  endpoints that don't need one.

When in doubt, treat `SECURITY_AUDIT.md` and `SECURITY_DECISION_TRACKER.md` as
the canonical list of what NOT to reintroduce — grep them for the area you're
touching before assuming a pattern is safe to copy.
---
## Authentication
Authentication is custom: WordPress users/roles + a plugin-issued JWT
(`class-nevari-auth.php`) for the REST API, plus an SSO handoff
(`class-nevari-sso.php`) into the Next.js dashboard. Do not introduce a
third-party auth provider (Clerk, Auth0, NextAuth, etc.) without
approval — the existing role model (patient, doctor, store_admin,
pharmacist) and session-cookie handling depend on the current flow.
---
## Playwright Verification
Always use port `3002` for Playwright verification and browser automation.
Any local development or test server launched for Playwright must listen on
port `3002`; do not use port `3000` or `3001` for Playwright.
---
## Communication
Be concise. Explain what changed, which component(s) it touched, and
how to test it (including which role/session is needed).
---
## Git and Vercel Deployment
- The development branch is `dev` and tracks `origin/dev`.
- The stable Vercel development URL is
  `https://dev-dash-nevarihealth.vercel.app`.
- Push and deploy to the `dev` branch and Vercel development/preview
  environment by default.
- Never push or deploy to the production branch or production Vercel
  environment unless the user explicitly authorizes production for that
  specific deployment.
- Before every push or deployment, ask the user whether the target should be
  development or production. Do not infer the target from earlier deployments
  or from the current Git branch.
- State the selected branch and Vercel URL before executing the push or
  deployment.
---
## Final Reminder
Before every feature:
- Read this file.
- Follow it strictly.
- Build clean, simple code.
- Replicate UI exactly when designs are provided.
- Treat authorization, input validation, and secret handling as
  first-class requirements, not cleanup for later.
