const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, text, eol) {
  fs.writeFileSync(path.join(root, relativePath), text.replace(/\n/g, eol), "utf8");
}

function update(relativePath, updater) {
  const original = read(relativePath);
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const normalized = original.replace(/\r\n/g, "\n");
  const next = updater(normalized);
  if (typeof next !== "string") {
    throw new Error(`Invalid update result for ${relativePath}`);
  }
  if (next !== normalized) {
    write(relativePath, next, eol);
  }
}

function replaceOne(text, search, replacement, label) {
  if (text.includes(replacement)) {
    return text;
  }
  if (!text.includes(search)) {
    throw new Error(`Missing pattern for ${label}`);
  }
  return text.replace(search, replacement);
}

function replaceRegex(text, pattern, replacement, label) {
  if (pattern.test(text)) {
    return text.replace(pattern, replacement);
  }
  if (text.includes(replacement)) {
    return text;
  }
  throw new Error(`Missing regex pattern for ${label}`);
}

function resetPasswordPageClient() {
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
  if (text.includes("success")) return "success";
  if (text.includes("invalid") || text.includes("expired") || text.includes("error") || text.includes("unable")) return "error";
  return "warning";
}

export default function ResetPasswordPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = String(searchParams.get("login") || "").trim();
  const key = String(searchParams.get("key") || "").trim();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [notice, setNotice] = useState({ message: "Set a new password to continue.", tone: "warning" });
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

  async function handleSubmit(event) {
    event.preventDefault();
    if (!login || !key || submitting) {
      return;
    }

    const message = passwordError(password) || (password !== confirmPassword ? "Passwords do not match." : "");
    setFieldError(message);
    if (message) {
      setNotice({ message, tone: "error" });
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
        const nextMessage = String(payload?.error?.message || "Unable to reset password.");
        setFieldError(nextMessage);
        setNotice({ message: nextMessage, tone: noticeTone(nextMessage) });
        return;
      }

      setCompleted(true);
      setFieldError("");
      setPassword("");
      setConfirmPassword("");
      setNotice({ message: "Password reset successful. You can now log in.", tone: "success" });
    } catch (error) {
      const nextMessage = String(error?.message || "Unable to reset password.");
      setFieldError(nextMessage);
      setNotice({ message: nextMessage, tone: "error" });
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

        <div className={\`auth-notice \${notice.tone}\`}>{notice.message}</div>

        {!login || !key ? (
          <div className="auth-form">
            <div className="auth-helper-copy">This password reset link is invalid or incomplete.</div>
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
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
              </div>
            </label>
            <label className="form-group">
              <span>Confirm password</span>
              <div className="input-wrap">
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
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

function resetPasswordPage() {
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

update("nevari-pharmacy-core/includes/class-nevari-subscriptions.php", (text) => {
  let next = text;
  next = replaceOne(next, "    private const PLAN_AMOUNT_KOBO = 1000;", "    private const PLAN_AMOUNT_KOBO = 5000;", "subscription amount");
  next = replaceOne(next, "        self::sync_all_subscription_plan_posts_to_table();", "        self::ensure_system_plans();", "subscription admin source");
  next = replaceOne(
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
    "subscription reverse sync"
  );
  next = replaceOne(
    next,
    `        $amount = self::normalize_subscription_amount(wp_unslash($_POST['nevari_subscription_amount'] ?? 0));
        $description = sanitize_textarea_field((string) wp_unslash($_POST['nevari_subscription_description'] ?? ''));
        $features = self::normalize_multiline_text(wp_unslash($_POST['nevari_subscription_features'] ?? ''));
        update_post_meta($post_id, '_nevari_amount_kobo', $amount);
        update_post_meta($post_id, '_nevari_subscription_description', $description);
        update_post_meta($post_id, '_nevari_subscription_features', $features);
        update_post_meta($post_id, '_nevari_subscription_checkout_link', self::default_checkout_link());`,
    `        return;`,
    "subscription save noop"
  );
  next = replaceOne(
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
                <span class="description"><?php esc_html_e('Enter one feature per line.', 'nevari-pharmacy-core'); ?></span>
            </p>
            <p>
                <label for="nevari_subscription_checkout_link"><strong><?php esc_html_e('Checkout link', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_checkout_link" name="nevari_subscription_checkout_link" type="url" class="widefat" value="<?php echo esc_attr($checkout_link); ?>" placeholder="<?php echo esc_attr(self::default_checkout_link()); ?>" readonly>
                <span class="description"><?php esc_html_e('This value is auto-generated from the plan settings.', 'nevari-pharmacy-core'); ?></span>
            </p>
        </div>`,
    `        <div class="notice notice-info inline"><p><?php esc_html_e('Subscription CPT entries are synced from the Nevari subscription table and stay read-only here so Elementor can consume them without plan drift.', 'nevari-pharmacy-core'); ?></p></div>
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
                <span class="description"><?php esc_html_e('Manage features from the dashboard subscription plan table.', 'nevari-pharmacy-core'); ?></span>
            </p>
            <p>
                <label for="nevari_subscription_checkout_link"><strong><?php esc_html_e('Checkout link', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_checkout_link" name="nevari_subscription_checkout_link" type="url" class="widefat" value="<?php echo esc_attr($checkout_link); ?>" placeholder="<?php echo esc_attr(self::default_checkout_link()); ?>" readonly>
                <span class="description"><?php esc_html_e('This deep link is the canonical Elementor button target for subscription checkout.', 'nevari-pharmacy-core'); ?></span>
            </p>
        </div>`,
    "subscription readonly meta box"
  );
  return next;
});

update("nevari-pharmacy-core/includes/class-nevari-sso.php", (text) => replaceOne(
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
  "sso preferred display name"
));

update("nevari-pharmacy-core/includes/class-nevari-auth.php", (text) => {
  let next = text;
  next = replaceOne(next,
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
    "auth confirm route");
  next = replaceOne(next,
    `            $given_name = sanitize_text_field((string) ($google_payload['given_name'] ?? ''));
            $family_name = sanitize_text_field((string) ($google_payload['family_name'] ?? ''));
            $display_name = sanitize_text_field((string) ($google_payload['name'] ?? trim($given_name . ' ' . $family_name)));
            if ($display_name === '') {
                $display_name = preg_replace('/@.+$/', '', $email);
            }`,
    `            $given_name = sanitize_text_field((string) ($google_payload['given_name'] ?? ''));
            $family_name = sanitize_text_field((string) ($google_payload['family_name'] ?? ''));
            $display_name = self::preferred_customer_display_name($given_name, $family_name, $email);`,
    "auth google display name");
  next = replaceRegex(next,
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
                self::send_dashboard_password_reset_email($reset_user, self::dashboard_password_reset_url($frontend, $reset_user, (string) $reset_key));
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
    "auth password reset methods");
  next = replaceOne(next,
    `        $display_name = trim($first_name . ' ' . $last_name);

        if (!$email || !is_email($email) || !$display_name || strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'Valid name, email, and password with at least 8 characters are required.', 422);
        }`,
    `        $display_name = self::preferred_customer_display_name($first_name, $last_name, $email);

        if (!$email || !is_email($email) || strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'A valid email and an 8+ character password are required.', 422);
        }`,
    "auth register validation");
  next = replaceOne(next,
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
        return $origin . '/reset-password?' . http_build_query([
            'login' => $user->user_login,
            'key' => $reset_key,
        ]);
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
            'body_text' => sprintf("Hello %1$s,\\n\\nUse this link to reset your password:\\n%2$s\\n\\nIf you did not request this, you can ignore this email.", $display_name, $reset_url),
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
    "auth helper block");
  next = replaceOne(next,
    `        if ($name !== '' && in_array(strtolower(trim((string) $user->display_name)), ['', 'customer'], true)) {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $name]);
        }`,
    `        $preferred_display_name = self::preferred_customer_display_name($given_name, $family_name, (string) $user->user_email);
        if ($preferred_display_name !== '' && in_array(strtolower(trim((string) $user->display_name)), ['', 'customer'], true)) {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $preferred_display_name]);
        } elseif ($name !== '' && trim((string) $user->display_name) === '') {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $name]);
        }`,
    "auth google profile display name");
  return next;
});

update("NevariAdmin Storefront/app/_customer-dashboard.js", (text) => {
  let next = text;
  next = replaceOne(next,
    `import { fetchCustomerIvTherapyRequests, fetchCustomerMtmRequests, fetchCustomerNurseRequests, normalizeCustomerSettingsPayload, requestMtmReschedule, resolveSubscriptionMonthlyAmount, submitCustomerIvTherapyRequest, submitCustomerMtmRequest, updateCustomerSettings, uploadCustomerProfileImage } from "./lib/nevari-api";`,
    `import { fetchCustomerIvTherapyRequests, fetchCustomerMtmRequests, fetchCustomerNurseRequests, normalizeCustomerSettingsPayload, requestMtmReschedule, resolveSubscriptionMonthlyAmount, submitCustomerIvTherapyRequest, submitCustomerMtmRequest, updateCustomerSettings, uploadCustomerProfileImage } from "./lib/nevari-api";
import { citiesForNigeriaState, NIGERIA_STATES } from "./lib/nigeria-locations";`,
    "dashboard nigeria import");
  next = replaceOne(next, "const PAYWALL_PRO_MONTHLY_AMOUNT = 10_000;", "const PAYWALL_PRO_MONTHLY_AMOUNT = 5_000;", "dashboard pro amount");
  next = replaceOne(next, `"Weight Management Drips Assistance",`, `"Weight Management",`, "dashboard iv option");
  next = replaceOne(next, `"iv-therapy": "IV Therapy"`, `"iv-therapy": "IV Therapy (Wellness infusions)"`, "dashboard iv label");
  next = replaceOne(next,
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
    "dashboard iv initial state");
  next = replaceOne(next,
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
    "dashboard customer preferred name");
  next = replaceOne(next,
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
  return [String(city || "").trim(), String(state || "").trim()].filter(Boolean).join(", ");
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
    "dashboard iv helpers");
  next = replaceOne(next,
    `    if (!String(patient.address || "").trim()) errors.address = "Address is required.";
    if (!String(patient.cityState || "").trim()) errors.cityState = "City/State is required.";
    if (!/^[0-9+\\-()\\s]{7,24}$/.test(String(patient.phoneNumber || "").trim())) errors.phoneNumber = "Enter a valid phone number.";`,
    `    if (!String(patient.address || "").trim()) errors.address = "Address is required.";
    if (!String(patient.state || "").trim()) errors.state = "State is required.";
    if (!String(patient.city || "").trim()) errors.city = "City is required.";
    if (!/^[0-9+\\-()\\s]{7,24}$/.test(String(patient.phoneNumber || "").trim())) errors.phoneNumber = "Enter a valid phone number.";`,
    "dashboard iv step1 validation");
  next = replaceOne(next,
    `  const ivTherapyStepErrors = buildIvTherapyStepErrors(ivTherapyStep, ivTherapyForm);
  const showIvTherapyFieldError = (key) => Boolean(ivTherapyStepErrors[key]) && ivTherapyShowErrors;

  async function handleIvTherapyContinue() {`,
    `  const ivTherapyStepErrors = buildIvTherapyStepErrors(ivTherapyStep, ivTherapyForm);
  const showIvTherapyFieldError = (key) => Boolean(ivTherapyStepErrors[key]) && ivTherapyShowErrors;
  const ivTherapyAvailableCities = useMemo(() => citiesForNigeriaState(ivTherapyForm.patient.state), [ivTherapyForm.patient.state]);

  async function handleIvTherapyContinue() {`,
    "dashboard iv cities");
  next = replaceOne(next,
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
    "dashboard iv submit");
  next = replaceOne(next,
    `        {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>IV Therapy</h1>
        </header> : renderHeader("IV Therapy")}`,
    `        {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>IV Therapy (Wellness infusions)</h1>
        </header> : renderHeader("IV Therapy (Wellness infusions)")}`,
    "dashboard iv header");
  next = replaceOne(next,
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
    "dashboard iv step1 form");
  next = replaceOne(next,
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
    "dashboard nurse final submit");
  return next;
});

update("NevariAdmin Storefront/app/globals.css", (text) => {
  let next = text;
  next = replaceOne(next,
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
    "globals modal shell");
  next = replaceOne(next,
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
    "globals modal mobile");
  return next;
});

write("NevariAdmin Storefront/app/reset-password/page-client.js", resetPasswordPageClient(), "\n");
write("NevariAdmin Storefront/app/reset-password/page.js", resetPasswordPage(), "\n");

console.log("Remaining dashboard fixes applied.");
