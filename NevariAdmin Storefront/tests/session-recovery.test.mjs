import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureIdempotencyKey,
  isRecoverableClinicalMutation,
  shouldRecoverMutation,
  validIdempotencyKey,
} from "../app/lib/session-recovery.mjs";

test("only allowlists POST IV therapy submissions", () => {
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/iv-therapy", "POST"), true);
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/iv-therapy", "GET"), false);
  assert.equal(isRecoverableClinicalMutation("http://localhost:3002/api/customer/nurse-requests", "POST"), false);
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
});
