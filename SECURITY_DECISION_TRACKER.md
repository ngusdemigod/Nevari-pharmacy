# Frontend and Plugin Security Decision Tracker

**Review date:** May 26, 2026  
**Scope:** `NevariAdmin Storefront` frontend and `nevari-pharmacy-core` WordPress plugin REST/security layer.

## Status Legend

- `[ ] Open`: confirmed issue requiring implementation.
- `[~] Review`: design or implementation needs further validation before closure.
- `[x] Resolved locally`: corrected in the current working tree; verify deployment and regression tests before considering production closed.
- `[x] Verified safe`: reviewed path already enforces the required server-side decision.

## Required Security Boundary

The browser may request data and render user interactions. It must not decide:

- Which domain is trusted or paired.
- Which user, patient, doctor, order, invoice, appointment, prescription, or payment record may be accessed.
- Whether a payment may be initialized or verified.
- Which payment provider or return destination is authorized.
- Which role may perform backend actions.

These decisions must be enforced by the plugin/API server for every request.

## High Risk - Resolved Locally

### [x] SEC-011: Subscription history is restricted to the authenticated patient

**Status:** Verified safe locally; deployment and endpoint regression testing required.
**Layer:** Plugin/server
**Severity:** High
**Location:** `nevari-pharmacy-core/includes/class-nevari-subscriptions.php`

**Implemented controls**

- `GET /subscriptions/me/history` and its singular alias require an authenticated patient role.
- The server derives `user_id` exclusively from the API session and queries only that patient’s subscription and payment rows.
- Responses exclude provider payloads, Paystack subscription/customer codes, email tokens, secrets, and internal metadata.

### [x] SEC-010: Refill route permission callback did not enforce patient order ownership

**Status:** Resolved locally; deployment and endpoint regression testing required.
**Layer:** Plugin/server
**Severity:** High
**Location:** `nevari-pharmacy-core/includes/class-nevari-rest.php`

**Implemented remediation**

- `POST /orders/{id}/refill` now uses a dedicated permission callback that requires an authenticated patient and verifies the source order belongs to that patient.
- The handler independently retains scoped-order validation and now rejects refills unless the source order is completed.
- Order responses advertise refill availability only for completed orders with purchasable items.

### [x] SEC-001: Public invoice payment-data endpoint exposes customer and order information

**Status:** Resolved locally; deployment and endpoint regression testing required.  
**Layer:** Plugin/server  
**Severity:** High  
**Location:** `nevari-pharmacy-core/includes/class-nevari-rest.php:138`, `:816`, `:1546`, `:1558`, `:1567`

**Confirmed behavior**

- `GET /invoices/{invoice_number}/payment-data` uses `permission_callback => '__return_true'`.
- Invoice values are constructed as `NVH-INV-` plus a zero-padded order number.
- The lookup resolves an order from the numeric suffix of the supplied invoice number.
- The response includes customer name, email, phone, order items, totals, statuses, gateway options, and payment URLs.

**Risk**

An unauthenticated caller can enumerate or guess invoice identifiers and retrieve personal and order/payment information.

**Implemented remediation**

- Public invoice payment reads now require a signed, expiring payment capability bound to the invoice and order.
- Payment tokens are created only in authenticated document/appointment checkout flows and propagated in generated pay links.
- Invoice number possession alone no longer returns payment data.

### [x] SEC-002: Public payment initialization and verification accept client-selected order actions

**Status:** Resolved locally; payment-provider integration testing required.  
**Layer:** Plugin/server  
**Severity:** High  
**Location:** `nevari-pharmacy-core/includes/class-nevari-rest.php:124`, `:130`, `:829`, `:870`

**Confirmed behavior**

- `POST /orders/{id}/payment/initialize` and `POST /orders/{id}/payment/verify` are public.
- Both callbacks operate from numeric order IDs without `get_order_scoped()` authorization.
- Initialization accepts the payment gateway and callback URL from the requester.
- Verification accepts the gateway and payment reference from the requester.

**Risk**

An unauthorized caller may initiate or probe payment operations against another order and may influence redirect/callback behavior.

**Implemented remediation**

- Initialization and verification now require the signed, expiring token bound to the order and invoice.
- Initialization accepts callbacks only for the tokenized invoice path on the currently verified paired frontend origin.
- The customer payment page includes the capability in read, initialize, verify, and provider callback requests.
- Payment verification now requires the stored initialized gateway/reference and verifies provider amount, currency, and order metadata before completing an order.
- Stripe initialization stores and verifies the provider checkout-session reference returned for the transaction.

### [x] SEC-003: Plugin trusts unsigned `X-Nevari-Frontend-Origin` as an origin authority

**Status:** Resolved locally; requires shared deployment secret configuration.  
**Layer:** Plugin/server  
**Severity:** High  
**Location:** `nevari-pharmacy-core/includes/class-nevari-connections.php:111`, `:199`, `:283`, `:364`, `:374`

**Confirmed behavior**

- Pair verification, registration, and subsequent frontend resolution use the request origin.
- When the browser `Origin` header is absent, origin resolution falls back to `X-Nevari-Frontend-Origin`.
- The plugin reads this forwarded header without verifying that it came from a trusted proxy.

**Risk**

A direct client can forge the forwarded-origin header and claim to originate from a registered dashboard domain. This weakens the purpose of plugin-layer origin binding.

**Implemented remediation**

- Next.js server routes generate HMAC-signed frontend-origin headers from the server-derived application origin.
- The plugin rejects unsigned, invalid, or older-than-five-minute forwarded origins.
- Next.js signed routes reject browser requests whose supplied frontend origin does not match the deployed app origin.
- Authenticated plugin requests now use server-held HttpOnly cookies instead of browser-readable bearer storage, so an off-origin site does not obtain a token usable through the signed proxy.
- `NEVARI_PROXY_SIGNING_SECRET` must be identical in Vercel and WordPress configuration.

**Boundary note**

- Direct clients can reach the public frontend API itself; origin pairing is a browser-origin control, not a replacement for authorization. Protected plugin routes continue to require the authenticated server-held session or an explicitly scoped payment capability.

### [x] SEC-004: Frontend bootstrap treats public configuration as pairing authority

**Status:** Resolved locally; login/pairing flow regression testing required.  
**Layer:** Frontend with server-security impact  
**Severity:** High  
**Location:** `NevariAdmin Storefront/app/components/role-session.js:13`, `:26`, `:64`, `:88`; `NevariAdmin Storefront/app/components/role-dashboard-utils.js:19`, `:32`, `:75`

**Confirmed behavior**

- Pairing bootstrap checks `NEXT_PUBLIC_NEVARI_DASHBOARD_ORIGINS`.
- Client code can derive a paired/trusted UI state from public environment configuration.

**Risk**

Public browser configuration cannot prove the plugin has registered the domain. If any protected frontend flow relies on this state, the client is deciding server trust.

**Implemented remediation**

- Removed public environment allowlist bootstrap that marked an unverified browser as paired.
- Added a plugin-backed `/connections/status` check so new browsers can discover an already registered domain only through signed proxy context.
- Existing browser state may drive navigation only; API authentication and access require plugin-validated signed proxy context.

## Medium Risk - Open or Review

### [x] SEC-005: Frontend requests include security-looking scope parameters

**Status:** Resolved locally; negative authorization testing required.  
**Layer:** Frontend/API contract  
**Severity:** Medium  
**Location:** `NevariAdmin Storefront/app/_customer-dashboard.js:47`, `:50`, `:86`, `:90`, `:226`, `:229`; `nevari-pharmacy-core/includes/class-nevari-rest.php:3341`

**Confirmed behavior**

- Customer dashboard requests pass `mine: "1"` for orders and appointments.
- Appointment server logic reads `mine` when choosing patient/doctor filters.

**Risk**

These parameters may imply the browser controls ownership scope. Server routes must scope customer/doctor data from authenticated identity even when `mine` is omitted or manipulated.

**Implemented remediation**

- Removed customer dashboard `mine` and client identity fields from its list/cache-key requests.
- Appointment listing now applies patient/doctor account scope unconditionally for non-admin sessions.
- Patient order listing is already scoped to authenticated account ID under RES-001.

### [x] SEC-006: Sensitive session and cached dashboard state is stored in browser local storage

**Status:** Resolved locally; deployment and login/refresh/logout regression testing required.  
**Layer:** Frontend  
**Severity:** Medium  
**Location:** `NevariAdmin Storefront/app/components/role-session.js:51`, `:85`, `:171`; `NevariAdmin Storefront/app/components/role-dashboard-utils.js:72`, `:181`, `:219`; `NevariAdmin Storefront/app/_customer-dashboard.js:144`, `:171`

**Confirmed behavior**

- Frontend session state and dashboard/settings cache values are stored in `localStorage`.
- Local storage is shared by all users of the same browser profile and is accessible to injected scripts.

**Risk**

Stale display data can appear after account switching if cache keys or cleanup are incomplete. If bearer credentials are stored in session JSON, XSS would expose them; credential contents require further verification.

**Implemented remediation**

- Next.js proxy stores access and refresh bearer credentials in `HttpOnly`, `SameSite=Strict` cookies and sends only a non-secret `server-session` marker to the UI.
- Current and legacy frontend session persistence strips existing browser-stored credentials during hydration.
- Dashboard response caching now uses `sessionStorage` and clears legacy persistent `nevari:` cache entries.
- Removed the persisted order snapshot fallback used by the document preview flow.
- PDF generation no longer accepts bearer credentials from URL query parameters.
- Email template HTML preview now renders inside a sandboxed iframe rather than executing via `dangerouslySetInnerHTML` in the admin application context.

### [x] SEC-007: Payment/document pages require end-to-end authorization verification

**Status:** Resolved locally for reviewed routes; integration testing required.  
**Layer:** Frontend and plugin/server  
**Severity:** Medium, elevated by SEC-001 and SEC-002  
**Location:** Public invoice/payment flows and protected document endpoints in `nevari-pharmacy-core/includes/class-nevari-rest.php`

**Review requirement**

- Confirm each payment, invoice, PDF, receipt, and document route uses either authenticated record ownership or a signed expiring capability.
- Confirm browser route IDs cannot be changed to retrieve another customer's files.

**Current result**

- Public invoice/payment routes now require signed order-specific payment capabilities under SEC-001 and SEC-002.
- Protected order document endpoints are addressed under RES-002 below.

### [x] SEC-008: Public customer registration permits automated abuse and account enumeration

**Status:** Resolved locally; public registration abuse tests required.  
**Layer:** Plugin/server  
**Severity:** Medium  
**Location:** `nevari-pharmacy-core/includes/class-nevari-auth.php:333`; `nevari-pharmacy-core/includes/class-nevari-helpers.php:290`; `nevari-pharmacy-core/includes/class-nevari-admin.php:799`

**Confirmed behavior**

- `POST /auth/register-customer` is a public customer onboarding route for a verified patient dashboard.
- The endpoint previously did not use the plugin's configurable rate-limit controls.
- Existing-email attempts return an explicit `email_exists` response.

**Implemented remediation**

- Added plugin-configurable `auth_register_ip` and `auth_register_email` limit buckets.
- Registration attempts are limited by the plugin's derived client IP before origin/account processing and by normalized email before account creation.
- Both controls appear in the WordPress rate-limit settings screen and are enforced server-side.
- The endpoint returns the same accepted response when an email already exists, preventing direct account enumeration.
- Client IP derivation ignores forwarded addresses unless `REMOTE_ADDR` is explicitly listed in `NEVARI_TRUSTED_PROXY_IPS`; audit events use the same trusted derivation.

### [x] SEC-009: Payment webhooks accept unsigned events when provider secrets are missing

**Status:** Resolved locally; provider webhook integration testing required.  
**Layer:** Plugin/server  
**Severity:** High  
**Location:** `nevari-pharmacy-core/includes/class-nevari-rest.php:1888`

**Implemented remediation**

- Flutterwave and Stripe webhook verification now fail closed when the configured webhook signing secret is missing.
- All payment-completion paths run through initialized reference, amount, currency, and order-metadata validation.

## Resolved or Verified Server Controls

### [x] RES-001: Patient order history is scoped by authenticated account ID

**Status:** Resolved locally; deployment and automated regression testing still required.  
**Layer:** Plugin/server  
**Location:** `nevari-pharmacy-core/includes/class-nevari-rest.php:555`, `:587`

**Previous defect**

- A new customer account could inherit visible order totals/history when patient order queries were filtered by billing email, allowing legacy or shared-email records to be included.

**Current enforcement**

- Non-admin patient order queries now set `customer_id` from `get_current_user_id()`.
- The browser cannot select a different customer order scope for a patient request.

**Required verification**

- Log in as a newly created customer whose email appears on legacy orders and confirm dashboard order count and spend are zero unless orders are assigned to that WordPress account ID.
- Attempt `customer_id`, `patient_id`, `customer_email`, and `mine` manipulation as a patient and confirm no cross-account results.

### [x] RES-002: Authenticated order detail/document routes apply record-level order checks

**Status:** Verified safe in reviewed plugin path.  
**Layer:** Plugin/server  
**Location:** `nevari-pharmacy-core/includes/class-nevari-rest.php:669`, `:693`, `:1184`, `:1219`, `:1374`

**Current enforcement**

- Authenticated order and order-document callbacks use `get_order_scoped()`.
- Patient access requires the order user ID to equal the authenticated user's ID.
- Doctor/admin access is evaluated server-side.

**Remaining caveat**

- This does not protect the separate public invoice/payment endpoints tracked in SEC-001 and SEC-002.

### [x] RES-003: Appointment record viewing is restricted to owner, assigned doctor, or admin

**Status:** Verified safe in reviewed plugin path.  
**Layer:** Plugin/server  
**Location:** `nevari-pharmacy-core/includes/class-nevari-helpers.php:735`; `nevari-pharmacy-core/includes/class-nevari-rest.php:3555`

**Current enforcement**

- Patient access requires matching `patient_user_id`.
- Doctor access requires matching `doctor_user_id`.
- Admin access is explicitly allowed.
- Appointment actions first enforce `can_view_appointment()`, so the previously suspected cross-doctor action path was not confirmed.

## Server-Side Decisions Checklist

| Decision | Must be decided by | Status |
| --- | --- | --- |
| Customer order list scope | Plugin authenticated identity | Resolved locally |
| Order/document record access | Plugin record-level authorization | Verified safe in reviewed path |
| Appointment access scope | Plugin record-level authorization | Verified safe in reviewed path |
| Trusted dashboard origin | Plugin with verifiable origin proof | Resolved locally; secret configuration required |
| Pairing/trust status | Plugin/server | Resolved locally |
| Invoice visibility | Plugin auth or signed capability | Resolved locally |
| Payment initialization eligibility | Plugin auth or signed capability | Resolved locally |
| Payment gateway/callback acceptance | Plugin allowlist/bound token | Resolved locally |
| Public customer registration throttling | Plugin configurable rate limiter | Resolved locally |
| Customer registration account enumeration | Plugin response contract | Resolved locally |
| Dashboard UI cache isolation | Frontend display cache keyed to identity; never authority | Resolved locally |
| Browser bearer credential storage | Next.js server session cookies | Resolved locally |
| Payment completion integrity | Plugin provider/order validation | Resolved locally |
| Webhook authentication | Plugin provider signature checks | Resolved locally |

## Recommended Implementation Order

1. Configure the shared `NEVARI_PROXY_SIGNING_SECRET` in the Vercel and WordPress production runtimes before deployment.
2. Configure `NEVARI_TRUSTED_PROXY_IPS` in WordPress only if it receives requests behind known reverse proxy addresses.
3. Run cross-account, payment mismatch, unsigned webhook, registration enumeration, invalid callback URL, and forged-origin tests.
4. Deploy and verify all locally resolved controls in the hosted environment.

## Testing Requirements

- Unauthenticated request tests for every invoice/payment/document endpoint.
- Cross-account tests for customer order, document, payment, invoice, appointment, and prescription resources.
- Cross-role tests for patient, doctor, store admin, and unpaired frontend origins.
- Origin spoofing tests using no `Origin` header and a forged `X-Nevari-Frontend-Origin` header.
- Browser account-switch tests to confirm no metrics, orders, or PHI from the prior account are rendered for a newly created account.
- Payment tests for reused references, wrong order metadata, wrong amounts/currencies, and missing webhook signing secrets.
- Authentication tests confirming bearer values are absent from local storage, document URLs, and frontend API response bodies.
