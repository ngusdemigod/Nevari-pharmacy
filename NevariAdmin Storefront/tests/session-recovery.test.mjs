import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  ensureIdempotencyKey,
  isRecoverableClinicalMutation,
  shouldRecoverMutation,
  validIdempotencyKey,
} from "../app/lib/session-recovery.mjs";

test("only allowlists POST IV therapy and Nurse submissions", () => {
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/iv-therapy", "POST"), true);
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/nurse-requests", "POST"), true);
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/iv-therapy", "GET"), false);
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/nurse-requests", "GET"), false);
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/appointments/book", "POST"), false);
});

test("keeps one valid idempotency key across attempts", () => {
  const initial = ensureIdempotencyKey({}, () => "clinical-request-1234567890");
  const retry = ensureIdempotencyKey(initial, () => "must-not-replace-123456");
  assert.equal(initial.get("Idempotency-Key"), "clinical-request-1234567890");
  assert.equal(retry.get("Idempotency-Key"), "clinical-request-1234567890");
  assert.equal(validIdempotencyKey(retry.get("Idempotency-Key")), true);
});

test("permits one recovery only after a 401", () => {
  const requestUrl = "http://localhost:3002/api/customer/iv-therapy";
  assert.equal(shouldRecoverMutation({ responseStatus: 401, requestUrl, method: "POST", retryCount: 0 }), true);
  assert.equal(shouldRecoverMutation({ responseStatus: 401, requestUrl, method: "POST", retryCount: 1 }), false);
  assert.equal(shouldRecoverMutation({ responseStatus: 500, requestUrl, method: "POST", retryCount: 0 }), false);
  assert.equal(shouldRecoverMutation({ responseStatus: 401, requestUrl: "http://localhost:3002/api/customer/nurse-requests", method: "POST", retryCount: 0 }), true);
});

test("authenticated clinical submissions are not blocked by public CAPTCHA", () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const providerSource = fs.readFileSync(path.join(projectRoot, "app", "components", "AppProviders.js"), "utf8");
  assert.match(providerSource, /const requiresPublicCaptcha =/);
  assert.match(providerSource, /requiresPublicCaptcha && !headers\.has\("x-nevari-recaptcha-token"\)/);
  assert.doesNotMatch(providerSource, /\(!csrf \|\| isLocalDevelopment\(\)\)/);
});
