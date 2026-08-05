# Frontend and Plugin Security Decision Tracker

## 2026-08-05 — Dashboard account-security email notifications

- Successful dashboard authentication now queues a login notification to the authenticated user's WordPress email for patient, doctor, pharmacist, nurse, store-admin, shop-manager, and administrator access paths, including direct, Google, verification-code, and dashboard SSO completion.
- Password-reset requests retain their generic anti-enumeration response. Delivery failures are recorded server-side without revealing whether an account exists.
- Successful password changes queue a separate confirmation email. Login and password-change notifications never contain credentials, reset keys, session tokens, or raw authentication payloads.
- Email queue persistence failures now fail explicitly instead of returning a false-success log identifier.
- Dashboard reset URLs are derived only from the configured shared frontend origin. Native WordPress lost-password emails for Nevari dashboard roles are rewritten to the Next.js `/reset-password` route, and the flow fails closed rather than linking to `wp-login.php` when the dashboard destination is unavailable.

## 2026-07-29 — Creation order and media boundaries

- Decision: manual/guest customer data is accepted only for Store Admin order creation. Doctor order creation still requires a server-verified owned or linked `customer_id`.
- Decision: `delivery_method` is a closed enum (`pickup`, `local_delivery`, `shipping`); non-pickup orders require a sanitized address before order creation.
- Decision: the server validates the complete product set and requested managed-stock quantities before calling `wc_create_order`, so validation failures cannot leave a partial order.
- Decision: fulfilment notes use WooCommerce's sanitized `customer_note`; delivery choice is persisted in `_nevari_delivery_method` and exposed through the existing authorized order formatter.
- Decision: product media accepts only verified JPEG/PNG data up to 10 MB. Declared MIME, extension, decoded image bytes, and actual image MIME must agree; malformed data and unexpected request fields fail closed.

## 2026-07-28 — In-page session reauthentication

- Expired dashboard sessions pause the current page behind a blocking, role-aware login dialog instead of navigating away and unmounting unsaved form state.
- Successful reauthentication updates the HttpOnly session and the active dashboard session marker without persisting form drafts or credentials.
- Interrupted read requests retry once after authentication. State-changing requests are never replayed automatically; the preserved form remains available for deliberate resubmission.
- The dialog supports the existing CAPTCHA and two-step verification requirements and cannot be dismissed while the page is unauthenticated.

## 2026-07-28 — Deployed CAPTCHA configuration and complete public-form coverage

- All public authentication, registration, password-reset, verification-code, and nurse-registration submissions require a reCAPTCHA v3 token in `X-Nevari-Recaptcha-Token`.
- The Next.js boundary verifies success, `public_submit` action, minimum score, and an allowlisted hostname, then removes the token instead of forwarding or logging it.
- CAPTCHA loading and verification retry through `recaptcha.net` if `google.com` is unavailable; verification remains fail-closed if neither endpoint succeeds.
- A localhost-only development marker avoids external CAPTCHA dependency during local work. It requires non-production mode and a localhost request hostname, so it cannot bypass deployed verification.
- Missing public or secret keys fail closed in deployed environments. The public key must be present at build time; changing it requires redeployment.
- Authenticated patient, clinical, and administrative writes remain protected by the HttpOnly session, double-submit CSRF token, role checks, and resource ownership without CAPTCHA.

## 2026-07-27 — Custom dashboard permission scope

- Decision: only Administrator, Store Admin, and legacy Shop Manager target roles may receive customized storefront permission sets.
- Decision: Doctor, Pharmacist, and Nurse roles retain fixed server-defined permissions; submitted custom sets are ignored and replaced with the relevant role defaults.
- Decision: Analytics is part of the customizable permission catalogue and is granted by default to Administrator, Store Admin, and legacy Shop Manager roles.
- Security boundary: the WordPress access mutation handler normalizes the permission set before applying capabilities. UI visibility is not treated as authorization.

## 2026-07-25 — Public-form CAPTCHA and privacy-safe product analytics

- Unauthenticated mutating requests routed through the signed Next.js proxy require a short-lived reCAPTCHA v3 token in production. Verification checks the expected action, minimum score, and configured hostname before WordPress receives the request.
- Authenticated clinical and administrative writes continue to use the HttpOnly session, double-submit CSRF token, rate limits, role checks, and resource ownership rather than adding CAPTCHA friction.
- PostHog remains manual and privacy-minimized: pathname-only pageviews and bounded application context are allowed; autocapture, replay, heatmaps, surveys, query strings, patient data, clinical data, payment data, and record identifiers remain prohibited.

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

### [x] RES-004: MTM PDFs are immutable private documents with record-level authorization

**Status:** Resolved locally; production signing secret and private web-server mapping must be configured.
**Layer:** Plugin/server and signed Next.js proxy
**Location:** `nevari-pharmacy-core/includes/class-nevari-mtm.php`; `NevariAdmin Storefront/app/api/mtm/[requestId]/submission-pdf/route.js`

**Current enforcement**

- MTM snapshot tokens reject unsigned, expired, tampered, wrong-patient, wrong-request, and fingerprint-mismatched submissions; missing signing configuration fails closed.
- The canonical PDF is checksum-verified, stored outside the public media library, and streamed only to the owning patient, assigned pharmacist, or store admin.
- Email workflows link recipients back to authenticated MTM details instead of persisting patient PDFs as email attachments.
- Subsequent dashboard downloads stream the immutable submitted PDF, preserving its embedded medication and lab-result images.

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

## 2026-07-22 — Patient care journey expansion

- **Decision:** Store IV Therapy and Nurse Request lifecycles in indexed custom tables with bounded migration batches and temporary legacy fallback.
- **Decision:** Use an append-only, non-clinical lifecycle event table for status, assignment, scheduling, payment, and notification events.
- **Decision:** Non-Pro MTM availability may be held before payment only until 23:59:59 in the configured store timezone. Expired holds never block availability, payment cannot silently restore them, and approval requires a paid/credit-backed reservation.
- **Decision:** MTM submission and slot notifications are decoupled from browser PDF completion; availability notifications are claimed idempotently only after the slot transaction commits.
- **Decision:** MTM booking exposes only deduplicated provider-neutral availability. Pharmacist identity is selected on confirmation through least-recently-assigned ordering and is revalidated under database locks; the browser cannot nominate a pharmacist.
- **Decision:** Pharmacists manage only their own availability through a role-restricted endpoint with no client-controlled user ID; payload fields and time ranges are allowlisted server-side.
- **Decision:** An MTM consent value of `No` is authoritative for omitting all later clinical sections and attachments from storage, review, and PDF inputs.
- **Decision:** Nurses remain administrator-managed provider records and do not receive authentication accounts.
- **Decision:** Share the five-consultation Pro allowance through an atomic reservation ledger counted together with paid doctor appointments.
- **Decision:** Server-created WooCommerce orders carry the configured MTM fee; client prices are ignored.
- **Decision:** Paid MTM declines enter an auditable manual-refund state. No automated refund or gateway secret exposure is introduced.
- **Boundary:** Clinical notes remain in resource detail payloads and are excluded from queues, event summaries, email logs, URLs, and browser storage.
# 2026-07-22 — Managed user governance and nurse identity

- Decision: WordPress remains authoritative for user identity and role; indexed `user_governance` rows are authoritative for approval and ban state.
- Decision: only approved, non-banned WordPress users whose current role is exactly `nurse` can be assigned to Nurse Requests.
- Decision: nurses receive email notifications but no dashboard, care REST access, availability profile, service-area profile, or supported-care-type profile.
- Decision: Nurse Request patient-safe files use a private indexed document registry and owner/admin authorization on every operation; internal clinical documentation remains separate and is never returned by list endpoints.
- Decision: lifecycle notifications use an atomic unique dispatch claim keyed by service, record, event, recipient hash, and managed template so retries cannot duplicate queued mail.
- Decision: pharmacist IV queues are assignment-scoped and clinical transitions require the assigned pharmacist; Store Admin retains operational assignment and scheduling authority only.
- Decision: declining or banning preserves the user and historical assignments for auditability, revokes sessions, and flags active Nurse Requests for reassignment.
- Decision: Store Admin and administrator accounts cannot be targeted by the dashboard ban control.
# 2026-07-23 — Store-admin staff, MTM, and subscription listings

- Unified staff governance remains restricted to store-admin sessions; target mutations reject privileged/self targets and now require same-origin CSRF validation in the Next.js route.
- MTM store-admin listing applies bounded pagination and sanitized search while pharmacist users remain restricted to assigned requests.
- Subscription administration keeps its store-admin permission callback and exposes bounded, filtered pagination without returning payment secrets.

# 2026-07-23 — Per-user storefront permissions and admin notifications

- Decision: JWTs identify the session, while current WordPress capabilities remain authoritative for storefront-area authorization so permission revocation takes effect server-side without waiting for token expiry.
- Decision: only administrators can change staff roles or per-user storefront permission grants; self-demotion and protected administrator targeting are rejected.
- Decision: role/access changes revoke active sessions, create append-only audit records with safe before/after values, and notify the affected user and acting administrator through the existing email queue.
- Decision: notification failure is logged and surfaced as a warning but never rolls back a successfully committed authorization change.
- Decision: newly discovered nurse accounts, including nurses created manually in wp-admin, enter `pending_review`; frontend nurse registration already uses the same state. Existing approved nurses are not downgraded during insert-only synchronization.

# 2026-07-23 — Patient governance actions and dashboard password reset

- Decision: the WordPress role and indexed governance `managed_role` must change atomically; directory reads also reconcile wp-admin role changes so stale governance rows cannot retain obsolete access.
- Decision: patient-target actions require Patients permission, while staff-target actions require Staff Management permission. Administrators retain all required permissions; self-targets and protected administrator/store-manager targets remain blocked.
- Decision: ban and suspension revoke active session families and refresh tokens. Password reset does not restore login access while either state remains active.
- Decision: administrator-triggered password-reset links use the shared trusted dashboard origin and an allowlisted role-specific `frontend_type`; WordPress reset pages are not used.
- Decision: approved nurses use the permission-restricted storefront frontend for their Nurse Requests access. This supersedes the earlier “no dashboard” decision; pending, declined, banned, and suspended nurses remain unable to authenticate.
- Decision: role, status, and reset mutations remain authoritative when a notification fails. The failure is audited and shown to the acting administrator without exposing reset keys or links.

# 2026-07-24 — Pharmacist dashboard scope reduction

- Decision: pharmacists lose all general commerce and administration authority. General products, orders, payments, subscriptions, customers, staff, settings, logs, email administration, and store-dashboard APIs reject pharmacist sessions server-side.
- Decision: the only product lookup retained is `/pharmacist/mtm-requests/{id}/pharmacy-products`; assignment is verified by the permission callback. Linked MTM orders derive the customer and items from the authorized case and reject client-supplied bodies.
- Decision: the pharmacist dashboard's IV Therapy view is built against `class-nevari-care-journeys.php`'s `/staff/care-requests/iv-therapy` (already assignment-scoped and paginated per the 2026-07-22 decision above), not the legacy `class-nevari-iv-therapy.php` `/pharmacist/iv-therapy-requests` routes — but those legacy routes are hardened with the same assignment scoping and pagination regardless, since they remain directly callable outside the dashboard.
- Decision: MTM and IV-therapy list endpoints available to the pharmacist role must always return only requests assigned to the calling pharmacist (store admins retain full visibility), and must be paginated rather than returning an unbounded or arbitrarily-capped result set — enforced server-side, not left to the frontend to filter.
- Decision: version 0.6.3 removes legacy role and direct-user pharmacist capabilities, removes Media Library authority, blocks wp-admin/admin-AJAX, and hides the admin bar. The Next.js proxy independently allowlists pharmacist frontend paths.

# 2026-07-25 — Dedicated MTM payment flow

- Decision: MTM forms and record modals never render or open WooCommerce checkout URLs. Pending payments route to an authenticated, ownership-checked MTM payment page.
- Decision: the MTM server response exposes only Nevari's signed, expiring invoice capability URL. The existing invoice endpoint initializes Paystack from the server-owned order and verifies the provider reference before changing payment state.
- Decision: payment callback return paths are restricted to local `/dashboard/` routes; client-supplied amounts, currencies, order IDs, and payment states remain non-authoritative.
- Decision: MTM confirmation success is rendered only from the server-owned MTM payment state. The callback result query may select a failed presentation but cannot mark a payment successful or mutate the request.
## Auth continuation after an expired dashboard session

- **Decision:** An API `401` blocks the active screen with the correct role login and stores only a validated, same-origin relative continuation path in a short-lived `HttpOnly`, `SameSite=Strict` cookie. Successful authentication consumes the cookie and resumes that path. Tokens and page data are never placed in the continuation.
- **Status:** Implemented locally; Playwright login/resume regression coverage required.

## Email payment links must enter through the dashboard invoice

- **Decision:** Appointment and order payment emails may expose only the signed dashboard `/pay/{invoice}` capability URL. WordPress no longer falls back to its own origin when the dashboard payment origin is unconfigured, and the dashboard booking mailer no longer falls back to WooCommerce or gateway checkout URLs. Missing dashboard configuration fails closed by omitting the payment link.
- **Status:** Implemented locally; invoice-page and payment-initialization regression coverage required.

## Pharmacist MTM case actions stay inside the assigned-case boundary

- **Decision:** every new pharmacist MTM route (submission-document read, reschedule) is registered under `/pharmacist/mtm-requests/{id}/...` with the assignment-checking `pharmacist_request_permission` callback, never by widening the customer-facing `/mtm-requests` surface or the Next.js proxy allowlist.
- **Decision:** a pharmacist-initiated reschedule may release scheduling state (slot, Meet space, join tokens, attendance) but must never modify payment or consultation-credit state; the patient re-picks a slot without paying again.
- **Decision:** action plans and attached products are pharmacist drafts and are not emailed or shown to the patient until the consultation is completed; only completed consultation documentation reaches the patient.
- **Status:** Implemented locally; pharmacist-role and wrong-pharmacist regression coverage required for both new routes.
# 2026-07-27 — Product prescription content and order-item snapshots

- **Decision:** Treat formatted product prescriptions as healthcare-adjacent content and allow only bold, underline, lists, paragraphs, line breaks, and preset sizes.
- **Decision:** Snapshot sanitized prescription content onto every purchased order item, including dashboard-created manual orders.
- **Reason:** Historical orders and customer emails must retain the instructions that existed at purchase time without exposing unrestricted HTML.
- **Boundary:** WordPress performs the authoritative sanitization. The dashboard editor is an input convenience and is not a security boundary.
# Administrator-created user accounts (2026-07-27)

- User creation is handled only by the authenticated `/admin/users` aggregate route.
- Store managers may create non-administrator accounts; only an Administrator may create another Administrator.
- Administrator permissions are fixed to the full allowlist. Only an Administrator may customize a new Store Manager's dashboard permissions. Doctor, Patient, Nurse, and Pharmacist accounts receive server-defined role defaults.
- Requests reject unexpected fields, duplicate emails, invalid roles, weak passwords, invalid phone data where required, and avatars outside the JPG/PNG/WebP, one-file, 2 MB policy.
- User creation is audited. A failed avatar validation removes the newly-created account so a partially configured account is not retained.
