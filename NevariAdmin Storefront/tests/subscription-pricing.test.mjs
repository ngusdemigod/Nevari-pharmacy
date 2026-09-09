import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAvailablePaidPlan,
  resolveSubscriptionBaseAmount,
  resolveSubscriptionMonthlyAmount,
} from "../app/lib/subscriptionPricing.mjs";

test("uses the explicit server-owned upgrade plan for a free patient", () => {
  const subscription = {
    status: "free",
    amount: 0,
    upgrade_plan: {
      plan_key: "nevari_access_pro",
      price: 5000,
      currency: "NGN",
      interval: "monthly",
      tier: "pro",
    },
  };

  assert.equal(resolveSubscriptionBaseAmount(subscription), 5000);
  assert.equal(resolveSubscriptionMonthlyAmount(subscription), 5000);
});

test("supports the existing available_plans response contract", () => {
  const subscription = {
    status: "none",
    amount: 0,
    available_plans: [
      { plan_key: "free", price: 0, tier: "free" },
      { plan_key: "nevari_access_pro", price: 6000, tier: "pro", interval: "monthly" },
    ],
  };

  assert.equal(resolveAvailablePaidPlan(subscription)?.plan_key, "nevari_access_pro");
  assert.equal(resolveSubscriptionMonthlyAmount(subscription), 6000);
});

test("supports compatible plan lists without accepting an invalid amount", () => {
  const subscription = {
    amount: 0,
    plans: [
      { planKey: "invalid", amount: "not-a-number" },
      { planKey: "paid", amount: 72000, interval: "yearly" },
    ],
  };

  assert.equal(resolveSubscriptionMonthlyAmount(subscription), 6000);
});

test("returns zero when the server provides no valid paid price", () => {
  assert.equal(resolveSubscriptionMonthlyAmount({ amount: 0, available_plans: [] }), 0);
  assert.equal(resolveSubscriptionMonthlyAmount({ upgrade_plan: { price: -1 } }), 0);
});
