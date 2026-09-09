import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("session reauthentication links open their intended auth views", () => {
  const modal = read("../app/components/SessionReauthModal.js");
  const login = read("../app/components/RoleLoginPage.js");
  assert.match(modal, /view=reset/);
  assert.match(modal, /view=register/);
  assert.match(login, /requestedView === "reset"/);
  assert.match(login, /requestedView === "register" && config\.allowRegistration/);
});

test("login OTP uses six directly editable inputs with paste and keyboard navigation", () => {
  const login = read("../app/components/RoleLoginPage.js");
  assert.match(login, /verificationInputRef = useRef\(\[\]\)/);
  assert.match(login, /updateVerificationDigit/);
  assert.match(login, /handleVerificationKeyDown/);
  assert.match(login, /onPaste=/);
  assert.doesNotMatch(login, /className="auth-otp-hidden-input"/);
});

test("clinical server routes forward the authenticated cookie and CSRF pair", () => {
  const server = read("../app/api/mtm/_server.js");
  assert.match(server, /csrfToken: requestCookie\(request, "nevari_csrf"\)/);
  assert.match(server, /Cookie: `\$\{sessionCookie\}\$\{csrfCookie\}`/);
  assert.match(server, /"X-Nevari-CSRF": session\.csrfToken/);
});

test("appointment outages never report an unpersisted local success", () => {
  const route = read("../app/api/customer/appointments/book/route.js");
  assert.doesNotMatch(route, /added locally as pending sync/);
  assert.match(route, /Your appointment was not booked/);
  assert.match(route, /status: 503/);
});

test("clinical plugin sanitizers preserve validated camelCase field names", () => {
  const iv = read("../../nevari-pharmacy-core/includes/class-nevari-iv-therapy.php");
  const mtm = read("../../nevari-pharmacy-core/includes/class-nevari-mtm.php");
  for (const source of [iv, mtm]) {
    assert.match(source, /preg_replace\('\s*\/\[\^A-Za-z0-9_\\-\]\//);
    assert.doesNotMatch(source.match(/private static function sanitize_deep[\s\S]*?\n    }/)?.[0] || "", /sanitize_key/);
  }
});
