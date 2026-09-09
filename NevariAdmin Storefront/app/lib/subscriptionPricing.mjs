function readFiniteAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function planAmount(plan = {}) {
  for (const value of [plan?.price, plan?.amount, plan?.amount_ngn, plan?.plan_amount, plan?.planAmount]) {
    const amount = readFiniteAmount(value);
    if (amount != null) {
      return amount;
    }
  }
  return null;
}

export function resolveAvailablePaidPlan(subscription = {}) {
  const upgradePlan = subscription?.upgrade_plan && typeof subscription.upgrade_plan === "object"
    ? subscription.upgrade_plan
    : subscription?.upgradePlan && typeof subscription.upgradePlan === "object"
      ? subscription.upgradePlan
      : null;
  const availablePlans = Array.isArray(subscription?.available_plans)
    ? subscription.available_plans
    : Array.isArray(subscription?.availablePlans)
      ? subscription.availablePlans
      : Array.isArray(subscription?.plans)
        ? subscription.plans
        : [];
  const plans = upgradePlan ? [upgradePlan, ...availablePlans] : availablePlans;
  const requestedKey = String(subscription?.requested_plan_key || "nevari_access_pro").trim().toLowerCase();
  const isPaid = (plan) => Number(planAmount(plan) || 0) > 0;

  return plans.find((plan) => String(plan?.plan_key || plan?.planKey || "").trim().toLowerCase() === requestedKey && isPaid(plan))
    || plans.find((plan) => String(plan?.tier || "").trim().toLowerCase() === "pro" && isPaid(plan))
    || plans.find(isPaid)
    || null;
}

export function resolveSubscriptionBaseAmount(subscription = {}) {
  const availablePaidPlan = resolveAvailablePaidPlan(subscription);
  const latestSubscription = subscription?.latest_subscription && typeof subscription.latest_subscription === "object"
    ? subscription.latest_subscription
    : null;
  const candidates = [
    subscription?.amount,
    subscription?.amount_ngn,
    subscription?.plan_amount,
    subscription?.planAmount,
    latestSubscription?.amount,
    latestSubscription?.amount_ngn,
    latestSubscription?.plan_amount,
    latestSubscription?.planAmount,
  ];

  for (const value of candidates) {
    const amount = readFiniteAmount(value);
    if (amount == null) {
      continue;
    }
    if (amount > 0) {
      return amount;
    }
    const upgradeAmount = planAmount(availablePaidPlan);
    return upgradeAmount != null ? upgradeAmount : 0;
  }

  return planAmount(availablePaidPlan) || 0;
}

export function resolveSubscriptionMonthlyAmount(subscription = {}) {
  const latestSubscription = subscription?.latest_subscription && typeof subscription.latest_subscription === "object"
    ? subscription.latest_subscription
    : null;
  const monthlyCandidates = [
    subscription?.monthlyEquivalent,
    subscription?.monthly_equivalent,
    subscription?.monthly_equivalent_amount,
    subscription?.monthlyEquivalentAmount,
    latestSubscription?.monthlyEquivalent,
    latestSubscription?.monthly_equivalent,
    latestSubscription?.monthly_equivalent_amount,
    latestSubscription?.monthlyEquivalentAmount,
  ];

  for (const value of monthlyCandidates) {
    const amount = readFiniteAmount(value);
    if (amount != null && amount > 0) {
      return amount;
    }
  }

  const paidPlan = resolveAvailablePaidPlan(subscription);
  const frequency = String(
    paidPlan?.interval
    || paidPlan?.frequency
    || subscription?.frequency
    || subscription?.interval
    || "monthly"
  ).trim().toLowerCase();
  const baseAmount = resolveSubscriptionBaseAmount(subscription);
  return ["yearly", "year"].includes(frequency) && baseAmount > 0 ? baseAmount / 12 : baseAmount;
}
