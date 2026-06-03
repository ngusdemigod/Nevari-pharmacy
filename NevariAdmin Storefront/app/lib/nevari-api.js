"use client";

import { apiRequest } from "../components/role-dashboard-utils";

const STORAGE_PREFIX = "nevari_subscription_state";

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${String(userId || "guest")}`;
}

export function defaultSubscriptionState() {
  return {
    plan: "Free",
    plan_key: "free",
    status: "free",
    frequency: "free",
    renewal_date: "",
    next_payment_date: null,
    accessEndsAt: null,
    amount: 0,
    currency: "NGN",
    interval: "month",
    monthlyEquivalent: 0,
    paystack_subscription_code: "",
    paystackSubscriptionCodeAvailable: false,
    entitlements: [],
    manage_billing_url: "",
    subscription_code_masked: "",
  };
}

export function maskSubscriptionCode(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= 8) {
    return raw;
  }
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export function normalizeSubscriptionPayload(payload = {}) {
  const base = defaultSubscriptionState();
  const entitlements = Array.isArray(payload.entitlements)
    ? payload.entitlements.map((value) => String(value || "").trim()).filter(Boolean)
    : base.entitlements;
  const code = String(payload.paystack_subscription_code || payload.subscription_code || "").trim();
  const status = String(payload.status || base.status || "free").trim().toLowerCase();
  const frequency = String(payload.frequency || payload.interval || (status === "free" ? "free" : "monthly")).trim().toLowerCase();
  const amount = Number(payload.amount ?? (status === "free" ? 0 : base.amount));
  const monthlyEquivalent = Number(
    payload.monthlyEquivalent
    ?? payload.monthly_equivalent
    ?? payload.monthly_equivalent_amount
    ?? (frequency === "yearly" && Number.isFinite(amount) ? amount / 12 : amount)
    ?? 0
  );
  const nextPaymentDate = payload.nextPaymentDate
    ?? payload.next_payment_date
    ?? payload.renewal_date
    ?? null;
  const accessEndsAt = payload.accessEndsAt
    ?? payload.access_ends_at
    ?? payload.ends_at
    ?? null;
  return {
    ...base,
    ...payload,
    plan: String(payload.plan || (status === "free" ? "Free" : "Pro")),
    plan_key: String(payload.plan_key || (status === "free" ? "free" : "pro")),
    status,
    frequency,
    amount: Number.isFinite(amount) ? amount : base.amount,
    monthlyEquivalent: Number.isFinite(monthlyEquivalent) ? monthlyEquivalent : base.monthlyEquivalent,
    next_payment_date: nextPaymentDate,
    nextPaymentDate,
    accessEndsAt,
    entitlements,
    paystack_subscription_code: code,
    subscription_code_masked: payload.subscription_code_masked || maskSubscriptionCode(code),
    paystackSubscriptionCodeAvailable: Boolean(payload.paystackSubscriptionCodeAvailable ?? payload.paystack_subscription_code_available ?? code),
  };
}

export function readStoredSubscription(userId) {
  if (typeof window === "undefined") {
    return defaultSubscriptionState();
  }
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) {
      return defaultSubscriptionState();
    }
    return normalizeSubscriptionPayload(JSON.parse(raw));
  } catch {
    return defaultSubscriptionState();
  }
}

export function persistSubscription(userId, payload) {
  if (typeof window === "undefined") {
    return normalizeSubscriptionPayload(payload);
  }
  const normalized = normalizeSubscriptionPayload(payload);
  window.localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  return normalized;
}

export async function fetchCurrentSubscription(session) {
  const payload = await apiRequest(session, "/subscriptions/me", { suppressHttpError: true });
  if (!payload) {
    return readStoredSubscription(session?.user?.id);
  }
  return persistSubscription(session?.user?.id, payload);
}

export async function initializeSubscription(session, { plan = "pro", frequency = "monthly", callbackUrl = "" } = {}) {
  const body = {
    plan,
    frequency,
    callback_url: callbackUrl,
  };
  return apiRequest(session, "/subscriptions/initialize", { method: "POST", body });
}

export async function verifySubscription(session, reference) {
  const payload = await apiRequest(session, "/subscriptions/verify", {
    method: "POST",
    body: { reference },
  });
  return persistSubscription(session?.user?.id, payload || {});
}

export async function cancelSubscription(session) {
  const payload = await apiRequest(session, "/subscriptions/cancel", {
    method: "POST",
    body: {},
  });
  return persistSubscription(session?.user?.id, payload || {});
}

export function hasActiveSubscription(subscription) {
  const status = String(subscription?.status || "").toLowerCase();
  return status === "active" || status === "trialing";
}

export function hasEntitlement(subscription, entitlement) {
  const required = String(entitlement || "").trim();
  if (!required) {
    return true;
  }
  const entitlements = Array.isArray(subscription?.entitlements) ? subscription.entitlements : [];
  return entitlements.includes(required);
}
