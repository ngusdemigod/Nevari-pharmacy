"use client";

import { apiRequest } from "../components/role-dashboard-utils";
// mtmPdfBrowser statically pulls in pdf-lib (~130 KB gzip). It is only needed
// when submitting an MTM assessment, so load it lazily instead of shipping it
// in every dashboard bundle.

const STORAGE_PREFIX = "nevari_subscription_state";
const SUBSCRIPTION_UI_CACHE_TTL_MS = 10 * 60 * 1000;

const CUSTOMER_SETTINGS_DEFAULTS = {
  displayName: "",
  email: "",
  phone: "",
  address: "",
  timezone: "UTC",
  preferredConsultationType: "video",
  preferredDoctorIds: [],
  emailReminders: true,
  appointmentReminders: true,
  prescriptionAlerts: true,
  paymentReceipts: true,
  marketingOptIn: false,
  refundTracking: true,
  twoFactorEnabled: false,
  savedMethods: [],
  bloodGroup: "",
  genotype: "",
  allergies: [],
  currentMedications: [],
  existingConditions: [],
  emergencyContactName: "",
  emergencyContactPhoneNumber: "",
};

function readFiniteAmount(value, { divideBy = 1 } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return amount / divideBy;
}

function readFirstFiniteAmount(candidates = []) {
  for (const candidate of candidates) {
    const amount = readFiniteAmount(candidate.value, { divideBy: candidate.divideBy || 1 });
    if (amount != null) {
      return amount;
    }
  }
  return null;
}

function resolveAvailablePaidPlan(subscription = {}) {
  const plans = Array.isArray(subscription?.available_plans) ? subscription.available_plans : [];
  const requestedKey = String(subscription?.requested_plan_key || "nevari_access_pro").trim().toLowerCase();
  return plans.find((plan) => String(plan?.plan_key || "").trim().toLowerCase() === requestedKey && Number(plan?.price || 0) > 0)
    || plans.find((plan) => String(plan?.tier || "").trim().toLowerCase() === "pro" && Number(plan?.price || 0) > 0)
    || null;
}

function resolveSubscriptionBaseAmount(subscription = {}, { status = "" } = {}) {
  const availablePaidPlan = resolveAvailablePaidPlan(subscription);
  const latestSubscription = subscription?.latest_subscription && typeof subscription.latest_subscription === "object"
    ? subscription.latest_subscription
    : null;
  const resolved = readFirstFiniteAmount([
    { value: subscription?.amount },
    { value: subscription?.amount_ngn },
    { value: subscription?.plan_amount },
    { value: subscription?.planAmount },
    { value: latestSubscription?.amount },
    { value: latestSubscription?.amount_ngn },
    { value: latestSubscription?.plan_amount },
    { value: latestSubscription?.planAmount },
    { value: subscription?.amount_kobo },
    { value: subscription?.amountKobo },
    { value: latestSubscription?.amount_kobo },
    { value: latestSubscription?.amountKobo },
  ]);
  if (resolved != null) {
    if (resolved > 0) return resolved;
    if (availablePaidPlan) return Number(availablePaidPlan.price);
  }
  return availablePaidPlan ? Number(availablePaidPlan.price) : 0;
}

export function resolveSubscriptionMonthlyAmount(subscription = {}) {
  const status = String(subscription?.status || "free").trim().toLowerCase();

  const latestSubscription = subscription?.latest_subscription && typeof subscription.latest_subscription === "object"
    ? subscription.latest_subscription
    : null;
  const directMonthlyAmount = readFirstFiniteAmount([
    { value: subscription?.monthlyEquivalent },
    { value: subscription?.monthly_equivalent },
    { value: subscription?.monthly_equivalent_amount },
    { value: subscription?.monthlyEquivalentAmount },
    { value: subscription?.monthly_equivalent_kobo },
    { value: subscription?.monthlyEquivalentKobo },
    { value: latestSubscription?.monthlyEquivalent },
    { value: latestSubscription?.monthly_equivalent },
    { value: latestSubscription?.monthly_equivalent_amount },
    { value: latestSubscription?.monthlyEquivalentAmount },
    { value: latestSubscription?.monthly_equivalent_kobo },
    { value: latestSubscription?.monthlyEquivalentKobo },
  ]);
  if (directMonthlyAmount != null && directMonthlyAmount > 0) {
    return directMonthlyAmount;
  }
  const frequency = String(subscription?.frequency || subscription?.interval || "monthly").trim().toLowerCase();
  const baseAmount = resolveSubscriptionBaseAmount(subscription, { status });
  if ((frequency === "yearly" || frequency === "year") && baseAmount > 0) {
    return baseAmount / 12;
  }
  return baseAmount;
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${String(userId || "guest")}`;
}

function subscriptionAllowedOrigins() {
  if (typeof window === "undefined") {
    return [];
  }
  const currentOrigin = window.location.origin;
  const configured = String(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || "")
    .split(",")
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return Array.from(new Set([currentOrigin, ...configured]));
}

function sanitizeSubscriptionUrl(value, allowedOrigins = subscriptionAllowedOrigins()) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    if (url.username || url.password) {
      return "";
    }
    if (allowedOrigins.length && !allowedOrigins.includes(url.origin)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
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
  const amount = resolveSubscriptionBaseAmount(payload, { status });
  const monthlyEquivalent = resolveSubscriptionMonthlyAmount({
    ...payload,
    status,
    frequency,
    amount,
    latest_subscription: latestSubscription,
  });
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
  const checkoutUrl = sanitizeSubscriptionUrl(
    payload.checkout_url
    || payload.authorization_url
    || payload.authorizationUrl
    || latestSubscription?.checkout_url
    || latestSubscription?.authorization_url
    || ""
  );
  const checkoutExpiresAt = String(
    payload.checkout_expires_at
    || payload.checkoutExpiresAt
    || latestSubscription?.checkout_expires_at
    || latestSubscription?.checkoutExpiresAt
    || ""
  ).trim();
  const manageBillingUrl = sanitizeSubscriptionUrl(payload.manage_billing_url || latestSubscription?.manage_billing_url || "");
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
    checkout_link: sanitizeSubscriptionUrl(payload.checkout_link || checkoutUrl || ""),
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

export async function fetchSubscriptionHistory(session, { page = 1, perPage = 50 } = {}) {
  const payload = await apiRequest(session, "/subscriptions/me/history", {
    params: {
      page: Math.max(1, Number(page) || 1),
      per_page: Math.min(100, Math.max(1, Number(perPage) || 50)),
    },
    suppressHttpError: true,
  });
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    page: Math.max(1, Number(payload?.page) || 1),
    perPage: Math.max(1, Number(payload?.per_page) || perPage),
    total: Math.max(0, Number(payload?.total) || 0),
    totalPages: Math.max(1, Number(payload?.total_pages) || 1),
  };
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

export async function pauseSubscription(session) {
  const payload = await apiRequest(session, "/subscriptions/pause", {
    method: "POST",
    body: {},
  });
  return persistSubscription(session?.user?.id, payload || {});
}

export function normalizeCustomerSettingsPayload(payload = {}) {
  const chipList = (payloadValue) => Array.isArray(payloadValue)
    ? payloadValue.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  return {
    ...CUSTOMER_SETTINGS_DEFAULTS,
    ...payload,
    displayName: String(payload?.displayName || payload?.display_name || "").trim(),
    email: String(payload?.email || "").trim(),
    phone: String(payload?.phone || "").trim(),
    address: String(payload?.address || "").trim(),
    timezone: String(payload?.timezone || "UTC").trim() || "UTC",
    preferredConsultationType: String(payload?.preferredConsultationType || payload?.preferred_consultation_type || "video").trim() || "video",
    preferredDoctorIds: Array.isArray(payload?.preferredDoctorIds || payload?.preferred_doctor_ids)
      ? (payload.preferredDoctorIds || payload.preferred_doctor_ids).map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    emailReminders: Boolean(payload?.emailReminders ?? payload?.email_reminders ?? true),
    appointmentReminders: Boolean(payload?.appointmentReminders ?? payload?.appointment_reminders ?? true),
    prescriptionAlerts: Boolean(payload?.prescriptionAlerts ?? payload?.prescription_alerts ?? true),
    paymentReceipts: Boolean(payload?.paymentReceipts ?? payload?.payment_receipts ?? true),
    marketingOptIn: Boolean(payload?.marketingOptIn ?? payload?.marketing_opt_in ?? false),
    refundTracking: Boolean(payload?.refundTracking ?? payload?.refund_tracking ?? true),
    twoFactorEnabled: Boolean(payload?.twoFactorEnabled ?? payload?.two_factor_enabled ?? false),
    savedMethods: Array.isArray(payload?.savedMethods || payload?.saved_methods)
      ? (payload.savedMethods || payload.saved_methods).map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    bloodGroup: String(payload?.bloodGroup || payload?.blood_group || "").trim(),
    genotype: String(payload?.genotype || "").trim(),
    allergies: chipList(payload?.allergies),
    currentMedications: chipList(payload?.currentMedications || payload?.current_medications),
    existingConditions: chipList(payload?.existingConditions || payload?.existing_conditions),
    emergencyContactName: String(payload?.emergencyContactName || payload?.emergency_contact_name || "").trim(),
    emergencyContactPhoneNumber: String(payload?.emergencyContactPhoneNumber || payload?.emergency_contact_phone_number || "").trim(),
  };
}

export async function fetchCustomerSettings(session) {
  const payload = await apiRequest(session, "/customers/me/settings", { suppressHttpError: true });
  return normalizeCustomerSettingsPayload(payload || {});
}

export async function fetchCustomerSearch(session, query, limit = 20) {
  const normalizedQuery = String(query || "").trim().slice(0, 80);
  if (normalizedQuery.length < 3) {
    return [];
  }
  const payload = await apiRequest(session, "/dashboard/patient/search", {
    params: { q: normalizedQuery, limit: Math.min(30, Math.max(1, Number(limit) || 20)) },
    suppressHttpError: true,
  });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function updateCustomerSettings(session, body = {}) {
  const normalizedBody = normalizeCustomerSettingsPayload(body);
  const payload = await apiRequest(session, "/customers/me/settings", {
    method: "POST",
    body: normalizedBody,
    suppressHttpError: true,
  });
  return normalizeCustomerSettingsPayload(payload || normalizedBody);
}

export async function uploadCustomerProfileImage(session, body = {}) {
  return apiRequest(session, "/customers/me/profile-image", {
    method: "POST",
    body,
  });
}

export async function fetchCustomerMtmRequests(session) {
  const payload = await apiRequest(session, "/mtm-requests", { suppressHttpError: true });
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function parseLocalNurseRequestResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || fallbackMessage);
  }
  return payload?.data || {};
}

export async function fetchCustomerNurseRequests(session) {
  const params = new URLSearchParams({
    baseUrl: String(session?.baseUrl || ""),
    frontendType: String(session?.frontendType || "patient"),
  });
  const response = await fetch(`/api/customer/nurse-requests?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Nevari-Frontend-Type": session?.frontendType || "patient",
      "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
    },
  });
  const data = await parseLocalNurseRequestResponse(response, "Unable to load nurse requests.");
  return Array.isArray(data?.items) ? data.items : [];
}

async function parseLocalIvTherapyResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || fallbackMessage);
  }
  return payload?.data || {};
}

export async function fetchCustomerIvTherapyRequests(session) {
  const params = new URLSearchParams({
    baseUrl: String(session?.baseUrl || ""),
    frontendType: String(session?.frontendType || "patient"),
  });
  const response = await fetch(`/api/customer/iv-therapy?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Nevari-Frontend-Type": session?.frontendType || "patient",
      "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
    },
  });
  const data = await parseLocalIvTherapyResponse(response, "Unable to load IV therapy requests.");
  return Array.isArray(data?.items) ? data.items : [];
}

export async function submitCustomerIvTherapyRequest(session, body) {
  const params = new URLSearchParams({
    baseUrl: String(session?.baseUrl || ""),
    frontendType: String(session?.frontendType || "patient"),
  });
  const response = await fetch(`/api/customer/iv-therapy?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Nevari-Frontend-Type": session?.frontendType || "patient",
      "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
    },
    body: JSON.stringify(body),
  });
  const data = await parseLocalIvTherapyResponse(response, "Unable to submit IV therapy request.");
  return data?.request || null;
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

function readBrowserCookie(name) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const cookie = String(document.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}
async function parseLocalMtmResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || fallbackMessage);
  }
  return payload?.data || {};
}

async function generateMtmPdfInWorker(requestData, imageFiles) {
  if (typeof Worker === "undefined") {
    const { generateBrowserMtmPdf } = await import("./mtmPdfBrowser");
    return generateBrowserMtmPdf(requestData, imageFiles);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mtmPdf.worker.js", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("MTM PDF preparation timed out."));
    }, 90_000);
    worker.onmessage = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (!event.data?.ok || !event.data?.buffer) {
        reject(new Error(event.data?.message || "Unable to prepare the MTM PDF."));
        return;
      }
      resolve(new Uint8Array(event.data.buffer));
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error("Unable to start MTM PDF preparation."));
    };
    worker.postMessage({ requestData, imageFiles });
  });
}

export async function submitCustomerMtmRequest(session, body) {
  const pdfImageFiles = Array.isArray(body?.pdf_image_files) ? body.pdf_image_files : [];
  const submissionBody = { ...body };
  delete submissionBody.pdf_image_files;
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
    body: JSON.stringify(submissionBody),
  });
  const createPayload = await parseLocalMtmResponse(createResponse, "Unable to submit the MTM request.");
  const createdRequest = createPayload?.request || null;
  const pdfSnapshot = createPayload?.pdf_snapshot || null;
  if (!createdRequest?.id || !pdfSnapshot?.token || !pdfSnapshot?.fingerprint) {
    throw new Error("MTM request snapshot could not be created.");
  }

  return { request: createdRequest, pdfSnapshot, pdfImageFiles };
}

export async function prepareCustomerMtmPdf(session, createdRequest, pdfSnapshot, pdfImageFiles = []) {
  if (!createdRequest?.id || !pdfSnapshot?.token || !pdfSnapshot?.fingerprint) {
    throw new Error("MTM request snapshot could not be prepared.");
  }
  const params = new URLSearchParams({
    baseUrl: String(session?.baseUrl || ""),
    frontendType: String(session?.frontendType || "patient"),
  });
  const pdfBytes = await generateMtmPdfInWorker(createdRequest, pdfImageFiles);
  const uploadResponse = await fetch(`/api/mtm/${encodeURIComponent(String(createdRequest.id))}/submission-pdf?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/pdf",
      "X-Nevari-Frontend-Type": session?.frontendType || "patient",
      "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
      "X-Nevari-MTM-Snapshot-Token": pdfSnapshot.token,
      "X-Nevari-MTM-Snapshot-Fingerprint": pdfSnapshot.fingerprint,
      "X-Nevari-CSRF": readBrowserCookie("nevari_csrf"),
    },
    body: pdfBytes,
  });
  const uploadPayload = await parseLocalMtmResponse(uploadResponse, "Unable to verify the MTM PDF upload.");
  return { request: uploadPayload?.request || createdRequest, pdfBytes };
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
  const status = String(subscription?.status || "").toLowerCase();
  const isPaid = Boolean(subscription?.is_paid || subscription?.isPaid);
  const accessEndsAt = subscription?.accessEndsAt || subscription?.access_ends_at || subscription?.ends_at;
  const accessEndDate = accessEndsAt ? new Date(accessEndsAt) : null;
  const hasFutureAccessEnd = Boolean(accessEndDate && !Number.isNaN(accessEndDate.getTime()) && accessEndDate.getTime() > Date.now());
  if (status === "expired") {
    return false;
  }
  if (status === "cancelled") {
    return isPaid && hasFutureAccessEnd;
  }
  if (status === "active" || status === "trialing" || status === "past_due") {
    return isPaid;
  }
  return false;
}

export function hasEntitlement(subscription, entitlement) {
  const required = String(entitlement || "").trim();
  if (!required) {
    return true;
  }
  const entitlements = Array.isArray(subscription?.entitlements) ? subscription.entitlements : [];
  return entitlements.includes(required);
}
