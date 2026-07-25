const fs = require("fs");
const path = require("path");

const root = process.cwd();

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function writeFile(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeEol(text, eol) {
  return text.replace(/\r?\n/g, eol);
}

function updateFile(relativePath, updater) {
  const original = readFile(relativePath);
  const eol = detectEol(original);
  const normalizedOriginal = normalizeEol(original, "\n");
  const next = updater(normalizedOriginal, "\n");
  if (typeof next !== "string" || next === normalizedOriginal) {
    throw new Error(`No changes produced for ${relativePath}`);
  }
  writeFile(relativePath, normalizeEol(next, eol));
}

function replaceExact(text, search, replacement, label) {
  if (!text.includes(search)) {
    throw new Error(`Missing pattern for ${label}`);
  }
  return text.replace(search, replacement);
}

function replaceRegex(text, pattern, replacement, label) {
  if (!pattern.test(text)) {
    throw new Error(`Missing regex pattern for ${label}`);
  }
  return text.replace(pattern, replacement);
}

function renderResetPasswordPageClient() {
  return `"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandedSpinner } from "../components/BrandedSpinner";
import { FRONTENDS } from "../components/frontend-config";
import { buildUrl, defaultSession, frontendContext, loadSession } from "../components/role-session";

function passwordError(value) {
  const password = String(value || "");
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
}

function noticeTone(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("success")) {
    return "success";
  }
  if (text.includes("invalid") || text.includes("expired") || text.includes("unable") || text.includes("error")) {
    return "error";
  }
  return "warning";
}

export default function ResetPasswordPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = String(searchParams.get("login") || "").trim();
  const key = String(searchParams.get("key") || "").trim();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [notice, setNotice] = useState({ message: "Set a new password to continue.", tone: "warning" });
  const [fieldError, setFieldError] = useState("");
  const session = useMemo(() => {
    const config = FRONTENDS.patient;
    const stored = loadSession(config);
    return {
      ...defaultSession(config),
      ...stored,
      frontendType: config.type,
      frontendOrigin: typeof window !== "undefined" ? window.location.origin : stored.frontendOrigin || "",
      frontendUrl: typeof window !== "undefined" ? window.location.href : stored.frontendUrl || "",
      paired: true,
    };
  }, []);

  const hasValidLink = Boolean(login && key);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!hasValidLink || submitting) {
      return;
    }

    const nextFieldError = passwordError(password) || (password !== confirmPassword ? "Passwords do not match." : "");
    setFieldError(nextFieldError);
    if (nextFieldError) {
      setNotice({ message: nextFieldError, tone: "error" });
      return;
    }

    setSubmitting(true);
    setNotice({ message: "Updating password...", tone: "warning" });
    try {
      const response = await fetch(buildUrl(session, "/auth/password-reset/confirm"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": FRONTENDS.patient.type,
          "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
        },
        body: JSON.stringify({
          login,
          key,
          password,
          ...frontendContext(session),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = String(payload?.error?.message || "Unable to reset password.");
        setFieldError(message);
        setNotice({ message, tone: noticeTone(message) });
        return;
      }

      setCompleted(true);
      setPassword("");
      setConfirmPassword("");
      setFieldError("");
      setNotice({ message: "Password reset successful. You can now log in.", tone: "success" });
    } catch (error) {
      const message = String(error?.message || "Unable to reset password.");
      setFieldError(message);
      setNotice({ message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-badge">Nevari Health</div>
          <h1>Reset password</h1>
          <p>Finish resetting your dashboard password here.</p>
        </div>

        <div className={\`auth-notice \${notice.tone}\`}>
          {notice.message}
        </div>

        {!hasValidLink ? (
          <div className="auth-form">
            <div className="auth-helper-copy">This reset link is invalid or incomplete.</div>
            <button className="auth-primary-button" type="button" onClick={() => router.push("/login")}>
              Back to login
            </button>
          </div>
        ) : completed ? (
          <div className="auth-form">
            <div className="auth-helper-copy">Your password has been updated successfully.</div>
            <button className="auth-primary-button" type="button" onClick={() => router.push("/login")}>
              Go to login
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="form-group">
              <span>New password</span>
              <div className="input-wrap">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </label>

            <label className="form-group">
              <span>Confirm password</span>
              <div className="input-wrap">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </label>

            {fieldError ? <small className="customer-mobile-field-error">{fieldError}</small> : null}

            <button className="auth-primary-button" type="submit" disabled={submitting}>
              {submitting ? <BrandedSpinner label="Resetting password" /> : "Reset password"}
            </button>

            <div className="auth-footer-links">
              <Link href="/login" className="auth-text-link">Back to login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
`;
}

function renderResetPasswordPage() {
  return `import { Suspense } from "react";
import { BrandedLoadingScreen } from "../components/BrandedSpinner";
import ResetPasswordPageClient from "./page-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<BrandedLoadingScreen label="Loading password reset" />}>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
`;
}

updateFile("NevariAdmin Storefront/app/admin/storefront/page.js", (text) => {
  return replaceExact(
    text,
    `      const payload = await apiRequest("/subscriptions/admin");
      setSubscriptionState({ loading: false, error: "", data: payload.data || null });`,
    `      const payload = await apiRequest("/subscriptions/admin");
      setSubscriptionState({ loading: false, error: "", data: payload?.data || payload || null });`,
    "admin storefront subscription hydration"
  );
});

updateFile("NevariAdmin Storefront/app/subscription/page-client.js", (text) => {
  return replaceExact(text, "const PAYWALL_PRO_MONTHLY_AMOUNT = 10_000;", "const PAYWALL_PRO_MONTHLY_AMOUNT = 5_000;", "subscription fallback amount");
});

updateFile("NevariAdmin Storefront/app/pay/[invoiceRef]/page.js", (text) => {
  let next = replaceExact(
    text,
    `.paywall-page { min-height: 100vh; display: grid; place-items: center; background: #f4f6f8; padding: 24px; color: #111; box-sizing: border-box; }`,
    `.paywall-page { min-height: 100vh; background: #f4f6f8; padding: 24px; color: #111; box-sizing: border-box; overflow-y: auto; }`,
    "paywall page shell"
  );
  next = replaceExact(
    next,
    `.paywall-card { width: min(520px, 100%); background: #fff; padding: 36px; border: 1px solid #dfe7f0; box-shadow: 0 24px 80px rgba(14, 41, 85, .12); box-sizing: border-box; }`,
    `.paywall-card { width: min(520px, 100%); margin: 0 auto; background: #fff; padding: 36px; border: 1px solid #dfe7f0; box-shadow: 0 24px 80px rgba(14, 41, 85, .12); box-sizing: border-box; }`,
    "paywall card centering"
  );
  next = replaceExact(
    next,
    `.paywall-page { padding: 12px; align-items: start; }`,
    `.paywall-page { padding: 12px; }`,
    "mobile paywall shell"
  );
  return next;
});

updateFile("NevariAdmin Storefront/app/api/customer/iv-therapy/route.js", (text) => {
  let next = text;
  next = replaceExact(next, `"Weight Management Drips Assistance",`, `"Weight Management",`, "iv therapy option label");
  next = replaceExact(
    next,
    `  const patientFieldError = rejectUnknownFields(patient, ["name", "gender", "address", "cityState", "phoneNumber"], "patient");`,
    `  const patientFieldError = rejectUnknownFields(patient, ["name", "gender", "address", "state", "city", "cityState", "phoneNumber"], "patient");`,
    "iv therapy patient allowed fields"
  );
  next = replaceExact(
    next,
    `  const address = sanitizeText(patient.address, { max: 200 });
  const cityState = sanitizeText(patient.cityState, { max: 120 });
  const phoneNumber = sanitizeText(patient.phoneNumber, { max: 24 });`,
    `  const address = sanitizeText(patient.address, { max: 200 });
  const state = sanitizeText(patient.state, { max: 80 });
  const city = sanitizeText(patient.city, { max: 80 });
  const legacyCityState = sanitizeText(patient.cityState, { max: 120 });
  const cityState = legacyCityState || [city, state].filter(Boolean).join(", ");
  const phoneNumber = sanitizeText(patient.phoneNumber, { max: 24 });`,
    "iv therapy state city sanitization"
  );
  next = replaceExact(
    next,
    `  if (!requiredText(address, 5, 200)) return { error: invalid("Address is required.", "address") };
  if (!requiredText(cityState, 2, 120)) return { error: invalid("City/State is required.", "cityState") };
  if (!isValidPhone(phoneNumber)) return { error: invalid("Phone number is invalid.", "phoneNumber") };`,
    `  if (!requiredText(address, 5, 200)) return { error: invalid("Address is required.", "address") };
  if (!requiredText(state, 2, 80)) return { error: invalid("State is required.", "state") };
  if (!requiredText(city, 2, 80)) return { error: invalid("City is required.", "city") };
  if (!isValidPhone(phoneNumber)) return { error: invalid("Phone number is invalid.", "phoneNumber") };`,
    "iv therapy state city validation"
  );
  next = replaceExact(
    next,
    `      patient: {
        name: patientName,
        gender,
        address,
        cityState,
        phoneNumber,
      },`,
    `      patient: {
        name: patientName,
        gender,
        address,
        state,
        city,
        cityState,
        phoneNumber,
      },`,
    "iv therapy payload patient"
  );
  return next;
});

updateFile("nevari-pharmacy-core/includes/class-nevari-iv-therapy.php", (text) => {
  let next = text;
  next = replaceExact(next, `'title' => 'IV Therapy Request',`, `'title' => 'IV Therapy (Wellness infusions) Request',`, "iv therapy stored title");
  next = replaceExact(
    next,
    `        if (empty($patient['address'])) {
            return Nevari_Helpers::error('validation_error', 'Address is required.', 422, ['field' => 'address']);
        }
        if (empty($patient['cityState'])) {
            return Nevari_Helpers::error('validation_error', 'City/State is required.', 422, ['field' => 'cityState']);
        }
        if (empty($patient['phoneNumber'])) {
            return Nevari_Helpers::error('validation_error', 'Phone number is required.', 422, ['field' => 'phoneNumber']);
        }`,
    `        if (empty($patient['address'])) {
            return Nevari_Helpers::error('validation_error', 'Address is required.', 422, ['field' => 'address']);
        }
        $state = sanitize_text_field((string) ($patient['state'] ?? ''));
        $city = sanitize_text_field((string) ($patient['city'] ?? ''));
        $legacy_city_state = sanitize_text_field((string) ($patient['cityState'] ?? ''));
        if (($state === '' || $city === '') && $legacy_city_state !== '' && strpos($legacy_city_state, ',') !== false) {
            [$legacy_city, $legacy_state] = array_map('trim', explode(',', $legacy_city_state, 2));
            if ($city === '') {
                $city = sanitize_text_field((string) $legacy_city);
            }
            if ($state === '') {
                $state = sanitize_text_field((string) $legacy_state);
            }
        }
        if ($state === '') {
            return Nevari_Helpers::error('validation_error', 'State is required.', 422, ['field' => 'state']);
        }
        if ($city === '') {
            return Nevari_Helpers::error('validation_error', 'City is required.', 422, ['field' => 'city']);
        }
        $patient['state'] = $state;
        $patient['city'] = $city;
        $patient['cityState'] = $legacy_city_state !== '' ? $legacy_city_state : trim($city . ', ' . $state, ', ');
        if (empty($patient['phoneNumber'])) {
            return Nevari_Helpers::error('validation_error', 'Phone number is required.', 422, ['field' => 'phoneNumber']);
        }`,
    "iv therapy php state city validation"
  );
  next = replaceExact(
    next,
    `<p>A new IV therapy request has been submitted.</p><p><strong>Request:</strong> %1$s<br /><strong>Customer:</strong> %2$s<br /><strong>Phone:</strong> %3$s<br /><strong>Email:</strong> %4$s<br /><strong>Gender:</strong> %5$s<br /><strong>Address:</strong> %6$s<br /><strong>City/State:</strong> %7$s<br /><strong>Therapy Types:</strong> %8$s<br /><strong>Chronic Conditions:</strong> %9$s<br /><strong>Current Medications:</strong> %10$s<br /><strong>Allergies:</strong> %11$s<br /><strong>Previous IV Therapy:</strong> %12$s<br /><strong>Blood Clot History:</strong> %13$s<br /><strong>Main Goal:</strong> %14$s<br /><strong>Expected Results:</strong> %15$s</p>',`,
    `<p>A new IV therapy request has been submitted.</p><p><strong>Request:</strong> %1$s<br /><strong>Customer:</strong> %2$s<br /><strong>Phone:</strong> %3$s<br /><strong>Email:</strong> %4$s<br /><strong>Gender:</strong> %5$s<br /><strong>Address:</strong> %6$s<br /><strong>State:</strong> %7$s<br /><strong>City:</strong> %8$s<br /><strong>Therapy Types:</strong> %9$s<br /><strong>Chronic Conditions:</strong> %10$s<br /><strong>Current Medications:</strong> %11$s<br /><strong>Allergies:</strong> %12$s<br /><strong>Previous IV Therapy:</strong> %13$s<br /><strong>Blood Clot History:</strong> %14$s<br /><strong>Main Goal:</strong> %15$s<br /><strong>Expected Results:</strong> %16$s</p>',`,
    "iv therapy admin email labels"
  );
  next = replaceExact(
    next,
    `                esc_html((string) ($patient['address'] ?? 'n/a')),
                esc_html((string) ($patient['cityState'] ?? 'n/a')),
                esc_html($therapy_types ?: 'Not specified'),
                esc_html((string) ($clinical_history['chronicConditionsDetails'] ?? ($clinical_history['chronicConditions'] ?? 'No'))),
                esc_html((string) ($clinical_history['currentMedicationsDetails'] ?? ($clinical_history['currentMedications'] ?? 'No'))),
                esc_html((string) ($clinical_history['allergiesDetails'] ?? ($clinical_history['allergies'] ?? 'No'))),
                esc_html((string) ($clinical_history['priorIvTherapyDetails'] ?? ($clinical_history['priorIvTherapy'] ?? 'No'))),
                esc_html((string) ($clinical_history['bloodClotHistory'] ?? 'No')),
                esc_html((string) ($goals['primaryReason'] ?? 'Not provided')),
                esc_html((string) ($goals['expectedResults'] ?? 'Not provided'))
            );`,
    `                esc_html((string) ($patient['address'] ?? 'n/a')),
                esc_html((string) ($patient['state'] ?? 'n/a')),
                esc_html((string) ($patient['city'] ?? 'n/a')),
                esc_html($therapy_types ?: 'Not specified'),
                esc_html((string) ($clinical_history['chronicConditionsDetails'] ?? ($clinical_history['chronicConditions'] ?? 'No'))),
                esc_html((string) ($clinical_history['currentMedicationsDetails'] ?? ($clinical_history['currentMedications'] ?? 'No'))),
                esc_html((string) ($clinical_history['allergiesDetails'] ?? ($clinical_history['allergies'] ?? 'No'))),
                esc_html((string) ($clinical_history['priorIvTherapyDetails'] ?? ($clinical_history['priorIvTherapy'] ?? 'No'))),
                esc_html((string) ($clinical_history['bloodClotHistory'] ?? 'No')),
                esc_html((string) ($goals['primaryReason'] ?? 'Not provided')),
                esc_html((string) ($goals['expectedResults'] ?? 'Not provided'))
            );`,
    "iv therapy admin email values"
  );
  next = replaceRegex(
    next,
    /return \[\n            'id' => sanitize_text_field\(\(string\) \(\$item\['id'\] \?\? ''\)\),[\s\S]*?'notificationsDispatchedAt' => sanitize_text_field\(\(string\) \(\$item\['notificationsDispatchedAt'\] \?\? ''\)\),\n        \];/,
    `        $patient = self::sanitize_deep(is_array($item['patient'] ?? null) ? $item['patient'] : []);
        $legacy_city_state = sanitize_text_field((string) ($patient['cityState'] ?? ''));
        $city = sanitize_text_field((string) ($patient['city'] ?? ''));
        $state = sanitize_text_field((string) ($patient['state'] ?? ''));
        if (($city === '' || $state === '') && $legacy_city_state !== '' && strpos($legacy_city_state, ',') !== false) {
            [$legacy_city, $legacy_state] = array_map('trim', explode(',', $legacy_city_state, 2));
            if ($city === '') {
                $city = sanitize_text_field((string) $legacy_city);
            }
            if ($state === '') {
                $state = sanitize_text_field((string) $legacy_state);
            }
        }
        $patient['city'] = $city;
        $patient['state'] = $state;
        $patient['cityState'] = $legacy_city_state !== '' ? $legacy_city_state : trim($city . ', ' . $state, ', ');

        return [
            'id' => sanitize_text_field((string) ($item['id'] ?? '')),
            'request_reference' => sanitize_text_field((string) ($item['requestReference'] ?? self::request_reference())),
            'status' => sanitize_key((string) ($item['status'] ?? self::STATUS_SUBMITTED)),
            'status_label' => 'Submitted',
            'title' => sanitize_text_field((string) ($item['title'] ?? 'IV Therapy (Wellness infusions) Request')),
            'patient' => $patient,
            'clinical_history' => self::sanitize_deep(is_array($item['clinicalHistory'] ?? null) ? $item['clinicalHistory'] : []),
            'therapy_types' => self::sanitize_text_list(is_array($item['therapyTypes'] ?? null) ? $item['therapyTypes'] : []),
            'goals' => self::sanitize_deep(is_array($item['goals'] ?? null) ? $item['goals'] : []),
            'consent' => sanitize_text_field((string) ($item['consent'] ?? 'No')),
            'customer_user_id' => $customer_user_id,
            'customer_name' => sanitize_text_field((string) ($item['customerName'] ?? ($customer instanceof WP_User ? $customer->display_name : 'Customer'))),
            'customer_email' => sanitize_email((string) ($item['customerEmail'] ?? ($customer instanceof WP_User ? $customer->user_email : ''))),
            'customer_phone' => sanitize_text_field((string) ($item['customerPhone'] ?? '')),
            'frontend_type' => sanitize_text_field((string) ($item['frontendType'] ?? 'patient')),
            'app_origin' => esc_url_raw((string) ($item['appOrigin'] ?? '')),
            'submitted_at' => sanitize_text_field((string) ($item['submittedAt'] ?? '')),
            'submittedAt' => sanitize_text_field((string) ($item['submittedAt'] ?? '')),
            'created_at' => sanitize_text_field((string) ($item['createdAt'] ?? '')),
            'createdAt' => sanitize_text_field((string) ($item['createdAt'] ?? '')),
            'updated_at' => sanitize_text_field((string) ($item['updatedAt'] ?? '')),
            'updatedAt' => sanitize_text_field((string) ($item['updatedAt'] ?? '')),
            'notificationsDispatchedAt' => sanitize_text_field((string) ($item['notificationsDispatchedAt'] ?? '')),
        ];`,
    "iv therapy normalize request block"
  );
  return next;
});

updateFile("nevari-pharmacy-core/includes/class-nevari-subscriptions.php", (text) => {
  let next = text;
  next = replaceExact(next, "    private const PLAN_AMOUNT_KOBO = 1000;", "    private const PLAN_AMOUNT_KOBO = 5000;", "subscription amount constant");
  next = replaceExact(
    next,
    `        self::sync_all_subscription_plan_posts_to_table();`,
    `        self::ensure_system_plans();`,
    "subscription admin source of truth"
  );
  next = replaceExact(
    next,
    `    public static function sync_subscription_plan_table_from_post(int $post_id, WP_Post $post, bool $update): void {
        if (self::$syncing_plan_post || $post_id <= 0 || !($post instanceof WP_Post) || $post->post_type !== self::PLAN_POST_TYPE) {
            return;
        }
        if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) {
            return;
        }

        self::$syncing_plan_post = true;
        try {
            self::sync_subscription_plan_table(self::plan_row_from_post($post));
            self::dispatch_subscription_webhook('subscription.updated', [
                'plan_id' => (int) $post_id,
                'plan_key' => sanitize_key((string) get_post_meta($post_id, '_nevari_plan_key', true)),
                'source' => 'wordpress_admin',
            ]);
        } finally {
            self::$syncing_plan_post = false;
        }
    }`,
    `    public static function sync_subscription_plan_table_from_post(int $post_id, WP_Post $post, bool $update): void {
        if (self::$syncing_plan_post || $post_id <= 0 || !($post instanceof WP_Post) || $post->post_type !== self::PLAN_POST_TYPE) {
            return;
        }
        if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) {
            return;
        }

        $plan_key = sanitize_key((string) get_post_meta($post_id, '_nevari_plan_key', true)) ?: self::PLAN_KEY;
        self::sync_subscription_plan_post(self::plan_definition_for_key($plan_key));
    }`,
    "subscription reverse sync hardening"
  );
  next = replaceExact(
    next,
    `        $amount = self::normalize_subscription_amount(wp_unslash($_POST['nevari_subscription_amount'] ?? 0));
        $description = sanitize_textarea_field((string) wp_unslash($_POST['nevari_subscription_description'] ?? ''));
        $features = self::normalize_multiline_text(wp_unslash($_POST['nevari_subscription_features'] ?? ''));
        update_post_meta($post_id, '_nevari_amount_kobo', $amount);
        update_post_meta($post_id, '_nevari_subscription_description', $description);
        update_post_meta($post_id, '_nevari_subscription_features', $features);
        update_post_meta($post_id, '_nevari_subscription_checkout_link', self::default_checkout_link());`,
    `        return;`,
    "subscription manual CPT save noop"
  );
  next = replaceExact(
    next,
    `        <div class="nevari-subscription-meta-grid">
            <p>
                <label for="nevari_subscription_amount"><strong><?php esc_html_e('Amount', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_amount" name="nevari_subscription_amount" type="number" class="widefat" min="0" step="1" value="<?php echo esc_attr((string) max(0, $amount)); ?>" placeholder="0">
                <span class="description"><?php esc_html_e('Store the raw subscription amount. Free plans should use 0.', 'nevari-pharmacy-core'); ?></span>
            </p>
            <p>
                <label for="nevari_subscription_description"><strong><?php esc_html_e('Description', 'nevari-pharmacy-core'); ?></strong></label><br>
                <textarea id="nevari_subscription_description" name="nevari_subscription_description" rows="4" class="widefat"><?php echo esc_textarea($description); ?></textarea>
            </p>
            <p>
                <label for="nevari_subscription_features"><strong><?php esc_html_e('Features', 'nevari-pharmacy-core'); ?></strong></label><br>
                <textarea id="nevari_subscription_features" name="nevari_subscription_features" rows="6" class="widefat" placeholder="<?php echo esc_attr("Feature one\\nFeature two\\nFeature three"); ?>"><?php echo esc_textarea($features); ?></textarea>
            </p>
            <p>
                <label for="nevari_subscription_checkout_link"><strong><?php esc_html_e('Checkout link', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_checkout_link" name="nevari_subscription_checkout_link" type="url" class="widefat" value="<?php echo esc_attr($checkout_link); ?>" placeholder="<?php echo esc_attr(self::default_checkout_link()); ?>" readonly>
                <span class="description"><?php esc_html_e('This link is generated for Elementor buttons and customer checkout entry points.', 'nevari-pharmacy-core'); ?></span>
            </p>
        </div>`,
    `        <div class="notice notice-info inline"><p><?php esc_html_e('Subscription CPT entries are synced from the Nevari subscription table and are read-only here so Elementor can consume them without plan drift.', 'nevari-pharmacy-core'); ?></p></div>
        <div class="nevari-subscription-meta-grid">
            <p>
                <label for="nevari_subscription_amount"><strong><?php esc_html_e('Amount', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_amount" name="nevari_subscription_amount" type="number" class="widefat" min="0" step="1" value="<?php echo esc_attr((string) max(0, $amount)); ?>" placeholder="0" readonly disabled>
                <span class="description"><?php esc_html_e('The canonical subscription amount now lives in the subscription plan table.', 'nevari-pharmacy-core'); ?></span>
            </p>
            <p>
                <label for="nevari_subscription_description"><strong><?php esc_html_e('Description', 'nevari-pharmacy-core'); ?></strong></label><br>
                <textarea id="nevari_subscription_description" name="nevari_subscription_description" rows="4" class="widefat" readonly disabled><?php echo esc_textarea($description); ?></textarea>
            </p>
            <p>
                <label for="nevari_subscription_features"><strong><?php esc_html_e('Features', 'nevari-pharmacy-core'); ?></strong></label><br>
                <textarea id="nevari_subscription_features" name="nevari_subscription_features" rows="6" class="widefat" placeholder="<?php echo esc_attr("Feature one\\nFeature two\\nFeature three"); ?>" readonly disabled><?php echo esc_textarea($features); ?></textarea>
            </p>
            <p>
                <label for="nevari_subscription_checkout_link"><strong><?php esc_html_e('Checkout link', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_checkout_link" name="nevari_subscription_checkout_link" type="url" class="widefat" value="<?php echo esc_attr($checkout_link); ?>" placeholder="<?php echo esc_attr(self::default_checkout_link()); ?>" readonly>
                <span class="description"><?php esc_html_e('This deep link is the canonical Elementor button target for subscription checkout.', 'nevari-pharmacy-core'); ?></span>
            </p>
        </div>`,
    "subscription CPT readonly meta box"
  );
  return next;
});

updateFile("nevari-pharmacy-core/includes/class-nevari-sso.php", (text) => {
  return replaceExact(
    text,
    `    private static function create_customer_from_identity(string $dashboard_user_id, string $email, string $first_name, string $last_name) {
        $display_name = trim($first_name . ' ' . $last_name);
        if ($display_name === '') {
            $display_name = preg_replace('/@.+$/', '', $email);
        }
`,
    `    private static function create_customer_from_identity(string $dashboard_user_id, string $email, string $first_name, string $last_name) {
        $display_name = Nevari_Auth::preferred_customer_display_name($first_name, $last_name, $email);
`,
    "sso customer display name"
  );
});

updateFile("nevari-pharmacy-core/includes/class-nevari-auth.php", (text) => {
  let next = text;
  next = replaceExact(
    next,
    `        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/password-reset', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'password_reset'],
            'permission_callback' => '__return_true',
        ]);
`,
    `        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/password-reset', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'password_reset'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/password-reset/confirm', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'password_reset_confirm'],
            'permission_callback' => '__return_true',
        ]);
`,
    "password reset confirm route"
  );
  next = replaceExact(
    next,
    `            $given_name = sanitize_text_field((string) ($google_payload['given_name'] ?? ''));
            $family_name = sanitize_text_field((string) ($google_payload['family_name'] ?? ''));
            $display_name = sanitize_text_field((string) ($google_payload['name'] ?? trim($given_name . ' ' . $family_name)));
            if ($display_name === '') {
                $display_name = preg_replace('/@.+$/', '', $email);
            }`,
    `            $given_name = sanitize_text_field((string) ($google_payload['given_name'] ?? ''));
            $family_name = sanitize_text_field((string) ($google_payload['family_name'] ?? ''));
            $display_name = self::preferred_customer_display_name($given_name, $family_name, $email);`,
    "google login display name"
  );
  next = replaceRegex(
    next,
    /public static function password_reset\(WP_REST_Request \$request\): WP_REST_Response \{[\s\S]*?\n    \}\n\n    public static function register_customer/s,
    `public static function password_reset(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $username = isset($params['username']) ? sanitize_text_field((string) $params['username']) : '';
        $ip = Nevari_Helpers::client_ip();
        $username_key = $username ? sanitize_user(strtolower($username), true) : 'unknown';

        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_ip', 5, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_user', 5, 15 * MINUTE_IN_SECONDS, [$username_key])) {
            return $response;
        }
        if (!$username) {
            return Nevari_Helpers::error('validation_error', 'Username or email is required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $reset_user = self::find_user_by_login_or_email($username);
        if ($reset_user instanceof WP_User && self::user_can_access_frontend($reset_user, (string) $frontend['frontend_type'])) {
            $reset_key = get_password_reset_key($reset_user);
            if (!is_wp_error($reset_key)) {
                $reset_url = self::dashboard_password_reset_url($frontend, $reset_user, (string) $reset_key);
                self::send_dashboard_password_reset_email($reset_user, $reset_url);
            }
        }

        Nevari_Audit::log('security', 'nevari', 'auth.password_reset_requested', 'success', [
            'message' => 'Password reset requested.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
                'username_hash' => hash('sha256', strtolower($username)),
            ],
        ]);

        return Nevari_Helpers::success([
            'message' => 'If an account exists for that username, a password reset link has been sent.',
        ]);
    }

    public static function password_reset_confirm(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $login = isset($params['login']) ? sanitize_text_field((string) $params['login']) : '';
        $key = isset($params['key']) ? sanitize_text_field((string) $params['key']) : '';
        $password = isset($params['password']) ? (string) $params['password'] : '';
        $ip = Nevari_Helpers::client_ip();

        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_confirm_ip', 5, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_confirm_login', 5, 15 * MINUTE_IN_SECONDS, [sanitize_user(strtolower($login), true) ?: 'unknown'])) {
            return $response;
        }
        if ($login === '' || $key === '' || $password === '') {
            return Nevari_Helpers::error('validation_error', 'Login, reset key, and password are required.', 422);
        }
        if (strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'Password must be at least 8 characters.', 422, ['field' => 'password']);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $user = check_password_reset_key($key, $login);
        if (is_wp_error($user) || !($user instanceof WP_User)) {
            return Nevari_Helpers::error('invalid_reset_link', 'This password reset link is invalid or has expired.', 400);
        }
        if (!self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        reset_password($user, $password);
        clean_user_cache($user);

        $first_name = (string) get_user_meta((int) $user->ID, 'first_name', true);
        $last_name = (string) get_user_meta((int) $user->ID, 'last_name', true);
        $display_name = self::preferred_customer_display_name($first_name, $last_name, (string) $user->user_email);
        if ($display_name !== '' && strtolower(trim((string) $user->display_name)) === 'customer') {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $display_name]);
        }

        Nevari_Audit::log('security', 'nevari', 'auth.password_reset_confirmed', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'Password reset completed from dashboard reset flow.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
            ],
        ]);

        return Nevari_Helpers::success([
            'message' => 'Password reset successful.',
        ]);
    }

    public static function register_customer`,
    "auth password reset methods"
  );
  next = replaceExact(
    next,
    `        $display_name = trim($first_name . ' ' . $last_name);

        if (!$email || !is_email($email) || !$display_name || strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'Valid first name, last name, email and an 8+ character password are required.', 422);
        }`,
    `        $display_name = self::preferred_customer_display_name($first_name, $last_name, $email);

        if (!$email || !is_email($email) || strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'A valid email and an 8+ character password are required.', 422);
        }`,
    "register customer validation"
  );
  next = replaceExact(
    next,
    `    private static function find_user_by_login_or_email(string $username): ?WP_User {
        $user = strpos($username, '@') !== false ? get_user_by('email', $username) : get_user_by('login', $username);
        return $user instanceof WP_User ? $user : null;
    }

    public static function format_user(WP_User $user): array {
        $all_caps = array_keys(array_filter((array) $user->allcaps));
        $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, '_nevari_customer_profile_image_url', true));
        if ($avatar_url === '') {
            $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, 'nevari_google_picture', true));
        }
        if ($avatar_url === '') {
            $avatar_url = get_avatar_url((int) $user->ID, ['size' => 128]) ?: '';
        }
        return [
            'id' => (int) $user->ID,
            'email' => $user->user_email,
            'display_name' => $user->display_name,
            'first_name' => (string) get_user_meta((int) $user->ID, 'first_name', true),
            'last_name' => (string) get_user_meta((int) $user->ID, 'last_name', true),
            'avatar_url' => $avatar_url,
            'roles' => array_values((array) $user->roles),
            'capabilities' => array_values(array_filter($all_caps, static function ($cap) {
                return strpos($cap, 'nevari_') === 0 || in_array($cap, ['manage_woocommerce', 'edit_products', 'edit_shop_orders'], true);
            })),
        ];
    }`,
    `    public static function preferred_customer_display_name(string $first_name, string $last_name, string $email): string {
        $normalized_last_name = sanitize_text_field($last_name);
        if ($normalized_last_name !== '') {
            return $normalized_last_name;
        }

        $normalized_first_name = sanitize_text_field($first_name);
        if ($normalized_first_name !== '') {
            return $normalized_first_name;
        }

        return self::email_local_part($email);
    }

    private static function email_local_part(string $email): string {
        $normalized_email = sanitize_email($email);
        if (!$normalized_email || strpos($normalized_email, '@') === false) {
            return '';
        }

        [$local] = explode('@', $normalized_email, 2);
        return sanitize_text_field((string) preg_replace('/[._-]+/', ' ', $local));
    }

    private static function dashboard_password_reset_url(array $frontend, WP_User $user, string $reset_key): string {
        $origin = untrailingslashit((string) ($frontend['frontend_origin'] ?? ''));
        $query = http_build_query([
            'login' => $user->user_login,
            'key' => $reset_key,
        ]);

        return $origin . '/reset-password?' . $query;
    }

    private static function send_dashboard_password_reset_email(WP_User $user, string $reset_url): void {
        $display_name = self::preferred_customer_display_name(
            (string) get_user_meta((int) $user->ID, 'first_name', true),
            (string) get_user_meta((int) $user->ID, 'last_name', true),
            (string) $user->user_email
        ) ?: $user->user_login;

        Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $user->ID,
            'recipient_email' => $user->user_email,
            'subject' => 'Reset your Nevari dashboard password',
            'body_html' => sprintf(
                '<p>Hello %1$s,</p><p>We received a request to reset your password.</p><p><a href="%2$s">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>',
                esc_html($display_name),
                esc_url($reset_url)
            ),
            'body_text' => sprintf(
                "Hello %1\$s,\n\nUse this link to reset your password:\n%2\$s\n\nIf you did not request this, you can ignore this email.",
                $display_name,
                $reset_url
            ),
            'related_object_type' => 'password_reset',
            'related_object_id' => (int) $user->ID,
        ], true);
    }

    private static function find_user_by_login_or_email(string $username): ?WP_User {
        $user = strpos($username, '@') !== false ? get_user_by('email', $username) : get_user_by('login', $username);
        return $user instanceof WP_User ? $user : null;
    }

    public static function format_user(WP_User $user): array {
        $all_caps = array_keys(array_filter((array) $user->allcaps));
        $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, '_nevari_customer_profile_image_url', true));
        if ($avatar_url === '') {
            $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, 'nevari_google_picture', true));
        }
        if ($avatar_url === '') {
            $avatar_url = get_avatar_url((int) $user->ID, ['size' => 128]) ?: '';
        }
        $first_name = (string) get_user_meta((int) $user->ID, 'first_name', true);
        $last_name = (string) get_user_meta((int) $user->ID, 'last_name', true);
        $display_name = trim((string) $user->display_name);
        if ($display_name === '' || strtolower($display_name) === 'customer') {
            $display_name = self::preferred_customer_display_name($first_name, $last_name, (string) $user->user_email);
        }
        return [
            'id' => (int) $user->ID,
            'email' => $user->user_email,
            'display_name' => $display_name,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'avatar_url' => $avatar_url,
            'roles' => array_values((array) $user->roles),
            'capabilities' => array_values(array_filter($all_caps, static function ($cap) {
                return strpos($cap, 'nevari_') === 0 || in_array($cap, ['manage_woocommerce', 'edit_products', 'edit_shop_orders'], true);
            })),
        ];
    }`,
    "auth helper block"
  );
  next = replaceExact(
    next,
    `        if ($name !== '' && in_array(strtolower(trim((string) $user->display_name)), ['', 'customer'], true)) {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $name]);
        }`,
    `        $preferred_display_name = self::preferred_customer_display_name($given_name, $family_name, (string) $user->user_email);
        if ($preferred_display_name !== '' && in_array(strtolower(trim((string) $user->display_name)), ['', 'customer'], true)) {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $preferred_display_name]);
        } elseif ($name !== '' && trim((string) $user->display_name) === '') {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $name]);
        }`,
    "google profile preferred display name"
  );
  return next;
});

updateFile("NevariAdmin Storefront/app/_customer-dashboard.js", (text) => {
  let next = text;
  next = replaceExact(
    next,
    `import { fetchCustomerIvTherapyRequests, fetchCustomerMtmRequests, fetchCustomerNurseRequests, normalizeCustomerSettingsPayload, requestMtmReschedule, resolveSubscriptionMonthlyAmount, submitCustomerIvTherapyRequest, submitCustomerMtmRequest, updateCustomerSettings, uploadCustomerProfileImage } from "./lib/nevari-api";`,
    `import { fetchCustomerIvTherapyRequests, fetchCustomerMtmRequests, fetchCustomerNurseRequests, normalizeCustomerSettingsPayload, requestMtmReschedule, resolveSubscriptionMonthlyAmount, submitCustomerIvTherapyRequest, submitCustomerMtmRequest, updateCustomerSettings, uploadCustomerProfileImage } from "./lib/nevari-api";
import { citiesForNigeriaState, NIGERIA_STATES } from "./lib/nigeria-locations";`,
    "customer dashboard nigeria import"
  );
  next = replaceExact(next, "const PAYWALL_PRO_MONTHLY_AMOUNT = 10_000;", "const PAYWALL_PRO_MONTHLY_AMOUNT = 5_000;", "customer dashboard pro amount");
  next = replaceExact(next, `"Weight Management Drips Assistance",`, `"Weight Management",`, "customer dashboard iv option label");
  next = replaceExact(next, `"iv-therapy": "IV Therapy"`, `"iv-therapy": "IV Therapy (Wellness infusions)"`, "customer dashboard iv page label");
  next = replaceExact(
    next,
    `    patient: {
      name: "",
      gender: "",
      address: "",
      cityState: "",
      phoneNumber: ""
    },`,
    `    patient: {
      name: "",
      gender: "",
      address: "",
      state: "",
      city: "",
      cityState: "",
      phoneNumber: ""
    },`,
    "iv therapy initial state"
  );
  next = replaceExact(
    next,
    `function resolveCustomerPreferredName({ settingsDisplayName = '', profile = {}, sessionUser = {} } = {}) {
  return normalizeCustomerName(settingsDisplayName)
    || normalizeCustomerName(fullNameFromParts(profile))
    || normalizeCustomerName(profile?.display_name)
    || normalizeCustomerName(profile?.last_name || profile?.lastName)
    || normalizeCustomerName(fullNameFromParts(sessionUser))
    || normalizeCustomerName(sessionUser?.display_name)
    || normalizeCustomerName(sessionUser?.name)
    || normalizeCustomerName(sessionUser?.last_name || sessionUser?.lastName)
    || normalizeCustomerName(emailLocalName(profile?.email || sessionUser?.email))
    || 'Customer';
}`,
    `function resolveCustomerPreferredName({ settingsDisplayName = '', profile = {}, sessionUser = {} } = {}) {
  return normalizeCustomerName(settingsDisplayName)
    || normalizeCustomerName(profile?.display_name)
    || normalizeCustomerName(profile?.last_name || profile?.lastName)
    || normalizeCustomerName(profile?.first_name || profile?.firstName)
    || normalizeCustomerName(sessionUser?.display_name)
    || normalizeCustomerName(sessionUser?.last_name || sessionUser?.lastName)
    || normalizeCustomerName(sessionUser?.first_name || sessionUser?.firstName)
    || normalizeCustomerName(fullNameFromParts(profile))
    || normalizeCustomerName(fullNameFromParts(sessionUser))
    || normalizeCustomerName(sessionUser?.name)
    || normalizeCustomerName(emailLocalName(profile?.email || sessionUser?.email))
    || 'Customer';
}`,
    "customer preferred name precedence"
  );
  next = replaceExact(
    next,
    `function resolveCustomerFullName(profile = {}, sessionUser = {}, fallbackName = "Customer") {
  const firstName = String(profile?.first_name || profile?.firstName || sessionUser?.first_name || sessionUser?.firstName || "").trim();
  const lastName = String(profile?.last_name || profile?.lastName || sessionUser?.last_name || sessionUser?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  return String(profile?.display_name || sessionUser?.display_name || sessionUser?.name || fallbackName || "Customer").trim() || "Customer";
}


function buildIvTherapyStepErrors(step, form) {`,
    `function resolveCustomerFullName(profile = {}, sessionUser = {}, fallbackName = "Customer") {
  const firstName = String(profile?.first_name || profile?.firstName || sessionUser?.first_name || sessionUser?.firstName || "").trim();
  const lastName = String(profile?.last_name || profile?.lastName || sessionUser?.last_name || sessionUser?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  return String(profile?.display_name || sessionUser?.display_name || sessionUser?.name || fallbackName || "Customer").trim() || "Customer";
}

function composeCityStateValue(city = "", state = "") {
  const normalizedCity = String(city || "").trim();
  const normalizedState = String(state || "").trim();
  return [normalizedCity, normalizedState].filter(Boolean).join(", ");
}

function buildIvTherapyPatientPayload(patient = {}) {
  const state = String(patient.state || "").trim();
  const city = String(patient.city || "").trim();
  return {
    ...patient,
    state,
    city,
    cityState: composeCityStateValue(city, state),
  };
}

function buildIvTherapyStepErrors(step, form) {`,
    "customer dashboard iv helper insertion"
  );
  next = replaceExact(
    next,
    `    if (!String(patient.address || "").trim()) errors.address = "Address is required.";
    if (!String(patient.cityState || "").trim()) errors.cityState = "City/State is required.";
    if (!/^[0-9+\\-()\\s]{7,24}$/.test(String(patient.phoneNumber || "").trim())) errors.phoneNumber = "Enter a valid phone number.";`,
    `    if (!String(patient.address || "").trim()) errors.address = "Address is required.";
    if (!String(patient.state || "").trim()) errors.state = "State is required.";
    if (!String(patient.city || "").trim()) errors.city = "City is required.";
    if (!/^[0-9+\\-()\\s]{7,24}$/.test(String(patient.phoneNumber || "").trim())) errors.phoneNumber = "Enter a valid phone number.";`,
    "customer dashboard iv step1 validation"
  );
  next = replaceExact(
    next,
    `  const ivTherapyStepErrors = buildIvTherapyStepErrors(ivTherapyStep, ivTherapyForm);
  const showIvTherapyFieldError = (key) => Boolean(ivTherapyStepErrors[key]) && ivTherapyShowErrors;

  async function handleIvTherapyContinue() {`,
    `  const ivTherapyStepErrors = buildIvTherapyStepErrors(ivTherapyStep, ivTherapyForm);
  const showIvTherapyFieldError = (key) => Boolean(ivTherapyStepErrors[key]) && ivTherapyShowErrors;
  const ivTherapyAvailableCities = useMemo(() => citiesForNigeriaState(ivTherapyForm.patient.state), [ivTherapyForm.patient.state]);

  async function handleIvTherapyContinue() {`,
    "customer dashboard iv cities memo"
  );
  next = replaceExact(
    next,
    `    setIvTherapySubmitError("");
    setIvTherapySubmitting(true);
    try {
      const created = await submitCustomerIvTherapyRequest(session, {
        patient: ivTherapyForm.patient,
        clinicalHistory: ivTherapyForm.clinicalHistory,
        therapyTypes: ivTherapyForm.therapyTypes,
        goals: ivTherapyForm.goals,
        consent: ivTherapyForm.consent,
        customerEmail: profile.email || settings.email || "",
        customerName: ivTherapyForm.patient.name || settings.displayName || profile.display_name || "",
        customerPhone: settings.phone || ivTherapyForm.patient.phoneNumber || "",
        appOrigin: typeof window !== "undefined" ? window.location.origin : "",
        baseUrl: session?.baseUrl || "",
        frontendType: session?.frontendType || "patient",
      });`,
    `    setIvTherapySubmitError("");
    setIvTherapySubmitting(true);
    try {
      const patientPayload = buildIvTherapyPatientPayload(ivTherapyForm.patient);
      const created = await submitCustomerIvTherapyRequest(session, {
        patient: patientPayload,
        clinicalHistory: ivTherapyForm.clinicalHistory,
        therapyTypes: ivTherapyForm.therapyTypes,
        goals: ivTherapyForm.goals,
        consent: ivTherapyForm.consent,
        customerEmail: profile.email || settings.email || "",
        customerName: patientPayload.name || settings.displayName || profile.display_name || "",
        customerPhone: settings.phone || patientPayload.phoneNumber || "",
        appOrigin: typeof window !== "undefined" ? window.location.origin : "",
        baseUrl: session?.baseUrl || "",
        frontendType: session?.frontendType || "patient",
      });`,
    "customer dashboard iv submit payload"
  );
  next = replaceExact(
    next,
    `        {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>IV Therapy</h1>
        </header> : renderHeader("IV Therapy")}`,
    `        {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>IV Therapy (Wellness infusions)</h1>
        </header> : renderHeader("IV Therapy (Wellness infusions)")}`,
    "customer dashboard iv header"
  );
  next = replaceExact(
    next,
    `              {ivTherapyStep === 1 ? <div className="customer-mobile-form-stack customer-iv-therapy-stack">
                {[
                  ["Name:", "name", "Enter your full name"],
                  ["Address:", "address", "Enter your address"],
                  ["City/State:", "cityState", "Enter your city and state"],
                  ["Phone Number:", "phoneNumber", "Enter your phone number"]
                ].map(([label, key, placeholder]) => <label className="customer-mobile-field" key={key}>
                  <span>{label}</span>
                  <input
                    type={key === "phoneNumber" ? "tel" : "text"}
                    value={ivTherapyForm.patient[key]}
                    placeholder={placeholder}
                    className={showIvTherapyFieldError(key) ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", key, event.target.value)}
                  />
                  {showIvTherapyFieldError(key) ? <small className="customer-mobile-field-error">{ivTherapyStepErrors[key]}</small> : null}
                </label>)}
                <label className="customer-mobile-field">
                  <span>Gender:</span>
                  <select
                    value={ivTherapyForm.patient.gender}
                    className={showIvTherapyFieldError("gender") ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", "gender", event.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                  {showIvTherapyFieldError("gender") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.gender}</small> : null}
                </label>
              </div> : null}`,
    `              {ivTherapyStep === 1 ? <div className="customer-mobile-form-stack customer-iv-therapy-stack">
                {[
                  ["Name:", "name", "Enter your full name", "text"],
                  ["Address:", "address", "Enter your address", "text"],
                  ["Phone Number:", "phoneNumber", "Enter your phone number", "tel"]
                ].map(([label, key, placeholder, type]) => <label className="customer-mobile-field" key={key}>
                  <span>{label}</span>
                  <input
                    type={type}
                    value={ivTherapyForm.patient[key]}
                    placeholder={placeholder}
                    className={showIvTherapyFieldError(key) ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", key, event.target.value)}
                  />
                  {showIvTherapyFieldError(key) ? <small className="customer-mobile-field-error">{ivTherapyStepErrors[key]}</small> : null}
                </label>)}
                <label className="customer-mobile-field">
                  <span>State:</span>
                  <input
                    list="customer-iv-therapy-state-options"
                    value={ivTherapyForm.patient.state}
                    placeholder="Search state"
                    className={showIvTherapyFieldError("state") ? "has-error" : ""}
                    onChange={(event) => {
                      const nextState = event.target.value;
                      updateIvTherapyField("patient", "state", nextState);
                      if (!citiesForNigeriaState(nextState).includes(ivTherapyForm.patient.city)) {
                        updateIvTherapyField("patient", "city", "");
                      }
                    }}
                  />
                  <datalist id="customer-iv-therapy-state-options">
                    {NIGERIA_STATES.map((state) => <option key={state} value={state} />)}
                  </datalist>
                  {showIvTherapyFieldError("state") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.state}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>City:</span>
                  <input
                    list="customer-iv-therapy-city-options"
                    value={ivTherapyForm.patient.city}
                    placeholder={ivTherapyForm.patient.state ? "Search city" : "Select state first"}
                    className={showIvTherapyFieldError("city") ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", "city", event.target.value)}
                  />
                  <datalist id="customer-iv-therapy-city-options">
                    {ivTherapyAvailableCities.map((city) => <option key={city} value={city} />)}
                  </datalist>
                  {showIvTherapyFieldError("city") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.city}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Gender:</span>
                  <select
                    value={ivTherapyForm.patient.gender}
                    className={showIvTherapyFieldError("gender") ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", "gender", event.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                  {showIvTherapyFieldError("gender") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.gender}</small> : null}
                </label>
              </div> : null}`,
    "customer dashboard iv step1 form"
  );
  next = replaceExact(
    next,
    `  async function handleRequestContinue() {
    if (requestStep === 1) {
      if (!selectedCareType) return;
      transitionToRequestStep(2);
      return;
    }
    if (requestStep === 2) {
      if (!validateRequestStep2()) return;
      transitionToRequestStep(3);
      return;
    }
    if (requestStep === 3) {
      if (!validateRequestStep3()) return;
      transitionToRequestStep(4);
      return;
    }
    if (requestStep === 4) {
      transitionToRequestStep(5);
      return;
    }
    if (requestSubmitting) return;
    setRequestSubmitError("");
    setRequestSubmitting(true);
    setRequestSubmitLoadingState(true);
    try {
      const response = await fetch("/api/customer/nurse-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session?.frontendType || "patient",
          "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
        },
        body: JSON.stringify({
          careType: selectedCareType,
          patient: requestForm,
          careDetails,
          clinicalRequirements,
          uploadedMedicalFiles: Object.fromEntries(Object.entries(uploadedMedicalFiles).map(([key, value]) => [key, value?.name || ""])),
          customerEmail: profile.email || settings.email || "",
          customerName: requestForm.name || settings.displayName || profile.display_name || "",
          customerPhone: settings.phone || requestForm.emergencyContact || "",
          appOrigin: typeof window !== "undefined" ? window.location.origin : "",
          baseUrl: nurseRequestAuth?.baseUrl || "",
          adminEmail: nurseRequestAuth?.adminEmail || "",
          frontendType: session?.frontendType || "patient",
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorField = String(result?.error?.field || result?.error?.details?.field || "").trim();
        const errorMessage = String(result?.error?.message || "Unable to submit nurse request.");
        if (["preferredDate", "preferredTime", "visitType", "duration", "careShift"].includes(errorField)) {
          setRequestStep(3);
          setRequestStep3ShowErrors(true);
          setRequestStep3Errors((current) => ({ ...current, [errorField]: errorMessage }));
          setRequestSubmitError("");
        } else {
          setRequestSubmitError(errorMessage);
        }
        return;
      }
      const created = result?.data?.request || result?.request || {
        id: \`nurse-\${Date.now()}\`,
        status: "pending_review",
        title: \`Nurse Visit Request - \${selectedCareType}\`,
        careType: selectedCareType,
        preferredDate: careDetails.preferredDate,
        preferredTime: careDetails.preferredTime,
        visitType: careDetails.visitType
      };
      await nurseRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, created) : [created], { revalidate: false });
      void nurseRequestsQuery.mutate();
      setLatestSubmittedRequest(created);
      setRequestSubmitted(true);
    } catch {
      setRequestSubmitError("Unable to submit nurse request.");
    } finally {
      window.setTimeout(() => setRequestSubmitLoadingState(false), 320);
      setRequestSubmitting(false);
    }
  }`,
    `  async function handleRequestContinue() {
    if (requestStep === 1) {
      if (!selectedCareType) return;
      transitionToRequestStep(2);
      return;
    }
    if (requestStep === 2) {
      if (!validateRequestStep2()) return;
      transitionToRequestStep(3);
      return;
    }
    if (requestStep === 3) {
      if (!validateRequestStep3()) return;
      transitionToRequestStep(4);
      return;
    }
    if (requestStep === 4) {
      transitionToRequestStep(5);
      return;
    }
    if (requestSubmitting) return;
    const normalizedCareDetails = { ...careDetails };
    const finalCareErrors = getRequestStep3Errors({ source: normalizedCareDetails });
    if (Object.keys(finalCareErrors).length) {
      setRequestStep(3);
      setRequestStep3ShowErrors(true);
      setRequestStep3Errors(finalCareErrors);
      return;
    }
    setRequestSubmitError("");
    setRequestSubmitting(true);
    setRequestSubmitLoadingState(true);
    try {
      const response = await fetch("/api/customer/nurse-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session?.frontendType || "patient",
          "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
        },
        body: JSON.stringify({
          careType: selectedCareType,
          patient: requestForm,
          careDetails: normalizedCareDetails,
          clinicalRequirements,
          uploadedMedicalFiles: Object.fromEntries(Object.entries(uploadedMedicalFiles).map(([key, value]) => [key, value?.name || ""])),
          customerEmail: profile.email || settings.email || "",
          customerName: requestForm.name || settings.displayName || profile.display_name || "",
          customerPhone: settings.phone || requestForm.emergencyContact || "",
          appOrigin: typeof window !== "undefined" ? window.location.origin : "",
          baseUrl: nurseRequestAuth?.baseUrl || "",
          adminEmail: nurseRequestAuth?.adminEmail || "",
          frontendType: session?.frontendType || "patient",
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorField = String(result?.error?.field || result?.error?.details?.field || "").trim().replace(/^careDetails\\./, "");
        const errorMessage = String(result?.error?.message || "Unable to submit nurse request.");
        if (["preferredDate", "preferredTime", "visitType", "duration", "careShift"].includes(errorField)) {
          setRequestStep(3);
          setRequestStep3ShowErrors(true);
          setRequestStep3Errors((current) => ({ ...current, [errorField]: errorMessage }));
          setRequestSubmitError("");
        } else {
          setRequestSubmitError(errorMessage);
        }
        return;
      }
      const created = result?.data?.request || result?.request || {
        id: \`nurse-\${Date.now()}\`,
        status: "pending_review",
        title: \`Nurse Visit Request - \${selectedCareType}\`,
        careType: selectedCareType,
        preferredDate: normalizedCareDetails.preferredDate,
        preferredTime: normalizedCareDetails.preferredTime,
        visitType: normalizedCareDetails.visitType
      };
      await nurseRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, created) : [created], { revalidate: false });
      void nurseRequestsQuery.mutate();
      setLatestSubmittedRequest(created);
      setRequestSubmitted(true);
    } catch {
      setRequestSubmitError("Unable to submit nurse request.");
    } finally {
      window.setTimeout(() => setRequestSubmitLoadingState(false), 320);
      setRequestSubmitting(false);
    }
  }`,
    "customer dashboard nurse submit hardening"
  );
  return next;
});

updateFile("NevariAdmin Storefront/app/globals.css", (text) => {
  let next = text;
  next = replaceExact(
    next,
    `.customer-appointment-confirmation-modal :is(.customer-flow-status-card-confirmed, .customer-flow-status-card-checkout) {
  width: min(100%, 500px) !important;
  max-width: 500px !important;
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  box-shadow: 0 28px 70px rgba(7, 15, 32, 0.28) !important;
}`,
    `.customer-appointment-confirmation-modal :is(.customer-flow-status-card-confirmed, .customer-flow-status-card-checkout) {
  width: min(100%, 500px) !important;
  max-width: 500px !important;
  max-height: none;
  overflow: visible;
  box-shadow: 0 28px 70px rgba(7, 15, 32, 0.28) !important;
}

.customer-appointment-confirmation-modal .customer-flow-status-page-modal {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}`,
    "appointment confirmation modal shell"
  );
  next = replaceExact(
    next,
    `  .customer-appointment-confirmation-modal .customer-flow-status-page-modal {
    min-height: calc(100dvh - 24px);
  }

  .customer-appointment-confirmation-modal :is(.customer-flow-status-card-confirmed, .customer-flow-status-card-checkout) {
    max-height: calc(100dvh - 24px);
  }
`,
    `  .customer-appointment-confirmation-modal .customer-flow-status-page-modal {
    min-height: auto;
  }

  .customer-appointment-confirmation-modal :is(.customer-flow-status-card-confirmed, .customer-flow-status-card-checkout) {
    max-height: none;
  }
`,
    "appointment confirmation modal mobile shell"
  );
  return next;
});

writeFile("NevariAdmin Storefront/app/reset-password/page-client.js", renderResetPasswordPageClient());
writeFile("NevariAdmin Storefront/app/reset-password/page.js", renderResetPasswordPage());

console.log("Dashboard fixes applied.");
