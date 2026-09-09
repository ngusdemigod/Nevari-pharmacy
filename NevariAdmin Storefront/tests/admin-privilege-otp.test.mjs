import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "app", "admin", "storefront", "page.js"), "utf8");
const privilegeDialog = source.slice(
  source.indexOf("customerPrivilegeEscalationOpen ?"),
  source.indexOf("{categoryCreateOpen ?"),
);

test("role-upgrade OTP uses six directly editable inputs", () => {
  assert.doesNotMatch(privilegeDialog, /auth-otp-hidden-input/);
  assert.match(privilegeDialog, /ref=\{\(element\).*customerPrivilegeOtpInputRef\.current\[index\]/s);
  assert.match(privilegeDialog, /onChange=\{\(event\) => updateCustomerPrivilegeOtpDigit/);
});

test("role-upgrade OTP supports paste and keyboard navigation", () => {
  assert.match(privilegeDialog, /onPaste=/);
  assert.match(source, /event\.key === "Backspace"/);
  assert.match(source, /event\.key === "ArrowLeft"/);
  assert.match(source, /event\.key === "ArrowRight"/);
});

test("subscription OTP uses six directly editable inputs", () => {
  const subscriptionDialog = source.slice(
    source.indexOf("subscription-protection-backdrop"),
    source.indexOf("return (", source.indexOf("subscription-protection-backdrop")),
  );
  assert.doesNotMatch(subscriptionDialog, /subscription-otp-hidden-input/);
  assert.match(subscriptionDialog, /subscriptionOtpInputRef\.current\[index\]/);
  assert.match(subscriptionDialog, /updateSubscriptionOtpDigit\(index/);
  assert.match(subscriptionDialog, /onPaste=/);
});
