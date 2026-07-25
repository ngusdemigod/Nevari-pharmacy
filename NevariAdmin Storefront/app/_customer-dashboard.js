"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, ArrowUpRight01Icon, BatteryFullIcon, Calendar03Icon, Clock01Icon, Doctor01Icon, FileUploadIcon, Home01Icon, Logout01Icon, MedicalMaskIcon, Medicine01Icon, Menu01Icon, MoreHorizontalIcon, Search01Icon, Settings01Icon, ShoppingBasket01Icon, ShoppingCart01Icon, SignalFull01Icon, Upload01Icon, UserIcon, Wallet01Icon, Wifi01Icon } from "@hugeicons/core-free-icons";
import { removeById, replaceById, updateListPayload, upsertById } from "../lib/fetcher";
import { isProxyAppointmentsKey, isProxyDoctorsKey, isProxyOrdersKey, swrKeys, withBaseUrl, withSessionCacheScope } from "../lib/swrKeys";
import ManageSubscription from "./components/profile/ManageSubscription";
import cartBenefitIcon from "./assets/cart.png";
import micBenefitIcon from "./assets/mic.png";
import pillBenefitIcon from "./assets/pill.png";
import proBadgeImage from "./assets/probadge.jpg";
import proSealImage from "./assets/proseal.png";
import { BrandedSpinner } from "./components/BrandedSpinner";
import { FRONTENDS } from "./components/frontend-config";
import { clearGuestConsultationDraft, readGuestConsultationDraft } from "./components/guest-consultation-draft";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildDashboardCacheKey, buildUrl, clearDashboardCacheForFrontend, DASHBOARD_CACHE_TTL_MS, fitTextToContainer, getOrderTypeMeta, hydrateStoredSession, isSessionUsable, money, readDashboardCache, rememberStoreContext, shortDate, storedStoreCurrency, storedStoreTimeZone, titleCase, writeDashboardCache } from "./components/role-dashboard-utils";
import { performGlobalLogout } from "./components/role-session";
import { buildSWRRevealSignature, useSWRReveal } from "./components/useSWRReveal";
import SubscriptionGate from "./components/subscription/SubscriptionGate";
import Paywall from "./components/subscription/Paywall";
import { useSubscription } from "./hooks/use-subscription";
import { RoleShell, SkeletonBox } from "./components/role-shell";
import { fetchCustomerIvTherapyRequests, fetchCustomerMtmRequests, fetchCustomerNurseRequests, fetchCustomerSearch, fetchMtmBookingContext, normalizeCustomerSettingsPayload, prepareCustomerMtmPdf, requestMtmReschedule, reserveMtmSlot, resolveSubscriptionMonthlyAmount, submitCustomerIvTherapyRequest, submitCustomerMtmRequest, updateCustomerSettings, uploadCustomerProfileImage } from "./lib/nevari-api";
import { citiesForNigeriaState, NIGERIA_STATES } from "./lib/nigeria-locations";

const CUSTOMER_SETTINGS_KEY = "nevari_customer_frontend_settings";
const ADMIN_APPOINTMENT_SETTINGS_KEY = "nevari_admin_appointment_settings";
const CUSTOMER_DASHBOARD_CACHE_SCOPE = "customer-dashboard";
const SSR_SAFE_STORE_CURRENCY = "USD";
const SSR_SAFE_STORE_TIMEZONE = "UTC";
const NURSE_REQUEST_CARE_TYPES = ["Elderly Care", "Post Surgery Recovery", "Medication Assistance", "Wound Dressing", "Injection Administration", "Chronic Disease Monitoring", "Palliative Care"];
const NURSE_REQUEST_VISIT_TYPES = ["Recurring", "One Time"];
const NURSE_REQUEST_DURATIONS = ["30 mins", "1 hour", "2 hours", "4 hours", "8 hours", "12 hours"];
const NURSE_REQUEST_CARE_SHIFTS = ["Day", "Night"];
const NURSE_REQUEST_YES_NO_FIELDS = ["liveInCareRequired", "wheelchairAssistanceNeeded", "medicalEquipmentPresent", "requiresLiftingAssistance", "infectiousDisease"];
const NURSE_REQUEST_YES_NO_OPTIONS = ["Yes", "No"];
const NURSE_REQUEST_CLINICAL_REQUIREMENTS = ["Medication Administration", "Catheter Care", "Blood Pressure Monitoring", "Diabetes Monitoring", "IV Therapy", "Feeding Tube Support"];
const NURSE_REQUEST_UPLOAD_LABELS = ["Medical Prescription", "Doctor Notes", "Discharge Summaries", "Lab Reports", "Medication Lists"];
const IV_THERAPY_OPTIONS = [
  "Beauty & Radiance Drips",
  "Anti-Aging & Regenerative Drips",
  "Weight Management",
  "Hair & Nail Restoration",
  "Vitamin & Hydration Drips"
];
const IV_THERAPY_YES_NO_OPTIONS = ["Yes", "No"];
const pages = ["overview", "orders", "appointment", "request", "therapy", "iv-therapy", "profile", "subscription-management"];
const CUSTOMER_DASHBOARD_REFRESH_MS = 60_000;
const CUSTOMER_MOBILE_BREAKPOINT = 960;

function customerDashboardPagePath(page) {
  return page === "overview" ? "/dashboard" : `/dashboard/${encodeURIComponent(page)}`;
}

function isCustomerMobileViewport() {
  if (typeof window === "undefined") {
    return true;
  }

  const widths = [
    window.innerWidth,
    window.visualViewport?.width,
    document.documentElement?.clientWidth,
    window.screen?.width,
  ].filter((width) => Number.isFinite(width) && width > 0);

  return widths.length === 0 || Math.min(...widths) <= CUSTOMER_MOBILE_BREAKPOINT;
}

const pageLabels = {
  overview: "Overview",
  appointment: "Appointments",
  orders: "Orders",
  search: "Search",
  request: "Request a Nurse",
  settings: "Settings",
  profile: "My Profile",
  therapy: "Medication Therapy Management",
  "iv-therapy": "IV Therapy (Wellness infusions)",
  "subscription-management": "Nevari Access Pro"
};


const PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_SERVER_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_IMAGE_EXPORT_SIZE = 640;
const PROFILE_IMAGE_MIN_ZOOM = 1;
const PROFILE_IMAGE_MAX_ZOOM = 3;
const CUSTOMER_HEALTH_BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CUSTOMER_HEALTH_GENOTYPE_OPTIONS = ["AA", "AS", "AC", "SS", "SC", "CC"];
const CUSTOMER_NOTIFICATION_OPTIONS = [
  ["emailReminders", "Email reminders"],
  ["appointmentReminders", "Appointment reminders"],
  ["prescriptionAlerts", "Prescription reminders"],
  ["paymentReceipts", "Payment receipts"],
  ["twoFactorEnabled", "Two-factor authentication"]
];
const CUSTOMER_SEARCH_QUICK_OPTIONS = [
  ["appointment", "Appointments"],
  ["therapy", "Prescriptions"],
  ["profile", "Lab Results"],
  ["orders", "Orders"]
];

function createIvTherapyFormState() {
  return {
    patient: {
      name: "",
      gender: "",
      address: "",
      state: "",
      city: "",
      cityState: "",
      phoneNumber: ""
    },
    clinicalHistory: {
      chronicConditions: [],
      chronicConditionsDetails: "",
      currentMedications: "",
      currentMedicationsDetails: "",
      allergies: "",
      allergiesDetails: "",
      priorIvTherapy: "",
      priorIvTherapyDetails: "",
      bloodClotHistory: ""
    },
    therapyTypes: [],
    goals: {
      primaryReason: "",
      expectedResults: ""
    },
    consent: ""
  };
}

function normalizeCustomerName(value) {
  const normalized = String(value || "").trim();
  return normalized.toLowerCase() === "customer" ? "" : normalized;
}

function getProfileImageRateLimitRetrySeconds(error) {
  const code = String(error?.code || error?.payload?.error?.code || '').trim().toLowerCase();
    if (code !== 'too_many_requests') {
        return 0;
          }
            const details = error?.details || error?.payload?.error?.details || {};
              const retryAfter = Number(error?.retryAfter || details?.retry_after || 0);
                if (Number.isFinite(retryAfter) && retryAfter > 0) {
                    return Math.ceil(retryAfter);
                      }
                        const resetAt = Date.parse(String(details?.reset_at || ''));
                          if (Number.isFinite(resetAt)) {
                              return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
                                }
                                  return 60;
                                  }
                                  
function formatProfileImageRateLimitMessage(seconds) {
  const safeSeconds = Math.max(1, Math.ceil(Number(seconds || 0)));
    const minutes = Math.max(1, Math.ceil(safeSeconds / 60));
      return 'Too many profile image updates. Please try again in ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + '.';
      }
      
function describeProfileImageUploadError(error) {
  const retrySeconds = getProfileImageRateLimitRetrySeconds(error);
    if (retrySeconds > 0) {
        return formatProfileImageRateLimitMessage(retrySeconds);
          }
            return error?.message || 'Unable to upload image. Please try again.';
            }
            
function emailLocalName(value) {
  const email = String(value || '').trim();
  return email.includes(String.fromCharCode(64)) ? email.split(String.fromCharCode(64))[0].replace(/[._-]+/g, ' ').trim() : '';
}

function fullNameFromParts(source = {}) {
  return [source?.first_name || source?.firstName, source?.last_name || source?.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

function resolveCustomerPreferredName({ settingsDisplayName = '', profile = {}, sessionUser = {} } = {}) {
  return normalizeCustomerName(settingsDisplayName)
    || normalizeCustomerName(profile?.last_name || profile?.lastName)
    || normalizeCustomerName(sessionUser?.last_name || sessionUser?.lastName)
    || normalizeCustomerName(profile?.first_name || profile?.firstName)
    || normalizeCustomerName(sessionUser?.first_name || sessionUser?.firstName)
    || normalizeCustomerName(profile?.display_name)
    || normalizeCustomerName(sessionUser?.display_name)
    || normalizeCustomerName(fullNameFromParts(profile))
    || normalizeCustomerName(fullNameFromParts(sessionUser))
    || normalizeCustomerName(sessionUser?.name)
    || normalizeCustomerName(emailLocalName(profile?.email || sessionUser?.email))
    || 'Patient';
}
function normalizeCustomerIdentityValue(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveCustomerSessionStorageIdentity(user = {}) {
  const id = String(user?.id || "").trim();
  if (id) {
    return id;
  }
  return normalizeCustomerIdentityValue(user?.email);
}

function buildCustomerSettingsStorageKey(user = {}) {
  const identity = resolveCustomerSessionStorageIdentity(user);
  return identity ? `${CUSTOMER_SETTINGS_KEY}:${identity}` : "";
}

function readCustomerStoragePayload(key) {
  if (typeof window === "undefined" || !key) {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isStoredCustomerSettingsOwnedBySession(settings = {}, sessionUser = {}) {
  const storedEmail = normalizeCustomerIdentityValue(settings?.email);
  const sessionEmail = normalizeCustomerIdentityValue(sessionUser?.email);
  return Boolean(storedEmail && sessionEmail && storedEmail === sessionEmail);
}

function buildCustomerFallbackProfile(sessionUser = {}, settingsDisplayName = "") {
  return {
    id: sessionUser?.id || null,
    email: sessionUser?.email || "",
    display_name: resolveCustomerPreferredName({ settingsDisplayName, sessionUser }),
    first_name: String(sessionUser?.first_name || sessionUser?.firstName || "").trim(),
    last_name: String(sessionUser?.last_name || sessionUser?.lastName || "").trim(),
    avatar_url: sessionUser?.avatar_url || sessionUser?.avatarUrl || sessionUser?.picture || "",
    roles: resolveUserRoles(sessionUser)
  };
}

function isCustomerProfileOwnedBySession(profile = {}, sessionUser = {}) {
  const profileId = String(profile?.id || "").trim();
  const sessionId = String(sessionUser?.id || "").trim();
  if (profileId && sessionId) {
    return profileId === sessionId;
  }
  const profileEmail = normalizeCustomerIdentityValue(profile?.email);
  const sessionEmail = normalizeCustomerIdentityValue(sessionUser?.email);
  return Boolean(profileEmail && sessionEmail && profileEmail === sessionEmail);
}

function resolveCustomerProfileForSession({ profile = {}, sessionUser = {}, settingsDisplayName = "" } = {}) {
  const fallbackProfile = buildCustomerFallbackProfile(sessionUser, settingsDisplayName);
  if (!isCustomerProfileOwnedBySession(profile, sessionUser)) {
    return fallbackProfile;
  }
  const mergedProfile = { ...fallbackProfile, ...profile };
  return {
    ...mergedProfile,
    display_name: resolveCustomerPreferredName({
      settingsDisplayName,
      profile: mergedProfile,
      sessionUser
    })
  };
}function resolveCustomerFullName(profile = {}, sessionUser = {}, fallbackName = "Patient") {
  const firstName = String(profile?.first_name || profile?.firstName || sessionUser?.first_name || sessionUser?.firstName || "").trim();
  const lastName = String(profile?.last_name || profile?.lastName || sessionUser?.last_name || sessionUser?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  return String(profile?.display_name || sessionUser?.display_name || sessionUser?.name || fallbackName || "Patient").trim() || "Patient";
}

function composeCityStateValue(city = "", state = "") {
  return [String(city || "").trim(), String(state || "").trim()].filter(Boolean).join(", ");
}

function buildIvTherapyPatientPayload(patient = {}) {
  const state = String(patient.state || "").trim();
  const city = String(patient.city || "").trim();
  return {
    ...patient,
    state,
    city,
    cityState: composeCityStateValue(city, state),
  };
}

function buildIvTherapyStepErrors(step, form) {
  const errors = {};
  const patient = form?.patient || {};
  const clinicalHistory = form?.clinicalHistory || {};
  const goals = form?.goals || {};
  const therapyTypes = Array.isArray(form?.therapyTypes) ? form.therapyTypes : [];
  const consent = String(form?.consent || "").trim();

  if (step === 1) {
    if (!String(patient.name || "").trim()) errors.name = "Patient name is required.";
    else if (!/^[a-zA-Z\s'.-]{2,120}$/.test(String(patient.name || "").trim())) errors.name = "Enter a valid patient name.";
    if (!["Male", "Female"].includes(String(patient.gender || "").trim())) {
      errors.gender = "Select a valid gender.";
    }
    if (!String(patient.address || "").trim()) errors.address = "Address is required.";
    if (!String(patient.state || "").trim()) errors.state = "State is required.";
    if (!String(patient.city || "").trim()) errors.city = "City is required.";
    if (!/^[0-9+\-()\s]{7,24}$/.test(String(patient.phoneNumber || "").trim())) errors.phoneNumber = "Enter a valid phone number.";
  }

  if (step === 2) {
    ["chronicConditions", "currentMedications", "allergies", "priorIvTherapy", "bloodClotHistory"].forEach((key) => {
      if (!IV_THERAPY_YES_NO_OPTIONS.includes(String(clinicalHistory[key] || "").trim())) {
        errors[key] = "Select Yes or No.";
      }
    });
    if (clinicalHistory.chronicConditions === "Yes" && !String(clinicalHistory.chronicConditionsDetails || "").trim()) {
      errors.chronicConditionsDetails = "Add chronic condition details.";
    }
    if (clinicalHistory.currentMedications === "Yes" && !String(clinicalHistory.currentMedicationsDetails || "").trim()) {
      errors.currentMedicationsDetails = "Add medication details.";
    }
    if (clinicalHistory.allergies === "Yes" && !String(clinicalHistory.allergiesDetails || "").trim()) {
      errors.allergiesDetails = "Add allergy details.";
    }
    if (clinicalHistory.priorIvTherapy === "Yes" && !String(clinicalHistory.priorIvTherapyDetails || "").trim()) {
      errors.priorIvTherapyDetails = "Add prior IV therapy details.";
    }
  }

  if (step === 3 && !therapyTypes.length) {
    errors.therapyTypes = "Select at least one IV therapy type.";
  }

  if (step === 4) {
    if (!String(goals.primaryReason || "").trim()) errors.primaryReason = "Main reason is required.";
    if (!String(goals.expectedResults || "").trim()) errors.expectedResults = "Expected results are required.";
  }

  if (step === 5 && consent !== "Yes") {
    errors.consent = "Consent is required before submission.";
  }

  return errors;
}

function formatSubscriptionPriceLabel(subscription) {
  const amount = resolveSubscriptionMonthlyAmount(subscription);
  const currency = String(subscription?.currency || "NGN").trim().toUpperCase();
  const recurringLabel = "/month";
  const resolvedAmount = Number(amount);
  if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) return "";
  try {
    return `${new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(resolvedAmount)}${recurringLabel}`;
  } catch {
    return `${currency}${resolvedAmount}${recurringLabel}`;
  }
}

function ModalScrim({ className, label, onDismiss }) {
  return <div
    className={className}
    role="button"
    tabIndex={0}
    aria-label={label}
    onClick={onDismiss}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onDismiss?.();
      }
    }}
  />;
}
const APPOINTMENT_TIMEFRAME_OPTIONS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30"
];
const DEFAULT_CONSULTATION_FEE_NGN = 5000;
const APPOINTMENT_PROGRESS_LABELS = {
  finding_doctors: "Finding available doctors...",
  securing_slot: "Securing a slot...",
  confirming_appointment: "Confirming appointment...",
};

function AppointmentCtaLoadingState({ active, stage = "finding_doctors" }) {
  const label = APPOINTMENT_PROGRESS_LABELS[stage] || APPOINTMENT_PROGRESS_LABELS.finding_doctors;

  return <span className="appointment-cta-loading" aria-live="polite">
    <span className="appointment-cta-spinner" aria-hidden="true" />
    <span className="appointment-cta-loading-text">{label}</span>
  </span>;
}

function renderCustomerNavIcon(page) {
  const iconMap = {
    overview: Home01Icon,
    orders: ShoppingCart01Icon,
    appointment: Calendar03Icon,
    request: MedicalMaskIcon,
    settings: Settings01Icon,
    profile: UserIcon,
    therapy: Medicine01Icon,
    "iv-therapy": Medicine01Icon,
  };
  const icon = iconMap[page] || Home01Icon;
  return <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} />;
}

function resolveUserRoles(user = null) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const directRole = typeof user?.role === "string" ? [user.role] : [];
  return [...roles, ...directRole]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

const emptyCustomerState = {
  error: "",
  dashboard: null,
  settings: defaultCustomerSettings(),
  orders: [],
  appointments: [],
  doctors: [],
  doctorsUnavailable: false
};

function forcePatientLogoutToLogin() {
  if (typeof window === "undefined") {
    return;
  }
  const activeSession = hydrateStoredSession("patient");
  clearDashboardCacheForFrontend("patient", activeSession?.user?.id);
  performGlobalLogout(FRONTENDS.patient, activeSession).finally(() => {
    window.location.replace(FRONTENDS.patient.loginPath);
  });
}

async function readCustomerNextApiResponse(response, fallbackMessage = "Request failed.") {
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 || String(payload?.error?.code || "").trim().toLowerCase() === "session_expired") {
    forcePatientLogoutToLogin();
    throw new Error("Session expired.");
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || fallbackMessage);
  }
  return payload;
}

async function fetchCustomerDashboardPayload(session, settings, fallbackState = emptyCustomerState) {
  const nowIso = new Date().toISOString();
  const upcomingParams = { per_page: 5, page: 1, date_from: nowIso, order: "ASC" };
  const pastParams = { per_page: 5, page: 1, date_to: nowIso, order: "DESC" };
  const [dashboard, orders, upcomingAppointments, pastAppointments, liveDoctors] = await Promise.all([
    apiRequest(session, "/dashboard/patient", { suppressHttpError: true }),
    apiRequest(session, "/orders", { params: { per_page: 5, page: 1 }, suppressHttpError: true }),
    apiRequest(session, "/appointments", { params: upcomingParams, suppressHttpError: true }),
    apiRequest(session, "/appointments", { params: pastParams, suppressHttpError: true }),
    apiRequest(session, "/doctors", { params: { per_page: 8, page: 1 }, suppressHttpError: true })
  ]);
  rememberStoreContext(dashboard || fallbackState.dashboard || {});
  const resolvedDashboard = dashboard || fallbackState.dashboard || {};
  const hasOrderFailure = orders === null;
  const hasUpcomingFailure = upcomingAppointments === null;
  const hasPastFailure = pastAppointments === null;
  const hasDoctorFailure = liveDoctors === null;
  const resolvedOrders = hasOrderFailure ? (fallbackState.orders || []) : (orders || []);
  const resolvedAppointments = (hasUpcomingFailure && hasPastFailure)
    ? (fallbackState.appointments || [])
    : mergeAppointments(
      hasUpcomingFailure ? [] : (upcomingAppointments || []),
      hasPastFailure ? [] : (pastAppointments || []),
      fallbackState.appointments || []
    );
  const resolvedDoctors = hasDoctorFailure
    ? ((fallbackState.doctors && fallbackState.doctors.length) ? fallbackState.doctors : buildFallbackDoctors(resolvedAppointments, resolvedOrders))
    : (liveDoctors || []);
  const blockingErrors = [];
  if (hasOrderFailure || hasUpcomingFailure || hasPastFailure) {
    blockingErrors.push("Oops! Connection error. We’re showing your last available dashboard data.");
  }
  const resolvedProfile = resolveCustomerProfileForSession({
    profile: resolvedDashboard.profile || {},
    sessionUser: session.user,
    settingsDisplayName: settings.displayName
  });

  return {
    error: blockingErrors[0] || "",
    dashboard: { ...resolvedDashboard, profile: resolvedProfile },
    settings: normalizeCustomerSettingsPayload(resolvedDashboard.settings || fallbackState.settings || settings),
    orders: resolvedOrders,
    appointments: resolvedAppointments,
    doctors: resolvedDoctors,
    doctorsUnavailable: !resolvedDoctors.length
  };
}

function mergeAppointments(upcoming = [], past = [], fallback = []) {
  const merged = [...upcoming, ...past, ...fallback];
  const seen = new Set();
  return merged.filter((item) => {
    const key = String(item?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchCustomerOrders(session) {
  return apiRequest(session, "/orders", { params: { per_page: 24, page: 1 }, suppressHttpError: true });
}

async function fetchCustomerAppointments(session) {
  return apiRequest(session, "/appointments", { params: { per_page: 40, page: 1 }, suppressHttpError: true });
}

async function fetchCustomerDoctors(session) {
  return apiRequest(session, "/doctors", { params: { per_page: 24, page: 1 }, suppressHttpError: true });
}

function normalizeProfileAvatarUrl(value) {
  return String(value || "").trim();
}

function profileAvatarUrlKey(value) {
  const normalized = normalizeProfileAvatarUrl(value);
  if (!normalized) {
    return "";
  }
  return normalized.replace(/[?#].*$/, "");
}

function withProfileAvatarRefreshToken(value, token) {
  const normalized = normalizeProfileAvatarUrl(value);
  if (!normalized) {
    return "";
  }
  const safeToken = String(token || "").trim();
  if (!safeToken) {
    return normalized;
  }
  return normalized + (normalized.includes("?") ? "&" : "?") + "nevari_avatar_v=" + encodeURIComponent(safeToken);
}

function mergeCustomerProfileAvatar(profile, avatarUrl) {
  const nextAvatarUrl = normalizeProfileAvatarUrl(avatarUrl);
  if (!nextAvatarUrl) {
    return { ...(profile || {}) };
  }

  return {
    ...(profile || {}),
    avatar_url: nextAvatarUrl,
    profile_image: nextAvatarUrl,
  };
}

function patchCustomerProfileAvatarState(current, avatarUrl) {
  if (!current) {
    return current;
  }

  const nextProfile = mergeCustomerProfileAvatar(current.dashboard?.profile || current.profile || {}, avatarUrl);
  return {
    ...current,
    profile: {
      ...(current.profile || {}),
      ...nextProfile,
    },
    dashboard: {
      ...(current.dashboard || {}),
      profile: {
        ...(current.dashboard?.profile || {}),
        ...nextProfile,
      },
    },
  };
}

function persistPatientSessionAvatar(avatarUrl) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeProfileAvatarUrl(avatarUrl);
  if (!normalized) {
    return;
  }
  try {
    const storageKey = FRONTENDS.patient?.storageKey;
    if (!storageKey) {
      return;
    }
    const current = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    const next = {
      ...current,
      user: {
        ...(current?.user || {}),
        avatar_url: normalized,
        avatarUrl: normalized,
        picture: normalized,
      },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
}

function createJourneyState() {
  return {
    mode: "hub",
    doctorId: null,
    selectedDate: localDateKey(new Date()),
    slots: [],
    selectedSlot: null,
    durationMinutes: null,
    reason: "",
    loading: false,
    progressStage: "",
    error: "",
    appointment: null,
    checkout: null,
    confirmation: null,
    reviews: null,
    reviewDraft: { rating: 5, reviewText: "" },
    reviewFeedback: ""
  };
}

function createMtmFormState() {
  return {
    patient: {
      name: "",
      age: "",
      dob: "",
      gender: "",
      maritalStatus: "",
      address: "",
      cityState: "",
      phoneNumber: "",
      emergencyContact: "",
      preferredContactMethod: "",
    },
    emergencyContact: {
      caregiverName: "",
      relationship: "",
      phoneNumber: "",
      emailAddress: "",
      address: "",
      livesWithPatient: "",
      consentToDiscussCare: "",
    },
    medicalHistory: {
      height: "",
      weight: "",
      bloodPressure: "",
      bloodGlucoseHbA1c: "",
      primaryDiagnosis: "",
      secondaryDiagnosis: "",
      chronicConditions: "",
      pastMedicalHistory: "",
      pastSurgicalHistory: "",
      drugAllergies: [],
      drugIntolerances: [],
      relevantLabResults: "",
      clinicalMonitoringParameters: "",
    },
    medicationProfile: {
      medicationFileName: "",
      prescribingDoctor: "",
      notes: "",
    },
    adherenceAssessment: {
      barriers: [],
      other: "",
    },
    additionalInformation: {
      recentMedicationChanges: "",
      previousMedicationsStopped: "",
      reasonForDiscontinuation: [],
      otcMedications: [],
      herbalProducts: [],
      supplements: [],
    }
  };
}

function createEmptyMtmMedicationProfile() {
  return createMtmFormState().medicationProfile;
}

function mtmSkipsClinicalSections(form) {
  return String(form?.emergencyContact?.consentToDiscussCare || "").trim() === "No";
}

const MTM_GENDER_OPTIONS = ["Female", "Male"];
const MTM_MARITAL_STATUS_OPTIONS = ["Single", "Married", "Separated", "Divorced", "Widowed", "Prefer not to say"];
const MTM_CONTACT_METHOD_OPTIONS = ["Phone", "WhatsApp", "Email"];
const MTM_RELATIONSHIP_OPTIONS = ["Spouse", "Parent", "Sibling", "Child", "Relative", "Friend", "Caregiver", "Other"];
const MTM_YES_NO_OPTIONS = ["Yes", "No"];
const MTM_ROUTE_OPTIONS = ["Oral", "Injection", "Topical", "Inhaled", "Sublingual", "Rectal", "Other"];
const MTM_FREQUENCY_OPTIONS = ["Once daily", "Twice daily", "Three times daily", "Four times daily", "As needed", "Weekly", "Monthly", "Other"];

function todayInputDate() {
  return localDateKey(new Date());
}

function normalizeMtmPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length > 11 && digits.startsWith("234")) {
    return `0${digits.slice(3, 13).slice(0, 10)}`.slice(0, 11);
  }
  if (digits.length > 11 && digits.startsWith("0")) {
    return digits.slice(0, 11);
  }
  if (digits.length === 10 && !digits.startsWith("0")) {
    return `0${digits}`;
  }
  return digits.slice(0, 11);
}

function isValidEmailAddress(value) {
  const email = String(value || "").trim();
  return email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function exactLengthError(label, length) {
  return `${label} must be ${length} characters long.`;
}

function minLengthError(label, length) {
  return `${label} must be at least ${length} characters long.`;
}

function isFutureDate(value) {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed.getTime() > today.getTime();
}

function buildMtmStepErrors(step, mtmForm, labResultsFiles = [], options = {}) {
  const medicationEntries = Array.isArray(options?.medicationEntries) ? options.medicationEntries : [];
  const requireMedicationDraft = options?.requireMedicationDraft === true;
  const includeRequired = options?.includeRequired !== false;
  const activeKeys = Array.isArray(options?.activeKeys) ? new Set(options.activeKeys) : null;
  const errors = {};
  const patient = mtmForm?.patient || {};
  const emergencyContact = mtmForm?.emergencyContact || {};
  const medicalHistory = mtmForm?.medicalHistory || {};
  const adherenceAssessment = mtmForm?.adherenceAssessment || {};
  const additionalInformation = mtmForm?.additionalInformation || {};
  const fileList = Array.isArray(labResultsFiles) ? labResultsFiles : [];
  const phonePattern = /^[0-9+\-()\s]{7,20}$/;
  const consentToDiscussCare = String(emergencyContact.consentToDiscussCare || "").trim();
  const skipClinicalSections = consentToDiscussCare === "No";
  const emergencyContactRequired = consentToDiscussCare === "No"
    ? ["consentToDiscussCare"]
    : ["caregiverName", "relationship", "phoneNumber", "consentToDiscussCare"];

  const required = {
    1: ["name", "age", "dob", "gender", "address", "phoneNumber", "preferredContactMethod"],
    2: emergencyContactRequired,
    3: ["primaryDiagnosis", "chronicConditions", "pastMedicalHistory", "drugAllergies"],
    4: [],
    5: [],
    6: [],
  };

  const stepSections = {
    1: patient,
    2: emergencyContact,
    3: medicalHistory,
    4: mtmForm?.medicationProfile || {},
    5: adherenceAssessment,
  };

  const shouldValidateKey = (key) => !activeKeys || activeKeys.has(key);

  const validateRequiredSet = (stepNumber) => {
    required[stepNumber].forEach((key) => {
      const section = stepSections[stepNumber];
      if (shouldValidateKey(key) && !String(section?.[key] || "").trim()) {
        errors[key] = "This field is required.";
      }
    });
  };

  if (includeRequired) {
    if (step >= 1) validateRequiredSet(1);
    if (step >= 2) validateRequiredSet(2);
    if (!skipClinicalSections && step >= 3) validateRequiredSet(3);
    if (!skipClinicalSections && step >= 4 && requireMedicationDraft) validateRequiredSet(4);
    if (!skipClinicalSections && step >= 5) validateRequiredSet(5);
  }

  if (step >= 1) {
    if (shouldValidateKey("age") && String(patient.age || "").trim() && !/^\d{1,3}$/.test(String(patient.age || "").trim())) {
      errors.age = "Age must be 1 to 3 digits long.";
    }
    if (shouldValidateKey("name") && String(patient.name || "").trim() && !/^[a-zA-Z\s'.-]{2,120}$/.test(String(patient.name || "").trim())) {
      errors.name = minLengthError("Full name", 2);
    }
    if (shouldValidateKey("dob") && String(patient.dob || "").trim() && isFutureDate(String(patient.dob || "").trim())) {
      errors.dob = "DOB cannot be in the future.";
    }
    if (shouldValidateKey("phoneNumber") && String(patient.phoneNumber || "").trim()) {
      if (!phonePattern.test(String(patient.phoneNumber || "").trim()) || normalizeMtmPhoneNumber(patient.phoneNumber).length !== 11) {
        errors.phoneNumber = exactLengthError("Phone number", 11);
      }
    }
    if (shouldValidateKey("emergencyContact") && String(patient.emergencyContact || "").trim() && (!phonePattern.test(String(patient.emergencyContact || "").trim()) || normalizeMtmPhoneNumber(patient.emergencyContact).length !== 11)) {
      errors.emergencyContact = exactLengthError("Emergency contact number", 11);
    }
    if (shouldValidateKey("gender") && String(patient.gender || "").trim() && !["Female", "Male", "Other", "Prefer not to say"].includes(String(patient.gender || ""))) {
      errors.gender = "Select a valid gender.";
    }
    if (shouldValidateKey("preferredContactMethod") && String(patient.preferredContactMethod || "").trim() && !["Phone", "WhatsApp", "Email"].includes(String(patient.preferredContactMethod || ""))) {
      errors.preferredContactMethod = "Select a contact method.";
    }
  }

  if (step >= 2) {
    if (shouldValidateKey("caregiverName") && String(emergencyContact.caregiverName || "").trim() && !/^[a-zA-Z\s'.-]{2,120}$/.test(String(emergencyContact.caregiverName || "").trim())) {
      errors.caregiverName = minLengthError("Caregiver name", 2);
    }
    if (shouldValidateKey("relationship") && String(emergencyContact.relationship || "").trim() && !MTM_RELATIONSHIP_OPTIONS.includes(String(emergencyContact.relationship || ""))) {
      errors.relationship = "Select a valid relationship.";
    }
    if (shouldValidateKey("phoneNumber") && String(emergencyContact.phoneNumber || "").trim()) {
      if (!phonePattern.test(String(emergencyContact.phoneNumber || "").trim()) || normalizeMtmPhoneNumber(emergencyContact.phoneNumber).length !== 11) {
        errors.phoneNumber = exactLengthError("Phone number", 11);
      }
    }
    if (shouldValidateKey("emailAddress") && String(emergencyContact.emailAddress || "").trim() && !isValidEmailAddress(emergencyContact.emailAddress)) {
      errors.emailAddress = "Enter a valid email address.";
    }
    if (shouldValidateKey("livesWithPatient") && String(emergencyContact.livesWithPatient || "").trim() && !["Yes", "No"].includes(String(emergencyContact.livesWithPatient || ""))) {
      errors.livesWithPatient = "Select Yes or No.";
    }
    if (shouldValidateKey("consentToDiscussCare") && String(emergencyContact.consentToDiscussCare || "").trim() && !["Yes", "No"].includes(String(emergencyContact.consentToDiscussCare || ""))) {
      errors.consentToDiscussCare = "Select Yes or No.";
    }
  }

  if (!skipClinicalSections && step >= 3) {
    if (includeRequired && shouldValidateKey("primaryDiagnosis") && !String(medicalHistory.primaryDiagnosis || "").trim()) errors.primaryDiagnosis = "This field is required.";
    if (includeRequired && shouldValidateKey("chronicConditions") && !String(medicalHistory.chronicConditions || "").trim()) errors.chronicConditions = "This field is required.";
    if (includeRequired && shouldValidateKey("pastMedicalHistory") && !String(medicalHistory.pastMedicalHistory || "").trim()) errors.pastMedicalHistory = "This field is required.";
    if (includeRequired && shouldValidateKey("drugAllergies") && !String(medicalHistory.drugAllergies || "").trim()) errors.drugAllergies = "This field is required.";
    if (shouldValidateKey("relevantLabResults") && fileList.some((file) => !isAllowedMtmImageFile(file))) {
      errors.relevantLabResults = "Upload PNG, JPG, JPEG, or WebP images up to 5MB each.";
    }
  }

  if (!skipClinicalSections && step >= 4 && !requireMedicationDraft && includeRequired && shouldValidateKey("medications") && !medicationEntries.length) {
    errors.medications = "Add at least one medication before you continue.";
  }

  if (!skipClinicalSections && step >= 5 && includeRequired && shouldValidateKey("barriers") && !Array.isArray(adherenceAssessment.barriers)) {
    errors.barriers = "Select at least one barrier.";
  }
  if (!skipClinicalSections && step >= 5 && includeRequired && shouldValidateKey("barriers") && Array.isArray(adherenceAssessment.barriers) && !adherenceAssessment.barriers.length) {
    errors.barriers = "Select at least one barrier.";
  }

  return errors;
}

function sanitizeCustomerHealthChip(value, max = 80) {
  return sanitizeClientText(value || "", { max }).trim();
}

function normalizeCustomerHealthChipList(values) {
  const source = Array.isArray(values) ? values : String(values || "").split(",");
  return Array.from(new Set(source
    .map((item) => sanitizeCustomerHealthChip(item))
    .filter(Boolean)));
}

function MtmTokenInput({ id, value, onChange, onBlur, placeholder, hasError = false }) {
  const [draft, setDraft] = useState("");
  const tokens = normalizeCustomerHealthChipList(value);

  function commitDraft(rawValue = draft) {
    const additions = normalizeCustomerHealthChipList(String(rawValue || "").split(","));
    if (additions.length) onChange(normalizeCustomerHealthChipList([...tokens, ...additions]));
    setDraft("");
  }

  return <div className={`customer-mtm-token-input ${hasError ? "has-error" : ""}`}>
    {tokens.map((token) => <span className="customer-mtm-token" key={token}>
      <span>{token}</span>
      <button type="button" aria-label={`Remove ${token}`} onClick={() => onChange(tokens.filter((item) => item !== token))}>&times;</button>
    </span>)}
    <input
      id={id}
      type="text"
      value={draft}
      placeholder={tokens.length ? "Add another" : placeholder}
      enterKeyHint="next"
      onChange={(event) => {
        const nextValue = event.target.value;
        if (nextValue.includes(",")) commitDraft(nextValue);
        else setDraft(nextValue);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          commitDraft();
        } else if (event.key === "Backspace" && !draft && tokens.length) {
          onChange(tokens.slice(0, -1));
        }
      }}
      onBlur={() => {
        commitDraft();
        onBlur?.();
      }}
    />
  </div>;
}

function isValidCustomerPhoneNumber(value, { allowEmpty = true } = {}) {
  const normalized = normalizeMtmPhoneNumber(value);
  if (!normalized) {
    return allowEmpty;
  }
  return normalized.length === 11;
}

function validateCustomerProfileImageFile(file) {
  if (!file) {
    return "Select an image to continue.";
  }
  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    return "Please choose a valid image file.";
  }
  if (Number(file.size || 0) > PROFILE_IMAGE_MAX_SIZE_BYTES) {
    return "Image size must be 5MB or less.";
  }
  return "";
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getProfileImageBaseScale(naturalWidth, naturalHeight, cropSize = 1) {
  if (!naturalWidth || !naturalHeight || !cropSize) {
    return 1;
  }
  return Math.max(cropSize / naturalWidth, cropSize / naturalHeight);
}

function getProfileImageOffsetLimits(naturalWidth, naturalHeight, scale, cropSize = 1) {
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  return {
    x: Math.max(0, (scaledWidth - cropSize) / 2),
    y: Math.max(0, (scaledHeight - cropSize) / 2),
  };
}

function clampProfileImageOffsets(offsetX, offsetY, naturalWidth, naturalHeight, scale, cropSize = 1) {
  const limits = getProfileImageOffsetLimits(naturalWidth, naturalHeight, scale, cropSize);
  return {
    x: clampNumber(offsetX, -limits.x, limits.x),
    y: clampNumber(offsetY, -limits.y, limits.y),
  };
}

function createProfileImageCropState({ naturalWidth, naturalHeight, zoom = PROFILE_IMAGE_MIN_ZOOM, offsetX = 0, offsetY = 0, cropSize = 1 }) {
  const baseScale = getProfileImageBaseScale(naturalWidth, naturalHeight, cropSize);
  const nextZoom = clampNumber(Number(zoom) || PROFILE_IMAGE_MIN_ZOOM, PROFILE_IMAGE_MIN_ZOOM, PROFILE_IMAGE_MAX_ZOOM);
  const scale = baseScale * nextZoom;
  const offset = clampProfileImageOffsets(offsetX, offsetY, naturalWidth, naturalHeight, scale, cropSize);
  return {
    naturalWidth,
    naturalHeight,
    cropSize,
    baseScale,
    zoom: nextZoom,
    scale,
    offsetX: offset.x,
    offsetY: offset.y,
  };
}

function loadImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        naturalWidth: image.naturalWidth || image.width || 0,
        naturalHeight: image.naturalHeight || image.height || 0,
      });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the selected image."));
    };
    image.src = objectUrl;
  });
}

function buildProfileImageUploadName(fileName = "", mimeType = "") {
  const originalName = String(fileName || "").trim() || "profile-image";
  const stem = originalName.replace(/\.[^.]+$/, "") || "profile-image";
  if (mimeType === "image/png") {
    return stem + ".png";
  }
  if (mimeType === "image/webp") {
    return stem + ".webp";
  }
  return stem + ".jpg";
}

function resolveCustomerHealthRecordRows(settings) {
  const normalized = normalizeCustomerSettingsPayload(settings);
  const emergencyContact = normalized.emergencyContactName
    ? normalized.emergencyContactName + (normalized.emergencyContactPhoneNumber ? " ? " + normalized.emergencyContactPhoneNumber : "")
    : "Not added";
  return [
    ["Blood Group", normalized.bloodGroup || "Not added"],
    ["Genotype", normalized.genotype || "Not added"],
    ["Allergies", normalized.allergies.length ? normalized.allergies.join(", ") : "Not added"],
    ["Current Medications", normalized.currentMedications.length ? normalized.currentMedications.join(", ") : "Not added"],
    ["Existing Conditions", normalized.existingConditions.length ? normalized.existingConditions.join(", ") : "Not added"],
    ["Emergency Contact", emergencyContact],
  ];
}

function getCustomerProfileReminderItems(missingLabels = []) {
  const items = [];
  const labels = new Set(Array.isArray(missingLabels) ? missingLabels : []);
  const addItem = (label) => {
    if (!items.includes(label)) {
      items.push(label);
    }
  };

  if (labels.has("Display Name")) addItem("Add your display name");
  if (labels.has("Email")) addItem("Add your email address");
  if (labels.has("Phone Number")) addItem("Add your current phone number");
  if (labels.has("Address")) addItem("Confirm your home address");
  if (labels.has("Blood Group")) addItem("Add your blood group");
  if (labels.has("Genotype")) addItem("Add your genotype");
  if (labels.has("Emergency Contact Name") || labels.has("Emergency Contact Phone Number")) addItem("Add an emergency contact");

  return items;
}
function getCustomerProfileCompletion(settings, profile = {}) {
  const normalized = normalizeCustomerSettingsPayload(settings);
  const requiredEntries = [
    ["Display Name", normalized.displayName || profile?.display_name || ""],
    ["Email", normalized.email || profile?.email || ""],
    ["Phone Number", normalized.phone || profile?.phone || ""],
    ["Address", normalized.address || profile?.address || ""],
    ["Blood Group", normalized.bloodGroup],
    ["Genotype", normalized.genotype],
    ["Emergency Contact Name", normalized.emergencyContactName],
    ["Emergency Contact Phone Number", normalized.emergencyContactPhoneNumber],
  ];
  const completed = requiredEntries.filter(([, value]) => String(value || "").trim()).length;
  const total = requiredEntries.length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    missingLabels: requiredEntries.filter(([, value]) => !String(value || "").trim()).map(([label]) => label),
    isComplete: completed === total,
  };
}

function mergeCustomerPrefillValue(currentValue, nextValue) {
  if (Array.isArray(currentValue)) {
    return currentValue.length ? currentValue : normalizeCustomerHealthChipList(nextValue);
  }
  return String(currentValue || "").trim() ? currentValue : nextValue;
}

function getCustomerSettingsFieldErrors(settings, { requireAll = false } = {}) {
  const errors = {};
  const displayName = sanitizeClientText(settings?.displayName || "", { max: 120 }).trim();
  const email = sanitizeClientText(settings?.email || "", { max: 254 }).replace(/\s+/g, "");
  const phone = String(settings?.phone || "").trim();
  const address = sanitizeClientText(settings?.address || "", { max: 200 }).trim();
  const timezone = sanitizeClientText(settings?.timezone || "", { max: 80 }).trim();
  const bloodGroup = String(settings?.bloodGroup || "").trim();
  const genotype = String(settings?.genotype || "").trim();
  const emergencyContactName = sanitizeClientText(settings?.emergencyContactName || "", { max: 120 }).trim();
  const emergencyContactPhoneNumber = String(settings?.emergencyContactPhoneNumber || "").trim();

  if (!displayName && requireAll) {
    errors.displayName = "Display name is required.";
  } else if (displayName && !/^[a-zA-Zs'.-]{2,120}$/.test(displayName)) {
    errors.displayName = minLengthError("Display name", 2);
  }
  if (!email && requireAll) {
    errors.email = "Email is required.";
  } else if (email && !isValidEmailAddress(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!phone && requireAll) {
    errors.phone = "Phone number is required.";
  } else if (phone && !isValidCustomerPhoneNumber(phone, { allowEmpty: false })) {
    errors.phone = exactLengthError("Phone number", 11);
  }
  if (!address && requireAll) {
    errors.address = "Address is required.";
  } else if (address && address.length < 5) {
    errors.address = minLengthError("Address", 5);
  }
  if (timezone && timezone.length < 2) {
    errors.timezone = minLengthError("Timezone", 2);
  }
  if (bloodGroup && !CUSTOMER_HEALTH_BLOOD_GROUP_OPTIONS.includes(bloodGroup)) {
    errors.bloodGroup = "Select a valid blood group.";
  }
  if (genotype && !CUSTOMER_HEALTH_GENOTYPE_OPTIONS.includes(genotype)) {
    errors.genotype = "Select a valid genotype.";
  }
  if (emergencyContactName && !emergencyContactPhoneNumber) {
    errors.emergencyContactPhoneNumber = "Emergency contact phone number is required when a name is added.";
  } else if (emergencyContactPhoneNumber && !isValidCustomerPhoneNumber(emergencyContactPhoneNumber, { allowEmpty: false })) {
    errors.emergencyContactPhoneNumber = exactLengthError("Emergency contact phone number", 11);
  }

  return errors;
}

const MTM_STEP_TITLES = {
  1: "Patient Details",
  2: "Emergency Contact Information",
  3: "Medical & Clinical History",
  4: "Medication Profile",
  5: "Medication Adherence Assessment",
  6: "Review Details",
};

const IV_THERAPY_STEP_TITLES = {
  1: "IV Therapy Patient Details",
  2: "IV Therapy Medical & Clinical History",
  3: "IV Therapy Selection",
  4: "IV Therapy Goals & Expectations",
  5: "IV Therapy Consent",
};

const MTM_ADHERENCE_OPTIONS = [
  "Forgetfulness",
  "Side Effects",
  "Complex Regimen",
  "Medication Cost",
  "Access Issues",
  "Low Understanding",
  "Cultural Concerns",
  "Other",
];

function defaultCustomerSettings() {
  return normalizeCustomerSettingsPayload({ timezone: storedStoreTimeZone() });
}

function readStoredCustomerSettingsPayload(sessionUser = null) {
  if (typeof window === "undefined") {
    return {};
  }
  const scopedKey = buildCustomerSettingsStorageKey(sessionUser);
  const scopedSettings = readCustomerStoragePayload(scopedKey);
  if (Object.keys(scopedSettings).length) {
    window.localStorage.removeItem(CUSTOMER_SETTINGS_KEY);
    return scopedSettings;
  }
  const legacySettings = readCustomerStoragePayload(CUSTOMER_SETTINGS_KEY);
  if (!scopedKey) {
    return {};
  }
  if (Object.keys(legacySettings).length) {
    if (isStoredCustomerSettingsOwnedBySession(legacySettings, sessionUser)) {
      window.localStorage.setItem(scopedKey, JSON.stringify(normalizeCustomerSettingsPayload(legacySettings)));
    }
    window.localStorage.removeItem(CUSTOMER_SETTINGS_KEY);
  }
  return readCustomerStoragePayload(scopedKey);
}

function loadCustomerSettings(sessionUser = null) {
  return normalizeCustomerSettingsPayload({
    ...defaultCustomerSettings(),
    ...readStoredCustomerSettingsPayload(sessionUser)
  });
}

function loadStorefrontSettings() {
  if (typeof window === "undefined") {
    return { livePaymentsEnabled: false, googleMeetEnabled: true, demoCheckoutFallbackEnabled: false };
  }
  try {
    return {
      livePaymentsEnabled: false,
      googleMeetEnabled: true,
      demoCheckoutFallbackEnabled: false,
      ...JSON.parse(window.localStorage.getItem(ADMIN_APPOINTMENT_SETTINGS_KEY) || "{}")
    };
  } catch {
    return { livePaymentsEnabled: false, googleMeetEnabled: true, demoCheckoutFallbackEnabled: false };
  }
}

function persistCustomerSettings(settings, sessionUser = null) {
  if (typeof window === "undefined") {
    return;
  }
  const scopedKey = buildCustomerSettingsStorageKey(sessionUser);
  if (!scopedKey) {
    return;
  }
  window.localStorage.setItem(scopedKey, JSON.stringify(normalizeCustomerSettingsPayload(settings)));
  window.localStorage.removeItem(CUSTOMER_SETTINGS_KEY);
}

export default function CustomerDashboard({ initialPage = "overview", initialMtmRequestId = "" } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { mutate: globalMutate } = useSWRConfig();
  const [page, setPage] = useState(pages.includes(initialPage) ? initialPage : "overview");
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [cacheKey, setCacheKey] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointmentRescheduleTarget, setAppointmentRescheduleTarget] = useState(null);
  const [consultationQuotaDismissed, setConsultationQuotaDismissed] = useState(false);
  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [profileImageRefreshing, setProfileImageRefreshing] = useState(false);
  const [pendingProfileAvatarUrl, setPendingProfileAvatarUrl] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageSuccess, setProfileImageSuccess] = useState("");
  const [profileImageCooldownUntil, setProfileImageCooldownUntil] = useState(0);
  const profileImageInputRef = useRef(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [appointmentActionBusy, setAppointmentActionBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [orderActionError, setOrderActionError] = useState("");
  const [refillOrderBusy, setRefillOrderBusy] = useState(null);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState("");
  const [desktopSearchPreviousPage, setDesktopSearchPreviousPage] = useState("overview");
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [desktopSearchActiveIndex, setDesktopSearchActiveIndex] = useState(-1);
  const desktopSearchRef = useRef(null);
  const [dashboardToast, setDashboardToast] = useState({ type: "", message: "" });
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [overviewProfilePromptVisible, setOverviewProfilePromptVisible] = useState(false);
  const profileReminderShownRef = useRef(false);
  const profileReminderSessionRef = useRef("");
  const profileReminderCloseRef = useRef(null);
  const [storeUrl, setStoreUrl] = useState("#");
  const [appointmentsData, setAppointmentsData] = useState(null);
  const [appointmentsLoadingState, setAppointmentsLoadingState] = useState(false);
  const [journey, setJourney] = useState(createJourneyState());
  const [guestConsultationDraft, setGuestConsultationDraft] = useState(null);
  const [reviewDeepLinkHandled, setReviewDeepLinkHandled] = useState(false);
  const [settings, setSettings] = useState(() => defaultCustomerSettings());
  const customerSettingsHydratedRef = useRef(false);
  const [customerSettingsHydrated, setCustomerSettingsHydrated] = useState(false);
  const customerSettingsFingerprintRef = useRef(JSON.stringify(defaultCustomerSettings()));
  const customerSettingsSessionRef = useRef("");
  const guestConsultationDraftHandledRef = useRef(false);
  const [isCustomerMobile, setIsCustomerMobile] = useState(true);
  const storefrontSettings = useMemo(() => loadStorefrontSettings(), []);
  const minimumBookingMinutes = useMemo(() => normalizeBookingMinutes(storefrontSettings.minimumConsultationMinutes), [storefrontSettings.minimumConsultationMinutes]);

  useEffect(() => {
    setDocumentMetadata(`Nevari Patient | ${pageLabels[page] || titleCase(page)}`, `${pageLabels[page] || titleCase(page)} view for the Nevari Patient dashboard.`);
  }, [page]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsCustomerMobile(true);
      return undefined;
    }

    const mediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia(`(max-width: ${CUSTOMER_MOBILE_BREAKPOINT}px)`)
      : null;
    const syncCustomerMobile = () => setIsCustomerMobile(
      Boolean(mediaQuery?.matches) || isCustomerMobileViewport()
    );

    syncCustomerMobile();
    window.addEventListener("resize", syncCustomerMobile);
    window.visualViewport?.addEventListener("resize", syncCustomerMobile);
    mediaQuery?.addEventListener?.("change", syncCustomerMobile);

    return () => {
      window.removeEventListener("resize", syncCustomerMobile);
      window.visualViewport?.removeEventListener("resize", syncCustomerMobile);
      mediaQuery?.removeEventListener?.("change", syncCustomerMobile);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { body } = document;
    if (isCustomerMobile) {
      body.classList.add("customer-mobile-mode");
      return () => body.classList.remove("customer-mobile-mode");
    }
    body.classList.remove("customer-mobile-mode");
    return undefined;
  }, [isCustomerMobile]);

  useEffect(() => {
    if (!dashboardToast.message || typeof window === "undefined") {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setDashboardToast({ type: "", message: "" }), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [dashboardToast]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    function handleOutside(event) {
      if (!desktopSearchRef.current?.contains(event.target)) {
        setDesktopSearchOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setDesktopSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const normalizedSettings = normalizeCustomerSettingsPayload(settings);
    if (customerSettingsHydratedRef.current && session?.user) {
      persistCustomerSettings(normalizedSettings, session.user);
    }
    if (!session?.accessToken || !customerSettingsHydratedRef.current || typeof window === "undefined") {
      return undefined;
    }
    const nextFingerprint = JSON.stringify(normalizedSettings);
    if (nextFingerprint === customerSettingsFingerprintRef.current) {
      return undefined;
    }
    const timeoutId = window.setTimeout(async () => {
      try {
        const savedSettings = normalizeCustomerSettingsPayload(await updateCustomerSettings(session, normalizedSettings));
        customerSettingsFingerprintRef.current = JSON.stringify(savedSettings);
        persistCustomerSettings(savedSettings, session.user);
        setSettings((current) => {
          const currentFingerprint = JSON.stringify(normalizeCustomerSettingsPayload(current));
          return currentFingerprint === customerSettingsFingerprintRef.current ? current : savedSettings;
        });
      } catch (error) {
        console.error("Unable to save customer settings.", error);
      }
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [session, settings]);

  useEffect(() => {
    const hydratedSession = hydrateStoredSession("patient");
    setStoreUrl(hydratedSession.baseUrl || "#");
    if (!hydratedSession.baseUrl) {
      setAuthResolved(true);
      router.replace(FRONTENDS.patient.loginPath);
      return;
    }
    const roles = resolveUserRoles(hydratedSession.user);
    if (!hydratedSession.accessToken || !roles.some((role) => ["customer", "patient"].includes(role))) {
      setAuthResolved(true);
      router.replace("/login");
      return;
    }
    setSession(hydratedSession);
    const cacheUserKey = hydratedSession.user?.id || hydratedSession.user?.email || hydratedSession.user?.username || null;
    setCacheKey(cacheUserKey ? buildDashboardCacheKey("patient", CUSTOMER_DASHBOARD_CACHE_SCOPE, String(cacheUserKey)) : null);
    setAuthResolved(true);
  }, [router]);

  useEffect(() => {
    if (!authResolved || guestConsultationDraftHandledRef.current || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("prefill_booking") !== "1") {
      return;
    }
    guestConsultationDraftHandledRef.current = true;
    setPage("appointment");
    const draft = readGuestConsultationDraft();
    if (draft) {
      setGuestConsultationDraft(draft);
      clearGuestConsultationDraft();
    }
    params.delete("prefill_booking");
    params.delete("from");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [authResolved]);

  useEffect(() => {
    if (!authResolved || typeof window === "undefined") {
      return;
    }
    const activePath = String(pathname || window.location.pathname || "").trim();
    if (!/^\/dashboard\/?$/.test(activePath)) {
      return;
    }
    const currentUrl = new URL(window.location.href);
    const nextPageParam = page === "overview" ? "" : page;
    const currentPageParam = String(currentUrl.searchParams.get("page") || "").trim();
    if (nextPageParam) {
      currentUrl.searchParams.set("page", nextPageParam);
    } else {
      currentUrl.searchParams.delete("page");
    }
    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentLocation === nextUrl && currentPageParam === nextPageParam) {
      return;
    }
    router.replace(nextUrl);
  }, [authResolved, page, pathname, router]);

  useEffect(() => {
    const nextSessionKey = resolveCustomerSessionStorageIdentity(session?.user);
    if (customerSettingsSessionRef.current === nextSessionKey) {
      return;
    }
    customerSettingsSessionRef.current = nextSessionKey;
    customerSettingsHydratedRef.current = false;
    setCustomerSettingsHydrated(false);
    customerSettingsFingerprintRef.current = JSON.stringify(loadCustomerSettings(session?.user));
    setSettings(defaultCustomerSettings());
  }, [session?.user]);

  const cachedCustomerState = (cacheKey && isSessionUsable(session))
    ? readDashboardCache(cacheKey, DASHBOARD_CACHE_TTL_MS)?.state
    : null;
  const bootstrapCustomerState = useMemo(
    () => buildCustomerBootstrapState(session, settings, cachedCustomerState || emptyCustomerState),
    [cachedCustomerState, session, settings]
  );
  const customerSummaryKey = session
    ? swrKeys.proxy.path("/customer-dashboard/summary", withSessionCacheScope(session))
    : null;
  const customerOrdersKey = session && ["orders", "settings", "profile", "search"].includes(page)
    ? swrKeys.proxy.path("/orders", withBaseUrl(session, { per_page: 24, page: 1 }))
    : null;
  const customerAppointmentsEnabled = Boolean(session) && ["overview", "appointment", "settings", "profile", "search"].includes(page);
  const customerDoctorsKey = session && ["settings", "search"].includes(page)
    ? swrKeys.proxy.path("/doctors", withBaseUrl(session, { per_page: 24, page: 1 }))
    : null;
  const { data: summaryState = emptyCustomerState, mutate: mutateSummary, isLoading } = useSWR(
    customerSummaryKey,
    () => fetchCustomerDashboardPayload(session, settings, bootstrapCustomerState),
    {
      fallbackData: bootstrapCustomerState,
      refreshInterval: CUSTOMER_DASHBOARD_REFRESH_MS,
      revalidateOnFocus: false,
      onSuccess: (nextState) => {
        const cachedState = pendingProfileAvatarUrl
          && profileAvatarUrlKey(nextState?.dashboard?.profile?.avatar_url || nextState?.dashboard?.profile?.profile_image) !== profileAvatarUrlKey(pendingProfileAvatarUrl)
          ? patchCustomerProfileAvatarState(nextState, pendingProfileAvatarUrl)
          : nextState;
        if (cacheKey) {
          writeDashboardCache(cacheKey, { state: cachedState });
        }
      }
    }
  );
  const ordersQuery = useSWR(
    customerOrdersKey,
    () => fetchCustomerOrders(session),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true }
  );
  const doctorsQuery = useSWR(
    customerDoctorsKey,
    () => fetchCustomerDoctors(session),
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true }
  );

  async function reloadAppointments(activeSession = session) {
    if (!activeSession || !customerAppointmentsEnabled) {
      setAppointmentsData(null);
      setAppointmentsLoadingState(false);
      return [];
    }
    setAppointmentsLoadingState(true);
    try {
      const nextAppointments = await fetchCustomerAppointments(activeSession);
      setAppointmentsData(Array.isArray(nextAppointments) ? nextAppointments : []);
      return Array.isArray(nextAppointments) ? nextAppointments : [];
    } finally {
      setAppointmentsLoadingState(false);
    }
  }

  async function mutateAppointments(updater, { revalidate = false } = {}) {
    let nextSnapshot = null;
    setAppointmentsData((current) => {
      const base = Array.isArray(current) ? current : (summaryState.appointments || []);
      const next = typeof updater === "function" ? updater(base) : updater;
      nextSnapshot = Array.isArray(next) ? next : base;
      return nextSnapshot;
    });
    if (revalidate) {
      return reloadAppointments();
    }
    return nextSnapshot;
  }

  useEffect(() => {
    if (!customerAppointmentsEnabled) {
      setAppointmentsData(null);
      setAppointmentsLoadingState(false);
      return;
    }
    reloadAppointments();
  }, [customerAppointmentsEnabled, session]);

  const state = useMemo(() => ({
    ...summaryState,
    orders: ordersQuery.data || summaryState.orders || [],
    appointments: appointmentsData || summaryState.appointments || [],
    doctors: doctorsQuery.data || summaryState.doctors || [],
    doctorsUnavailable: doctorsQuery.data ? !doctorsQuery.data.length : summaryState.doctorsUnavailable
  }), [appointmentsData, doctorsQuery.data, ordersQuery.data, summaryState]);
  const mutate = async (updater, options) => {
    await mutateSummary(updater, options);
    if (page === "orders") {
      await ordersQuery.mutate();
    }
  };

  function patchCustomerOrderCache(order, { remove = false } = {}) {
    globalMutate(isProxyOrdersKey, (current) => updateListPayload(current, (list) => (
      remove ? removeById(list, order?.id || order) : upsertById(list, order)
    )), { revalidate: false });
  }

  function patchCustomerAppointmentCache(appointment) {
    setAppointmentsData((current) => {
      const base = Array.isArray(current) ? current : (summaryState.appointments || []);
      return upsertById(base, appointment);
    });
  }

  function patchCustomerDoctorCache(doctor) {
    globalMutate(isProxyDoctorsKey, (current) => updateListPayload(current, (list) => replaceById(list, doctor)), { revalidate: false });
  }

  function revalidateCustomerGroups(...predicates) {
    predicates.forEach((predicate) => {
      if (predicate === isProxyAppointmentsKey) {
        reloadAppointments();
        return;
      }
      globalMutate(predicate, undefined, { revalidate: true });
    });
  }

  const baseProfile = state.dashboard?.profile || {};
  const confirmedProfileAvatarUrl = normalizeProfileAvatarUrl(baseProfile.avatar_url || baseProfile.profile_image);
  const fallbackProfileAvatarUrl = normalizeProfileAvatarUrl(session?.user?.avatar_url || session?.user?.avatarUrl || session?.user?.picture);
  const resolvedProfileAvatarUrl = pendingProfileAvatarUrl && profileAvatarUrlKey(confirmedProfileAvatarUrl) !== profileAvatarUrlKey(pendingProfileAvatarUrl)
    ? pendingProfileAvatarUrl
    : (confirmedProfileAvatarUrl || fallbackProfileAvatarUrl);
  const profile = useMemo(() => ({
    ...baseProfile,
    avatar_url: resolvedProfileAvatarUrl,
    profile_image: resolvedProfileAvatarUrl || normalizeProfileAvatarUrl(baseProfile.profile_image),
  }), [baseProfile, resolvedProfileAvatarUrl]);
  const customerDisplayName = resolveCustomerPreferredName({
    settingsDisplayName: settings.displayName,
    profile,
    sessionUser: session?.user,
  });
  const customerFullName = resolveCustomerFullName(profile, session?.user, customerDisplayName);
  const customerEmailAddress = String(profile.email || session?.user?.email || settings.email || "No email available").trim() || "No email available";
  const customerProfileCompletion = useMemo(() => getCustomerProfileCompletion(settings, profile), [profile, settings]);
  const customerProfileReminderItems = useMemo(() => getCustomerProfileReminderItems(customerProfileCompletion.missingLabels), [customerProfileCompletion.missingLabels]);

  useEffect(() => {
    if (pendingProfileAvatarUrl && confirmedProfileAvatarUrl && profileAvatarUrlKey(confirmedProfileAvatarUrl) === profileAvatarUrlKey(pendingProfileAvatarUrl)) {
      setPendingProfileAvatarUrl("");
      setProfileImageRefreshing(false);
    }
  }, [confirmedProfileAvatarUrl, pendingProfileAvatarUrl]);

  function showDashboardToast(message, type = "success") {
    setDashboardToast({ type, message: String(message || "").trim() });
  }

  async function persistCustomerProfileSettings(nextSettings, { successMessage = "Profile updated successfully.", errorMessage = "Something went wrong. Please try again." } = {}) {
    if (!session?.accessToken) {
      throw new Error("Your session expired. Please log in again.");
    }
    const normalizedSettings = normalizeCustomerSettingsPayload(nextSettings);
    const errors = getCustomerSettingsFieldErrors(normalizedSettings, { requireAll: true });
    if (Object.keys(errors).length) {
      const validationError = new Error("Please review the highlighted fields.");
      validationError.fieldErrors = errors;
      throw validationError;
    }

    setProfileSaveBusy(true);
    setProfileSaveError("");
    try {
      const savedSettings = normalizeCustomerSettingsPayload(await updateCustomerSettings(session, normalizedSettings));
      customerSettingsFingerprintRef.current = JSON.stringify(savedSettings);
      persistCustomerSettings(savedSettings, session.user);
      setSettings(savedSettings);
      showDashboardToast(successMessage, "success");
      return savedSettings;
    } catch (error) {
      const message = error?.message || errorMessage;
      setProfileSaveError(message);
      showDashboardToast(message, "error");
      throw error;
    } finally {
      setProfileSaveBusy(false);
    }
  }

  async function handleProfileImageSelected(fileOrEvent) {
    const preparedUpload = fileOrEvent && typeof fileOrEvent === "object" && typeof fileOrEvent.data_base64 === "string"
      ? fileOrEvent
      : null;
    const file = preparedUpload?.file || fileOrEvent?.target?.files?.[0] || fileOrEvent || null;
    const nextInput = fileOrEvent?.target || profileImageInputRef.current;
    let uploadedAvatarUrl = "";
    setProfileImageError("");
        setProfileImageSuccess("");
            setProfileImageCooldownUntil(0);
            if (!preparedUpload) {
      const validationMessage = validateCustomerProfileImageFile(file);
      if (validationMessage) {
        setProfileImageError(validationMessage);
        if (nextInput) {
          nextInput.value = "";
        }
        return false;
      }
    }
    setProfileImageSaving(true);
    setProfileImageRefreshing(false);
    try {
      const payload = preparedUpload
        ? {
            filename: preparedUpload.filename,
            mime_type: preparedUpload.mime_type,
            data_base64: preparedUpload.data_base64,
          }
        : {
            filename: file.name,
            mime_type: file.type,
            data_base64: await readFileAsBase64(file),
          };
      const result = await uploadCustomerProfileImage(session, payload);
      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || "");
      if (uploadedAvatarUrl) {
        const refreshedAvatarUrl = withProfileAvatarRefreshToken(uploadedAvatarUrl, Date.now());
        setPendingProfileAvatarUrl(refreshedAvatarUrl);
        setProfileImageRefreshing(true);
        await mutateSummary((current) => patchCustomerProfileAvatarState(current, refreshedAvatarUrl), { revalidate: false });
        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
        persistPatientSessionAvatar(refreshedAvatarUrl);
        if (cacheKey) {
          writeDashboardCache(cacheKey, {
            state: patchCustomerProfileAvatarState(summaryState, refreshedAvatarUrl),
          });
        }
      }
      setProfileImageSuccess("Profile image updated successfully.");
      showDashboardToast("Profile image updated successfully.", "success");
      if (customerSummaryKey) {
        void globalMutate(customerSummaryKey).then((refreshedState) => {
          const refreshedAvatarUrl = normalizeProfileAvatarUrl(
            refreshedState?.dashboard?.profile?.avatar_url
            || refreshedState?.dashboard?.profile?.profile_image
            || refreshedState?.profile?.avatar_url
            || refreshedState?.profile?.profile_image
          );
          if (uploadedAvatarUrl && profileAvatarUrlKey(refreshedAvatarUrl) === profileAvatarUrlKey(uploadedAvatarUrl)) {
            setPendingProfileAvatarUrl("");
          }
        }).finally(() => {
          setProfileImageRefreshing(false);
        });
      } else {
        setProfileImageRefreshing(false);
      }
      return true;
    } catch (error) {
      setProfileImageRefreshing(false);
      if (!uploadedAvatarUrl) {
        setPendingProfileAvatarUrl("");
      }
      const retrySeconds = getProfileImageRateLimitRetrySeconds(error);
      if (retrySeconds > 0) {
        setProfileImageCooldownUntil(Date.now() + (retrySeconds * 1000));
      }
      const message = describeProfileImageUploadError(error);
      setProfileImageError(message);
      showDashboardToast(message, "error");
      return false;
    } finally {
      setProfileImageSaving(false);
      if (nextInput) {
        nextInput.value = "";
      }
    }
  }

  useEffect(() => {
    const sessionIdentity = resolveCustomerSessionStorageIdentity(session?.user);
    if (!sessionIdentity) {
      profileReminderSessionRef.current = "";
      profileReminderShownRef.current = false;
      setOverviewProfilePromptVisible(false);
      return undefined;
    }
    if (profileReminderSessionRef.current !== sessionIdentity) {
      profileReminderSessionRef.current = sessionIdentity;
      profileReminderShownRef.current = false;
    }
    if (!authResolved || page !== "overview" || !customerSettingsHydrated || customerProfileCompletion.isComplete || profileReminderShownRef.current || !customerProfileReminderItems.length) {
      if (customerProfileCompletion.isComplete) {
        setOverviewProfilePromptVisible(false);
      }
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      profileReminderShownRef.current = true;
      setOverviewProfilePromptVisible(true);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [authResolved, customerProfileCompletion.isComplete, customerProfileReminderItems.length, customerSettingsHydrated, page, session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (!overviewProfilePromptVisible || typeof document === "undefined") {
      return undefined;
    }
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        dismissOverviewProfilePrompt();
      }
    };
    document.addEventListener("keydown", handleEscape);
    window.setTimeout(() => profileReminderCloseRef.current?.focus?.(), 0);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [overviewProfilePromptVisible]);

  function dismissOverviewProfilePrompt() {
    setOverviewProfilePromptVisible(false);
  }
  useEffect(() => {
    if (!resolveCustomerSessionStorageIdentity(session?.user) || customerSettingsHydratedRef.current) {
      return;
    }
    const summarySettings = normalizeCustomerSettingsPayload(summaryState.settings || state.dashboard?.settings || {});
    const storedSettingsPayload = readStoredCustomerSettingsPayload(session.user);
    const storedSettings = normalizeCustomerSettingsPayload(storedSettingsPayload);
    const storedSettingKeys = new Set(Object.keys(storedSettingsPayload));
    const mergedSettings = normalizeCustomerSettingsPayload({
      ...defaultCustomerSettings(),
      ...summarySettings,
      displayName: summarySettings.displayName || customerDisplayName,
      email: summarySettings.email || profile.email || session.user?.email || settings.email || "",
      phone: summarySettings.phone || profile.phone || settings.phone || "",
      address: summarySettings.address || profile.address || settings.address || "",
      timezone: summarySettings.timezone || settings.timezone || storedStoreTimeZone(),
    });
    Object.keys(storedSettingsPayload).forEach((key) => {
      if (storedSettingKeys.has(key) && Object.prototype.hasOwnProperty.call(mergedSettings, key)) {
        mergedSettings[key] = storedSettings[key];
      }
    });
    customerSettingsHydratedRef.current = true;
    setCustomerSettingsHydrated(true);
    customerSettingsFingerprintRef.current = JSON.stringify(mergedSettings);
    persistCustomerSettings(mergedSettings, session.user);
    setSettings(mergedSettings);
  }, [customerDisplayName, profile.address, profile.email, profile.phone, session?.user, settings, state.dashboard?.settings, summaryState.settings]);
  const visibleDoctors = useMemo(() => sortPreferredDoctors(state.doctors, settings.preferredDoctorIds), [settings.preferredDoctorIds, state.doctors]);
  const subscriptionState = useSubscription(session);
  const mtmRequestsKey = session && page === "therapy"
    ? swrKeys.proxy.path("/mtm-requests", withBaseUrl(session))
    : null;
  const nurseRequestsKey = session && page === "request"
    ? swrKeys.proxy.path("/nurse-requests", withBaseUrl(session))
    : null;
  const ivTherapyRequestsKey = session && page === "iv-therapy"
    ? swrKeys.proxy.path("/iv-therapy-requests", withBaseUrl(session))
    : null;
  const mtmRequestsQuery = useSWR(
    mtmRequestsKey,
    () => fetchCustomerMtmRequests(session),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true }
  );
  const nurseRequestsQuery = useSWR(
    nurseRequestsKey,
    () => fetchCustomerNurseRequests(session),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true }
  );
  const ivTherapyRequestsQuery = useSWR(
    ivTherapyRequestsKey,
    () => fetchCustomerIvTherapyRequests(session),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true }
  );
  const mtmRequests = mtmRequestsQuery.data || [];
  const nurseRequests = nurseRequestsQuery.data || [];
  const ivTherapyRequests = ivTherapyRequestsQuery.data || [];
  useEffect(() => {
    rememberStoreContext(state.dashboard || {});
  }, [state.dashboard]);

  useEffect(() => {
    if (reviewDeepLinkHandled || !session || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("review") !== "1") {
      return;
    }
    const appointmentId = params.get("appointment_id");
    const linkedAppointment = appointmentId
      ? state.appointments.find((appointment) => String(appointment.id) === String(appointmentId))
      : null;
    const doctorId = params.get("doctor_id") || linkedAppointment?.doctor_user_id || linkedAppointment?.doctor?.id;
    if (!doctorId) {
      return;
    }
    const doctor = visibleDoctors.find((item) => String(item.user_id || item.id) === String(doctorId)) || {
      id: doctorId,
      user_id: doctorId,
      display_name: linkedAppointment?.doctor_name || linkedAppointment?.doctor?.display_name || "Doctor",
      specialty: linkedAppointment?.consultation_type || "Consultation"
    };
    setReviewDeepLinkHandled(true);
    openDoctorReviews(doctor);
  }, [reviewDeepLinkHandled, session, state.appointments, visibleDoctors]);

  const storeCurrency = state.dashboard?.store_currency || SSR_SAFE_STORE_CURRENCY;
  const storeTimeZone = state.dashboard?.store_timezone || SSR_SAFE_STORE_TIMEZONE;
  const dashboardRevealSignature = useMemo(
    () => buildSWRRevealSignature([
      state.orders,
      state.appointments,
      state.doctors,
      mtmRequests,
      nurseRequests,
      ivTherapyRequests
    ]),
    [ivTherapyRequests, mtmRequests, nurseRequests, state.appointments, state.doctors, state.orders]
  );
  const dashboardRevealActive = useSWRReveal(dashboardRevealSignature, { durationMs: 260 });
  const dashboardRevealClassName = `dashboard-swr-reveal ${dashboardRevealActive ? "is-active" : ""}`.trim();

  useEffect(() => {
    if (storeTimeZone && settings.timezone !== storeTimeZone) {
      setSettings((current) => ({ ...current, timezone: storeTimeZone }));
    }
  }, [settings.timezone, storeTimeZone]);
  const orderCounts = useMemo(() => ({
    total: state.orders.length,
    pending: state.orders.filter((order) => order.status === "pending").length,
    processing: state.orders.filter((order) => order.status === "processing").length,
    completed: state.orders.filter((order) => order.status === "completed").length
  }), [state.orders]);
  const spentThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return state.orders
      .filter((order) => {
        const created = new Date(order.created_at || 0);
        return !Number.isNaN(created.getTime())
          && created >= monthStart
          && ["processing", "completed"].includes(String(order.status || "").toLowerCase());
      })
      .reduce((total, order) => total + Number(order.total || 0), 0);
  }, [state.orders]);
  useEffect(() => {
    const normalizedQuery = desktopSearchQuery.trim();
    setDesktopSearchActiveIndex(-1);
    if (normalizedQuery.length < 3) {
      setDebouncedSearchQuery("");
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setDebouncedSearchQuery(normalizedQuery.slice(0, 80)), 180);
    return () => window.clearTimeout(timeoutId);
  }, [desktopSearchQuery]);

  const patientSearchKey = session && debouncedSearchQuery.length >= 3
    ? swrKeys.proxy.path("/dashboard/patient/search", withSessionCacheScope(session, { q: debouncedSearchQuery, limit: 20 }))
    : null;
  const patientSearchQuery = useSWR(
    patientSearchKey,
    () => fetchCustomerSearch(session, debouncedSearchQuery, 20),
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 10_000 }
  );
  const desktopSearchResults = useMemo(() => (Array.isArray(patientSearchQuery.data) ? patientSearchQuery.data : []).map((item, index) => ({
    key: `patient-search-${item.type || "result"}-${item.id || index}`,
    area: item.area || "Dashboard",
    label: item.title || "Result",
    meta: item.meta || "",
    onSelect: () => {
      const destinationMap = { "nurse-request": "request", subscription: "subscription-management" };
      const destination = destinationMap[item.destination] || item.destination || "overview";
      setDesktopSearchQuery("");
      setDesktopSearchOpen(false);
      if (item.type === "order") {
        const order = state.orders.find((entry) => String(entry.id) === String(item.id));
        if (order) {
          setExpandedOrderId(order.id);
          setSelectedOrder(order);
        }
      } else if (item.type === "appointment") {
        const appointment = state.appointments.find((entry) => String(entry.id) === String(item.id));
        if (appointment) setSelectedAppointment(appointment);
      } else if (item.type === "doctor") {
        const doctor = visibleDoctors.find((entry) => String(entry.user_id || entry.id) === String(item.id));
        if (doctor) {
          openDoctorAvailability(doctor);
          return;
        }
      }
      if (pages.includes(destination) || destination === "search") setPage(destination);
      else setPage("overview");
    }
  })), [openDoctorAvailability, patientSearchQuery.data, state.appointments, state.orders, visibleDoctors]);  const now = Date.now();
  const sortedAppointments = useMemo(() => sortByDateDesc(state.appointments, ["start_at", "created_at", "updated_at"]), [state.appointments]);
  const upcomingAppointments = sortedAppointments.filter((appointment) => appointmentBelongsToUpcomingList(appointment, now));
  const pastAppointments = sortedAppointments.filter((appointment) => appointmentBelongsToPastList(appointment, now));
  const selectedDoctor = visibleDoctors.find((doctor) => String(doctor.user_id || doctor.id) === String(journey.doctorId)) || null;
  const pageQueryLoading = (
    (page === "orders" && ordersQuery.isLoading && !ordersQuery.data) ||
    (page === "settings" && ((ordersQuery.isLoading && !ordersQuery.data) || (appointmentsLoadingState && !appointmentsData)))
  );
  const ordersLoading = Boolean(customerOrdersKey) && ordersQuery.isLoading && !Array.isArray(ordersQuery.data);
  const appointmentsLoading = customerAppointmentsEnabled && appointmentsLoadingState && !Array.isArray(appointmentsData);
  const doctorsLoading = Boolean(customerDoctorsKey) && doctorsQuery.isLoading && !Array.isArray(doctorsQuery.data);
  const showSkeleton = (isLoading && !hasCustomerDashboardData(state)) || pageQueryLoading;
  const appointmentPageLoading = page === "appointment"
    && (
      appointmentsLoading
      || (!appointmentsData && (!Array.isArray(state.appointments) || !state.appointments.length))
    );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const fitStats = () => {
      document.querySelectorAll(".overview-action-value, .customer-mobile-stat-card strong, .customer-stat-card strong, .customer-status-tile strong").forEach((node) => {
        fitTextToContainer(node, { minFontSize: 12, step: 0.5 });
      });
    };
    fitStats();
    window.addEventListener("resize", fitStats);
    return () => window.removeEventListener("resize", fitStats);
  }, [showSkeleton, page, orderCounts.total, spentThisMonth, state.appointments.length, state.orders.length]);

  if (!authResolved) {
    return null;
  }

  function openDesktopSearch(nextValue = desktopSearchQuery) {
    if (page !== "search") {
      setDesktopSearchPreviousPage(page);
    }
    setDesktopSearchQuery(sanitizeClientText(nextValue, { max: 120 }));
    setPage("search");
  }

  function navigateToPage(nextPage) {
    const safePage = pages.includes(nextPage) ? nextPage : "overview";
    setPage(safePage);
    router.push(customerDashboardPagePath(safePage));
  }

  function closeDesktopSearch() {
    setDesktopSearchQuery("");
    setPage(desktopSearchPreviousPage || "overview");
  }

  function openOrderDocuments(order) {
    if (!order?.id) return;
    router.push(`/admin/orders/${order.id}/documents?role=patient`);
  }

  async function cancelPendingOrder(order) {
    setOrderActionError("");
    const optimisticOrder = { ...order, status: "cancelled" };
    await mutateSummary((current) => current ? { ...current, orders: current.orders.map((item) => item.id === order.id ? optimisticOrder : item) } : current, { revalidate: false });
    await ordersQuery.mutate((current) => Array.isArray(current) ? current.map((item) => item.id === order.id ? optimisticOrder : item) : current, { revalidate: false });
    patchCustomerOrderCache(optimisticOrder);
    try {
      const next = await apiRequest(session, `/orders/${order.id}/cancel`, { method: "POST" });
      await mutateSummary((current) => current ? { ...current, orders: current.orders.map((item) => item.id === next.id ? next : item) } : current, { revalidate: false });
      await ordersQuery.mutate((current) => Array.isArray(current) ? current.map((item) => item.id === next.id ? next : item) : current, { revalidate: false });
      patchCustomerOrderCache(next);
      revalidateCustomerGroups(isProxyOrdersKey);
    } catch (error) {
      await mutateSummary((current) => current ? { ...current, orders: current.orders.map((item) => item.id === order.id ? order : item) } : current, { revalidate: false });
      await ordersQuery.mutate((current) => Array.isArray(current) ? current.map((item) => item.id === order.id ? order : item) : current, { revalidate: false });
      patchCustomerOrderCache(order);
      throw error;
    }
  }

  async function refillOrder(order) {
    setOrderActionError("");
    if (!order?.id) {
      return;
    }
    let canCreateRefill = Boolean(subscriptionState.canRefill);
    if (!canCreateRefill && subscriptionState.isLoading) {
      const refreshedSubscription = await subscriptionState.refresh();
      canCreateRefill = Boolean(refreshedSubscription?.can_refill || refreshedSubscription?.canRefill);
    }
    if (!canCreateRefill) {
      setSelectedOrder(null);
      setPage("therapy");
      return;
    }

    setRefillOrderBusy(order.id);
    try {
      const next = await apiRequest(session, `/orders/${order.id}/refill`, { method: "POST" });
      await mutateSummary((current) => current ? { ...current, orders: upsertById(current.orders || [], next) } : current, { revalidate: false });
      await ordersQuery.mutate((current) => Array.isArray(current) ? upsertById(current, next) : current, { revalidate: false });
      patchCustomerOrderCache(next);
      setSelectedOrder(next);
      setPage("orders");
      revalidateCustomerGroups(isProxyOrdersKey);
    } catch (error) {
      if (error?.code === "upgrade_required" || Number(error?.status || 0) === 403) {
        setSelectedOrder(null);
        setPage("therapy");
        return;
      }
      setOrderActionError(String(error?.message || "The refill order could not be created."));
    } finally {
      setRefillOrderBusy(null);
    }
  }

  async function openDoctorAvailability(doctor) {
    const doctorId = doctor.user_id || doctor.id;
    const nextDate = journey.doctorId === doctorId ? journey.selectedDate : localDateKey(new Date());
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setJourney({
      ...createJourneyState(),
      mode: "slots",
      doctorId,
      selectedDate: nextDate,
      durationMinutes: minimumBookingMinutes,
      loading: true
    });
    try {
      const availability = await apiRequest(session, `/doctors/${doctorId}/availability`, { params: { date: nextDate } });
      const slots = Array.isArray(availability?.slots) ? availability.slots : [];
      setJourney((current) => ({
        ...current,
        mode: "slots",
        doctorId,
        selectedDate: nextDate,
        slots,
        loading: false,
        error: slots.length ? "" : "Doctor not available"
      }));
    } catch (error) {
      setJourney((current) => ({
        ...current,
        mode: "slots",
        doctorId,
        selectedDate: nextDate,
        slots: [],
        loading: false,
        error: error?.message || "Doctor availability could not be loaded."
      }));
    }
  }

  async function updateAvailabilityDate(nextDate) {
    if (!journey.doctorId) {
      return;
    }
    const session = hydrateStoredSession("patient");
    setJourney((current) => ({ ...current, selectedDate: nextDate, selectedSlot: null, loading: true, error: "" }));
    try {
      const availability = await apiRequest(session, `/doctors/${journey.doctorId}/availability`, { params: { date: nextDate } });
      const slots = Array.isArray(availability?.slots) ? availability.slots : [];
      setJourney((current) => ({
        ...current,
        selectedDate: nextDate,
        slots,
        selectedSlot: null,
        loading: false,
        error: slots.length ? "" : "Doctor not available"
      }));
    } catch (error) {
      setJourney((current) => ({
        ...current,
        selectedDate: nextDate,
        slots: [],
        selectedSlot: null,
        loading: false,
        error: error?.message || "Slots could not be refreshed."
      }));
    }
  }

  async function createAppointmentCheckout(override = null) {
    const activeSlot = override?.selectedSlot || journey.selectedSlot;
    const activeDuration = override?.durationMinutes || journey.durationMinutes || minimumBookingMinutes;
    const activeReason = sanitizeClientText(override?.reason ?? journey.reason, { max: 500 }).trim() || "Doctor consultation booking";
    const activeDoctorId = override?.doctorId ?? journey.doctorId;
    if (!activeSlot) {
      return { ok: false, error: "Select an appointment time before continuing." };
    }
    const session = hydrateStoredSession("patient");
    setJourney((current) => ({ ...current, loading: true, progressStage: "securing_slot", error: "" }));
    try {
      const { date, time } = extractLocalDateTimeParts(activeSlot.start_at);
      const selectedEpochMs = date && time ? new Date(`${date}T${time}:00`).getTime() : Number.NaN;
      if (!date || !time || Number.isNaN(selectedEpochMs)) {
        throw new Error("Select a valid appointment date and time.");
      }
      const payload = {
        date,
        time,
        durationMinutes: activeDuration,
        reason: activeReason,
        selectedEpochMs,
        clientNowMs: Date.now(),
          customerEmail: profile.email || settings.email || "",
          customerName: settings.displayName || profile.display_name || "",
          baseUrl: session?.baseUrl || "",
          adminEmail: "careteam@nevarihealth.com",
          appOrigin: typeof window !== "undefined" ? window.location.origin : ""
        };
      if (activeDoctorId) {
        payload.doctorId = String(activeDoctorId);
      }
      const response = await fetch("/api/customer/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await readCustomerNextApiResponse(response, "Unable to book appointment right now.");
      setJourney((current) => ({ ...current, progressStage: "confirming_appointment" }));
      const resolvedAppointment = result?.appointment;
      if (!resolvedAppointment) {
        throw new Error("Unable to book appointment right now.");
      }
      const checkout = result?.checkout || null;
      const confirmation = result?.confirmation || null;
      const resolvedPaymentStatus = String(
        confirmation?.appointment?.payment_status
        || checkout?.payment_status
        || resolvedAppointment?.payment_status
        || ""
      ).toLowerCase();
      const isConfirmed = Boolean(
        confirmation?.is_confirmed
        || String(confirmation?.appointment?.status || resolvedAppointment?.status || "").toLowerCase() === "confirmed"
        || resolvedPaymentStatus === "paid"
      );
      if (isConfirmed) {
        fetch("/api/customer/appointments/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: confirmation?.appointment?.id || resolvedAppointment.id,
            baseUrl: session?.baseUrl || "",
            customerEmail: profile.email || settings.email || "",
            customerName: settings.displayName || profile.display_name || "",
            adminEmail: "careteam@nevarihealth.com"
          })
        }).then((response) => {
          if (response.status === 401) {
            forcePatientLogoutToLogin();
          }
        }).catch(() => {});
        setJourney((current) => ({
          ...current,
          mode: "confirmation",
          appointment: confirmation?.appointment || resolvedAppointment,
          checkout,
          confirmation,
          loading: false,
          progressStage: "",
          error: ""
        }));
        patchCustomerAppointmentCache(confirmation?.appointment || resolvedAppointment);
        await mutateSummary((current) => current ? { ...current, appointments: upsertById(current.appointments || [], confirmation?.appointment || resolvedAppointment) } : current, { revalidate: false });
        await mutateAppointments((current) => upsertById(current, confirmation?.appointment || resolvedAppointment));
        await subscriptionState?.refresh?.().catch(() => null);
        revalidateCustomerGroups(isProxyAppointmentsKey, isProxyOrdersKey);
        return { ok: true, mode: "confirmation", appointment: confirmation?.appointment || resolvedAppointment };
      }
      setJourney((current) => ({
        ...current,
        mode: "checkout",
        appointment: resolvedAppointment,
        checkout,
        loading: false,
        progressStage: "",
        error: ""
      }));
      patchCustomerAppointmentCache(resolvedAppointment);
      await mutateSummary((current) => current ? { ...current, appointments: upsertById(current.appointments || [], resolvedAppointment) } : current, { revalidate: false });
      await mutateAppointments((current) => upsertById(current, resolvedAppointment));
      revalidateCustomerGroups(isProxyAppointmentsKey);
      return { ok: true, mode: "checkout", appointment: resolvedAppointment, checkout };
    } catch (error) {
      const nextError = error?.message || "Live checkout could not be created.";
      setJourney((current) => ({
        ...current,
        loading: false,
        progressStage: "",
        error: nextError
      }));
      return { ok: false, error: nextError };
    }
  }

  async function refreshConfirmation() {
    if (!journey.appointment?.id) {
      return;
    }
    const session = hydrateStoredSession("patient");
    setJourney((current) => ({ ...current, loading: true, error: "" }));
    try {
      const confirmation = await apiRequest(session, `/appointments/${journey.appointment.id}/confirmation`);
      if (!confirmation?.is_confirmed) {
        setJourney((current) => ({
          ...current,
          confirmation: confirmation || null,
          loading: false,
          error: "Payment has not been confirmed yet. Complete checkout, then refresh."
        }));
        return;
      }
      setJourney((current) => ({
        ...current,
        mode: "confirmation",
        appointment: confirmation.appointment,
        confirmation,
        loading: false,
        error: ""
      }));
      fetch("/api/customer/appointments/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: confirmation?.appointment?.id || journey.appointment.id,
          baseUrl: session?.baseUrl || "",
          customerEmail: profile.email || settings.email || "",
          customerName: settings.displayName || profile.display_name || "",
          adminEmail: "careteam@nevarihealth.com"
        })
      }).then((response) => {
        if (response.status === 401) {
          forcePatientLogoutToLogin();
        }
      }).catch(() => {});
      patchCustomerAppointmentCache(confirmation.appointment);
      await mutateSummary((current) => current ? { ...current, appointments: upsertById(current.appointments || [], confirmation.appointment) } : current, { revalidate: false });
      await mutateAppointments((current) => upsertById(current, confirmation.appointment));
      await subscriptionState?.refresh?.().catch(() => null);
      revalidateCustomerGroups(isProxyAppointmentsKey, isProxyOrdersKey);
    } catch (error) {
      setJourney((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Confirmation details could not be loaded."
      }));
    }
  }

  async function openDoctorReviews(doctor) {
    const session = hydrateStoredSession("patient");
    goToPage("overview");
    return;
    setJourney({
      ...createJourneyState(),
      mode: "reviews",
      doctorId: doctor.user_id || doctor.id,
      loading: true
    });
    try {
      const reviews = await apiRequest(session, `/doctors/${doctor.user_id || doctor.id}/reviews`);
      setJourney((current) => ({
        ...current,
        mode: "reviews",
        doctorId: doctor.user_id || doctor.id,
        reviews,
        loading: false,
        error: ""
      }));
    } catch {
      setJourney((current) => ({
        ...current,
        mode: "reviews",
        doctorId: doctor.user_id || doctor.id,
        reviews: buildMockReviews(doctor),
        loading: false,
        error: "Live doctor reviews are unavailable. Showing a frontend preview instead."
      }));
    }
  }

  async function submitReview() {
    const eligible = pastAppointments.find((appointment) => Number(appointment.doctor_user_id) === Number(journey.doctorId) && appointment.status === "completed" && !appointment.review);
    if (!eligible) {
      return;
    }
    const session = hydrateStoredSession("patient");
    setJourney((current) => ({ ...current, loading: true, reviewFeedback: "" }));
    try {
      await apiRequest(session, `/appointments/${eligible.id}/review`, {
        method: "POST",
        body: {
          rating: journey.reviewDraft.rating,
          review_text: journey.reviewDraft.reviewText
        }
      });
      const reviews = await apiRequest(session, `/doctors/${journey.doctorId}/reviews`);
      const reviewedAppointment = { ...eligible, review: { rating: journey.reviewDraft.rating, review_text: journey.reviewDraft.reviewText }, review_eligible: false };
      setJourney((current) => ({
        ...current,
        reviews,
        loading: false,
        reviewDraft: { rating: 5, reviewText: "" },
        reviewFeedback: "Your review has been added."
      }));
      patchCustomerAppointmentCache(reviewedAppointment);
      await mutateAppointments((current) => replaceById(current, reviewedAppointment));
      revalidateCustomerGroups(isProxyAppointmentsKey, isProxyDoctorsKey);
    } catch {
      setJourney((current) => ({
        ...current,
        reviews: appendLocalReview(current.reviews, current.reviewDraft, profile),
        loading: false,
        reviewDraft: { rating: 5, reviewText: "" },
        reviewFeedback: "The review endpoint is unavailable. Your review has been saved locally for frontend testing."
      }));
    }
  }

  function resetAppointmentJourney() {
    setJourney(createJourneyState());
    subscriptionState?.refresh?.().catch(() => null);
    revalidateCustomerGroups(isProxyAppointmentsKey, isProxyOrdersKey);
  }

  async function handleLogout() {
    if (logoutBusy) {
      return;
    }
    setLogoutBusy(true);
    const activeSession = session || hydrateStoredSession("patient");
    try {
      clearDashboardCacheForFrontend("patient", activeSession?.user?.id);
      await performGlobalLogout(FRONTENDS.patient, activeSession);
      router.replace("/login");
    } catch {
      setLogoutBusy(false);
    }
  }

  async function cancelAppointmentFromDetails(appointmentId) {
    if (!appointmentId || appointmentActionBusy) {
      return;
    }
    setAppointmentActionBusy(true);
    try {
      const currentAppointment = state.appointments.find((item) => String(item?.id) === String(appointmentId))
        || selectedAppointment
        || null;
      const activeSession = hydrateStoredSession("patient");
      const response = await apiRequest(activeSession, `/appointments/${appointmentId}/cancel`, {
        method: "POST",
        body: {}
      });
      const updatedPayload = response?.appointment || response?.data?.appointment || response?.data || response;
      const updated = {
        ...(currentAppointment || {}),
        ...(updatedPayload && typeof updatedPayload === "object" ? updatedPayload : {}),
        id: updatedPayload?.id || currentAppointment?.id || appointmentId,
      };
      if (updated?.id) {
        patchCustomerAppointmentCache(updated);
        await mutateSummary((prev) => prev ? { ...prev, appointments: upsertById(prev.appointments || [], updated) } : prev, { revalidate: false });
        await mutateAppointments((current) => upsertById(current, updated));
        setSelectedAppointment(updated);
      }
      revalidateCustomerGroups(isProxyAppointmentsKey);
      await reloadAppointments();
    } finally {
      setAppointmentActionBusy(false);
    }
  }

  async function rescheduleAppointmentFromSelection(appointment, selection) {
    if (!appointment?.id || !selection?.selectedSlot?.start_at) {
      return { ok: false, error: "Select a valid appointment time before rescheduling." };
    }
    try {
      const activeSession = hydrateStoredSession("patient");
      const startAt = selection.selectedSlot.start_at;
      const endAt = appointmentEndForSelection(selection.selectedSlot, selection.durationMinutes || minimumBookingMinutes);
      const updated = await apiRequest(activeSession, `/appointments/${appointment.id}/reschedule`, {
        method: "POST",
        body: {
          start_at: startAt,
          end_at: endAt
        }
      });
      if (!updated?.id) {
        throw new Error("The appointment could not be rescheduled.");
      }
      patchCustomerAppointmentCache(updated);
      await mutateSummary((prev) => prev ? { ...prev, appointments: upsertById(prev.appointments || [], updated) } : prev, { revalidate: false });
      await mutateAppointments((current) => upsertById(current, updated));
      setSelectedAppointment(updated);
      setAppointmentRescheduleTarget(null);
      revalidateCustomerGroups(isProxyAppointmentsKey);
      return { ok: true, mode: "rescheduled", appointment: updated };
    } catch (error) {
      return { ok: false, error: error?.message || "The appointment could not be rescheduled." };
    }
  }

  function startAppointmentReschedule(appointment) {
    if (!appointment?.id) {
      return;
    }
    setSelectedAppointment(null);
    setJourney(createJourneyState());
    setAppointmentRescheduleTarget(appointment);
    setPage("appointment");
  }

  async function cancelCheckoutAppointment() {
    if (!journey.appointment?.id) {
      return;
    }
    await cancelAppointmentFromDetails(journey.appointment.id);
    setJourney(createJourneyState());
  }

  const subscription = subscriptionState?.subscription || {};
  const consultationQuotaTotal = Number(subscription.free_consultations_total || 0);
  const consultationQuotaUsed = Number(subscription.free_consultations_used || 0);
  const consultationQuotaRemaining = Number(subscription.free_consultations_remaining || 0);
  const consultationQuotaResetLabel = String(subscription.free_consultations_reset_label || "").trim();
  const isProSubscription = String(subscription.plan_key || "").toLowerCase() === "nevari_access_pro" || Boolean(subscription.is_paid);
  const customerSettingsErrors = getCustomerSettingsFieldErrors(settings);

  const showConsultationQuotaNotice = page === "appointment" && isProSubscription && !consultationQuotaDismissed;
  const consultationQuotaTitle = consultationQuotaRemaining <= 0 ? "Free Monthly Consultation Allowance Used" : "Free Monthly Consultation";
  const consultationQuotaBody = consultationQuotaRemaining <= 0
    ? `You have used all ${consultationQuotaTotal || 5} free consultation bookings included with your Pro membership for the current billing month.`
    : `You have ${consultationQuotaRemaining} of ${consultationQuotaTotal || 5} free consultation bookings remaining in your Pro membership for the current billing month.`;
  const consultationQuotaResetText = consultationQuotaResetLabel ? `Next reset: ${consultationQuotaResetLabel}` : "";

  if (!isCustomerMobile) {
    return <RoleShell
      title="Nevari Patient"
      pages={pages}
      active={page}
      onPageChange={navigateToPage}
      pageBodyClassName={dashboardRevealClassName}
      pageLabels={pageLabels}
      renderNavIcon={renderCustomerNavIcon}
      onLogout={handleLogout}
      logoutBusy={logoutBusy}
      sidebarFooter={<div
        className="customer-desktop-sidebar-profile"
        role="button"
        tabIndex={0}
        aria-label="Open profile settings"
        onClick={() => navigateToPage("profile")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigateToPage("profile");
          }
        }}
      >
        <div className="customer-mobile-avatar customer-desktop-sidebar-avatar">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
          <span style={{ display: profile.avatar_url ? "none" : "inline" }}>{initials(customerFullName)}</span>
        </div>
        <div className="customer-desktop-sidebar-profile-copy">
          <strong>{customerFullName}</strong>
          <span>{customerEmailAddress}</span>
        </div>
      </div>}
      topContent={<div className="customer-desktop-topbar">
        <label ref={desktopSearchRef} className={"customer-desktop-search-shell customer-desktop-search-shell-interactive" + (desktopSearchOpen ? " is-open" : "")} aria-label="Search dashboard">
          <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.8} />
          <input
            type="search"
            value={desktopSearchQuery}
            placeholder="Search here for orders, appointments etc"
            aria-label="Search here for orders, appointments etc"
            onFocus={() => {
              setDesktopSearchOpen(true);
              if (page !== "search") {
                openDesktopSearch(desktopSearchQuery);
              }
            }}
            onChange={(event) => openDesktopSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && desktopSearchResults.length) { event.preventDefault(); setDesktopSearchActiveIndex((current) => Math.min(desktopSearchResults.length - 1, current + 1)); }
              else if (event.key === "ArrowUp" && desktopSearchResults.length) { event.preventDefault(); setDesktopSearchActiveIndex((current) => Math.max(0, current - 1)); }
              else if (event.key === "Enter" && desktopSearchActiveIndex >= 0) { event.preventDefault(); desktopSearchResults[desktopSearchActiveIndex]?.onSelect(); }
            }}
          />
          {desktopSearchQuery ? <button type="button" className="customer-desktop-search-clear" aria-label="Clear search" onClick={() => {
            setDesktopSearchQuery("");
            setDesktopSearchOpen(true);
          }}>?</button> : null}
          {desktopSearchOpen ? <div className="customer-desktop-search-dropdown">
            {desktopSearchQuery.trim().length < 3
              ? CUSTOMER_SEARCH_QUICK_OPTIONS.map(([nextPage, label]) => <button key={nextPage} type="button" onClick={() => {
                setDesktopSearchOpen(false);
                setDesktopSearchQuery("");
                setPage(nextPage);
              }}>{label}</button>)
              : patientSearchQuery.isLoading
                ? <div className="customer-desktop-search-empty" aria-live="polite">Searching...</div>
                : patientSearchQuery.error
                  ? <div className="customer-desktop-search-empty" role="alert">Search is unavailable. Try again.</div>
                  : desktopSearchResults.length
                    ? desktopSearchResults.slice(0, 4).map((result, index) => <button key={result.key} type="button" className={desktopSearchActiveIndex === index ? "is-active" : ""} onMouseEnter={() => setDesktopSearchActiveIndex(index)} onClick={() => {
                      setDesktopSearchOpen(false);
                      result.onSelect();
                    }}><span>{result.label}</span><small>{result.area}</small></button>)
                    : <div className="customer-desktop-search-empty">No results found</div>}          </div> : null}
        </label>
      </div>}
    >
      {showSkeleton ? <CustomerDesktopSkeleton page={page} /> : null}
      {!showSkeleton && page === "overview" ? <CustomerMobileDashboard
        session={session}
        setSession={setSession}
        page={page}
        setPage={navigateToPage}
        showSkeleton={false}
        state={state}
        stateError={orderActionError || state.error}
        profile={profile}
        settings={settings}
        setSettings={setSettings}
        orderCounts={orderCounts}
        spentThisMonth={spentThisMonth}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storeUrl={storeUrl}
        visibleDoctors={visibleDoctors}
        selectedDoctor={selectedDoctor}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        setSelectedOrder={setSelectedOrder}
        upcomingAppointments={upcomingAppointments}
        pastAppointments={pastAppointments}
        journey={journey}
        setJourney={setJourney}
        createJourneyState={createJourneyState}
        minimumBookingMinutes={minimumBookingMinutes}
        storefrontSettings={storefrontSettings}
        ordersLoading={ordersLoading}
        appointmentsLoading={appointmentsLoading}
        doctorsLoading={doctorsLoading}
        subscriptionState={subscriptionState}
        mtmRequests={mtmRequests}
        mtmRequestsQuery={mtmRequestsQuery}
        nurseRequests={nurseRequests}
        nurseRequestsQuery={nurseRequestsQuery}
        ivTherapyRequests={ivTherapyRequests}
        ivTherapyRequestsQuery={ivTherapyRequestsQuery}
        initialMtmRequestId={initialMtmRequestId}
        initialPage={initialPage}
        pathname={pathname}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        appointmentRescheduleTarget={appointmentRescheduleTarget}
        onClearAppointmentRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        guestConsultationDraft={guestConsultationDraft}
        onGuestConsultationDraftConsumed={() => setGuestConsultationDraft(null)}
        nurseRequestAuth={{
          baseUrl: session?.baseUrl || "",
          accessToken: session?.accessToken || "",
          adminEmail: "careteam@nevarihealth.com"
        }}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        embeddedDesktop
      /> : null}
      {!showSkeleton && page === "orders" ? <CustomerMobileDashboard
        session={session}
        page={page}
        setPage={navigateToPage}
        showSkeleton={false}
        state={state}
        stateError={orderActionError || state.error}
        profile={profile}
        settings={settings}
        setSettings={setSettings}
        orderCounts={orderCounts}
        spentThisMonth={spentThisMonth}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storeUrl={storeUrl}
        visibleDoctors={visibleDoctors}
        selectedDoctor={selectedDoctor}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        setSelectedOrder={setSelectedOrder}
        upcomingAppointments={upcomingAppointments}
        pastAppointments={pastAppointments}
        journey={journey}
        setJourney={setJourney}
        createJourneyState={createJourneyState}
        minimumBookingMinutes={minimumBookingMinutes}
        storefrontSettings={storefrontSettings}
        ordersLoading={ordersLoading}
        appointmentsLoading={appointmentsLoading}
        doctorsLoading={doctorsLoading}
        subscriptionState={subscriptionState}
        mtmRequests={mtmRequests}
        mtmRequestsQuery={mtmRequestsQuery}
        nurseRequests={nurseRequests}
        nurseRequestsQuery={nurseRequestsQuery}
        ivTherapyRequests={ivTherapyRequests}
        ivTherapyRequestsQuery={ivTherapyRequestsQuery}
        initialMtmRequestId={initialMtmRequestId}
        initialPage={initialPage}
        pathname={pathname}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        appointmentRescheduleTarget={appointmentRescheduleTarget}
        onClearAppointmentRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        guestConsultationDraft={guestConsultationDraft}
        onGuestConsultationDraftConsumed={() => setGuestConsultationDraft(null)}
        nurseRequestAuth={{
          baseUrl: session?.baseUrl || "",
          accessToken: session?.accessToken || "",
          adminEmail: "careteam@nevarihealth.com"
        }}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        embeddedDesktop
      /> : null}
      {!showSkeleton && page === "appointment" ? <AppointmentPage
        profile={profile}
        settings={settings}
        doctors={visibleDoctors}
        doctorsUnavailable={state.doctorsUnavailable}
        doctorsLoading={doctorsLoading}
        appointmentsLoading={appointmentsLoading}
        journey={journey}
        selectedDoctor={selectedDoctor}
        upcoming={upcomingAppointments}
        past={pastAppointments}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        onOpenSearch={() => openDesktopSearch("")}
        onOpenMenu={() => {}}
        calendarDownloadUrl={journey.appointment?.mock ? "" : (journey.appointment?.id ? buildUrl(hydrateStoredSession("patient"), `/appointments/${journey.appointment.id}/calendar`) : "")}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storefrontSettings={storefrontSettings}
        minimumBookingMinutes={minimumBookingMinutes}
        subscriptionState={subscriptionState}
        showConsultationQuotaNotice={showConsultationQuotaNotice}
        consultationQuotaTitle={consultationQuotaTitle}
        consultationQuotaBody={consultationQuotaBody}
        consultationQuotaResetText={consultationQuotaResetText}
        consultationQuotaTotal={consultationQuotaTotal}
        consultationQuotaUsed={consultationQuotaUsed}
        consultationQuotaRemaining={consultationQuotaRemaining}
        rescheduleTarget={appointmentRescheduleTarget}
        onClearRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        onShowConsultationQuotaNotice={() => setConsultationQuotaDismissed(false)}
        onDismissConsultationQuotaNotice={() => setConsultationQuotaDismissed(true)}
        prefillBookingDraft={guestConsultationDraft}
        onPrefillConsumed={() => setGuestConsultationDraft(null)}
        embeddedDesktop
      /> : null}
      {!showSkeleton && page === "search" ? <section className="customer-desktop-panel customer-desktop-search-results-panel">
        <div className="customer-panel-head">
          <div>
            <span className="customer-section-kicker">Search</span>
            <h2>Results</h2>
          </div>
          <button className="customer-mobile-back-link" type="button" onClick={closeDesktopSearch}>
            <MobileIcon name="arrow-left" />
            <span>Back</span>
          </button>
        </div>
        <div className="customer-mobile-search-results customer-desktop-search-results">
          {desktopSearchQuery.trim().length < 3 ? <div className="customer-mobile-search-empty">
            <strong className="customer-mobile-search-empty-hint">start typing to see results</strong>
          </div> : patientSearchQuery.isLoading ? <div className="customer-mobile-search-empty" aria-live="polite"><BrandedSpinner label="Searching patient records" /></div> : patientSearchQuery.error ? <div className="customer-mobile-search-empty" role="alert"><strong>Search is unavailable</strong><small>Try again in a moment.</small></div> : desktopSearchResults.length ? desktopSearchResults.map((result) => <button className="customer-mobile-search-result" key={result.key} type="button" onClick={result.onSelect}>
            <div>
              <span className="customer-mobile-search-result-area">{result.area}</span>
              <strong>{result.label}</strong>
              <small>{result.meta}</small>
            </div>
            <MobileIcon name="arrow-right" />
          </button>) : <div className="customer-mobile-search-empty">
            <strong>no results found</strong>
          </div>}
        </div>
      </section> : null}
      {!showSkeleton && page === "settings" ? <SettingsPage
        profile={profile}
        doctors={visibleDoctors}
        orders={state.orders}
        appointments={state.appointments}
        settings={settings}
        displayName={customerDisplayName}
        uploading={profileImageSaving}
        imageRefreshing={profileImageRefreshing}
        imageError={profileImageError}
        imageSuccess={profileImageSuccess}
                imageCooldownUntil={profileImageCooldownUntil}
                        imageInputRef={profileImageInputRef}
                        onProfileImageSelect={handleProfileImageSelected}
        onProfileImageOpen={() => profileImageInputRef.current?.click()}
        onSettingsChange={setSettings}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
      /> : null}
      {!showSkeleton && page === "profile" ? <ProfilePage
        profile={profile}
        orders={state.orders}
        appointments={state.appointments}
        doctors={visibleDoctors}
        settings={settings}
        displayName={customerDisplayName}
        uploading={profileImageSaving}
        imageRefreshing={profileImageRefreshing}
        imageError={profileImageError}
        imageSuccess={profileImageSuccess}
                imageCooldownUntil={profileImageCooldownUntil}
                        imageInputRef={profileImageInputRef}
                        onProfileImageSelect={handleProfileImageSelected}
        onProfileImageOpen={() => profileImageInputRef.current?.click()}
        subscriptionState={subscriptionState}
        onSettingsChange={setSettings}
        onViewSubscription={() => setPage("subscription-management")}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
      /> : null}
      {!showSkeleton && page === "subscription-management" ? <CustomerSubscriptionManagementScreen embeddedDesktop onBack={() => setPage("profile")} subscriptionState={subscriptionState} /> : null}
      {!showSkeleton && page === "request" ? <CustomerMobileDashboard
        session={session}
        setSession={setSession}
        page={page}
        setPage={navigateToPage}
        showSkeleton={false}
        state={state}
        stateError={orderActionError || state.error}
        profile={profile}
        settings={settings}
        setSettings={setSettings}
        orderCounts={orderCounts}
        spentThisMonth={spentThisMonth}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storeUrl={storeUrl}
        visibleDoctors={visibleDoctors}
        selectedDoctor={selectedDoctor}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        setSelectedOrder={setSelectedOrder}
        upcomingAppointments={upcomingAppointments}
        pastAppointments={pastAppointments}
        journey={journey}
        setJourney={setJourney}
        createJourneyState={createJourneyState}
        minimumBookingMinutes={minimumBookingMinutes}
        storefrontSettings={storefrontSettings}
        ordersLoading={ordersLoading}
        appointmentsLoading={appointmentsLoading}
        doctorsLoading={doctorsLoading}
        subscriptionState={subscriptionState}
        mtmRequests={mtmRequests}
        mtmRequestsQuery={mtmRequestsQuery}
        nurseRequests={nurseRequests}
        nurseRequestsQuery={nurseRequestsQuery}
        ivTherapyRequests={ivTherapyRequests}
        ivTherapyRequestsQuery={ivTherapyRequestsQuery}
        initialMtmRequestId={initialMtmRequestId}
        initialPage={initialPage}
        pathname={pathname}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        appointmentRescheduleTarget={appointmentRescheduleTarget}
        onClearAppointmentRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        nurseRequestAuth={{
          baseUrl: session?.baseUrl || "",
          accessToken: session?.accessToken || "",
          adminEmail: "careteam@nevarihealth.com"
        }}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        embeddedDesktop
      /> : null}
      {!showSkeleton && page === "therapy" ? <CustomerMobileDashboard
        session={session}
        page={page}
        setPage={navigateToPage}
        showSkeleton={showSkeleton}
        state={state}
        stateError={orderActionError || state.error}
        profile={profile}
        settings={settings}
        setSettings={setSettings}
        orderCounts={orderCounts}
        spentThisMonth={spentThisMonth}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storeUrl={storeUrl}
        visibleDoctors={visibleDoctors}
        selectedDoctor={selectedDoctor}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        setSelectedOrder={setSelectedOrder}
        upcomingAppointments={upcomingAppointments}
        pastAppointments={pastAppointments}
        journey={journey}
        setJourney={setJourney}
        createJourneyState={createJourneyState}
        minimumBookingMinutes={minimumBookingMinutes}
        storefrontSettings={storefrontSettings}
        ordersLoading={ordersLoading}
        appointmentsLoading={appointmentsLoading}
        doctorsLoading={doctorsLoading}
        subscriptionState={subscriptionState}
        mtmRequests={mtmRequests}
        mtmRequestsQuery={mtmRequestsQuery}
        nurseRequests={nurseRequests}
        nurseRequestsQuery={nurseRequestsQuery}
        ivTherapyRequests={ivTherapyRequests}
        ivTherapyRequestsQuery={ivTherapyRequestsQuery}
        initialMtmRequestId={initialMtmRequestId}
        initialPage={initialPage}
        pathname={pathname}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        appointmentRescheduleTarget={appointmentRescheduleTarget}
        onClearAppointmentRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        nurseRequestAuth={{
          baseUrl: session?.baseUrl || "",
          accessToken: session?.accessToken || "",
          adminEmail: "careteam@nevarihealth.com"
        }}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        embeddedDesktop
      /> : null}
      {!showSkeleton && page === "iv-therapy" ? <CustomerMobileDashboard
        session={session}
        page={page}
        setPage={navigateToPage}
        showSkeleton={showSkeleton}
        state={state}
        stateError={orderActionError || state.error}
        profile={profile}
        settings={settings}
        setSettings={setSettings}
        orderCounts={orderCounts}
        spentThisMonth={spentThisMonth}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storeUrl={storeUrl}
        visibleDoctors={visibleDoctors}
        selectedDoctor={selectedDoctor}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        setSelectedOrder={setSelectedOrder}
        upcomingAppointments={upcomingAppointments}
        pastAppointments={pastAppointments}
        journey={journey}
        setJourney={setJourney}
        createJourneyState={createJourneyState}
        minimumBookingMinutes={minimumBookingMinutes}
        storefrontSettings={storefrontSettings}
        ordersLoading={ordersLoading}
        appointmentsLoading={appointmentsLoading}
        doctorsLoading={doctorsLoading}
        subscriptionState={subscriptionState}
        mtmRequests={mtmRequests}
        mtmRequestsQuery={mtmRequestsQuery}
        nurseRequests={nurseRequests}
        nurseRequestsQuery={nurseRequestsQuery}
        ivTherapyRequests={ivTherapyRequests}
        ivTherapyRequestsQuery={ivTherapyRequestsQuery}
        initialMtmRequestId={initialMtmRequestId}
        initialPage={initialPage}
        pathname={pathname}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        appointmentRescheduleTarget={appointmentRescheduleTarget}
        onClearAppointmentRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        nurseRequestAuth={{
          baseUrl: session?.baseUrl || "",
          accessToken: session?.accessToken || "",
          adminEmail: "careteam@nevarihealth.com"
        }}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        embeddedDesktop
      /> : null}
      {selectedAppointment ? <AppointmentDetailsModal
        appointment={selectedAppointment}
        doctors={visibleDoctors}
        storeTimeZone={storeTimeZone}
        busy={appointmentActionBusy}
        onCancelAppointment={cancelAppointmentFromDetails}
        onRescheduleAppointment={startAppointmentReschedule}
        onOpenOrderDocuments={openOrderDocuments}
        onClose={() => setSelectedAppointment(null)}
      /> : null}
      {selectedOrder ? <OrderDetailsModal
        order={selectedOrder}
        storeCurrency={storeCurrency}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onClose={() => setSelectedOrder(null)}
      /> : null}
    </RoleShell>;
  }

  return <>
    <div className={dashboardRevealClassName}>
      <CustomerMobileDashboard
        session={session}
        page={page}
        setPage={navigateToPage}
        showSkeleton={showSkeleton}
        state={state}
        stateError={orderActionError || state.error}
        profile={profile}
        settings={settings}
        setSettings={setSettings}
        orderCounts={orderCounts}
        spentThisMonth={spentThisMonth}
        storeCurrency={storeCurrency}
        storeTimeZone={storeTimeZone}
        storeUrl={storeUrl}
        visibleDoctors={visibleDoctors}
        doctorsUnavailable={state.doctorsUnavailable}
        selectedDoctor={selectedDoctor}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        setSelectedOrder={setSelectedOrder}
        upcomingAppointments={upcomingAppointments}
        pastAppointments={pastAppointments}
        journey={journey}
        setJourney={setJourney}
        createJourneyState={createJourneyState}
        minimumBookingMinutes={minimumBookingMinutes}
        storefrontSettings={storefrontSettings}
        ordersLoading={ordersLoading}
        appointmentsLoading={appointmentsLoading}
        doctorsLoading={doctorsLoading}
        subscriptionState={subscriptionState}
        mtmRequests={mtmRequests}
        mtmRequestsQuery={mtmRequestsQuery}
        nurseRequests={nurseRequests}
        nurseRequestsQuery={nurseRequestsQuery}
        ivTherapyRequests={ivTherapyRequests}
        ivTherapyRequestsQuery={ivTherapyRequestsQuery}
        initialMtmRequestId={initialMtmRequestId}
        initialPage={initialPage}
        pathname={pathname}
        onOpenAvailability={openDoctorAvailability}
        onOpenReviews={openDoctorReviews}
        onOpenAppointment={setSelectedAppointment}
        onOpenOrderDocuments={openOrderDocuments}
        onCancelPendingOrder={cancelPendingOrder}
        onRefillOrder={refillOrder}
        refillOrderBusy={refillOrderBusy}
        onUpdateAvailabilityDate={updateAvailabilityDate}
        onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
        onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
        onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
        onCreateAppointmentCheckout={createAppointmentCheckout}
        onRescheduleAppointmentCheckout={rescheduleAppointmentFromSelection}
        onRefreshConfirmation={refreshConfirmation}
        onCancelCheckoutAppointment={cancelCheckoutAppointment}
        onResetJourney={resetAppointmentJourney}
        onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
        onSubmitReview={submitReview}
        appointmentRescheduleTarget={appointmentRescheduleTarget}
        onClearAppointmentRescheduleTarget={() => setAppointmentRescheduleTarget(null)}
        nurseRequestAuth={{
          baseUrl: session?.baseUrl || "",
          accessToken: session?.accessToken || "",
          adminEmail: "careteam@nevarihealth.com"
        }}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
      />
    </div>
    {selectedAppointment ? <AppointmentDetailsModal
      appointment={selectedAppointment}
      doctors={visibleDoctors}
      storeTimeZone={storeTimeZone}
      busy={appointmentActionBusy}
      onCancelAppointment={cancelAppointmentFromDetails}
      onRescheduleAppointment={startAppointmentReschedule}
      onOpenOrderDocuments={openOrderDocuments}
      onClose={() => setSelectedAppointment(null)}
    /> : null}
    {selectedOrder ? <OrderDetailsModal
      order={selectedOrder}
      storeCurrency={storeCurrency}
      onOpenOrderDocuments={openOrderDocuments}
      onCancelPendingOrder={cancelPendingOrder}
      onRefillOrder={refillOrder}
      refillOrderBusy={refillOrderBusy}
      onClose={() => setSelectedOrder(null)}
    /> : null}
    {overviewProfilePromptVisible ? <div className="customer-profile-reminder-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissOverviewProfilePrompt(); }}>
      <div className="customer-profile-reminder-modal" role="dialog" aria-modal="true" aria-labelledby="customer-profile-reminder-title" aria-describedby="customer-profile-reminder-description" onMouseDown={(event) => event.stopPropagation()}>
        <button ref={profileReminderCloseRef} className="customer-profile-reminder-close" type="button" onClick={dismissOverviewProfilePrompt} aria-label="Dismiss profile reminder">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" focusable="false"><path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <div className="customer-profile-reminder-body">

          <span className="customer-profile-reminder-kicker">Profile reminder</span>
          <h2 id="customer-profile-reminder-title">Keep your profile up to date</h2>
          <p id="customer-profile-reminder-description">Complete your details so we can personalise your care.</p>
          <section className="customer-profile-reminder-progress" aria-label="Profile completion">
            <div className="customer-profile-reminder-progress-head"><strong>Your profile is almost complete</strong><strong>{customerProfileCompletion.percent}%</strong></div>
            <div className="customer-profile-reminder-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={customerProfileCompletion.percent}><span style={{ width: `${customerProfileCompletion.percent}%` }} /></div>
            <ul>{customerProfileReminderItems.map((item) => <li key={item}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" /><path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span>{item}</span></li>)}</ul>
          </section>
          <p className="customer-profile-reminder-privacy"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Your information is securely stored and only used to support your care.</span></p>
        </div>
        <div className="customer-profile-reminder-actions">
          <button type="button" className="customer-profile-reminder-secondary" onClick={dismissOverviewProfilePrompt}>Remind me later</button>
          <button type="button" className="customer-profile-reminder-primary" onClick={() => { setOverviewProfilePromptVisible(false); setPage("profile"); }}>Update profile <span aria-hidden="true">-&gt;</span></button>
        </div>
      </div>
    </div> : null}
    {dashboardToast.message ? <div className={"snackbar auth-snackbar " + (dashboardToast.type || "success")} role="status" aria-live="polite"><span className="snackbar-message">{dashboardToast.message}</span></div> : null}
  </>;
}

function hasCustomerDashboardData(state) {
  return Boolean(
    state.dashboard
    || state.orders.length
    || state.appointments.length
    || state.doctors.length
  );
}

function buildCustomerBootstrapState(session, settings, fallbackState = emptyCustomerState) {
  const fallbackProfile = isCustomerProfileOwnedBySession(fallbackState?.dashboard?.profile || {}, session?.user)
    ? (fallbackState?.dashboard?.profile || {})
    : {};
  const sessionUser = session?.user || {};

  return {
    error: fallbackState?.error || "",
    settings: normalizeCustomerSettingsPayload(fallbackState?.settings || settings),
    dashboard: {
      ...(fallbackState?.dashboard || {}),
      store_currency: fallbackState?.dashboard?.store_currency || SSR_SAFE_STORE_CURRENCY,
      store_timezone: fallbackState?.dashboard?.store_timezone || SSR_SAFE_STORE_TIMEZONE,
      profile: resolveCustomerProfileForSession({
        profile: {
          ...fallbackProfile,
          email: fallbackProfile.email || settings.email || sessionUser.email || ""
        },
        sessionUser,
        settingsDisplayName: settings.displayName
      })
    },
    orders: Array.isArray(fallbackState?.orders) ? fallbackState.orders : [],
    appointments: Array.isArray(fallbackState?.appointments) ? fallbackState.appointments : [],
    doctors: Array.isArray(fallbackState?.doctors) ? fallbackState.doctors : [],
    doctorsUnavailable: Boolean(fallbackState?.doctorsUnavailable)
  };
}

function CustomerDashboardSkeleton({ page }) {
  if (page === "orders") {
    return <CustomerOrdersSkeleton />;
  }
  if (page === "settings") {
    return <CustomerSettingsSkeleton />;
  }
  if (page === "profile") {
    return <CustomerProfileSkeleton />;
  }
  return <CustomerOverviewSkeleton />;
}

function CustomerOverviewSkeleton() {
  return <>
    <div className="overview-row">
      <SkeletonBox className="skeleton-line skeleton-line-lg skeleton-line-tall" />
      <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
    </div>
    <div className="search-box mobile-search-box skeleton-panel">
      <SkeletonBox className="skeleton-line skeleton-line-lg" />
    </div>
    <div className="category-row">
      {Array.from({ length: 4 }, (_, index) => <div className="category-card skeleton-panel" key={`customer-overview-stat-${index}`}>
        <SkeletonBox className={index === 0 ? "skeleton-line skeleton-line-lg skeleton-line-tall" : "skeleton-circle skeleton-circle-sm"} />
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
          <SkeletonBox className="skeleton-line skeleton-line-md" />
        </div>
      </div>)}
    </div>
    <div className="tiny-title">Upcoming appointments</div>
    <div className="appointment-stack-viewport mobile-gap-bottom">
      <div className="appointment-stack-track">
        {Array.from({ length: 3 }, (_, index) => <article className="appointment-stack-card appointment-card skeleton-panel" key={`customer-appointment-skeleton-${index}`}>
          <SkeletonBox className="skeleton-block" />
        </article>)}
      </div>
    </div>
    <div className="tiny-title">Nevari doctors</div>
    <div className="booking-list desktop-booking-list">
      {Array.from({ length: 3 }, (_, index) => <div className="booking-card skeleton-panel" key={`customer-doctor-skeleton-${index}`}>
        <div className="booking-row">
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <div className="booking-meta">
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
        </div>
        <div className="booking-stat-split">
          <SkeletonBox className="skeleton-pill" />
          <SkeletonBox className="skeleton-pill" />
        </div>
        <div className="doctor-card-actions">
          <SkeletonBox className="skeleton-pill" />
          <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
        </div>
      </div>)}
    </div>
  </>;
}

function CustomerOrdersSkeleton() {
  return <div className="customer-dashboard-stack customer-desktop-boxed-page">
    <section className="customer-stats-row" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <article className={`customer-stat-card stat-${index + 1} skeleton-panel`} key={`customer-order-stat-${index}`}>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" />
      </article>)}
    </section>
    <section className="customer-list-shell skeleton-panel">
      <div className="customer-panel-head">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
      </div>
      <div className="customer-order-list">
        {Array.from({ length: 4 }, (_, index) => <article className="customer-order-card skeleton-panel" key={`customer-order-card-skeleton-${index}`}>
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
          <SkeletonBox className="skeleton-pill" />
        </article>)}
      </div>
    </section>
  </div>;
}

function CustomerAppointmentSkeleton() {
  return <div className="customer-dashboard-stack">
    {Array.from({ length: 2 }, (_, index) => <section className="customer-list-shell skeleton-panel" key={`customer-appointment-panel-${index}`}>
      <div className="customer-panel-head">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
      </div>
      <div className="filter-bar customer-filter-bar">
        {Array.from({ length: 3 }, (_, filterIndex) => <SkeletonBox className="skeleton-pill skeleton-pill-sm" key={`customer-filter-skeleton-${index}-${filterIndex}`} />)}
      </div>
      <div className="customer-appointment-list">
        {Array.from({ length: index === 0 ? 3 : 2 }, (_, rowIndex) => <article className="customer-appointment-card skeleton-panel" key={`customer-appointment-row-${index}-${rowIndex}`}>
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <div className="customer-appointment-copy">
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
        </article>)}
      </div>
    </section>)}
  </div>;
}

function CustomerSettingsSkeleton() {
  return <div className="customer-dashboard-stack">
    <section className="customer-list-shell customer-settings-shell">
      <div className="profile-card customer-settings-hero skeleton-panel">
        <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
      </div>
      <div className="category-row customer-settings-category-row">
        {Array.from({ length: 4 }, (_, index) => <div className="category-card skeleton-panel" key={`customer-settings-stat-${index}`}>
          <SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>)}
      </div>
      <div className="customer-settings-grid customer-settings-grid-design">
        {Array.from({ length: 3 }, (_, index) => <article className="order-card customer-settings-panel skeleton-panel" key={`customer-settings-card-${index}`}>
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          {Array.from({ length: 4 }, (_, rowIndex) => <SkeletonBox className="skeleton-pill" key={`customer-settings-pill-${index}-${rowIndex}`} />)}
        </article>)}
      </div>
    </section>
  </div>;
}

function CustomerProfileSkeleton() {
  return <div className="customer-dashboard-stack">
    <section className="customer-profile-hero skeleton-panel">
      <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
      <div>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-lg" />
        <SkeletonBox className="skeleton-line skeleton-line-sm" />
      </div>
      <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
    </section>
    <section className="customer-profile-grid">
      {Array.from({ length: 5 }, (_, index) => <article className="customer-profile-card skeleton-panel" key={`customer-profile-card-${index}`}>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-md" />
      </article>)}
    </section>
  </div>;
}

function CustomerDesktopSkeleton({ page }) {
  if (page === "orders") {
    return <CustomerOrdersSkeleton />;
  }
  if (page === "appointment") {
    return <CustomerAppointmentSkeleton />;
  }
  if (["settings", "request", "therapy"].includes(page)) {
    return <CustomerSettingsSkeleton />;
  }
  if (page === "profile") {
    return <CustomerProfileSkeleton />;
  }
  return <CustomerOverviewSkeleton />;
}

function CustomerAppHeader({ profile }) {
  return <div className="app-header customer-persistent-app-header">
    <div className="profile-mini">
      <div className="avatar">
        {profile.avatar_url ? <img src={profile.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
        <span style={{ display: profile.avatar_url ? "none" : "inline" }}>{initials(profile.display_name || "Patient")}</span>
      </div>
      <div>
        <div className="small muted">Hello,</div>
        <div className="card-title">{profile.display_name || "Patient"}</div>
      </div>
    </div>
  </div>;
}

function CustomerOverview({ doctors, orders, appointments, orderCounts, onOpenPage, onOpenAvailability, onOpenAppointment, storeCurrency, storeTimeZone, storeUrl, greetingName = "Patient" }) {
  const [query, setQuery] = useState("");
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }
    const orderMatches = orders
      .filter((order) => String(order.number || "").toLowerCase().includes(term))
      .slice(0, 4)
      .map((order) => ({
        key: `order-${order.id}`,
        label: `Order #${order.number}`,
        meta: `${money(order.total, storeCurrency)} · ${titleCase(order.status)}`,
        page: "orders"
      }));
    const appointmentMatches = appointments
      .filter((appointment) => String(appointment.id || "").toLowerCase().includes(term))
      .slice(0, 4)
      .map((appointment) => ({
        key: `appointment-${appointment.id}`,
        label: `Appointment ${appointment.id}`,
        meta: shortDate(appointment.start_at, true, storeTimeZone),
        page: "overview",
        appointment
      }));
    const doctorMatches = doctors
      .filter((doctor) => String(doctor.display_name || "").toLowerCase().includes(term))
      .slice(0, 4)
      .map((doctor) => ({
        key: `doctor-${doctor.user_id || doctor.id}`,
        label: doctor.display_name || "Doctor",
        meta: doctor.specialties?.join(", ") || "Available doctor",
        page: "overview",
        doctor
      }));
    return [...orderMatches, ...appointmentMatches, ...doctorMatches].slice(0, 8);
  }, [appointments, doctors, orders, query, storeCurrency, storeTimeZone]);

  const pendingInProgress = orders.filter((order) => ["pending", "processing", "on-hold"].includes(String(order.status || "").toLowerCase())).length;
  const totalSpent = orders
    .filter((order) => ["processing", "completed"].includes(String(order.status || "").toLowerCase()))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const overviewStats = [
    { label: "Total Orders", value: orderCounts.total },
    { label: "Pending/In-Progress", value: pendingInProgress },
    { label: "Completed Orders", value: orderCounts.completed },
    { label: "Total Spent", value: money(totalSpent, storeCurrency) }
  ];
  const recentPurchases = [...orders]
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
    .slice(0, 3);

  return <section className="customer-overview-reference-shell">
    <header className="customer-overview-reference-head">
      <div>
        <p>Welcome back, {greetingName}</p>
        <h1>Orders</h1>
      </div>
      <a className="customer-overview-store-link" href={storeUrl} target="_blank" rel="noreferrer">Go to store</a>
    </header>

    <div className="search-box mobile-search-box customer-overview-search">
      <span className="mobile-icon-search" />
      <input placeholder="Search order number, appointment id, doctor" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {query ? <div className="booking-search-results customer-overview-search-results">
      {searchResults.length ? searchResults.map((result) => <button className="booking-search-result" key={result.key} type="button" onClick={() => {
        setQuery(result.label);
        if (result.doctor) {
          onOpenAvailability(result.doctor);
          return;
        }
        if (result.appointment) {
          onOpenAppointment(result.appointment);
          return;
        }
        onOpenPage(result.page);
      }}>
        <strong>{result.label}</strong>
        <span>{result.meta}</span>
      </button>) : <div className="booking-search-empty">No matching order, appointment, or doctor found.</div>}
    </div> : null}

    <section className="customer-overview-reference-stats" aria-label="Order summary">
      {overviewStats.map((item) => <article className="customer-overview-reference-card" key={item.label}>
        <div className="customer-overview-reference-icon" aria-hidden="true">
          <DashboardIcon name="orders" />
        </div>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
      </article>)}
    </section>

    <section className="customer-overview-reference-list">
      <div className="customer-overview-reference-list-head">
        <h2>Recent Purchases</h2>
        <button className="pill-button" type="button" onClick={() => onOpenPage("orders")}>View all</button>
      </div>
      <div className="customer-overview-reference-table-head" aria-hidden="true">
        <span>Items Name</span>
        <span>No.of items</span>
      </div>
      <div className="customer-overview-reference-rows">
        {recentPurchases.length ? recentPurchases.map((order, index) => {
          const item = order.items?.[0] || {};
          const itemName = item.name || item.title || item.product_name || `Order #${order.number || order.id || index + 1}`;
          const itemPrice = Number(order.total || item.total || item.price || 0);
          const quantity = order.totals?.items_quantity || order.items?.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0) || Number(item.quantity || 1);
          const thumbnail = item.image || item.thumbnail || item.product_image || "/ne.webp";

          return <button className="customer-overview-reference-row" key={order.id || `${order.number || "order"}-${index}`} type="button" onClick={() => onOpenPage("orders")}>
            <div className="customer-overview-reference-item">
              <div className="customer-overview-reference-thumb">
                <img alt="" src={thumbnail} />
              </div>
              <div className="customer-overview-reference-copy">
                <strong>{itemName}</strong>
                <span>{money(Number.isFinite(itemPrice) ? itemPrice : 0, storeCurrency)}</span>
              </div>
            </div>
            <div className="customer-overview-reference-count">{quantity}</div>
          </button>;
        }) : <div className="customer-overview-reference-empty">No recent purchases yet.</div>}
      </div>
    </section>
  </section>;
}

function AppointmentDetailsModal({ appointment, doctors, storeTimeZone, busy = false, onCancelAppointment, onRescheduleAppointment, onOpenOrderDocuments, onClose }) {
  const doctor = doctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id)) || appointment.doctor || null;
  const joinUrl = appointmentIsUpcoming(appointment) ? getAppointmentJoinUrl(appointment) : "";
  const paymentUrl = resolveAppointmentCheckoutUrl({ appointment, order: appointment?.order, payment_url: appointment?.payment_url, checkout_url: appointment?.checkout_url });
  const prescriptionOrderId = appointment?.prescription?.order_id || appointment?.prescription_order_id || null;
  const status = String(appointment?.status || "").toLowerCase();
  const paymentStatus = String(appointment?.payment_status || "").toLowerCase();
  const attendanceStatus = String(appointment?.attendance_status || "").toLowerCase();
  const appointmentStartMs = new Date(appointment?.start_at || 0).getTime();
  const isPastAppointment = Number.isFinite(appointmentStartMs) && appointmentStartMs > 0 && appointmentStartMs < Date.now();
  const isCancelled = status === "cancelled" || status === "canceled";
  const isCompleted = status === "completed";
  const isPendingPayment = !isCancelled && !isCompleted && ["pending", "failed", "abandoned"].includes(paymentStatus) && Boolean(paymentUrl);
  const isConfirmedPaid = !isCancelled && !isCompleted && paymentStatus === "paid";
  const canCancel = !isPastAppointment && !isCancelled && !isCompleted && typeof onCancelAppointment === "function";
  const canReschedule = Boolean(appointment?.reschedule_eligible) && typeof onRescheduleAppointment === "function";

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const statusTone = appointmentChipTone(appointment);
  const statusLabel = appointmentChipLabel(appointment);
  const detailRows = [
    ["Date", friendlyDate(appointment.start_at, storeTimeZone)],
    ["Time", formatTime(appointment.start_at, storeTimeZone)],
    ["Duration", appointmentDurationLabel(appointment) || "Not set"],
    ["Doctor", doctor?.display_name || `Doctor #${appointment.doctor_user_id}`],
    ["Title", appointment?.title || "Not set"],
    ["Payment", titleCase(appointment.payment_status || "pending")],
    ["Appointment ID", `#${appointment.id}`]
  ];

  return <div className="customer-appointment-modal" role="dialog" aria-modal="true" aria-label="Appointment details">
    <ModalScrim className="customer-modal-scrim customer-appointment-modal-backdrop" label="Close appointment details" onDismiss={onClose} />
    <section className="customer-appointment-detail-card">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Appointment details</span>
          <h2>{doctor?.display_name || `Doctor #${appointment.doctor_user_id}`}</h2>
        </div>
        <button className="icon-btn" type="button" aria-label="Close appointment details" onClick={onClose}>x</button>
      </div>
      <div className="customer-detail-summary-panel">
        <div className="customer-detail-summary-head">
          <span className="customer-detail-summary-icon"><DashboardIcon name="appointment" /></span>
          <div>
            <div className="customer-detail-summary-title">{doctor?.display_name || `Doctor #${appointment.doctor_user_id}`}</div>
            <div className="customer-detail-summary-sub">{friendlyDate(appointment.start_at, storeTimeZone)} • {formatTime(appointment.start_at, storeTimeZone)}</div>
          </div>
          <div className="appointment-status-stack">
            <span className={`chip ${statusTone}`}><span className="chip-dot" />{statusLabel}</span>
            {appointmentHasPrescription(appointment) ? <span className="appointment-prescription-availability">Prescription Available</span> : null}
          </div>
        </div>
      </div>
      {appointmentHasPrescription(appointment) ? <div className="appointment-prescription-availability detail-prescription-availability">Prescription Available</div> : null}
      <div className="detail-section">
        <h3 className="detail-section-title">Appointment Information</h3>
        <div className="detail-card info-list">
          {detailRows.map(([label, value]) => <div className="info-row" key={label}>
            <span className="info-label">{label}</span>
            <strong className="info-value">{value}</strong>
          </div>)}
        </div>
      </div>
      {appointment.reason ? <div className="detail-section">
        <h3 className="detail-section-title">Reason for Appointment</h3>
        <div className="note-card">{appointment.reason}</div>
      </div> : null}
      {prescriptionOrderId ? <div className="detail-section">
        <h3 className="detail-section-title">Prescription</h3>
        <div className="note-card">Order #{prescriptionOrderId}</div>
      </div> : null}
      {(!isPastAppointment || canReschedule || prescriptionOrderId) ? <div className="action-stack">
        {isPendingPayment ? <a className="btn btn-primary btn-wide appointment-link-cta" href={paymentUrl} target="_blank" rel="noreferrer">Pay now</a> : null}
        {isConfirmedPaid && !isPastAppointment && joinUrl ? <a className="btn btn-primary btn-wide appointment-link-cta" href={joinUrl} target="_blank" rel="noreferrer">Join Appointment</a> : null}
        {isConfirmedPaid && !isPastAppointment && !joinUrl ? <div className="appointment-inline-alert">The appointment join link will appear when the appointment is ready.</div> : null}
        {canReschedule ? <button className="btn btn-outline btn-wide appointment-detail-secondary-action" type="button" onClick={() => onRescheduleAppointment(appointment)}>{attendanceStatus === "doctor_absent" ? "Reschedule with doctor" : "Reschedule appointment"}</button> : null}
        {prescriptionOrderId && typeof onOpenOrderDocuments === "function" ? <button className="btn btn-outline btn-wide appointment-detail-secondary-action" type="button" onClick={() => onOpenOrderDocuments({ id: prescriptionOrderId })}>Open prescription order details</button> : null}
        {canCancel ? <button className="btn btn-danger btn-wide appointment-detail-cancel-action" type="button" disabled={busy} onClick={() => onCancelAppointment(appointment.id)}>{busy ? <BrandedSpinner label="Cancelling appointment" /> : "Cancel appointment"}</button> : null}
        {appointment.calendar?.ics_url ? <a className="btn btn-outline btn-wide appointment-link-cta appointment-detail-secondary-action" href={appointment.calendar.ics_url} target="_blank" rel="noreferrer">Download calendar invite</a> : null}
      </div> : null}
    </section>
  </div>;
}

function MtmRequestDetailsModal({ request, storeTimeZone, session, busy = false, onRequestReschedule, onClose }) {
  const requestId = String(request?.id || "");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotError, setSlotError] = useState("");
  const bookingQuery = useSWR(
    requestId && session ? ["customer-mtm-booking", requestId, session?.baseUrl || ""] : null,
    () => fetchMtmBookingContext(session, requestId),
    {
      revalidateOnFocus: true,
      refreshInterval: (data) => String(data?.payment_state || "") === "pending" ? 10_000 : 0,
    }
  );
  const booking = bookingQuery.data || null;

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const documentAvailable = request?.document?.available === true;
  const downloadHref = requestId && documentAvailable
    ? `/api/mtm/${encodeURIComponent(requestId)}/pdf?baseUrl=${encodeURIComponent(session?.baseUrl || "")}&frontendType=${encodeURIComponent(session?.frontendType || "patient")}`
    : "";
  if (typeof document === "undefined") {
    return null;
  }

  async function handleReserveSlot() {
    if (!selectedSlot || slotBusy) return;
    setSlotBusy(true);
    setSlotError("");
    try {
      await reserveMtmSlot(session, requestId, { start_at: selectedSlot, timezone: storeTimeZone || "UTC" });
      setSelectedSlot("");
      await bookingQuery.mutate();
    } catch (error) {
      setSlotError(error?.message || "That slot could not be reserved. Refresh and choose another slot.");
      await bookingQuery.mutate();
    } finally {
      setSlotBusy(false);
    }
  }

  // Only completed consultations are shown to the patient - a saved action plan is a pharmacist draft.
  const consultationNotes = request?.consultation_notes && typeof request.consultation_notes === "object" && !Array.isArray(request.consultation_notes) ? request.consultation_notes : {};
  const actionPlanNote = String(consultationNotes.note || "").trim();
  const actionPlanProducts = Array.isArray(request?.attached_products) && request.attached_products.length
    ? request.attached_products
    : (Array.isArray(consultationNotes.products) ? consultationNotes.products : []);
  const hasActionPlan = Boolean(actionPlanNote) || actionPlanProducts.length > 0;

  const slotState = String(booking?.slot_state || request?.slot_reservation?.state || "unreserved");
  const reservedStart = booking?.reserved_start_at || request?.slot_reservation?.start_at || "";
  const holdExpiresAt = booking?.slot_hold_expires_at || request?.slot_reservation?.hold_expires_at || "";
  const availableSlots = Array.isArray(booking?.available_slots) ? booking.available_slots : [];
  const canSelectAvailability = ["pending", "paid", "quota_reserved"].includes(String(booking?.payment_state || "")) && !["reserved_pending_payment", "reserved", "active"].includes(slotState);

  return createPortal(<div className="customer-appointment-modal" role="dialog" aria-modal="true" aria-label="MTM request details">
    <ModalScrim className="customer-modal-scrim customer-appointment-modal-backdrop" label="Close MTM request details" onDismiss={onClose} />
    <section className="customer-appointment-detail-card">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">MTM request</span>
          <h2>{request?.request_reference || `MTM-${String(request?.id || "").padStart(6, "0")}`}</h2>
        </div>
        <button className="icon-btn" type="button" aria-label="Close MTM request details" onClick={onClose}>x</button>
      </div>
      <div className="detail-card info-list">
        <div className="info-row"><span className="info-label">Status</span><strong className="info-value">{titleCase(request?.status_label || request?.status || "submitted")}</strong></div>
        <div className="info-row"><span className="info-label">Submitted</span><strong className="info-value">{formatAppointmentListDateTime(request?.created_at, storeTimeZone)}</strong></div>
        <div className="info-row"><span className="info-label">Scheduled For</span><strong className="info-value">{request?.scheduled_at ? formatAppointmentListDateTime(request?.scheduled_at, storeTimeZone) : "Not scheduled yet"}</strong></div>
        <div className="info-row"><span className="info-label">Assigned Pharmacist</span><strong className="info-value">{request?.assigned_pharmacist_name || (request?.assigned_pharmacist_user_id ? `Pharmacist #${request.assigned_pharmacist_user_id}` : "Pending assignment")}</strong></div>
        <div className="info-row"><span className="info-label">Attendance</span><strong className="info-value">{titleCase(request?.attendance_status || "pending")}</strong></div>
        <div className="info-row"><span className="info-label">Medication Count</span><strong className="info-value">{Array.isArray(request?.medication_profile?.medications) ? request.medication_profile.medications.length : 0}</strong></div>
      </div>
      <section className="customer-mtm-booking-panel" aria-label="MTM payment and consultation slot">
        <h3>Payment and consultation slot</h3>
        {bookingQuery.isLoading ? <BrandedSpinner label="Loading booking status" /> : null}
        {bookingQuery.error ? <div className="appointment-inline-alert" role="alert">Booking status could not be loaded. <button type="button" onClick={() => bookingQuery.mutate()}>Retry</button></div> : null}
        {!bookingQuery.isLoading && !bookingQuery.error && booking ? <>
          <div className="detail-card info-list">
            <div className="info-row"><span className="info-label">Payment / credit</span><strong className="info-value">{booking.payment_state === "quota_reserved" ? "Pro consultation credit reserved" : titleCase(booking.payment_state || "pending")}</strong></div>
            {booking.payment_state === "quota_reserved" ? <div className="info-row"><span className="info-label">Monthly credits remaining</span><strong className="info-value">{Number(booking.quota_remaining || 0)}</strong></div> : <div className="info-row"><span className="info-label">MTM consultation fee</span><strong className="info-value">{money(booking.fee || 0, booking.currency || "NGN")}</strong></div>}
            <div className="info-row"><span className="info-label">Slot</span><strong className="info-value">{reservedStart ? formatAppointmentListDateTime(reservedStart, storeTimeZone) : "Not selected"}</strong></div>
            {holdExpiresAt ? <div className="info-row"><span className="info-label">Hold expires</span><strong className="info-value">{formatAppointmentListDateTime(holdExpiresAt, storeTimeZone)}</strong></div> : null}
          </div>
          {booking.payment_required && slotState === "reserved_pending_payment" ? <a className="customer-mobile-primary-button" href={`/dashboard/therapy/${encodeURIComponent(requestId)}/payment`}>Pay for MTM consultation</a> : null}
          {canSelectAvailability ? <div className="customer-mtm-slot-picker">
            <label htmlFor={`mtm-slot-${requestId}`}>Choose a 30-minute consultation slot</label>
            <select id={`mtm-slot-${requestId}`} value={selectedSlot} onChange={(event) => { setSelectedSlot(event.target.value); setSlotError(""); }}>
              <option value="">Select an available slot</option>
              {availableSlots.map((slot) => <option key={slot.start_at} value={slot.start_at}>{formatAppointmentListDateTime(slot.start_at, storeTimeZone)}</option>)}
            </select>
            {!availableSlots.length ? <p className="customer-mobile-field-hint">No pharmacist slots are currently available. Refresh to check again.</p> : null}
            {slotError ? <p className="customer-mobile-field-error" role="alert">{slotError}</p> : null}
            <div className="customer-mtm-slot-actions">
              <button className="pill-button" type="button" onClick={() => bookingQuery.mutate()} disabled={slotBusy}>Refresh slots</button>
              <button className="button-primary" type="button" onClick={handleReserveSlot} disabled={!selectedSlot || slotBusy}>{slotBusy ? <BrandedSpinner label="Reserving slot" /> : "Reserve slot"}</button>
            </div>
          </div> : null}
          {reservedStart && ["reserved", "active"].includes(slotState) ? <p className="customer-flow-status-inline-message">{slotState === "active" ? "Your consultation slot is confirmed." : "Your slot is reserved pending clinical approval."}</p> : null}
          {reservedStart && slotState === "reserved_pending_payment" ? <p className="customer-flow-status-inline-message">Your availability is held pending payment{holdExpiresAt ? ` until ${formatAppointmentListDateTime(holdExpiresAt, storeTimeZone)}` : " until the end of today"}.</p> : null}
        </> : null}
      </section>
      {hasActionPlan ? <section className="customer-mtm-action-plan" aria-label="Pharmacist action plan">
        <h3>Your action plan</h3>
        {actionPlanNote ? <p className="customer-mtm-action-plan-note">{actionPlanNote}</p> : null}
        {actionPlanProducts.length ? <ul className="customer-mtm-action-plan-products">
          {actionPlanProducts.map((product, index) => <li key={`${product?.product_id || "product"}-${index}`}>
            <strong>{String(product?.name || "Medication")}</strong>
            {product?.dosage_instruction ? <span>{String(product.dosage_instruction)}</span> : null}
            {product?.usage_note ? <small>{String(product.usage_note)}</small> : null}
          </li>)}
        </ul> : null}
      </section> : null}
      <div className="stacked-order-popup-actions">
        {request?.customer_join_url || request?.join_url ? <a className="button-primary" href={request.customer_join_url || request.join_url} target="_blank" rel="noreferrer">Join MTM Meeting</a> : null}
        {downloadHref ? <a className="pill-button" href={downloadHref} target="_blank" rel="noreferrer">Download Request PDF</a> : <span className="customer-mobile-field-hint" role="status">Submitted PDF unavailable</span>}
        {request?.can_reschedule ? <button className="pill-button" type="button" disabled={busy} onClick={() => onRequestReschedule?.(request.id)}>{busy ? <BrandedSpinner label="Requesting reschedule" /> : "Request reschedule"}</button> : null}
      </div>
    </section>
  </div>, document.body);
}

function DoctorCards({ doctors, doctorsUnavailable, loading = false, onOpenAvailability, onOpenReviews, showReviewsAction = false, storeCurrency, className = "" }) {
  if (loading) {
    return <div className={`booking-list desktop-booking-list booking-list-vertical ${className}`.trim()}>
      {Array.from({ length: 3 }, (_, index) => <div className="booking-card booking-card-interactive skeleton-panel" key={`customer-doctor-skeleton-live-${index}`}>
        <div className="booking-row">
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <div className="booking-meta">
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
          <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
        </div>
        <div className="booking-stat-split">
          <div className="booking-stat"><SkeletonBox className="skeleton-line skeleton-line-sm" /><SkeletonBox className="skeleton-line skeleton-line-sm" /></div>
          <div className="booking-stat"><SkeletonBox className="skeleton-line skeleton-line-sm" /><SkeletonBox className="skeleton-line skeleton-line-sm" /></div>
        </div>
        <div className="doctor-card-actions">
          <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
          <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
        </div>
      </div>)}
    </div>;
  }
  return <div className={`booking-list desktop-booking-list booking-list-vertical ${className}`.trim()}>
    {doctors.length ? doctors.map((doctor) => {
      const doctorId = String(doctor.user_id || doctor.id);
      const doctorAvatar = doctor.avatar_url || doctor.profile_image || "";
      return <div className="booking-card booking-card-interactive" key={doctorId}>
        <div className="booking-row">
          <div className="booking-avatar">
            {doctorAvatar ? <img src={doctorAvatar} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
            <span style={{ display: doctorAvatar ? "none" : "inline" }}>{initials(doctor.display_name || "Doctor")}</span>
          </div>
          <div className="booking-meta">
            <h4>{doctor.display_name || "Doctor"}</h4>
            <p>{doctor.specialties?.[0] || "General consultation"} {doctor.years_experience ? `· ${doctor.years_experience} years exp` : ""}</p>
          </div>
          <button className="doctor-rating-trigger" type="button" onClick={() => onOpenReviews(doctor)}>
            <span aria-hidden="true">*</span>
            <strong>{Number(doctor.rating_average || 0).toFixed(1)}</strong>
            <small>{doctor.reviews_count || 0}</small>
          </button>
        </div>
        <div className="booking-stat-split">
          <div className="booking-stat"><strong>{doctor.telehealth_enabled ? "Video consult" : "Clinic consult"}</strong><span>{doctor.accepting_patients ? "Accepting patients" : "Unavailable"}</span></div>
          <div className="booking-stat"><strong>{money(doctorConsultationFee(doctor), storeCurrency)}</strong><span>Consultation fee</span></div>
        </div>
        <div className="doctor-card-actions">
          {showReviewsAction ? <button className="pill-button" type="button" onClick={() => onOpenReviews(doctor)}>Reviews</button> : null}
          <button className="booking-btn" type="button" onClick={() => onOpenAvailability(doctor)}>Book appointment</button>
        </div>
      </div>;
    }) : <div className="empty-card"><div className="card-title">{doctorsUnavailable ? "Doctors not available at the moment" : "Doctors not available at the moment"}</div></div>}
  </div>;
}

function OrdersPage({ orders, counts, expandedOrderId, loading = false, onToggleOrder, onOpenOrderDocuments, onCancelPendingOrder, onRefillOrder, refillOrderBusy = null, onOpenOrderDetails, storeCurrency }) {
  const orderedRows = [...orders].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  const pendingInProgress = orders.filter((order) => ["pending", "processing", "on-hold"].includes(String(order.status || "").toLowerCase())).length;
  const totalSpent = orders
    .filter((order) => ["processing", "completed"].includes(String(order.status || "").toLowerCase()))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const stats = [
    ["Total Orders", counts.total],
    ["Pending / In-Progress Orders", pendingInProgress],
    ["Completed Orders", counts.completed],
    ["Total Spent", money(totalSpent, storeCurrency)]
  ];

  return <div className="customer-dashboard-stack">
    <section className="customer-stats-row" aria-label="Order summary">
      {stats.map(([label, value], index) => <article className={`customer-stat-card stat-${index + 1}`} key={label}>
        <span>{label}</span>
        <strong>{value}</strong>
      </article>)}
    </section>

    <section className="customer-list-shell appointment-history-shell">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Orders</span>
          <h2>Recent purchases</h2>
        </div>
      </div>
      <div className="customer-order-list">
        {loading ? Array.from({ length: 4 }, (_, index) => <article className="customer-order-card skeleton-panel" key={`customer-orders-live-skeleton-${index}`}>
          <div className="customer-order-summary">
            <div className="customer-order-main">
              <div>
                <SkeletonBox className="skeleton-line skeleton-line-md" />
                <SkeletonBox className="skeleton-line skeleton-line-sm" />
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </div>
            </div>
            <div className="customer-order-side">
              <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
            </div>
          </div>
        </article>) : orderedRows.length ? orderedRows.map((order) => {
          const isExpanded = expandedOrderId === order.id;
          const quantity = order.totals?.items_quantity || order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
          const statusMeta = orderStatusMeta(order.status);
          const typeMeta = getOrderTypeMeta(order);

          return <article className={`customer-order-card ${isExpanded ? "expanded" : ""}`} key={order.id}>
            <button className="customer-order-summary" type="button" onClick={() => onOpenOrderDetails(order)}>
              <div className="customer-order-main">
                <div>
                  <div className="card-title">{orderPrimaryLabel(order)}</div>
                  <div className="card-desc">Order ID {order.number} · {quantity} items</div>
                  <span className={`status-badge ${typeMeta.tone}`}>{typeMeta.label}</span>
                </div>
              </div>
              <div className="customer-order-side">
                <span className={`status-badge ${statusMeta.tone}`}>{statusMeta.label}</span>
                <strong>{money(order.total, storeCurrency)}</strong>
              </div>
            </button>
            {statusMeta.showProgress ? <div className={`customer-order-progress ${statusMeta.shimmer ? "is-processing" : ""}`} aria-hidden="true">
              <span style={{ "--order-progress": `${statusMeta.progress}%` }} />
            </div> : null}
            {isExpanded ? <div className="customer-order-detail">
              <div className="customer-order-detail-grid">
                <div><span>Type</span><strong>{typeMeta.label}</strong></div>
                <div><span>Payment</span><strong>{titleCase(order.payment_status || order.status)}</strong></div>
                <div><span>Items</span><strong>{order.totals?.items_quantity || 0}</strong></div>
                <div><span>Doctor</span><strong>{order.assigned_doctor?.display_name || "Not assigned"}</strong></div>
                <div><span>Prescription</span><strong>{order.prescription_id || "None"}</strong></div>
              </div>
              <div className="toolbar customer-order-actions">
                <button className="pill-button" type="button" onClick={() => onToggleOrder(order.id)}>View</button>
                {order.status === "completed" ? <button className="customer-order-pdf-button" type="button" aria-label="Open receipt" title="Open receipt" onClick={() => onOpenOrderDocuments(order)}>
                  <DashboardIcon name="orders" />
                </button> : null}
                {order.status === "completed" && (order.can_refill || order.refill_available) ? <button className="button-primary" type="button" disabled={refillOrderBusy === order.id} onClick={() => onRefillOrder?.(order)}>{refillOrderBusy === order.id ? <BrandedSpinner label="Creating refill order" /> : "Refill Order"}</button> : null}
                {order.status === "pending" ? <button className="pill-button danger" type="button" onClick={() => onCancelPendingOrder(order)}>Cancel order</button> : null}
              </div>
            </div> : null}
          </article>;
        }) : <div className="empty-card"><div className="card-title">No orders found.</div></div>}
      </div>
    </section>
  </div>;
}

function AppointmentPage({
  profile,
  settings,
  doctors,
  doctorsUnavailable,
  doctorsLoading = false,
  appointmentsLoading = false,
  journey,
  selectedDoctor,
  upcoming,
  past,
  onOpenAvailability,
  onOpenReviews,
  onOpenAppointment = null,
  onUpdateAvailabilityDate,
  onSelectSlot,
  onDurationChange,
  onReasonChange,
  onCreateAppointmentCheckout,
  onRescheduleAppointmentCheckout,
  onRefreshConfirmation,
  onCancelCheckoutAppointment,
  onResetJourney,
  onReviewDraftChange,
  onSubmitReview,
  onOpenSearch = null,
  onOpenMenu = null,
  calendarDownloadUrl,
  storeCurrency,
  storeTimeZone,
  storefrontSettings,
  minimumBookingMinutes,
  subscriptionState = null,
  showConsultationQuotaNotice = false,
  consultationQuotaTitle = "",
  consultationQuotaBody = "",
  consultationQuotaResetText = "",
  consultationQuotaTotal = 0,
  consultationQuotaUsed = 0,
  consultationQuotaRemaining = 0,
  rescheduleTarget = null,
  onClearRescheduleTarget = null,
  onShowConsultationQuotaNotice = null,
  onDismissConsultationQuotaNotice = null,
  prefillBookingDraft = null,
  onPrefillConsumed = null,
  embeddedDesktop = false,
}) {
  const [filter, setFilter] = useState("upcoming");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState(() => localDateInputValue(new Date()));
  const [bookingTime, setBookingTime] = useState("");
  const [bookingReason, setBookingReason] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingMonth, setBookingMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [bookingSubmitStage, setBookingSubmitStage] = useState("");
  const [bookingMatchedDoctors, setBookingMatchedDoctors] = useState([]);
  const [bookingValidatedSlotKey, setBookingValidatedSlotKey] = useState("");
  const bookingSectionRef = useRef(null);
  const greetingName = resolveCustomerPreferredName({ settingsDisplayName: settings?.displayName, profile });
  const filters = useMemo(() => buildAppointmentFilters(upcoming, past), [past, upcoming]);
  const allAppointments = useMemo(() => [...upcoming, ...past], [past, upcoming]);
  const visibleAppointments = useMemo(() => filterAppointmentsList(allAppointments, filter), [allAppointments, filter]);
  const replaceListWithBooking = bookingOpen;
  const showBookAppointmentPlus = !bookingOpen && visibleAppointments.length > 0;
  const todayBookingDate = localDateInputValue(new Date());
  const currentBookingTime = localTimeInputValue(new Date());
  const availableBookingTimes = useMemo(() => buildConstantTimeframes(bookingDate), [bookingDate]);
  const hasAvailableBookingTimes = availableBookingTimes.some((slot) => !slot.disabled);

  useEffect(() => {
    const selectedSlot = availableBookingTimes.find((slot) => slot.value === bookingTime);
    if (bookingTime && (!selectedSlot || selectedSlot.disabled)) {
      setBookingTime("");
      setBookingMatchedDoctors([]);
      setBookingValidatedSlotKey("");
      setBookingError("Select a future time for today.");
    }
  }, [availableBookingTimes, bookingDate, bookingTime, todayBookingDate]);

  useEffect(() => {
    if (!prefillBookingDraft) {
      return;
    }
    const { date, time, reason } = prefillBookingDraft;
    const [year, month] = String(date || "").split("-").map(Number);
    if (year && month) {
      setBookingMonth(new Date(year, month - 1, 1));
    }
    setBookingDate(date || localDateInputValue(new Date()));
    setBookingTime(time || "");
    setBookingReason(String(reason || "").trim());
    setBookingMatchedDoctors([]);
    setBookingValidatedSlotKey("");
    setBookingError("");
    setBookingOpen(true);
    onClearRescheduleTarget?.();
    onPrefillConsumed?.();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => bookingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
    }
  }, [onClearRescheduleTarget, onPrefillConsumed, prefillBookingDraft]);

  useEffect(() => {
    if (!rescheduleTarget?.id) {
      return;
    }
    const { date, time } = extractLocalDateTimeParts(rescheduleTarget.start_at);
    if (date) {
      const [year, month] = date.split("-").map(Number);
      if (year && month) {
        setBookingMonth(new Date(year, month - 1, 1));
      }
      setBookingDate(date);
    }
    setBookingTime(time || "");
    setBookingReason(String(rescheduleTarget.reason || "").trim());
    setBookingMatchedDoctors([]);
    setBookingValidatedSlotKey("");
    setBookingError("");
    setBookingOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [rescheduleTarget]);

  if (journey.mode === "slots") {
    return <AvailableTimePage
      doctor={selectedDoctor}
      journey={journey}
      onBack={onResetJourney}
      onUpdateAvailabilityDate={onUpdateAvailabilityDate}
      onSelectSlot={onSelectSlot}
      onDurationChange={onDurationChange}
      onReasonChange={onReasonChange}
      onCreateAppointmentCheckout={onCreateAppointmentCheckout}
      minimumBookingMinutes={minimumBookingMinutes}
      storeTimeZone={storeTimeZone}
    />;
  }

  if (journey.mode === "checkout") {
    return <CheckoutPage journey={journey} doctor={selectedDoctor} onBack={onResetJourney} onRefreshConfirmation={onRefreshConfirmation} onCancelCheckoutAppointment={onCancelCheckoutAppointment} storeCurrency={storeCurrency} storeTimeZone={storeTimeZone} livePaymentsEnabled={storefrontSettings.livePaymentsEnabled} />;
  }

  if (journey.mode === "confirmation") {
    return <ConfirmationPage journey={journey} doctor={selectedDoctor} onBack={onResetJourney} calendarDownloadUrl={calendarDownloadUrl} storeTimeZone={storeTimeZone} />;
  }

  if (journey.mode === "reviews") {
    return <PatientReviewsPage
      doctor={selectedDoctor}
      journey={journey}
      pastAppointments={past}
      onBack={onResetJourney}
      onReviewDraftChange={onReviewDraftChange}
      onSubmitReview={onSubmitReview}
    />;
  }

  function handleNewAppointmentClick() {
    setBookingError("");
    onClearRescheduleTarget?.();
    onShowConsultationQuotaNotice?.();
    setBookingOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => bookingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
    }
  }

  async function handleAutoAssignBooking() {
    const nextReason = sanitizeClientText(bookingReason, { max: 500 }).trim();
    const selectedSlot = availableBookingTimes.find((slot) => slot.value === bookingTime) || null;
    const selectedTimeInvalid = !selectedSlot || selectedSlot.disabled;
    if (!bookingDate || selectedTimeInvalid || !nextReason) {
      setBookingError("Select a date, time, and reason for the appointment.");
      return;
    }
    const slotKey = `${bookingDate}|${bookingTime}`;
    setBookingError("");
    setBookingSubmitStage("finding_doctors");
    setBookingSlotsLoading(true);
    try {
      const activeSession = hydrateStoredSession("patient");
      const response = await fetch("/api/customer/appointments/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: bookingDate,
          time: bookingTime,
          durationMinutes: 30,
          baseUrl: storefrontSettings?.apiBase || activeSession?.baseUrl || "",
        })
      });
      const payload = await readCustomerNextApiResponse(response, "Appointment availability could not be loaded.");
      const doctorsForSlot = Array.isArray(payload?.doctors) ? payload.doctors : [];
      if (!doctorsForSlot.length) {
        throw new Error("No doctor is available for the selected date and time.");
      }
      setBookingMatchedDoctors(doctorsForSlot);
      setBookingValidatedSlotKey(slotKey);
    } catch (error) {
      setBookingMatchedDoctors([]);
      setBookingValidatedSlotKey("");
      setBookingError(error?.message || "No doctor is available for the selected date and time.");
      setBookingSubmitStage("");
      setBookingSlotsLoading(false);
      return;
    }
    setBookingSlotsLoading(false);
    setBookingSubmitStage("securing_slot");
    const checkoutPayload = {
      durationMinutes: 30,
      reason: nextReason,
      selectedSlot: {
        start_at: selectedSlot.start_at || `${bookingDate}T${bookingTime}:00`,
      },
      quotaCovered: Boolean(subscriptionState?.subscription?.is_paid) && Number(subscriptionState?.subscription?.free_consultations_remaining || 0) > 0,
      consultationQuotaRemaining: Number(subscriptionState?.subscription?.free_consultations_remaining || 0),
    };
    const result = rescheduleTarget?.id
      ? await onRescheduleAppointmentCheckout?.(rescheduleTarget, checkoutPayload)
      : await onCreateAppointmentCheckout(checkoutPayload);
    if (result && result.ok === false && result.error) {
      setBookingSubmitStage("");
      setBookingError(result.error);
      return;
    }
    if (result?.ok) {
      setBookingSubmitStage("");
      setBookingOpen(false);
      onClearRescheduleTarget?.();
      return;
    }
    setBookingSubmitStage("");
  }

  const bookingMonthLabel = bookingMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const bookingMonthStart = new Date(bookingMonth.getFullYear(), bookingMonth.getMonth(), 1);
  const bookingMonthEnd = new Date(bookingMonth.getFullYear(), bookingMonth.getMonth() + 1, 0);
  const bookingLeadingDays = bookingMonthStart.getDay();
  const bookingDaysInMonth = bookingMonthEnd.getDate();
  const bookingCalendarCells = Array.from({ length: bookingLeadingDays + bookingDaysInMonth }, (_, index) => {
    const dayNumber = index - bookingLeadingDays + 1;
    return dayNumber > 0 ? dayNumber : null;
  });

  async function handleBookingTimeSelect(nextTime) {
    const nextSlot = availableBookingTimes.find((slot) => slot.value === nextTime);
    if (!nextSlot || nextSlot.disabled || !bookingDate) {
      return;
    }
    setBookingError("");
    setBookingTime(nextTime);
    setBookingMatchedDoctors([]);
    setBookingValidatedSlotKey("");
  }

  return <div className={`customer-dashboard-stack customer-desktop-boxed-page customer-appointment-desktop-shell ${bookingOpen ? "is-booking-open" : ""} ${replaceListWithBooking ? "is-booking-standalone" : ""}`.trim()}>
    {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
      <span>Welcome back, {greetingName}</span>
      <h1>Appointments</h1>
    </header> : <header className="customer-mobile-header is-overview customer-appointment-page-header">
      <button className="customer-mobile-searchbar customer-mobile-searchbar-button" type="button" onClick={onOpenSearch || (() => {})} aria-label="Search here for orders, appointments etc">
        <MobileIcon name="search" />
        <span>Search here for orders, appointments etc</span>
      </button>
      <div className="customer-mobile-greeting-row">
        <button className="customer-mobile-icon-button" type="button" aria-label="Open menu" onClick={onOpenMenu || (() => {})}>
          <MobileIcon name="menu" />
        </button>
        <div className="customer-mobile-title-row appointment">
          <h1>Appointments</h1>
        </div>
      </div>
    </header>}
    {!embeddedDesktop ? <div className="customer-mobile-header-spacer customer-appointment-page-spacer" aria-hidden="true" /> : null}

    <div className="customer-appointment-layout">
      {!replaceListWithBooking ? <section className="customer-list-shell book-doctor-shell customer-appointment-history-shell customer-appointment-list-panel">
        <div className="customer-mobile-pill-tabs" role="tablist" aria-label="Appointment filters">
          {filters.map((item) => <button className={`customer-mobile-pill-tab ${filter === item.id ? "active" : ""}`} key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>)}
        </div>
        <AppointmentSection
          title="Appointments"
          items={visibleAppointments}
          doctors={doctors}
          storeTimeZone={storeTimeZone}
          loading={appointmentsLoading}
          emptyCtaLabel="Book an appointment"
          onEmptyCta={handleNewAppointmentClick}
          onOpenAppointment={onOpenAppointment}
        />
      </section> : null}

      {bookingOpen ? <section className="customer-list-shell customer-appointment-book-shell customer-appointment-book-panel" ref={bookingSectionRef}>
        {showConsultationQuotaNotice ? <div className="customer-quota-modal" role="dialog" aria-modal="true" aria-label="Consultation quota notice">
          <ModalScrim className="customer-modal-scrim customer-quota-modal-backdrop" label="Dismiss consultation quota notice" onDismiss={() => onDismissConsultationQuotaNotice?.()} />
          <section className="customer-quota-modal-card">
            <div className="customer-panel-head">
              <div>
                <span className="customer-section-kicker">Consultation quota</span>
                <h2>{consultationQuotaTitle}</h2>
              </div>
              <button className="icon-btn" type="button" aria-label="Dismiss consultation quota notice" onClick={() => onDismissConsultationQuotaNotice?.()}>x</button>
            </div>
            <p>{consultationQuotaBody}</p>
            {consultationQuotaResetText ? <p>{consultationQuotaResetText}</p> : null}
            {!consultationQuotaRemaining && consultationQuotaUsed >= consultationQuotaTotal ? null : <p>{consultationQuotaTotal ? `${consultationQuotaUsed} of ${consultationQuotaTotal} used.` : ""}</p>}
          </section>
        </div> : null}
        <div className="customer-mobile-title-row customer-mobile-appointment-book-title">
          <button className="customer-mobile-back-link" type="button" onClick={() => {
            setBookingOpen(false);
            onClearRescheduleTarget?.();
          }}>
            <MobileIcon name="arrow-left" />
            <span>Go back</span>
          </button>
          
        </div>
        <div className="customer-mobile-book-card customer-mobile-book-card-shot customer-appointment-book-card">
          <div className="customer-mobile-book-month">
            <strong>{bookingMonthLabel}</strong>
            <div className="customer-mobile-book-arrows">
              <button type="button" aria-label="Previous month" onClick={() => setBookingMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><MobileIcon name="arrow-left" /></button>
              <button type="button" aria-label="Next month" onClick={() => setBookingMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><MobileIcon name="arrow-right" /></button>
            </div>
          </div>
          <div className="customer-mobile-calendar-head">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="customer-mobile-calendar-grid">
            {bookingCalendarCells.map((day, index) => {
              if (!day) return <span key={`booking-blank-${index}`} />;
              const dateValue = `${bookingMonth.getFullYear()}-${String(bookingMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = bookingDate === dateValue;
              const isPast = new Date(`${dateValue}T00:00:00`).getTime() < new Date(`${localDateInputValue(new Date())}T00:00:00`).getTime();
              return <button
                key={dateValue}
                type="button"
                className={`customer-mobile-calendar-day ${isSelected ? "active" : ""} ${isPast ? "is-past" : ""}`}
                disabled={isPast}
                onClick={() => {
                  setBookingDate(dateValue);
                  setBookingTime("");
                  setBookingMatchedDoctors([]);
                  setBookingValidatedSlotKey("");
                  if (bookingError) setBookingError("");
                }}
              >
                {day}
              </button>;
            })}
          </div>
          <div className="customer-mobile-time-row customer-mobile-time-row-shot">
            <strong>Time</strong>
            <select
              value={bookingTime}
              disabled={bookingSlotsLoading || !hasAvailableBookingTimes}
              onChange={(event) => {
                const nextTime = event.target.value;
                if (!nextTime) {
                  setBookingTime("");
                  setBookingMatchedDoctors([]);
                  setBookingValidatedSlotKey("");
                  if (bookingError) setBookingError("");
                  return;
                }
                handleBookingTimeSelect(nextTime);
              }}
            >
              <option value="">{bookingSlotsLoading ? "Checking availability..." : hasAvailableBookingTimes ? "Select a time" : "No time available"}</option>
              {availableBookingTimes.map((slot) => <option key={slot.value} value={slot.value} disabled={slot.disabled}>
                {formatSlotTime(slot.value)}
              </option>)}
            </select>
          </div>
          {bookingError ? <p className="customer-mobile-field-error">{bookingError}</p> : null}
        </div>
        <label className="customer-mobile-field customer-mobile-appointment-reason-field">
          <span>Reason for Appointment:</span>
          <textarea rows={4} value={bookingReason} placeholder="Briefly state the reason for your appointment" onChange={(event) => {
            setBookingReason(event.target.value);
            if (bookingError) setBookingError("");
          }} />
        </label>
        <button className="appointment-primary-cta customer-mobile-appointment-cta" type="button" onClick={handleAutoAssignBooking} disabled={journey.loading || bookingSlotsLoading || !bookingDate || !bookingTime || !bookingReason.trim() || !hasAvailableBookingTimes}>
          {(journey.loading || bookingSlotsLoading) ? <AppointmentCtaLoadingState active stage={bookingSlotsLoading ? "finding_doctors" : (journey.progressStage || bookingSubmitStage || "securing_slot")} /> : (rescheduleTarget?.id ? "Reschedule Appointment" : "Book Appointment")}
        </button>
      </section> : null}
    </div>

    {showBookAppointmentPlus ? <AppointmentBookingButton className="customer-mobile-appointment-booknow-btn" onClick={handleNewAppointmentClick} /> : null}
  </div>;
}

function OrderDetailsModal({ order, storeCurrency, onOpenOrderDocuments, onCancelPendingOrder, onRefillOrder, refillOrderBusy = null, onClose }) {
  const statusMeta = orderStatusMeta(order?.status);
  const typeMeta = getOrderTypeMeta(order || {});
  const canCancel = String(order?.status || "").toLowerCase() === "pending";
  const orderPaymentUrl = resolveOrderPaymentUrl(order);
  const canPayNow = Boolean(orderPaymentUrl);
  const canRefill = String(order?.status || "").toLowerCase() === "completed" && Boolean(order?.can_refill || order?.refill_available);
  const items = Array.isArray(order?.items) ? order.items : [];
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)), 0);
  const deliveryFee = Math.max(0, Number(order?.total || 0) - subtotal);
  const timeline = [
    { label: "Order confirmed", done: true },
    { label: "Processing", done: ["processing", "completed"].includes(String(order?.status || "").toLowerCase()) },
    { label: "Delivered", done: String(order?.status || "").toLowerCase() === "completed" }
  ];

  return <div className="customer-appointment-modal" role="dialog" aria-modal="true" aria-label="Order details">
    <ModalScrim className="customer-modal-scrim customer-appointment-modal-backdrop" label="Close order details" onDismiss={onClose} />
    <section className="customer-appointment-detail-card customer-order-details-card">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Order details</span>
          <h2>Order #{order?.number || order?.id}</h2>
        </div>
        <button className="icon-btn" type="button" aria-label="Close order details" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="customer-detail-summary-panel">
        <div className="customer-detail-summary-head">
          <span className="customer-detail-summary-icon"><DashboardIcon name="orders" /></span>
          <div>
            <div className="customer-detail-summary-title">{orderPrimaryLabel(order) || "Order"}</div>
            <div className="customer-detail-summary-sub">{shortDate(order?.created_at, true)}</div>
          </div>
          <span className={`status-badge ${statusMeta.tone}`}>{statusMeta.label}</span>
        </div>
      </div>

      <div className="detail-section">
        <h3 className="detail-section-title">Order Information</h3>
        <div className="detail-card info-list">
          <div className="info-row"><span className="info-label">Type</span><span className="info-value">{typeMeta.label}</span></div>
          <div className="info-row"><span className="info-label">Payment</span><span className="info-value">{titleCase(order?.payment_status || order?.status)}</span></div>
          <div className="info-row"><span className="info-label">Items</span><span className="info-value">{order?.totals?.items_quantity || items.length || 0}</span></div>
          <div className="info-row"><span className="info-label">Doctor</span><span className="info-value">{order?.assigned_doctor?.display_name || "Not assigned"}</span></div>
        </div>
      </div>

      {items.length ? <div className="detail-section">
        <h3 className="detail-section-title">Items</h3>
        <div className="detail-card">
          {items.map((item, index) => <div className="order-item" key={`${item.id || item.product_id || item.name || "item"}-${index}`}>
            <div className="product-thumb"><DashboardIcon name="orders" /></div>
            <div>
              <div className="order-item-title">{item.name || "Order item"}</div>
              <div className="order-item-meta">Qty {item.quantity || 1}</div>
            </div>
            <div className="order-price">{money((Number(item.price || 0) * Number(item.quantity || 1)), storeCurrency)}</div>
          </div>)}
        </div>
      </div> : null}

      <div className="detail-section">
        <h3 className="detail-section-title">Order Summary</h3>
        <div className="detail-card info-list">
          <div className="info-row"><span className="info-label">Subtotal</span><span className="info-value">{money(subtotal, storeCurrency)}</span></div>
          <div className="info-row"><span className="info-label">Delivery</span><span className="info-value">{money(deliveryFee, storeCurrency)}</span></div>
          <div className="info-row"><span className="info-label">Total</span><span className="info-value">{money(order?.total || 0, storeCurrency)}</span></div>
        </div>
      </div>

      <div className="detail-section">
        <h3 className="detail-section-title">Delivery Progress</h3>
        <div className="detail-card timeline">
          {timeline.map((step) => <div key={step.label} className={`timeline-step ${step.done ? "done" : ""}`}>
            <span className="timeline-dot">{step.done ? "✓" : ""}</span>
            <div><div className="timeline-title">{step.label}</div></div>
          </div>)}
        </div>
      </div>

      <div className="action-stack">
        {canPayNow ? <a className="btn btn-primary btn-wide appointment-link-cta" href={orderPaymentUrl} target="_blank" rel="noreferrer">Pay now</a> : null}
        <button className="btn btn-outline btn-wide" type="button" onClick={() => onOpenOrderDocuments(order)}>Open receipt</button>
        {canRefill ? <button className="btn btn-primary btn-wide" type="button" disabled={refillOrderBusy === order?.id} onClick={() => onRefillOrder?.(order)}>{refillOrderBusy === order?.id ? <BrandedSpinner label="Creating refill order" /> : "Refill Order"}</button> : null}
        {canCancel ? <button className="btn btn-danger btn-wide" type="button" onClick={() => onCancelPendingOrder(order)}>Cancel order</button> : null}
      </div>
    </section>
  </div>;
}

function AvailabilitySlotPicker({ providerName, selectedDate, slots, selectedSlot, loading, error, onUpdateDate, onSelectSlot, storeTimeZone, emptyLabel = "Provider not available" }) {
  const days = nextSevenDays(selectedDate);
  return <div className="appointment-surface-card">
    <div className="appointment-surface-head"><div><h3>{parseDateKey(selectedDate).toLocaleString("en-US", { month: "long" })}</h3><p>{providerName}</p></div></div>
    <div className="appointment-date-strip">
      {days.map((day) => <button key={day.key} className={`appointment-date-pill ${day.key === selectedDate ? "active" : ""}`} type="button" onClick={() => onUpdateDate(day.key)}><span>{day.weekday}</span><strong>{day.day}</strong></button>)}
    </div>
    {loading ? <div className="empty-card compact-empty"><BrandedSpinner label="Loading appointment slots" /></div> : null}
    {error ? <div className="appointment-inline-alert" role="alert">{error}</div> : null}
    <div className="appointment-slot-grid">
      {slots.length ? slots.map((slot) => <button className={`appointment-slot-button ${selectedSlot?.start_at === slot.start_at ? "active" : ""}`} key={slot.start_at} type="button" onClick={() => onSelectSlot(slot)}>{formatTime(slot.start_at, storeTimeZone)}</button>) : !loading && !error ? <div className="empty-card compact-empty"><div className="card-title">{emptyLabel}</div></div> : null}
    </div>
  </div>;
}

function AvailableTimePage({ doctor, journey, onBack, onUpdateAvailabilityDate, onSelectSlot, onDurationChange, onReasonChange, onCreateAppointmentCheckout, minimumBookingMinutes, storeTimeZone }) {
  const [ctaPending, setCtaPending] = useState(false);
  const durationOptions = consultationDurationOptions(minimumBookingMinutes);
  const selectedDuration = journey.durationMinutes || minimumBookingMinutes;
  const selectedDurationAvailable = !journey.selectedSlot || durationIsAvailable(journey.slots, journey.selectedSlot, selectedDuration, minimumBookingMinutes);

  useEffect(() => {
    if (!journey.loading) {
      setCtaPending(false);
    }
  }, [journey.loading]);

  async function handleCreateAppointmentCheckout() {
    setCtaPending(true);
    try {
      await onCreateAppointmentCheckout();
    } finally {
      setCtaPending(false);
    }
  }

  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" aria-label="Go back" onClick={onBack}>{"←"}</button>
    </div>
    <AvailabilitySlotPicker providerName={doctor?.display_name || "Doctor"} selectedDate={journey.selectedDate} slots={journey.slots} selectedSlot={journey.selectedSlot} loading={journey.loading} error={journey.error} onUpdateDate={onUpdateAvailabilityDate} onSelectSlot={onSelectSlot} storeTimeZone={storeTimeZone} emptyLabel="Doctor not available" />
    <div className="appointment-summary-card">
      <h3>Selected appointment</h3>
      <div className="appointment-summary-row"><span>Date</span><strong>{friendlyDateFromDateKey(journey.selectedDate, storeTimeZone)}</strong></div>
      <div className="appointment-summary-row"><span>Time</span><strong>{journey.selectedSlot ? formatTime(journey.selectedSlot.start_at, storeTimeZone) : "Select a time"}</strong></div>
      <label className="appointment-duration-field">
        <span>Duration</span>
        <select value={selectedDuration} onChange={(event) => onDurationChange(Number(event.target.value))}>
          {durationOptions.map((minutes) => <option key={minutes} value={minutes} disabled={journey.selectedSlot ? !durationIsAvailable(journey.slots, journey.selectedSlot, minutes, minimumBookingMinutes) : false}>{formatDurationLabel(minutes)}</option>)}
        </select>
      </label>
      {!selectedDurationAvailable ? <div className="appointment-inline-alert">That duration extends beyond the doctor's available time.</div> : null}
      <label className="appointment-reason-field">
        <span>Reason</span>
        <textarea rows={3} value={journey.reason} placeholder="Briefly describe what you want to discuss" onChange={(event) => onReasonChange(sanitizeClientText(event.target.value, { max: 500 }))} />
      </label>
    </div>
    <button className="appointment-primary-cta" type="button" disabled={!journey.selectedSlot || journey.loading || ctaPending || !journey.reason.trim() || !selectedDurationAvailable} onClick={handleCreateAppointmentCheckout}>
      {(journey.loading || ctaPending) ? <AppointmentCtaLoadingState active stage={journey.progressStage || "securing_slot"} /> : "Book appointment"}
    </button>
  </section>;
}

function MtmAvailabilityPage({ context, selectedDate, selectedSlot, loading, error, busy, storeTimeZone, onBack, onUpdateDate, onSelectSlot, onRefresh, onReserve }) {
  const allSlots = Array.isArray(context?.available_slots) ? context.available_slots : [];
  const initialDate = parseDateKey(selectedDate || localDateKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const slots = allSlots.filter((slot) => String(slot.start_at || "").slice(0, 10) === selectedDate);
  const availableDates = useMemo(() => new Set(allSlots.map((slot) => String(slot.start_at || "").slice(0, 10)).filter(Boolean)), [allSlots]);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const leadingDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const calendarCells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
    const day = index - leadingDays + 1;
    return day > 0 ? day : null;
  });

  useEffect(() => {
    const nextDate = parseDateKey(selectedDate || localDateKey(new Date()));
    setCalendarMonth((current) => (
      current.getFullYear() === nextDate.getFullYear() && current.getMonth() === nextDate.getMonth()
        ? current
        : new Date(nextDate.getFullYear(), nextDate.getMonth(), 1)
    ));
  }, [selectedDate]);

  return <section className="appointment-mobile-sheet customer-mtm-availability-screen">
    <button className="customer-mobile-back-link customer-mtm-availability-back" type="button" onClick={onBack}>
      <MobileIcon name="arrow-left" />
      <span>Go back</span>
    </button>
    <div className="customer-mobile-book-card customer-mobile-book-card-shot customer-mtm-calendar-card">
      <div className="customer-mobile-book-month">
        <strong>{calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong>
        <div className="customer-mobile-book-arrows">
          <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><MobileIcon name="arrow-left" /></button>
          <button type="button" aria-label="Next month" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><MobileIcon name="arrow-right" /></button>
        </div>
      </div>
      <div className="customer-mobile-calendar-head">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="customer-mobile-calendar-grid">
        {calendarCells.map((day, index) => {
          if (!day) return <span key={`mtm-calendar-blank-${index}`} />;
          const dateValue = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const unavailable = !availableDates.has(dateValue);
          return <button
            key={dateValue}
            type="button"
            className={`customer-mobile-calendar-day ${selectedDate === dateValue ? "active" : ""} ${unavailable ? "is-past" : ""}`}
            disabled={unavailable || busy}
            aria-label={`Select ${friendlyDateFromDateKey(dateValue, storeTimeZone)}`}
            onClick={() => {
              onUpdateDate(dateValue);
              const firstSlot = allSlots.find((slot) => String(slot.start_at || "").slice(0, 10) === dateValue);
              onSelectSlot(firstSlot || null);
            }}
          >
            {day}
          </button>;
        })}
      </div>
      <div className="customer-mobile-time-row customer-mobile-time-row-shot">
        <strong>Time</strong>
        <select
          aria-label="Select a time"
          value={selectedSlot?.start_at || ""}
          disabled={loading || busy || !slots.length}
          onChange={(event) => onSelectSlot(slots.find((slot) => slot.start_at === event.target.value) || null)}
        >
          <option value="">{loading ? "Checking availability..." : slots.length ? "Select a time" : "No time available"}</option>
          {slots.map((slot) => <option key={slot.start_at} value={slot.start_at}>{formatTime(slot.start_at, storeTimeZone)}</option>)}
        </select>
      </div>
      {error ? <p className="customer-mobile-field-error" role="alert">{error}</p> : null}
    </div>
    {busy ? <div className="customer-mtm-pharmacist-search" role="status" aria-live="polite"><BrandedSpinner label="Finding available Pharmacists" /><span>Finding available Pharmacists</span></div> : null}
    <button className="appointment-primary-cta" type="button" disabled={!selectedSlot || loading || busy} onClick={onReserve}>Confirm Availability</button>
    <button className="customer-mobile-secondary-button" type="button" disabled={busy} onClick={onRefresh}>Refresh availability</button>
  </section>;
}

function CheckoutPage({ journey, doctor, onBack, onRefreshConfirmation, onCancelCheckoutAppointment, storeCurrency, storeTimeZone, livePaymentsEnabled = false }) {
  const appointment = journey.checkout?.appointment || journey.appointment;
  const paymentUrl = resolveAppointmentCheckoutUrl(journey.checkout);
  const paymentStatusValue = String(journey.checkout?.payment_status || appointment?.payment_status || "pending").toLowerCase();
  const appointmentStatusValue = String(appointment?.status || "").toLowerCase();
  const hasAppointment = Boolean(appointment?.id);
  const paymentPending = hasAppointment && paymentStatusValue !== "paid";
    const pendingRefreshMessage = journey.error === "Payment has not been confirmed yet. Complete checkout, then refresh.";
  const hasError = Boolean(journey.error) && !pendingRefreshMessage;
  const statusTone = hasError ? "error" : paymentPending ? "warning" : "success";
  const paymentStatus = hasError ? "Failed" : paymentPending ? "Pending" : titleCase(paymentStatusValue || "paid");
  const doctorName = doctor?.display_name || appointment?.doctor?.display_name || (appointment ? appointmentDoctorLabel(appointment, doctor) : "Assigned doctor");
  const appointmentDate = appointment?.start_at ? friendlyDate(appointment.start_at, storeTimeZone) : "Not scheduled";
  const appointmentTime = appointment?.start_at ? formatTime(appointment.start_at, storeTimeZone) : "Not scheduled";
  const appointmentAmount = money(journey.checkout?.total || 0, storeCurrency);
  const canRefreshPayment = hasAppointment && paymentPending && !hasError;
  const canCancelAppointment = hasAppointment && !journey.loading;
  const canProceedToPayment = canRefreshPayment && Boolean(paymentUrl);
  const heading = hasError ? "Appointment unavailable" : paymentPending ? "Appointment reserved" : "Appointment ready";
  const subtitle = hasError ? "We could not complete this booking step. Review the error below and try again." : paymentPending ? "Complete payment to confirm your consultation." : "Your booking details are ready.";
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  useEffect(() => {
    const reservedUntil = String(appointment?.reserved_until || "").trim();
    if (!paymentPending || !reservedUntil) {
      setRemainingSeconds(0);
      return undefined;
    }
    const expiry = Date.parse(`${reservedUntil.replace(" ", "T")}Z`);
    const updateCountdown = () => setRemainingSeconds(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)));
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [appointment?.reserved_until, paymentPending]);
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
    useEffect(() => {
      if (!paymentPending || !appointment?.id || journey.loading) {
        return;
      }
      const eventSource = new EventSource("/api/customer/appointments/events");
      const handleAppointmentEvent = (event) => {
        try {
          const parsed = JSON.parse(event.data || "{}");
          const payload = parsed?.payload || {};
          if (String(payload.appointment_id || "") !== String(appointment.id)) {
            return;
          }
          const paymentState = String(payload.payment_status || "").toLowerCase();
          const appointmentState = String(payload.status || "").toLowerCase();
          if (paymentState === "paid" || appointmentState === "confirmed") {
            onRefreshConfirmation();
          }
        } catch {
          // ignore malformed SSE payloads
        }
      };
      eventSource.addEventListener("appointment", handleAppointmentEvent);
      return () => {
        eventSource.removeEventListener("appointment", handleAppointmentEvent);
        eventSource.close();
      };
    }, [appointment?.id, journey.loading, onRefreshConfirmation, paymentPending]);
  return <div className="customer-confirmation-modal customer-appointment-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-checkout-title">
    <section className={`customer-flow-status-page customer-flow-status-page-${statusTone} customer-flow-status-page-modal`}>
      <div className={`customer-flow-status-card customer-flow-status-card-checkout is-${statusTone}`}>
      <header className="customer-flow-status-head">
        <CustomerStatusIcon tone={statusTone} type={hasError ? "error" : paymentPending ? "warning" : "check"} />
        {paymentPending && !hasError ? <div className="customer-reservation-countdown" role="timer" aria-live="off">
          <strong>{countdown}</strong>
        </div> : null}
        <h2 id="appointment-checkout-title">{heading}</h2>
        <p>{subtitle}</p>
      </header>

      {paymentPending && !hasError ? <section className="customer-flow-amount-card" aria-label="Amount due">
        <div>
          <span className="customer-flow-amount-label">Amount due</span>
          <strong className="customer-flow-amount-value">{appointmentAmount}</strong>
        </div>
        <CustomerStatusPill tone="processing">Pending payment</CustomerStatusPill>
      </section> : null}

      <section className="customer-flow-status-panel customer-flow-status-panel-soft" aria-label="Appointment details">
        <CustomerStatusKeyValueList rows={[
          { label: "Doctor", value: doctorName },
          { label: "Date", value: appointmentDate },
          { label: "Time", value: appointmentTime },
          { label: "Amount", value: appointmentAmount },
        ]} />
      </section>

      {pendingRefreshMessage ? <div className="customer-flow-status-note">
        <p>Payment confirmation will appear automatically once the gateway webhook is received. You can still check manually if needed.</p>
      </div> : null}
      {hasError ? <div className="customer-flow-status-alert">
        <p>{journey.error}</p>
      </div> : null}

      <CustomerStatusActions>
        {canProceedToPayment ? <a className="customer-mobile-primary-button customer-flow-status-link" href={paymentUrl}>{!livePaymentsEnabled && paymentUrl === "#demo-payment" ? "Open demo payment" : "Proceed to payment"}</a> : null}
        {canRefreshPayment ? <button className="customer-mobile-secondary-button" type="button" onClick={onRefreshConfirmation} disabled={journey.loading}>{journey.loading ? <BrandedSpinner className="button-spinner" label="Checking payment status" /> : "I have made payment"}</button> : null}
        {!paymentPending && hasAppointment ? <button className="customer-mobile-primary-button" type="button" onClick={onRefreshConfirmation} disabled={journey.loading}>{journey.loading ? <BrandedSpinner className="button-spinner" label="Loading confirmation" /> : "View confirmation"}</button> : null}
        {canCancelAppointment ? <button className="customer-mobile-secondary-button customer-flow-status-danger-button" type="button" onClick={onCancelCheckoutAppointment} disabled={journey.loading}>Cancel Appointment</button> : null}
      </CustomerStatusActions>

      <CustomerStatusSecurityNote tone={statusTone === "error" ? "warning" : "success"}>
        Your appointment information is secure and only used for your consultation.
      </CustomerStatusSecurityNote>
      </div>
    </section>
  </div>;
  
}

function ConfirmationPage({ journey, doctor, onBack, calendarDownloadUrl, storeTimeZone }) {
  const confirmation = journey.confirmation;
  const appointment = confirmation?.appointment || journey.appointment;
  const joinUrl = appointmentIsUpcoming(appointment) ? getAppointmentJoinUrl(appointment, confirmation) : "";
  const doctorName = doctor?.display_name || appointment?.doctor?.display_name || "Assigned doctor";
  return <div className="customer-confirmation-modal customer-appointment-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-confirmation-title">
    <section className="customer-flow-status-page customer-flow-status-page-success customer-flow-status-page-modal">
      <div className="customer-flow-status-card customer-flow-status-card-confirmed is-success">
      <header className="customer-flow-status-head">
        <CustomerStatusIcon tone="success" type="check" />
        <h2 id="appointment-confirmation-title">Appointment confirmed</h2>
        <p>Your consultation is booked and the appointment details are ready.</p>
      </header>

      <section className="customer-flow-status-panel customer-flow-status-panel-soft" aria-label="Confirmed appointment details">
        <CustomerStatusKeyValueList rows={[
          { label: "Doctor", value: doctorName },
          { label: "Date", value: friendlyDate(appointment?.start_at, storeTimeZone) },
          { label: "Time", value: formatTime(appointment?.start_at, storeTimeZone) },
          { label: "Order", value: confirmation?.order_number || "Paid" },
        ]} />
      </section>

      <CustomerStatusActions>
        {joinUrl ? <a className="customer-mobile-primary-button customer-flow-status-link" href={joinUrl} target="_blank" rel="noreferrer">Join meeting</a> : <button className="customer-mobile-primary-button" type="button" onClick={onBack}>View appointments</button>}
        {calendarDownloadUrl ? <a className="customer-mobile-secondary-button customer-flow-status-link" href={calendarDownloadUrl} target="_blank" rel="noreferrer">Add to Apple Calendar</a> : null}
        {confirmation?.calendar?.outlook_url ? <a className="customer-mobile-secondary-button customer-flow-status-link" href={confirmation.calendar.outlook_url} target="_blank" rel="noreferrer">Add to Outlook</a> : null}
      </CustomerStatusActions>

      <CustomerStatusSecurityNote tone="success">
        Your appointment information is secure and only used for your consultation.
      </CustomerStatusSecurityNote>
      </div>
    </section>
  </div>;
}

function PatientReviewsPage({ doctor, journey, pastAppointments, onBack, onReviewDraftChange, onSubmitReview }) {
  const summary = journey.reviews?.summary || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const reviews = journey.reviews?.reviews || [];
  const eligibleAppointment = pastAppointments.find((appointment) => Number(appointment.doctor_user_id) === Number(journey.doctorId) && appointment.status === "completed" && !appointment.review);
  return <section className="appointment-mobile-sheet customer-reviews-shell">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>{"<"}</button>
      <h2>Patient reviews</h2>
      <div className="appointment-circle-button appointment-circle-button-static">*</div>
    </div>
    <div className="customer-reviews-grid">
    <div className="appointment-surface-card">
      <div className="appointment-surface-head">
        <div>
          <h3>{doctor?.display_name || "Doctor"}</h3>
          <p>{Number(summary.average || 0).toFixed(1)} / 5 · {summary.count || 0} reviews</p>
        </div>
      </div>
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = summary.distribution?.[rating] || 0;
        const fill = summary.count ? `${(count / summary.count) * 100}%` : "0%";
        return <div className="review-bar-row" key={rating}>
          <div className="review-bar-label"><span>{rating}</span><small>*</small></div>
          <div className="review-bar-track"><span style={{ width: fill }} /></div>
          <div className="review-bar-text">{count}</div>
        </div>;
      })}
    </div>
    {journey.error ? <p className="receipt-feedback">{journey.error}</p> : null}
    {journey.reviewFeedback ? <p className="receipt-feedback">{journey.reviewFeedback}</p> : null}
    {eligibleAppointment ? <div className="appointment-surface-card">
      <h3>Leave a review for {doctor?.display_name || "this doctor"}</h3>
      <div className="review-star-picker">
        {[1, 2, 3, 4, 5].map((rating) => <button key={rating} className={journey.reviewDraft.rating >= rating ? "active" : ""} type="button" onClick={() => onReviewDraftChange("rating", rating)}>*</button>)}
      </div>
      <textarea className="review-textarea" rows={4} placeholder="Share your consultation experience" value={journey.reviewDraft.reviewText} onChange={(event) => onReviewDraftChange("reviewText", sanitizeClientText(event.target.value, { max: 1000 }))} />
      <button className="appointment-primary-cta" type="button" onClick={onSubmitReview} disabled={journey.loading}>Submit review</button>
    </div> : null}
    <div className="review-list-stack">
      {reviews.length ? reviews.map((review) => <article className="review-entry-card" key={review.id}>
        <div className="review-entry-head">
          <div className="review-entry-avatar">{initials(review.patient?.display_name || "Patient")}</div>
          <div>
            <div className="card-title">{review.patient?.display_name || "Patient"}</div>
            <div className="card-desc">{shortDate(review.created_at)}</div>
          </div>
          <div className="review-rating-pill">* {Number(review.rating || 0).toFixed(1)}</div>
        </div>
        <p>{review.review_text || "Verified completed appointment."}</p>
      </article>) : <div className="empty-card compact-empty"><div className="card-title">No reviews yet.</div></div>}
    </div>
    </div>
  </section>;
}

function AppointmentSection({ title, items, doctors, storeTimeZone, loading = false, emptyCtaLabel = "", onEmptyCta = null, onOpenAppointment = null }) {
  if (loading) {
    return <div className="customer-mobile-appointment-history-list" role="region" aria-label={`${title} loading`}>
      {Array.from({ length: 4 }, (_, index) => <article className="customer-mobile-visit-row customer-mobile-visit-row-shot skeleton-panel" key={`customer-appointment-live-skeleton-${index}`}>
        <div className="customer-mobile-clock skeleton-circle skeleton-circle-sm" />
        <div className="customer-mobile-visit-copy">
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
      </article>)}
    </div>;
  }
  if (!items.length) {
    return <CustomerMobileEmptyState
      message="You have no appointments"
      ctaLabel={emptyCtaLabel || ""}
      onCta={onEmptyCta}
      illustrationSrc="/group-3.png"
      ctaStyle="appointment"
    />;
  }

  return <div className="customer-mobile-appointment-history-list" role="region" aria-label={`${title} appointments`}>
    {items.map((appointment) => {
      const doctor = doctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
      const doctorLabel = appointmentDoctorLabel(appointment, doctor);
      const appointmentStatusTone = appointmentChipTone(appointment);
      const appointmentStatusLabel = appointmentChipLabel(appointment);
      return <article className="customer-mobile-visit-row customer-mobile-visit-row-shot" key={appointment.id}>
        {onOpenAppointment ? <button className="customer-mobile-row-overlay" type="button" aria-label="Open appointment details" onClick={() => onOpenAppointment(appointment)} /> : null}
        <div className="customer-mobile-clock">
          <MobileIcon name="clock" />
        </div>
        <div className="customer-mobile-visit-copy customer-mobile-visit-copy-shot">
          <strong>{appointmentDisplayTitle(appointment, doctor)}</strong>
          <span>{formatAppointmentListDateTime(appointment.start_at, storeTimeZone)}</span>
          <small>{doctorLabel}</small>
        </div>
        <div className="customer-mobile-appointment-status">
          <div className="appointment-status-stack">
            <span className={`chip ${appointmentStatusTone}`}><span className="chip-dot" />{appointmentStatusLabel}</span>
            {appointmentHasPrescription(appointment) ? <span className="appointment-prescription-availability">Prescription Available</span> : null}
          </div>
        </div>
      </article>;
    })}
  </div>;
}

function CustomerStatusIcon({ tone = "success", type = "check" }) {
  return <div className={`customer-flow-status-icon is-${tone}`} aria-hidden="true">
    {type === "warning" ? <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" /><path d="M24 14V25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><circle cx="24" cy="31.5" r="1.8" fill="currentColor" /></svg> : null}
    {type === "error" ? <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" /><path d="M18 18L30 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><path d="M30 18L18 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg> : null}
    {type === "calendar" ? <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" /><path d="M16 24L22 30L32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
    {type === "check" ? <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" /><path d="M16 24L22 30L32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
  </div>;
}

function CustomerStatusPill({ tone = "info", children }) {
  return <span className={`customer-flow-status-pill is-${tone}`}>{children}</span>;
}

function CustomerStatusKeyValueList({ rows = [] }) {
  return <div className="customer-flow-kv-list">
    {rows.map((row) => <div className="customer-flow-kv-row" key={row.label}>
      <span className="customer-flow-kv-key">{row.label}</span>
      <span className="customer-flow-kv-value">{row.value}</span>
    </div>)}
  </div>;
}

function CustomerStatusSecurityNote({ tone = "success", children }) {
  return <div className={`customer-flow-security-note is-${tone}`}>
    <span className="customer-flow-security-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="m7.5 12.2 3 3 6-7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
    <p>{children}</p>
  </div>;
}

function CustomerStatusActions({ children }) {
  return <div className="customer-flow-status-actions">{children}</div>;
}

function SettingsPage({ profile, doctors, orders, appointments, settings, displayName = "Patient", uploading = false, imageRefreshing = false, imageError = "", imageSuccess = "", imageInputRef = null, onProfileImageSelect, onProfileImageOpen, validationErrors = {}, onSettingsChange, onLogout, logoutBusy = false }) {
  const invoiceCount = orders.filter((order) => ["processing", "completed"].includes(String(order.status || "").toLowerCase())).length;
  return <div className="customer-dashboard-stack customer-desktop-boxed-page">
    <section className="customer-list-shell customer-settings-shell">
      <div className="profile-card customer-settings-hero">
        <CustomerProfilePhotoWidget
          profile={profile}
          displayName={displayName}
          uploading={uploading}
          refreshing={imageRefreshing}
          error={imageError}
          success={imageSuccess}
          inputRef={imageInputRef}
          onSelect={onProfileImageSelect}
          onOpen={onProfileImageOpen}
          className="customer-desktop-photo-slot"
        />
        <div>
          <div className="card-title">{displayName}</div>
          <div className="card-desc">{settings.email || profile.email || "No email available"}</div>
          <div className="profile-stats">
            <span className="profile-stat">{appointments.length} appointments</span>
            <span className="profile-stat">{orders.length} orders</span>
            <span className="profile-stat">{doctors.length} doctors</span>
          </div>
        </div>
      </div>

      <div className="category-row customer-settings-category-row">
        <div className="category-card metric-card">
          <strong>{invoiceCount}</strong>
          <div className="category-name">Invoices</div>
          <div className="category-meta">Ready for receipts</div>
        </div>
        <div className="category-card">
          <div className="category-icon green">{settings.preferredDoctorIds.length}</div>
          <div><div className="category-meta">Saved</div><div className="category-name">Preferred doctors</div></div>
        </div>
        <div className="category-card">
          <div className="category-icon yellow">{settings.savedMethods.length || 0}</div>
          <div><div className="category-meta">WooCommerce</div><div className="category-name">Saved methods</div></div>
        </div>
        <div className="category-card">
          <div className="category-icon lilac">{settings.twoFactorEnabled ? "2FA" : "Off"}</div>
          <div><div className="category-meta">Security</div><div className="category-name">Account protection</div></div>
        </div>
      </div>

      <div className="customer-settings-grid customer-settings-grid-design">
        <article className="order-card customer-settings-panel">
          <div>
            <div className="card-title">My profile</div>
            <div className="card-desc">Identity and delivery information</div>
          </div>
          <div className="customer-settings-form-grid">
              <label><span>Display name</span><input value={settings.displayName} className={validationErrors.displayName ? "has-error" : ""} placeholder={displayName} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: sanitizeClientText(event.target.value, { max: 120 }) }))} />{validationErrors.displayName ? <small className="customer-mobile-field-error">{validationErrors.displayName}</small> : null}</label>
              <label><span>Email</span><input type="email" inputMode="email" value={settings.email} className={validationErrors.email ? "has-error" : ""} placeholder={profile.email || "customer@email.com"} onChange={(event) => onSettingsChange((current) => ({ ...current, email: sanitizeClientText(event.target.value, { max: 254 }).replace(/\s+/g, "") }))} />{validationErrors.email ? <small className="customer-mobile-field-error">{validationErrors.email}</small> : null}</label>
              <label><span>Phone number</span><input type="tel" inputMode="tel" maxLength={11} value={settings.phone} className={validationErrors.phone ? "has-error" : ""} placeholder="+234 ..." onChange={(event) => onSettingsChange((current) => ({ ...current, phone: normalizeMtmPhoneNumber(event.target.value) }))} />{validationErrors.phone ? <small className="customer-mobile-field-error">{validationErrors.phone}</small> : null}</label>
              <label><span>Address</span><textarea rows={3} className={validationErrors.address ? "has-error" : ""} value={settings.address} onChange={(event) => onSettingsChange((current) => ({ ...current, address: sanitizeClientText(event.target.value, { max: 200 }) }))} />{validationErrors.address ? <small className="customer-mobile-field-error">{validationErrors.address}</small> : null}</label>
          </div>
        </article>

        <article className="appointment-card customer-settings-panel customer-settings-panel-stack">
          <div>
            <div className="card-title">Appointment settings</div>
            <div className="card-desc">Preferences and preferred doctors</div>
          </div>
          <div className="customer-settings-form-grid">
            <label><span>Preferred consultation type</span>
              <select value={settings.preferredConsultationType} onChange={(event) => onSettingsChange((current) => ({ ...current, preferredConsultationType: event.target.value }))}>
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
              </select>
            </label>
              <label><span>Timezone</span><input value={settings.timezone} className={validationErrors.timezone ? "has-error" : ""} onChange={(event) => onSettingsChange((current) => ({ ...current, timezone: sanitizeClientText(event.target.value, { max: 80 }) }))} />{validationErrors.timezone ? <small className="customer-mobile-field-error">{validationErrors.timezone}</small> : null}</label>
          </div>
          <div className="customer-tag-list">
            {doctors.length ? doctors.map((doctor) => {
              const doctorId = String(doctor.user_id || doctor.id);
              const active = settings.preferredDoctorIds.includes(doctorId);
              return <button className={`customer-tag-button ${active ? "active" : ""}`} key={doctorId} type="button" onClick={() => onSettingsChange((current) => togglePreferredDoctor(current, doctorId))}>{doctor.display_name || "Doctor"}</button>;
            }) : <div className="muted">Preferred doctors will appear here once the directory is loaded.</div>}
          </div>
        </article>

        <article className="order-card customer-settings-panel customer-settings-panel-stack">
          <div>
            <div className="card-title">Notifications</div>
            <div className="card-desc">Reminder and alert preferences</div>
          </div>
          <SettingsToggle label="Email reminders" checked={settings.emailReminders} onChange={(checked) => onSettingsChange((current) => ({ ...current, emailReminders: checked }))} />
          <SettingsToggle label="Appointment reminders" checked={settings.appointmentReminders} onChange={(checked) => onSettingsChange((current) => ({ ...current, appointmentReminders: checked }))} />
          <SettingsToggle label="Prescription alerts" checked={settings.prescriptionAlerts} onChange={(checked) => onSettingsChange((current) => ({ ...current, prescriptionAlerts: checked }))} />
          <SettingsToggle label="Payment receipts" checked={settings.paymentReceipts} onChange={(checked) => onSettingsChange((current) => ({ ...current, paymentReceipts: checked }))} />
          <SettingsToggle label="Marketing opt-in" checked={settings.marketingOptIn} onChange={(checked) => onSettingsChange((current) => ({ ...current, marketingOptIn: checked }))} />
        </article>

        <article className="notification-card customer-settings-panel customer-settings-panel-stack">
          <div>
            <div className="card-title">Payments and security</div>
            <div className="card-desc">Invoices, refund tracking, and protection</div>
          </div>
          <div className="customer-settings-summary"><span>Refund tracking</span><strong>{settings.refundTracking ? "Enabled" : "Disabled"}</strong></div>
          <div className="customer-settings-summary"><span>Saved methods</span><strong>{settings.savedMethods.length || 0}</strong></div>
          <div className="customer-settings-summary"><span>Two-factor authentication</span><strong>{settings.twoFactorEnabled ? "Enabled" : "Disabled"}</strong></div>
          <SettingsToggle label="Refund tracking" checked={settings.refundTracking} onChange={(checked) => onSettingsChange((current) => ({ ...current, refundTracking: checked }))} />
          <SettingsToggle label="Two-factor authentication" checked={settings.twoFactorEnabled} onChange={(checked) => onSettingsChange((current) => ({ ...current, twoFactorEnabled: checked }))} />
          <button className="pill-button danger customer-settings-logout" type="button" onClick={onLogout} disabled={logoutBusy}>
            {logoutBusy ? <span className="appointment-cta-spinner" aria-label="Logging out" /> : "Logout all devices"}
          </button>
        </article>
      </div>
    </section>
  </div>;
}

function SettingsToggle({ label, checked, onChange }) {
  return <label className="customer-toggle-row">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function CustomerProfilePhotoWidget({ profile, displayName, uploading, refreshing = false, error, success, cooldownUntil = 0, inputRef, onSelect, onOpen, className = "" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSettling, setUploadSettling] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [localError, setLocalError] = useState("");
  const [cropError, setCropError] = useState("");
  const [loadingCropImage, setLoadingCropImage] = useState(false);
  const [cropState, setCropState] = useState(null);
  const [pendingImageMeta, setPendingImageMeta] = useState(null);
  const [cropViewportSize, setCropViewportSize] = useState(0);
    const [cooldownNow, setCooldownNow] = useState(() => Date.now());
      const avatarUrl = String(profile?.avatar_url || "").trim();
  const previousUploadingRef = useRef(false);
  const triggerRef = useRef(null);
  const viewerCloseRef = useRef(null);
  const uploadCloseRef = useRef(null);
  const cropSurfaceRef = useRef(null);
  const dragStateRef = useRef(null);

  useEffect(() => {
    let timeoutId;

    if (refreshing) {
      setUploadSettling(false);
    } else if (previousUploadingRef.current) {
      setUploadSettling(true);
      timeoutId = window.setTimeout(() => setUploadSettling(false), 720);
    }

    previousUploadingRef.current = refreshing;
    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [avatarUrl, refreshing]);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(pendingFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [pendingFile]);

  useEffect(() => {
    if (!viewerOpen && !uploadOpen) {
      return undefined;
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setViewerOpen(false);
        setUploadOpen(false);
        setMenuOpen(false);
        setPendingFile(null);
        setPendingImageMeta(null);
        setCropState(null);
        setCropError("");
        setLocalError("");
        if (inputRef?.current) {
          inputRef.current.value = "";
        }
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [inputRef, uploadOpen, viewerOpen]);

  useEffect(() => {
    if (viewerOpen) {
      viewerCloseRef.current?.focus();
    }
  }, [viewerOpen]);

  useEffect(() => {
    if (uploadOpen) {
      uploadCloseRef.current?.focus();
    }
  }, [uploadOpen]);

  useEffect(() => {
    if (!uploadOpen) {
      setCropViewportSize(0);
      return undefined;
    }

    function measureCropViewport() {
      const nextSize = Number(cropSurfaceRef.current?.clientWidth || 0);
      setCropViewportSize((current) => (current !== nextSize ? nextSize : current));
    }

    measureCropViewport();

    if (typeof ResizeObserver === "function" && cropSurfaceRef.current) {
      const observer = new ResizeObserver(() => measureCropViewport());
      observer.observe(cropSurfaceRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measureCropViewport);
    return () => window.removeEventListener("resize", measureCropViewport);
  }, [uploadOpen]);

  useEffect(() => {
    if (!pendingImageMeta || !cropViewportSize) {
      return;
    }

    setCropState((current) => createProfileImageCropState({
      naturalWidth: pendingImageMeta.naturalWidth,
      naturalHeight: pendingImageMeta.naturalHeight,
      cropSize: cropViewportSize,
      zoom: current?.zoom || PROFILE_IMAGE_MIN_ZOOM,
      offsetX: current?.offsetX || 0,
      offsetY: current?.offsetY || 0,
    }));
  }, [cropViewportSize, pendingImageMeta]);

  useEffect(() => {
    function handlePointerMove(event) {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      const nextOffsetX = dragState.originX + (event.clientX - dragState.startX);
      const nextOffsetY = dragState.originY + (event.clientY - dragState.startY);
      setCropState((current) => {
        if (!current) {
          return current;
        }
        return createProfileImageCropState({
          ...current,
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
        });
      });
    }

    function stopDragging() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  function restoreFocus() {
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function resetCropState(meta) {
    if (!meta || !cropViewportSize) {
      setCropState(null);
      return;
    }
    setCropState(createProfileImageCropState({
      naturalWidth: meta.naturalWidth,
      naturalHeight: meta.naturalHeight,
      cropSize: cropViewportSize,
    }));
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function closeViewer() {
    setViewerOpen(false);
    restoreFocus();
  }

  function closeUploadModal({ force = false } = {}) {
    if (uploading && !force) {
      return;
    }
    setUploadOpen(false);
    setPendingFile(null);
    setPendingImageMeta(null);
    setCropState(null);
    setCropError("");
    setLocalError("");
    setLoadingCropImage(false);
    dragStateRef.current = null;
    if (inputRef?.current) {
      inputRef.current.value = "";
    }
    restoreFocus();
  }

  function handleAvatarClick() {
    if (uploading || refreshing) {
      return;
    }
    setMenuOpen((open) => !open);
  }

  function handleViewPhoto() {
    closeMenu();
    if (avatarUrl) {
      setViewerOpen(true);
    }
  }

  function handleUploadPhoto() {
    closeMenu();
    setPendingFile(null);
    setPendingImageMeta(null);
    setCropState(null);
    setCropError("");
    setLocalError("");
    setUploadOpen(false);
    window.setTimeout(() => inputRef?.current?.click(), 0);
  }

  async function handleNativeFileChange(event) {
    const file = event.target.files?.[0] || null;
    const validationMessage = validateCustomerProfileImageFile(file);
    if (validationMessage) {
      setPendingFile(null);
      setPendingImageMeta(null);
      setCropState(null);
      setCropError("");
      setLocalError(validationMessage);
      return;
    }

    setLoadingCropImage(true);
    setCropError("");
    setLocalError("");
    try {
      const dimensions = await loadImageDimensions(file);
      const meta = {
        naturalWidth: dimensions.naturalWidth,
        naturalHeight: dimensions.naturalHeight,
      };
      setPendingFile(file);
      setPendingImageMeta(meta);
      setUploadOpen(true);
      if (cropViewportSize) {
        resetCropState(meta);
      }
    } catch (loadError) {
      setPendingFile(null);
      setPendingImageMeta(null);
      setCropState(null);
      setLocalError(loadError?.message || "Unable to read the selected image.");
    } finally {
      setLoadingCropImage(false);
    }
  }

  function handleCropPointerDown(event) {
    if (!cropState || loadingCropImage) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: cropState.offsetX,
      originY: cropState.offsetY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleZoomChange(event) {
    const nextZoom = Number(event.target.value || PROFILE_IMAGE_MIN_ZOOM);
    setCropState((current) => current ? createProfileImageCropState({
      ...current,
      zoom: nextZoom,
    }) : current);
  }

  function handleResetCrop() {
    setCropError("");
    resetCropState(pendingImageMeta);
  }

  async function handleSaveImage() {
    if (profileImageCooldownActive) {
      setCropError(formatProfileImageRateLimitMessage(profileImageCooldownSeconds));
      return;
    }
    if (!pendingFile || !cropState || uploading || loadingCropImage) {
      setCropError("Select an image to continue.");
      return;
    }

    setCropError("");
    try {
      const preparedUpload = await renderCroppedProfileImage(pendingFile, cropState);
      const uploadSucceeded = await onSelect?.(preparedUpload);
      if (uploadSucceeded !== false) {
        closeUploadModal({ force: true });
      }
    } catch (saveError) {
      setCropError(saveError?.message || "Unable to prepare the selected image.");
    }
  }

  const profileImageCooldownSeconds = Math.max(0, Math.ceil((Number(cooldownUntil || 0) - cooldownNow) / 1000));
      const profileImageCooldownActive = profileImageCooldownSeconds > 0;
        const saveDisabled = uploading || loadingCropImage || !pendingFile || !cropState || profileImageCooldownActive;
        
  const widgetClassName = [
      "customer-mobile-photo-widget",
    className,
    refreshing ? "is-refreshing" : "",
    uploadSettling ? "is-upload-settling" : "",
  ].filter(Boolean).join(" ");

  const cropImageStyle = cropState && cropViewportSize ? {
    width: (cropState.naturalWidth * cropState.scale) + "px",
    height: (cropState.naturalHeight * cropState.scale) + "px",
    transform: "translate(" + (cropState.offsetX - ((cropState.naturalWidth * cropState.scale) / 2)) + "px, " + (cropState.offsetY - ((cropState.naturalHeight * cropState.scale) / 2)) + "px)",
  } : undefined;

  return (
    <div className={widgetClassName}>
      <button
        ref={triggerRef}
        className="customer-mobile-photo-button"
        type="button"
        onClick={handleAvatarClick}
        disabled={uploading || refreshing}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Open profile image options"
      >
        <div className="customer-mobile-avatar large customer-mobile-photo-avatar">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
                event.currentTarget.nextElementSibling.style.display = "inline";
              }}
            />
          ) : null}
          <span style={{ display: avatarUrl ? "none" : "inline" }}>{initials(displayName)}</span>
          {refreshing ? <span className="customer-mobile-photo-processing" aria-hidden="true"><span className="appointment-cta-spinner" /></span> : null}
        </div>
        <span className="customer-mobile-photo-camera" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" focusable="false">
            <path d="M8.6 6.5 10 4.75h4l1.4 1.75H18a3 3 0 0 1 3 3v6.75a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3h2.6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 15.75a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
      </button>

      {menuOpen ? (
        <div className="customer-mobile-photo-menu" role="menu" aria-label="Profile photo options">
          <button type="button" role="menuitem" onClick={handleViewPhoto} disabled={!avatarUrl}>
            View Image
          </button>
          <button type="button" role="menuitem" onClick={handleUploadPhoto} disabled={refreshing}>
            Upload Image
          </button>
          <button type="button" role="menuitem" onClick={closeMenu}>
            Close
          </button>
        </div>
      ) : null}

      {viewerOpen && avatarUrl ? (
        <div className="customer-photo-viewer" role="dialog" aria-modal="true" aria-label="Profile image preview" onClick={closeViewer}>
          <div className="customer-photo-viewer-card customer-profile-modal-card" onClick={(event) => event.stopPropagation()}>
            <button ref={viewerCloseRef} className="customer-photo-viewer-close" type="button" onClick={closeViewer} aria-label="Close profile image preview">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" focusable="false">
                <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <img src={avatarUrl} alt={displayName + " profile"} className="customer-photo-viewer-image" />
          </div>
        </div>
      ) : null}

      <input ref={inputRef} className="customer-mobile-photo-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleNativeFileChange} />

      {uploadOpen ? (
        <div className="customer-photo-viewer customer-profile-upload-modal" role="dialog" aria-modal="true" aria-label="Upload Profile Image" onClick={() => { if (!uploading) { closeUploadModal(); } }}>
          <div className="customer-photo-viewer-card customer-profile-modal-card customer-profile-upload-card" onClick={(event) => event.stopPropagation()}>
            <button ref={uploadCloseRef} className="customer-photo-viewer-close" type="button" onClick={closeUploadModal} aria-label="Close upload profile image modal" disabled={uploading}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" focusable="false">
                <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <div className="customer-profile-modal-head">
              <span className="customer-section-kicker">Profile image</span>
              <h3>Edit Image</h3>
              <p>Drag to frame your photo, then save the square crop for your profile avatar.</p>
            </div>
            <div className="customer-profile-cropper-shell">
              <div
                ref={cropSurfaceRef}
                className={"customer-profile-cropper-surface" + (loadingCropImage ? " is-loading" : "")}
                onPointerDown={handleCropPointerDown}
                role="presentation"
              >
                {previewUrl && cropState && cropViewportSize ? <img src={previewUrl} alt="Profile crop preview" className="customer-profile-cropper-image" style={cropImageStyle} draggable="false" /> : null}
                <div className="customer-profile-cropper-overlay" aria-hidden="true">
                  <div className="customer-profile-cropper-ring" />
                </div>
                <p className="customer-profile-cropper-hint">Drag to reposition image</p>
                {loadingCropImage || (previewUrl && !cropViewportSize) ? <div className="customer-profile-cropper-loading"><span className="appointment-cta-spinner" aria-label="Loading image" /></div> : null}
              </div>
              <div className="customer-profile-cropper-toolbar">
                <label className="customer-profile-cropper-control" htmlFor="customer-profile-cropper-zoom">
                  <span>Zoom</span>
                  <input
                    id="customer-profile-cropper-zoom"
                    type="range"
                    min={PROFILE_IMAGE_MIN_ZOOM}
                    max={PROFILE_IMAGE_MAX_ZOOM}
                    step="0.01"
                    value={cropState?.zoom || PROFILE_IMAGE_MIN_ZOOM}
                    onChange={handleZoomChange}
                    disabled={!cropState || loadingCropImage || uploading}
                  />
                </label>
              </div>
            </div>
            {localError ? <small className="customer-mobile-field-error">{localError}</small> : null}
            {cropError ? <small className="customer-mobile-field-error">{cropError}</small> : null}
            <div className="customer-profile-modal-actions">
              <button type="button" className="pill-button tertiary" onClick={closeUploadModal} disabled={uploading}>Cancel</button>
              <button type="button" className="pill-button primary" onClick={handleSaveImage} disabled={saveDisabled}>
                {uploading ? <span className="appointment-cta-spinner" aria-label="Saving image" /> : (profileImageCooldownActive ? 'Try again in ' + Math.max(1, Math.ceil(profileImageCooldownSeconds / 60)) + 'm' : "Save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {uploading || refreshing ? <span className="sr-only customer-mobile-save-status" aria-live="polite">Uploading profile photo</span> : null}
      {error ? <small className="customer-mobile-field-error">{error}</small> : null}
      {success ? <small className="customer-mobile-save-success">{success}</small> : null}
    </div>
  );
}


function formatSubscriptionAmountNumber(value) {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatSubscriptionCtaAmount(value, currency = "NGN") {
  return `${String(currency || "NGN").trim().toUpperCase() || "NGN"}${formatSubscriptionAmountNumber(value)}`;
}

function formatSubscriptionMemberSince(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatSubscriptionPaymentMethodLabel(paymentMethod) {
  if (!paymentMethod) {
    return "Visa Card";
  }

  const channel = String(paymentMethod.channel || "").trim().toLowerCase();
  if (channel === "card") {
    const cardType = String(paymentMethod.cardType || paymentMethod.card_type || "").trim();
    return cardType ? `${cardType.charAt(0).toUpperCase()}${cardType.slice(1)} Card` : "Visa Card";
  }
  if (channel === "bank_transfer") {
    return "Bank Transfer";
  }
  if (channel === "bank") {
    return paymentMethod.bank ? `Bank · ${paymentMethod.bank}` : "Bank";
  }
  if (channel === "ussd") {
    return "USSD";
  }
  if (channel === "qr") {
    return "QR Payment";
  }
  if (channel === "mobile_money") {
    return "Mobile Money";
  }
  return "Visa Card";
}


function CustomerSubscriptionBenefit({ accentClass, description, icon, title }) {
  const iconSrc = icon?.src || icon;
  return <article className="customer-subscription-benefit-row">
    <span className={`customer-subscription-benefit-icon ${accentClass}`}>
      <img src={iconSrc} alt="" aria-hidden="true" draggable="false" />
    </span>
    <div className="customer-subscription-benefit-copy">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  </article>;
}

function CustomerSubscriptionManagementScreen({ embeddedDesktop = false, onOpenMenu, subscriptionState }) {
  const subscription = subscriptionState?.subscription || {};
  const [activeTab, setActiveTab] = useState("subscription");
  const [dialogStep, setDialogStep] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const primaryActionRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const monthlyAmount = Number(resolveSubscriptionMonthlyAmount(subscription) || 0);
  const currency = String(subscription?.currency || "NGN").trim().toUpperCase() || "NGN";
  const ctaAmountLabel = formatSubscriptionCtaAmount(monthlyAmount, currency);
  const memberSince = formatSubscriptionMemberSince(subscription?.startDate || subscription?.start_date);
  const startDateLabel = shortDate(subscription?.startDate || subscription?.start_date || "") || "Unavailable";
  const renewsOnLabel = shortDate(subscription?.nextPaymentDate || subscription?.next_payment_date || subscription?.renewal_date || subscription?.accessEndsAt || subscription?.access_ends_at || "") || "Unavailable";
  const paymentMethodLabel = formatSubscriptionPaymentMethodLabel(subscription?.paymentMethod || subscription?.payment_method);
  const manageBillingUrl = String(subscription?.manage_billing_url || "").trim();
  const isActiveSubscriber = Boolean(subscriptionState?.active);
  const dialogLabelId = "customer-subscription-dialog-title";
  const benefits = [
    {
      accentClass: "is-violet",
      description: "Access more doctor and care specialist consultations, giving you faster medical attention, consistent follow-ups, and better continuity of care whenever you need support.",
      icon: micBenefitIcon,
      title: "5x more Doctor Consultations.",
    },
    {
      accentClass: "is-amber",
      description: "Get professional medication reviews and guidance to help you understand your prescriptions, manage side effects, and stay on track with your treatment plan.",
      icon: pillBenefitIcon,
      title: "Medical Therapy Management",
    },
    {
      accentClass: "is-green",
      description: "Enjoy convenient prescription refill processing and doorstep medication delivery, helping you stay consistent with treatment.",
      icon: cartBenefitIcon,
      title: "Free Prescription Refills and Deliveries",
    }
  ];


  useEffect(() => {
    if (!dialogStep || typeof window === "undefined") {
      return undefined;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      restoreFocusRef.current = activeElement;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !dialogBusy) {
        event.preventDefault();
        closeDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogBusy, dialogStep]);

  function closeDialog() {
    if (dialogBusy) {
      return;
    }

    setDialogStep("");
    setDialogError("");
    window.setTimeout(() => {
      restoreFocusRef.current?.focus?.();
      primaryActionRef.current?.focus?.();
    }, 0);
  }

  async function handlePrimaryAction() {
    setDialogError("");
    if (isActiveSubscriber) {
      setDialogStep("details");
      return;
    }

    try {
      await subscriptionState?.launchCheckout?.({
        plan: "nevari_access_pro",
        frequency: "monthly",
      });
    } catch {
      // Shared hook exposes its own user-facing errors.
    }
  }

  function handleChangePaymentMethod() {
    if (!manageBillingUrl) {
      return;
    }
    window.location.assign(manageBillingUrl);
  }

  function shouldFallbackToBillingPortal(error) {
    return String(error?.code || "").trim().toLowerCase() === "paystack_cancel_details_missing" && manageBillingUrl !== "";
  }

  async function handleCancelPlan() {
    if (dialogBusy) {
      return;
    }

    setDialogError("");
    setDialogBusy(true);
    try {
      await subscriptionState?.cancelCurrentSubscription?.();
      setDialogStep("cancelled");
    } catch (error) {
      if (shouldFallbackToBillingPortal(error)) {
        window.location.assign(manageBillingUrl);
        return;
      }
      setDialogError(String(error?.message || "The plan could not be cancelled right now."));
    } finally {
      setDialogBusy(false);
    }
  }

  const surfaceClassName = `customer-subscription-management-shell ${embeddedDesktop ? "is-desktop" : "is-mobile"}`;
  const statusText = isActiveSubscriber
    ? memberSince
      ? `Active member since ${memberSince}`
      : "Active member"
    : "";

  if (subscriptionState?.isLoading) {
    return <section className={surfaceClassName} aria-busy="true">
      <div className="customer-subscription-management-card customer-subscription-management-card--loading">
        <BrandedSpinner label="Loading subscription details" />
      </div>
    </section>;
  }

  return <section className={surfaceClassName}>
    {!embeddedDesktop && (isActiveSubscriber || activeTab === "history") ? <button className="subscription-menu-button" type="button" aria-label="Open menu" onClick={onOpenMenu}>
      <span />
      <span />
      <span />
    </button> : null}
    <div className="customer-subscription-management-tabs" role="tablist" aria-label="Nevari Access Pro sections">
      <button className={activeTab === "subscription" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "subscription"} onClick={() => setActiveTab("subscription")}>Subscription</button>
      <button className={activeTab === "history" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "history"} onClick={() => setActiveTab("history")}>History</button>
    </div>

    {activeTab === "subscription" ? (isActiveSubscriber ? <div className="customer-subscription-management-card" role="tabpanel" aria-label="Subscription">
      <header className="customer-subscription-management-header">
        <div className="customer-subscription-management-title-row">
          <h1>Nevari Access</h1>
          <img src={proBadgeImage.src || proBadgeImage} alt="Pro" className="customer-subscription-management-badge" draggable="false" />
        </div>
        {statusText ? <p className="customer-subscription-management-status is-active">{statusText}</p> : null}
      </header>

      <img
        src={proSealImage.src || proSealImage}
        alt="Nevari Access Pro seal"
        className="customer-subscription-management-seal"
        draggable="false"
      />

      <section className="customer-subscription-management-benefits" aria-label="Your benefits">
        <h2>Your Benefits</h2>
        <div className="customer-subscription-benefit-list">
          {benefits.map((benefit) => <CustomerSubscriptionBenefit key={benefit.title} {...benefit} />)}
        </div>
      </section>

      {(subscriptionState?.actionError || dialogError) && !dialogStep ? <p className="customer-mobile-field-error customer-subscription-management-error" role="alert">{dialogError || subscriptionState.actionError}</p> : null}

      <button
        ref={primaryActionRef}
        type="button"
        className="customer-subscription-management-cta"
        onClick={() => {
          void handlePrimaryAction();
        }}
        disabled={Boolean(subscriptionState?.isActionBusy)}
      >
        {subscriptionState?.isActionBusy ? <span className="appointment-cta-spinner" aria-label="Processing subscription action" /> : (isActiveSubscriber ? "Manage Plan" : `Subscribe for ${ctaAmountLabel}/month`)}
      </button>
    </div> : <div className="customer-subscription-management-paywall" role="tabpanel" aria-label="Subscription">
      <Paywall
        busy={Boolean(subscriptionState?.isActionBusy)}
        error={subscriptionState?.actionError || ""}
        onOpenMenu={onOpenMenu}
        onSubscribe={() => subscriptionState?.launchCheckout?.({
          plan: "nevari_access_pro",
          frequency: "monthly",
        })}
        priceLabel={formatSubscriptionPriceLabel(subscription)}
      />
    </div>) : <section className="customer-subscription-history-panel" role="tabpanel" aria-label="History">
      <header className="customer-subscription-history-header">
        <div>
          <h2>Payment history</h2>
          <p>Payments and Nevari Access Pro membership changes.</p>
        </div>
        <button type="button" onClick={() => subscriptionState?.refreshHistory?.()} disabled={Boolean(subscriptionState?.isHistoryLoading)}>Refresh</button>
      </header>

      {subscriptionState?.isHistoryLoading ? <div className="customer-subscription-history-state" aria-busy="true"><BrandedSpinner label="Loading subscription history" /></div> : null}
      {subscriptionState?.historyError ? <p className="customer-mobile-field-error customer-subscription-history-error" role="alert">{subscriptionState.historyError}</p> : null}
      {!subscriptionState?.isHistoryLoading && !subscriptionState?.historyError && !subscriptionState?.history?.length ? <div className="customer-subscription-history-state">
        <strong>No payment history yet</strong>
        <p>Your subscription payments and membership changes will appear here.</p>
      </div> : null}
      {subscriptionState?.history?.length ? <div className="customer-subscription-history-list">
        {subscriptionState.history.map((item) => <article className="customer-subscription-history-item" key={item.id}>
          <span className={`customer-subscription-history-icon is-${String(item.status || "pending").toLowerCase()}`} aria-hidden="true" />
          <div className="customer-subscription-history-copy">
            <div>
              <strong>{item.title || "Subscription update"}</strong>
              <span className={`customer-subscription-history-badge is-${String(item.status || "pending").toLowerCase()}`}>{titleCase(item.status || "pending")}</span>
            </div>
            <p>{item.description || "Nevari Access Pro activity"}</p>
            <small>{shortDate(item.occurred_at) || "Date unavailable"}{item.reference ? ` · ${item.reference}` : ""}</small>
          </div>
          {item.type === "payment" ? <strong className="customer-subscription-history-amount">{money(Number(item.amount || 0), item.currency || "NGN")}</strong> : null}
        </article>)}
      </div> : null}
    </section>}

    {activeTab === "subscription" && dialogStep && typeof document !== "undefined" ? createPortal(
      <div className="customer-subscription-dialog-layer">
        <ModalScrim className="customer-modal-scrim customer-subscription-dialog-backdrop" label="Close subscription dialog" onDismiss={dialogBusy ? undefined : closeDialog} />
        <section className={`customer-subscription-dialog-card customer-subscription-dialog-card--${dialogStep}`} role="dialog" aria-modal="true" aria-labelledby={dialogLabelId}>
          {dialogStep === "details" ? <>
            <div className="customer-subscription-dialog-head">
              <h3 id={dialogLabelId}>Active Subscription</h3>
            </div>
            <div className="customer-subscription-dialog-plan-row">
              <div className="customer-subscription-management-title-row is-dialog">
                <span>Nevari Access</span>
                <img src={proBadgeImage.src || proBadgeImage} alt="Pro" className="customer-subscription-management-badge" draggable="false" />
              </div>
              <div className="customer-subscription-dialog-price"><span>{monthlyAmount > 0 ? currency : ""}</span><strong>{monthlyAmount > 0 ? formatSubscriptionAmountNumber(monthlyAmount) : "Unavailable"}</strong></div>
            </div>
            <div className="customer-subscription-dialog-meta-grid">
              <div>
                <span>Start date</span>
                <strong>{startDateLabel}</strong>
              </div>
              <div>
                <span>Renews on</span>
                <strong>{renewsOnLabel}</strong>
              </div>
              <div className="customer-subscription-dialog-payment">
                <span>Payment method</span>
                <div>
                  <strong>{paymentMethodLabel}</strong>
                  <button type="button" className="customer-subscription-dialog-change" onClick={handleChangePaymentMethod} disabled={!manageBillingUrl}>Change</button>
                </div>
              </div>
            </div>
            {dialogError ? <p className="customer-mobile-field-error customer-subscription-dialog-error" role="alert">{dialogError}</p> : null}
            <div className="customer-subscription-dialog-actions">
              <button type="button" className="customer-subscription-dialog-button secondary" onClick={closeDialog} disabled={dialogBusy}>Go Back</button>
              <button type="button" className="customer-subscription-dialog-button danger" onClick={() => { setDialogError(""); setDialogStep("confirm"); }} disabled={dialogBusy}>Cancel Plan</button>
            </div>
          </> : null}

          {dialogStep === "confirm" ? <>
            <div className="customer-subscription-dialog-head">
              <h3 id={dialogLabelId}>Are you sure?</h3>
              <p>You&apos;ll lose access to all that <span className="customer-subscription-inline-plan">Nevari Access Pro</span> has to offer</p>
            </div>
            <ul className="customer-subscription-dialog-list">
              <li>Virtual Doctor Consultation</li>
              <li>Book a Home Care Nurse</li>
              <li>Prescription Refills &amp; Uploads</li>
              <li>IV Infusion Therapy</li>
              <li>Care Navigation &amp; Support</li>
              <li>Medication Therapy Management</li>
            </ul>
            {dialogError ? <p className="customer-mobile-field-error customer-subscription-dialog-error" role="alert">{dialogError}</p> : null}
            <div className="customer-subscription-dialog-actions">
              <button type="button" className="customer-subscription-dialog-button secondary" onClick={closeDialog} disabled={dialogBusy}>Don&apos;t cancel</button>
              <button type="button" className="customer-subscription-dialog-button danger" onClick={() => { void handleCancelPlan(); }} disabled={dialogBusy}>{dialogBusy ? "Cancelling..." : "Cancel Plan"}</button>
            </div>
          </> : null}

          {dialogStep === "cancelled" ? <>
            <div className="customer-subscription-dialog-head">
              <h3 id={dialogLabelId}>Your Plan is Cancelled</h3>
              <p>Sorry to see you go. You&apos;ll lose your Nevari Access Pro benefits on {renewsOnLabel}.</p>
            </div>
            <div className="customer-subscription-dialog-actions is-single">
              <button type="button" className="customer-subscription-dialog-button primary" onClick={closeDialog}>Continue</button>
            </div>
          </> : null}
        </section>
      </div>,
      document.body
    ) : null}
  </section>;
}

function ProfilePage({ profile, orders, appointments, doctors, settings, displayName = "Patient", uploading = false, imageRefreshing = false, imageError = "", imageSuccess = "", imageCooldownUntil = 0, imageInputRef = null, onProfileImageSelect, onProfileImageOpen, subscriptionState = null, validationErrors = {}, onSettingsChange, onLogout, logoutBusy = false, onSaveSettings, profileSaveBusy = false, profileSaveError = "", onViewSubscription = null }) {
  const interactedDoctorCount = new Set([
    ...appointments.map((appointment) => String(
      appointment?.doctor_user_id
      || appointment?.doctor?.id
      || appointment?.doctor?.user_id
      || ""
    ).trim()),
    ...orders.map((order) => String(
      order?.assigned_doctor?.id
      || order?.assigned_doctor?.user_id
      || order?.doctor_user_id
      || ""
    ).trim())
  ].filter(Boolean)).size;
  const completion = useMemo(() => getCustomerProfileCompletion(settings, profile), [profile, settings]);
  const healthRows = useMemo(() => resolveCustomerHealthRecordRows(settings), [settings]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileTab, setProfileTab] = useState("user");
  const [isEditingHealth, setIsEditingHealth] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() => normalizeCustomerSettingsPayload(settings));
  const [healthDraft, setHealthDraft] = useState(() => normalizeCustomerSettingsPayload(settings));
  const [profileFieldErrors, setProfileFieldErrors] = useState({});
  const [healthFieldErrors, setHealthFieldErrors] = useState({});
  const [chipDrafts, setChipDrafts] = useState({ allergies: "", currentMedications: "", existingConditions: "" });
  const firstEditableInputRef = useRef(null);
  const normalizedProfileSource = normalizeCustomerSettingsPayload(settings);
  const profileDirty = ["displayName", "email", "phone", "address"].some((key) => JSON.stringify(profileDraft[key]) !== JSON.stringify(normalizedProfileSource[key]));
  const healthDirty = ["bloodGroup", "genotype", "allergies", "currentMedications", "existingConditions", "emergencyContactName", "emergencyContactPhoneNumber"]
    .some((key) => JSON.stringify(healthDraft[key]) !== JSON.stringify(normalizedProfileSource[key]));

  useEffect(() => {
    if (!isEditingProfile) {
      setProfileDraft(normalizeCustomerSettingsPayload(settings));
      setProfileFieldErrors({});
    }
    if (!isEditingHealth) {
      setHealthDraft(normalizeCustomerSettingsPayload(settings));
      setHealthFieldErrors({});
    }
  }, [isEditingHealth, isEditingProfile, settings]);

  useEffect(() => {
    if (isEditingProfile) {
      firstEditableInputRef.current?.focus();
    }
  }, [isEditingProfile]);

  function updateProfileDraft(key, value) {
    setProfileDraft((current) => normalizeCustomerSettingsPayload({ ...current, [key]: value }));
  }

  function updateHealthDraft(key, value) {
    setHealthDraft((current) => normalizeCustomerSettingsPayload({ ...current, [key]: value }));
  }

  function addChip(key) {
    const nextValue = sanitizeCustomerHealthChip(chipDrafts[key]);
    if (!nextValue) {
      return;
    }
    const nextItems = normalizeCustomerHealthChipList([...(healthDraft[key] || []), nextValue]);
    updateHealthDraft(key, nextItems);
    setChipDrafts((current) => ({ ...current, [key]: "" }));
  }

  function removeChip(key, item) {
    updateHealthDraft(key, (healthDraft[key] || []).filter((entry) => entry !== item));
  }

  async function saveProfileChanges() {
    const nextErrors = getCustomerSettingsFieldErrors(profileDraft, { requireAll: true });
    if (Object.keys(nextErrors).length) {
      setProfileFieldErrors(nextErrors);
      return;
    }
    setProfileFieldErrors({});
    const saved = await onSaveSettings?.(profileDraft, { successMessage: "Profile updated successfully." });
    if (saved) {
      setIsEditingProfile(false);
    }
  }

  async function saveHealthChanges() {
    const normalizedHealthDraft = normalizeCustomerSettingsPayload({
      ...settings,
      bloodGroup: healthDraft.bloodGroup,
      genotype: healthDraft.genotype,
      allergies: normalizeCustomerHealthChipList(healthDraft.allergies),
      currentMedications: normalizeCustomerHealthChipList(healthDraft.currentMedications),
      existingConditions: normalizeCustomerHealthChipList(healthDraft.existingConditions),
      emergencyContactName: sanitizeClientText(healthDraft.emergencyContactName || "", { max: 120 }),
      emergencyContactPhoneNumber: normalizeMtmPhoneNumber(healthDraft.emergencyContactPhoneNumber || ""),
    });
    const nextErrors = getCustomerSettingsFieldErrors(normalizedHealthDraft);
    if (Object.keys(nextErrors).length) {
      setHealthFieldErrors(nextErrors);
      return;
    }
    setHealthFieldErrors({});
    const saved = await onSaveSettings?.(normalizedHealthDraft, { successMessage: "Health records saved securely." });
    if (saved) {
      setIsEditingHealth(false);
      setChipDrafts({ allergies: "", currentMedications: "", existingConditions: "" });
    }
  }

  function renderChipField(key, label) {
    const items = Array.isArray(healthDraft[key]) ? healthDraft[key] : [];
    return (
      <label className="customer-profile-modal-field customer-profile-chip-field">
        <span>{label}</span>
        <div className="customer-profile-chip-composer">
          <input
            value={chipDrafts[key]}
            onChange={(event) => setChipDrafts((current) => ({ ...current, [key]: sanitizeCustomerHealthChip(event.target.value) }))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addChip(key);
              }
            }}
            placeholder={"Add " + label.toLowerCase()}
          />
          <button type="button" className="pill-button tertiary" onClick={() => addChip(key)}>Add</button>
        </div>
        <div className="customer-profile-chip-list">
          {items.length ? items.map((item) => (
            <span key={item} className="customer-profile-chip">
              <span>{item}</span>
              <button type="button" onClick={() => removeChip(key, item)} aria-label={"Remove " + item}>?</button>
            </span>
          )) : <small className="customer-profile-muted">None added.</small>}
        </div>
      </label>
    );
  }

  return <div className={`customer-dashboard-stack customer-desktop-boxed-page ${profileTab === "notifications" ? "customer-profile-notifications-active" : ""}`}>
    <div className="customer-profile-desktop-tabs" role="tablist" aria-label="Profile sections">
      <button type="button" role="tab" aria-selected={profileTab === "user"} className={profileTab === "user" ? "active" : ""} onClick={() => setProfileTab("user")}>User</button>
      <button type="button" role="tab" aria-selected={profileTab === "notifications"} className={profileTab === "notifications" ? "active" : ""} onClick={() => setProfileTab("notifications")}>Notification Settings</button>
    </div>
    <section className="customer-profile-desktop-notifications" aria-label="Notification settings">
      {CUSTOMER_NOTIFICATION_OPTIONS.map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => onSettingsChange?.((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
    </section>
    <section className="customer-profile-hero">
      <CustomerProfilePhotoWidget
        profile={profile}
        displayName={displayName}
        uploading={uploading}
        refreshing={imageRefreshing}
        error={imageError}
        success={imageSuccess}
                cooldownUntil={imageCooldownUntil}
                        inputRef={imageInputRef}
        onSelect={onProfileImageSelect}
        onOpen={onProfileImageOpen}
        className="customer-desktop-photo-slot"
      />
      <div>
        <span className="customer-section-kicker">My Profile</span>
        <h2>{displayName}</h2>
        <p className="customer-hero-text">Edit your profile inline. Email stays locked to your account.</p>
        <div className="customer-profile-completion-badge">Profile {completion.percent}% complete</div>
      </div>
      <button className="pill-button danger" type="button" onClick={onLogout} disabled={logoutBusy}>
        {logoutBusy ? <span className="appointment-cta-spinner" aria-label="Logging out" /> : "Logout"}
      </button>
    </section>

    <section className="customer-profile-grid customer-profile-grid-editable">
      <article className="customer-profile-card customer-profile-card-wide customer-profile-subscription-card">
        <ManageSubscription
          profileVariant
          subscription={subscriptionState?.subscription}
          loading={subscriptionState?.isLoading}
          busy={subscriptionState?.isActionBusy}
          error={subscriptionState?.actionError}
          onUpgrade={() => subscriptionState?.launchCheckout?.()}
          onPause={async () => {
            await subscriptionState?.pauseCurrentSubscription?.();
          }}
          onCancel={async () => {
            await subscriptionState?.cancelCurrentSubscription?.();
          }}
          onView={onViewSubscription}
        />
      </article>

      <article className="customer-profile-card customer-profile-card-wide customer-profile-edit-card">
        <div className="customer-profile-card-head">
          <div>
            <span>Personal Details</span>
            <small>Keep your main contact details up to date.</small>
          </div>
          
        </div>
        <div className="customer-profile-detail-grid">
          <label><span>Display Name</span><input ref={firstEditableInputRef} value={profileDraft.displayName} readOnly={false} className={profileFieldErrors.displayName ? "has-error" : ""} onChange={(event) => updateProfileDraft("displayName", sanitizeClientText(event.target.value, { max: 120 }))} />{profileFieldErrors.displayName ? <small className="customer-mobile-field-error">{profileFieldErrors.displayName}</small> : null}</label>
          <label><span>Email</span><input value={profileDraft.email} onChange={(event) => updateProfileDraft("email", sanitizeClientText(event.target.value, { max: 160 }))} /></label>
          <label><span>Phone Number</span><input type="tel" inputMode="tel" maxLength={11} value={profileDraft.phone} readOnly={false} className={profileFieldErrors.phone ? "has-error" : ""} onChange={(event) => updateProfileDraft("phone", normalizeMtmPhoneNumber(event.target.value))} />{profileFieldErrors.phone ? <small className="customer-mobile-field-error">{profileFieldErrors.phone}</small> : null}</label>
          <label className="customer-profile-detail-grid-wide"><span>Address</span><textarea rows={3} value={profileDraft.address} readOnly={false} className={profileFieldErrors.address ? "has-error" : ""} onChange={(event) => updateProfileDraft("address", sanitizeClientText(event.target.value, { max: 200 }))} />{profileFieldErrors.address ? <small className="customer-mobile-field-error">{profileFieldErrors.address}</small> : null}</label>
        </div>
        {profileSaveError ? <small className="customer-mobile-field-error">{profileSaveError}</small> : null}
        {profileDirty ? <div className="customer-profile-inline-actions"><button type="button" className="pill-button tertiary" onClick={() => { setProfileDraft(normalizeCustomerSettingsPayload(settings)); setProfileFieldErrors({}); }} disabled={profileSaveBusy}>Cancel</button><button type="button" className="pill-button" onClick={saveProfileChanges} disabled={profileSaveBusy}>{profileSaveBusy ? <span className="appointment-cta-spinner" aria-label="Saving profile" /> : "Save Changes"}</button></div> : null}
      </article>

      <article className="customer-profile-card customer-profile-card-wide customer-profile-health-card">
        <div className="customer-profile-card-head">
          <div>
            <span>Key Health Records</span>
            
          </div>
          
        </div>
                <div className="customer-profile-health-grid customer-profile-health-grid-editable">
          <label className="customer-profile-health-field"><span>Blood Group</span><select value={healthDraft.bloodGroup} onChange={(event) => updateHealthDraft("bloodGroup", event.target.value)}><option value="">Not added</option>{CUSTOMER_HEALTH_BLOOD_GROUP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="customer-profile-health-field"><span>Genotype</span><select value={healthDraft.genotype} onChange={(event) => updateHealthDraft("genotype", event.target.value)}><option value="">Not added</option>{CUSTOMER_HEALTH_GENOTYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          {renderChipField("allergies", "Allergies")}
          {renderChipField("currentMedications", "Current Medications")}
          {renderChipField("existingConditions", "Existing Conditions")}
          <label className="customer-profile-health-field"><span>Emergency Contact Name</span><input value={healthDraft.emergencyContactName} onChange={(event) => updateHealthDraft("emergencyContactName", sanitizeClientText(event.target.value, { max: 120 }))} /></label>
          <label className="customer-profile-health-field"><span>Emergency Contact Phone Number</span><input type="tel" inputMode="tel" maxLength={11} value={healthDraft.emergencyContactPhoneNumber} onChange={(event) => updateHealthDraft("emergencyContactPhoneNumber", normalizeMtmPhoneNumber(event.target.value))} />{healthFieldErrors.emergencyContactPhoneNumber ? <small className="customer-mobile-field-error">{healthFieldErrors.emergencyContactPhoneNumber}</small> : null}</label>
        </div>
        {healthDirty ? <div className="customer-profile-inline-actions"><button type="button" className="pill-button tertiary" onClick={() => { setHealthDraft(normalizeCustomerSettingsPayload(settings)); setHealthFieldErrors({}); setChipDrafts({ allergies: "", currentMedications: "", existingConditions: "" }); }} disabled={profileSaveBusy}>Cancel</button><button type="button" className="pill-button" onClick={saveHealthChanges} disabled={profileSaveBusy}>{profileSaveBusy ? <span className="appointment-cta-spinner" aria-label="Saving health records" /> : "Save health records"}</button></div> : null}
      </article>
    </section>

    {false && isEditingHealth ? <div className="customer-photo-viewer customer-profile-upload-modal" role="dialog" aria-modal="true" aria-label="Edit Health Records" onClick={() => setIsEditingHealth(false)}>
      <div className="customer-photo-viewer-card customer-profile-modal-card customer-health-records-modal" onClick={(event) => event.stopPropagation()}>
        <button className="customer-photo-viewer-close" type="button" onClick={() => setIsEditingHealth(false)} aria-label="Close edit health records modal">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" focusable="false">
            <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="customer-profile-modal-head">
          <span className="customer-section-kicker">Profile</span>
          <h3>Edit Health Records</h3>
          <p>Save the most important details your care team may need quickly.</p>
        </div>
        <div className="customer-profile-modal-grid">
          <label className="customer-profile-modal-field"><span>Blood Group</span><select value={healthDraft.bloodGroup} onChange={(event) => updateHealthDraft("bloodGroup", event.target.value)}><option value="">Select blood group</option>{CUSTOMER_HEALTH_BLOOD_GROUP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>{healthFieldErrors.bloodGroup ? <small className="customer-mobile-field-error">{healthFieldErrors.bloodGroup}</small> : null}</label>
          <label className="customer-profile-modal-field"><span>Genotype</span><select value={healthDraft.genotype} onChange={(event) => updateHealthDraft("genotype", event.target.value)}><option value="">Select genotype</option>{CUSTOMER_HEALTH_GENOTYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>{healthFieldErrors.genotype ? <small className="customer-mobile-field-error">{healthFieldErrors.genotype}</small> : null}</label>
          {renderChipField("allergies", "Allergies")}
          {renderChipField("currentMedications", "Current Medications")}
          {renderChipField("existingConditions", "Existing Conditions")}
          <label className="customer-profile-modal-field"><span>Emergency Contact Name</span><input value={healthDraft.emergencyContactName} onChange={(event) => updateHealthDraft("emergencyContactName", sanitizeClientText(event.target.value, { max: 120 }))} /></label>
          <label className="customer-profile-modal-field"><span>Emergency Contact Phone Number</span><input type="tel" inputMode="tel" maxLength={11} value={healthDraft.emergencyContactPhoneNumber} onChange={(event) => updateHealthDraft("emergencyContactPhoneNumber", normalizeMtmPhoneNumber(event.target.value))} />{healthFieldErrors.emergencyContactPhoneNumber ? <small className="customer-mobile-field-error">{healthFieldErrors.emergencyContactPhoneNumber}</small> : null}</label>
        </div>
        <div className="customer-profile-modal-actions"><button type="button" className="pill-button tertiary" onClick={() => { setHealthDraft(normalizeCustomerSettingsPayload(settings)); setHealthFieldErrors({}); setChipDrafts({ allergies: "", currentMedications: "", existingConditions: "" }); setIsEditingHealth(false); }} disabled={profileSaveBusy}>Cancel</button><button type="button" className="pill-button" onClick={saveHealthChanges} disabled={profileSaveBusy}>{profileSaveBusy ? <span className="appointment-cta-spinner" aria-label="Saving health records" /> : "Save Changes"}</button></div>
      </div>
    </div> : null}
  </div>;
}

function renderDashboardIcon(page) {
  return <DashboardIcon name={page} />;
}

function DashboardIcon({ name }) {
  if (name === "orders") return <HugeiconsIcon icon={ShoppingCart01Icon} size={20} strokeWidth={1.7} />;
  if (name === "appointment") return <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={1.7} />;
  if (name === "settings") return <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.7} />;
  if (name === "profile") return <HugeiconsIcon icon={UserIcon} size={20} strokeWidth={1.7} />;
  return <HugeiconsIcon icon={Home01Icon} size={20} strokeWidth={1.7} />;
}

function initials(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "N";
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',').pop() : result);
    };
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

async function renderCroppedProfileImage(file, cropState) {
  if (!file || !cropState?.naturalWidth || !cropState?.naturalHeight || !cropState?.scale) {
    throw new Error("Select an image to continue.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const sourceImage = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to prepare the selected image."));
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_IMAGE_EXPORT_SIZE;
    canvas.height = PROFILE_IMAGE_EXPORT_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Unable to prepare the selected image.");
    }

    const cropSize = cropState.cropSize || 1;
    const sourceWidth = cropSize / cropState.scale;
    const sourceHeight = cropSize / cropState.scale;
    const sourceX = (cropState.naturalWidth / 2) - (sourceWidth / 2) - (cropState.offsetX / cropState.scale);
    const sourceY = (cropState.naturalHeight / 2) - (sourceHeight / 2) - (cropState.offsetY / cropState.scale);

    context.drawImage(
      sourceImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      PROFILE_IMAGE_EXPORT_SIZE,
      PROFILE_IMAGE_EXPORT_SIZE
    );

    const preferredMimeType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const qualitySteps = preferredMimeType === "image/jpeg" ? [0.92, 0.82, 0.74, 0.64, 0.54] : [undefined];

    for (const quality of qualitySteps) {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new Error("Unable to prepare the selected image."));
        }, preferredMimeType, quality);
      });

      if (blob.size <= PROFILE_IMAGE_SERVER_MAX_BYTES) {
        const dataBase64 = await readFileAsBase64(blob);
        return {
          file,
          filename: buildProfileImageUploadName(file.name, preferredMimeType),
          mime_type: preferredMimeType,
          data_base64: dataBase64,
        };
      }
    }

    throw new Error("Cropped image is too large to upload. Please zoom out or choose a smaller image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
function firstName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "Patient";
}

function orderPrimaryLabel(order) {
  return order.items?.[0]?.name || `Order #${order.number}`;
}

function orderStatusMeta(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") {
    return { label: "Completed", tone: "success", progress: 100, showProgress: false, shimmer: false };
  }
  if (normalized === "processing") {
    return { label: "Processing", tone: "warning", progress: 72, showProgress: true, shimmer: true };
  }
  if (normalized === "pending") {
    return { label: "Pending", tone: "warning", progress: 32, showProgress: true, shimmer: false };
  }
  if (normalized === "on-hold") {
    return { label: "On hold", tone: "warning", progress: 46, showProgress: true, shimmer: false };
  }
  if (normalized === "cancelled" || normalized === "failed") {
    return { label: titleCase(status), tone: "danger", progress: 18, showProgress: true, shimmer: false };
  }
  return { label: titleCase(status), tone: "warning", progress: 54, showProgress: true, shimmer: false };
}

function localDateKey(value) {
  const date = value instanceof Date ? value : parseDateKey(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function nextSevenDays(selectedDate) {
  const start = parseDateKey(selectedDate);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return {
      key: localDateKey(current),
      weekday: current.toLocaleString("en-US", { weekday: "short" }),
      day: current.getDate()
    };
  });
}

function formatTime(value, timeZone = storedStoreTimeZone()) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatSlotTime(value) {
  if (!value) return "";
  const [hours = "0", minutes = "0"] = String(value).split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function buildConstantTimeframes(selectedDate, currentDate = new Date()) {
  const todayKey = localDateInputValue(currentDate);
  const currentTime = localTimeInputValue(currentDate);
  return APPOINTMENT_TIMEFRAME_OPTIONS.map((value) => ({
    value,
    disabled: selectedDate === todayKey && value <= currentTime
  }));
}

function normalizeAvailabilitySlots(slots = []) {
  return [...new Set((Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const startAt = slot?.start_at || slot?.start || slot?.time || "";
      if (!startAt) return null;
      const extracted = extractLocalDateTimeParts(startAt);
      if (extracted.date && extracted.time) {
        return {
          value: extracted.time,
          start_at: slot?.start_at || `${extracted.date}T${extracted.time}:00`,
          raw: slot
        };
      }
      const match = String(startAt).match(/(\d{2}):(\d{2})/);
      if (!match) return null;
      return {
        value: `${match[1]}:${match[2]}`,
        start_at: slot?.start_at || `${localDateInputValue(new Date())}T${match[1]}:${match[2]}:00`,
        raw: slot
      };
    })
    .filter(Boolean)
    .map((slot) => [slot.value, slot])).values()];
}

function sanitizeClientText(value, { max = 500, allowMarkup = false } = {}) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  const cleaned = allowMarkup ? text : text.replace(/[<>`]/g, "");
  return cleaned.slice(0, max);
}

function sanitizeRequestFieldValue(key, value) {
  if (key === "age") {
    return String(value || "").replace(/\D/g, "").slice(0, 3);
  }
  if (key === "emergencyContact") {
    return String(value || "").replace(/[^0-9+\-()\s]/g, "").slice(0, 20);
  }
  if (key === "name" || key === "mobilityStatus") {
    return sanitizeClientText(value, { max: 120 }).replace(/[^a-zA-Z\s'.-]/g, "");
  }
  if (key === "address") {
    return sanitizeClientText(value, { max: 200 });
  }
  return sanitizeClientText(value, { max: 120 });
}

function sanitizeMtmFieldValue(section, key, value) {
  if (key === "age") {
    return sanitizeRequestFieldValue("age", value);
  }
  if (key === "phoneNumber" || key === "emergencyContact") {
    return normalizeMtmPhoneNumber(value);
  }
  if (key === "dob" || key === "startDate") {
    return String(value || "").slice(0, 10);
  }
  if (key === "emailAddress") {
    return sanitizeClientText(value, { max: 254 }).replace(/\s+/g, "");
  }
  if (["gender", "maritalStatus", "preferredContactMethod", "relationship", "livesWithPatient", "consentToDiscussCare", "frequency", "route"].includes(key)) {
    return String(value || "");
  }
  if ((section === "patient" && key === "name") || (section === "emergencyContact" && ["caregiverName", "relationship"].includes(key))) {
    return sanitizeClientText(value, { max: 120 }).replace(/[^a-zA-Z\s'.-]/g, "");
  }
  return sanitizeClientText(value, { max: 500 });
}

const MTM_ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MTM_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;
const MTM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function getMtmImageUploadError(file, { each = false } = {}) {
  const sizeSuffix = each ? " each." : ".";
  if (!file) return "Upload an image to continue.";
  const name = String(file.name || "").trim();
  const type = String(file.type || "").toLowerCase();
  const size = Number(file.size || 0);
  if (!name || !MTM_IMAGE_EXTENSION_PATTERN.test(name) || !MTM_ALLOWED_IMAGE_TYPES.has(type) || size < 1 || size > MTM_IMAGE_MAX_BYTES) {
    return `Upload PNG, JPG, JPEG, or WebP images up to 5MB${sizeSuffix}`;
  }
  return "";
}

function isAllowedMtmImageFile(file) {
  return !getMtmImageUploadError(file);
}

async function hasValidMtmImageSignature(file) {
  if (!file || typeof file.slice !== "function") return false;
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const type = String(file.type || "").toLowerCase();
    if (type === "image/png") {
      return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
    }
    if (type === "image/jpeg") {
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (type === "image/webp") {
      return bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    }
  } catch {
    return false;
  }
  return false;
}

function isAllowedMedicalFile(file) {
  if (!file) return false;
  const allowedExtensions = /\.(pdf|png|jpe?g|webp|docx?)$/i;
  const allowedTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  return file.size > 0 && file.size <= 5 * 1024 * 1024 && allowedExtensions.test(file.name || "") && (!file.type || allowedTypes.has(file.type));
}

function normalizeBookingMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 5 ? parsed : 30;
}

function extractLocalDateTimeParts(value) {
  const source = String(value || "").trim();
  const directMatch = source.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (directMatch) {
    return { date: directMatch[1], time: directMatch[2] };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }
  return {
    date: localDateInputValue(date),
    time: localTimeInputValue(date)
  };
}

function consultationDurationOptions(minimumMinutes) {
  const step = normalizeBookingMinutes(minimumMinutes);
  return Array.from({ length: 5 }, (_, index) => step * (index + 1));
}

function formatDurationLabel(minutes) {
  const total = normalizeBookingMinutes(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (!hours) {
    return `${remainder} min`;
  }
  if (!remainder) {
    return hours === 1 ? "1 hr" : `${hours} hrs`;
  }
  return `${hours === 1 ? "1 hr" : `${hours} hrs`} ${remainder} min`;
}

function appointmentEndForSelection(slot, durationMinutes) {
  if (!slot?.start_at) {
    return slot?.end_at || "";
  }
  const start = new Date(slot.start_at);
  if (Number.isNaN(start.getTime())) {
    return slot.end_at || "";
  }
  return new Date(start.getTime() + (normalizeBookingMinutes(durationMinutes) * 60_000)).toISOString();
}

function durationIsAvailable(slots, selectedSlot, durationMinutes, minimumMinutes) {
  if (!selectedSlot?.start_at) {
    return false;
  }
  const start = new Date(selectedSlot.start_at).getTime();
  if (Number.isNaN(start)) {
    return false;
  }
  const stepMs = normalizeBookingMinutes(minimumMinutes) * 60_000;
  const durationMs = normalizeBookingMinutes(durationMinutes) * 60_000;
  const starts = new Set((Array.isArray(slots) ? slots : []).map((slot) => new Date(slot.start_at).getTime()).filter((value) => !Number.isNaN(value)));
  for (let cursor = start; cursor < start + durationMs; cursor += stepMs) {
    if (!starts.has(cursor)) {
      return false;
    }
  }
  return true;
}

function friendlyDate(value, timeZone = storedStoreTimeZone()) {
  if (!value) {
    return "Select a date";
  }
  return new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function friendlyDateFromDateKey(value) {
  if (!value) {
    return "Select a date";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, month - 1, 1));
    return `${monthLabel} ${day}, ${year}`;
  }
  return friendlyDate(value);
}

function sortPreferredDoctors(doctors, preferredDoctorIds) {
  const preferred = new Set(preferredDoctorIds);
  return [...doctors].sort((left, right) => Number(preferred.has(String(right.user_id || right.id))) - Number(preferred.has(String(left.user_id || left.id))));
}

function togglePreferredDoctor(settings, doctorId) {
  const preferredDoctorIds = settings.preferredDoctorIds.includes(doctorId)
    ? settings.preferredDoctorIds.filter((item) => item !== doctorId)
    : [...settings.preferredDoctorIds, doctorId];
  return { ...settings, preferredDoctorIds };
}

function buildFallbackDoctors(appointments, orders) {
  return [];
}

function doctorConsultationFee(doctor) {
  const value = Number(doctor?.consultation_fee || doctor?.consultationFee || 0);
  return value > 0 ? value : DEFAULT_CONSULTATION_FEE_NGN;
}

function buildMockAppointment(journey, selectedDoctor, settings, storeCurrency) {
  return {
    id: `demo-appointment-${Date.now()}`,
    doctor_user_id: journey.doctorId,
    start_at: journey.selectedSlot?.start_at,
    end_at: appointmentEndForSelection(journey.selectedSlot, journey.durationMinutes || 30),
    duration_minutes: journey.durationMinutes || 30,
    payment_status: "pending",
    status: "requested",
    type: settings.preferredConsultationType,
    timezone: settings.timezone,
    reason: sanitizeClientText(journey.reason, { max: 500 }).trim() || "Doctor consultation booking",
    doctor: { display_name: selectedDoctor?.display_name || "Doctor" },
    calendar: { google_url: "" },
    currency: storeCurrency,
    mock: true
  };
}

function buildMockMeetCode(value = "") {
  const source = String(value || "nevari").replace(/[^a-z0-9]/gi, "").toLowerCase() || "nevari";
  const padded = `${source}abc123xyz`.slice(0, 10);
  return `${padded.slice(0, 3)}-${padded.slice(3, 7)}-${padded.slice(7, 10)}`;
}

function buildMockConfirmation(appointment, selectedDoctor, storeCurrency) {
  const meetCode = buildMockMeetCode(selectedDoctor?.display_name || appointment?.doctor?.display_name || "doctor");
  return {
    is_confirmed: true,
    order_number: `DEMO-${String(Date.now()).slice(-6)}`,
    appointment: {
      ...appointment,
      status: "confirmed",
      payment_status: "paid",
      doctor: appointment.doctor || { display_name: selectedDoctor?.display_name || "Doctor" },
      meet_link: `https://meet.google.com/${meetCode}`
    },
    calendar: {
      google_url: "https://calendar.google.com/calendar/render?action=TEMPLATE",
      outlook_url: "https://outlook.office.com/calendar/0/deeplink/compose"
    },
    total: doctorConsultationFee(selectedDoctor),
    currency: storeCurrency
  };
}

function buildMockReviews(doctor) {
  return {
    summary: {
      average: 4.8,
      count: 3,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 }
    },
    reviews: [
      {
        id: "demo-review-1",
        rating: 5,
        review_text: "Fast and clear consultation experience.",
        created_at: new Date().toISOString(),
        patient: { display_name: "Tina W." }
      },
      {
        id: "demo-review-2",
        rating: 4,
        review_text: "Helpful follow-up advice and easy scheduling.",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        patient: { display_name: "Mark D." }
      }
    ],
    doctor
  };
}

function appendLocalReview(reviewsPayload, reviewDraft, profile) {
  const current = reviewsPayload || buildMockReviews();
  const distribution = { ...(current.summary?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }) };
  distribution[reviewDraft.rating] = Number(distribution[reviewDraft.rating] || 0) + 1;
  const reviewCount = Number(current.summary?.count || 0) + 1;
  return {
    summary: {
      average: ((Number(current.summary?.average || 0) * Number(current.summary?.count || 0)) + reviewDraft.rating) / reviewCount,
      count: reviewCount,
      distribution
    },
    reviews: [{
      id: `demo-review-${Date.now()}`,
      rating: reviewDraft.rating,
      review_text: reviewDraft.reviewText || "Helpful consultation.",
      created_at: new Date().toISOString(),
      patient: { display_name: profile.display_name || "Patient" }
    }, ...(current.reviews || [])]
  };
}

function appointmentJoinTokenFromUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    const pathMatch = parsed.pathname.match(/\/appointment\/join\/([^/?#]+)/i);
    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]);
    }
    const fallbackToken = parsed.searchParams.get("token") || parsed.searchParams.get("join_token");
    return String(fallbackToken || "").trim();
  } catch {
    return "";
  }
}

function normalizeAppointmentJoinUrl(url) {
  const source = String(url || "").trim();
  if (!/^https?:\/\//i.test(source)) {
    return "";
  }
  if (typeof window === "undefined") {
    return source;
  }
  const joinToken = appointmentJoinTokenFromUrl(source);
  if (!joinToken) {
    return source;
  }
  return `${window.location.origin.replace(/\/+$/, "")}/appointment/join/${encodeURIComponent(joinToken)}`;
}

function appointmentIsUpcoming(appointment) {
  const startAtMs = Date.parse(appointment?.start_at || "");
  const status = String(appointment?.status || "").toLowerCase();
  const displayStatus = String(appointment?.display_status_key || "").toLowerCase();
  return Number.isFinite(startAtMs)
    && startAtMs > Date.now()
    && !["cancelled", "canceled", "failed", "completed"].includes(status)
    && !["ended", "missed", "doctor_absent", "patient_absent"].includes(displayStatus);
}

function getAppointmentJoinUrl(appointment, confirmation = null) {
  const paid = String(appointment?.payment_status || "").toLowerCase() === "paid" || String(appointment?.status || "").toLowerCase() === "confirmed";
  if (!paid) {
    return "";
  }
  const candidates = [
    appointment?.patient_join_url,
    confirmation?.appointment?.patient_join_url,
    appointment?.join_url,
    appointment?.meet_link,
    appointment?.google_meet_link,
    appointment?.meeting_url,
    appointment?.meeting_link,
    confirmation?.appointment?.join_url,
    confirmation?.appointment?.meet_link,
    confirmation?.appointment?.google_meet_link,
    confirmation?.meet_link,
    confirmation?.google_meet_link,
    confirmation?.join_url,
    confirmation?.meeting_url,
    confirmation?.meeting_link,
    confirmation?.calendar?.meet_link,
    appointment?.calendar?.meet_link
  ];
  const match = candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
  return normalizeAppointmentJoinUrl(match || "");
}

function resolveAppointmentCheckoutUrl(checkout) {
  if (!checkout) {
    return "";
  }
  const brandedPayUrl = resolveBrandedAppointmentPayUrl(checkout);
  if (brandedPayUrl) {
    return brandedPayUrl;
  }
  if (typeof checkout.payment_url === "string" && checkout.payment_url.trim()) {
    return checkout.payment_url;
  }
  if (typeof checkout.checkout_url === "string" && checkout.checkout_url.trim()) {
    return checkout.checkout_url;
  }
  if (typeof checkout.pay_url === "string" && checkout.pay_url.trim()) {
    return checkout.pay_url;
  }
  if (checkout.order?.payment_url) {
    return checkout.order.payment_url;
  }
  if (checkout.order?.checkout_url) {
    return checkout.order.checkout_url;
  }
  if (checkout.order?.pay_url) {
    return checkout.order.pay_url;
  }
  return "";
}

function resolveOrderPaymentUrl(order) {
  if (!order || typeof order !== "object") {
    return "";
  }
  const branded = typeof order.branded_payment_url === "string" ? order.branded_payment_url.trim() : "";
  if (branded) {
    return branded;
  }
  const paymentUrl = typeof order.payment_url === "string" ? order.payment_url.trim() : "";
  if (paymentUrl && /\/pay\//i.test(paymentUrl)) {
    return paymentUrl;
  }
  // Do not fall back to WooCommerce checkout URLs for patient dashboard pay actions.
  return "";
}

function resolveBrandedAppointmentPayUrl(checkout) {
  if (typeof window === "undefined") {
    return "";
  }
  const invoiceRef = resolveCheckoutInvoiceRef(checkout);
  const paymentToken = String(checkout?.payment_token || checkout?.order?.payment_token || "").trim();
  const baseUrl = String(
    checkout?.baseUrl
    || checkout?.base_url
    || checkout?.order?.baseUrl
    || checkout?.order?.base_url
    || ""
  ).trim().replace(/\/+$/, "");
  if (!invoiceRef || !paymentToken) {
    return "";
  }
  const params = new URLSearchParams({
    role: "patient",
    payment_token: paymentToken
  });
  if (baseUrl) {
    params.set("base_url", baseUrl);
  }
  return `${window.location.origin}/pay/${encodeURIComponent(invoiceRef)}?${params.toString()}`;
}

function resolveCheckoutInvoiceRef(checkout) {
  if (!checkout) {
    return "";
  }
  const directInvoice =
    checkout.invoice_number
    || checkout.invoice_ref
    || checkout.order?.invoice_number
    || checkout.order?.invoice_ref
    || "";
  if (typeof directInvoice === "string" && directInvoice.trim()) {
    return directInvoice.trim();
  }
  const rawOrderNumber =
    checkout.order_number
    || checkout.order?.number
    || checkout.order_id
    || checkout.order?.id
    || "";
  const digits = String(rawOrderNumber || "").replace(/\D+/g, "");
  if (!digits) {
    return "";
  }
  return `NVH-INV-${digits.padStart(5, "0")}`;
}

function buildAppointmentFilters(upcoming, past) {
  const all = [...upcoming, ...past];
  return [
    { id: "all", label: "all", count: all.length },
    { id: "upcoming", label: "upcoming", count: upcoming.length },
    { id: "past", label: "past", count: past.length }
  ];
}

function isAppointmentClosedStatus(status) {
  return ["cancelled", "canceled", "completed", "failed"].includes(String(status || "").toLowerCase());
}

function appointmentBelongsToUpcomingList(appointment, now = Date.now()) {
  const startMs = new Date(appointment?.start_at || 0).getTime();
  return Number.isFinite(startMs) && startMs >= now && !isAppointmentClosedStatus(appointment?.status);
}

function appointmentBelongsToPastList(appointment, now = Date.now()) {
  const startMs = new Date(appointment?.start_at || 0).getTime();
  if (isAppointmentClosedStatus(appointment?.status)) {
    return true;
  }
  return Number.isFinite(startMs) && startMs < now;
}

function filterAppointmentsList(appointments, filter) {
  const now = Date.now();
  const upcoming = appointments
    .filter((item) => appointmentBelongsToUpcomingList(item, now))
    .sort((left, right) => dateTimeValue(right, ["start_at", "created_at", "updated_at"]) - dateTimeValue(left, ["start_at", "created_at", "updated_at"]));
  const past = appointments
    .filter((item) => appointmentBelongsToPastList(item, now))
    .sort((left, right) => dateTimeValue(right, ["start_at", "created_at", "updated_at"]) - dateTimeValue(left, ["start_at", "created_at", "updated_at"]));

  if (filter === "upcoming") {
    return upcoming;
  }
  if (filter === "past") {
    return past;
  }
  if (filter === "completed") {
    return appointments
      .filter((item) => String(item.status) === "completed")
      .sort((left, right) => dateTimeValue(right, ["start_at", "created_at", "updated_at"]) - dateTimeValue(left, ["start_at", "created_at", "updated_at"]));
  }
  if (filter === "cancelled") {
    return appointments
      .filter((item) => ["cancelled", "canceled"].includes(String(item.status)))
      .sort((left, right) => dateTimeValue(right, ["start_at", "created_at", "updated_at"]) - dateTimeValue(left, ["start_at", "created_at", "updated_at"]));
  }
  return sortByDateDesc([...upcoming, ...past], ["start_at", "created_at", "updated_at"]);
}

function appointmentChipTone(appointment) {
  const displayKey = String(appointment?.display_status_key || "").toLowerCase();
  const displayLabel = String(appointment?.display_status_label || "").toLowerCase();
  const rawStatus = String(appointment?.status || "").toLowerCase();
  const paymentStatus = String(appointment?.payment_status || "").toLowerCase();

  if (["failed"].includes(displayKey) || ["failed", "unpaid"].includes(paymentStatus) || displayLabel.includes("failed")) {
    return "canceled";
  }
  if (["cancelled", "canceled"].includes(displayKey) || ["cancelled", "canceled"].includes(rawStatus) || displayLabel.includes("canceled")) {
    return "canceled";
  }
  if (["upcoming"].includes(displayKey) || rawStatus === "confirmed" || displayLabel === "confirmed" || displayLabel === "upcoming") {
    return "complete";
  }
  if (["in_progress", "ended"].includes(displayKey) || ["checked_in", "completed"].includes(rawStatus) || displayLabel === "in progress" || displayLabel === "ended") {
    return "processing";
  }
  if (["awaiting_payment"].includes(displayKey) || ["pending", "abandoned"].includes(paymentStatus) || displayLabel.includes("payment")) {
    return "pending";
  }
  if (["awaiting_confirmation", "starting_soon", "doctor_absent", "patient_absent", "missed"].includes(displayKey)) {
    return "warning";
  }
  return "warning";
}

function appointmentChipLabel(appointment) {
  return String(appointment?.display_status_label || titleCase(appointment?.status || appointment?.payment_status || "pending"));
}

function appointmentHasPrescription(appointment) {
  return Boolean(appointment?.prescription?.id || appointment?.prescription_order_id || appointment?.prescription_id);
}

function appointmentDurationLabel(appointment) {
  const explicit = Number(appointment?.duration_minutes || 0);
  if (Number.isFinite(explicit) && explicit > 0) return `${explicit} min`;
  const start = new Date(appointment?.start_at || 0).getTime();
  const end = new Date(appointment?.end_at || 0).getTime();
  const derived = Math.max(0, Math.round((end - start) / 60000));
  return derived > 0 ? `${derived} min` : "";
}

function dateTimeValue(item, fields = ["start_at", "created_at", "updated_at", "date"]) {
  for (const field of fields) {
    const value = item?.[field];
    const time = value ? new Date(value).getTime() : 0;
    if (!Number.isNaN(time) && time > 0) return time;
  }
  return 0;
}

function sortByDateDesc(items = [], fields) {
  return [...items].sort((left, right) => dateTimeValue(right, fields) - dateTimeValue(left, fields));
}

function appointmentDisplayTitle(appointment, doctor) {
  const reasonTitle = String(appointment?.reason || "").trim();
  if (reasonTitle) return reasonTitle;
  const doctorName = String(doctor?.display_name || appointment?.doctor?.display_name || "Doctor").trim();
  const doctorTitle = String(appointment?.title || "").trim();
  return doctorTitle ? `${doctorName}, ${doctorTitle}` : doctorName;
}

function appointmentDoctorLabel(appointment, doctor) {
  const fullName = String(
    doctor?.display_name
    || appointment?.doctor?.display_name
    || appointment?.doctor_name
    || "Care team"
  ).trim();
  const title = String(
    appointment?.title
    || doctor?.title
    || appointment?.doctor?.title
    || ""
  ).trim();
  if (!fullName) return "Care team";
  return title ? `${title} ${fullName}`.trim() : fullName;
}

function formatAppointmentListDateTime(value, timeZone = storedStoreTimeZone()) {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(date);
  const day = Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(date));
  const hourTime = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date).toLowerCase();
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st"
    : day % 10 === 2 && day % 100 !== 12 ? "nd"
      : day % 10 === 3 && day % 100 !== 13 ? "rd"
        : "th";
  return `${weekday} ${day}${suffix} ${month}, ${hourTime}`;
}

function formatDayWithSuffix(day) {
  return `${day}${day % 10 === 1 && day % 100 !== 11 ? "st"
    : day % 10 === 2 && day % 100 !== 12 ? "nd"
      : day % 10 === 3 && day % 100 !== 13 ? "rd"
        : "th"}`;
}

function nurseRequestDateKey(date = new Date(), timeZone = storedStoreTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function nurseRequestTimeKey(date = new Date(), timeZone = storedStoreTimeZone()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function nurseRequestSortValue(request) {
  const preferredDate = String(request?.preferredDate || "").trim();
  const preferredTime = String(request?.preferredTime || "").trim();
  if (!preferredDate) return dateTimeValue(request, ["submittedAt", "createdAt", "updatedAt"]);
  const timestamp = new Date(`${preferredDate}T${preferredTime || "00:00"}:00`).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : dateTimeValue(request, ["submittedAt", "createdAt", "updatedAt"]);
}

function formatNurseRequestDateTime(request) {
  const preferredDate = String(request?.preferredDate || "").trim();
  if (!preferredDate) return "Date not set";
  const preferredTime = String(request?.preferredTime || "").trim();
  const [year, month, day] = preferredDate.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year || 0, Math.max(0, (month || 1) - 1), day || 1, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return "Date not set";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(date);
  const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(date);
  const dayLabel = formatDayWithSuffix(day || 1);
  if (!/^\d{2}:\d{2}$/.test(preferredTime)) {
    return `${weekday} ${dayLabel} ${monthLabel}`;
  }
  const [hoursRaw, minutesRaw] = preferredTime.split(":").map((value) => Number(value));
  const hours = Number.isFinite(hoursRaw) ? hoursRaw : 0;
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 0;
  const twelveHour = hours % 12 || 12;
  const meridiem = hours >= 12 ? "pm" : "am";
  return `${weekday} ${dayLabel} ${monthLabel}, ${twelveHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function nurseRequestChipTone(request) {
  const status = String(request?.status || "").trim().toLowerCase();
  if (["cancelled", "canceled", "rejected", "failed"].includes(status)) return "canceled";
  if (["completed", "confirmed", "assigned"].includes(status)) return "complete";
  if (["in_progress", "ongoing"].includes(status)) return "processing";
  return "warning";
}

function nurseRequestChipLabel(request) {
  return titleCase(String(request?.status || "pending_review").replace(/[_-]+/g, " "));
}

function nurseRequestBelongsToUpcomingList(request, timeZone = storedStoreTimeZone()) {
  const preferredDate = String(request?.preferredDate || "").trim();
  const preferredTime = String(request?.preferredTime || "").trim();
  if (!preferredDate) return false;
  const todayKey = nurseRequestDateKey(new Date(), timeZone);
  if (preferredDate > todayKey) return true;
  if (preferredDate < todayKey) return false;
  if (!preferredTime) return true;
  return preferredTime >= nurseRequestTimeKey(new Date(), timeZone);
}

function nurseRequestBelongsToPastList(request, timeZone = storedStoreTimeZone()) {
  const preferredDate = String(request?.preferredDate || "").trim();
  const preferredTime = String(request?.preferredTime || "").trim();
  if (!preferredDate) return false;
  const todayKey = nurseRequestDateKey(new Date(), timeZone);
  if (preferredDate < todayKey) return true;
  if (preferredDate > todayKey) return false;
  if (!preferredTime) return false;
  return preferredTime < nurseRequestTimeKey(new Date(), timeZone);
}

function NurseJourneyDocuments({ request, auth }) {
  const recordId = Number(request?.record_id || 0);
  const params = recordId && auth?.baseUrl ? new URLSearchParams({ baseUrl: auth.baseUrl, path: `/nurse-requests/${recordId}/documents` }) : null;
  const key = params ? `/api/nevari-proxy?${params}` : null;
  const query = useSWR(key, async (url) => {
    const response = await fetch(url, { headers: { "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": auth?.frontendType || "patient_dashboard" } });
    const result = await response.json();
    if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to load documents.");
    return result?.data?.items || [];
  });
  async function download(item) {
    const url = `/api/nevari-proxy?${new URLSearchParams({ baseUrl: auth.baseUrl, path: `/nurse-requests/${recordId}/documents/${item.id}/download` })}`;
    const response = await fetch(url, { headers: { "x-nevari-frontend-origin": window.location.origin, "x-nevari-frontend-type": auth?.frontendType || "patient_dashboard" } });
    if (!response.ok) return;
    const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = item.name; anchor.click(); URL.revokeObjectURL(objectUrl);
  }
  if (!recordId) return null;
  return <div className="customer-care-documents"><strong>Documents</strong>{query.isLoading ? <span>Loading…</span> : query.data?.length ? query.data.map((item) => <button type="button" key={item.id} onClick={() => download(item)} title={item.name}><span>{item.name}</span><small>Download</small></button>) : <span>No documents available.</span>}</div>;
}

function NurseRequestHistorySection({ title, items = [], auth }) {
  return <section className="customer-request-visit-pane">
    <h2>{title}</h2>
    {items.length ? items.map((request, index) => {
      const statusTone = nurseRequestChipTone(request);
      const statusLabel = nurseRequestChipLabel(request);
      const subtitle = String(request?.patient?.name || request?.customerName || "Nurse care request").trim();
      const titleText = String(request?.careType || request?.title || "Nurse Visit Request").trim();
      return <article className="customer-mobile-visit-row" key={request?.id || `nurse-request-${index}`}>
        <div className="customer-mobile-clock">
          <MobileIcon name="clock" />
        </div>
        <div className="customer-mobile-visit-copy">
          <strong>{titleText}</strong>
          <span>{formatNurseRequestDateTime(request)}</span>
          <small>{subtitle}</small>
        </div>
        <div className="customer-mobile-appointment-status">
          <div className="appointment-status-stack">
            <span className={`chip ${statusTone}`}><span className="chip-dot" />{statusLabel}</span>
          </div>
        </div>
        {(request?.patient_safe_message || request?.assigned_nurse || request?.timeline?.length || request?.record_id) ? <details className="customer-care-journey-details">
          <summary>View care journey</summary>
          {request?.patient_safe_message ? <p>{request.patient_safe_message}</p> : null}
          {request?.assigned_nurse?.name ? <p><strong>Assigned nurse:</strong> {request.assigned_nurse.name}</p> : null}
          {request?.scheduled_at ? <p><strong>Scheduled:</strong> {shortDate(request.scheduled_at, true)}</p> : null}
          {Array.isArray(request?.timeline) && request.timeline.length ? <ol className="customer-care-timeline">
            {request.timeline.map((event, eventIndex) => <li key={`${event?.type || "event"}-${eventIndex}`}>
              <strong>{event?.message || "Status updated"}</strong>
              {event?.occurred_at ? <time>{shortDate(event.occurred_at, true)}</time> : null}
            </li>)}
          </ol> : null}
          <NurseJourneyDocuments request={request} auth={auth} />
        </details> : null}      </article>;
    }) : <CustomerMobileEmptyState
      message={`No ${title.toLowerCase()} yet`}
      illustrationSrc="/group-3.png"
    />}
  </section>;
}

function localDateInputValue(date = new Date()) {
  const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return d.toISOString().slice(0, 10);
}

function localTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function CustomerMobileDashboard({
  session,
  setSession,
  page,
  setPage,
  showSkeleton,
  state,
  stateError,
  profile,
  settings,
  setSettings,
  orderCounts,
  spentThisMonth,
  storeCurrency,
  storeTimeZone,
  storeUrl,
  visibleDoctors,
  selectedDoctor,
  expandedOrderId,
  setExpandedOrderId,
  setSelectedOrder,
  upcomingAppointments,
  pastAppointments,
  journey,
  createJourneyState,
  setJourney,
  minimumBookingMinutes,
  storefrontSettings,
  ordersLoading = false,
  appointmentsLoading = false,
  doctorsLoading = false,
  subscriptionState,
  mtmRequests = [],
  mtmRequestsQuery,
  nurseRequests = [],
  nurseRequestsQuery,
  ivTherapyRequests = [],
  ivTherapyRequestsQuery = { mutate: async () => [] },
  initialMtmRequestId = "",
  initialPage = "overview",
  pathname = "",
  onOpenAvailability,
  onOpenReviews,
  onOpenAppointment,
  onOpenOrderDocuments,
  onCancelPendingOrder,
  onRefillOrder,
  refillOrderBusy,
  onUpdateAvailabilityDate,
  onSelectSlot,
  onDurationChange,
  onReasonChange,
  onCreateAppointmentCheckout,
  onRescheduleAppointmentCheckout,
  onRefreshConfirmation,
  onCancelCheckoutAppointment,
  onResetJourney,
  onReviewDraftChange,
  onSubmitReview,
  appointmentRescheduleTarget = null,
  onClearAppointmentRescheduleTarget = null,
  guestConsultationDraft = null,
  onGuestConsultationDraftConsumed = null,
  nurseRequestAuth,
  onLogout,
  logoutBusy = false,
  embeddedDesktop = false
}) {
  const router = useRouter();
  const { mutate: mobileGlobalMutate } = useSWRConfig();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previousPage, setPreviousPage] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedMobileSearchQuery, setDebouncedMobileSearchQuery] = useState("");
  const [appointmentTab, setAppointmentTab] = useState(initialPage === "request" ? "request" : "upcoming");
  const [appointmentComposerOpen, setAppointmentComposerOpen] = useState(false);
  const [appointmentComposerLoading, setAppointmentComposerLoading] = useState(false);
  const [appointmentComposerMonth, setAppointmentComposerMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [appointmentComposerDate, setAppointmentComposerDate] = useState("");
  const [appointmentComposerDatePicked, setAppointmentComposerDatePicked] = useState(false);
  const [appointmentComposerSelectedSlot, setAppointmentComposerSelectedSlot] = useState("");
  const [appointmentComposerSlotsRefreshing, setAppointmentComposerSlotsRefreshing] = useState(false);
  const [appointmentComposerMatchedDoctors, setAppointmentComposerMatchedDoctors] = useState([]);
  const [appointmentComposerValidatedSlotKey, setAppointmentComposerValidatedSlotKey] = useState("");
  const [appointmentComposerReason, setAppointmentComposerReason] = useState("");
  const [appointmentComposerErrors, setAppointmentComposerErrors] = useState({});
  const [appointmentComposerSuccess, setAppointmentComposerSuccess] = useState(null);
  const [localAppointments, setLocalAppointments] = useState([]);
  const [consultationQuotaDismissed, setConsultationQuotaDismissed] = useState(false);
  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [profileImageRefreshing, setProfileImageRefreshing] = useState(false);
  const [pendingProfileAvatarUrl, setPendingProfileAvatarUrl] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageSuccess, setProfileImageSuccess] = useState("");
  const [profileImageCooldownUntil, setProfileImageCooldownUntil] = useState(0);
  const profileImageInputRef = useRef(null);
  const confirmedProfileAvatarUrl = normalizeProfileAvatarUrl(profile?.avatar_url || profile?.profile_image);
  const fallbackProfileAvatarUrl = normalizeProfileAvatarUrl(session?.user?.avatar_url || session?.user?.avatarUrl || session?.user?.picture);
  const resolvedProfileAvatarUrl = pendingProfileAvatarUrl && profileAvatarUrlKey(confirmedProfileAvatarUrl) !== profileAvatarUrlKey(pendingProfileAvatarUrl)
    ? pendingProfileAvatarUrl
    : (confirmedProfileAvatarUrl || fallbackProfileAvatarUrl);
  const resolvedProfile = useMemo(() => ({
    ...(profile || {}),
    avatar_url: resolvedProfileAvatarUrl,
    profile_image: resolvedProfileAvatarUrl || normalizeProfileAvatarUrl(profile?.profile_image),
  }), [profile, resolvedProfileAvatarUrl]);
  useEffect(() => {
    if (pendingProfileAvatarUrl && confirmedProfileAvatarUrl && profileAvatarUrlKey(confirmedProfileAvatarUrl) === profileAvatarUrlKey(pendingProfileAvatarUrl)) {
      setPendingProfileAvatarUrl("");
      setProfileImageRefreshing(false);
    }
  }, [confirmedProfileAvatarUrl, pendingProfileAvatarUrl]);
  const customerDisplayName = resolveCustomerPreferredName({
    settingsDisplayName: settings?.displayName,
    profile: resolvedProfile,
    sessionUser: session?.user,
  });
  const [requestStep, setRequestStep] = useState(1);
  const [requestStepAnimatingOut, setRequestStepAnimatingOut] = useState(false);
  const [profileTab, setProfileTab] = useState("user");
  const [selectedCareType, setSelectedCareType] = useState("");
  const [requestForm, setRequestForm] = useState({
    name: "",
    age: "",
    gender: "",
    address: "",
    emergencyContact: "",
    mobilityStatus: "",
    conditions: "",
    allergies: "",
    currentMedication: ""
  });
  const [requestStep2Errors, setRequestStep2Errors] = useState({});
  const [requestStep2Touched, setRequestStep2Touched] = useState({});
  const [requestStep2ShowErrors, setRequestStep2ShowErrors] = useState(false);
  const [careDetails, setCareDetails] = useState({
    visitType: "",
    preferredDate: "",
    preferredTime: "",
    duration: "",
    careShift: "",
    liveInCareRequired: "",
    wheelchairAssistanceNeeded: "",
    medicalEquipmentPresent: "",
    requiresLiftingAssistance: "",
    infectiousDisease: ""
  });
  const [requestStep3Errors, setRequestStep3Errors] = useState({});
  const [requestStep3Touched, setRequestStep3Touched] = useState({});
  const [requestStep3ShowErrors, setRequestStep3ShowErrors] = useState(false);
  const [clinicalRequirements, setClinicalRequirements] = useState([]);
  const [uploadedMedicalFiles, setUploadedMedicalFiles] = useState({});
  const uploadInputRefs = useRef({});
  const requestStep2ErrorTimeoutRef = useRef(null);
  const requestStep3ErrorTimeoutRef = useRef(null);
  const [mtmStep, setMtmStep] = useState(1);
  const [mtmTab, setMtmTab] = useState("request");
  const [mtmAnimatingOut, setMtmAnimatingOut] = useState(false);
  const [mtmForm, setMtmForm] = useState(() => createMtmFormState());
  const [mtmSubmitted, setMtmSubmitted] = useState(false);
  const [mtmSubmitting, setMtmSubmitting] = useState(false);
  const [mtmSubmitError, setMtmSubmitError] = useState("");
  const [mtmLoadingState, setMtmLoadingState] = useState(false);
  const [mtmLatestRequest, setMtmLatestRequest] = useState(null);
  const [mtmBookingStage, setMtmBookingStage] = useState("form");
  const [mtmBookingContext, setMtmBookingContext] = useState(null);
  const [mtmBookingDate, setMtmBookingDate] = useState(() => localDateKey(new Date()));
  const [mtmBookingSlot, setMtmBookingSlot] = useState(null);
  const [mtmBookingBusy, setMtmBookingBusy] = useState(false);
  const [mtmBookingError, setMtmBookingError] = useState("");
  const [mtmSelectedRequestId, setMtmSelectedRequestId] = useState(String(initialMtmRequestId || ""));
  const [mtmHistoryModalRequestId, setMtmHistoryModalRequestId] = useState(String(initialMtmRequestId || ""));
  const mtmDeepLinkHandledRef = useRef(false);
  const [mtmStepErrors, setMtmStepErrors] = useState({});
  const [mtmTouchedFields, setMtmTouchedFields] = useState({});
  const [mtmShowErrors, setMtmShowErrors] = useState(false);
  const [mtmLabResultsFiles, setMtmLabResultsFiles] = useState([]);
  const [mtmMedicationEntries, setMtmMedicationEntries] = useState(() => [createEmptyMtmMedicationProfile()]);
  const [mtmPreviousMedicationFile, setMtmPreviousMedicationFile] = useState(null);
  const [mtmSnackbar, setMtmSnackbar] = useState("");
  const [mtmRescheduleBusyId, setMtmRescheduleBusyId] = useState("");
  const mtmLabResultsInputRef = useRef(null);
  const mtmMedicationInputRefs = useRef(new Map());
  const mtmPreviousMedicationInputRef = useRef(null);
  const mtmHistoryRequestRefs = useRef(new Map());

  useEffect(() => {
    const root = document.querySelector(".customer-mobile-app");
    if (!root) return undefined;
    const controls = Array.from(root.querySelectorAll("input:not([type='hidden']):not([type='file']), select"));
    controls.forEach((control) => control.setAttribute("enterkeyhint", "next"));
    const handleEnter = (event) => {
      if (event.defaultPrevented || event.key !== "Enter" || event.target?.tagName === "TEXTAREA") return;
      const index = controls.indexOf(event.target);
      if (index < 0) return;
      const next = controls.slice(index + 1).find((control) => !control.disabled && control.offsetParent !== null);
      if (next) {
        event.preventDefault();
        next.focus();
      }
    };
    root.addEventListener("keydown", handleEnter);
    return () => root.removeEventListener("keydown", handleEnter);
  }, [page, mtmTab, mtmStep, mtmMedicationEntries.length]);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitError, setRequestSubmitError] = useState("");
  const [requestSubmitLoadingState, setRequestSubmitLoadingState] = useState(false);
  const [latestSubmittedRequest, setLatestSubmittedRequest] = useState(null);
  const [ivTherapyStep, setIvTherapyStep] = useState(1);
  const [ivTherapyAnimatingOut, setIvTherapyAnimatingOut] = useState(false);
  const [ivTherapyForm, setIvTherapyForm] = useState(() => createIvTherapyFormState());
  const [ivTherapyShowErrors, setIvTherapyShowErrors] = useState(false);
  const [ivTherapySubmitted, setIvTherapySubmitted] = useState(false);
  const [ivTherapySubmitting, setIvTherapySubmitting] = useState(false);
  const [ivTherapySubmitError, setIvTherapySubmitError] = useState("");
  const [ivTherapyLatestRequest, setIvTherapyLatestRequest] = useState(null);
  const [bookCalendarReason, setBookCalendarReason] = useState("");
  const [calendarDay, setCalendarDay] = useState(7);
  const [calendarTime, setCalendarTime] = useState("09:41");
  const [customerSettingsTouched, setCustomerSettingsTouched] = useState({});
  const [customerSettingsSaveStatus, setCustomerSettingsSaveStatus] = useState("");
  const [customerSettingsSaveError, setCustomerSettingsSaveError] = useState("");
  const customerSettingsErrors = getCustomerSettingsFieldErrors(settings);
  useEffect(() => {
    const emergencySummary = [settings?.emergencyContactName, settings?.emergencyContactPhoneNumber].filter(Boolean).join(" - ");
    const allergiesLabel = normalizeCustomerHealthChipList(settings?.allergies).join(", ");
    const medicationsLabel = normalizeCustomerHealthChipList(settings?.currentMedications).join(", ");
    const conditionsLabel = normalizeCustomerHealthChipList(settings?.existingConditions).join(", ");
    const resolvedAddress = String(settings?.address || profile?.address || "").trim();
    const resolvedPhone = String(settings?.phone || profile?.phone || "").trim();
    const resolvedEmail = String(settings?.email || profile?.email || "").trim();

    setRequestForm((current) => {
      const next = {
        ...current,
        name: mergeCustomerPrefillValue(current.name, customerDisplayName),
        address: mergeCustomerPrefillValue(current.address, resolvedAddress),
        emergencyContact: mergeCustomerPrefillValue(current.emergencyContact, emergencySummary),
        conditions: mergeCustomerPrefillValue(current.conditions, conditionsLabel),
        allergies: mergeCustomerPrefillValue(current.allergies, allergiesLabel),
        currentMedication: mergeCustomerPrefillValue(current.currentMedication, medicationsLabel),
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });

    setMtmForm((current) => {
      const next = {
        ...current,
        patient: {
          ...current.patient,
          name: mergeCustomerPrefillValue(current.patient.name, customerDisplayName),
          address: mergeCustomerPrefillValue(current.patient.address, resolvedAddress),
          phoneNumber: mergeCustomerPrefillValue(current.patient.phoneNumber, resolvedPhone),
          emergencyContact: mergeCustomerPrefillValue(current.patient.emergencyContact, settings?.emergencyContactName || ""),
        },
        emergencyContact: {
          ...current.emergencyContact,
          caregiverName: mergeCustomerPrefillValue(current.emergencyContact.caregiverName, settings?.emergencyContactName || ""),
          phoneNumber: mergeCustomerPrefillValue(current.emergencyContact.phoneNumber, settings?.emergencyContactPhoneNumber || ""),
          emailAddress: mergeCustomerPrefillValue(current.emergencyContact.emailAddress, resolvedEmail),
          address: mergeCustomerPrefillValue(current.emergencyContact.address, resolvedAddress),
        },
        medicalHistory: {
          ...current.medicalHistory,
          chronicConditions: mergeCustomerPrefillValue(current.medicalHistory.chronicConditions, conditionsLabel),
          drugAllergies: mergeCustomerPrefillValue(current.medicalHistory.drugAllergies, allergiesLabel),
        },
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });

    setIvTherapyForm((current) => {
      const next = {
        ...current,
        patient: {
          ...current.patient,
          name: mergeCustomerPrefillValue(current.patient.name, customerDisplayName),
          address: mergeCustomerPrefillValue(current.patient.address, resolvedAddress),
          phoneNumber: mergeCustomerPrefillValue(current.patient.phoneNumber, resolvedPhone),
        },
        clinicalHistory: {
          ...current.clinicalHistory,
          chronicConditionsDetails: mergeCustomerPrefillValue(current.clinicalHistory.chronicConditionsDetails, conditionsLabel),
          currentMedicationsDetails: mergeCustomerPrefillValue(current.clinicalHistory.currentMedicationsDetails, medicationsLabel),
          allergiesDetails: mergeCustomerPrefillValue(current.clinicalHistory.allergiesDetails, allergiesLabel),
        },
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [customerDisplayName, profile?.address, profile?.email, profile?.phone, settings]);
  const mobileHealthRows = useMemo(() => resolveCustomerHealthRecordRows(settings), [settings]);
  const [mobileHealthDraft, setMobileHealthDraft] = useState(() => normalizeCustomerSettingsPayload(settings));
  const [mobileHealthErrors, setMobileHealthErrors] = useState({});
  const [mobileChipDrafts, setMobileChipDrafts] = useState({ allergies: "", currentMedications: "", existingConditions: "" });
  const [mobileProfileDraft, setMobileProfileDraft] = useState(() => normalizeCustomerSettingsPayload(settings));
  const [mobileProfileErrors, setMobileProfileErrors] = useState({});
  const normalizedMobileProfileSource = normalizeCustomerSettingsPayload(settings);
  const mobileProfileDirty = ["displayName", "email", "phone", "address"].some((key) => JSON.stringify(mobileProfileDraft[key]) !== JSON.stringify(normalizedMobileProfileSource[key]));
  const mobileHealthDirty = ["bloodGroup", "genotype", "allergies", "currentMedications", "existingConditions", "emergencyContactName", "emergencyContactPhoneNumber"]
    .some((key) => JSON.stringify(mobileHealthDraft[key]) !== JSON.stringify(normalizedMobileProfileSource[key]));
  const appointmentPageLoading = page === "appointment"
    && appointmentsLoading
    && !upcomingAppointments.length
    && !pastAppointments.length;
  const mtmHistoryRequests = useMemo(() => sortByDateDesc(mtmRequests, ["appointment_start", "scheduled_at", "created_at", "updated_at"]), [mtmRequests]);
  const activeMtmRequest = useMemo(() => {
    const selectedRequest = mtmHistoryRequests.find((request) => String(request?.id || "") === String(mtmSelectedRequestId || ""));
    if (selectedRequest) {
      return selectedRequest;
    }
    if (mtmSelectedRequestId) {
      return String(mtmLatestRequest?.id || "") === String(mtmSelectedRequestId) ? mtmLatestRequest : null;
    }
    return mtmLatestRequest || mtmHistoryRequests[0] || null;
  }, [mtmHistoryRequests, mtmLatestRequest, mtmSelectedRequestId]);
  const mtmModalRequest = useMemo(
    () => mtmHistoryRequests.find((request) => String(request?.id || "") === String(mtmHistoryModalRequestId || "")) || null,
    [mtmHistoryModalRequestId, mtmHistoryRequests]
  );

  useEffect(() => {
    if (initialPage !== "therapy") {
      return;
    }
    setMtmTab("history");
    if (initialMtmRequestId) {
      setMtmSelectedRequestId(String(initialMtmRequestId));
    }
  }, [initialMtmRequestId, initialPage]);

  useEffect(() => {
    if (!session || mtmDeepLinkHandledRef.current || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const mtmRequestId = params.get("mtm_request_id") || params.get("mtmRequestId") || (pathname?.startsWith("/dashboard/therapy/") ? String(initialMtmRequestId || "") : "");
    if (!mtmRequestId) {
      return;
    }
    mtmDeepLinkHandledRef.current = true;
    if (page !== "therapy") {
      goToPage("therapy");
      return;
    }
    setMtmTab("history");
    setMtmSelectedRequestId(String(mtmRequestId));
  }, [initialMtmRequestId, page, pathname, session]);

  useEffect(() => {
    if (page !== "therapy" || mtmTab !== "history" || !mtmHistoryRequests.length) {
      return;
    }
    if (!mtmSelectedRequestId) {
      const fallbackRequestId = mtmLatestRequest?.id || mtmHistoryRequests[0]?.id;
      if (fallbackRequestId) {
        setMtmSelectedRequestId(String(fallbackRequestId));
      }
    }
  }, [page, mtmHistoryRequests, mtmLatestRequest, mtmSelectedRequestId, mtmTab]);

  useEffect(() => {
    if (page !== "therapy" || mtmTab !== "history" || !mtmSelectedRequestId || typeof window === "undefined") {
      return;
    }
    const node = mtmHistoryRequestRefs.current.get(String(mtmSelectedRequestId));
    if (!node) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof node.focus === "function") {
        node.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, mtmSelectedRequestId, mtmTab, mtmHistoryRequests.length]);

  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!["appointment", "request", "therapy"].includes(page)) {
      setAppointmentTab("all");
      setRequestStep(1);
      setRequestSubmitted(false);
      setRequestSubmitting(false);
      setRequestSubmitLoadingState(false);
      setRequestSubmitError("");
      setLatestSubmittedRequest(null);
      setMtmStep(1);
      setMtmTab("request");
      setMtmSubmitted(false);
      setMtmSubmitting(false);
      setMtmSubmitError("");
      setMtmLoadingState(false);
      setMtmLatestRequest(null);
      setMtmBookingStage("form");
      setMtmBookingContext(null);
      setMtmBookingDate(localDateKey(new Date()));
      setMtmBookingSlot(null);
      setMtmBookingBusy(false);
      setMtmBookingError("");
      setMtmSelectedRequestId("");
      setMtmStepErrors({});
      setMtmLabResultsFiles([]);
      setMtmMedicationEntries([createEmptyMtmMedicationProfile()]);
      setMtmForm(createMtmFormState());
      setAppointmentComposerOpen(false);
      setAppointmentComposerLoading(false);
      setAppointmentComposerDate("");
      setAppointmentComposerDatePicked(false);
      setAppointmentComposerSelectedSlot("");
      setAppointmentComposerMatchedDoctors([]);
      setAppointmentComposerValidatedSlotKey("");
      setAppointmentComposerReason("");
      setAppointmentComposerErrors({});
      setAppointmentComposerSuccess(null);
      setRequestStep2Errors({});
      setRequestStep3Errors({});
      setRequestStep2Touched({});
      setRequestStep3Touched({});
      setRequestStep2ShowErrors(false);
      setRequestStep3ShowErrors(false);
    }
  }, [page]);

  useEffect(() => {
    if (!mtmSnackbar) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setMtmSnackbar(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [mtmSnackbar]);

  useEffect(() => {
    const suggestedName = sanitizeClientText(customerDisplayName || "", { max: 120 }).replace(/[^a-zA-Z\s'.-]/g, "");
    if (!suggestedName) {
      return;
    }
    setMtmForm((current) => {
      if (String(current.patient?.name || "").trim()) {
        return current;
      }
      return {
        ...current,
        patient: {
          ...current.patient,
          name: suggestedName,
        },
      };
    });
  }, [customerDisplayName]);

  useEffect(() => {
    if (!["all", "request", "upcoming", "previous"].includes(appointmentTab)) {
      setAppointmentTab("upcoming");
    }
  }, [appointmentTab, page]);

  useEffect(() => {
    if (page === "request") {
      setAppointmentTab("request");
    }
  }, [page]);

  useEffect(() => {
    if (!Object.keys(requestStep2Errors).length) return;
    if (requestStep2ErrorTimeoutRef.current) {
      window.clearTimeout(requestStep2ErrorTimeoutRef.current);
    }
    requestStep2ErrorTimeoutRef.current = window.setTimeout(() => {
      setRequestStep2Errors({});
      requestStep2ErrorTimeoutRef.current = null;
    }, 8000);
    return () => {
      if (requestStep2ErrorTimeoutRef.current) {
        window.clearTimeout(requestStep2ErrorTimeoutRef.current);
        requestStep2ErrorTimeoutRef.current = null;
      }
    };
  }, [requestStep2Errors]);

  useEffect(() => {
    if (!Object.keys(requestStep3Errors).length) return;
    if (requestStep3ErrorTimeoutRef.current) {
      window.clearTimeout(requestStep3ErrorTimeoutRef.current);
    }
    requestStep3ErrorTimeoutRef.current = window.setTimeout(() => {
      setRequestStep3Errors({});
      requestStep3ErrorTimeoutRef.current = null;
    }, 8000);
    return () => {
      if (requestStep3ErrorTimeoutRef.current) {
        window.clearTimeout(requestStep3ErrorTimeoutRef.current);
        requestStep3ErrorTimeoutRef.current = null;
      }
    };
  }, [requestStep3Errors]);

  useEffect(() => {
    if (journey.mode === "hub") {
      return;
    }
    setDrawerOpen(false);
  }, [journey.mode]);

  useEffect(() => {
    if (appointmentTab !== "request") {
      setRequestStep2Errors({});
      setRequestStep3Errors({});
    }
  }, [appointmentTab]);

  useEffect(() => {
    if (page !== "request") {
      setJourney(createJourneyState());
    }
  }, [createJourneyState, page, setJourney]);

  useEffect(() => {
    if (page === "search") {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
      });
    }
  }, [page]);
  const pageTransitionClass = page === "search" ? "customer-mobile-page-enter-search" : "customer-mobile-page-enter";
  const showNurseRequestFlow = page === "request";

  const appointmentComposerSlots = useMemo(() => buildConstantTimeframes(appointmentComposerDate), [appointmentComposerDate]);

  const appointmentComposerHasAvailableSlots = appointmentComposerSlots.some((slot) => !slot.disabled);

  useEffect(() => {
    if (!appointmentComposerOpen || appointmentComposerDate) return;
    const today = localDateInputValue(new Date());
    setAppointmentComposerDate(today);
    setAppointmentComposerDatePicked(false);
  }, [appointmentComposerDate, appointmentComposerOpen]);

  useEffect(() => {
    const selectedSlot = appointmentComposerSlots.find((slot) => slot.value === appointmentComposerSelectedSlot);
    if (appointmentComposerSelectedSlot && (!selectedSlot || selectedSlot.disabled)) {
      setAppointmentComposerSelectedSlot("");
      setAppointmentComposerMatchedDoctors([]);
      setAppointmentComposerValidatedSlotKey("");
      setAppointmentComposerErrors((current) => ({ ...current, time: "Select a future time for today." }));
    }
  }, [appointmentComposerSelectedSlot, appointmentComposerSlots]);

  async function handleAppointmentComposerTimeSelect(nextTime) {
    const nextSlot = appointmentComposerSlots.find((slot) => slot.value === nextTime);
    if (!nextSlot || nextSlot.disabled || !appointmentComposerDate) {
      return;
    }
    setAppointmentComposerSlotsRefreshing(true);
    setAppointmentComposerErrors((current) => {
      const next = { ...current };
      delete next.time;
      delete next.submit;
      return next;
    });
    try {
      const activeSession = hydrateStoredSession("patient");
      const response = await fetch("/api/customer/appointments/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: appointmentComposerDate,
          time: nextTime,
          durationMinutes: 30,
          baseUrl: nurseRequestAuth?.baseUrl || activeSession?.baseUrl || "",
        })
      });
      const payload = await readCustomerNextApiResponse(response, "Appointment availability could not be loaded.");
      const doctorsForSlot = Array.isArray(payload?.doctors) ? payload.doctors : [];
      if (!doctorsForSlot.length) {
        throw new Error("No doctor is available for the selected date and time.");
      }
      setAppointmentComposerSelectedSlot(nextTime);
      setAppointmentComposerMatchedDoctors(doctorsForSlot);
      setAppointmentComposerValidatedSlotKey(`${appointmentComposerDate}|${nextTime}`);
    } catch (error) {
      setAppointmentComposerMatchedDoctors([]);
      setAppointmentComposerValidatedSlotKey("");
      setAppointmentComposerErrors((current) => ({
        ...current,
        time: error?.message || "No doctor is available for the selected date and time.",
      }));
    } finally {
      setAppointmentComposerSlotsRefreshing(false);
    }
  }

  const mergedAppointments = useMemo(
    () => [...localAppointments, ...upcomingAppointments, ...pastAppointments]
      .reduce((items, appointment) => upsertById(items, appointment), [])
      .sort((a, b) => dateTimeValue(b, ["start_at", "created_at", "updated_at"]) - dateTimeValue(a, ["start_at", "created_at", "updated_at"])),
    [localAppointments, pastAppointments, upcomingAppointments]
  );
  const sortedNurseRequests = useMemo(
    () => [...nurseRequests].sort((left, right) => nurseRequestSortValue(right) - nurseRequestSortValue(left)),
    [nurseRequests]
  );
  const upcomingNurseRequests = useMemo(
    () => sortedNurseRequests.filter((request) => nurseRequestBelongsToUpcomingList(request, storeTimeZone)),
    [sortedNurseRequests, storeTimeZone]
  );
  const pastNurseRequests = useMemo(
    () => sortedNurseRequests.filter((request) => nurseRequestBelongsToPastList(request, storeTimeZone)),
    [sortedNurseRequests, storeTimeZone]
  );
  const subscription = subscriptionState?.subscription || {};
  const consultationQuotaTotal = Number(subscription.free_consultations_total || 0);
  const consultationQuotaUsed = Number(subscription.free_consultations_used || 0);
  const consultationQuotaRemaining = Number(subscription.free_consultations_remaining || 0);
  const consultationQuotaResetLabel = String(subscription.free_consultations_reset_label || "").trim();
  const isProSubscription = String(subscription.plan_key || "").toLowerCase() === "nevari_access_pro" || Boolean(subscription.is_paid);
  const showConsultationQuotaNotice = page === "appointment" && isProSubscription && !consultationQuotaDismissed;
  const consultationQuotaTitle = consultationQuotaRemaining <= 0 ? "Free Monthly Consultation Allowance Used" : "Free Monthly Consultation";
  const consultationQuotaBody = consultationQuotaRemaining <= 0
    ? `You have used all ${consultationQuotaTotal || 5} free consultation bookings included with your Pro membership for the current billing month.`
    : `You have ${consultationQuotaRemaining} of ${consultationQuotaTotal || 5} free consultation bookings remaining in your Pro membership for the current billing month.`;
  const consultationQuotaResetText = consultationQuotaResetLabel ? `Next reset: ${consultationQuotaResetLabel}` : "";
  const visibleAppointments = useMemo(() => {
    if (appointmentTab === "request") {
      return [];
    }
    if (appointmentTab === "upcoming") {
      return mergedAppointments.filter((item) => appointmentBelongsToUpcomingList(item, Date.now()));
    }
    if (appointmentTab === "previous") {
      return mergedAppointments.filter((item) => appointmentBelongsToPastList(item, Date.now()));
    }
    return mergedAppointments;
  }, [appointmentTab, mergedAppointments]);

  const recentAppointments = useMemo(
    () => sortByDateDesc([...upcomingAppointments, ...pastAppointments], ["start_at", "created_at", "updated_at"]).slice(0, 4),
    [pastAppointments, upcomingAppointments]
  );
  const orderedCustomerOrders = useMemo(
    () => sortByDateDesc(state.orders, ["created_at", "date_created", "updated_at", "date_modified", "date"]),
    [state.orders]
  );
  const showAppointmentPagePlus = appointmentTab !== "request" && visibleAppointments.length > 0;
  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 3) {
      setDebouncedMobileSearchQuery("");
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setDebouncedMobileSearchQuery(normalizedQuery.slice(0, 80)), 180);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);
  const mobilePatientSearchKey = session && debouncedMobileSearchQuery.length >= 3
    ? swrKeys.proxy.path("/dashboard/patient/search", withSessionCacheScope(session, { q: debouncedMobileSearchQuery, limit: 20 }))
    : null;
  const mobilePatientSearchQuery = useSWR(
    mobilePatientSearchKey,
    () => fetchCustomerSearch(session, debouncedMobileSearchQuery, 20),
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 10_000 }
  );
  const searchResults = useMemo(() => (Array.isArray(mobilePatientSearchQuery.data) ? mobilePatientSearchQuery.data : []).map((item, index) => ({
    key: `mobile-patient-search-${item.type || "result"}-${item.id || index}`,
    area: item.area || "Dashboard",
    label: item.title || "Result",
    meta: item.meta || "",
    onSelect: () => {
      const destinationMap = { "nurse-request": "request", subscription: "subscription-management" };
      const destination = destinationMap[item.destination] || item.destination || "overview";
      if (item.type === "order") {
        const order = state.orders.find((entry) => String(entry.id) === String(item.id));
        if (order) { setExpandedOrderId(order.id); setSelectedOrder(order); }
      } else if (item.type === "appointment") {
        const appointment = state.appointments.find((entry) => String(entry.id) === String(item.id));
        if (appointment) onOpenAppointment(appointment);
      } else if (item.type === "doctor") {
        const doctor = visibleDoctors.find((entry) => String(entry.user_id || entry.id) === String(item.id));
        if (doctor) { onOpenAvailability(doctor); return; }
      }
      setSearchQuery("");
      goToPage(pages.includes(destination) ? destination : "overview");
    }
  })), [mobilePatientSearchQuery.data, onOpenAppointment, onOpenAvailability, setExpandedOrderId, setSelectedOrder, state.appointments, state.orders, visibleDoctors]);
  const orderStats = [
    { label: "Total Orders", value: orderCounts.total },
    { label: "Pending/In-Progress", value: orderCounts.pending + orderCounts.processing },
    { label: "Completed Orders", value: orderCounts.completed },
    { label: "Total Spent", value: money(spentThisMonth, storeCurrency), accent: true }
  ];
  function goToPage(nextPage) {
      setPage(nextPage);
      setDrawerOpen(false);
      setRequestStep2Errors({});
      setRequestStep3Errors({});
      setRequestStep2Touched({});
      setRequestStep3Touched({});
      setRequestStep2ShowErrors(false);
      setRequestStep3ShowErrors(false);
      if (nextPage !== "appointment") {
      setJourney(createJourneyState());
      onClearAppointmentRescheduleTarget?.();
    }
  }

  function openSearchPage() {
    if (page !== "search") {
      setPreviousPage(page);
    }
    setPage("search");
  }

  function openMtmHistoryRequest(requestId) {
    const nextRequestId = String(requestId || "").trim();
    if (!nextRequestId) {
      return;
    }
    setMtmSubmitted(false);
    setMtmTab("history");
    setMtmSelectedRequestId(nextRequestId);
    setMtmHistoryModalRequestId(nextRequestId);
  }

  async function handleMtmRescheduleRequest(requestId) {
    const nextRequestId = String(requestId || "").trim();
    if (!nextRequestId || mtmRescheduleBusyId === nextRequestId) {
      return;
    }
    setMtmRescheduleBusyId(nextRequestId);
    setMtmSubmitError("");
    try {
      const nextRequest = await requestMtmReschedule(session, nextRequestId);
      if (nextRequest) {
        await mtmRequestsQuery.mutate((current) => Array.isArray(current) ? replaceById(current, nextRequest) : current, { revalidate: false });
        setMtmLatestRequest((current) => (String(current?.id || "") === nextRequestId ? nextRequest : current));
        setMtmSelectedRequestId(nextRequestId);
      }
      await mtmRequestsQuery.mutate();
      setMtmSnackbar("Reschedule request sent. Your pharmacist can now book a new consultation.");
    } catch (error) {
      setMtmSubmitError(error?.message || "Unable to request an MTM reschedule.");
    } finally {
      setMtmRescheduleBusyId("");
    }
  }

  function exitSearchPage() {
    setPage(previousPage || "overview");
  }

  function openRequestFlow() {
    setAppointmentComposerOpen(false);
    setAppointmentTab("request");
    setRequestSubmitted(false);
    setRequestStep(1);
    goToPage("request");
  }

  function resolvedPharmacyStoreUrl() {
    const candidates = [
      storeUrl,
      session?.baseUrl,
      typeof window !== "undefined" ? window.location.origin : "",
      "/",
    ];
    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (value && value !== "#") {
        return value;
      }
    }
    return "/";
  }

  async function openPharmacyStore() {
    if (typeof window === "undefined") {
      return;
    }
    const fallbackUrl = resolvedPharmacyStoreUrl();
    if (!isSessionUsable(session)) {
      window.location.assign(fallbackUrl);
      return;
    }
    try {
      const data = await apiRequest(session, "/sso/wordpress/start", { method: "POST", body: {} });
      const ssoUrl = String(data?.redirect_url || data?.complete_url || "").trim();
      if (ssoUrl) {
        window.location.assign(ssoUrl);
        return;
      }
    } catch {
      // SSO handoff is best-effort; fall back to a plain store visit.
    }
    window.location.assign(fallbackUrl);
  }

  function transitionToRequestStep(nextStep) {
      setRequestSubmitError("");
      setRequestStep2Errors({});
      setRequestStep3Errors({});
      setRequestStep2Touched({});
      setRequestStep3Touched({});
      setRequestStep2ShowErrors(false);
      setRequestStep3ShowErrors(false);
      setRequestStepAnimatingOut(true);
    window.setTimeout(() => {
      setRequestStep(nextStep);
      setRequestStepAnimatingOut(false);
    }, 140);
  }

  function validateAppointmentComposer() {
    const errors = {};
    if (!appointmentComposerDate) errors.date = "Select a date.";
    if (!appointmentComposerSelectedSlot) errors.time = "Select a time slot.";
    if (appointmentComposerSelectedSlot && (appointmentComposerValidatedSlotKey !== `${appointmentComposerDate}|${appointmentComposerSelectedSlot}` || !appointmentComposerMatchedDoctors.length)) {
      errors.time = "Select an available time slot.";
    }
    if (!sanitizeClientText(appointmentComposerReason, { max: 500 }).trim()) errors.reason = "Reason for appointment is required.";
    setAppointmentComposerErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleAppointmentComposerBooking() {
    if (!validateAppointmentComposer()) return;
    setAppointmentComposerLoading(true);
    setAppointmentComposerErrors({});
    setAppointmentComposerSuccess(null);

    try {
      const selectedDoctor = appointmentComposerMatchedDoctors[0] || null;
      const result = await onCreateAppointmentCheckout?.({
        selectedSlot: {
          start_at: `${appointmentComposerDate}T${appointmentComposerSelectedSlot}:00`
        },
        durationMinutes: 30,
        reason: sanitizeClientText(appointmentComposerReason, { max: 500 }).trim(),
        doctorId: selectedDoctor?.user_id || selectedDoctor?.id || ""
      });
      const createdAppointment = result?.appointment || null;
      if (!result?.ok || !createdAppointment) {
        setAppointmentComposerErrors({ submit: "Unable to book appointment right now." });
        return;
      }
      setLocalAppointments((current) => upsertById(current, createdAppointment));
      setAppointmentTab("upcoming");
      const assignedDoctorName = result?.appointment?.doctor?.display_name
        || result?.appointment?.doctor_name
        || result?.appointment?.assigned_doctor_name
        || "the assigned doctor";
      setAppointmentComposerSuccess({
        title: result?.mode === "confirmation" ? "Appointment Confirmed" : "Appointment Booked Successfully",
        subtitle: result?.mode === "confirmation"
          ? `Your appointment with ${assignedDoctorName} has been confirmed for ${friendlyDateFromDateKey(appointmentComposerDate, storeTimeZone)} at ${formatSlotTime(appointmentComposerSelectedSlot)}.`
          : `Your appointment with ${assignedDoctorName} has been booked for ${friendlyDateFromDateKey(appointmentComposerDate, storeTimeZone)} at ${formatSlotTime(appointmentComposerSelectedSlot)}.`,
        appointment: createdAppointment
      });
    } catch {
      setAppointmentComposerErrors({ submit: "Unable to book appointment right now." });
    } finally {
      setAppointmentComposerLoading(false);
    }
  }

  function getRequestStep2Errors(options = {}) {
    const source = options?.source || requestForm;
    const includeRequired = options?.includeRequired !== false;
    const activeKeys = Array.isArray(options?.activeKeys) ? new Set(options.activeKeys) : null;
    const shouldValidateKey = (key) => !activeKeys || activeKeys.has(key);
    const requiredFields = [
      ["name", "Name is required."],
      ["age", "Age is required."],
      ["gender", "Gender is required."],
      ["address", "Address is required."],
      ["emergencyContact", "Emergency contact is required."],
      ["mobilityStatus", "Mobility status is required."]
    ];
    const errors = {};
    requiredFields.forEach(([key, message]) => {
      if (includeRequired && shouldValidateKey(key) && !String(source[key] || "").trim()) errors[key] = message;
    });
    const name = sanitizeRequestFieldValue("name", source.name).trim();
    const age = sanitizeRequestFieldValue("age", source.age).trim();
    const gender = String(source.gender || "").trim();
    const address = sanitizeRequestFieldValue("address", source.address).trim();
    const emergencyContact = sanitizeRequestFieldValue("emergencyContact", source.emergencyContact).trim();
    const mobilityStatus = sanitizeRequestFieldValue("mobilityStatus", source.mobilityStatus).trim();
    if (shouldValidateKey("name") && name && !/^[a-zA-Z\s'.-]{2,120}$/.test(name)) {
      errors.name = minLengthError("Name", 2);
    }
    if (shouldValidateKey("age") && age && !/^\d{1,3}$/.test(age)) {
      errors.age = "Age must be 1 to 3 digits long.";
    }
    if (shouldValidateKey("gender") && gender && !["Male", "Female"].includes(gender)) {
      errors.gender = "Select Male or Female.";
    }
    if (shouldValidateKey("emergencyContact") && emergencyContact) {
      if (!/^[0-9+\-()\s]{7,20}$/.test(emergencyContact) || emergencyContact.replace(/\D/g, "").length !== 11) {
        errors.emergencyContact = exactLengthError("Emergency contact number", 11);
      }
    }
    if (shouldValidateKey("address") && address && (address.length < 5 || address.length > 200)) {
      errors.address = minLengthError("Address", 5);
    }
    if (shouldValidateKey("mobilityStatus") && mobilityStatus && !/^[a-zA-Z\s'.-]{2,120}$/.test(mobilityStatus)) {
      errors.mobilityStatus = minLengthError("Mobility status", 2);
    }
    return errors;
  }

  function validateRequestStep2() {
    setRequestStep2ShowErrors(true);
    const errors = getRequestStep2Errors();
    setRequestStep2Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function getRequestStep3Errors(options = {}) {
    const source = options?.source || careDetails;
    const includeRequired = options?.includeRequired !== false;
    const activeKeys = Array.isArray(options?.activeKeys) ? new Set(options.activeKeys) : null;
    const shouldValidateKey = (key) => !activeKeys || activeKeys.has(key);
    const requiredFields = [
      ["visitType", "Select visit type."],
      ["preferredDate", "Preferred visit date is required."],
      ["preferredTime", "Preferred time is required."],
      ["duration", "Duration is required."],
      ["careShift", "Select day or night care."],
      ["liveInCareRequired", "Select yes or no."],
      ["wheelchairAssistanceNeeded", "Select yes or no."],
      ["medicalEquipmentPresent", "Select yes or no."],
      ["requiresLiftingAssistance", "Select yes or no."],
      ["infectiousDisease", "Select yes or no."]
    ];
    const errors = {};
    requiredFields.forEach(([key, message]) => {
      if (includeRequired && shouldValidateKey(key) && !String(source[key] || "").trim()) errors[key] = message;
    });
    if (shouldValidateKey("visitType") && String(source.visitType || "").trim() && !NURSE_REQUEST_VISIT_TYPES.includes(String(source.visitType || "").trim())) {
      errors.visitType = "Select a valid visit type.";
    }
    if (shouldValidateKey("duration") && String(source.duration || "").trim() && !NURSE_REQUEST_DURATIONS.includes(String(source.duration || "").trim())) {
      errors.duration = "Select a valid duration.";
    }
    if (shouldValidateKey("careShift") && String(source.careShift || "").trim() && !NURSE_REQUEST_CARE_SHIFTS.includes(String(source.careShift || "").trim())) {
      errors.careShift = "Select day or night care.";
    }
    NURSE_REQUEST_YES_NO_FIELDS.forEach((key) => {
      if (shouldValidateKey(key) && String(source[key] || "").trim() && !NURSE_REQUEST_YES_NO_OPTIONS.includes(String(source[key] || "").trim())) {
        errors[key] = "Select yes or no.";
      }
    });
    const today = localDateInputValue(new Date());
    if (shouldValidateKey("preferredDate") && String(source.preferredDate || "").trim() && !/^\d{4}-\d{2}-\d{2}$/.test(String(source.preferredDate || "").trim())) {
      errors.preferredDate = "Enter a valid date.";
    }
    if (shouldValidateKey("preferredTime") && String(source.preferredTime || "").trim() && !/^\d{2}:\d{2}$/.test(String(source.preferredTime || "").trim())) {
      errors.preferredTime = "Enter a valid time.";
    }
    if (shouldValidateKey("preferredDate") && String(source.preferredDate || "").trim() && source.preferredDate < today) {
      errors.preferredDate = "Past dates are not allowed.";
    }
    if (shouldValidateKey("preferredTime") && String(source.preferredDate || "").trim() && String(source.preferredTime || "").trim() && !errors.preferredDate && !errors.preferredTime && source.preferredDate === today) {
      const [hh = "0", mm = "0"] = String(source.preferredTime || "").split(":");
      const selected = new Date();
      selected.setHours(Number(hh), Number(mm), 0, 0);
      if (selected.getTime() < Date.now()) {
        errors.preferredTime = "Past time is not allowed.";
      }
    }
    return errors;
  }

  function validateRequestStep3() {
    setRequestStep3ShowErrors(true);
    const errors = getRequestStep3Errors();
    setRequestStep3Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function updateRequestFormField(key, rawValue) {
    const value = sanitizeRequestFieldValue(key, rawValue);
    const nextForm = { ...requestForm, [key]: value };
    setRequestForm(nextForm);
    const liveErrors = getRequestStep2Errors({ includeRequired: false, activeKeys: [key], source: nextForm });
    setRequestStep2Errors((current) => {
      const next = { ...current };
      delete next[key];
      if ((requestStep2Touched[key] || requestStep2ShowErrors) && String(value || "").trim() && liveErrors[key]) {
        next[key] = liveErrors[key];
      }
      return next;
    });
  }

  function updateCareDetailField(key, value) {
    const nextDetails = { ...careDetails, [key]: value };
    setCareDetails(nextDetails);
    const liveErrors = getRequestStep3Errors({ includeRequired: false, activeKeys: [key], source: nextDetails });
    setRequestStep3Errors((current) => {
      const next = { ...current };
      delete next[key];
      if ((requestStep3Touched[key] || requestStep3ShowErrors) && String(value || "").trim() && liveErrors[key]) {
        next[key] = liveErrors[key];
      }
      return next;
    });
  }

  function markRequestStep2FieldBlurred(key) {
    setRequestStep2Touched((current) => ({ ...current, [key]: true }));
    const errors = getRequestStep2Errors({ includeRequired: false, activeKeys: [key] });
    setRequestStep2Errors((current) => {
      const next = { ...current };
      const value = sanitizeRequestFieldValue(key, requestForm[key] || "");
      delete next[key];
      if (String(value || "").trim() && errors[key]) {
        next[key] = errors[key];
      }
      return next;
    });
  }

  function markRequestStep3FieldBlurred(key) {
    setRequestStep3Touched((current) => ({ ...current, [key]: true }));
    const errors = getRequestStep3Errors({ includeRequired: false, activeKeys: [key] });
    setRequestStep3Errors((current) => {
      const next = { ...current };
      const value = careDetails[key] || "";
      delete next[key];
      if (String(value || "").trim() && errors[key]) {
        next[key] = errors[key];
      }
      return next;
    });
  }

  const requestContinueDisabled = requestSubmitting
      || (requestStep === 1 && !NURSE_REQUEST_CARE_TYPES.includes(selectedCareType))
      || (requestStep === 2 && Object.keys(getRequestStep2Errors()).length > 0)
      || (requestStep === 3 && Object.keys(getRequestStep3Errors()).length > 0);

  async function handleRequestContinue() {
    if (requestStep === 1) {
      if (!selectedCareType) return;
      transitionToRequestStep(2);
      return;
    }
    if (requestStep === 2) {
      if (!validateRequestStep2()) return;
      transitionToRequestStep(3);
      return;
    }
    if (requestStep === 3) {
      if (!validateRequestStep3()) return;
      transitionToRequestStep(4);
      return;
    }
    if (requestStep === 4) {
      transitionToRequestStep(5);
      return;
    }
    if (requestSubmitting) return;
    const normalizedCareDetails = { ...careDetails };
    const finalCareErrors = getRequestStep3Errors({ source: normalizedCareDetails });
    if (Object.keys(finalCareErrors).length) {
      setRequestStep(3);
      setRequestStep3ShowErrors(true);
      setRequestStep3Errors(finalCareErrors);
      return;
    }
    setRequestSubmitError("");
    setRequestSubmitting(true);
    setRequestSubmitLoadingState(true);
    try {
      const response = await fetch("/api/customer/nurse-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session?.frontendType || "patient",
          "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
        },
        body: JSON.stringify({
          careType: selectedCareType,
          patient: requestForm,
          careDetails: normalizedCareDetails,
          clinicalRequirements,
          uploadedMedicalFiles: Object.fromEntries(Object.entries(uploadedMedicalFiles).map(([key, value]) => [key, value?.name || ""])),
          customerEmail: profile.email || settings.email || "",
          customerName: requestForm.name || settings.displayName || profile.display_name || "",
          customerPhone: settings.phone || requestForm.emergencyContact || "",
          appOrigin: typeof window !== "undefined" ? window.location.origin : "",
          baseUrl: nurseRequestAuth?.baseUrl || "",
          adminEmail: nurseRequestAuth?.adminEmail || "",
          frontendType: session?.frontendType || "patient",
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorField = String(result?.error?.field || result?.error?.details?.field || "").trim().replace(/^careDetails\./, "");
        const errorMessage = String(result?.error?.message || "Unable to submit nurse request.");
        if (["preferredDate", "preferredTime", "visitType", "duration", "careShift"].includes(errorField)) {
          setRequestStep(3);
          setRequestStep3ShowErrors(true);
          setRequestStep3Errors((current) => ({ ...current, [errorField]: errorMessage }));
          setRequestSubmitError("");
        } else {
          setRequestSubmitError(errorMessage);
        }
        return;
      }
      const created = result?.data?.request || result?.request || {
        id: `nurse-${Date.now()}`,
        status: "pending_review",
        title: `Nurse Visit Request - ${selectedCareType}`,
        careType: selectedCareType,
        preferredDate: normalizedCareDetails.preferredDate,
        preferredTime: normalizedCareDetails.preferredTime,
        visitType: normalizedCareDetails.visitType
      };
      await nurseRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, created) : [created], { revalidate: false });
      void nurseRequestsQuery.mutate();
      setLatestSubmittedRequest(created);
      setRequestSubmitted(true);
    } catch {
      setRequestSubmitError("Unable to submit nurse request.");
    } finally {
      window.setTimeout(() => setRequestSubmitLoadingState(false), 320);
      setRequestSubmitting(false);
    }
  }

  function transitionToIvTherapyStep(nextStep) {
    setIvTherapySubmitError("");
    setIvTherapyShowErrors(false);
    setIvTherapyAnimatingOut(true);
    window.setTimeout(() => {
      setIvTherapyStep(nextStep);
      setIvTherapyAnimatingOut(false);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }, 140);
  }

  function updateIvTherapyField(section, key, value) {
    const sanitizedValue = sanitizeClientText(value, { max: ["primaryReason", "expectedResults", "chronicConditionsDetails", "currentMedicationsDetails", "allergiesDetails", "priorIvTherapyDetails"].includes(key) ? 800 : 200 });
    setIvTherapyForm((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: sanitizedValue,
      }
    }));
  }

  function toggleIvTherapyType(option) {
    setIvTherapyForm((current) => {
      const currentTypes = Array.isArray(current.therapyTypes) ? current.therapyTypes : [];
      const selected = currentTypes.includes(option);
      return {
        ...current,
        therapyTypes: selected ? currentTypes.filter((item) => item !== option) : [...currentTypes, option]
      };
    });
  }

  function setIvTherapyConsent(value) {
    setIvTherapyForm((current) => ({ ...current, consent: value }));
  }

  const ivTherapyStepErrors = buildIvTherapyStepErrors(ivTherapyStep, ivTherapyForm);
  const showIvTherapyFieldError = (key) => Boolean(ivTherapyStepErrors[key]) && ivTherapyShowErrors;
  const ivTherapyAvailableCities = useMemo(() => citiesForNigeriaState(ivTherapyForm.patient.state), [ivTherapyForm.patient.state]);

  async function handleIvTherapyContinue() {
    if (ivTherapySubmitting) {
      return;
    }

    const currentStepErrors = buildIvTherapyStepErrors(ivTherapyStep, ivTherapyForm);
    if (Object.keys(currentStepErrors).length) {
      setIvTherapyShowErrors(true);
      return;
    }

    if (ivTherapyStep < 5) {
      transitionToIvTherapyStep(ivTherapyStep + 1);
      return;
    }

    setIvTherapySubmitError("");
    setIvTherapySubmitting(true);
    try {
      const patientPayload = buildIvTherapyPatientPayload(ivTherapyForm.patient);
      const created = await submitCustomerIvTherapyRequest(session, {
        patient: patientPayload,
        clinicalHistory: ivTherapyForm.clinicalHistory,
        therapyTypes: ivTherapyForm.therapyTypes,
        goals: ivTherapyForm.goals,
        consent: ivTherapyForm.consent,
        customerEmail: profile.email || settings.email || "",
        customerName: patientPayload.name || settings.displayName || profile.display_name || "",
        customerPhone: settings.phone || patientPayload.phoneNumber || "",
        appOrigin: typeof window !== "undefined" ? window.location.origin : "",
        baseUrl: session?.baseUrl || "",
        frontendType: session?.frontendType || "patient",
      });
      await ivTherapyRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, created) : [created], { revalidate: false });
      void ivTherapyRequestsQuery.mutate();
      setIvTherapyLatestRequest(created);
      setIvTherapySubmitted(true);
    } catch (error) {
      setIvTherapySubmitError(error?.message || "Unable to submit IV therapy request.");
    } finally {
      setIvTherapySubmitting(false);
    }
  }

  function transitionToMtmStep(nextStep) {
      if (mtmLatestRequest?.id && mtmBookingContext && nextStep < 6) {
        setMtmSnackbar("This assessment is already saved. Complete availability selection, then use request history for further updates.");
        return;
      }
      setMtmSubmitError("");
      setMtmStepErrors({});
      setMtmTouchedFields({});
      setMtmShowErrors(false);
      setMtmAnimatingOut(true);
    window.setTimeout(() => {
      setMtmStep(nextStep);
      setMtmAnimatingOut(false);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }, 140);
  }

  function updateMtmField(section, key, value) {
    const normalizedValue = Array.isArray(value)
      ? normalizeCustomerHealthChipList(value)
      : sanitizeMtmFieldValue(section, key, value);
    let nextForm = {
      ...mtmForm,
      [section]: {
        ...mtmForm[section],
        [key]: normalizedValue,
      }
    };
    if (section === "emergencyContact" && key === "consentToDiscussCare" && normalizedValue === "No") {
      const emptyForm = createMtmFormState();
      nextForm = {
        ...nextForm,
        emergencyContact: { ...emptyForm.emergencyContact, consentToDiscussCare: "No" },
        medicalHistory: emptyForm.medicalHistory,
        medicationProfile: emptyForm.medicationProfile,
        adherenceAssessment: emptyForm.adherenceAssessment,
        additionalInformation: emptyForm.additionalInformation,
      };
      setMtmMedicationEntries([createEmptyMtmMedicationProfile()]);
      setMtmPreviousMedicationFile(null);
      setMtmLabResultsFiles([]);
      if (mtmPreviousMedicationInputRef.current) mtmPreviousMedicationInputRef.current.value = "";
      if (mtmLabResultsInputRef.current) mtmLabResultsInputRef.current.value = "";
      mtmMedicationInputRefs.current.forEach((input) => { if (input) input.value = ""; });
      setMtmTouchedFields((current) => ({ consentToDiscussCare: current.consentToDiscussCare }));
    }
    setMtmForm(nextForm);
    const liveErrors = buildMtmStepErrors(mtmStep, nextForm, mtmLabResultsFiles, {
      medicationEntries: mtmMedicationEntries,
      requireMedicationDraft: false,
      includeRequired: false,
      activeKeys: [key],
    });
    setMtmStepErrors((current) => {
      const next = { ...current };
      delete next[key];
      if (section === "emergencyContact" && key === "consentToDiscussCare" && normalizedValue === "No") {
        Object.keys(next).forEach((fieldKey) => { if (fieldKey !== "consentToDiscussCare") delete next[fieldKey]; });
      }
      if ((mtmTouchedFields[key] || mtmShowErrors) && liveErrors[key]) {
        next[key] = liveErrors[key];
      }
      return next;
    });
  }

  function markMtmFieldBlurred(section, key) {
    const currentValue = mtmForm?.[section]?.[key] || "";
    const normalizedValue = Array.isArray(currentValue)
      ? normalizeCustomerHealthChipList(currentValue)
      : sanitizeMtmFieldValue(section, key, currentValue);
    const nextForm = {
      ...mtmForm,
      [section]: {
        ...mtmForm[section],
        [key]: normalizedValue,
      }
    };
    setMtmTouchedFields((current) => ({ ...current, [key]: true }));
    const errors = buildMtmStepErrors(mtmStep, nextForm, mtmLabResultsFiles, {
      medicationEntries: mtmMedicationEntries,
      requireMedicationDraft: false,
      includeRequired: false,
      activeKeys: [key],
    });
    setMtmStepErrors((current) => {
      const next = { ...current };
      delete next[key];
      if (String(normalizedValue || "").trim() && errors[key]) {
        next[key] = errors[key];
      }
      return next;
    });
  }

  useEffect(() => {
    setMobileHealthDraft(normalizeCustomerSettingsPayload(settings));
    setMobileHealthErrors({});
    setMobileChipDrafts({ allergies: "", currentMedications: "", existingConditions: "" });
  }, [settings]);

  useEffect(() => {
    setMobileProfileDraft(normalizeCustomerSettingsPayload(settings));
    setMobileProfileErrors({});
  }, [settings]);

  function updateMobileHealthDraft(key, value) {
    setMobileHealthDraft((current) => normalizeCustomerSettingsPayload({ ...current, [key]: value }));
  }

  function addMobileHealthChip(key) {
    const nextValue = sanitizeCustomerHealthChip(mobileChipDrafts[key]);
    if (!nextValue) {
      return;
    }
    updateMobileHealthDraft(key, normalizeCustomerHealthChipList([...(mobileHealthDraft[key] || []), nextValue]));
    setMobileChipDrafts((current) => ({ ...current, [key]: "" }));
  }

  function removeMobileHealthChip(key, item) {
    updateMobileHealthDraft(key, (mobileHealthDraft[key] || []).filter((entry) => entry !== item));
  }

  function renderMobileHealthChipField(key, label) {
    const chips = normalizeCustomerHealthChipList(mobileHealthDraft[key]);
    return <label className="customer-profile-mobile-health-field customer-profile-mobile-chip-field" key={key}>
      <span>{label}</span>
      <div className="customer-profile-mobile-chip-control">
        {chips.length ? <div className="customer-profile-mobile-chip-list" aria-label={`${label} entries`}>
          {chips.map((item) => <span className="customer-profile-chip customer-profile-mobile-chip" key={item}>{item}<button type="button" onClick={() => removeMobileHealthChip(key, item)} aria-label={`Remove ${item}`}>x</button></span>)}
        </div> : null}
        <input value={mobileChipDrafts[key] || ""} placeholder={chips.length ? "Add another" : "Not added"} onChange={(event) => setMobileChipDrafts((current) => ({ ...current, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addMobileHealthChip(key); } }} onBlur={() => addMobileHealthChip(key)} />
      </div>
    </label>;
  }
  async function saveMobileHealthRecords() {
    const normalizedDraft = normalizeCustomerSettingsPayload({
      ...settings,
      bloodGroup: mobileHealthDraft.bloodGroup,
      genotype: mobileHealthDraft.genotype,
      allergies: normalizeCustomerHealthChipList(mobileHealthDraft.allergies),
      currentMedications: normalizeCustomerHealthChipList(mobileHealthDraft.currentMedications),
      existingConditions: normalizeCustomerHealthChipList(mobileHealthDraft.existingConditions),
      emergencyContactName: sanitizeClientText(mobileHealthDraft.emergencyContactName || "", { max: 120 }),
      emergencyContactPhoneNumber: normalizeMtmPhoneNumber(mobileHealthDraft.emergencyContactPhoneNumber || ""),
    });
    const errors = getCustomerSettingsFieldErrors(normalizedDraft);
    if (Object.keys(errors).length) {
      setMobileHealthErrors(errors);
      return;
    }
    setCustomerSettingsSaveStatus('saving');
    setCustomerSettingsSaveError('');
    setMobileHealthErrors({});
    try {
      const savedSettings = normalizeCustomerSettingsPayload(await updateCustomerSettings(session, normalizedDraft));
      setSettings(savedSettings);
      setCustomerSettingsSaveStatus('saved');
    } catch (error) {
      setCustomerSettingsSaveStatus('error');
      setCustomerSettingsSaveError(error?.message || 'Unable to save health records.');
    }
  }

  async function saveMobileProfileChanges() {
    const normalizedDraft = normalizeCustomerSettingsPayload({
      ...settings,
      displayName: sanitizeClientText(mobileProfileDraft.displayName || '', { max: 120 }),
      phone: normalizeMtmPhoneNumber(mobileProfileDraft.phone || ''),
      address: sanitizeClientText(mobileProfileDraft.address || '', { max: 200 }),
      email: sanitizeClientText(mobileProfileDraft.email || '', { max: 254 }).replace(/\s+/g, ''),
    });
    const errors = getCustomerSettingsFieldErrors(normalizedDraft, { requireAll: true });
    if (Object.keys(errors).length) {
      setMobileProfileErrors(errors);
      return;
    }
    setCustomerSettingsSaveStatus('saving');
    setCustomerSettingsSaveError('');
    setMobileProfileErrors({});
    try {
      const savedSettings = normalizeCustomerSettingsPayload(await updateCustomerSettings(session, normalizedDraft));
      setSettings(savedSettings);
      setCustomerSettingsSaveStatus('saved');
    } catch (error) {
      setCustomerSettingsSaveStatus('error');
      setCustomerSettingsSaveError(error?.message || 'Unable to save profile settings.');
    }
  }

  function markCustomerSettingsFieldBlurred(key) {
    setCustomerSettingsTouched((current) => ({ ...current, [key]: true }));
  }

  async function flushCustomerSettingsOnBlur(key) {
    markCustomerSettingsFieldBlurred(key);
    const normalizedSettings = normalizeCustomerSettingsPayload(settings);
    const errors = getCustomerSettingsFieldErrors(normalizedSettings);
    if (errors[key]) {
      setCustomerSettingsSaveStatus('');
      setCustomerSettingsSaveError(errors[key]);
      return;
    }
    if (!session?.accessToken) return;
    setCustomerSettingsSaveStatus('saving');
    setCustomerSettingsSaveError('');
    try {
      const savedSettings = normalizeCustomerSettingsPayload(await updateCustomerSettings(session, normalizedSettings));
      setSettings(savedSettings);
      setCustomerSettingsSaveStatus('saved');
    } catch (error) {
      setCustomerSettingsSaveStatus('error');
      setCustomerSettingsSaveError(error?.message || 'Unable to save profile settings.');
    }
  }

  async function handleCustomerNotificationToggle(key, value) {
    const nextSettings = normalizeCustomerSettingsPayload({ ...settings, [key]: value });
    setSettings(nextSettings);
    setCustomerSettingsSaveStatus('saving');
    setCustomerSettingsSaveError('');
    try {
      const savedSettings = normalizeCustomerSettingsPayload(await updateCustomerSettings(session, nextSettings));
      setSettings(savedSettings);
      setCustomerSettingsSaveStatus('saved');
    } catch (error) {
      setSettings(settings);
      setCustomerSettingsSaveStatus('error');
      setCustomerSettingsSaveError(error?.message || 'Unable to save notification settings.');
    }
  }
  async function handleProfileImageSelected(fileOrEvent) {
    const preparedUpload = fileOrEvent && typeof fileOrEvent === "object" && typeof fileOrEvent.data_base64 === "string"
      ? fileOrEvent
      : null;
    const file = preparedUpload?.file || fileOrEvent?.target?.files?.[0] || fileOrEvent || null;
    const nextInput = fileOrEvent?.target || profileImageInputRef.current;
    setProfileImageError("");
        setProfileImageSuccess("");
            setProfileImageCooldownUntil(0);
            if (!preparedUpload) {
      const validationMessage = validateCustomerProfileImageFile(file);
      if (validationMessage) {
        setProfileImageError(validationMessage);
        if (nextInput) {
          nextInput.value = "";
        }
        return false;
      }
    }
    setProfileImageSaving(true);
    setProfileImageRefreshing(false);
    let uploadedAvatarUrl = "";
    try {
      const payload = preparedUpload
        ? {
            filename: preparedUpload.filename,
            mime_type: preparedUpload.mime_type,
            data_base64: preparedUpload.data_base64,
          }
        : {
            filename: file.name,
            mime_type: file.type,
            data_base64: await readFileAsBase64(file),
          };
      const result = await uploadCustomerProfileImage(session, payload);
      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || "");
      if (uploadedAvatarUrl) {
        const refreshedAvatarUrl = withProfileAvatarRefreshToken(uploadedAvatarUrl, Date.now());
        setPendingProfileAvatarUrl(refreshedAvatarUrl);
        setProfileImageRefreshing(true);
        void mobileGlobalMutate(
          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),
          (current) => patchCustomerProfileAvatarState(current, refreshedAvatarUrl),
          { revalidate: false }
        );
        setSession?.((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
        persistPatientSessionAvatar(refreshedAvatarUrl);
      }
      setProfileImageSuccess('Profile image updated successfully.');
      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session))).then((refreshedState) => {
        const refreshedAvatarUrl = normalizeProfileAvatarUrl(
          refreshedState?.dashboard?.profile?.avatar_url
          || refreshedState?.dashboard?.profile?.profile_image
          || refreshedState?.profile?.avatar_url
          || refreshedState?.profile?.profile_image
        );
        if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {
          setPendingProfileAvatarUrl("");
        }
      }).finally(() => {
        setProfileImageRefreshing(false);
      });
      return true;
    } catch (error) {
      setProfileImageRefreshing(false);
      if (!uploadedAvatarUrl) {
        setPendingProfileAvatarUrl("");
      }
      const retrySeconds = getProfileImageRateLimitRetrySeconds(error);
      if (retrySeconds > 0) {
        setProfileImageCooldownUntil(Date.now() + (retrySeconds * 1000));
      }
      setProfileImageError(describeProfileImageUploadError(error));
      return false;
    } finally {
      setProfileImageSaving(false);
      if (nextInput) {
        nextInput.value = "";
      }
    }
  }
  function toggleMtmBarrier(option) {
    setMtmForm((current) => {
      const barriers = Array.isArray(current.adherenceAssessment.barriers) ? current.adherenceAssessment.barriers : [];
      const nextBarriers = barriers.includes(option)
        ? barriers.filter((item) => item !== option)
        : [...barriers, option];
      return {
        ...current,
        adherenceAssessment: {
          ...current.adherenceAssessment,
          barriers: nextBarriers,
          other: nextBarriers.includes("Other") ? current.adherenceAssessment.other : "",
        }
      };
    });
  }

  function validateMtmStep(step) {
    setMtmShowErrors(true);
    const errors = buildMtmStepErrors(step, mtmForm, mtmLabResultsFiles, {
      medicationEntries: mtmMedicationEntries,
      requireMedicationDraft: false,
    });
    if (step === 4) {
      mtmMedicationEntries.forEach((entry, index) => {
        if (!entry.file) {
          errors[`medicationImage-${index}`] = "Upload an image to continue.";
        }
      });
      if (mtmMedicationEntries.some((entry) => !String(entry.prescribingDoctor || "").trim())) {
        errors.medications = "Enter the prescribing doctor for every medication.";
      }
    }
    setMtmStepErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const showRequestStep2FieldError = (key) => Boolean(requestStep2Errors[key]) && (requestStep2Touched[key] || requestStep2ShowErrors);
  const showRequestStep3FieldError = (key) => Boolean(requestStep3Errors[key]) && (requestStep3Touched[key] || requestStep3ShowErrors);
  const showMtmFieldError = (key) => Boolean(mtmStepErrors[key]) && (mtmTouchedFields[key] || mtmShowErrors);
  const showCustomerSettingsFieldError = (key) => Boolean(customerSettingsErrors[key]) && customerSettingsTouched[key];

  function buildMtmUploadFieldErrors() {
    const errors = {};
    mtmMedicationEntries.forEach((entry, index) => {
      const message = getMtmImageUploadError(entry.file);
      if (message) {
        errors[`medicationImage-${index}`] = message;
      }
    });
    if (mtmPreviousMedicationFile) {
      const message = getMtmImageUploadError(mtmPreviousMedicationFile);
      if (message) {
        errors.previousMedicationsStopped = message;
      }
    }
    const invalidLabResult = mtmLabResultsFiles.find((file) => getMtmImageUploadError(file));
    if (invalidLabResult) {
      errors.relevantLabResults = getMtmImageUploadError(invalidLabResult, { each: true });
    }
    return errors;
  }

  function focusFirstMtmUploadError(errors) {
    const medicationErrorKey = Object.keys(errors).find((key) => key.startsWith("medicationImage-"));
    if (medicationErrorKey || errors.previousMedicationsStopped) {
      setMtmStep(4);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (medicationErrorKey) {
            const medicationIndex = Number(medicationErrorKey.split("-").pop());
            mtmMedicationInputRefs.current.get(medicationIndex)?.focus();
            return;
          }
          mtmPreviousMedicationInputRef.current?.focus();
        });
      });
      return;
    }
    if (errors.relevantLabResults) {
      setMtmStep(3);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => mtmLabResultsInputRef.current?.focus());
      });
    }
  }

  async function submitMtmRequest() {
    if (mtmSubmitting) return;
    if (!validateMtmStep(6)) return;
    if (!session) {
      setMtmSubmitError("Session is not available.");
      return;
    }
    const skipClinicalSections = mtmSkipsClinicalSections(mtmForm);
    const uploadFieldErrors = skipClinicalSections ? {} : buildMtmUploadFieldErrors();
    if (Object.keys(uploadFieldErrors).length) {
      setMtmShowErrors(true);
      setMtmSubmitError("");
      setMtmStepErrors((current) => ({ ...current, ...uploadFieldErrors }));
      setMtmTouchedFields((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(uploadFieldErrors).map((key) => [key, true])),
      }));
      focusFirstMtmUploadError(uploadFieldErrors);
      return;
    }
    setMtmSubmitting(true);
    setMtmLoadingState(true);
    setMtmSubmitError("");
    const submittedMedications = skipClinicalSections ? [] : mtmMedicationEntries.map((entry) => ({
      medicationFileName: entry.medicationFileName,
      medicationName: entry.medicationFileName,
      prescribingDoctor: entry.prescribingDoctor,
      notes: entry.notes,
    }));
    const imageCount = skipClinicalSections ? 0 : mtmMedicationEntries.length + mtmLabResultsFiles.length + (mtmPreviousMedicationFile ? 1 : 0);
    if (imageCount > 8) {
      setMtmStepErrors({ medications: "Upload no more than 8 images across the MTM assessment." });
      setMtmSubmitting(false);
      setMtmLoadingState(false);
      return;
    }
    if (!skipClinicalSections && (!submittedMedications.length || mtmMedicationEntries.some((entry) => !entry.file || !String(entry.prescribingDoctor || "").trim()))) {
      setMtmStepErrors({ medications: "Enter the prescribing doctor for every medication." });
      setMtmTouchedFields((current) => ({ ...current, medications: true }));
      setMtmStep(4);
      setMtmSubmitting(false);
      setMtmLoadingState(false);
      return;
    }
    try {
      const submission = await submitCustomerMtmRequest(session, {
        patient: mtmForm.patient,
        emergency_contact: mtmForm.emergencyContact,
        medical_history: skipClinicalSections ? {} : mtmForm.medicalHistory,
        medication_profile: skipClinicalSections ? {} : {
          ...mtmForm.medicationProfile,
          medications: submittedMedications,
        },
        adherence_assessment: skipClinicalSections ? {} : mtmForm.adherenceAssessment,
        additional_information: skipClinicalSections ? {} : mtmForm.additionalInformation,
        attachments: skipClinicalSections ? [] : [
          ...mtmMedicationEntries.map((entry, index) => ({ name: entry.file.name, size: entry.file.size, type: entry.file.type, category: "medication", heading: `Medication ${index + 1}` })),
          ...(mtmPreviousMedicationFile ? [{ name: mtmPreviousMedicationFile.name, size: mtmPreviousMedicationFile.size, type: mtmPreviousMedicationFile.type, category: "previous_medication", heading: "Previous Medication Stopped" }] : []),
          ...mtmLabResultsFiles.map((file, index) => ({ name: file.name, size: file.size, type: file.type, category: "lab_result", heading: `Relevant Lab Result ${index + 1}` })),
        ],
        pdf_image_files: skipClinicalSections ? [] : [
          ...mtmMedicationEntries.map((entry, index) => ({ file: entry.file, category: "medication", heading: `Medication ${index + 1}` })),
          ...(mtmPreviousMedicationFile ? [{ file: mtmPreviousMedicationFile, category: "previous_medication", heading: "Previous Medication Stopped" }] : []),
          ...mtmLabResultsFiles.map((file, index) => ({ file, category: "lab_result", heading: `Relevant Lab Result ${index + 1}` })),
        ],
        duration_minutes: 30,
        timezone: storeTimeZone,
      });
      const nextRequest = submission?.request || null;
      setMtmLatestRequest(nextRequest);
      if (nextRequest?.id) {
        setMtmSelectedRequestId(String(nextRequest.id));
      }
      await mtmRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, nextRequest) : (nextRequest ? [nextRequest] : []), { revalidate: false });
      void mtmRequestsQuery.mutate();
      const bookingContext = await fetchMtmBookingContext(session, nextRequest.id);
      const firstSlotDate = String(bookingContext?.available_slots?.[0]?.start_at || "").slice(0, 10);
      setMtmBookingContext(bookingContext);
      setMtmBookingDate(firstSlotDate || localDateKey(new Date()));
      setMtmBookingSlot(null);
      setMtmBookingError("");
      setMtmBookingStage("availability");
      void prepareCustomerMtmPdf(session, nextRequest, submission?.pdfSnapshot, submission?.pdfImageFiles)
        .then(({ request: preparedRequest }) => {
          if (preparedRequest) {
            setMtmLatestRequest(preparedRequest);
            void mtmRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, preparedRequest) : [preparedRequest], { revalidate: false });
          }
          setMtmSnackbar("MTM PDF is ready.");
        })
        .catch(() => {
          setMtmSnackbar("Assessment submitted. PDF preparation can be retried from history.");
        });
    } catch (error) {
      setMtmSubmitError(error?.message || "Unable to submit MTM request.");
    } finally {
      window.setTimeout(() => setMtmLoadingState(false), 240);
      setMtmSubmitting(false);
    }
  }

  async function refreshMtmAvailability() {
    const requestId = mtmLatestRequest?.id;
    if (!session || !requestId || mtmBookingBusy) return;
    setMtmBookingBusy(true);
    setMtmBookingError("");
    try {
      const context = await fetchMtmBookingContext(session, requestId);
      setMtmBookingContext(context);
      setMtmBookingSlot((current) => context?.available_slots?.some((slot) => slot.start_at === current?.start_at) ? current : null);
    } catch (error) {
      setMtmBookingError(error?.message || "Availability could not be refreshed.");
    } finally {
      setMtmBookingBusy(false);
    }
  }

  async function confirmMtmAvailability() {
    if (!session || !mtmLatestRequest?.id || !mtmBookingSlot || mtmBookingBusy) return;
    setMtmBookingBusy(true);
    setMtmBookingError("");
    try {
      const result = await reserveMtmSlot(session, mtmLatestRequest.id, { start_at: mtmBookingSlot.start_at, timezone: storeTimeZone });
      const updatedRequest = result?.request || mtmLatestRequest;
      setMtmLatestRequest(updatedRequest);
      setMtmBookingContext((current) => ({ ...current, slot_state: updatedRequest?.slot_reservation?.state, reserved_start_at: updatedRequest?.slot_reservation?.start_at, slot_hold_expires_at: updatedRequest?.slot_reservation?.hold_expires_at, next_action: result?.next_action }));
      await mtmRequestsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, updatedRequest) : [updatedRequest], { revalidate: false });
      if (result?.next_action === "pay") {
        router.push(`/dashboard/therapy/${encodeURIComponent(String(updatedRequest?.id || mtmLatestRequest.id))}/payment`);
      } else {
        setMtmBookingStage("success");
        setMtmSubmitted(true);
      }
    } catch (error) {
      setMtmBookingError(error?.message || "That availability could not be reserved. Refresh and select another time.");
      try {
        const context = await fetchMtmBookingContext(session, mtmLatestRequest.id);
        setMtmBookingContext(context);
        setMtmBookingSlot(null);
      } catch {
        // Preserve the actionable reservation error when refresh also fails.
      }
    } finally {
      setMtmBookingBusy(false);
    }
  }

  async function handleLabResultsUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setMtmLabResultsFiles([]);
      updateMtmField("medicalHistory", "relevantLabResults", "");
      setMtmStepErrors((current) => {
        const next = { ...current };
        delete next.relevantLabResults;
        return next;
      });
      return;
    }
    const selectedImageCount = mtmMedicationEntries.filter((entry) => entry.file).length + (mtmPreviousMedicationFile ? 1 : 0) + files.length;
    if (selectedImageCount > 8) {
      setMtmTouchedFields((current) => ({ ...current, relevantLabResults: true }));
      setMtmStepErrors((current) => ({ ...current, relevantLabResults: "Upload no more than 8 images across the MTM assessment." }));
      event.target.value = "";
      return;
    }
    const invalidFile = files.find((file) => !isAllowedMtmImageFile(file));
    if (invalidFile) {
      setMtmLabResultsFiles([]);
      updateMtmField("medicalHistory", "relevantLabResults", "");
      setMtmTouchedFields((current) => ({ ...current, relevantLabResults: true }));
      setMtmStepErrors((current) => ({
        ...current,
        relevantLabResults: "Upload PNG, JPG, JPEG, or WebP images up to 5MB each.",
      }));
      event.target.value = "";
      return;
    }
    const hasInvalidSignature = (await Promise.all(files.map((file) => hasValidMtmImageSignature(file)))).some((isValid) => !isValid);
    if (hasInvalidSignature) {
      setMtmLabResultsFiles([]);
      updateMtmField("medicalHistory", "relevantLabResults", "");
      setMtmTouchedFields((current) => ({ ...current, relevantLabResults: true }));
      setMtmStepErrors((current) => ({ ...current, relevantLabResults: "Upload valid PNG, JPG, JPEG, or WebP images up to 5MB each." }));
      event.target.value = "";
      return;
    }
    setMtmLabResultsFiles(files);
    updateMtmField("medicalHistory", "relevantLabResults", files.map((file) => file.name).join(", "));
    setMtmStepErrors((current) => {
      const next = { ...current };
      delete next.relevantLabResults;
      return next;
    });
  }

  function addMtmMedicationEntry() {
    if (mtmMedicationEntries.length >= 8) {
      setMtmStepErrors((current) => ({ ...current, medications: "A maximum of 8 medication images can be added." }));
      return;
    }
    setMtmMedicationEntries((current) => [...current, createEmptyMtmMedicationProfile()]);
    window.requestAnimationFrame(() => mtmMedicationInputRefs.current.get(mtmMedicationEntries.length)?.focus());
  }

  function updateMtmMedicationEntry(index, key, value) {
    setMtmMedicationEntries((current) => current.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, [key]: key === "file" ? value : sanitizeClientText(value, { max: key === "notes" ? 1000 : 120 }) }
      : entry));
  }

  async function handleMtmMedicationUpload(index, file, input) {
    const errorKey = `medicationImage-${index}`;
    const selectedImageCount = mtmMedicationEntries.filter((entry, entryIndex) => entryIndex !== index && entry.file).length
      + mtmLabResultsFiles.length
      + (mtmPreviousMedicationFile ? 1 : 0)
      + 1;
    if (selectedImageCount > 8) {
      setMtmStepErrors((current) => ({ ...current, [errorKey]: "Upload no more than 8 images across the MTM assessment." }));
      setMtmTouchedFields((current) => ({ ...current, [errorKey]: true }));
      if (input) input.value = "";
      return;
    }
    if (!isAllowedMtmImageFile(file)) {
      setMtmStepErrors((current) => ({ ...current, [errorKey]: "Upload PNG, JPG, JPEG, or WebP images up to 5MB." }));
      setMtmTouchedFields((current) => ({ ...current, [errorKey]: true }));
      if (input) input.value = "";
      return;
    }
    if (!await hasValidMtmImageSignature(file)) {
      setMtmStepErrors((current) => ({ ...current, [errorKey]: "Upload a valid PNG, JPG, JPEG, or WebP image up to 5MB." }));
      setMtmTouchedFields((current) => ({ ...current, [errorKey]: true }));
      if (input) input.value = "";
      return;
    }
    setMtmMedicationEntries((current) => current.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, file, medicationFileName: sanitizeClientText(file.name, { max: 180 }) }
      : entry));
    setMtmStepErrors((current) => { const next = { ...current }; delete next.medications; delete next[errorKey]; return next; });
  }

  function removeMtmMedicationEntry(indexToRemove) {
    setMtmMedicationEntries((current) => current.length === 1 ? current : current.filter((_, index) => index !== indexToRemove));
  }

  function renderHeader(title, showBack = false, onBack = onResetJourney, headerAction = null) {
    const greetingName = customerDisplayName;
    const isOverviewHeader = page === "overview";
    const spacerClass = page === "appointment" ? "is-appointment" : isOverviewHeader ? "is-overview" : "is-compact";
    const searchbar = page === "search" ? <div className="customer-mobile-searchbar is-search-page">
      <MobileIcon name="search" />
      <input
        ref={searchInputRef}
        value={searchQuery}
        onChange={(event) => setSearchQuery(sanitizeClientText(event.target.value, { max: 120 }))}
        placeholder="Search here for orders, appointments etc"
        aria-label="Search here for orders, appointments etc"
      />
    </div> : <button className="customer-mobile-searchbar customer-mobile-searchbar-button" type="button" onClick={openSearchPage} aria-label="Search here for orders, appointments etc">
      <MobileIcon name="search" />
      <span>Search here for orders, appointments etc</span>
    </button>;

    return <>
      <header className={`customer-mobile-header ${isOverviewHeader ? "is-overview" : "is-compact"}`}>
        {searchbar}
        {isOverviewHeader ? <div className="customer-mobile-greeting-row">
          <button className="customer-mobile-icon-button" type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <MobileIcon name="menu" />
          </button>
          <div className="customer-mobile-greeting-copy">
            <span>Welcome back, {greetingName}</span>
          </div>
        </div> : <div className="customer-mobile-pagehead-row">
          <button className="customer-mobile-icon-button" type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <MobileIcon name="menu" />
          </button>
          <AutoFitPageTitle title={title} />
          {headerAction}
        </div>}
        {isOverviewHeader ? <div className="customer-mobile-title-row">
          {showBack ? <button className="customer-mobile-back-link" type="button" onClick={onBack}>
            <MobileIcon name="arrow-left" />
            <span>Go back</span>
          </button> : null}
          <h1>{title}</h1>
        </div> : null}
      </header>
      <div className={`customer-mobile-header-spacer ${spacerClass}`} aria-hidden="true" />
    </>;
  }

  function renderDrawer() {
    return <div className={`customer-mobile-drawer-layer ${drawerOpen ? "open" : ""}`}>
      <ModalScrim className="customer-mobile-drawer-backdrop" label="Close drawer" onDismiss={() => setDrawerOpen(false)} />
      <aside className="customer-mobile-drawer">
        <div className="customer-mobile-drawer-brand" aria-label="Nevari logo">
          <img src="/ne.webp" alt="Nevari" width="32" height="32" />
        </div>
        <nav className="customer-mobile-drawer-nav" aria-label="Patient menu">
          {[
            { id: "overview", label: "Overview", icon: "home" },
            { id: "orders", label: "Orders", icon: "orders" },
            { id: "pharmacy", label: "Pharmacy", icon: "pharmacy" },
            { id: "appointment", label: "Appointments", icon: "calendar" },
            { id: "request", label: "Request a Nurse", icon: "nurse" },
            { id: "therapy", label: "Medication Therapy Management", icon: "cross" },
            { id: "iv-therapy", label: "IV Therapy", icon: "cross" },
            { id: "subscription-management", label: "Nevari Access Pro", icon: "wallet" },
            { id: "profile", label: "Profile", icon: "profile" }
          ].map((item) => (
            <button
              key={item.id}
              className={`customer-mobile-drawer-item ${page === item.id ? "active" : ""}`}
              type="button"
              onClick={() => {
                if (item.id === "request") {
                  openRequestFlow();
                  return;
                }
                if (item.id === "pharmacy") {
                  openPharmacyStore();
                  return;
                }
                if (item.id === "therapy") {
                  goToPage("therapy");
                  return;
                }
                goToPage(item.id);
              }}
            >
              <MobileIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <button className="customer-mobile-drawer-item logout" type="button" onClick={onLogout} disabled={logoutBusy}>
            <MobileIcon name="logout" />
            <span>{logoutBusy ? "Logging out..." : "Log Out"}</span>
          </button>
        </nav>
        <div className="customer-mobile-drawer-footer">
          <div
            className="customer-mobile-drawer-profile"
            role="button"
            tabIndex={0}
            aria-label="Open profile settings"
            onClick={() => {
              goToPage("profile");
              setDrawerOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToPage("profile");
                setDrawerOpen(false);
              }
            }}
          >
            <div className="customer-mobile-avatar">
              {resolvedProfile.avatar_url ? <img src={resolvedProfile.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
              <span style={{ display: resolvedProfile.avatar_url ? "none" : "inline" }}>{initials(customerDisplayName)}</span>
            </div>
            <div>
              <strong>{customerDisplayName}</strong>
              <span>{resolvedProfile.email || settings.email || "tee@example.com"}</span>
            </div>
            <button className="customer-mobile-more" type="button" aria-label="More options" onClick={(event) => event.stopPropagation()}>
              <MobileIcon name="more" />
            </button>
          </div>
        </div>
      </aside>
    </div>;
  }

  if (showSkeleton) {
    return <CustomerMobileSkeleton page={page} />;
  }

  if (appointmentPageLoading) {
    return <CustomerMobileSkeleton page="appointment" />;
  }

  if (journey.mode === "slots") {
    return <CustomerMobileBookCalendar
      doctor={selectedDoctor}
      journey={journey}
      storeTimeZone={storeTimeZone}
      onBack={onResetJourney}
      onUpdateAvailabilityDate={onUpdateAvailabilityDate}
      onSelectSlot={onSelectSlot}
      onDurationChange={onDurationChange}
      onReasonChange={onReasonChange}
      onCreateAppointmentCheckout={onCreateAppointmentCheckout}
      minimumBookingMinutes={minimumBookingMinutes}
      bookCalendarReason={bookCalendarReason}
      setBookCalendarReason={setBookCalendarReason}
      calendarDay={calendarDay}
      setCalendarDay={setCalendarDay}
      calendarTime={calendarTime}
      setCalendarTime={setCalendarTime}
    />;
  }

  if (journey.mode === "checkout") {
    return <CheckoutPage
      journey={journey}
      doctor={selectedDoctor}
      onBack={onResetJourney}
      onRefreshConfirmation={onRefreshConfirmation}
      onCancelCheckoutAppointment={onCancelCheckoutAppointment}
      storeCurrency={storeCurrency}
      storeTimeZone={storeTimeZone}
      livePaymentsEnabled={storefrontSettings.livePaymentsEnabled}
    />;
  }

  if (journey.mode === "confirmation") {
    return <ConfirmationPage
      journey={journey}
      doctor={selectedDoctor}
      onBack={onResetJourney}
      calendarDownloadUrl={journey.appointment?.mock ? "" : (journey.appointment?.id ? buildUrl(hydrateStoredSession("patient"), `/appointments/${journey.appointment.id}/calendar`) : "")}
      storeTimeZone={storeTimeZone}
    />;
  }

  if (journey.mode === "reviews") {
    return <PatientReviewsPage
      doctor={selectedDoctor}
      journey={journey}
      pastAppointments={pastAppointments}
      onBack={onResetJourney}
      onReviewDraftChange={onReviewDraftChange}
      onSubmitReview={onSubmitReview}
    />;
  }

  if (page === "appointment") {
    return <div className="customer-mobile-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        <AppointmentPage
          profile={profile}
          settings={settings}
          doctors={visibleDoctors}
          doctorsUnavailable={state.doctorsUnavailable}
          doctorsLoading={doctorsLoading}
          appointmentsLoading={appointmentsLoading}
          journey={journey}
          selectedDoctor={selectedDoctor}
          upcoming={upcomingAppointments}
          past={pastAppointments}
          onOpenAvailability={onOpenAvailability}
          onOpenReviews={onOpenReviews}
          onOpenAppointment={onOpenAppointment}
          onUpdateAvailabilityDate={onUpdateAvailabilityDate}
          onSelectSlot={onSelectSlot}
          onDurationChange={onDurationChange}
          onReasonChange={onReasonChange}
          onCreateAppointmentCheckout={onCreateAppointmentCheckout}
          onRescheduleAppointmentCheckout={onRescheduleAppointmentCheckout}
          onRefreshConfirmation={onRefreshConfirmation}
          onCancelCheckoutAppointment={onCancelCheckoutAppointment}
          onResetJourney={onResetJourney}
          onReviewDraftChange={onReviewDraftChange}
          onSubmitReview={onSubmitReview}
          onOpenSearch={openSearchPage}
          onOpenMenu={() => setDrawerOpen(true)}
          calendarDownloadUrl={journey.appointment?.mock ? "" : (journey.appointment?.id ? buildUrl(hydrateStoredSession("patient"), `/appointments/${journey.appointment.id}/calendar`) : "")}
          storeCurrency={storeCurrency}
          storeTimeZone={storeTimeZone}
          storefrontSettings={storefrontSettings}
          minimumBookingMinutes={minimumBookingMinutes}
          subscriptionState={subscriptionState}
          showConsultationQuotaNotice={showConsultationQuotaNotice}
          consultationQuotaTitle={consultationQuotaTitle}
          consultationQuotaBody={consultationQuotaBody}
          consultationQuotaResetText={consultationQuotaResetText}
          consultationQuotaTotal={consultationQuotaTotal}
          consultationQuotaUsed={consultationQuotaUsed}
          consultationQuotaRemaining={consultationQuotaRemaining}
          rescheduleTarget={appointmentRescheduleTarget}
          onClearRescheduleTarget={onClearAppointmentRescheduleTarget}
          onShowConsultationQuotaNotice={() => setConsultationQuotaDismissed(false)}
          onDismissConsultationQuotaNotice={() => setConsultationQuotaDismissed(true)}
          prefillBookingDraft={guestConsultationDraft}
          onPrefillConsumed={onGuestConsultationDraftConsumed}
        />
      </main>
    </div>;
  }

  if (page === "search") {
    return <div className="customer-mobile-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame customer-mobile-search-frame ${pageTransitionClass}`}>
        <header className="customer-mobile-search-header-row">
          <button className="customer-mobile-back-link customer-mobile-search-back-inline" type="button" onClick={exitSearchPage}>
            <MobileIcon name="arrow-left" />
          </button>
          <div className="customer-mobile-searchbar is-search-page">
            <MobileIcon name="search" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(sanitizeClientText(event.target.value, { max: 120 }))}
              placeholder="Search here for orders, appointments etc"
              aria-label="Search here for orders, appointments etc"
            />
          </div>
        </header>
        <section className="customer-mobile-search-results">
          {searchQuery.trim().length < 3 ? <div className="customer-mobile-search-empty">
            <strong className="customer-mobile-search-empty-hint">start typing to see results</strong>
          </div> : mobilePatientSearchQuery.isLoading ? <div className="customer-mobile-search-empty" aria-live="polite"><BrandedSpinner label="Searching patient records" /></div> : mobilePatientSearchQuery.error ? <div className="customer-mobile-search-empty" role="alert"><strong>Search is unavailable</strong><small>Try again in a moment.</small></div> : searchResults.length ? searchResults.map((result) => <button className="customer-mobile-search-result" key={result.key} type="button" onClick={result.onSelect}>
            <div>
              <span className="customer-mobile-search-result-area">{result.area}</span>
              <strong>{result.label}</strong>
              <small>{result.meta}</small>
            </div>
            <MobileIcon name="arrow-right" />
          </button>) : <div className="customer-mobile-search-empty">
            <strong>no results found</strong>
          </div>}
        </section>
      </main>
    </div>;
  }

  if (page === "orders") {
    return <div className={`customer-mobile-app ${embeddedDesktop ? "customer-desktop-embedded-page customer-orders-desktop" : ""}`}>
      {!embeddedDesktop ? renderDrawer() : null}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        {embeddedDesktop ? <header className="customer-request-desktop-header customer-orders-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>Orders</h1>
        </header> : renderHeader("Orders")}
        {stateError ? <p className="customer-mobile-alert">{stateError}</p> : null}
        <section className="customer-mobile-stat-grid">
          {orderStats.map((item) => <article key={item.label} className={`customer-mobile-stat-card ${item.accent ? "accent" : ""}`}>
            <MobileIcon name="orders" />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>)}
        </section>
        <section className="customer-mobile-section">
          <h2>Recent Purchases</h2>
          {ordersLoading ? <div className="customer-mobile-order-list">
            {Array.from({ length: 3 }, (_, index) => <article className="customer-mobile-order-row skeleton-panel" key={`customer-mobile-order-skeleton-${index}`}>
              <div className="customer-mobile-order-thumb-wrap skeleton" aria-hidden="true" />
              <div className="customer-mobile-order-copy">
                <SkeletonBox className="skeleton-line skeleton-line-md" />
                <SkeletonBox className="skeleton-line skeleton-line-sm" />
                <SkeletonBox className="skeleton-line skeleton-line-sm" />
              </div>
              <div className="customer-mobile-pill skeleton" aria-hidden="true" />
            </article>)}
          </div> : orderedCustomerOrders.length ? <div className="customer-mobile-order-list">
            {orderedCustomerOrders.slice(0, 3).map((order, index) => {
              const item = order.items?.[0] || {};
              const title = `Order #${order.number || order.id || "0000"}`;
              const quantity = order.totals?.items_quantity || item.quantity || 1;
              const thumbnail = item.image || item.thumbnail || item.product_image || "/ne.webp";
              const statusLabel = titleCase(order.status || "Pending");
              const amount = Number(order.total);
              return <article className="customer-mobile-order-row" key={order.id || index}>
                <div className="customer-mobile-order-thumb-wrap">
                  <img alt="" src={thumbnail} />
                </div>
                <div className="customer-mobile-order-copy">
                  <strong>{title}</strong>
                  <span>{money(Number.isFinite(amount) ? amount : 0, storeCurrency)}</span>
                  <small>{statusLabel}</small>
                </div>
                <div className="customer-mobile-pill">{quantity}</div>
                {String(order.status || "").toLowerCase() === "completed" && (order.can_refill || order.refill_available) ? (
                  <button
                    className="pill-button customer-mobile-refill-button"
                    type="button"
                    disabled={refillOrderBusy === order.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRefillOrder?.(order);
                    }}
                  >
                    {refillOrderBusy === order.id ? <BrandedSpinner label="Creating refill order" /> : "Refill Order"}
                  </button>
                ) : null}
                <button className="customer-mobile-row-overlay" type="button" aria-label="Open order details" onClick={() => setSelectedOrder(order)} />
              </article>;
            })}
          </div> : <CustomerMobileEmptyState
            message="No orders found"
            ctaLabel="Shop Medicines"
            onCta={openPharmacyStore}
            icon="orders"
            illustrationSrc="/group-3.png"
            ctaStyle="shop"
          />}
        </section>
      </main>
    </div>;
  }

  if (page === "therapy") {
    const activeMtm = activeMtmRequest;
    const activeMtmStatus = String(activeMtm?.status || "").toLowerCase();
    const showMtmSuccessState = Boolean(mtmSubmitted);
    const activeMtmScheduledAt = dateTimeValue(activeMtm, ["appointment_start", "scheduled_at", "created_at"]);
    return <div className={`customer-mobile-app ${embeddedDesktop ? "customer-desktop-embedded-page customer-therapy-desktop" : ""}`}>
      {!embeddedDesktop ? renderDrawer() : null}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        <SubscriptionGate
          allowed={subscriptionState.canAccessTherapyManagement}
          loading={subscriptionState.isLoading}
          showSuccess={subscriptionState.showSuccess}
          error={subscriptionState.actionError}
          busy={subscriptionState.isActionBusy}
          priceLabel={formatSubscriptionPriceLabel(subscriptionState.subscription)}
          onOpenMenu={() => setDrawerOpen(true)}
          onSubscribe={() => subscriptionState.launchCheckout({
            plan: "nevari_access_pro",
            frequency: "monthly",
          })}
          onContinue={async () => {
            await subscriptionState.refresh();
            subscriptionState.dismissSuccess();
          }}
        >
          <section className="therapy-content-shell">
            {embeddedDesktop ? <header className="customer-request-desktop-header customer-therapy-desktop-header">
              <span>Welcome back, {customerDisplayName}</span>
              <h1>Medication Therapy Management</h1>
            </header> : renderHeader("Medication Therapy Management")}
            <div className="customer-mobile-pill-tabs" role="tablist" aria-label="MTM tabs">
              {[
                ["request", "Request"],
                ["history", "History"]
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`customer-mobile-pill-tab ${mtmTab === id ? "active" : ""}`}
                  type="button"
                  onClick={() => setMtmTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {mtmSubmitError ? <p className="customer-mobile-alert">{mtmSubmitError}</p> : null}
            {mtmTab === "request" && mtmBookingStage === "availability" ? <MtmAvailabilityPage
              context={mtmBookingContext}
              selectedDate={mtmBookingDate}
              selectedSlot={mtmBookingSlot}
              loading={mtmBookingBusy && !mtmBookingContext}
              error={mtmBookingError}
              busy={mtmBookingBusy}
              storeTimeZone={storeTimeZone}
              onBack={() => { setMtmBookingStage("form"); setMtmStep(6); }}
              onUpdateDate={(date) => { setMtmBookingDate(date); setMtmBookingSlot(null); setMtmBookingError(""); }}
              onSelectSlot={(slot) => { setMtmBookingSlot(slot); setMtmBookingError(""); }}
              onRefresh={refreshMtmAvailability}
              onReserve={confirmMtmAvailability}
            /> : null}
            {mtmTab === "request" && mtmBookingStage === "form" && !showMtmSuccessState ? <section className="customer-mtm-mobile-flow">
              <div className="customer-mobile-step-title">Step {mtmStep} of 6 - {MTM_STEP_TITLES[mtmStep]}</div>
              {mtmStep < 5 ? <p className="customer-mobile-step-copy">Please fill out the form</p> : null}
              <div className={`customer-mobile-step-panel ${mtmAnimatingOut ? "is-out" : "is-in"}`}>
                {mtmStep === 1 ? <div className="customer-mobile-form-stack">
                  {[
                    ["Name", "name", "text", "Enter your full name"],
                    ["Age", "age", "text", "Enter your age"],
                    ["DOB", "dob", "date", ""],
                    ["Gender", "gender", "select", ""],
                    ["Marital Status", "maritalStatus", "select", ""],
                    ["Address", "address", "text", "Enter address"],
                    ["City/State", "cityState", "text", "Enter city/state"],
                    ["Phone Number", "phoneNumber", "tel", "Enter phone number"],
                    ["Emergency Contact", "emergencyContact", "tel", "Emergency contact number"],
                    ["Preferred Contact Method", "preferredContactMethod", "select", ""],
                  ].map(([label, key, type, placeholder]) => <label className="customer-mobile-field" key={label}>
                    <span>{label}:</span>
                      {type === "select" ? <select
                        value={mtmForm.patient[key]}
                        className={showMtmFieldError(key) ? "has-error" : ""}
                        onBlur={() => markMtmFieldBlurred("patient", key)}
                        onChange={(event) => updateMtmField("patient", key, event.target.value)}
                    >
                      <option value="">Select an option</option>
                      {(key === "gender" ? MTM_GENDER_OPTIONS : key === "maritalStatus" ? MTM_MARITAL_STATUS_OPTIONS : MTM_CONTACT_METHOD_OPTIONS).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select> : <input
                      type={type}
                      inputMode={key === "age" ? "numeric" : ["phoneNumber", "emergencyContact"].includes(key) ? "tel" : undefined}
                      maxLength={key === "age" ? 3 : ["phoneNumber", "emergencyContact"].includes(key) ? 11 : 500}
                      max={key === "dob" ? todayInputDate() : undefined}
                      pattern={key === "age" ? "\\d{1,3}" : ["phoneNumber", "emergencyContact"].includes(key) ? "\\d{11}" : undefined}
                        value={mtmForm.patient[key]}
                        placeholder={placeholder}
                        className={showMtmFieldError(key) ? "has-error" : ""}
                        onBlur={() => markMtmFieldBlurred("patient", key)}
                        onChange={(event) => updateMtmField("patient", key, event.target.value)}
                      />}
                      {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                  </label>)}
                </div> : null}
                {mtmStep === 2 ? <div className="customer-mobile-form-stack">
                  {[
                    ["Caregiver / Next of Kin Name", "caregiverName"],
                    ["Relationship", "relationship"],
                    ["Phone Number", "phoneNumber"],
                    ["Email Address", "emailAddress"],
                    ["Address", "address"],
                    ["Lives with Patient?", "livesWithPatient"],
                    ["Consent to Discuss Care?", "consentToDiscussCare"],
                  ].map(([label, key]) => <label className="customer-mobile-field" key={label}>
                    <span>{label}:</span>
                      {key === "relationship" || key === "livesWithPatient" || key === "consentToDiscussCare" ? <select
                        value={mtmForm.emergencyContact[key]}
                        className={showMtmFieldError(key) ? "has-error" : ""}
                        onBlur={() => markMtmFieldBlurred("emergencyContact", key)}
                        onChange={(event) => updateMtmField("emergencyContact", key, event.target.value)}
                    >
                      <option value="">Select an option</option>
                      {(key === "relationship" ? MTM_RELATIONSHIP_OPTIONS : MTM_YES_NO_OPTIONS).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select> : <input
                      type={key === "phoneNumber" ? "tel" : key === "emailAddress" ? "email" : "text"}
                      inputMode={key === "phoneNumber" ? "tel" : undefined}
                      maxLength={key === "phoneNumber" ? 11 : key === "emailAddress" ? 254 : 500}
                      pattern={key === "phoneNumber" ? "\\d{11}" : undefined}
                        value={mtmForm.emergencyContact[key]}
                        className={showMtmFieldError(key) ? "has-error" : ""}
                        onBlur={() => markMtmFieldBlurred("emergencyContact", key)}
                        onChange={(event) => updateMtmField("emergencyContact", key, event.target.value)}
                      />}
                      {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                  </label>)}
                </div> : null}
                {mtmStep === 3 ? <div className="customer-mobile-form-stack">
                  <section className="customer-mobile-form-group">
                    <p className="customer-mobile-form-group-title">Vital Signs</p>
                    {[
                      ["Height", "height"],
                      ["Weight", "weight"],
                      ["Blood Pressure", "bloodPressure"],
                      ["Blood Glucose/HbA1c", "bloodGlucoseHbA1c"],
                    ].map(([label, key]) => <label className="customer-mobile-field" key={label}>
                      <span>{label}:</span>
                        <input type="text" value={mtmForm.medicalHistory[key]} className={showMtmFieldError(key) ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("medicalHistory", key)} onChange={(event) => updateMtmField("medicalHistory", key, event.target.value)} />
                        {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                    </label>)}
                  </section>
                  <section className="customer-mobile-form-group">
                    <p className="customer-mobile-form-group-title">Medical Conditions</p>
                    {[
                      ["Primary Diagnosis", "primaryDiagnosis"],
                      ["Secondary Diagnosis", "secondaryDiagnosis"],
                    ].map(([label, key]) => <label className="customer-mobile-field" key={label}>
                      <span>{label}:</span>
                        <input type="text" value={mtmForm.medicalHistory[key]} className={showMtmFieldError(key) ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("medicalHistory", key)} onChange={(event) => updateMtmField("medicalHistory", key, event.target.value)} />
                        {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                    </label>)}
                    <label className="customer-mobile-field">
                      <span>Chronic Conditions:</span>
                      <MtmTokenInput id="mtm-chronic-conditions" value={mtmForm.medicalHistory.chronicConditions} placeholder="Enter a condition followed by a comma" hasError={showMtmFieldError("chronicConditions")} onBlur={() => markMtmFieldBlurred("medicalHistory", "chronicConditions")} onChange={(value) => updateMtmField("medicalHistory", "chronicConditions", value)} />
                      {showMtmFieldError("chronicConditions") ? <small className="customer-mobile-field-error">{mtmStepErrors.chronicConditions}</small> : null}
                    </label>
                  </section>
                  <section className="customer-mobile-form-group">
                    <p className="customer-mobile-form-group-title">Medical History</p>
                    {[
                      ["Past Medical History", "pastMedicalHistory"],
                      ["Past Surgical History", "pastSurgicalHistory"],
                    ].map(([label, key]) => <label className="customer-mobile-field" key={label}>
                      <span>{label}:</span>
                        <input type="text" value={mtmForm.medicalHistory[key]} className={showMtmFieldError(key) ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("medicalHistory", key)} onChange={(event) => updateMtmField("medicalHistory", key, event.target.value)} />
                        {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                    </label>)}
                  </section>
                  <section className="customer-mobile-form-group">
                    <p className="customer-mobile-form-group-title">Allergies</p>
                    {[["Drug Allergies", "drugAllergies", "enter a drug allegy followed by a comma"], ["Drug Intolerances", "drugIntolerances", "Enter a drug intolerance followed by a comma"]].map(([label, key, placeholder]) => <label className="customer-mobile-field" key={label}>
                      <span>{label}:</span>
                        <MtmTokenInput id={`mtm-${key}`} value={mtmForm.medicalHistory[key]} placeholder={placeholder} hasError={showMtmFieldError(key)} onBlur={() => markMtmFieldBlurred("medicalHistory", key)} onChange={(value) => updateMtmField("medicalHistory", key, value)} />
                        {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                    </label>)}
                  </section>
                  <section className="customer-mobile-form-group">
                    <p className="customer-mobile-form-group-title">Monitoring</p>
                    <label className="customer-mobile-field">
                      <span>Relevant Lab Results:</span>
                      <div className="customer-mobile-upload-row-wrap">
                        <button
                          type="button"
                          className={`customer-mobile-upload-row-button ${mtmLabResultsFiles.length ? "uploaded" : ""}`}
                          onClick={() => mtmLabResultsInputRef.current?.click()}
                        >
                          <span>Lab Results</span>
                          {mtmLabResultsFiles.length ? <span className="customer-mobile-upload-success">✓</span> : <MobileIcon name="upload-file" />}
                        </button>
                        <input
                          ref={mtmLabResultsInputRef}
                          type="file"
                          multiple
                          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                          className="customer-mobile-hidden-file"
                          onChange={handleLabResultsUpload}
                        />
                        {mtmLabResultsFiles.length ? <div className="customer-mobile-upload-meta customer-mobile-upload-meta-wrap">
                          <small className="customer-mobile-upload-filename" title={mtmLabResultsFiles.map((file) => file.name).join(", ")}>{mtmLabResultsFiles.length} file{mtmLabResultsFiles.length === 1 ? "" : "s"} selected</small>
                          <button type="button" onClick={() => mtmLabResultsInputRef.current?.click()}>Replace</button>
                          <button type="button" onClick={() => {
                            setMtmLabResultsFiles([]);
                            updateMtmField("medicalHistory", "relevantLabResults", "");
                            if (mtmLabResultsInputRef.current) mtmLabResultsInputRef.current.value = "";
                          }}>Remove</button>
                        </div> : null}
                      </div>
                      <small className="customer-mobile-field-hint">PNG, JPG, JPEG or WebP. Maximum 5MB each.</small>
                      {mtmLabResultsFiles.length ? <div className="customer-mobile-file-list">
                        {mtmLabResultsFiles.map((file) => <div key={`${file.name}-${file.size}`} className="customer-mobile-file-chip">{file.name}</div>)}
                      </div> : null}
                        {showMtmFieldError("relevantLabResults") ? <small className="customer-mobile-field-error">{mtmStepErrors.relevantLabResults}</small> : null}
                    </label>
                    <label className="customer-mobile-field">
                      <span>Clinical Monitoring Parameters:</span>
                        <input type="text" value={mtmForm.medicalHistory.clinicalMonitoringParameters} className={showMtmFieldError("clinicalMonitoringParameters") ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("medicalHistory", "clinicalMonitoringParameters")} onChange={(event) => updateMtmField("medicalHistory", "clinicalMonitoringParameters", event.target.value)} />
                        {showMtmFieldError("clinicalMonitoringParameters") ? <small className="customer-mobile-field-error">{mtmStepErrors.clinicalMonitoringParameters}</small> : null}
                    </label>
                  </section>
                </div> : null}
                {mtmStep === 4 ? <div className="customer-mobile-form-stack">
                  {mtmMedicationEntries.map((entry, index) => <section className="customer-mtm-medication-group" key={`medication-${index}`}>
                    <header className="customer-mtm-medication-group-head">
                      <div><small>Medication profile</small><strong>Medication {index + 1}</strong></div>
                      {mtmMedicationEntries.length > 1 ? <button type="button" onClick={() => removeMtmMedicationEntry(index)} aria-label={`Remove medication ${index + 1}`}>&times;</button> : null}
                    </header>
                    <label className="customer-mobile-field">
                      <span>Medication image:</span>
                      <div className="customer-mobile-upload-row-wrap">
                        <button type="button" className={`customer-mobile-upload-row-button ${entry.file ? "uploaded" : ""}`} onClick={() => mtmMedicationInputRefs.current.get(index)?.click()}>
                          <span>{entry.file ? entry.file.name : "Upload medication"}</span>
                          {entry.file ? <span className="customer-mobile-upload-success">✓</span> : <MobileIcon name="upload-file" />}
                        </button>
                        <input ref={(node) => { if (node) mtmMedicationInputRefs.current.set(index, node); else mtmMedicationInputRefs.current.delete(index); }} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="customer-mobile-hidden-file" onChange={(event) => handleMtmMedicationUpload(index, event.target.files?.[0], event.target)} />
                      </div>
                      <small className="customer-mobile-field-hint">PNG, JPG, JPEG or WebP. Maximum 5MB.</small>
                      {showMtmFieldError(`medicationImage-${index}`) ? <small className="customer-mobile-field-error">{mtmStepErrors[`medicationImage-${index}`]}</small> : null}
                    </label>
                    <label className="customer-mobile-field">
                      <span>Prescribing Doctor:</span>
                      <input type="text" value={entry.prescribingDoctor || ""} onChange={(event) => updateMtmMedicationEntry(index, "prescribingDoctor", event.target.value)} />
                    </label>
                    <label className="customer-mobile-field">
                      <span>Notes:</span>
                      <textarea rows={4} value={entry.notes || ""} onChange={(event) => updateMtmMedicationEntry(index, "notes", event.target.value)} />
                    </label>
                  </section>)}
                  {showMtmFieldError("medications") ? <small className="customer-mobile-field-error">{mtmStepErrors.medications}</small> : null}
                  <button className="customer-mtm-inline-add-medication" type="button" onClick={addMtmMedicationEntry}><span aria-hidden="true">+</span> Add another medication</button>
                  <div className="customer-mobile-subsection-title">
                    <strong>Additional Medication Information</strong>
                    <small>Answer where relevant</small>
                  </div>
                  <label className="customer-mobile-field">
                    <span>Recent Medication Changes</span>
                    <textarea rows={4} value={mtmForm.additionalInformation.recentMedicationChanges} onBlur={() => markMtmFieldBlurred("additionalInformation", "recentMedicationChanges")} onChange={(event) => updateMtmField("additionalInformation", "recentMedicationChanges", event.target.value)} />
                  </label>
                  <label className="customer-mobile-field">
                    <span>Previous Medications Stopped</span>
                    <button type="button" className={`customer-mobile-upload-row-button ${mtmPreviousMedicationFile ? "uploaded" : ""}`} onClick={() => mtmPreviousMedicationInputRef.current?.click()}>
                      <span>{mtmPreviousMedicationFile?.name || "Upload previous medication"}</span>
                      {mtmPreviousMedicationFile ? <span className="customer-mobile-upload-success">✓</span> : <MobileIcon name="upload-file" />}
                    </button>
                    <input ref={mtmPreviousMedicationInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="customer-mobile-hidden-file" onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!isAllowedMtmImageFile(file)) {
                        setMtmTouchedFields((current) => ({ ...current, previousMedicationsStopped: true }));
                        setMtmStepErrors((current) => ({ ...current, previousMedicationsStopped: "Upload PNG, JPG, JPEG, or WebP images up to 5MB." }));
                        event.target.value = "";
                        return;
                      }
                      if (!await hasValidMtmImageSignature(file)) {
                        setMtmTouchedFields((current) => ({ ...current, previousMedicationsStopped: true }));
                        setMtmStepErrors((current) => ({ ...current, previousMedicationsStopped: "Upload a valid PNG, JPG, JPEG, or WebP image up to 5MB." }));
                        event.target.value = "";
                        return;
                      }
                      const selectedImageCount = mtmMedicationEntries.filter((entry) => entry.file).length + mtmLabResultsFiles.length + 1;
                      if (selectedImageCount > 8) {
                        setMtmTouchedFields((current) => ({ ...current, previousMedicationsStopped: true }));
                        setMtmStepErrors((current) => ({ ...current, previousMedicationsStopped: "Upload no more than 8 images across the MTM assessment." }));
                        event.target.value = "";
                        return;
                      }
                      setMtmPreviousMedicationFile(file);
                      updateMtmField("additionalInformation", "previousMedicationsStopped", file.name);
                    }} />
                    <small className="customer-mobile-field-hint">PNG, JPG, JPEG or WebP. Maximum 5MB.</small>
                    {showMtmFieldError("previousMedicationsStopped") ? <small className="customer-mobile-field-error">{mtmStepErrors.previousMedicationsStopped}</small> : null}
                  </label>
                  {[["Reason for Discontinuation", "reasonForDiscontinuation", "Enter a reason followed by a comma"], ["OTC Medications", "otcMedications", "Enter an OTC medication followed by a comma"], ["Herbal Products", "herbalProducts", "Enter a herbal product followed by a comma"], ["Supplements", "supplements", "Enter a supplement followed by a comma"]].map(([label, key, placeholder]) => <label className="customer-mobile-field" key={key}>
                    <span>{label}</span>
                    <MtmTokenInput id={`mtm-${key}`} value={mtmForm.additionalInformation[key]} placeholder={placeholder} hasError={showMtmFieldError(key)} onBlur={() => markMtmFieldBlurred("additionalInformation", key)} onChange={(value) => updateMtmField("additionalInformation", key, value)} />
                    {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                  </label>)}
                </div> : null}
                {false && mtmStep === 4 ? <div className="customer-mobile-form-stack">
                  {mtmMedicationEntries.length ? <div className="customer-mobile-medication-accordion">
                    {mtmMedicationEntries.map((item, index) => <details key={`${item.medicationName}-${index}`} className="customer-mobile-medication-summary">
                      <summary>
                        <div className="customer-mobile-medication-summary-text">
                          <span>Medication {index + 1}</span>
                          <strong>{item.medicationName || "Medication"}</strong>
                        </div>
                        <button
                          className="customer-mobile-medication-remove"
                          type="button"
                          aria-label={`Remove medication ${index + 1}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeMtmMedicationEntry(index);
                          }}
                        >
                          &times;
                        </button>
                      </summary>
                      <div className="MTM-info-list">
                        <div className="info-row"><span className="MTM-info-label"> <b>Dosage: </b></span><span className="MTM-info-value">{item.dosage || "Not set"}</span></div>
                        <div className="info-row"><span className="MTM-info-label"><b>Frequency:</b> </span><span className="MTM-info-value">{item.frequency || "Not set"}</span></div>
                        <div className="info-row"><span className="MTM-info-label"><b>Route: </b>
           
                        </span><span className="MTM-info-value">{item.route || "Not set"}</span></div>
                        <div className="info-row"><span className="MTM-info-label"><b>Indication: </b></span><span className="MTM-info-value">{item.indication || "Not set"}</span></div>
                      </div>
                    </details>)}
                  </div> : null}
                  {[
                    ["Medication Name", "medicationName"],
                    ["Dosage", "dosage"],
                    ["Frequency", "frequency"],
                    ["Route", "route"],
                    ["Indication", "indication"],
                    ["Prescribing Doctor", "prescribingDoctor"],
                    ["Start Date", "startDate"],
                    ["Notes", "notes"],
                  ].map(([label, key]) => <label className="customer-mobile-field" key={label}>
                    <span>{label}:</span>
                      {key === "frequency" || key === "route" ? <select
                        value={mtmForm.medicationProfile[key]}
                        className={showMtmFieldError(key) ? "has-error" : ""}
                        onBlur={() => markMtmFieldBlurred("medicationProfile", key)}
                        onChange={(event) => updateMtmField("medicationProfile", key, event.target.value)}
                    >
                      <option value="">Select an option</option>
                      {(key === "frequency" ? MTM_FREQUENCY_OPTIONS : MTM_ROUTE_OPTIONS).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                      </select> : <input type={key === "startDate" ? "date" : "text"} max={key === "startDate" ? todayInputDate() : undefined} value={mtmForm.medicationProfile[key]} className={showMtmFieldError(key) ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("medicationProfile", key)} onChange={(event) => updateMtmField("medicationProfile", key, event.target.value)} />}
                      {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                  </label>)}
                    {showMtmFieldError("medications") ? <small className="customer-mobile-field-error">{mtmStepErrors.medications}</small> : null}
                  <div className="customer-mobile-subsection-title">
                    <strong>Additional Medication Information</strong>
                    <small>Answer where relevant</small>
                  </div>
                  {[
                    ["Recent Medication Changes", "recentMedicationChanges"],
                    ["Previous Medications Stopped", "previousMedicationsStopped"],
                    ["Reason for Discontinuation", "reasonForDiscontinuation"],
                    ["OTC Medications", "otcMedications"],
                    ["Herbal Products", "herbalProducts"],
                    ["Supplements", "supplements"],
                  ].map(([label, key]) => <label className="customer-mobile-field" key={label}>
                    <span>{label}</span>
                      <textarea rows={4} value={mtmForm.additionalInformation[key]} className={showMtmFieldError(key) ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("additionalInformation", key)} onChange={(event) => updateMtmField("additionalInformation", key, event.target.value)} />
                      {showMtmFieldError(key) ? <small className="customer-mobile-field-error">{mtmStepErrors[key]}</small> : null}
                  </label>)}
                </div> : null}
                {mtmStep === 5 ? <div className="customer-mobile-flow-stack">
                  <p className="customer-mobile-step-copy">Identify why medications may not be working.</p>
                  <div className="customer-mobile-subsection-title">
                    <strong>Adherence Barriers</strong>
                    <small>Please select as appropriate</small>
                  </div>
                  {MTM_ADHERENCE_OPTIONS.map((option) => {
                    const selected = mtmForm.adherenceAssessment.barriers.includes(option);
                    return <button key={option} type="button" className={`customer-mobile-option-row ${selected ? "active" : ""}`} onClick={() => toggleMtmBarrier(option)}>
                      <span>{option}</span>
                      <span className={`customer-mobile-radio ${selected ? "selected" : ""}`} aria-hidden="true" />
                    </button>;
                  })}
                  {mtmForm.adherenceAssessment.barriers.includes("Other") ? <label className="customer-mobile-field">
                    <span>Other barrier:</span>
                      <input type="text" value={mtmForm.adherenceAssessment.other} className={showMtmFieldError("other") ? "has-error" : ""} onBlur={() => markMtmFieldBlurred("adherenceAssessment", "other")} onChange={(event) => updateMtmField("adherenceAssessment", "other", event.target.value)} />
                  </label> : null}
                </div> : null}
                {mtmStep === 6 ? <div className="customer-mobile-form-stack customer-mtm-review">
                  <header className="customer-mtm-review-intro">
                    <small>Final check</small>
                    <h3>Review your MTM assessment</h3>
                    <p>Please confirm these details are correct before selecting your pharmacist availability.</p>
                  </header>
                  <section className="customer-mtm-review-card">
                    <div className="customer-mtm-review-card-head"><div><small>Step 1</small><h4>Patient details</h4></div><button type="button" onClick={() => transitionToMtmStep(1)}>Edit</button></div>
                    <dl><div><dt>Full name</dt><dd>{mtmForm.patient.name || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{mtmForm.patient.phoneNumber || "Not provided"}</dd></div><div><dt>Address</dt><dd>{mtmForm.patient.address || "Not provided"}</dd></div><div><dt>Preferred contact</dt><dd>{mtmForm.patient.preferredContactMethod || "Not provided"}</dd></div></dl>
                  </section>
                  <section className="customer-mtm-review-card">
                    <div className="customer-mtm-review-card-head"><div><small>Step 2</small><h4>Caregiver or next of kin</h4></div><button type="button" onClick={() => transitionToMtmStep(2)}>Edit</button></div>
                    {mtmSkipsClinicalSections(mtmForm) ? <><dl><div><dt>Consent to discuss care</dt><dd>No</dd></div></dl><p className="customer-mtm-review-skip-note">Clinical history, medication profile, monitoring, allergies, and adherence sections were skipped.</p></> : <dl><div><dt>Name</dt><dd>{mtmForm.emergencyContact.caregiverName || "Not provided"}</dd></div><div><dt>Relationship</dt><dd>{mtmForm.emergencyContact.relationship || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{mtmForm.emergencyContact.phoneNumber || "Not provided"}</dd></div><div><dt>Consent to discuss care</dt><dd>{mtmForm.emergencyContact.consentToDiscussCare || "Not provided"}</dd></div></dl>}
                  </section>
                  {!mtmSkipsClinicalSections(mtmForm) ? <section className="customer-mtm-review-card">
                    <div className="customer-mtm-review-card-head"><div><small>Step 3</small><h4>Clinical history</h4></div><button type="button" onClick={() => transitionToMtmStep(3)}>Edit</button></div>
                    <dl><div><dt>Primary diagnosis</dt><dd>{mtmForm.medicalHistory.primaryDiagnosis || "Not provided"}</dd></div></dl>
                    {[...["chronicConditions", "drugAllergies", "drugIntolerances"]].map((key) => normalizeCustomerHealthChipList(mtmForm.medicalHistory[key]).length ? <div className="customer-mtm-review-token-row" key={key}><strong>{titleCase(key.replace(/([A-Z])/g, " $1"))}</strong><div>{normalizeCustomerHealthChipList(mtmForm.medicalHistory[key]).map((token) => <span className="customer-mtm-token" key={token}>{token}</span>)}</div></div> : null)}
                  </section> : null}
                  {!mtmSkipsClinicalSections(mtmForm) ? <section className="customer-mtm-review-card">
                    <div className="customer-mtm-review-card-head"><div><small>Step 4</small><h4>Medication documents</h4></div><button type="button" onClick={() => transitionToMtmStep(4)}>Edit</button></div>
                    <ul className="customer-mtm-review-files">{mtmMedicationEntries.map((entry, index) => <li key={`review-med-${index}`}><MobileIcon name="upload-file" /><span><strong>Medication {index + 1}</strong><small>{entry.file?.name || "Image missing"} · {entry.prescribingDoctor || "Doctor not provided"}</small></span></li>)}{mtmPreviousMedicationFile ? <li><MobileIcon name="upload-file" /><span><strong>Previous Medication Stopped</strong><small>{mtmPreviousMedicationFile.name}</small></span></li> : null}{mtmLabResultsFiles.map((file, index) => <li key={`review-lab-${index}`}><MobileIcon name="upload-file" /><span><strong>Relevant Lab Result {index + 1}</strong><small>{file.name}</small></span></li>)}</ul>
                  </section> : null}
                  {!mtmSkipsClinicalSections(mtmForm) ? <section className="customer-mtm-review-card">
                    <div className="customer-mtm-review-card-head"><div><small>Step 5</small><h4>Adherence</h4></div><button type="button" onClick={() => transitionToMtmStep(5)}>Edit</button></div>
                    <div className="customer-mtm-review-token-row"><strong>Selected barriers</strong><div>{mtmForm.adherenceAssessment.barriers.length ? mtmForm.adherenceAssessment.barriers.map((barrier) => <span className="customer-mtm-token" key={barrier}>{barrier}</span>) : <span>None selected</span>}</div></div>
                  </section> : null}
                </div> : null}
                {false && mtmStep === 6 ? <div className="customer-mobile-form-stack">
                  <div className="detail-card info-list">
                    <div className="info-row"><span className="info-label">Name</span><span className="info-value">{mtmForm.patient.name || "Not set"}</span></div>
                    <div className="info-row"><span className="info-label">Primary Diagnosis</span><span className="info-value">{mtmForm.medicalHistory.primaryDiagnosis || "Not set"}</span></div>
                    <div className="info-row"><span className="info-label">Medication</span><span className="info-value">{mtmMedicationEntries.length ? `${mtmMedicationEntries.length} added` : (mtmForm.medicationProfile.medicationName || "Not set")}</span></div>
                    <div className="info-row"><span className="info-label">Adherence Barriers</span><span className="info-value">{mtmForm.adherenceAssessment.barriers.length ? mtmForm.adherenceAssessment.barriers.join(", ") : "None selected"}</span></div>
                  </div>
                </div> : null}
              </div>
                {showMtmFieldError("barriers") ? <small className="customer-mobile-field-error">{mtmStepErrors.barriers}</small> : null}
                {showMtmFieldError("reasonForDiscontinuation") ? <small className="customer-mobile-field-error">{mtmStepErrors.reasonForDiscontinuation}</small> : null}
              {mtmSnackbar ? <div className="customer-mobile-snackbar" role="status" aria-live="polite">{mtmSnackbar}</div> : null}
              <div className="customer-mobile-sticky-actions customer-mtm-sticky-actions">
                <button className="customer-mobile-primary-button" type="button" disabled={mtmSubmitting} onClick={() => {
                  if (mtmStep < 6) {
                    if (!validateMtmStep(mtmStep)) return;
                    transitionToMtmStep(mtmStep === 2 && mtmSkipsClinicalSections(mtmForm) ? 6 : mtmStep + 1);
                    return;
                  }
                  if (mtmLatestRequest?.id && mtmBookingContext) {
                    setMtmBookingStage("availability");
                    return;
                  }
                  submitMtmRequest();
                }}>{mtmSubmitting ? <BrandedSpinner label="Preparing availability" /> : (mtmStep < 6 ? "Continue" : "Select Availability")}</button>
                {mtmStep > 1 ? <button className="customer-mobile-secondary-button" type="button" onClick={() => transitionToMtmStep(mtmStep === 6 && mtmSkipsClinicalSections(mtmForm) ? 2 : Math.max(1, mtmStep - 1))}>Go Back</button> : null}
              </div>
            </section> : null}
            {mtmTab === "request" && showMtmSuccessState && mtmBookingStage === "success" ? <div className="customer-confirmation-modal customer-mtm-success-modal" role="dialog" aria-modal="true" aria-labelledby="mtm-success-title">
              <section className="customer-flow-status-card customer-flow-status-card-mtm is-success customer-mobile-full-therapy-shell customer-mtm-success-shell">
                <header className="customer-flow-status-head">
                  <CustomerStatusIcon tone="success" type="check" />
                  <h2 id="mtm-success-title">{mtmLoadingState ? "Reserving availability..." : "MTM availability selected successfully"}</h2>
                  {!mtmLoadingState ? <p>Your 30-minute pharmacist slot is reserved pending clinical approval.</p> : null}
                </header>
                {!mtmLoadingState ? <section className="customer-flow-status-panel customer-flow-status-panel-accent" aria-label="MTM request summary">
                  
                  <CustomerStatusKeyValueList rows={[
                    { label: "Request ID", value: activeMtm?.request_reference || `MTM-${String(activeMtm?.id || "").padStart(6, "0")}` },
                    { label: "Status", value: titleCase(activeMtmStatus || "submitted") },
                    { label: "Assigned Pharmacist", value: activeMtm?.assigned_pharmacist_name || (activeMtm?.assigned_pharmacist_user_id ? `Pharmacist #${activeMtm.assigned_pharmacist_user_id}` : "Pending assignment") },
                    { label: "Selected Availability", value: activeMtm?.slot_reservation?.start_at ? formatAppointmentListDateTime(activeMtm.slot_reservation.start_at, storeTimeZone) : "Reserved" },
                    { label: "Response Time", value: "Within 24 hours" },
                  ]} />
                </section> : null}
                {!mtmLoadingState ? <div className="customer-flow-status-note">
                  <p><strong>Next step:</strong> your pharmacist will review your medication details and follow up if extra information is needed.</p>
                </div> : null}
                {!mtmLoadingState ? <CustomerStatusActions>
                  <button className="customer-mobile-primary-button" type="button" onClick={() => {
                    void mtmRequestsQuery.mutate();
                    const nextHistoryRequestId = activeMtm?.id || mtmLatestRequest?.id;
                    if (nextHistoryRequestId) {
                      openMtmHistoryRequest(nextHistoryRequestId);
                      return;
                    }
                    setMtmSubmitted(false);
                    setMtmStep(1);
                  }}>View Request Status</button>
                  <button className="customer-mobile-secondary-button" type="button" onClick={() => goToPage("overview")}>Back to Dashboard</button>
                </CustomerStatusActions> : null}
                
              </section>
            </div> : null}
            {mtmTab === "history" ? <section className="customer-mobile-list-section customer-mobile-appointment-pane">
              {mtmRequestsQuery.isLoading ? Array.from({ length: 3 }, (_, index) => <article className="customer-mobile-visit-row skeleton-panel" key={`customer-mobile-mtm-skeleton-${index}`}>
                <div className="customer-mobile-clock skeleton-circle skeleton-circle-sm" />
                <div className="customer-mobile-visit-copy">
                  <SkeletonBox className="skeleton-line skeleton-line-md" />
                  <SkeletonBox className="skeleton-line skeleton-line-sm" />
                </div>
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </article>) : mtmHistoryRequests.length ? mtmHistoryRequests.map((request, index) => {
                const scheduledAt = request?.appointment_start || request?.scheduled_at || request?.created_at;
                const status = String(request?.status || "submitted").replace(/[_-]+/g, " ");
                const pharmacistLabel = request?.assigned_pharmacist_name || (request?.assigned_pharmacist_user_id ? `Pharmacist #${request.assigned_pharmacist_user_id}` : "Reviewing pharmacist pending");
                const isSelected = String(request?.id || "") === String(mtmSelectedRequestId || activeMtm?.id || "");
                return <article
                  className={`customer-mobile-visit-row ${isSelected ? "is-active" : ""}`}
                  key={request?.id || `mtm-visit-${index}`}
                  ref={(node) => {
                    const key = String(request?.id || "");
                    if (!key) return;
                    if (node) {
                      mtmHistoryRequestRefs.current.set(key, node);
                    } else {
                      mtmHistoryRequestRefs.current.delete(key);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  onClick={() => openMtmHistoryRequest(request?.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMtmHistoryRequest(request?.id);
                    }
                  }}
                >
                  <div className="customer-mobile-clock">
                    <MobileIcon name="clock" />
                  </div>
                  <div className="customer-mobile-visit-copy">
                    <strong>{request?.request_reference || request?.patient?.name || request?.patient?.fullName || "MTM Consultation"}</strong>
                    <span>{formatAppointmentListDateTime(scheduledAt, storeTimeZone)}</span>
                    <small>{pharmacistLabel}</small>
                  </div>
                  <div className="customer-mobile-appointment-status">
                    <div className="appointment-status-stack">
                      <span className={`chip processing ${isSelected ? "active" : ""}`}><span className="chip-dot" />{titleCase(status)}</span>
                    </div>
                  </div>
                </article>;
              }) : <CustomerMobileEmptyState
                message="No MTM history yet"
                ctaLabel="Request MTM"
                onCta={() => setMtmTab("request")}
                icon="appointments"
                illustrationSrc="/group-3.png"
              />}
              {mtmModalRequest ? <MtmRequestDetailsModal
                request={mtmModalRequest}
                storeTimeZone={storeTimeZone}
                session={session}
                busy={mtmRescheduleBusyId === String(mtmModalRequest.id || "")}
                onRequestReschedule={handleMtmRescheduleRequest}
                onClose={() => setMtmHistoryModalRequestId("")}
              /> : null}
            </section> : null}
          </section>
        </SubscriptionGate>
      </main>
    </div>;
  }

  if (page === "subscription-management") {
    return <div className="customer-mobile-app customer-subscription-management-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        <CustomerSubscriptionManagementScreen onOpenMenu={() => setDrawerOpen(true)} subscriptionState={subscriptionState} />
      </main>
    </div>;
  }

  if (page === "profile" || page === "settings") {
    return <div className="customer-mobile-app customer-profile-mobile-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        {renderHeader("Profile")}
        {stateError ? <p className="customer-mobile-alert">{stateError}</p> : null}
        <div className="customer-mobile-profile-tabs" role="tablist" aria-label="Profile tabs">
          {[
            { id: "user", label: "User" },
            { id: "notifications", label: "Notification Settings" }
          ].map((item) => (
            <button
              key={item.id}
              className={`customer-mobile-pill-tab ${profileTab === item.id ? "active" : ""}`}
              type="button"
              onClick={() => setProfileTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {profileTab === "user" ? <section className="customer-mobile-panel customer-profile-mobile-panel">
          <section className="customer-profile-mobile-hero" aria-label="Profile photo">
            <CustomerProfilePhotoWidget profile={resolvedProfile} displayName={customerDisplayName} uploading={profileImageSaving} refreshing={profileImageRefreshing} error={profileImageError} success={profileImageSuccess} cooldownUntil={profileImageCooldownUntil} inputRef={profileImageInputRef} onSelect={handleProfileImageSelected} onOpen={() => profileImageInputRef.current?.click()} />
          </section>
          <section className="customer-profile-mobile-section customer-profile-mobile-subscription-section">
          <ManageSubscription
            profileVariant
            subscription={subscriptionState.subscription}
            loading={subscriptionState.isLoading}
            busy={subscriptionState.isActionBusy}
            error={subscriptionState.actionError}
            onUpgrade={() => subscriptionState.launchCheckout({
              plan: "nevari_access_pro",
              frequency: "monthly",
            })}
            onPause={async () => {
              await subscriptionState.pauseCurrentSubscription();
            }}
            onCancel={async () => {
              await subscriptionState.cancelCurrentSubscription();
            }}
            onView={() => setPage("subscription-management")}
          />
          </section>
          <section className="customer-profile-mobile-section customer-profile-mobile-personal-section">
          <div className="customer-profile-card-head">
            <div>
              <span>Personal Details</span>
              
            </div>
          </div>
          <label className="customer-mobile-field">
            <span>Display Name:</span>
            <input value={mobileProfileDraft.displayName} readOnly={false} className={(mobileProfileErrors.displayName || showCustomerSettingsFieldError("displayName")) ? "has-error" : ""} placeholder={profile.display_name || "Tee Godwin"} onChange={(event) => setMobileProfileDraft((current) => ({ ...current, displayName: sanitizeClientText(event.target.value, { max: 120 }) }))} />
            {mobileProfileErrors.displayName ? <small className="customer-mobile-field-error">{mobileProfileErrors.displayName}</small> : null}
          </label>

          <label className="customer-mobile-field">
            <span>Phone Number:</span>
            <input type="tel" inputMode="tel" maxLength={11} value={mobileProfileDraft.phone} readOnly={false} className={mobileProfileErrors.phone ? "has-error" : ""} placeholder="+234 000 000 0000" onChange={(event) => setMobileProfileDraft((current) => ({ ...current, phone: normalizeMtmPhoneNumber(event.target.value) }))} />
            {mobileProfileErrors.phone ? <small className="customer-mobile-field-error">{mobileProfileErrors.phone}</small> : null}
          </label>
          <label className="customer-mobile-field">
            <span>Address:</span>
            <input value={mobileProfileDraft.address} readOnly={false} className={mobileProfileErrors.address ? "has-error" : ""} placeholder="No. 1, Example Street" onChange={(event) => setMobileProfileDraft((current) => ({ ...current, address: sanitizeClientText(event.target.value, { max: 200 }) }))} />
            {mobileProfileErrors.address ? <small className="customer-mobile-field-error">{mobileProfileErrors.address}</small> : null}
          </label>
          <label className="customer-mobile-field">
            <span>Email:</span>
            <input type="email" inputMode="email" value={mobileProfileDraft.email} className={mobileProfileErrors.email ? "has-error" : ""} onChange={(event) => setMobileProfileDraft((current) => ({ ...current, email: sanitizeClientText(event.target.value, { max: 254 }).replace(/\s+/g, "") }))} />
            {mobileProfileErrors.email ? <small className="customer-mobile-field-error">{mobileProfileErrors.email}</small> : null}
          </label>
          {customerSettingsSaveStatus === "saving" ? <small className="customer-mobile-save-status">Saving profile...</small> : null}
          {customerSettingsSaveStatus === "saved" ? <small className="customer-mobile-save-success">Profile saved.</small> : null}
          {customerSettingsSaveStatus === "error" && customerSettingsSaveError ? <small className="customer-mobile-field-error">{customerSettingsSaveError}</small> : null}
          {mobileProfileDirty ? <div className="customer-profile-inline-actions"><button type="button" className="pill-button tertiary" onClick={() => { setMobileProfileDraft(normalizeCustomerSettingsPayload(settings)); setMobileProfileErrors({}); }} disabled={customerSettingsSaveStatus === "saving"}>Cancel</button><button type="button" className="pill-button" onClick={() => { void saveMobileProfileChanges(); }} disabled={customerSettingsSaveStatus === "saving"}>{customerSettingsSaveStatus === "saving" ? <span className="appointment-cta-spinner" aria-label="Saving profile" /> : "Save Changes"}</button></div> : null}
          </section>
          <article className="customer-profile-mobile-section customer-profile-card customer-mobile-health-card customer-profile-mobile-health-card">
            <div className="customer-profile-card-head">
              <div>
                <span>Key Health Records</span>
              </div>
            </div>
            
            <div className="customer-profile-mobile-health-form">
              <label className="customer-profile-mobile-health-field"><span>Blood group</span><select value={mobileHealthDraft.bloodGroup} onChange={(event) => updateMobileHealthDraft("bloodGroup", event.target.value)}><option value="">Not added</option>{CUSTOMER_HEALTH_BLOOD_GROUP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>{mobileHealthErrors.bloodGroup ? <small className="customer-mobile-field-error">{mobileHealthErrors.bloodGroup}</small> : null}</label>
              <label className="customer-profile-mobile-health-field"><span>Genotype</span><select value={mobileHealthDraft.genotype} onChange={(event) => updateMobileHealthDraft("genotype", event.target.value)}><option value="">Not added</option>{CUSTOMER_HEALTH_GENOTYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>{mobileHealthErrors.genotype ? <small className="customer-mobile-field-error">{mobileHealthErrors.genotype}</small> : null}</label>
              {[["allergies", "Allergies"], ["currentMedications", "Current medications"], ["existingConditions", "Existing conditions"]].map(([key, label]) => renderMobileHealthChipField(key, label))}
              <label className="customer-profile-mobile-health-field"><span>Emergency contact name</span><input value={mobileHealthDraft.emergencyContactName} placeholder="Not added" onChange={(event) => updateMobileHealthDraft("emergencyContactName", sanitizeClientText(event.target.value, { max: 120 }))} /></label>
              <label className="customer-profile-mobile-health-field"><span>Emergency contact phone number</span><input type="tel" inputMode="tel" maxLength={11} value={mobileHealthDraft.emergencyContactPhoneNumber} placeholder="Not added" onChange={(event) => updateMobileHealthDraft("emergencyContactPhoneNumber", normalizeMtmPhoneNumber(event.target.value))} />{mobileHealthErrors.emergencyContactPhoneNumber ? <small className="customer-mobile-field-error">{mobileHealthErrors.emergencyContactPhoneNumber}</small> : null}</label>
            </div>
            {customerSettingsSaveStatus === "saving" ? <small className="customer-mobile-save-status">Saving health records...</small> : null}
            {customerSettingsSaveStatus === "saved" ? <small className="customer-mobile-save-success">Health records saved.</small> : null}
            {customerSettingsSaveStatus === "error" && customerSettingsSaveError ? <small className="customer-mobile-field-error">{customerSettingsSaveError}</small> : null}
            {mobileHealthDirty ? <div className="customer-profile-mobile-health-actions"><button type="button" className="pill-button tertiary" onClick={() => { setMobileHealthDraft(normalizeCustomerSettingsPayload(settings)); setMobileHealthErrors({}); }} disabled={customerSettingsSaveStatus === "saving"}>Cancel</button><button type="button" className="pill-button" onClick={() => { void saveMobileHealthRecords(); }} disabled={customerSettingsSaveStatus === "saving"}>{customerSettingsSaveStatus === "saving" ? <span className="appointment-cta-spinner" aria-label="Saving health records" /> : "Save health records"}</button></div> : null}
          </article>
        </section> : <section className="customer-mobile-panel customer-mobile-toggle-panel customer-profile-mobile-notification-panel">
          {CUSTOMER_NOTIFICATION_OPTIONS.map(([key, label]) => (
            <label className="customer-mobile-toggle-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(settings[key])}
                onChange={(event) => {
                  handleCustomerNotificationToggle(key, event.target.checked);
                }}
              />
            </label>
          ))}
          {customerSettingsSaveStatus === "saving" ? <small className="customer-mobile-save-status">Saving profile...</small> : null}
          {customerSettingsSaveStatus === "saved" ? <small className="customer-mobile-save-success">Profile saved.</small> : null}
          {customerSettingsSaveStatus === "error" && customerSettingsSaveError ? <small className="customer-mobile-field-error">{customerSettingsSaveError}</small> : null}
        </section>}
      </main>
    </div>;
  }

  if (page === "iv-therapy") {
    return <div className={`customer-mobile-app ${embeddedDesktop ? "customer-desktop-embedded-page customer-iv-therapy-desktop" : ""}`}>
      {!embeddedDesktop ? renderDrawer() : null}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>IV Therapy (Wellness infusions)</h1>
        </header> : renderHeader("IV Therapy (Wellness infusions)")}
        <section className="customer-mobile-flow customer-iv-therapy-shell">
          {!ivTherapySubmitted ? <>
            <div className="customer-mobile-step-title">Step {ivTherapyStep} of 5 - {IV_THERAPY_STEP_TITLES[ivTherapyStep] || "IV Therapy"}</div>
            <p className="customer-mobile-step-copy">{ivTherapyStep === 3 ? "Please select the type(s) of IV therapy you are interested in." : "Please fill out the IV therapy form."}</p>
            <div className={`customer-mobile-step-panel customer-iv-therapy-panel ${ivTherapyAnimatingOut ? "is-out" : "is-in"}`}>
              {ivTherapyStep === 1 ? <div className="customer-mobile-form-stack customer-iv-therapy-stack">
                {[
                  ["Name:", "name", "Enter your full name", "text"],
                  ["Address:", "address", "Enter your address", "text"],
                  ["Phone Number:", "phoneNumber", "Enter your phone number", "tel"]
                ].map(([label, key, placeholder, type]) => <label className="customer-mobile-field" key={key}>
                  <span>{label}</span>
                  <input
                    type={type}
                    value={ivTherapyForm.patient[key]}
                    placeholder={placeholder}
                    className={showIvTherapyFieldError(key) ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", key, event.target.value)}
                  />
                  {showIvTherapyFieldError(key) ? <small className="customer-mobile-field-error">{ivTherapyStepErrors[key]}</small> : null}
                </label>)}
                <label className="customer-mobile-field">
                  <span>State:</span>
                  <input
                    list="customer-iv-therapy-state-options"
                    value={ivTherapyForm.patient.state}
                    placeholder="Search state"
                    className={showIvTherapyFieldError("state") ? "has-error" : ""}
                    onChange={(event) => {
                      const nextState = event.target.value;
                      updateIvTherapyField("patient", "state", nextState);
                      if (!citiesForNigeriaState(nextState).includes(ivTherapyForm.patient.city)) {
                        updateIvTherapyField("patient", "city", "");
                      }
                    }}
                  />
                  <datalist id="customer-iv-therapy-state-options">
                    {NIGERIA_STATES.map((state) => <option key={state} value={state} />)}
                  </datalist>
                  {showIvTherapyFieldError("state") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.state}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>City:</span>
                  <input
                    list="customer-iv-therapy-city-options"
                    value={ivTherapyForm.patient.city}
                    placeholder={ivTherapyForm.patient.state ? "Search city" : "Select state first"}
                    className={showIvTherapyFieldError("city") ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", "city", event.target.value)}
                  />
                  <datalist id="customer-iv-therapy-city-options">
                    {ivTherapyAvailableCities.map((city) => <option key={city} value={city} />)}
                  </datalist>
                  {showIvTherapyFieldError("city") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.city}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Gender:</span>
                  <select
                    value={ivTherapyForm.patient.gender}
                    className={showIvTherapyFieldError("gender") ? "has-error" : ""}
                    onChange={(event) => updateIvTherapyField("patient", "gender", event.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                  {showIvTherapyFieldError("gender") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.gender}</small> : null}
                </label>
              </div> : null}

              {ivTherapyStep === 2 ? <div className="customer-mobile-form-stack customer-iv-therapy-stack">
                {[
                  ["Do you have any chronic medical conditions? (e.g., diabetes, heart disease, kidney issues)", "chronicConditions", "chronicConditionsDetails", "If yes, please specify:"],
                  ["Are you currently taking any medications?", "currentMedications", "currentMedicationsDetails", "If yes, please specify:"],
                  ["Do you have any allergies (medications, food, supplements)?", "allergies", "allergiesDetails", "If yes, please specify:"],
                  ["Have you ever had an I.V. therapy before?", "priorIvTherapy", "priorIvTherapyDetails", "If yes, when and what type?"],
                  ["Do you have a history of blood clots or vein issues?", "bloodClotHistory", "", ""]
                ].map(([label, key, detailKey, detailLabel]) => <div className="customer-mobile-radio-group customer-iv-therapy-question" key={key}>
                  <span>{label}</span>
                  <div className="customer-mobile-inline-radios customer-iv-therapy-inline-radios">
                    {IV_THERAPY_YES_NO_OPTIONS.map((choice) => <label key={choice}>
                      <input
                        type="radio"
                        name={key}
                        checked={ivTherapyForm.clinicalHistory[key] === choice}
                        onChange={() => updateIvTherapyField("clinicalHistory", key, choice)}
                      />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {choice}
                    </label>)}
                  </div>
                  {showIvTherapyFieldError(key) ? <small className="customer-mobile-field-error">{ivTherapyStepErrors[key]}</small> : null}
                  {detailKey ? <>
                    <label className="customer-mobile-field customer-iv-therapy-detail-field">
                      <span>{detailLabel}</span>
                      <textarea
                        rows={5}
                        value={ivTherapyForm.clinicalHistory[detailKey]}
                        className={showIvTherapyFieldError(detailKey) ? "has-error" : ""}
                        onChange={(event) => updateIvTherapyField("clinicalHistory", detailKey, event.target.value)}
                      />
                    </label>
                    {showIvTherapyFieldError(detailKey) ? <small className="customer-mobile-field-error">{ivTherapyStepErrors[detailKey]}</small> : null}
                  </> : null}
                </div>)}
              </div> : null}

              {ivTherapyStep === 3 ? <div className="customer-mobile-flow-stack customer-iv-therapy-options">
                <label className="customer-mobile-field customer-iv-therapy-selection-note">
                  <span>Type of I.V. Therapy:</span>
                  <small>You may select more than one.</small>
                </label>
                {IV_THERAPY_OPTIONS.map((option) => {
                  const selected = ivTherapyForm.therapyTypes.includes(option);
                  return <button key={option} type="button" className={`customer-mobile-option-row customer-iv-therapy-option ${selected ? "active" : ""}`} onClick={() => toggleIvTherapyType(option)}>
                    <span>{option}</span>
                    <span className={`customer-mobile-radio ${selected ? "selected" : ""}`} aria-hidden="true" />
                  </button>;
                })}
                {showIvTherapyFieldError("therapyTypes") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.therapyTypes}</small> : null}
              </div> : null}

              {ivTherapyStep === 4 ? <div className="customer-mobile-form-stack customer-iv-therapy-stack">
                <label className="customer-mobile-field">
                  <span>What is your main reason for seeking I.V. therapy?</span>
                  <textarea rows={5} value={ivTherapyForm.goals.primaryReason} className={showIvTherapyFieldError("primaryReason") ? "has-error" : ""} onChange={(event) => updateIvTherapyField("goals", "primaryReason", event.target.value)} />
                  {showIvTherapyFieldError("primaryReason") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.primaryReason}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>What results do you hope to achieve?</span>
                  <textarea rows={5} value={ivTherapyForm.goals.expectedResults} className={showIvTherapyFieldError("expectedResults") ? "has-error" : ""} onChange={(event) => updateIvTherapyField("goals", "expectedResults", event.target.value)} />
                  {showIvTherapyFieldError("expectedResults") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.expectedResults}</small> : null}
                </label>
              </div> : null}

              {ivTherapyStep === 5 ? <div className="customer-mobile-form-stack customer-iv-therapy-stack">
                <div className="customer-mobile-radio-group customer-iv-therapy-question">
                  <span>I confirm that the information provided is accurate and I consent to receiving I.V. therapy as selected.</span>
                  <div className="customer-mobile-inline-radios customer-iv-therapy-inline-radios">
                    {IV_THERAPY_YES_NO_OPTIONS.map((choice) => <label key={choice}>
                      <input
                        type="radio"
                        name="iv-therapy-consent"
                        checked={ivTherapyForm.consent === choice}
                        onChange={() => setIvTherapyConsent(choice)}
                      />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {choice}
                    </label>)}
                  </div>
                  {showIvTherapyFieldError("consent") ? <small className="customer-mobile-field-error">{ivTherapyStepErrors.consent}</small> : null}
                </div>
              </div> : null}
            </div>
            <button className="customer-mobile-primary-button customer-iv-therapy-button" type="button" onClick={handleIvTherapyContinue}>
              {ivTherapySubmitting ? <BrandedSpinner label="Submitting IV therapy request" /> : "Continue"}
            </button>
            {ivTherapySubmitError ? <small className="customer-mobile-field-error">{ivTherapySubmitError}</small> : null}
            {ivTherapyStep > 1 ? <button className="customer-mobile-secondary-button customer-iv-therapy-button secondary" type="button" onClick={() => transitionToIvTherapyStep(Math.max(1, ivTherapyStep - 1))}>Go Back</button> : null}
          </> : <div className="customer-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="iv-therapy-confirmation-title">
            <section className="customer-mobile-panel customer-mobile-submit-state customer-confirmation-shell customer-nurse-request-confirmation-shell">
              <div className="customer-confirmation-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#22A06B" strokeWidth="2" /><path d="M16 24L22 30L32 18" stroke="#22A06B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 id="iv-therapy-confirmation-title">IV Therapy Request Submitted</h2>
              <p>Your IV therapy request has been received. The care team will review it and contact you with the next steps.</p>
              <div className="customer-confirmation-next">
                <h3>Submission summary</h3>
                <div className="customer-confirmation-next-row"><span>Request</span><strong>{ivTherapyLatestRequest?.request_reference || ivTherapyLatestRequest?.requestReference || "IV Therapy"}</strong></div>
                <div className="customer-confirmation-next-row"><span>Status</span><strong className="badge">Submitted</strong></div>
                <div className="customer-confirmation-next-row"><span>Therapies</span><strong>{ivTherapyForm.therapyTypes.length || 0} selected</strong></div>
              </div>
              <button className="customer-mobile-primary-button" type="button" onClick={() => goToPage("overview")}>Back to Home</button>
            </section>
          </div>}
        </section>
      </main>
    </div>;
  }

  if (page === "request") {
    const monthLabel = appointmentComposerMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const monthStart = new Date(appointmentComposerMonth.getFullYear(), appointmentComposerMonth.getMonth(), 1);
    const monthEnd = new Date(appointmentComposerMonth.getFullYear(), appointmentComposerMonth.getMonth() + 1, 0);
    const leadingDays = monthStart.getDay();
    const daysInMonth = monthEnd.getDate();
    const calendarCells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
      const dayNumber = index - leadingDays + 1;
      return dayNumber > 0 ? dayNumber : null;
    });

    return <div className={`customer-mobile-app ${embeddedDesktop ? "customer-desktop-embedded-page customer-request-page-desktop" : ""}`}>
      {!embeddedDesktop ? renderDrawer() : null}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
          <span>Welcome back, {customerDisplayName}</span>
          <h1>Request a Nurse</h1>
        </header> : renderHeader(
          showNurseRequestFlow ? "Request a Nurse" : "Appointments",
          false,
          onResetJourney,
          null
        )}
        <div className={showNurseRequestFlow ? "customer-request-tabs" : "customer-mobile-appointment-tabs"} role="tablist" aria-label={showNurseRequestFlow ? "Nurse request tabs" : "Appointment tabs"}>
          {(showNurseRequestFlow ? [
            ["request", "Request"],
            ["upcoming", "Upcoming Visits"],
            ["previous", "Previous Visits"]
          ] : [
            ["upcoming", "Upcoming"],
            ["previous", "Previous"],
            ["all", "All"]
          ]).map(([id, label]) => <button
            key={id}
            className={`customer-mobile-pill-tab ${appointmentTab === id ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={appointmentTab === id}
            onClick={() => setAppointmentTab(id)}
          >{label}</button>)}
        </div>
        {stateError ? <p className="customer-mobile-alert">{stateError}</p> : null}
        {showNurseRequestFlow && appointmentTab === "request" ? <section className="customer-mobile-flow">
          {!requestSubmitted ? <>
            <div className="customer-mobile-step-title">Step {requestStep} of 5 - {requestStep === 1 ? "Care Type" : requestStep === 2 ? "Patient Details" : requestStep === 3 ? "Care Details" : requestStep === 4 ? "Clinical Requirements" : "Upload Medical Information"}</div>
            <p className="customer-mobile-step-copy">{requestStep === 1 ? "Please select as appropriate:" : requestStep === 2 ? "Please fill out the form" : requestStep === 3 ? "Set the care schedule details." : requestStep === 4 ? "Select required clinical services." : "You can upload any of these, if available:"}</p>
            <div className={`customer-mobile-step-panel ${requestStepAnimatingOut ? "is-out" : "is-in"}`}>
              {requestStep === 1 ? <div className="customer-mobile-flow-stack">
                {NURSE_REQUEST_CARE_TYPES.map((label) => (
                  <button key={label} type="button" className={`customer-mobile-option-row ${selectedCareType === label ? "active" : ""}`} onClick={() => setSelectedCareType(label)}>
                    <span>{label}</span>
                    <span className={`customer-mobile-radio ${selectedCareType === label ? "selected" : ""}`} aria-hidden="true" />
                  </button>
                ))}
              </div> : null}
              {requestStep === 2 ? <div className="customer-mobile-form-stack">
                {[
                  { label: "Name:", key: "name", placeholder: "Enter patient full name", required: true },
                  { label: "Age:", key: "age", placeholder: "Enter age", required: true },
                  { label: "Gender:", key: "gender", placeholder: "Select gender", required: true },
                  { label: "Address:", key: "address", placeholder: "Enter home address", required: true },
                  { label: "Emergency Contact:", key: "emergencyContact", placeholder: "Enter emergency contact number", required: true },
                  { label: "Mobility Status:", key: "mobilityStatus", placeholder: "Enter mobility status", required: true }
                ].map(({ label, key, placeholder, required }) => <label className="customer-mobile-field" key={label}>
                  <span>{label}</span>
                  {key === "gender" ? <select
                    value={requestForm[key]}
                    className={showRequestStep2FieldError(key) ? "has-error" : ""}
                    onBlur={() => markRequestStep2FieldBlurred(key)}
                        onChange={(event) => updateRequestFormField(key, event.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select> : <input
                    type={key === "emergencyContact" ? "tel" : "text"}
                    inputMode={key === "age" ? "numeric" : key === "emergencyContact" ? "tel" : undefined}
                    maxLength={key === "age" ? 3 : key === "emergencyContact" ? 20 : key === "address" ? 200 : 120}
                    pattern={key === "age" ? "\\d{1,3}" : key === "emergencyContact" ? "[0-9+\\-()\\s]{7,20}" : undefined}
                    value={requestForm[key]}
                    placeholder={placeholder}
                    className={showRequestStep2FieldError(key) ? "has-error" : ""}
                    onBlur={() => markRequestStep2FieldBlurred(key)}
                      onChange={(event) => updateRequestFormField(key, event.target.value)}
                  />}
                  {required && showRequestStep2FieldError(key) ? <small className="customer-mobile-field-error">{requestStep2Errors[key]}</small> : null}
                </label>)}
                {[
                  ["Existing Conditions (If any):", "conditions", "Enter existing conditions"],
                  ["Allergies (If any):", "allergies", "Enter known allergies"],
                  ["Current Medication:", "currentMedication", "Enter current medications"]
                ].map(([label, key, placeholder]) => <label className="customer-mobile-field" key={label}>
                  <span>{label}</span>
                  <textarea rows={4} value={requestForm[key]} placeholder={placeholder} onChange={(event) => setRequestForm((current) => ({ ...current, [key]: sanitizeClientText(event.target.value, { max: 500 }) }))} />
                </label>)}
              </div> : null}
              {requestStep === 3 ? <div className="customer-mobile-form-stack">
                <div className="customer-mobile-radio-group">
                  <span>Is this a recurring visit or one time care?</span>
                  <div className="customer-mobile-inline-radios">
                    {NURSE_REQUEST_VISIT_TYPES.map((label) => <label key={label}>
                      <input
                        type="radio"
                        name="visitType"
                        checked={careDetails.visitType === label}
                        onChange={() => {
                          updateCareDetailField("visitType", label);
                        }}
                      />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {label}
                    </label>)}
                  </div>
                  {showRequestStep3FieldError("visitType") ? <small className="customer-mobile-field-error">{requestStep3Errors.visitType}</small> : null}
                </div>

                <label className="customer-mobile-field">
                  <span>Preferred Visit Date:</span>
                  <input type="date" min={localDateInputValue(new Date())} value={careDetails.preferredDate} className={showRequestStep3FieldError("preferredDate") ? "has-error" : ""} onBlur={() => markRequestStep3FieldBlurred("preferredDate")} onChange={(event) => {
                      updateCareDetailField("preferredDate", event.target.value);
                  }} />
                  {showRequestStep3FieldError("preferredDate") ? <small className="customer-mobile-field-error">{requestStep3Errors.preferredDate}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Preferred Time:</span>
                  <input type="time" min={careDetails.preferredDate === localDateInputValue(new Date()) ? new Date(Date.now() + 60000).toTimeString().slice(0, 5) : undefined} value={careDetails.preferredTime} className={showRequestStep3FieldError("preferredTime") ? "has-error" : ""} onBlur={() => markRequestStep3FieldBlurred("preferredTime")} onChange={(event) => {
                      updateCareDetailField("preferredTime", event.target.value);
                  }} />
                  {showRequestStep3FieldError("preferredTime") ? <small className="customer-mobile-field-error">{requestStep3Errors.preferredTime}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Duration needed:</span>
                  <select value={careDetails.duration} className={showRequestStep3FieldError("duration") ? "has-error" : ""} onBlur={() => markRequestStep3FieldBlurred("duration")} onChange={(event) => {
                      updateCareDetailField("duration", event.target.value);
                  }}>
                    <option value="">Select duration</option>
                    {NURSE_REQUEST_DURATIONS.map((duration) => <option value={duration} key={duration}>{duration}</option>)}
                  </select>
                  {showRequestStep3FieldError("duration") ? <small className="customer-mobile-field-error">{requestStep3Errors.duration}</small> : null}
                </label>

                <div className="customer-mobile-radio-group">
                  <span>Day/Night Care?</span>
                  <div className="customer-mobile-inline-radios">
                    {NURSE_REQUEST_CARE_SHIFTS.map((choice) => <label key={choice}>
                      <input type="radio" name="careShift" checked={careDetails.careShift === choice} onChange={() => {
                          updateCareDetailField("careShift", choice);
                      }} />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {choice}
                    </label>)}
                  </div>
                  {showRequestStep3FieldError("careShift") ? <small className="customer-mobile-field-error">{requestStep3Errors.careShift}</small> : null}
                </div>

                {[
                  ["Live-In Care Required?", "liveInCareRequired"],
                  ["Wheelchair Assistance Needed?", "wheelchairAssistanceNeeded"],
                  ["Medical Equipment Present?", "medicalEquipmentPresent"],
                  ["Requires Lifting Assistance?", "requiresLiftingAssistance"],
                  ["Any Infectious Disease?", "infectiousDisease"]
                ].map(([label, key]) => (
                  <div className="customer-mobile-radio-group" key={label}>
                    <span>{label}</span>
                    <div className="customer-mobile-inline-radios">
                      {NURSE_REQUEST_YES_NO_OPTIONS.map((choice) => <label key={choice}>
                        <input type="radio" name={key} checked={careDetails[key] === choice} onChange={() => {
                            updateCareDetailField(key, choice);
                        }} />
                        <span className="customer-mobile-radio" aria-hidden="true" />
                        {choice}
                      </label>)}
                    </div>
                    {showRequestStep3FieldError(key) ? <small className="customer-mobile-field-error">{requestStep3Errors[key]}</small> : null}
                  </div>
                ))}
              </div> : null}
              {requestStep === 4 ? <div className="customer-mobile-flow-stack">
                {NURSE_REQUEST_CLINICAL_REQUIREMENTS.map((label) => {
                  const selected = clinicalRequirements.includes(label);
                  return <button key={label} type="button" className={`customer-mobile-option-row ${selected ? "active" : ""}`} onClick={() => setClinicalRequirements((current) => selected ? current.filter((item) => item !== label) : [...current, label])}><span>{label}</span><span className={`customer-mobile-select-indicator ${selected ? "selected" : ""}`} aria-hidden="true">{selected ? "✓" : ""}</span></button>;
                })}
              </div> : null}
              {requestStep === 5 ? <div className="customer-mobile-flow-stack">
                {NURSE_REQUEST_UPLOAD_LABELS.map((label) => {
                  const uploaded = uploadedMedicalFiles[label];
                  return <div key={label} className="customer-mobile-upload-row-wrap">
                    <button type="button" className={`customer-mobile-upload-row-button ${uploaded ? "uploaded" : ""}`} onClick={() => uploadInputRefs.current[label]?.click()}>
                      <span>{label}</span>
                      {uploaded ? <span className="customer-mobile-upload-success">✓</span> : <MobileIcon name="upload-file" />}
                    </button>
                    <input ref={(node) => { uploadInputRefs.current[label] = node; }} type="file" className="customer-mobile-hidden-file" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (!isAllowedMedicalFile(file)) {
                        setRequestSubmitError("Upload PDF, DOC, DOCX, PNG, JPG, or WEBP files up to 5MB.");
                        event.target.value = "";
                        return;
                      }
                      setRequestSubmitError("");
                      setUploadedMedicalFiles((current) => ({ ...current, [label]: { name: sanitizeClientText(file.name, { max: 180 }) } }));
                    }} />
                    {uploaded ? <div className="customer-mobile-upload-meta">
                      <small className="customer-mobile-upload-filename" title={uploaded.name}>{uploaded.name}</small>
                      <div className="customer-mobile-upload-meta-actions">
                        <button type="button" onClick={() => uploadInputRefs.current[label]?.click()}>Replace</button>
                        <button type="button" className="customer-mobile-upload-remove" onClick={() => {
                          setUploadedMedicalFiles((current) => {
                            const next = { ...current };
                            delete next[label];
                            return next;
                          });
                          if (uploadInputRefs.current[label]) uploadInputRefs.current[label].value = "";
                        }}>Remove</button>
                      </div>
                    </div> : null}
                  </div>;
                })}
              </div> : null}
            </div>
            <button className="customer-mobile-primary-button" type="button" disabled={requestContinueDisabled} onClick={handleRequestContinue}>{requestSubmitting ? <BrandedSpinner label="Submitting nurse request" /> : "Continue"}</button>
            {requestSubmitError ? <small className="customer-mobile-field-error">{requestSubmitError}</small> : null}
            {requestStep > 1 ? <button className="customer-mobile-secondary-button" type="button" onClick={() => transitionToRequestStep(Math.max(1, requestStep - 1))}>Go Back</button> : null}
          </> : <div className="customer-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="nurse-request-confirmation-title">
            <section className="customer-mobile-panel customer-mobile-submit-state customer-confirmation-shell customer-nurse-request-confirmation-shell">
              <div className="customer-confirmation-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#22A06B" strokeWidth="2" /><path d="M16 24L22 30L32 18" stroke="#22A06B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 id="nurse-request-confirmation-title">{requestSubmitLoadingState ? "Submitting request..." : "Request Received!"}</h2>
              {!requestSubmitLoadingState ? <p>Your nurse request has been received. Our care team will review your details and assign a suitable nurse. You’ll be notified once the visit is confirmed.</p> : null}
              {!requestSubmitLoadingState ? <div className="customer-confirmation-next">
                <h3>What happens next?</h3>
                <div className="customer-confirmation-next-row"><span>Status</span><strong className="badge">Pending Review</strong></div>
                <div className="customer-confirmation-next-row"><span>Next step</span><strong>Nurse assignment</strong></div>
                <div className="customer-confirmation-next-row"><span>Notification</span><strong>Email sent</strong></div>
              </div> : null}
              {!requestSubmitLoadingState ? <button className="customer-mobile-primary-button" type="button" onClick={() => goToPage("overview")}>View Request Status</button> : null}
              {!requestSubmitLoadingState ? <button className="customer-mobile-secondary-button" type="button" onClick={() => goToPage("overview")}>Back to Home</button> : null}
            </section>
          </div>}
        </section> : null}
        {showNurseRequestFlow && appointmentTab === "upcoming" ? (
          nurseRequestsQuery.isLoading
            ? <section className="customer-request-visit-pane">
              <h2>Upcoming Visits</h2>
              {Array.from({ length: 3 }, (_, index) => <article className="customer-mobile-visit-row skeleton-panel" key={`nurse-upcoming-skeleton-${index}`}>
                <div className="customer-mobile-clock skeleton-circle skeleton-circle-sm" />
                <div className="customer-mobile-visit-copy">
                  <SkeletonBox className="skeleton-line skeleton-line-md" />
                  <SkeletonBox className="skeleton-line skeleton-line-sm" />
                </div>
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </article>)}
            </section>
            : <NurseRequestHistorySection title="Upcoming Visits" items={upcomingNurseRequests} auth={nurseRequestAuth} />
        ) : null}
        {showNurseRequestFlow && appointmentTab === "previous" ? (
          nurseRequestsQuery.isLoading
            ? <section className="customer-request-visit-pane">
              <h2>Previous Visits</h2>
              {Array.from({ length: 3 }, (_, index) => <article className="customer-mobile-visit-row skeleton-panel" key={`nurse-previous-skeleton-${index}`}>
                <div className="customer-mobile-clock skeleton-circle skeleton-circle-sm" />
                <div className="customer-mobile-visit-copy">
                  <SkeletonBox className="skeleton-line skeleton-line-md" />
                  <SkeletonBox className="skeleton-line skeleton-line-sm" />
                </div>
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </article>)}
            </section>
            : <NurseRequestHistorySection title="Previous Visits" items={pastNurseRequests} auth={nurseRequestAuth} />
        ) : null}


      </main>
    </div>;
  }

  return <div className={`customer-mobile-app ${embeddedDesktop ? "customer-desktop-embedded-page customer-overview-desktop" : ""}`}>
    {!embeddedDesktop ? renderDrawer() : null}
    <main className={`customer-mobile-frame ${pageTransitionClass}`}>
      {embeddedDesktop ? <header className="customer-request-desktop-header customer-overview-desktop-header">
        <span>Welcome back, {customerDisplayName}</span>
        <h1>Overview</h1>
      </header> : renderHeader("Overview")}
      {stateError ? <p className="customer-mobile-alert">{stateError}</p> : null}
      <CustomerOverviewActions
        spentThisMonth={money(spentThisMonth, storeCurrency)}
        upcomingAppointments={upcomingAppointments.length}
        orderTotal={orderCounts.total}
        availableDoctors={visibleDoctors.length}
      />
      <section className="customer-mobile-section">
        <h2>Appointments</h2>
        {appointmentsLoading ? Array.from({ length: 3 }, (_, index) => <article className="customer-mobile-appointment-row skeleton-panel" key={`customer-mobile-recent-appointment-skeleton-${index}`}>
          <div className="customer-mobile-clock skeleton-circle skeleton-circle-sm" />
          <div className="customer-mobile-appointment-copy">
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
          <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
        </article>) : recentAppointments.length ? recentAppointments.map((appointment) => {
          const doctor = visibleDoctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
          const appointmentTitle = appointmentDisplayTitle(appointment, doctor);
          const doctorLabel = appointmentDoctorLabel(appointment, doctor);
          const appointmentStatusTone = appointmentChipTone(appointment);
          const appointmentStatusLabel = appointmentChipLabel(appointment);
          return <article className="customer-mobile-appointment-row" key={appointment.id}>
            <div className="customer-mobile-clock">
              <MobileIcon name="clock" />
            </div>
            <div className="customer-mobile-appointment-copy">
              <strong>{appointmentTitle}</strong>
              <span>{formatAppointmentListDateTime(appointment.start_at, storeTimeZone)}</span>
              <small>{doctorLabel}</small>
            </div>
            <div className="customer-mobile-appointment-status">
              <div className="appointment-status-stack">
                <span className={`chip ${appointmentStatusTone}`}><span className="chip-dot" />{appointmentStatusLabel}</span>
                {appointmentHasPrescription(appointment) ? <span className="appointment-prescription-availability">Prescription Available</span> : null}
              </div>
            </div>
            <button className="customer-mobile-row-overlay" type="button" aria-label="Open appointment details" onClick={() => onOpenAppointment(appointment)} />
          </article>;
          }) : <CustomerMobileEmptyState
            message="You have no recent appointment"
            illustrationSrc="/group-3.png"
          />}
      </section>
    </main>
  </div>;
}

function AutoFitPageTitle({ title }) {
  const headingRef = useRef(null);

  useEffect(() => {
    const node = headingRef.current;
    if (!node || typeof window === "undefined") {
      return undefined;
    }

    let lastWidth = 0;
    const fit = () => {
      delete node.dataset.baseFontSize;
      node.style.fontSize = "";
      fitTextToContainer(node, { minFontSize: 15, step: 0.5 });
    };
    fit();
    document.fonts?.ready?.then(fit).catch(() => {});

    const parent = node.parentElement;
    const observer = parent && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect?.width || 0;
        if (Math.abs(width - lastWidth) < 1) {
          return;
        }
        lastWidth = width;
        fit();
      })
      : null;
    if (observer && parent) {
      lastWidth = parent.getBoundingClientRect().width;
      observer.observe(parent);
    }
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [title]);

  return <h1 ref={headingRef} className="customer-mobile-pagehead-title" title={title}>{title}</h1>;
}

function CustomerOverviewActions({ spentThisMonth, upcomingAppointments, orderTotal, availableDoctors }) {
  const valueRefs = useRef([]);
  const cards = [
    { key: "spent-this-month", label: "Spent this month", value: spentThisMonth, icon: "wallet" },
    { key: "appointments-upcoming", label: "Appointments", value: upcomingAppointments, icon: "appointments" },
    { key: "orders", label: "Orders", value: orderTotal, icon: "shopping-basket" },
    { key: "available-doctors", label: "Available Doctors", value: availableDoctors, icon: "doctor" }
  ];

  useEffect(() => {
    const fit = () => cards.forEach((card, index) => {
      fitTextToContainer(valueRefs.current[index], { minFontSize: 14 });
    });
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [spentThisMonth, upcomingAppointments, orderTotal, availableDoctors]);

  return <section className="overview-actions" aria-label="Overview metrics">
    {cards.map((card, index) => <article className="overview-action-card" key={card.key}>
      <div className="overview-action-icon">
        <MobileIcon name={card.icon} />
      </div>
      <div className="overview-action-info">
        <p>{card.label}</p>
        <strong ref={(node) => { valueRefs.current[index] = node; }} className="overview-action-value">{card.value}</strong>
      </div>
    </article>)}
  </section>;
}

function CustomerMobileBookCalendar({
  doctor,
  journey,
  onBack,
  onReasonChange,
  onCreateAppointmentCheckout,
  bookCalendarReason,
  setBookCalendarReason,
  calendarDay,
  setCalendarDay,
  calendarTime,
  setCalendarTime
}) {
  const [ctaPending, setCtaPending] = useState(false);
  const calendarDays = Array.from({ length: 30 }, (_, index) => index + 1);

  useEffect(() => {
    if (!journey.loading) {
      setCtaPending(false);
    }
  }, [journey.loading]);

  async function handleCreateAppointmentCheckout() {
    setCtaPending(true);
    try {
      await onCreateAppointmentCheckout();
    } finally {
      setCtaPending(false);
    }
  }

  return <section className="customer-mobile-book-screen">
    <header className="customer-mobile-book-header">
      <button className="customer-mobile-back-link" type="button" onClick={onBack}>
        <MobileIcon name="arrow-left" />
        <span>Go back</span>
      </button>
      <h1>Appointments</h1>
      <p>{doctor?.display_name || "Selected doctor"}</p>
    </header>
    <section className="customer-mobile-book-card">
      <div className="customer-mobile-book-month">
        <strong>June 2021</strong>
        <div className="customer-mobile-book-arrows">
          <button type="button" aria-label="Previous month"><MobileIcon name="arrow-left" /></button>
          <button type="button" aria-label="Next month"><MobileIcon name="arrow-right" /></button>
        </div>
      </div>
      <div className="customer-mobile-calendar-head">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="customer-mobile-calendar-grid">
        {calendarDays.map((day) => (
          <button key={day} type="button" className={`customer-mobile-calendar-day ${day === calendarDay ? "active" : ""}`} onClick={() => setCalendarDay(day)}>
            {day}
          </button>
        ))}
      </div>
      <div className="customer-mobile-time-row">
        <strong>Time</strong>
        <div className="customer-mobile-time-box">
          <input value={calendarTime} onChange={(event) => setCalendarTime(event.target.value)} />
          <input className="small" value="" readOnly />
        </div>
      </div>
    </section>
    <label className="customer-mobile-field">
      <span>Reason for Appointment:</span>
      <textarea
        rows={4}
        value={bookCalendarReason}
        placeholder="Briefly state the reason for your appointment"
        onChange={(event) => {
          setBookCalendarReason(event.target.value);
          onReasonChange(event.target.value);
        }}
      />
    </label>
    <button className="customer-mobile-primary-button" type="button" onClick={handleCreateAppointmentCheckout} disabled={journey.loading || ctaPending}>
      {(journey.loading || ctaPending) ? <AppointmentCtaLoadingState active stage={journey.progressStage || "securing_slot"} /> : "Book Appointment"}
    </button>
  </section>;
}

function AppointmentBookingButton({ onClick, className = "", label = "Book an appointment" }) {
  return <button className={`appointment-booking-cta ${className}`.trim()} type="button" onClick={onClick}>
    <span className="appointment-booking-cta-label">{label}</span>
    <span className="appointment-booking-cta-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M22 16.92V20A2 2 0 0 1 19.82 22C10.95 21.36 3.64 14.05 3 5.18A2 2 0 0 1 5 3H8.09A2 2 0 0 1 10.04 4.63L10.7 7.86A2 2 0 0 1 10.13 9.81L8.91 11.03A16 16 0 0 0 12.97 15.09L14.19 13.87A2 2 0 0 1 16.14 13.3L19.37 13.96A2 2 0 0 1 21 15.91V16.92Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  </button>;
}

function CustomerMobileEmptyState({ message, ctaLabel, onCta, icon = "appointments", illustrationSrc = "", ctaStyle = "" }) {
  const isAppointmentCta = ctaStyle === "appointment";
  return <div className="customer-mobile-empty-state">
    {illustrationSrc ? <img className="customer-mobile-empty-illustration" src={illustrationSrc} alt="" aria-hidden="true" /> : <div className="customer-mobile-empty-icon"><MobileIcon name={icon} /></div>}
    <p>{message}</p>
    {ctaLabel && onCta ? (isAppointmentCta
      ? <AppointmentBookingButton onClick={onCta} label={ctaLabel} />
      : <button className={ctaStyle === "shop" ? "shop-medicine-btn" : `customer-mobile-empty-button ${ctaStyle ? `is-${ctaStyle}` : ""}`.trim()} type="button" onClick={onCta}>
        <span>{ctaLabel}</span>
        <span className={ctaStyle === "shop" ? "shop-medicine-icon" : "customer-mobile-empty-button-icon"}><MobileIcon name={ctaStyle === "shop" ? "arrow-up-right" : (icon === "orders" ? "arrow-right" : "phone")} /></span>
      </button>) : null}
  </div>;
}
function CustomerMobileSkeleton({ page }) {
  return <div className="customer-mobile-app">
    <main className="customer-mobile-frame">
      <div className="customer-mobile-skeleton-block customer-mobile-skeleton-search" />
      <div className="customer-mobile-skeleton-line" />
      <div className="customer-mobile-skeleton-grid">
        {Array.from({ length: page === "orders" ? 4 : 4 }, (_, index) => <div className="customer-mobile-skeleton-card" key={index} />)}
      </div>
    </main>
  </div>;
}

function MobileIcon({ name }) {
  const iconMap = {
    search: Search01Icon,
    menu: Menu01Icon,
    home: Home01Icon,
    orders: ShoppingCart01Icon,
    pharmacy: MedicalMaskIcon,
    calendar: Calendar03Icon,
    appointments: Calendar03Icon,
    "shopping-basket": ShoppingBasket01Icon,
    wallet: Wallet01Icon,
    nurse: Doctor01Icon,
    cross: Medicine01Icon,
    profile: UserIcon,
    logout: Logout01Icon,
    clock: Clock01Icon,
    upload: Upload01Icon,
    "upload-file": FileUploadIcon,
    "arrow-left": ArrowLeft01Icon,
    "arrow-right": ArrowRight01Icon,
    "arrow-up-right": ArrowUpRight01Icon,
    wifi: Wifi01Icon,
    battery: BatteryFullIcon,
    signal: SignalFull01Icon,
    doctor: Doctor01Icon,
    more: MoreHorizontalIcon
  };
  return <HugeiconsIcon icon={iconMap[name] || UserIcon} size={20} strokeWidth={1.7} />;
}
