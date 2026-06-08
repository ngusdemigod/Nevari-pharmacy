"use client";

import { apiRequest } from "../components/role-dashboard-utils";
import { bytesToBase64, generateBrowserMtmPdf } from "./mtmPdfBrowser";

const STORAGE_PREFIX = "nevari_subscription_state";
const SUBSCRIPTION_UI_CACHE_TTL_MS = 10 * 60 * 1000;

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
    free_consultations_total: 0,
    free_consultations_used: 0,
    free_consultations_remaining: 0,
    free_consultations_reset_at: null,
    free_consultations_reset_label: "",
    amount: 0,
    currency: "NGN",
    interval: "month",
    monthlyEquivalent: 0,
    paystack_subscription_code: "",
    paystack_email_token: "",
    paystackSubscriptionCodeAvailable: false,
    is_paid: false,
    isPaid: false,
    can_access_therapy_management: false,
    canAccessTherapyManagement: false,
    can_refill: false,
    canRefill: false,
    protected_features: {
      therapy_management: false,
      refills: false,
    },
    entitlements: [],
    manage_billing_url: "",
    checkout_url: "",
    authorization_url: "",
    checkout_expires_at: "",
    checkoutExpiresAt: "",
    checkout_link: "",
    active_subscriptions: [],
    latest_subscription: null,
    subscription_code_masked: "",
    subscription_cache_saved_at: 0,
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
  const activeSubscriptions = Array.isArray(payload.active_subscriptions)
    ? payload.active_subscriptions
    : [];
  const latestSubscription = payload.latest_subscription && typeof payload.latest_subscription === "object"
    ? payload.latest_subscription
    : activeSubscriptions[0] || null;
  const entitlements = Array.isArray(payload.entitlements)
    ? payload.entitlements.map((value) => String(value || "").trim()).filter(Boolean)
    : base.entitlements;
  const code = String(payload.paystack_subscription_code || payload.subscription_code || latestSubscription?.paystack_subscription_code || "").trim();
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
    ?? latestSubscription?.ends_at
    ?? null;
  const freeConsultationsTotal = Number(payload.free_consultations_total ?? base.free_consultations_total ?? 0);
  const freeConsultationsUsed = Number(payload.free_consultations_used ?? base.free_consultations_used ?? 0);
  const freeConsultationsRemaining = Number(payload.free_consultations_remaining ?? base.free_consultations_remaining ?? 0);
  const freeConsultationsResetAt = payload.free_consultations_reset_at
    ?? payload.freeConsultationsResetAt
    ?? null;
  const freeConsultationsResetLabel = String(
    payload.free_consultations_reset_label
    || payload.freeConsultationsResetLabel
    || ""
  ).trim();
  const checkoutUrl = String(
    payload.checkout_url
    || payload.authorization_url
    || payload.authorizationUrl
    || latestSubscription?.checkout_url
    || latestSubscription?.authorization_url
    || ""
  ).trim();
  const checkoutExpiresAt = String(
    payload.checkout_expires_at
    || payload.checkoutExpiresAt
    || latestSubscription?.checkout_expires_at
    || latestSubscription?.checkoutExpiresAt
    || ""
  ).trim();
  const manageBillingUrl = String(payload.manage_billing_url || latestSubscription?.manage_billing_url || "").trim();
  const protectedFeatures = payload.protected_features && typeof payload.protected_features === "object"
    ? payload.protected_features
    : {};
  const isPaid = Boolean(payload.is_paid ?? payload.isPaid ?? protectedFeatures.therapy_management ?? false);
  const canAccessTherapyManagement = Boolean(
    payload.can_access_therapy_management
    ?? payload.canAccessTherapyManagement
    ?? protectedFeatures.therapy_management
    ?? isPaid
  );
  const canRefill = Boolean(
    payload.can_refill
    ?? payload.canRefill
    ?? protectedFeatures.refills
    ?? isPaid
  );
  const normalizedEntitlements = new Set(entitlements);
  if (canAccessTherapyManagement) {
    normalizedEntitlements.add("therapy_management");
  }
  if (canRefill) {
    normalizedEntitlements.add("refills");
  }
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
    access_ends_at: accessEndsAt,
    free_consultations_total: Number.isFinite(freeConsultationsTotal) ? freeConsultationsTotal : base.free_consultations_total,
    free_consultations_used: Number.isFinite(freeConsultationsUsed) ? freeConsultationsUsed : base.free_consultations_used,
    free_consultations_remaining: Number.isFinite(freeConsultationsRemaining) ? freeConsultationsRemaining : base.free_consultations_remaining,
    free_consultations_reset_at: freeConsultationsResetAt,
    free_consultations_reset_label: freeConsultationsResetLabel,
    is_paid: isPaid,
    isPaid,
    can_access_therapy_management: canAccessTherapyManagement,
    canAccessTherapyManagement,
    can_refill: canRefill,
    canRefill,
    protected_features: {
      ...protectedFeatures,
      therapy_management: canAccessTherapyManagement,
      refills: canRefill,
    },
    entitlements: Array.from(normalizedEntitlements),
    active_subscriptions: activeSubscriptions,
    latest_subscription: latestSubscription,
    checkout_url: checkoutUrl,
    authorization_url: checkoutUrl || String(payload.authorization_url || "").trim(),
    checkout_expires_at: checkoutExpiresAt,
    checkoutExpiresAt,
    checkout_link: String(payload.checkout_link || checkoutUrl || "").trim(),
    manage_billing_url: manageBillingUrl,
    paystack_subscription_code: code,
    paystack_email_token: String(payload.paystack_email_token || latestSubscription?.paystack_email_token || "").trim(),
    subscription_code_masked: payload.subscription_code_masked || maskSubscriptionCode(code),
    paystackSubscriptionCodeAvailable: Boolean(payload.paystackSubscriptionCodeAvailable ?? payload.paystack_subscription_code_available ?? code),
    subscription_cache_saved_at: Number(payload.subscription_cache_saved_at || payload.subscriptionCacheSavedAt || 0),
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
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.subscription_cache_saved_at || parsed?.subscriptionCacheSavedAt || 0);
    if (savedAt <= 0 || Date.now() - savedAt > SUBSCRIPTION_UI_CACHE_TTL_MS) {
      return defaultSubscriptionState();
    }
    return normalizeSubscriptionPayload(parsed);
  } catch {
    return defaultSubscriptionState();
  }
}

export function persistSubscription(userId, payload) {
  if (typeof window === "undefined") {
    return normalizeSubscriptionPayload(payload);
  }
  const normalized = normalizeSubscriptionPayload({
    ...payload,
    subscription_cache_saved_at: Date.now(),
  });
  window.localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  return normalized;
}

export async function fetchCurrentSubscription(session) {
  const payload = await apiRequest(session, "/subscriptions/me", { suppressHttpError: true });
  if (!payload) {
    return defaultSubscriptionState();
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

export async function fetchCustomerMtmRequests(session) {
  const payload = await apiRequest(session, "/mtm-requests", { suppressHttpError: true });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function fetchMtmRequest(session, id) {
  const payload = await apiRequest(session, `/mtm-requests/${id}`, { suppressHttpError: true });
  return payload?.request || null;
}

export async function createMtmRequest(session, body) {
  const payload = await apiRequest(session, "/mtm-requests", {
    method: "POST",
    body,
  });
  return payload?.request || null;
}

async function parseLocalMtmResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || fallbackMessage);
  }
  return payload?.data || {};
}

export async function submitCustomerMtmRequest(session, body) {
  const params = new URLSearchParams({
    baseUrl: String(session?.baseUrl || ""),
    frontendType: String(session?.frontendType || "patient"),
  });
  const requestHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Nevari-Frontend-Type": session?.frontendType || "patient",
    "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
  };

  const createResponse = await fetch(`/api/mtm/submit?${params.toString()}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
  const createPayload = await parseLocalMtmResponse(createResponse, "Unable to submit the MTM request.");
  const createdRequest = createPayload?.request || null;
  const pdfSnapshot = createPayload?.pdf_snapshot || null;
  if (!createdRequest?.id || !pdfSnapshot?.token || !pdfSnapshot?.fingerprint) {
    throw new Error("MTM request snapshot could not be created.");
  }

  const pdfBytes = await generateBrowserMtmPdf(createdRequest);
  const uploadResponse = await fetch(`/api/mtm/${encodeURIComponent(String(createdRequest.id))}/submission-pdf?${params.toString()}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({
      base64: bytesToBase64(pdfBytes),
      fingerprint: pdfSnapshot.fingerprint,
      snapshotToken: pdfSnapshot.token,
    }),
  });
  const uploadPayload = await parseLocalMtmResponse(uploadResponse, "Unable to verify the MTM PDF upload.");
  return uploadPayload?.request || createdRequest;
}

export async function requestMtmReschedule(session, id) {
  const payload = await apiRequest(session, `/mtm-requests/${id}/reschedule`, {
    method: "POST",
    body: {},
  });
  return payload?.request || null;
}

export async function fetchDoctorMtmRequests(session) {
  const payload = await apiRequest(session, "/doctor/mtm-requests", { suppressHttpError: true });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function fetchDoctorMtmRequest(session, id) {
  const payload = await apiRequest(session, `/doctor/mtm-requests/${id}`, { suppressHttpError: true });
  return payload?.request || null;
}

export async function updateDoctorMtmRequest(session, id, action, body = {}) {
  const payload = await apiRequest(session, `/doctor/mtm-requests/${id}/${action}`, {
    method: "POST",
    body,
  });
  return payload?.request || null;
}

export async function saveMtmActionPlan(session, id, body = {}) {
  const payload = await apiRequest(session, `/doctor/mtm-requests/${id}/action-plan`, {
    method: "POST",
    body,
  });
  return payload?.request || null;
}

export async function fetchPharmacistMtmRequests(session) {
  const payload = await apiRequest(session, "/pharmacist/mtm-requests", { suppressHttpError: true });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function fetchPharmacistMtmRequest(session, id) {
  const payload = await apiRequest(session, `/pharmacist/mtm-requests/${id}`, { suppressHttpError: true });
  return payload?.request || null;
}

export async function updatePharmacistMtmRequest(session, id, action, body = {}) {
  const payload = await apiRequest(session, `/pharmacist/mtm-requests/${id}/${action}`, {
    method: "POST",
    body,
  });
  return payload?.request || null;
}

export async function approvePharmacistMtmRequest(session, id) {
  const params = new URLSearchParams({
    baseUrl: String(session?.baseUrl || ""),
    frontendType: String(session?.frontendType || "pharmacist_dashboard"),
  });
  const response = await fetch(`/api/pharmacist/mtm/${encodeURIComponent(String(id || ""))}/approve?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Nevari-Frontend-Type": session?.frontendType || "pharmacist_dashboard",
      "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "Unable to approve the MTM request.");
  }
  return payload?.data?.request || null;
}

export async function fetchPharmacistProducts(session, search = "") {
  const payload = await apiRequest(session, "/pharmacist/pharmacy-products", {
    params: search ? { search } : {},
    suppressHttpError: true,
  });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function fetchManagedProducts(session, params = {}) {
  const payload = await apiRequest(session, "/products", {
    params,
    suppressHttpError: true,
  });
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total: Number(payload?.total || 0),
  };
}

export async function fetchManagedOrders(session, params = {}) {
  const payload = await apiRequest(session, "/orders", {
    params,
    suppressHttpError: true,
  });
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
    };
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total: Number(payload?.total || 0),
  };
}

export async function createManagedProduct(session, body) {
  return apiRequest(session, "/products", {
    method: "POST",
    body,
  });
}

export async function updateManagedProduct(session, id, body) {
  return apiRequest(session, `/products/${id}`, {
    method: "PUT",
    body,
  });
}

export async function scheduleMtmRequest(session, id, body = {}) {
  const payload = await apiRequest(session, `/mtm-requests/${id}/schedule`, {
    method: "POST",
    body,
  });
  return payload?.request || null;
}

export async function fetchMtmBookingContext(session, id) {
  const payload = await apiRequest(session, `/mtm-requests/${id}/booking-context`, { suppressHttpError: true });
  return payload || null;
}

export function hasActiveSubscription(subscription) {
  if (subscription?.is_paid || subscription?.isPaid) {
    return true;
  }
  const status = String(subscription?.status || "").toLowerCase();
  if (status === "active" || status === "trialing" || status === "past_due") {
    return true;
  }
  if (status !== "cancelled") {
    return false;
  }
  const accessEndsAt = subscription?.accessEndsAt || subscription?.access_ends_at || subscription?.ends_at;
  if (!accessEndsAt) {
    return false;
  }
  const date = new Date(accessEndsAt);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

export function hasEntitlement(subscription, entitlement) {
  const required = String(entitlement || "").trim();
  if (!required) {
    return true;
  }
  const entitlements = Array.isArray(subscription?.entitlements) ? subscription.entitlements : [];
  return entitlements.includes(required);
}
