# Nevari Pharmacy Core - Security Vulnerability Audit Report

## 2026-07-29 order creation and product-media hardening

- `POST /orders` now rejects unexpected fields, allowlists `pickup`, `local_delivery`, and `shipping`, and requires a delivery address for delivery and shipping orders.
- Store administrators may create explicitly identified guest/manual-customer orders. Doctors remain limited to an existing customer linked to their own care relationship; the role grant does not bypass customer ownership.
- Every requested product is resolved and checked for purchasability, stock state, and managed-stock quantity before WooCommerce creates the order. This prevents partial/orphan orders and direct-API out-of-stock bypasses.
- Fulfilment notes are sanitized into WooCommerce `customer_note`; the delivery method is stored as order metadata and returned by the formatter.
- `POST /products/media` rejects extra fields, malformed base64, files over 10 MB, invalid image bytes, MIME/extension mismatches, and all formats except JPEG and PNG before permanent attachment storage.

## 2026-07-28 in-page session reauthentication

- A non-auth API `401` no longer navigates away from the active dashboard page. A blocking login dialog keeps the existing React tree and unsaved draft state mounted.
- Reauthentication credentials remain transient component state, CAPTCHA and optional OTP are enforced, and the restored bearer/refresh credentials remain in HttpOnly cookies.
- Safe read requests retry once after authentication. POST, PUT, PATCH, and DELETE requests are not replayed, preventing duplicate payment, clinical, order, or account mutations.

## 2026-07-28 deployed CAPTCHA configuration and coverage

- Public login (password and Google), registration, password reset request/confirmation, verification-code submit/resend, and nurse registration all obtain a short-lived reCAPTCHA v3 token and send it in `X-Nevari-Recaptcha-Token`.
- Verification fails closed for absent configuration, missing/invalid tokens, low scores, action mismatches, hostname mismatches, verification-service errors, and timeouts. Failure responses are not cacheable.
- Browser loading and server verification retry through Google's supported `recaptcha.net` domain when `google.com` is unavailable. Both endpoints failing still fails closed.
- Local development uses a fixed non-secret marker only when both the browser and same-origin Next.js request hostname are localhost and `NODE_ENV` is not production; deployed environments can never accept it.
- The token is consumed at the same-origin Next.js boundary and is not forwarded to WordPress, analytics, or application logs.
- Authenticated forms intentionally use session, CSRF, authorization, and ownership controls rather than CAPTCHA.

## 2026-07-27 dashboard permission assignment scope

- Custom storefront permission assignment is limited to Administrator, Store Admin, and legacy Shop Manager target roles. Doctor, Pharmacist, and Nurse targets are forced back to their fixed role defaults server-side, even if a client submits additional valid permission keys.
- Analytics remains protected by `nevari_storefront_analytics` and is included in Administrator, Store Admin, and legacy Shop Manager defaults.
- The Staff Details interface mirrors the server rule, but WordPress capability enforcement remains the authorization boundary.

## 2026-07-25 public-write abuse protection and analytics review

- Unauthenticated writes passing through the dashboard proxy now fail closed in production unless Google reCAPTCHA v3 verification succeeds for the expected action, configured hostname, and score threshold. CAPTCHA tokens are neither forwarded to WordPress nor logged.
- Existing authenticated session, CSRF, role, and resource-ownership enforcement is unchanged.
- PostHog common properties are limited to environment, application area/role, route group, viewport category, and release. Its existing payload sanitizer and disabled autocapture/session-recording configuration remain in force.

**Plugin:** Nevari Pharmacy Core  
**Version:** 0.1.0  
**Scan Date:** May 13, 2026

---

## Executive Summary

This WordPress plugin contains **multiple critical and high-severity security vulnerabilities** that could lead to unauthorized access, data exposure, SQL injection, and privilege escalation. The plugin requires significant security improvements before production use.

**Risk Level:** 🔴 **CRITICAL**

---

## Critical Vulnerabilities

### 1. **Missing CSRF (Cross-Site Request Forgery) Protection** ⚠️ CRITICAL

**Location:** REST API endpoints throughout `class-nevari-rest.php`

**Issue:** REST API endpoints accept POST/PUT/DELETE requests without nonce verification or CSRF tokens.

**Example:**
```php
register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)', [
    'methods' => WP_REST_Server::EDITABLE,
    'callback' => [__CLASS__, 'orders_update'],
    'permission_callback' => [__CLASS__, 'store_admin_required'],
]);
```

**Risk:** Attackers can perform state-changing operations on behalf of authenticated users via malicious websites.

**Recommendation:** 
- Add `rest_ensure_request_valid` middleware
- Use nonce verification: `check_ajax_referer()` or implement OAuth2
- Use `_wpnonce` parameters in requests

---

### 2. **Insecure Direct Object Reference (IDOR)** ⚠️ CRITICAL

**Location:** `class-nevari-rest.php`, lines 400-450 (orders_action, doctors_update, etc.)

**Issue:** Authorization checks are insufficient. The `doctor_or_admin_required()` permission callback allows doctors to modify ANY doctor's profile without verifying ownership.

**Example - Vulnerable Code:**
```php
public static function doctors_update(WP_REST_Request $request): WP_REST_Response {
    $doctor_id = (int) $request['id'];
    if (!Nevari_Helpers::is_store_admin() && get_current_user_id() !== $doctor_id) {
        return Nevari_Helpers::error('forbidden', 'You can update only your own doctor profile.', 403);
    }
    // This check is good, but...
}
```

**Problem:** The permission callback uses `doctor_or_admin_required()` which returns TRUE for any doctor, but the function only verifies ownership INSIDE the callback. A doctor could bypass this by requesting another doctor's endpoint directly.

**Risk:** Doctors can view/modify other doctors' data, appointments, and patient information.

**Recommendation:**
```php
// Better approach:
'permission_callback' => static function (WP_REST_Request $request) {
    $doctor_id = (int) $request['id'];
    if (!Nevari_Helpers::is_store_admin() && get_current_user_id() !== $doctor_id) {
        return false;
    }
    return Nevari_Helpers::is_doctor() || Nevari_Helpers::is_store_admin();
},
```

---

### 3. **SQL Injection via Table Name** ⚠️ CRITICAL

**Location:** `class-nevari-helpers.php`, line ~18-20

**Issue:** The `table()` function concatenates table names without escaping:

```php
public static function table(string $name): string {
    global $wpdb;
    return $wpdb->prefix . 'nevari_' . $name;  // Direct concatenation
}
```

While this is used with `$wpdb->prepare()`, if any user input reaches this function, it could cause SQL injection.

**Location:** `class-nevari-audit.php`, line ~200
```php
$sql = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY created_at DESC, id DESC LIMIT %d OFFSET %d";
```

**Risk:** Attacker could inject SQL commands through table names.

**Recommendation:**
```php
public static function table(string $name): string {
    global $wpdb;
    $safe_name = preg_replace('/[^a-z0-9_-]/i', '', $name);
    return $wpdb->prefix . 'nevari_' . $safe_name;
}
```

---

## High-Severity Vulnerabilities

### 4. **Weak JWT Secret Generation** ⚠️ HIGH

**Location:** `class-nevari-helpers.php`, lines ~60-70

**Issue:** JWT secret is built from WordPress authentication keys that may be weak or reused:

```php
public static function jwt_secret(): string {
    $parts = [];
    foreach (['AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY'] as $constant) {
        if (defined($constant)) {
            $parts[] = constant($constant);
        }
    }
    $parts[] = site_url();
    return hash('sha256', implode('|', $parts));
}
```

**Risk:** 
- WordPress keys might be generated automatically by hosts with weak entropy
- If any key is compromised, JWT tokens can be forged
- No rotation mechanism exists

**Recommendation:**
```php
// Generate a proper secret on activation
public static function jwt_secret(): string {
    $secret = get_option('nevari_jwt_secret');
    if (!$secret) {
        $secret = bin2hex(random_bytes(32));
        update_option('nevari_jwt_secret', $secret);
    }
    return $secret;
}
```

---

### 5. **Authentication Bypass via Refresh Token** ⚠️ HIGH

**Location:** `class-nevari-auth.php`, line ~110

**Issue:** Refresh token validation only checks the hash, but multiple refresh tokens could be issued for the same session without proper session tracking:

```php
$row = $wpdb->get_row($wpdb->prepare(
    "SELECT * FROM {$table} WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > %s LIMIT 1",
    $hash,
    $now
));
```

**Risk:** 
- No device/session fingerprinting
- No rate limiting on refresh attempts
- Old tokens aren't invalidated on logout (only marked revoked)

**Recommendation:**
- Add device/IP fingerprinting
- Implement rate limiting
- Revoke all refresh tokens on logout: `UPDATE ... WHERE user_id = %d`

---

### 6. **Insufficient Prescription Access Control** ⚠️ HIGH

**Location:** `class-nevari-helpers.php` (missing implementation check)

**Issue:** The `can_view_prescription()` function is called but its implementation is not fully reviewed. Similar IDOR issues likely exist for prescriptions.

**Risk:** Patients could access other patients' prescriptions; doctors could access any prescription.

**Recommendation:**
```php
public static function can_view_prescription($prescription): bool {
    $user_id = get_current_user_id();
    
    if (Nevari_Helpers::is_store_admin()) {
        return true;
    }
    
    if (Nevari_Helpers::is_patient()) {
        return (int)$prescription->patient_user_id === $user_id;
    }
    
    if (Nevari_Helpers::is_doctor()) {
        return (int)$prescription->assigned_doctor_user_id === $user_id;
    }
    
    return false;
}
```

---

### 7. **No Rate Limiting on Authentication Endpoints** ⚠️ HIGH

**Location:** `class-nevari-auth.php`, lines 60-100

**Issue:** Login and refresh endpoints have no rate limiting:

```php
public static function login(WP_REST_Request $request): WP_REST_Response {
    // No rate limit check
    $username = isset($params['username']) ? sanitize_text_field((string) $params['username']) : '';
    $password = isset($params['password']) ? (string) $params['password'] : '';
    // ...
    $user = wp_authenticate($username, $password);
}
```

**Risk:** Brute force attacks, credential stuffing attacks.

**Recommendation:**
```php
// Add rate limiting
private static function check_rate_limit(string $key, int $max = 5, int $window = 300): bool {
    $transient = 'nevari_rate_limit_' . md5($key);
    $count = get_transient($transient) ?? 0;
    
    if ($count >= $max) {
        return false;
    }
    
    set_transient($transient, $count + 1, $window);
    return true;
}
```

---

### 8. **Sensitive Data in Audit Logs** ⚠️ HIGH

**Location:** `class-nevari-audit.php`, line ~55

**Issue:** Audit logs store sensitive metadata without sanitization:

```php
'metadata' => isset($args['metadata']) ? Nevari_Helpers::json_encode_safe($args['metadata']) : null,
```

**Risk:** 
- Failed login attempts store usernames (enumeration)
- Sensitive patient data could be logged
- Audit logs are accessible to store admins

**Example:**
```php
Nevari_Audit::log('security', 'nevari', 'auth.login_failed', 'error', [
    'severity' => 'warning',
    'error_code' => 'invalid_credentials',
    'message' => 'API login failed.',
    'metadata' => ['username' => $username],  // ⚠️ Username exposed
]);
```

**Recommendation:**
```php
// Don't log usernames, use user ID or hash
'metadata' => ['username_hash' => hash('sha256', $username)],
```

---

## Medium-Severity Vulnerabilities

### 9. **No Input Validation on Email Templates** ⚠️ MEDIUM

**Location:** `class-nevari-emails.php`, lines 40-60

**Issue:** Email templates use basic variable replacement without validating template syntax:

```php
foreach ($variables as $key => $value) {
    if (is_scalar($value) || $value === null) {
        $safe_html = esc_html((string) $value);
        // ...
        $body_html = str_replace('{{' . $key . '}}', $safe_html, $body_html);
    }
}
```

**Risk:** Template injection attacks if `$variables` contains malicious keys.

**Recommendation:**
```php
// Validate variable keys
foreach ($variables as $key => $value) {
    if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $key)) {
        continue;  // Skip invalid keys
    }
    // ... rest of code
}
```

---

### 10. **Incomplete Authorization in Products Endpoint** ⚠️ MEDIUM

**Location:** `class-nevari-rest.php`, line ~600-650

**Issue:** Product visibility checks are incomplete:

```php
if (!Nevari_Helpers::is_store_admin() && Nevari_Helpers::bool_param(get_post_meta($product->get_id(), '_nevari_restricted_visibility', true))) {
    return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
}
```

This only hides restricted products from non-admins but doesn't prevent enumeration.

**Risk:** Information disclosure of product IDs.

---

### 11. **No Request Size Limits** ⚠️ MEDIUM

**Location:** All REST endpoints

**Issue:** No validation of request payload size or JSON depth.

**Risk:** DoS attacks via large payloads, XXE in JSON parsers.

**Recommendation:**
```php
// Add to all endpoints
$params = Nevari_Helpers::get_json_params($request);
if (strlen(wp_json_encode($params)) > 1000000) {  // 1MB limit
    return Nevari_Helpers::error('payload_too_large', 'Request payload too large.', 413);
}
```

---

### 12. **Missing Verification for Doctor Assignment** ⚠️ MEDIUM

**Location:** `class-nevari-rest.php` (prescriptions handling)

**Issue:** When assigning prescriptions to doctors, there's no verification that the doctor is qualified or accepting new patients.

**Recommendation:**
```php
$doctor = get_user_by('id', $doctor_id);
if (!$doctor || !in_array('doctor', (array) $doctor->roles)) {
    return Nevari_Helpers::error('invalid_doctor', 'Doctor not found.', 404);
}

$settings = self::get_doctor_settings($doctor_id);
if (!$settings['accepts_new_patients']) {
    return Nevari_Helpers::error('doctor_unavailable', 'Doctor is not accepting new patients.', 409);
}
```

---

### 13. **No Expiration on Verification Codes** ⚠️ MEDIUM

**Location:** Audit logs show password reset but no code expiration tracking.

**Issue:** If 2FA or email verification is implemented, codes need expiration.

**Recommendation:**
- Store verification codes with timestamp
- Expire codes after 15 minutes
- Invalidate after 3 failed attempts

---

## Low-Severity Vulnerabilities & Best Practices

### 14. **Information Disclosure in Error Messages** ⚠️ LOW

Database errors might be exposed in debug mode.

**Recommendation:**
```php
if (false === $result && defined('WP_DEBUG') && WP_DEBUG) {
    error_log('Nevari audit insert failed: ' . $wpdb->last_error);
    return Nevari_Helpers::error('database_error', 'Internal server error.', 500);
}
```

---

### 15. **Missing Security Headers** ⚠️ LOW

No security headers configured for REST API.

**Recommendation:**
```php
add_action('rest_api_init', function() {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
});
```

---

### 16. **No API Versioning** ⚠️ LOW

Current API is `nevari/v1` but no backward compatibility strategy.

**Recommendation:**
- Document API deprecation timelines
- Support multiple versions
- Plan for v2 API with breaking changes

---

### 17. **Missing Audit Trail for Sensitive Operations** ⚠️ LOW

Some sensitive operations (prescription creation, doctor assignment) may not be fully logged.

**Recommendation:**
- Log all CRUD operations on sensitive data
- Include request context (IP, user agent)
- Encrypt sensitive audit log data

---

## Recommended Fixes Priority

### 🔴 Immediate (Before Production)
1. Add CSRF protection to all state-changing endpoints
2. Fix IDOR vulnerabilities in doctors and prescriptions endpoints
3. Implement proper JWT secret storage
4. Add rate limiting to authentication
5. Secure table name handling

### 🟡 High Priority (Within 1 week)
6. Improve refresh token security
7. Add request size limits
8. Enhance permission checks for prescriptions
9. Remove sensitive data from audit logs
10. Add security headers

### 🟢 Medium Priority (Within 1 month)
11. Add input validation for email templates
12. Implement doctor verification for assignments
13. Add API versioning strategy
14. Enhanced logging for sensitive operations

---

## Additional Security Recommendations

### Database Security
- Use strong passwords for WordPress user accounts
- Implement proper database backup procedures
- Consider encrypting sensitive fields (SSNs, prescriptions data)

### API Security
- Implement API key/Secret pair for programmatic access
- Add request signing with HMAC
- Consider implementing OAuth2 for third-party integrations
- Add webhook signing for external integrations

### Deployment Security
- Use HTTPS only (enforce via `force_ssl_admin`)
- Keep WordPress and all plugins updated
- Regular security audits and penetration testing
- Implement WAF (Web Application Firewall)
- Enable WordPress security logging

### Code Quality
- Implement automated security scanning in CI/CD
- Code review process for all changes
- SAST (Static Application Security Testing)
- Dependency scanning for vulnerabilities

---

## Testing Recommendations

### Security Testing
- OWASP Top 10 testing
- JWT token manipulation tests
- Authorization bypass attempts
- SQL injection tests
- XSS payload testing
- CSRF attack simulation

### Load Testing
- Rate limiting verification
- DoS resistance testing
- Database connection pool limits

---

## Conclusion

This plugin requires **significant security hardening** before it can be safely used in a production environment, especially given the sensitive nature of healthcare data (prescriptions, patient information). 

**Do not deploy to production** without addressing at least the **Critical** and **High-severity** vulnerabilities listed above.

Consider engaging professional security consultants for:
- Full penetration testing
- HIPAA compliance assessment (if handling PHI)
- Security code review
- Compliance auditing

---

**Report Generated:** May 13, 2026  
**Severity Rating:** 🔴 CRITICAL - Production Deployment NOT RECOMMENDED

## 2026-07-22 Care Journey Storage and Authorization

- IV Therapy and Nurse Request records now use indexed, bounded custom tables instead of unbounded user-meta scans.
- Staff care detail and mutation routes resolve the resource in their permission callback and enforce store-admin or IV-pharmacist scope before handlers run.
- Care lifecycle events are append-only and accept only safe metadata keys; clinical payloads and tokens are excluded.
- Provider writes reject unexpected fields and require store-administrator authorization.
- MTM slot reservations lock the request row, verify ownership and paid/quota state, and re-check appointment and MTM conflicts before committing.
- MTM unpaid availability holds are row-locked, expire at store-day end, and are excluded from conflict checks immediately after expiry even when cleanup cron is delayed. Payment activation re-locks the request and cannot revive an expired hold.
- Pharmacist MTM approval now fails closed unless the request has verified payment or a reserved Pro credit and an unexpired reserved slot.
- MTM payment amounts are derived from the server option; WooCommerce/Paystack order state is authoritative.
- MTM payment links use the signed, expiring Nevari invoice capability and dedicated dashboard `/pay/` flow; customer pages reject legacy WooCommerce checkout URLs, and Paystack initialization still derives amount, currency, customer, and order ownership server-side.
- Manual refund completion is store-admin-only and stores an external reference, never gateway credentials.
- MTM requests remain unassigned until the patient confirms a provider-neutral slot. Confirmation rejects client-supplied pharmacist fields, row-locks the request and candidate user, revalidates role/governance/availability/conflicts, and assigns the least-recently-assigned eligible pharmacist.
- Pharmacist availability reads and writes use the authenticated pharmacist's session user ID; the client cannot supply a pharmacist ID. Writes allow only the availability field and sanitize/validate bounded weekday time ranges.
- Consent `No` is normalized server-side so skipped caregiver and clinical payloads, medication data, adherence answers, and attachments are not retained even if a forged client submits them.
# User governance and Nurse Request assignment (2026-07-22)

- Nurse registration is public but rate-limited by IP and normalized email, rejects unexpected privilege fields, assigns the `nurse` role server-side, and creates a `pending_review` governance record without issuing a dashboard session.
- Custom and WordPress authentication paths deny pending, declined, and banned governed users. Decline and ban revoke active session families and refresh tokens.
- Store Admin governance mutations use target-aware permission callbacks and forbid self-targeting and Store Admin/administrator targets.
- Nurse Request assignment revalidates the selected WordPress user role and approved governance state while the request row is transaction-locked.
- Patient-safe Nurse Request documents are stored outside public media paths, validated by extension, declared/detected MIME, signature, size, count, request state, and record ownership. Only Store Admin may upload, replace, or remove; the owning patient and Store Admin may list or download.
- IV clinical decisions require the assigned pharmacist; Store Admin may perform operational assignment and scheduling but cannot submit the pharmacist's clinical decision.
- Care lifecycle email dispatches claim a unique service/record/event/recipient/template fingerprint before queueing, preventing duplicate delivery under concurrent transitions without storing recipient addresses in the dispatch registry.
- Nurse accounts have no Nevari care capabilities or dashboard route. Direct wp-admin access is redirected and the admin bar is hidden.
- The standalone care-provider assignment surface is no longer registered. Its table/legacy identifier remains temporarily for migration compatibility only.
# 2026-07-23 verification note

The admin staff action proxy now validates the double-submit CSRF token before forwarding approve, decline, ban, suspend, or password-reset actions. Staff, MTM, and subscription list parameters are sanitized and bounded server-side; no browser token or direct WordPress-origin request was introduced.

# 2026-07-23 storefront permission enforcement

- Storefront area access is represented by explicit WordPress capabilities and resolved against the authenticated JWT user on each protected REST request; browser navigation is not the authorization boundary.
- Staff access mutations are administrator-only, reject self-targets and unexpected roles/permissions, revoke the affected user's active sessions, and record safe before/after values without tokens or password data.
- Successful staff access changes queue notifications for the affected user and acting administrator. Delivery failures do not roll back the authoritative access change and are written to the audit log.

# 2026-07-23 patient governance and dashboard reset hardening

- Patient and staff governance mutations now derive the required Patients or Staff Management capability from the target user's current server-side role. Self-targets and protected administrative targets remain denied.
- Role changes update the WordPress role, explicit storefront capabilities, and the indexed governance role/status in one database transaction, then revoke the affected user's sessions.
- Successful and failed role/status/reset actions write sanitized audit outcomes with safe before/after values and failure categories. Reset keys and email links are never written to audit metadata.
- Administrator-triggered password resets use the trusted Nevari dashboard origin and a role-specific frontend type instead of WordPress's native reset URL. Reset confirmation validates the key against that allowlisted frontend.
- Banned and suspended users may complete a valid administrator-requested password reset, but authentication remains blocked until their governance status is restored.
- The role-upgrade proxy now requires the same double-submit CSRF token used by other storefront governance mutations.

# 2026-07-24 pharmacist dashboard rebuild — access reduction and IV therapy IDOR fix

- **Fixed:** `product_manager_required()` in `class-nevari-rest.php` previously granted pharmacists full product mutation authority. It is removed; product mutations are store-admin-only, and all general `Nevari_Rest` routes now fail closed for pharmacist sessions, including product reads and individual order reads.
- **Fixed:** pharmacist sessions are denied general orders, payments, customers, doctors, prescriptions, email, audit, store-dashboard, and other generic REST surfaces. Subscription self/payment routes apply the same denial.
- **Fixed (newly discovered during this review, not previously documented):** `class-nevari-iv-therapy.php`'s pharmacist-facing routes (`/pharmacist/iv-therapy-requests`, `/pharmacist/iv-therapy-requests/{id}`) had no assignment scoping or pagination — `staff_index()` ran an unfiltered `SELECT * ... LIMIT 200` and `staff_show()`/`find_request_across_users()` had no ownership check at all, so any authenticated pharmacist could list and open every customer's IV therapy request, including ones assigned to other pharmacists, directly via the REST API regardless of the dashboard UI. Both routes are now scoped to `assigned_clinician_user_id = <caller>` for non-admins, paginated (`page`/`per_page`, bounded to 100/page), and the detail route does a direct keyed lookup (by `id` or `legacy_key`) with an ownership check returning 404 rather than scanning a capped, unfiltered result set.
- **Fixed:** `class-nevari-mtm.php`'s `pharmacist_index()` already filtered pharmacist-scoped MTM requests to `assigned_pharmacist_user_id = <caller>` (no change needed to the security boundary there), but had no pagination/search/row cap on that branch, unlike the store-admin branch. Both branches now share one paginated, searchable query path.
- **Architectural note:** this codebase has two parallel backends over the same underlying IV therapy request table — the legacy `class-nevari-iv-therapy.php` routes above (hardened as described), and `class-nevari-care-journeys.php`'s `/staff/care-requests/iv-therapy*`, which was already correctly assignment-scoped and paginated (see the 2026-07-22 entry above) but was only ever wired to an unused frontend component. The rebuilt pharmacist dashboard's IV Therapy tab now uses the already-correct `care-journeys` system for its data and actions; the legacy routes were hardened independently since they remain directly callable.
- **Capability migration:** version 0.6.3 reduces pharmacists to `read` plus explicit MTM capabilities. Legacy role and direct-user grants, including `upload_files` and storefront grants, are removed. Pharmacists are denied wp-admin/admin-AJAX access and the admin bar is hidden.
- **MTM product boundary:** lookup moved to `/pharmacist/mtm-requests/{id}/pharmacy-products`, whose permission callback verifies assignment. Product attachment rejects unexpected fields; linked-order creation accepts no client-supplied items or patient identity.
- **Next.js defense in depth:** the signed proxy allowlists pharmacist frontend traffic to authentication, assigned MTM, assigned IV Therapy, and self-availability. Generic admin resources return 403.

# 2026-07-25 pharmacist MTM case workflow — new assigned-case routes

- **Added:** `GET /pharmacist/mtm-requests/{id}/document` serves the same canonical MTM submission PDF as the customer route, but its `permission_callback` is `pharmacist_request_permission` (store admin, or the pharmacist the case is assigned to). The customer `/mtm-requests/{id}/document` route is unchanged; pharmacist sessions remain blocked from it by the Next.js proxy allowlist, which only permits `/pharmacist/mtm-requests*`, `/pharmacist/availability`, `/staff/care-requests/iv-therapy*`, and `/auth/*`.
- **Added:** `POST /pharmacist/mtm-requests/{id}/reschedule` releases the Google Meet space, join tokens, check-in timestamps and reserved slot, and returns the case to `approved` so the patient can select a new slot. Ownership is enforced by the same `pharmacist_request_permission` callback used by the other case actions; the body accepts only an optional `reason` and rejects any other field. Payment state is deliberately not modified, so a reschedule cannot be used to re-charge or to release a paid consultation credit.
- **Unchanged boundary:** neither route widens what a pharmacist can read or mutate beyond cases already assigned to them; both return the standard sanitized MTM payload.
- **Email link fix:** MTM join links were built as `<dashboard>/dashboard/therapy/join/<token>`, which is not a route and returned 404. They now point at `<dashboard>/therapy/join/<token>`, the tokenized join screen that re-validates the signed token, the meeting window and the stored token hash server-side on every load. The token itself, its HMAC signature, hash comparison and validity window are unchanged.
# 2026-07-27 — Product prescription snapshots and manual order creation

- Product prescriptions accept only the approved formatting subset: paragraphs, line breaks, bold, underline, ordered/unordered lists, and preset font sizes.
- The WordPress API sanitizes the prescription independently of the dashboard and stores the same sanitized value in protected product meta.
- Checkout and dashboard-created orders copy an immutable prescription snapshot into each WooCommerce order item. Later product edits cannot alter historical order instructions.
- Prescription sections are added only to customer WooCommerce emails; admin emails remain unchanged.
- Manual order creation requires an explicitly selected existing patient, at least one explicit product, and an explicit payment status. No customer, product, or payment defaults are trusted.
# 2026-07-27 unified user creation review

- Added explicit authenticated permission enforcement to `POST /admin/users`.
- Confirmed role escalation is rejected server-side: only Administrators can create Administrator accounts.
- Confirmed dashboard permissions are normalized server-side and cannot be granted to roles with fixed defaults.
- Added body-size, exact-field, email, phone, password, image MIME/extension/content/size, and bounded role-field validation.
- The browser continues to call WordPress only through the signed Next.js proxy; no new client secret or bearer-token storage was introduced.
