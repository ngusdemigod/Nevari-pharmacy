import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const recaptchaClient = read("app/lib/recaptcha-client.js");
const proxy = read("app/api/nevari-proxy/route.js");
const login = read("app/components/RoleLoginPage.js");
const customerDashboard = read("app/_customer-dashboard.js");
const phpAuth = read("../nevari-pharmacy-core/includes/class-nevari-auth.php");
const phpRest = read("../nevari-pharmacy-core/includes/class-nevari-rest.php");

assert.match(recaptchaClient, /NEXT_PUBLIC_RECAPTCHA_LOCAL_BYPASS_ENABLED === "true"/);
assert.match(recaptchaClient, /process\.env\.NODE_ENV === "production"/);
assert.match(proxy, /RECAPTCHA_LOCAL_BYPASS_ENABLED !== "true"/);
assert.match(proxy, /!String\(process\.env\.RECAPTCHA_SECRET_KEY/);
assert.match(login, /response\?\.status === 401 \|\| response\?\.status === 403/);
assert.match(phpAuth, /global_two_step_verification_enabled\(\) \|\| \$frontend_type === 'storefront'/);
assert.match(phpAuth, /get_option\('nevari_global_two_step_verification', true\)/);
assert.match(phpAuth, /customer_two_factor_enabled\(\(int\) \$user->ID\)/);
assert.match(phpAuth, /auth_verify_challenge', 5, 15 \* MINUTE_IN_SECONDS/);
assert.match(phpAuth, /10 \* MINUTE_IN_SECONDS/);
assert.match(phpAuth, /create_purpose_challenge/);
assert.match(phpAuth, /verify_purpose_challenge/);
assert.match(phpAuth, /\['enable_2fa', 'disable_2fa'\]/);
assert.match(phpAuth, /attempts >= 5/);
assert.match(phpRest, /settings\/two-factor\/begin/);
assert.match(phpRest, /settings\/two-factor\/confirm/);
assert.match(phpRest, /two_factor_verification_required/);
assert.match(phpRest, /current_session_family_uuid/);
assert.match(phpRest, /revoke_session_family/);
assert.match(customerDashboard, /TwoFactorVerificationControl/);
assert.match(customerDashboard, /aria-modal="true"/);
assert.match(customerDashboard, /autoComplete="one-time-code"/);
assert.doesNotMatch(customerDashboard, /SettingsToggle label="Two-factor authentication"/);

console.log("Auth security contract checks passed.");
