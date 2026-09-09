import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dashboardSource = fs.readFileSync(path.join(projectRoot, "app", "_customer-dashboard.js"), "utf8");
const apiSource = fs.readFileSync(path.join(projectRoot, "app", "lib", "nevari-api.js"), "utf8");

test("profile hydration treats the server as authoritative", () => {
  assert.match(dashboardSource, /await fetchCustomerSettings\(session\)/);
  assert.doesNotMatch(dashboardSource, /Object\.keys\(storedSettingsPayload\).*mergedSettings/s);
});

test("profile API reads and writes fail visibly", () => {
  const fetchSettingsApi = apiSource.slice(
    apiSource.indexOf("export async function fetchCustomerSettings"),
    apiSource.indexOf("export async function fetchCustomerSearch"),
  );
  const updateSettingsApi = apiSource.slice(
    apiSource.indexOf("export async function updateCustomerSettings"),
    apiSource.indexOf("export async function uploadCustomerProfileImage"),
  );
  assert.doesNotMatch(fetchSettingsApi, /suppressHttpError/);
  assert.doesNotMatch(updateSettingsApi, /suppressHttpError/);
  assert.doesNotMatch(updateSettingsApi, /payload \|\| normalizedBody/);
});

test("account email is read-only in both patient profile layouts", () => {
  const lockedEmailInputs = dashboardSource.match(/<input type="email"[^>]*readOnly[^>]*aria-readonly="true"[^>]*\/>/g) || [];
  assert.equal(lockedEmailInputs.length, 2);
});

test("patient display names permit spaces", () => {
  assert.match(dashboardSource, /\^\[a-zA-Z\\s'/);
});

test("appointment confirmation closes from the backdrop and Escape key", () => {
  const confirmationPage = dashboardSource.slice(
    dashboardSource.indexOf("function ConfirmationPage"),
    dashboardSource.indexOf("function PatientReviewsPage"),
  );
  assert.match(confirmationPage, /customer-appointment-confirmation-modal[^>]+onClick=\{onBack\}/);
  assert.match(confirmationPage, /customer-flow-status-card-confirmed[\s\S]+event\.stopPropagation\(\)/);
  assert.match(confirmationPage, /event\.key === "Escape"/);
});

test("profile photo success requires a server-owned avatar URL", () => {
  const uploadFlow = dashboardSource.slice(
    dashboardSource.indexOf("async function handleProfileImageSelected"),
    dashboardSource.indexOf("useEffect(() =>", dashboardSource.indexOf("async function handleProfileImageSelected")),
  );
  assert.match(uploadFlow, /result\?\.profile_image/);
  assert.match(uploadFlow, /result\?\.profile\?\.avatar_url/);
  assert.match(uploadFlow, /if \(!uploadedAvatarUrl\)/);
  assert.match(uploadFlow, /server accepted the image but did not return the saved profile photo/i);
});
