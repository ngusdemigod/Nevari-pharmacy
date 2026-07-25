"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import useSWR, { mutate as mutateSWRKey, useSWRConfig } from "swr";
import { HugeiconsIcon } from "@hugeicons/react";
import { AddCircleIcon, Calendar03Icon, Clock01Icon, Doctor01Icon, Home01Icon, Menu01Icon, Settings01Icon, ShoppingCart01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { replaceById, updateListPayload, upsertById } from "../lib/fetcher";
import { isProxyAppointmentsKey, isProxyDashboardDoctorKey, isProxyDoctorPathKey, isProxyOrdersKey, swrKeys, withBaseUrl } from "../lib/swrKeys";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { RoleShell, SkeletonBox } from "./components/role-shell";
import { apiRequest, buildDashboardCacheKey, buildUrl, DASHBOARD_CACHE_TTL_MS, describeDashboardFetchError, fitTextToContainer, hydrateStoredSession, isSessionUsable, money, readDashboardCache, rememberStoreContext, shortDate, storedStoreCurrency, storedStoreTimeZone, titleCase, writeDashboardCache } from "./components/role-dashboard-utils";
import { performGlobalLogout } from "./components/role-session";
import { buildSWRRevealSignature, useSWRReveal } from "./components/useSWRReveal";
import { BrandedSpinner } from "./components/BrandedSpinner";
import ModalScrim from "./components/ModalScrim";
import {
  WEEKDAYS as weekdays,
  DEFAULT_SLOT_INTERVAL_MINUTES,
  DEFAULT_AVAILABILITY_START,
  DEFAULT_AVAILABILITY_END,
  normalizeAvailability,
  availabilityEquals,
  toggleAvailabilityDay,
  toggleAvailabilityFrame,
  normalizeSlotIntervalMinutes,
  defaultAvailabilityRanges,
  buildAvailabilityTimeFrames,
  getSelectedAvailabilityFrames,
  buildAvailabilityRangesFromFrames,
  timeStringToMinutes,
  minutesToTimeString,
  formatAvailabilityLabel
} from "./components/availability-utils";

const DOCTOR_SETTINGS_KEY = "nevari_doctor_frontend_settings";
const ADMIN_APPOINTMENT_SETTINGS_KEY = "nevari_admin_appointment_settings";
const DOCTOR_DASHBOARD_CACHE_SCOPE = "doctor-dashboard";
const DOCTOR_MOBILE_BREAKPOINT = 720;
const pages = ["overview", "consultations", "availability", "settings"];
const doctorPageLabels = {
  overview: "Overview",
  consultations: "Consultations",
  availability: "Availability",
  settings: "Settings"
};
const DEFAULT_CONSULTATION_FEE_NGN = 5000;
const DOCTOR_DASHBOARD_REFRESH_MS = 45_000;
const emptyDoctorState = {
  error: "",
  dashboard: null,
  appointments: [],
  orders: [],
  products: [],
  patients: [],
  doctor: null,
  reviews: null,
  availability: {}
};

const DOCTOR_PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const DOCTOR_PROFILE_IMAGE_SERVER_MAX_BYTES = 2 * 1024 * 1024;
const DOCTOR_PROFILE_IMAGE_EXPORT_SIZE = 640;
const DOCTOR_PROFILE_IMAGE_MIN_ZOOM = 1;
const DOCTOR_PROFILE_IMAGE_MAX_ZOOM = 3;

function validateDoctorProfileImageFile(file) {
  if (!file) {
    return "Select an image to continue.";
  }
  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    return "Please choose a valid image file.";
  }
  if (Number(file.size || 0) > DOCTOR_PROFILE_IMAGE_MAX_SIZE_BYTES) {
    return "Image size must be 5MB or less.";
  }
  return "";
}

function clampDoctorProfileImageNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDoctorProfileImageBaseScale(naturalWidth, naturalHeight, cropSize = 1) {
  if (!naturalWidth || !naturalHeight || !cropSize) {
    return 1;
  }
  return Math.max(cropSize / naturalWidth, cropSize / naturalHeight);
}

function getDoctorProfileImageOffsetLimits(naturalWidth, naturalHeight, scale, cropSize = 1) {
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  return {
    x: Math.max(0, (scaledWidth - cropSize) / 2),
    y: Math.max(0, (scaledHeight - cropSize) / 2),
  };
}

function clampDoctorProfileImageOffsets(offsetX, offsetY, naturalWidth, naturalHeight, scale, cropSize = 1) {
  const limits = getDoctorProfileImageOffsetLimits(naturalWidth, naturalHeight, scale, cropSize);
  return {
    x: clampDoctorProfileImageNumber(offsetX, -limits.x, limits.x),
    y: clampDoctorProfileImageNumber(offsetY, -limits.y, limits.y),
  };
}

function createDoctorProfileImageCropState({ naturalWidth, naturalHeight, zoom = DOCTOR_PROFILE_IMAGE_MIN_ZOOM, offsetX = 0, offsetY = 0, cropSize = 1 }) {
  const baseScale = getDoctorProfileImageBaseScale(naturalWidth, naturalHeight, cropSize);
  const nextZoom = clampDoctorProfileImageNumber(Number(zoom) || DOCTOR_PROFILE_IMAGE_MIN_ZOOM, DOCTOR_PROFILE_IMAGE_MIN_ZOOM, DOCTOR_PROFILE_IMAGE_MAX_ZOOM);
  const scale = baseScale * nextZoom;
  const offset = clampDoctorProfileImageOffsets(offsetX, offsetY, naturalWidth, naturalHeight, scale, cropSize);
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

function loadDoctorProfileImageDimensions(file) {
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

function buildDoctorProfileImageUploadName(fileName = "", mimeType = "") {
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

function readDoctorProfileImageFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

async function renderCroppedDoctorProfileImage(file, cropState) {
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
    canvas.width = DOCTOR_PROFILE_IMAGE_EXPORT_SIZE;
    canvas.height = DOCTOR_PROFILE_IMAGE_EXPORT_SIZE;
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
      DOCTOR_PROFILE_IMAGE_EXPORT_SIZE,
      DOCTOR_PROFILE_IMAGE_EXPORT_SIZE
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

      if (blob.size <= DOCTOR_PROFILE_IMAGE_SERVER_MAX_BYTES) {
        const dataBase64 = await readDoctorProfileImageFileAsBase64(blob);
        return {
          file,
          filename: buildDoctorProfileImageUploadName(file.name, preferredMimeType),
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

function getDoctorProfileImageRateLimitRetrySeconds(error) {
  const code = String(error?.code || error?.payload?.error?.code || "").trim().toLowerCase();
  if (code !== "too_many_requests") {
    return 0;
  }
  const details = error?.details || error?.payload?.error?.details || {};
  const retryAfter = Number(error?.retryAfter || details?.retry_after || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.ceil(retryAfter);
  }
  const resetAt = Date.parse(String(details?.reset_at || ""));
  if (Number.isFinite(resetAt)) {
    return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  }
  return 0;
}

function formatDoctorProfileImageRateLimitMessage(seconds) {
  const safeSeconds = Math.max(1, Math.ceil(Number(seconds || 0)));
  const minutes = Math.max(1, Math.ceil(safeSeconds / 60));
  return "Too many profile image updates. Please try again in " + minutes + " minute" + (minutes === 1 ? "" : "s") + ".";
}

function describeDoctorProfileImageUploadError(error) {
  const retrySeconds = getDoctorProfileImageRateLimitRetrySeconds(error);
  if (retrySeconds > 0) {
    return formatDoctorProfileImageRateLimitMessage(retrySeconds);
  }
  return error?.message || "Unable to upload image. Please try again.";
}

async function fetchDoctorDashboardPayload(session, doctorId, fallbackState = emptyDoctorState) {
  const results = await Promise.allSettled([
    apiRequest(session, "/dashboard/doctor", { params: { doctor_id: doctorId }, suppressHttpError: true }),
    apiRequest(session, "/appointments", { params: { per_page: 5, page: 1 }, suppressHttpError: true }),
    apiRequest(session, "/orders", { params: { per_page: 5, page: 1 }, suppressHttpError: true }),
    apiRequest(session, `/doctors/${doctorId}`, { suppressHttpError: true })
  ]);
  const hasDashboardFailure = results[0].status !== "fulfilled" || results[0].value === null;
  const hasAppointmentsFailure = results[1].status !== "fulfilled" || results[1].value === null;
  const hasOrdersFailure = results[2].status !== "fulfilled" || results[2].value === null;
  const hasDoctorFailure = results[3].status !== "fulfilled" || results[3].value === null;
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => describeDashboardFetchError(result.reason));
  const bootstrapState = buildDoctorBootstrapState(session, fallbackState);
  const dashboard = hasDashboardFailure ? bootstrapState.dashboard : results[0].value;
  rememberStoreContext(dashboard || {});

  return {
    error: errors[0] || ((hasAppointmentsFailure || hasOrdersFailure || hasDoctorFailure) ? "The pharmacy server could not be reached. Showing locally available dashboard data." : ""),
    dashboard: dashboard || bootstrapState.dashboard,
    appointments: hasAppointmentsFailure ? (bootstrapState.appointments || []) : (results[1].value || []),
    orders: hasOrdersFailure ? (bootstrapState.orders || []) : (results[2].value || []),
    products: bootstrapState.products || [],
    patients: bootstrapState.patients || [],
    doctor: hasDoctorFailure ? bootstrapState.doctor : results[3].value,
    reviews: bootstrapState.reviews || null,
    availability: bootstrapState.availability || {}
  };
}

async function fetchDoctorAppointments(session) {
  return (await apiRequest(session, "/appointments", {
    params: { per_page: 40, page: 1 },
    suppressHttpError: true
  })) || [];
}

async function fetchDoctorOrders(session) {
  return (await apiRequest(session, "/orders", {
    params: { per_page: 40, page: 1 },
    suppressHttpError: true
  })) || [];
}

function doctorConsultationFee(doctor) {
  const value = Number(doctor?.consultation_fee || doctor?.consultationFee || 0);
  return value > 0 ? value : DEFAULT_CONSULTATION_FEE_NGN;
}

async function fetchDoctorProducts(session, doctorId) {
  return (await apiRequest(session, `/doctors/${doctorId}/products`, {
    params: { per_page: 40, page: 1 },
    suppressHttpError: true
  })) || [];
}

async function fetchDoctorPatients(session, doctorId) {
  return (await apiRequest(session, `/doctors/${doctorId}/patients`, {
    params: { per_page: 40, page: 1 },
    suppressHttpError: true
  })) || [];
}

async function fetchDoctorReviews(session, doctorId) {
  return (await apiRequest(session, `/doctors/${doctorId}/reviews`, { suppressHttpError: true })) || null;
}

async function fetchDoctorAvailability(session, doctorId) {
  const payload = await apiRequest(session, `/doctors/${doctorId}/availability`, { suppressHttpError: true });
  return normalizeAvailability(payload?.availability || {});
}

function hasDoctorRole(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const directRole = typeof user?.role === "string" ? [user.role] : [];
  const normalized = [...roles, ...directRole]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return normalized.includes("doctor") || normalized.includes("administrator");
}

function useAutoClearSnackbar(initialValue = null, timeoutMs = 3200) {
  const [snackbar, setSnackbar] = useState(initialValue);

  useEffect(() => {
    if (!snackbar?.message) {
      return undefined;
    }
    const timer = window.setTimeout(
      () => setSnackbar(null),
      Number(snackbar.durationMs) > 0 ? Number(snackbar.durationMs) : timeoutMs
    );
    return () => window.clearTimeout(timer);
  }, [snackbar, timeoutMs]);

  return [snackbar, setSnackbar];
}

function doctorNotificationEntityId(record) {
  return String(record?.id || record?.reference || "").trim();
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const [page, setPage] = useState("overview");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [doctorId, setDoctorId] = useState(null);
  const [cacheKey, setCacheKey] = useState(null);
  const [availabilityDraft, setAvailabilityDraft] = useState({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [completionModal, setCompletionModal] = useState({ open: false, appointmentId: null });
  const [completionDraft, setCompletionDraft] = useState({ doctorNotes: "", diagnosis: "", productQuantities: {} });
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [doctorSettings, setDoctorSettings] = useState(() => loadDoctorSettings());
  const [bookingIntervalMinutes, setBookingIntervalMinutes] = useState(() => loadBookingIntervalMinutes());
  const [snackbar, setSnackbar] = useAutoClearSnackbar(null);
  const [isDoctorMobile, setIsDoctorMobile] = useState(false);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const appointmentNotificationSeenRef = useRef(new Set());
  const appointmentNotificationReadyRef = useRef(false);
  const availabilityUserEditedRef = useRef(false);
  const availabilityAutoSaveTimerRef = useRef(null);
  const availabilitySavingRef = useRef(false);
  const availabilityResavePendingRef = useRef(false);

  function showDoctorNotice(message, tone = "warning", options = {}) {
    if (!message) {
      return;
    }
    setSnackbar({
      tone,
      message,
      actionLabel: String(options.actionLabel || "").trim(),
      onAction: typeof options.onAction === "function" ? options.onAction : null,
      durationMs: Number(options.durationMs) > 0 ? Number(options.durationMs) : 0
    });
  }

  useEffect(() => {
    if (!pages.includes(page)) {
      setPage("overview");
    }
  }, [page]);

  useEffect(() => {
    const section = titleCase(page);
    setDocumentMetadata(`Nevari Doctor | ${section}`, `${section} view for the Nevari Doctor dashboard.`);
  }, [page]);

  useEffect(() => {
    persistDoctorSettings(doctorSettings);
  }, [doctorSettings]);

  useEffect(() => {
    const syncBookingInterval = () => setBookingIntervalMinutes(loadBookingIntervalMinutes());
    syncBookingInterval();
    window.addEventListener("storage", syncBookingInterval);
    return () => window.removeEventListener("storage", syncBookingInterval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia(`(max-width: ${DOCTOR_MOBILE_BREAKPOINT}px)`);
    const syncDoctorMobile = (event) => setIsDoctorMobile(event.matches);
    syncDoctorMobile(mediaQuery);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncDoctorMobile);
      return () => mediaQuery.removeEventListener("change", syncDoctorMobile);
    }
    mediaQuery.addListener(syncDoctorMobile);
    return () => mediaQuery.removeListener(syncDoctorMobile);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { body } = document;
    if (isDoctorMobile) {
      body.classList.add("doctor-mobile-mode");
      return () => body.classList.remove("doctor-mobile-mode");
    }
    body.classList.remove("doctor-mobile-mode");
    return undefined;
  }, [isDoctorMobile]);

  useEffect(() => {
    const hydratedSession = hydrateStoredSession("doctor");
    const nextDoctorId = hydratedSession.user?.id;
    if (!isSessionUsable(hydratedSession) || !nextDoctorId || !hasDoctorRole(hydratedSession.user)) {
      setAuthResolved(true);
      router.replace("/admin/doctor/login");
      return;
    }
    setSession(hydratedSession);
    setDoctorId(nextDoctorId);
    setCacheKey(buildDashboardCacheKey("doctor", DOCTOR_DASHBOARD_CACHE_SCOPE, nextDoctorId));
    setAuthResolved(true);
  }, [router]);

  const cachedDoctorState = (cacheKey && isSessionUsable(session))
    ? readDashboardCache(cacheKey, DASHBOARD_CACHE_TTL_MS)?.state
    : null;
  const bootstrapDoctorState = useMemo(
    () => buildDoctorBootstrapState(session, cachedDoctorState || emptyDoctorState),
    [cachedDoctorState, session]
  );
  const doctorSummaryKey = session && doctorId
    ? swrKeys.proxy.path("/dashboard/doctor", withBaseUrl(session, { doctor_id: doctorId }))
    : null;
  const doctorAppointmentNotificationKey = session && doctorId
    ? ["doctor-dashboard-appointment-notifications", session.baseUrl, doctorId]
    : null;
  const doctorAppointmentsKey = session && doctorId && ["overview", "consultations", "settings"].includes(page)
    ? swrKeys.proxy.path("/appointments", withBaseUrl(session, { per_page: 40, page: 1, doctor_id: doctorId }))
    : null;
  const doctorOrdersKey = session && doctorId && page === "overview"
    ? swrKeys.proxy.path("/orders", withBaseUrl(session, { per_page: 40, page: 1, doctor_id: doctorId }))
    : null;
  const doctorProductsKey = session && doctorId && page === "consultations"
    ? swrKeys.proxy.path(`/doctors/${doctorId}/products`, withBaseUrl(session, { per_page: 40, page: 1 }))
    : null;
  const doctorPatientsKey = session && doctorId && page === "patients"
    ? swrKeys.proxy.path(`/doctors/${doctorId}/patients`, withBaseUrl(session, { per_page: 40, page: 1 }))
    : null;
  const doctorReviewsKey = session && doctorId && ["overview", "reviews"].includes(page)
    ? swrKeys.proxy.path(`/doctors/${doctorId}/reviews`, withBaseUrl(session))
    : null;
  const doctorAvailabilityKey = session && doctorId && ["availability", "settings"].includes(page)
    ? swrKeys.proxy.path(`/doctors/${doctorId}/availability`, withBaseUrl(session))
    : null;
  const { data: summaryState = emptyDoctorState, mutate: mutateSummary, isLoading } = useSWR(
    doctorSummaryKey,
    () => fetchDoctorDashboardPayload(session, doctorId, bootstrapDoctorState),
    {
      fallbackData: bootstrapDoctorState,
      refreshInterval: DOCTOR_DASHBOARD_REFRESH_MS,
      revalidateOnFocus: false,
      onSuccess: (nextState) => {
        if (cacheKey) {
          writeDashboardCache(cacheKey, {
            state: nextState,
            availabilityDraft: nextState.availability
          });
        }
      }
    }
  );
  const appointmentsQuery = useSWR(
    doctorAppointmentsKey,
    () => fetchDoctorAppointments(session),
    { revalidateOnFocus: false, dedupingInterval: 45_000, keepPreviousData: true }
  );
  const appointmentNotificationQuery = useSWR(
    doctorAppointmentNotificationKey,
    () => apiRequest(session, "/appointments", {
      params: { per_page: 5, page: 1, doctor_id: doctorId },
      suppressHttpError: true
    }),
    { refreshInterval: DOCTOR_DASHBOARD_REFRESH_MS, revalidateOnFocus: true, dedupingInterval: 30_000, keepPreviousData: true }
  );
  const ordersQuery = useSWR(
    doctorOrdersKey,
    () => fetchDoctorOrders(session),
    { revalidateOnFocus: false, dedupingInterval: 45_000, keepPreviousData: true }
  );
  const productsQuery = useSWR(
    doctorProductsKey,
    () => fetchDoctorProducts(session, doctorId),
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true }
  );
  const patientsQuery = useSWR(
    doctorPatientsKey,
    () => fetchDoctorPatients(session, doctorId),
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true }
  );
  const reviewsQuery = useSWR(
    doctorReviewsKey,
    () => fetchDoctorReviews(session, doctorId),
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true }
  );
  const availabilityQuery = useSWR(
    doctorAvailabilityKey,
    () => fetchDoctorAvailability(session, doctorId),
    { revalidateOnFocus: false, dedupingInterval: 300_000, keepPreviousData: true }
  );

  const state = useMemo(() => ({
    ...summaryState,
    appointments: appointmentsQuery.data || summaryState.appointments || [],
    orders: ordersQuery.data || summaryState.orders || [],
    products: productsQuery.data || summaryState.products || [],
    patients: patientsQuery.data || summaryState.patients || [],
    reviews: reviewsQuery.data || summaryState.reviews || null,
    availability: availabilityQuery.data || summaryState.availability || {}
  }), [appointmentsQuery.data, availabilityQuery.data, ordersQuery.data, patientsQuery.data, productsQuery.data, reviewsQuery.data, summaryState]);

  useEffect(() => {
    const incomingAppointments = Array.isArray(appointmentNotificationQuery.data) ? appointmentNotificationQuery.data : [];
    if (!incomingAppointments.length) {
      return;
    }

    const seenIds = appointmentNotificationSeenRef.current;
    const nextIds = incomingAppointments.map((appointment) => doctorNotificationEntityId(appointment)).filter(Boolean);
    if (!appointmentNotificationReadyRef.current) {
      nextIds.forEach((id) => seenIds.add(id));
      appointmentNotificationReadyRef.current = true;
      return;
    }

    const freshAppointments = incomingAppointments.filter((appointment) => {
      const id = doctorNotificationEntityId(appointment);
      return id && !seenIds.has(id);
    });
    nextIds.forEach((id) => seenIds.add(id));

    if (!freshAppointments.length) {
      return;
    }

    const latestAppointment = freshAppointments[0];
    const patientName = String(latestAppointment?.patient?.display_name || "").trim() || "A customer";
    showDoctorNotice(
      `${patientName} scheduled an appointment with you on ${formatDoctorNotificationDate(latestAppointment?.start_at)}.`,
      "info",
      {
        actionLabel: "View booking",
        durationMs: 7000,
        onAction: () => {
          setPage("consultations");
          setSnackbar(null);
        }
      }
    );
  }, [appointmentNotificationQuery.data]);

  useEffect(() => {
    const persistedDisplayName = String(state.doctor?.display_name || "").trim();
    if (!persistedDisplayName) {
      return;
    }
    setDoctorSettings((current) => (
      current.displayName === persistedDisplayName
        ? current
        : { ...current, displayName: persistedDisplayName }
    ));
  }, [state.doctor?.display_name]);
  const mutate = async () => {
    await mutateSummary();
    if (page === "consultations") {
      await appointmentsQuery.mutate();
    }
    if (page === "availability") {
      await availabilityQuery.mutate();
    }
  };

  function patchDoctorAppointmentCache(appointment) {
    globalMutate(isProxyAppointmentsKey, (current) => updateListPayload(current, (list) => upsertById(list, appointment)), { revalidate: false });
  }

  function patchDoctorAvailabilityCache(availability) {
    globalMutate((key) => isProxyDoctorPathKey(key) && String(key).includes(encodeURIComponent("/availability")), availability, { revalidate: false });
  }

  function revalidateDoctorGroups(...predicates) {
    predicates.forEach((predicate) => globalMutate(predicate, undefined, { revalidate: true }));
  }

  async function autoRefreshDoctorLists(...keys) {
    const validKeys = keys.filter(Boolean);
    if (!validKeys.length) {
      return;
    }
    await Promise.all(validKeys.map((key) => mutateSWRKey(key)));
  }

  useEffect(() => {
    const normalizedAvailability = normalizeAvailability(state.availability || {});
    setAvailabilityDraft((current) => (
      availabilityEquals(current, normalizedAvailability) ? current : normalizedAvailability
    ));
  }, [state.availability]);

  async function handleAppointmentAction(appointmentId, action, body = {}) {
    const currentAppointment = state.appointments.find((item) => String(item.id) === String(appointmentId));
    const optimisticStatus = action === "confirm" ? "confirmed" : action === "complete" ? "completed" : currentAppointment?.status;
    const optimisticAppointment = currentAppointment ? { ...currentAppointment, ...body, status: optimisticStatus || currentAppointment.status } : null;
    try {
      if (optimisticAppointment) {
        await mutateSummary((current) => current ? { ...current, appointments: replaceById(current.appointments || [], optimisticAppointment) } : current, { revalidate: false });
        await appointmentsQuery.mutate((current) => Array.isArray(current) ? replaceById(current, optimisticAppointment) : current, { revalidate: false });
        patchDoctorAppointmentCache(optimisticAppointment);
      }
      const nextAppointment = await apiRequest(session, `/appointments/${appointmentId}/${action}`, {
        method: "POST",
        body
      });
      if (nextAppointment) {
        await mutateSummary((current) => current ? { ...current, appointments: upsertById(current.appointments || [], nextAppointment) } : current, { revalidate: false });
        await appointmentsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, nextAppointment) : current, { revalidate: false });
        patchDoctorAppointmentCache(nextAppointment);
      }
      showDoctorNotice(action === "confirm" ? "Appointment confirmed." : "Appointment completed.", "success");
      revalidateDoctorGroups(isProxyAppointmentsKey, isProxyDashboardDoctorKey, isProxyOrdersKey);
      await autoRefreshDoctorLists(doctorSummaryKey, doctorAppointmentsKey, doctorOrdersKey);
    } catch (error) {
      if (currentAppointment) {
        await mutateSummary((current) => current ? { ...current, appointments: replaceById(current.appointments || [], currentAppointment) } : current, { revalidate: false });
        await appointmentsQuery.mutate((current) => Array.isArray(current) ? replaceById(current, currentAppointment) : current, { revalidate: false });
        patchDoctorAppointmentCache(currentAppointment);
      }
      showDoctorNotice(error?.message || "The appointment update failed.", "error");
    }
  }

  function openCompleteAppointmentModal(appointmentId) {
    const appointment = state.appointments.find((item) => String(item.id) === String(appointmentId));
    setCompletionDraft({
      doctorNotes: String(appointment?.doctor_notes || "").trim(),
      diagnosis: "",
      productQuantities: {}
    });
    setCompletionModal({ open: true, appointmentId });
  }

  function closeCompleteAppointmentModal() {
    if (completionSubmitting) return;
    setCompletionModal({ open: false, appointmentId: null });
    setCompletionDraft({ doctorNotes: "", diagnosis: "", productQuantities: {} });
  }

  async function submitAppointmentCompletion() {
    const appointment = state.appointments.find((item) => String(item.id) === String(completionModal.appointmentId));
    if (!appointment) {
      showDoctorNotice("The appointment could not be found.", "error");
      return;
    }
    const doctorNotes = String(completionDraft.doctorNotes || "").trim();
    if (!doctorNotes) {
      showDoctorNotice("Doctor remarks are required before completion.", "error");
      return;
    }

    const selectedItems = Object.entries(completionDraft.productQuantities || {})
      .map(([productId, quantity]) => ({ product_id: Number(productId), quantity: Number(quantity) }))
      .filter((item) => item.product_id > 0 && item.quantity > 0);

    setCompletionSubmitting(true);
    try {
      if (selectedItems.length) {
        const patient = appointment?.patient || {};
        const [firstName, ...restName] = String(patient.display_name || "").trim().split(/\s+/).filter(Boolean);
        const prescription = await apiRequest(session, "/prescriptions", {
          method: "POST",
          body: {
            patient_user_id: appointment.patient_user_id,
            appointment_id: appointment.id,
            diagnosis: String(completionDraft.diagnosis || appointment.reason || "Consultation follow-up").trim(),
            instructions: doctorNotes,
            valid_from: new Date().toISOString(),
            items: selectedItems
          }
        });
        await apiRequest(session, `/prescriptions/${prescription.id}/issue`, { method: "POST" });
        await apiRequest(session, `/prescriptions/${prescription.id}/assign`, {
          method: "POST",
          body: { notify_patient: true }
        });
        const customerOrder = await apiRequest(session, "/orders", {
          method: "POST",
          body: {
            customer_id: appointment.patient_user_id,
            appointment_id: appointment.id,
            prescription_id: prescription.id,
            custom_email_only: true,
            items: selectedItems,
            billing: {
              first_name: firstName || "Patient",
              last_name: restName.join(" "),
              email: patient.email || "",
              phone: patient.phone || patient.billing_phone || "",
              address_1: patient.address || patient.billing_address_1 || "",
              city: patient.city || "",
              state: patient.state || "",
              postcode: patient.postcode || "",
              country: patient.country || "NG"
            }
          }
        });
        if (customerOrder) {
          await ordersQuery.mutate((current) => Array.isArray(current) ? upsertById(current, customerOrder) : current, { revalidate: false });
          globalMutate(isProxyOrdersKey, (current) => updateListPayload(current, (list) => upsertById(list, customerOrder)), { revalidate: false });
        }
      }

      await handleAppointmentAction(appointment.id, "complete", { doctor_notes: doctorNotes });
      closeCompleteAppointmentModal();
    } finally {
      setCompletionSubmitting(false);
    }
  }

  async function saveAvailability() {
    if (!doctorId || !session) {
      return;
    }
    setSavingAvailability(true);
    try {
      const sanitized = normalizeAvailability(availabilityDraft);
      await mutateSummary((current) => current ? { ...current, availability: sanitized } : current, { revalidate: false });
      await availabilityQuery.mutate(sanitized, { revalidate: false });
      patchDoctorAvailabilityCache(sanitized);
      await apiRequest(session, `/doctors/${doctorId}/availability`, {
        method: "PUT",
        body: { availability: sanitized }
      });
      showDoctorNotice("Availability updated.", "success");
      revalidateDoctorGroups(isProxyDoctorPathKey, isProxyAppointmentsKey);
      await autoRefreshDoctorLists(doctorSummaryKey, doctorAvailabilityKey, doctorAppointmentsKey);
    } catch (error) {
      await availabilityQuery.mutate();
      await mutateSummary();
      showDoctorNotice(error?.message || "Availability could not be saved.", "error");
    } finally {
      setSavingAvailability(false);
    }
  }

  function handleAvailabilityChange(updater) {
    availabilityUserEditedRef.current = true;
    setAvailabilityDraft(updater);
  }

  async function runAvailabilityAutoSave() {
    if (availabilitySavingRef.current) {
      availabilityResavePendingRef.current = true;
      return;
    }
    availabilitySavingRef.current = true;
    try {
      await saveAvailability();
    } finally {
      availabilitySavingRef.current = false;
      if (availabilityResavePendingRef.current) {
        availabilityResavePendingRef.current = false;
        runAvailabilityAutoSave();
      }
    }
  }

  useEffect(() => {
    if (!availabilityUserEditedRef.current) {
      return;
    }
    availabilityUserEditedRef.current = false;
    if (availabilityAutoSaveTimerRef.current) {
      clearTimeout(availabilityAutoSaveTimerRef.current);
    }
    availabilityAutoSaveTimerRef.current = setTimeout(() => {
      runAvailabilityAutoSave();
    }, 700);
    return () => {
      if (availabilityAutoSaveTimerRef.current) {
        clearTimeout(availabilityAutoSaveTimerRef.current);
      }
    };
  }, [availabilityDraft]);

  async function saveDoctorDisplayName(nextValue) {
    const normalized = String(nextValue || "").trim();
    const currentDisplayName = String(state.doctor?.display_name || "").trim();
    if (!normalized) {
      setDoctorSettings((current) => ({ ...current, displayName: currentDisplayName || current.displayName }));
      showDoctorNotice("Display name is required.", "error");
      return;
    }
    if (!session || !doctorId || normalized === currentDisplayName) {
      return;
    }

    try {
      const updatedDoctor = await apiRequest(session, `/doctors/${doctorId}`, {
        method: "PUT",
        body: { display_name: normalized }
      });
      if (!updatedDoctor) {
        throw new Error("The doctor profile update returned no data.");
      }

      const persistedName = String(updatedDoctor.display_name || normalized);
      setDoctorSettings((current) => ({ ...current, displayName: persistedName }));
      setSession((current) => current ? {
        ...current,
        user: current.user ? { ...current.user, display_name: persistedName, name: persistedName } : current.user
      } : current);
      await mutateSummary((current) => current ? { ...current, doctor: updatedDoctor } : current, { revalidate: false });

      if (typeof window !== "undefined") {
        try {
          const stored = JSON.parse(window.localStorage.getItem(FRONTENDS.doctor.storageKey) || "{}");
          window.localStorage.setItem(FRONTENDS.doctor.storageKey, JSON.stringify({
            ...stored,
            user: stored.user ? { ...stored.user, display_name: persistedName, name: persistedName } : stored.user
          }));
        } catch {
          // Keep the live state as the source of truth even if the local session cache cannot be rewritten.
        }
      }

      revalidateDoctorGroups(isProxyDashboardDoctorKey);
      await autoRefreshDoctorLists(doctorSummaryKey);
      showDoctorNotice("Display name updated. Patients and emails will use this name.", "success");
    } catch (error) {
      setDoctorSettings((current) => ({ ...current, displayName: currentDisplayName || current.displayName }));
      showDoctorNotice(error?.message || "The display name update failed.", "error");
    }
  }

  async function handleDoctorAvatarUploaded(updatedDoctor) {
    if (!updatedDoctor) {
      return;
    }
    setSession((current) => current ? {
      ...current,
      user: current.user ? { ...current.user, avatar_url: updatedDoctor.avatar_url } : current.user
    } : current);
    await mutateSummary((current) => current ? { ...current, doctor: updatedDoctor } : current, { revalidate: false });

    if (typeof window !== "undefined") {
      try {
        const stored = JSON.parse(window.localStorage.getItem(FRONTENDS.doctor.storageKey) || "{}");
        window.localStorage.setItem(FRONTENDS.doctor.storageKey, JSON.stringify({
          ...stored,
          user: stored.user ? { ...stored.user, avatar_url: updatedDoctor.avatar_url } : stored.user
        }));
      } catch {
        // Keep the live state as the source of truth even if the local session cache cannot be rewritten.
      }
    }

    revalidateDoctorGroups(isProxyDashboardDoctorKey);
    await autoRefreshDoctorLists(doctorSummaryKey);
    showDoctorNotice("Profile photo updated.", "success");
  }

  function handleDoctorAvatarUploadError(message) {
    showDoctorNotice(message || "Profile photo could not be updated.", "error");
  }

  async function handleLogout() {
    if (logoutBusy) {
      return;
    }
    setLogoutBusy(true);
    try {
      await performGlobalLogout(FRONTENDS.doctor, session || hydrateStoredSession("doctor"));
      router.replace("/admin/doctor/login");
    } catch {
      setLogoutBusy(false);
    }
  }

  const sortedAppointments = useMemo(
    () => [...state.appointments].sort((left, right) => new Date(right.start_at || 0) - new Date(left.start_at || 0)),
    [state.appointments]
  );
  const reviews = state.reviews?.reviews || [];
  const reviewSummary = state.reviews?.summary || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const paidAppointments = state.appointments.filter((item) => item.payment_status === "paid");
  const estimatedRevenue = paidAppointments.reduce((sum) => sum + doctorConsultationFee(state.doctor), 0);
  const storeCurrency = state.dashboard?.store_currency || storedStoreCurrency();
  const dashboardRevealSignature = useMemo(
    () => buildSWRRevealSignature([
      state.appointments,
      state.orders,
      state.products,
      state.patients,
      reviews
    ]),
    [reviews, state.appointments, state.orders, state.patients, state.products]
  );
  const dashboardRevealActive = useSWRReveal(dashboardRevealSignature, { durationMs: 260 });
  const dashboardRevealClassName = `dashboard-swr-reveal ${dashboardRevealActive ? "is-active" : ""}`.trim();
  useEffect(() => {
    rememberStoreContext(state.dashboard || state.doctor || {});
  }, [state.dashboard, state.doctor]);
  const pageQueryLoading = (
    ((page === "overview" || page === "consultations") && appointmentsQuery.isLoading && !appointmentsQuery.data) ||
    (page === "overview" && ordersQuery.isLoading && !ordersQuery.data) ||
    ((page === "overview" || page === "reviews") && reviewsQuery.isLoading && !reviewsQuery.data) ||
    (page === "availability" && availabilityQuery.isLoading && !availabilityQuery.data) ||
    (page === "settings" && ((appointmentsQuery.isLoading && !appointmentsQuery.data) || (availabilityQuery.isLoading && !availabilityQuery.data)))
  );
  const showSkeleton = (isLoading && !hasDoctorDashboardData(state)) || pageQueryLoading;

  useEffect(() => {
    if (state.error) {
      showDoctorNotice(state.error, "warning");
    }
  }, [state.error]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const fitStats = () => {
      document.querySelectorAll(".overview-action-value, .doctor-profile-metrics strong, .doctor-insight-card strong, .doctor-settings-summary strong, .metric-card strong, .mini-stat strong, .doctor-mobile-metric-value").forEach((node) => {
        fitTextToContainer(node, { minFontSize: 12, step: 0.5 });
      });
    };
    fitStats();
    window.addEventListener("resize", fitStats);
    return () => window.removeEventListener("resize", fitStats);
  }, [showSkeleton, page, state.appointments.length, state.orders.length, state.products.length, state.patients.length]);

  if (!authResolved) {
    return null;
  }

  const dashboardContent = <>
    {snackbar ? <div className={`snackbar ${snackbar.tone || "warning"}`} role="status" aria-live="polite">
      <div className="snackbar-copy">
        <strong className="snackbar-title">{snackbar.tone === "success" ? "Success" : snackbar.tone === "error" ? "Error" : snackbar.tone === "warning" ? "Warning" : "Notice"}</strong>
        <span className="snackbar-message">{snackbar.message}</span>
      </div>
      {snackbar.actionLabel ? <div className="snackbar-actions">
        <button className="snackbar-action" type="button" onClick={() => snackbar.onAction?.()}>{snackbar.actionLabel}</button>
      </div> : null}
    </div> : null}
    {showSkeleton ? <DoctorDashboardSkeleton page={page} /> : null}
    {!showSkeleton && page === "overview" ? <DoctorOverview
      doctor={state.doctor}
      dashboard={state.dashboard}
      appointments={sortedAppointments}
      orders={state.orders}
      patients={state.patients}
      reviews={reviews}
      reviewSummary={reviewSummary}
      estimatedRevenue={estimatedRevenue}
      storeCurrency={storeCurrency}
      onOpenConsultations={() => setPage("consultations")}
    /> : null}
    {!showSkeleton && page === "consultations" ? <ConsultationsPage
      appointments={state.appointments}
      onConfirm={(appointmentId) => handleAppointmentAction(appointmentId, "confirm")}
      onComplete={openCompleteAppointmentModal}
      /> : null}
    {!showSkeleton && page === "availability" ? <AvailabilityPage
      availabilityDraft={availabilityDraft}
      bookingIntervalMinutes={bookingIntervalMinutes}
      onChange={handleAvailabilityChange}
      saving={savingAvailability}
    /> : null}
    {!showSkeleton && page === "settings" ? <DoctorSettingsPage
      doctor={state.doctor}
      session={session}
      doctorId={doctorId}
      settings={doctorSettings}
      onSettingsChange={setDoctorSettings}
      onSaveDisplayName={saveDoctorDisplayName}
      onAvatarUploaded={handleDoctorAvatarUploaded}
      onAvatarUploadError={handleDoctorAvatarUploadError}
    /> : null}
    {completionModal.open ? <AppointmentCompletionModal
      appointment={state.appointments.find((item) => String(item.id) === String(completionModal.appointmentId)) || null}
      products={state.products}
      draft={completionDraft}
      onChange={setCompletionDraft}
      onClose={closeCompleteAppointmentModal}
      onSubmit={submitAppointmentCompletion}
      submitting={completionSubmitting}
    /> : null}
  </>;

  const mobileDashboardContent = <>
    {snackbar ? <div className={`snackbar ${snackbar.tone || "warning"}`} role="status" aria-live="polite">
      <div className="snackbar-copy">
        <strong className="snackbar-title">{snackbar.tone === "success" ? "Success" : snackbar.tone === "error" ? "Error" : snackbar.tone === "warning" ? "Warning" : "Notice"}</strong>
        <span className="snackbar-message">{snackbar.message}</span>
      </div>
      {snackbar.actionLabel ? <div className="snackbar-actions">
        <button className="snackbar-action" type="button" onClick={() => snackbar.onAction?.()}>{snackbar.actionLabel}</button>
      </div> : null}
    </div> : null}
    {showSkeleton ? <DoctorDashboardSkeleton page={page} /> : null}
    {!showSkeleton && page === "overview" ? <DoctorMobileOverview
      doctor={state.doctor}
      dashboard={state.dashboard}
      appointments={state.appointments}
      orders={state.orders}
      estimatedRevenue={estimatedRevenue}
      storeCurrency={storeCurrency}
      searchTerm={mobileSearchTerm}
      onOpenConsultations={() => setPage("consultations")}
    /> : null}
    {!showSkeleton && page === "consultations" ? <DoctorMobileConsultationsPage
      appointments={state.appointments}
      searchTerm={mobileSearchTerm}
      onComplete={openCompleteAppointmentModal}
    /> : null}
    {!showSkeleton && page === "availability" ? <DoctorMobileAvailabilityPage
      availabilityDraft={availabilityDraft}
      bookingIntervalMinutes={bookingIntervalMinutes}
      onChange={handleAvailabilityChange}
      saving={savingAvailability}
    /> : null}
    {!showSkeleton && page === "settings" ? <DoctorMobileSettingsPage
      doctor={state.doctor}
      session={session}
      doctorId={doctorId}
      settings={doctorSettings}
      onSettingsChange={setDoctorSettings}
      onSaveDisplayName={saveDoctorDisplayName}
      onAvatarUploaded={handleDoctorAvatarUploaded}
      onAvatarUploadError={handleDoctorAvatarUploadError}
    /> : null}
    {completionModal.open ? <AppointmentCompletionModal
      appointment={state.appointments.find((item) => String(item.id) === String(completionModal.appointmentId)) || null}
      products={state.products}
      draft={completionDraft}
      onChange={setCompletionDraft}
      onClose={closeCompleteAppointmentModal}
      onSubmit={submitAppointmentCompletion}
      submitting={completionSubmitting}
    /> : null}
  </>;

  if (isDoctorMobile) {
    return <DoctorMobileShell
      doctor={state.doctor}
      pages={pages}
      active={page}
      onPageChange={setPage}
      contentClassName={dashboardRevealClassName}
      pageLabels={doctorPageLabels}
      renderNavIcon={renderDoctorNavIcon}
      searchTerm={mobileSearchTerm}
      onSearchTermChange={setMobileSearchTerm}
      onLogout={handleLogout}
      logoutBusy={logoutBusy}
    >
      {mobileDashboardContent}
    </DoctorMobileShell>;
  }

  return <RoleShell
    title="Nevari Doctor"
    pages={pages}
    active={page}
    onPageChange={setPage}
    pageBodyClassName={dashboardRevealClassName}
    renderNavIcon={renderDoctorNavIcon}
    pageLabels={doctorPageLabels}
    onLogout={handleLogout}
    logoutBusy={logoutBusy}
    showHeader={false}
    sidebarFooter={<div
      className="customer-desktop-sidebar-profile"
      role="button"
      tabIndex={0}
      aria-label="Open profile settings"
      onClick={() => setPage("settings")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setPage("settings");
        }
      }}
    >
      <div className="customer-mobile-avatar customer-desktop-sidebar-avatar">
        {state.doctor?.avatar_url ? <img src={state.doctor.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
        <span style={{ display: state.doctor?.avatar_url ? "none" : "inline" }}>{initials(state.doctor?.display_name || "Doctor")}</span>
      </div>
      <div className="customer-desktop-sidebar-profile-copy">
        <strong>{state.doctor?.display_name || "Doctor"}</strong>
        <span>{state.doctor?.email || ""}</span>
      </div>
    </div>}
  >
    {dashboardContent}
  </RoleShell>;
}

function ConsultationsPage({ appointments, onConfirm, onComplete }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState("upcoming");
  const [filter, setFilter] = useState("all");
  const [pageNumber, setPageNumber] = useState(1);
  const [detailAppointment, setDetailAppointment] = useState(null);
  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((left, right) => {
      const rightStart = new Date(right?.start_at || 0).getTime();
      const leftStart = new Date(left?.start_at || 0).getTime();
      if (rightStart !== leftStart) {
        return rightStart - leftStart;
      }
      const rightCreated = new Date(right?.created_at || 0).getTime();
      const leftCreated = new Date(left?.created_at || 0).getTime();
      return rightCreated - leftCreated;
    });
  }, [appointments]);
  const filteredAppointments = useMemo(() => {
    return sortedAppointments.filter((appointment) => {
      const startAtMs = Date.parse(appointment?.start_at || "");
      const patientName = String(appointment.patient?.display_name || "").toLowerCase();
      const reason = String(appointment.reason || "").toLowerCase();
      const paymentStatus = String(appointment.payment_status || "").toLowerCase();
      const bookingStatus = String(appointment.status || "").toLowerCase();
      const isPastAppointment = !Number.isFinite(startAtMs) || startAtMs <= Date.now();
      const matchesSearch = !searchTerm.trim()
        || patientName.includes(searchTerm.trim().toLowerCase())
        || reason.includes(searchTerm.trim().toLowerCase())
        || paymentStatus.includes(searchTerm.trim().toLowerCase())
        || bookingStatus.includes(searchTerm.trim().toLowerCase());

      if (!matchesSearch) {
        return false;
      }
      if (timeFilter === "upcoming" && isPastAppointment) {
        return false;
      }
      if (timeFilter === "upcoming" && paymentStatus === "failed") {
        return false;
      }
      if (timeFilter === "past" && !isPastAppointment) {
        return false;
      }
      if (filter === "confirmed") {
        return bookingStatus === "confirmed";
      }
      if (filter === "pending") {
        return ["requested", "pending_review", "awaiting_payment"].includes(bookingStatus) || paymentStatus !== "paid";
      }
      if (filter === "payment-issue") {
        return ["failed", "unpaid"].includes(paymentStatus) || bookingStatus === "awaiting_payment";
      }
      return true;
    });
  }, [sortedAppointments, filter, searchTerm, timeFilter]);

  const stats = useMemo(() => ({
    total: sortedAppointments.length,
    paid: sortedAppointments.filter((item) => String(item.payment_status || "").toLowerCase() === "paid").length,
    confirmed: sortedAppointments.filter((item) => String(item.status || "").toLowerCase() === "confirmed").length,
    pending: sortedAppointments.filter((item) => ["requested", "awaiting_payment", "pending_review"].includes(String(item.status || "").toLowerCase())).length,
    failed: sortedAppointments.filter((item) => ["failed", "unpaid"].includes(String(item.payment_status || "").toLowerCase())).length
  }), [sortedAppointments]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredAppointments.length / pageSize));
  const paginatedAppointments = useMemo(() => {
    const startIndex = (pageNumber - 1) * pageSize;
    return filteredAppointments.slice(startIndex, startIndex + pageSize);
  }, [filteredAppointments, pageNumber]);

  useEffect(() => {
    setPageNumber(1);
  }, [filter, searchTerm, timeFilter]);

  useEffect(() => {
    if (pageNumber > pageCount) {
      setPageNumber(pageCount);
    }
  }, [pageCount, pageNumber]);

  return <section className="page-view active" data-page-panel="consultations">
    <section className="consultations-panel consultation-table-page" aria-label="Consultations workspace">
      <section className="consultation-filter-card">
        <div className="consultation-pane-head">
          <div>
            <h2 className="consultation-pane-title">All appointments</h2>
            <p className="consultation-subcopy">Search, filter, and open any doctor appointment from the full booking history.</p>
          </div>
          <div className="consultation-filter-controls">
            <label className="consultation-search" aria-label="Search appointments">
              <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Zm5.3-2 4.4 4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search patient, status or reason" />
            </label>
          </div>
        </div>
        <div className="consultation-summary-grid">
          
          <div className="consultation-table-side">
            <div className="consultation-stats" aria-label="Appointment statistics">
              <div className="consultation-stat-card"><span className="consultation-stat-label">Paid</span><span className="consultation-stat-value">{stats.paid}</span></div>
              <div className="consultation-stat-card"><span className="consultation-stat-label">Confirmed</span><span className="consultation-stat-value">{stats.confirmed}</span></div>
              <div className="consultation-stat-card"><span className="consultation-stat-label">Pending</span><span className="consultation-stat-value">{stats.pending}</span></div>
              <div className="consultation-stat-card"><span className="consultation-stat-label">Failed</span><span className="consultation-stat-value">{stats.failed}</span></div>
            </div>
            <div className="consultation-filters consultation-time-filters" aria-label="Appointment time filters">
              {[
                ["upcoming", "Upcoming"],
                ["past", "Past"]
              ].map(([value, label]) => <button className={`filter-pill ${timeFilter === value ? "active" : ""}`.trim()} key={value} type="button" onClick={() => setTimeFilter(value)}>{label}</button>)}
            </div>
          </div>
        </div>
      </section>
      <DoctorAppointmentsTable
        appointments={paginatedAppointments}
        totalAppointments={filteredAppointments.length}
        page={pageNumber}
        pageCount={pageCount}
        onPageChange={setPageNumber}
        onOpenDetails={setDetailAppointment}
        filter={filter}
        onFilterChange={setFilter}
      />
    </section>
    {detailAppointment ? <DoctorAppointmentDetailsModal
      appointment={detailAppointment}
      onConfirm={onConfirm}
      onComplete={onComplete}
      onClose={() => setDetailAppointment(null)}
    /> : null}
  </section>;
}

function DoctorAppointmentsTable({ appointments, totalAppointments, page, pageCount, onPageChange, onOpenDetails, filter = "all", onFilterChange = null }) {
  return <section className="table-panel doctor-appointments-panel">
    <div className="appointment-panel-header">
      <div className="doctor-appointments-header-copy">
        <h2>Appointments list</h2>
        <div className="consultation-filters consultation-status-filters" aria-label="Appointment status filters">
          {[
            ["all", "All appointments"],
            ["confirmed", "Confirmed"],
            ["pending", "Pending review"],
            ["payment-issue", "Payment issue"]
          ].map(([value, label]) => <button
            className={`filter-pill appointment-list-filter-pill ${filter === value ? "active" : ""}`.trim()}
            key={value}
            type="button"
            onClick={() => onFilterChange?.(value)}
          >
            {label}
          </button>)}
        </div>
      </div>
      <span className="doctor-table-count">{totalAppointments} {totalAppointments === 1 ? "appointment" : "appointments"}</span>
    </div>
    <div className="table-scroll doctor-appointments-table-wrap">
      <table className="doctor-appointments-table">
        <colgroup>
          <col className="doctor-col-patient" />
          <col className="doctor-col-reason" />
          <col className="doctor-col-scheduled" />
          <col className="doctor-col-payment" />
          <col className="doctor-col-status" />
        </colgroup>
        <thead>
          <tr>
            {["Patient", "Reason", "Scheduled", "Payment", "Status"].map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {appointments.length ? appointments.map((appointment) => {
            const patientName = appointment.patient?.display_name || `Patient #${appointment.patient_user_id}`;
            return <tr
              key={appointment.id}
              className="doctor-appointment-row"
              role="button"
              tabIndex={0}
              aria-label={`Open appointment details for ${patientName}`}
              onClick={() => onOpenDetails(appointment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDetails(appointment);
                }
              }}
            >
              <td><div className="doctor-table-meta"><strong className="doctor-table-cell-name">{patientName}</strong><span>{appointment.patient?.email || "Not available"}</span></div></td>
              <td><div className="doctor-table-meta"><strong className="doctor-table-cell-strong">{titleCase(appointment.type || "consultation")}</strong><span>{appointment.reason || "Consultation booking"}</span></div></td>
              <td><div className="doctor-table-meta"><strong className="doctor-table-cell-strong">{formatDoctorAppointmentWindow(appointment.start_at, appointment.end_at)}</strong><span>{appointment.created_at ? `Booked ${formatDoctorDateTimeCompact(appointment.created_at)}` : "Booked time unavailable"}</span></div></td>
              <td><span className={`status-pill ${doctorAppointmentPaymentTone(appointment)}`}>{titleCase(appointment.payment_status || "pending")}</span></td>
              <td><span className={`status-pill ${doctorAppointmentDisplayStatusTone(appointment)}`}>{doctorAppointmentDisplayStatusLabel(appointment)}</span></td>
            </tr>;
          }) : <tr><td colSpan={5} className="muted doctor-table-empty">No appointments match the active filters.</td></tr>}
        </tbody>
      </table>
    </div>
    {pageCount > 1 ? <DoctorAppointmentsPagination page={page} pageCount={pageCount} onPageChange={onPageChange} /> : null}
  </section>;
}

function DoctorAppointmentsPagination({ page, pageCount, onPageChange }) {
  return <div className="doctor-pagination" aria-label="Appointments pagination">
    <button className="btn secondary small" type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
    <div className="doctor-pagination-status">
      <strong>Page {page}</strong>
      <span>of {pageCount}</span>
    </div>
    <button className="btn secondary small" type="button" disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>Next</button>
  </div>;
}

function DoctorAppointmentDetailsModal({ appointment, onConfirm, onComplete, onClose }) {
  const session = hydrateStoredSession("doctor");
  const canConfirm = appointment?.status === "requested" && typeof onConfirm === "function";
  const canComplete = canDoctorAppointmentComplete(appointment) && typeof onComplete === "function";
  const patientName = appointment?.patient?.display_name || `Patient #${appointment?.patient_user_id || ""}`;
  const paymentStatus = titleCase(appointment?.payment_status || "pending");
  const bookingStatus = doctorAppointmentDisplayStatusLabel(appointment);
  const singleStatusPill = appointment?.detailStatusMode === "single";
  const primaryStatusTone = doctorAppointmentDisplayStatusTone(appointment);
  const calendarUrl = buildUrl(session, `/appointments/${appointment?.id}/calendar`);
  const joinUrl = doctorAppointmentIsUpcoming(appointment) ? resolveDoctorDashboardJoinUrl(appointment) : "";
  const detailRows = [
    ["Patient", patientName],
    ["Email", appointment?.patient?.email || "Not available"],
    ["Reason", appointment?.reason || "Consultation booking"],
    ["Type", titleCase(appointment?.type || "consultation")],
    ["Scheduled", formatDoctorAppointmentWindow(appointment?.start_at, appointment?.end_at)],
    ["Booked", appointment?.created_at ? formatDoctorDateTimeCompact(appointment.created_at) : "Not available"],
    ["Time zone", appointment?.timezone || "UTC"],
    ["Payment", paymentStatus],
    ["Status", bookingStatus],
    ["Order", appointment?.order_id ? `#${appointment.order_id}` : "Not linked"],
    ["Appointment ID", `#${appointment?.id || ""}`]
  ];

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

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(<div className="customer-appointment-modal" role="dialog" aria-modal="true" aria-label="Appointment details">
    <ModalScrim className="customer-modal-scrim customer-appointment-modal-backdrop" label="Close appointment details" onDismiss={onClose} />
    <section className="customer-appointment-detail-card doctor-appointment-detail-popup">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Appointment details</span>
          <h2>{patientName}</h2>
        </div>
        <button className="icon-btn" type="button" aria-label="Close appointment details" onClick={onClose}>x</button>
      </div>
      <div className="customer-detail-summary-panel">
        <div className="customer-detail-summary-head">
          <span className="customer-detail-summary-icon"><HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.8} /></span>
          <div>
            <div className="customer-detail-summary-title">{formatDoctorDateLong(appointment?.start_at)}</div>
            <div className="customer-detail-summary-sub">{formatDoctorTime(appointment?.start_at)} • {appointment?.timezone || "UTC"}</div>
          </div>
          <div className="doctor-detail-pill-stack">
            {singleStatusPill ? <span className={`doctor-detail-pill ${primaryStatusTone}`}>{bookingStatus}</span> : <>
              <span className={`doctor-detail-pill ${doctorAppointmentPaymentTone(appointment)}`}>{paymentStatus}</span>
              <span className={`doctor-detail-pill ${doctorAppointmentDisplayStatusTone(appointment)}`}>{bookingStatus}</span>
            </>}
          </div>
        </div>
      </div>
      <div className="detail-section">
        <h3 className="detail-section-title">Appointment information</h3>
        <div className="detail-card info-list">
          {detailRows.map(([label, value]) => <div className="info-row" key={label}>
            <span className="info-label">{label}</span>
            <strong className="info-value">{value}</strong>
          </div>)}
        </div>
      </div>
      {appointment?.doctor_notes ? <div className="detail-section">
        <h3 className="detail-section-title">Doctor notes</h3>
        <div className="note-card">{appointment.doctor_notes}</div>
      </div> : null}
      <div className="action-stack">
        {joinUrl ? <a className="btn btn-primary btn-wide" href={joinUrl} target="_blank" rel="noreferrer">Join appointment</a> : null}
        <a className="btn btn-outline btn-wide" href={calendarUrl} target="_blank" rel="noreferrer">Download calendar file</a>
        {canConfirm ? <button className="btn btn-primary btn-wide" type="button" onClick={() => onConfirm(appointment.id)}>Confirm appointment</button> : null}
        {canComplete ? <button className="btn btn-primary btn-wide" type="button" onClick={() => onComplete(appointment.id)}>Complete appointment</button> : null}
      </div>
    </section>
  </div>, document.body);
}

function AppointmentDetailCard({ appointment, onConfirm, onComplete, featured = false }) {
  const session = hydrateStoredSession("doctor");
  const canConfirm = appointment.status === "requested";
  const canComplete = canDoctorAppointmentComplete(appointment);
  const calendarUrl = buildUrl(session, `/appointments/${appointment.id}/calendar`);
  const joinUrl = doctorAppointmentIsUpcoming(appointment) ? resolveDoctorDashboardJoinUrl(appointment) : "";
  const patientName = appointment.patient?.display_name || `Patient #${appointment.patient_user_id}`;
  const paymentStatus = titleCase(appointment.payment_status || "pending");
  const bookingStatus = doctorAppointmentDisplayStatusLabel(appointment);

  return <details className={`appointment-card ${featured ? "featured" : ""}`.trim()} open={featured}>
    <summary className="appointment-top" aria-label={`Toggle appointment details for ${patientName}`}>
      <div>
        <h3 className="patient-name">{patientName}</h3>
        <p className="appointment-meta">{titleCase(appointment.type || "consultation")} - {formatDoctorDateTimeCompact(appointment.start_at)}</p>
      </div>
      <div className="consultation-badge-row" aria-label="Appointment status">
        <span className={`consultation-badge ${doctorAppointmentPaymentTone(appointment)}`}>{paymentStatus}</span>
        <span className={`consultation-badge ${doctorAppointmentDisplayStatusTone(appointment)}`}>{bookingStatus}</span>
      </div>
      <span className="appointment-collapse" aria-hidden="true">
        <svg className="appointment-chevron" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </summary>

    <div className="appointment-body">
      <div className="consultation-detail-grid">
        <DoctorDetailBox label="Patient" value={patientName} />
        <DoctorDetailBox label="Email" value={appointment.patient?.email || "Not available"} />
        <DoctorDetailBox label="Reason" value={appointment.reason || "Consultation booking"} />
        <DoctorDetailBox label="Time zone" value={appointment.timezone || "UTC"} />
        <DoctorDetailBox label="Booked time" value={appointment.created_at ? formatDoctorDateTimeCompact(appointment.created_at) : "Not available"} />
        <DoctorDetailBox label="Consultation time" value={formatDoctorAppointmentWindow(appointment.start_at, appointment.end_at)} />
        <DoctorDetailBox label="Review" value={appointment.review ? `${Number(appointment.review.rating || 0).toFixed(1)} / 5` : "Pending"} />
        <DoctorDetailBox label="Order" value={appointment.order_id ? `#${appointment.order_id}` : "Not linked"} />
      </div>
      {appointment.doctor_notes ? <div className="doctor-appointment-note"><span>Doctor remarks</span><p>{appointment.doctor_notes}</p></div> : null}
      <div className="appointment-actions">
        {joinUrl ? <a className="btn primary small" href={joinUrl} target="_blank" rel="noreferrer">Join appointment</a> : null}
        <a className="btn secondary small" href={calendarUrl} target="_blank" rel="noreferrer">Calendar file</a>
        {canConfirm ? <button className="btn primary small" type="button" onClick={() => onConfirm(appointment.id)}>Confirm</button> : null}
        {canComplete ? <button className="btn primary small" type="button" onClick={() => onComplete(appointment.id)}>Mark complete</button> : null}
      </div>
    </div>
  </details>;
}

function AppointmentCompletionModal({ appointment, products, draft, onChange, onClose, onSubmit, submitting }) {
  const patientName = appointment?.patient?.display_name || `Patient #${appointment?.patient_user_id || ""}`;
  const selectedProducts = Array.isArray(products) ? products : [];

  function setField(key, value) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  function setProductQuantity(productId, value) {
    const normalized = Math.max(0, Number.parseInt(value, 10) || 0);
    onChange((current) => ({
      ...current,
      productQuantities: {
        ...(current.productQuantities || {}),
        [productId]: normalized
      }
    }));
  }

  return <div className="doctor-completion-modal" role="dialog" aria-modal="true" aria-label="Complete appointment">
    <ModalScrim className="doctor-completion-backdrop" label="Close completion modal" onDismiss={onClose} />
    <section className="doctor-completion-card">
      <div className="doctor-completion-head">
        <div>
          <h3>Complete consultation</h3>
          <p>{patientName}</p>
        </div>
        <button className="pill-button" type="button" onClick={onClose} disabled={submitting}>Close</button>
      </div>
      <label className="customer-mobile-field">
        <span>Doctor remarks</span>
        <textarea rows={5} value={draft.doctorNotes} onChange={(event) => setField("doctorNotes", event.target.value)} />
      </label>
      <label className="customer-mobile-field">
        <span>Diagnosis / follow-up summary</span>
        <textarea rows={3} value={draft.diagnosis} onChange={(event) => setField("diagnosis", event.target.value)} />
      </label>
      <div className="doctor-completion-products">
        <div className="doctor-completion-products-head">
          <strong>Create follow-up product order</strong>
          <span>Optional. Quantities above zero will be prescribed and emailed to the patient with a payment link.</span>
        </div>
        {selectedProducts.length ? selectedProducts.map((product) => (
          <label className="doctor-completion-product-row" key={product.id}>
            <div>
              <strong>{product.name}</strong>
              <span>{money(product.price, storedStoreCurrency())}</span>
            </div>
            <input
              type="number"
              min="0"
              value={draft.productQuantities?.[product.id] || ""}
              onChange={(event) => setProductQuantity(product.id, event.target.value)}
              placeholder="0"
            />
          </label>
        )) : <p className="muted">No doctor-linked products are available.</p>}
      </div>
      <div className="doctor-completion-actions">
        <button className="pill-button danger" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
        <button className="button-primary" type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? <BrandedSpinner label="Completing consultation" /> : "Complete consultation"}
        </button>
      </div>
    </section>
  </div>;
}

function MtmQueuePage({ requests, selectedRequestId, onSelectRequest, onApprove, onFollowUp, onComplete, onSaveActionPlan, feedback }) {
  const [planNotes, setPlanNotes] = useState("");
  const [planProducts, setPlanProducts] = useState("");
  const selectedRequest = requests.find((item) => String(item.id) === String(selectedRequestId)) || requests[0] || null;

  useEffect(() => {
    if (!selectedRequestId && requests.length) {
      onSelectRequest(requests[0].id);
    }
  }, [onSelectRequest, requests, selectedRequestId]);

  useEffect(() => {
    setPlanNotes("");
    setPlanProducts("");
  }, [selectedRequest?.id]);

  return <section className="doctor-consultation-layout">
    <aside className="panel role-calendar-panel">
      <div className="panel-header"><h2>MTM Requests</h2></div>
      <div className="doctor-availability-note">Review MTM cases, approve consultations, and record the Medication Action Plan.</div>
      {requests.length ? requests.map((request) => (
        <button
          key={request.id}
          type="button"
          className={`doctor-availability-card ${String(selectedRequest?.id) === String(request.id) ? "active" : ""}`}
          onClick={() => onSelectRequest(request.id)}
        >
          <div className="doctor-availability-head">
            <strong>{request.patient?.name || request.patient?.fullName || `MTM #${request.id}`}</strong>
            <span className="status-badge warning">{titleCase(request.status)}</span>
          </div>
          <div className="doctor-availability-note">{request.medical_history?.primaryDiagnosis || request.additional_information?.reasonForDiscontinuation || "No summary available."}</div>
        </button>
      )) : <div className="empty-card compact-empty"><div className="card-title">No MTM requests available.</div></div>}
    </aside>
    <section className="doctor-appointment-stack">
      <div className="panel-header"><h2>MTM Detail</h2></div>
      {feedback ? <p className="receipt-feedback">{feedback}</p> : null}
      {selectedRequest ? <article className="doctor-appointment-detail-card">
        <div className="doctor-appointment-detail-head">
          <div>
            <h3>{selectedRequest.patient?.name || "Patient"}</h3>
            <p>MTM request - {shortDate(selectedRequest.created_at)} - {titleCase(selectedRequest.status)}</p>
          </div>
          <div className="doctor-appointment-status-group">
            <span className={`status-badge ${selectedRequest.status === "approved" ? "success" : "warning"}`}>{titleCase(selectedRequest.status)}</span>
          </div>
        </div>
        <div className="doctor-appointment-grid">
          <div><span>Primary diagnosis</span><strong>{selectedRequest.medical_history?.primaryDiagnosis || "n/a"}</strong></div>
          <div><span>Medication</span><strong>{selectedRequest.medication_profile?.medicationName || "n/a"}</strong></div>
          <div><span>Assigned doctor</span><strong>{selectedRequest.assigned_doctor_user_id ? `Doctor #${selectedRequest.assigned_doctor_user_id}` : "Pending"}</strong></div>
          <div><span>Scheduled at</span><strong>{selectedRequest.scheduled_at ? shortDate(selectedRequest.scheduled_at, true) : "Not scheduled"}</strong></div>
        </div>
        <div className="doctor-availability-note">
          Adherence barriers: {(selectedRequest.adherence_assessment?.barriers || []).join(", ") || "None"}
        </div>
        <div className="doctor-appointment-actions">
          <button className="button-primary" type="button" onClick={() => onApprove(selectedRequest.id)}>Approve</button>
          <button className="pill-button" type="button" onClick={() => onFollowUp(selectedRequest.id)}>Follow Up</button>
          <button className="button-primary" type="button" onClick={() => onComplete(selectedRequest.id)}>Complete</button>
        </div>
        <div className="doctor-availability-note">Medication Action Plan</div>
        <label className="customer-mobile-field">
          <span>Plan notes</span>
          <textarea rows={4} value={planNotes} onChange={(event) => setPlanNotes(event.target.value)} />
        </label>
        <label className="customer-mobile-field">
          <span>Attach products (comma-separated)</span>
          <input value={planProducts} onChange={(event) => setPlanProducts(event.target.value)} />
        </label>
        <div className="doctor-appointment-actions">
          <button
            className="pill-button"
            type="button"
            onClick={() => onSaveActionPlan(selectedRequest.id, {
              notes: planNotes,
              products: planProducts.split(",").map((value) => value.trim()).filter(Boolean),
            })}
          >
            Save Action Plan
          </button>
        </div>
      </article> : <div className="empty-card compact-empty"><div className="card-title">Select an MTM request.</div></div>}
    </section>
  </section>;
}

function AvailabilityPage({ availabilityDraft, bookingIntervalMinutes, onChange, saving }) {
  const timeFrames = useMemo(() => buildAvailabilityTimeFrames(bookingIntervalMinutes), [bookingIntervalMinutes]);
  const selectedFramesByDay = useMemo(() => {
    return weekdays.reduce((accumulator, day) => ({
      ...accumulator,
      [day]: getSelectedAvailabilityFrames(availabilityDraft[day], bookingIntervalMinutes, timeFrames)
    }), {});
  }, [availabilityDraft, bookingIntervalMinutes, timeFrames]);
  const activeDays = weekdays.filter((day) => selectedFramesByDay[day].length).length;
  const totalSlots = weekdays.reduce((sum, day) => sum + selectedFramesByDay[day].length, 0);
  const morningFrames = timeFrames.filter((time) => timeStringToMinutes(time) < 12 * 60);
  const afternoonFrames = timeFrames.filter((time) => timeStringToMinutes(time) >= 12 * 60 && timeStringToMinutes(time) < 17 * 60);
  const eveningFrames = timeFrames.filter((time) => timeStringToMinutes(time) >= 17 * 60);

  function applyPreset(day, preset) {
    onChange((current) => {
      const next = normalizeAvailability(current);
      if (preset === "clear") {
        next[day] = [];
        return next;
      }
      const frames = preset === "morning" ? morningFrames : preset === "afternoon" ? afternoonFrames : timeFrames;
      next[day] = buildAvailabilityRangesFromFrames(frames, bookingIntervalMinutes);
      return next;
    });
  }

  return <section className="page-view active" data-page-panel="availability">
    <div className="setup-bar" aria-label="Sticky availability setup controls">
      <div className="setup-meta">
        <span className="meta-chip"><strong>{activeDays}</strong> active days</span>
        <span className="meta-chip"><strong>{totalSlots}</strong> live slots</span>
        <span className="meta-chip"><strong>{bookingIntervalMinutes}</strong> min interval</span>
      </div>
      <span className="save-state">{saving ? "Saving changes…" : "All changes saved"}</span>
    </div>
    <div className="availability-layout">
      <aside className="summary-column">
        <section className="section-card pad">
          <div className="card-title-row">
            <div>
              <h2 className="card-title">Weekly summary</h2>
              <p className="card-copy">A quick view of what patients can book this week.</p>
            </div>
            <span className={`status-pill ${activeDays ? "success" : "warning"}`}>{activeDays ? "Live schedule" : "Needs setup"}</span>
          </div>
          <div className="stat-grid" aria-label="Weekly availability statistics">
            <div className="stat"><span className="stat-label">Active days</span><strong className="stat-value">{activeDays}</strong></div>
            <div className="stat"><span className="stat-label">Bookable slots</span><strong className="stat-value">{totalSlots}</strong></div>
            <div className="stat"><span className="stat-label">First slot</span><strong className="stat-value">{totalSlots ? formatAvailabilityLabel(timeFrames[0]) : "None"}</strong></div>
            <div className="stat"><span className="stat-label">Last slot</span><strong className="stat-value">{totalSlots ? formatAvailabilityLabel(timeFrames[timeFrames.length - 1]) : "None"}</strong></div>
          </div>
        </section>
      </aside>
      <section className="schedule-column">
        <div className="schedule-intro">
          <div>
            <h2>Daily slot editor</h2>
            <p>Open a day, turn it on or off, then choose the time slots patients can book.</p>
          </div>
        </div>
        {weekdays.map((day) => {
          const enabled = Boolean(selectedFramesByDay[day].length);
          const firstSlot = selectedFramesByDay[day][0];
          return <details className={`day-card ${enabled ? "" : "closed"}`.trim()} key={day} open>
            <summary className="day-summary">
              <div className="day-heading">
                <div>
                  <h3 className="day-name">{titleCase(day)}</h3>
                  <p className="day-note"><span>{selectedFramesByDay[day].length}</span> selected slots - {enabled && firstSlot ? `starts ${formatAvailabilityLabel(firstSlot)}` : "patients cannot book this day"}</p>
                </div>
              </div>
              <div className="summary-right">
                <label
                  className="switch day-summary-switch"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    aria-label={`Allow bookings on ${titleCase(day)}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onChange((current) => toggleAvailabilityDay(current, day, event.target.checked, bookingIntervalMinutes))}
                  />
                  <span className="switch-ui" aria-hidden="true" />
                </label>
                <span className={`status-pill ${enabled ? "success" : "warning"}`}>{enabled ? "Bookable" : "Unavailable"}</span>
                <span className="chevron"><svg className="icon" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              </div>
            </summary>
            <div className="day-body">
              <div className="day-controls">
                
              
                <div className="quick-card">
                  <span className="toggle-title">Quick select</span>
                  <span className="toggle-copy">Use presets, then adjust individual slots below.</span>
                  <div className="quick-actions">
                    <button className="btn soft" type="button" onClick={() => applyPreset(day, "morning")}>Morning</button>
                    <button className="btn soft" type="button" onClick={() => applyPreset(day, "afternoon")}>Afternoon</button>
                    <button className="btn soft" type="button" onClick={() => applyPreset(day, "full")}>Full day</button>
                    <button className="btn soft" type="button" onClick={() => applyPreset(day, "clear")}>Clear</button>
                  </div>
                </div>
              </div>
              <div className="closed-message">This day is currently unavailable. Turn it back on to allow patients to book selected slots.</div>
              <div className="day-body-content">
                {[
                  ["Morning", "8:00 AM - 11:30 AM", morningFrames],
                  ["Afternoon", "12:00 PM - 4:30 PM", afternoonFrames],
                  ["Evening", "5:00 PM - 7:30 PM", eveningFrames]
                ].map(([label, caption, frames]) => <section className="slot-section" key={`${day}-${label}`}>
                  <div className="slot-section-head"><h4 className="slot-section-title">{label}</h4><span className="slot-section-caption">{caption}</span></div>
                  <div className="slot-grid">
                    {frames.map((time) => {
                      const active = selectedFramesByDay[day].includes(time);
                      return <button
                        className={`slot-chip ${active ? "active" : ""}`.trim()}
                        key={`${day}-${time}`}
                        type="button"
                        disabled={!enabled}
                        aria-pressed={active}
                        onClick={() => onChange((current) => toggleAvailabilityFrame(current, day, time, bookingIntervalMinutes))}
                      >
                        {formatAvailabilityLabel(time)}
                      </button>;
                    })}
                  </div>
                </section>)}
              </div>
            </div>
          </details>;
        })}
      </section>
    </div>
  </section>;
}

function DoctorProfilePhotoWidget({ doctor, session, doctorId, onUploaded, onUploadError }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [localError, setLocalError] = useState("");
  const [cropError, setCropError] = useState("");
  const [loadingCropImage, setLoadingCropImage] = useState(false);
  const [cropState, setCropState] = useState(null);
  const [pendingImageMeta, setPendingImageMeta] = useState(null);
  const [cropViewportSize, setCropViewportSize] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const avatarUrl = String(doctor?.avatar_url || "").trim();
  const displayName = doctor?.display_name || "Doctor";
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const viewerCloseRef = useRef(null);
  const uploadCloseRef = useRef(null);
  const cropSurfaceRef = useRef(null);
  const dragStateRef = useRef(null);

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
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [uploadOpen, viewerOpen]);

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

    setCropState((current) => createDoctorProfileImageCropState({
      naturalWidth: pendingImageMeta.naturalWidth,
      naturalHeight: pendingImageMeta.naturalHeight,
      cropSize: cropViewportSize,
      zoom: current?.zoom || DOCTOR_PROFILE_IMAGE_MIN_ZOOM,
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
        return createDoctorProfileImageCropState({
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

  useEffect(() => {
    if (!cooldownUntil) {
      return undefined;
    }
    const timerId = window.setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [cooldownUntil]);

  function restoreFocus() {
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function resetCropState(meta) {
    if (!meta || !cropViewportSize) {
      setCropState(null);
      return;
    }
    setCropState(createDoctorProfileImageCropState({
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
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    restoreFocus();
  }

  function handleAvatarClick() {
    if (uploading) {
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
    window.setTimeout(() => inputRef.current?.click(), 0);
  }

  async function handleNativeFileChange(event) {
    const file = event.target.files?.[0] || null;
    const validationMessage = validateDoctorProfileImageFile(file);
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
      const dimensions = await loadDoctorProfileImageDimensions(file);
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
    const nextZoom = Number(event.target.value || DOCTOR_PROFILE_IMAGE_MIN_ZOOM);
    setCropState((current) => current ? createDoctorProfileImageCropState({
      ...current,
      zoom: nextZoom,
    }) : current);
  }

  async function handleSaveImage() {
    if (profileImageCooldownActive) {
      setCropError(formatDoctorProfileImageRateLimitMessage(profileImageCooldownSeconds));
      return;
    }
    if (!pendingFile || !cropState || uploading || loadingCropImage || !doctorId || !session) {
      setCropError("Select an image to continue.");
      return;
    }

    setCropError("");
    setUploading(true);
    try {
      const preparedUpload = await renderCroppedDoctorProfileImage(pendingFile, cropState);
      const updatedDoctor = await apiRequest(session, `/doctors/${doctorId}/profile-image`, {
        method: "PUT",
        body: {
          filename: preparedUpload.filename,
          mime_type: preparedUpload.mime_type,
          data_base64: preparedUpload.data_base64
        }
      });
      closeUploadModal({ force: true });
      onUploaded?.(updatedDoctor);
    } catch (saveError) {
      const retrySeconds = getDoctorProfileImageRateLimitRetrySeconds(saveError);
      if (retrySeconds > 0) {
        setCooldownUntil(Date.now() + (retrySeconds * 1000));
      }
      const message = describeDoctorProfileImageUploadError(saveError);
      setCropError(message);
      onUploadError?.(message);
    } finally {
      setUploading(false);
    }
  }

  const profileImageCooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000));
  const profileImageCooldownActive = profileImageCooldownSeconds > 0;
  const saveDisabled = uploading || loadingCropImage || !pendingFile || !cropState || profileImageCooldownActive;

  const cropImageStyle = cropState && cropViewportSize ? {
    width: (cropState.naturalWidth * cropState.scale) + "px",
    height: (cropState.naturalHeight * cropState.scale) + "px",
    transform: "translate(" + (cropState.offsetX - ((cropState.naturalWidth * cropState.scale) / 2)) + "px, " + (cropState.offsetY - ((cropState.naturalHeight * cropState.scale) / 2)) + "px)",
  } : undefined;

  return (
    <div className="customer-mobile-photo-widget">
      <button
        ref={triggerRef}
        className="customer-mobile-photo-button"
        type="button"
        onClick={handleAvatarClick}
        disabled={uploading}
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
          <button type="button" role="menuitem" onClick={handleUploadPhoto}>
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
                <label className="customer-profile-cropper-control" htmlFor="doctor-profile-cropper-zoom">
                  <span>Zoom</span>
                  <input
                    id="doctor-profile-cropper-zoom"
                    type="range"
                    min={DOCTOR_PROFILE_IMAGE_MIN_ZOOM}
                    max={DOCTOR_PROFILE_IMAGE_MAX_ZOOM}
                    step="0.01"
                    value={cropState?.zoom || DOCTOR_PROFILE_IMAGE_MIN_ZOOM}
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
                {uploading ? <span className="appointment-cta-spinner" aria-label="Saving image" /> : (profileImageCooldownActive ? "Try again in " + Math.max(1, Math.ceil(profileImageCooldownSeconds / 60)) + "m" : "Save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DoctorSettingsPage({ doctor, session, doctorId, settings, onSettingsChange, onSaveDisplayName, onAvatarUploaded, onAvatarUploadError }) {
  return <section className="page-view active" data-page-panel="settings">
    <section className="doctor-settings-grid flow-settings-grid">
      <article className="profile-details-card">
        <div className="profile-card-header">
          <div>
            <p className="profile-helper">Profile photo</p>
            <h2 className="profile-card-title">This photo appears on your dashboard and to patients booking with you.</h2>
          </div>
        </div>
        <DoctorProfilePhotoWidget doctor={doctor} session={session} doctorId={doctorId} onUploaded={onAvatarUploaded} onUploadError={onAvatarUploadError} />
      </article>
      <article className="profile-details-card">
        <div className="profile-card-header">
          <div>
            <p className="profile-helper">Identity settings</p>
            <h2 className="profile-card-title">Doctor profile preferences</h2>
          </div>
        </div>
        <div className="profile-form-grid">
          <label className="profile-field"><span className="profile-label">Display name</span><input className="profile-input" value={settings.displayName} placeholder={doctor?.display_name || "Doctor"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: event.target.value }))} onBlur={(event) => onSaveDisplayName?.(event.target.value)} /></label>
          <label className="profile-field"><span className="profile-label">Specialization</span><input className="profile-input" value={settings.specialization} placeholder={(doctor?.specialties || []).join(", ") || "General practice"} onChange={(event) => onSettingsChange((current) => ({ ...current, specialization: event.target.value }))} /></label>
          <label className="profile-field full"><span className="profile-label">Bio</span><textarea className="profile-textarea" rows={4} value={settings.bio} onChange={(event) => onSettingsChange((current) => ({ ...current, bio: event.target.value }))} /></label>
          <label className="profile-field"><span className="profile-label">License number</span><input className="profile-input" value={settings.licenseNumber} onChange={(event) => onSettingsChange((current) => ({ ...current, licenseNumber: event.target.value }))} /></label>
          
        </div>
      </article>
      
    </section>
  </section>;
}

export function TablePanel({ title, rows, columns, render }) {
  return <section className="table-panel"><div className="panel-header"><h2>{title}</h2></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}>{render(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="muted">No records found.</td></tr>}</tbody></table></div></section>;
}

function DoctorDashboardBootSkeleton() {
  return <div className="desktop-dashboard-page role-shell-exact">
    <section className="desktop-dashboard-shell">
      <div className="desktop-dashboard-screen">
        <div className="screen-scroll">
          <section className="table-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-lg" />
              </div>
            </div>
            <div className="doctor-list">
              {Array.from({ length: 3 }, (_, index) => <div className="doctor-card skeleton-panel" key={`doctor-auth-skeleton-${index}`}>
                <SkeletonBox className="skeleton-line skeleton-line-md" />
                <SkeletonBox className="skeleton-line skeleton-line-sm" />
              </div>)}
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>;
}

function hasDoctorDashboardData(state) {
  return Boolean(
    state.dashboard
    || state.doctor
    || state.appointments.length
    || state.orders.length
    || state.products.length
    || state.patients.length
    || state.reviews
  );
}

function DoctorDashboardSkeleton({ page }) {
  if (page === "orders") {
    return <SkeletonTablePanel title="Assigned Orders" columns={6} rows={6} />;
  }
  if (page === "products") {
    return <SkeletonTablePanel title="Assigned Products" columns={4} rows={6} />;
  }
  if (page === "patients") {
    return <SkeletonTablePanel title="Patients" columns={4} rows={6} />;
  }
  if (page === "consultations") {
    return <DoctorConsultationsSkeleton />;
  }
  if (page === "reviews") {
    return <DoctorReviewsSkeleton />;
  }
  if (page === "availability") {
    return <DoctorAvailabilitySkeleton />;
  }
  if (page === "settings") {
    return <DoctorSettingsSkeleton />;
  }
  if (page === "profile") {
    return <DoctorProfileSkeleton />;
  }
  return <DoctorOverviewSkeleton />;
}

function SkeletonTablePanel({ title, columns = 4, rows = 5 }) {
  return <section className="table-panel skeleton-panel">
    <div className="panel-header"><div><SkeletonBox className="skeleton-line skeleton-line-xs" /><SkeletonBox className="skeleton-line skeleton-line-lg" /></div></div>
    <div className="table-scroll">
      <table>
        <thead>
          <tr>{Array.from({ length: columns }, (_, index) => <th key={`head-${index}`}><SkeletonBox className="skeleton-line skeleton-line-sm" /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => <tr key={`row-${rowIndex}`}>
            {Array.from({ length: columns }, (_, columnIndex) => <td key={`cell-${rowIndex}-${columnIndex}`}><SkeletonBox className={`skeleton-line ${columnIndex % 2 === 0 ? "skeleton-line-md" : "skeleton-line-sm"}`} /></td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

function DoctorOverviewSkeleton() {
  return <section className="page-view active doctor-skeleton-page" data-page-panel="overview" aria-hidden="true">
    <section className="overview-panel doctor-skeleton-layout">
      <section className="overview-card doctor-skeleton-card doctor-skeleton-hero">
        <div className="doctor-skeleton-welcome">
          <div className="doctor-skeleton-profile">
            <SkeletonBox className="skeleton-circle doctor-skeleton-avatar" />
            <div className="doctor-skeleton-profile-copy">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-line doctor-skeleton-line-title" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
            </div>
          </div>
          <SkeletonBox className="skeleton-pill doctor-skeleton-chip" />
        </div>
        <div className="doctor-overview-insights doctor-skeleton-insights">
          {Array.from({ length: 3 }, (_, index) => <article className="doctor-insight-card doctor-skeleton-card" key={`doctor-overview-metric-${index}`}>
            <SkeletonBox className="skeleton-line skeleton-line-xs" />
            <SkeletonBox className="skeleton-line doctor-skeleton-line-value" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </article>)}
        </div>
      </section>
      <section className="overview-card doctor-skeleton-card">
        <div className="doctor-skeleton-section-head">
          <div>
            <SkeletonBox className="skeleton-line skeleton-line-xs" />
            <SkeletonBox className="skeleton-line skeleton-line-lg" />
          </div>
          <SkeletonBox className="skeleton-pill doctor-skeleton-chip" />
        </div>
        <div className="doctor-list doctor-skeleton-list">
          {Array.from({ length: 3 }, (_, index) => <article className="overview-row doctor-skeleton-row" key={`doctor-overview-appointment-${index}`}>
            <SkeletonBox className="skeleton-circle doctor-skeleton-row-avatar" />
            <div className="doctor-skeleton-row-copy">
              <SkeletonBox className="skeleton-line doctor-skeleton-line-name" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
            </div>
            <div className="doctor-skeleton-row-actions">
              <SkeletonBox className="skeleton-pill doctor-skeleton-chip" />
              <SkeletonBox className="skeleton-pill doctor-skeleton-chip" />
            </div>
          </article>)}
        </div>
      </section>
    </section>
  </section>;
}

function DoctorConsultationsSkeleton() {
  return <section className="consultations-panel consultation-table-page doctor-skeleton-page" aria-hidden="true">
    <section className="consultation-filter-card doctor-skeleton-card doctor-skeleton-consultation-shell">
      <div className="consultation-pane-head doctor-skeleton-section-head">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line doctor-skeleton-line-title" />
        </div>
        <SkeletonBox className="skeleton-line doctor-skeleton-search" />
      </div>
      <div className="consultation-summary-grid doctor-skeleton-summary-grid">
        <div className="consultation-table-side doctor-skeleton-table-side">
          <div className="consultation-stats">
            {Array.from({ length: 4 }, (_, index) => <div className="consultation-stat-card doctor-skeleton-card" key={`doctor-consultation-stat-${index}`}>
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-line doctor-skeleton-line-value" />
            </div>)}
          </div>
          <div className="consultation-filters consultation-time-filters">
            <SkeletonBox className="skeleton-pill doctor-skeleton-chip" />
            <SkeletonBox className="skeleton-pill doctor-skeleton-chip" />
          </div>
        </div>
      </div>
    </section>
    <section className="table-panel doctor-appointments-panel doctor-skeleton-card">
      <div className="appointment-panel-header">
        <div className="doctor-appointments-header-copy">
          <SkeletonBox className="skeleton-line doctor-skeleton-line-title" />
          <div className="consultation-filters consultation-status-filters">
            {Array.from({ length: 4 }, (_, index) => <SkeletonBox className="skeleton-pill doctor-skeleton-chip" key={`doctor-filter-skeleton-${index}`} />)}
          </div>
        </div>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
      </div>
      <div className="table-scroll doctor-appointments-table-wrap">
        <table className="doctor-appointments-table">
          <thead>
            <tr>{Array.from({ length: 5 }, (_, index) => <th key={`doctor-head-skeleton-${index}`}><SkeletonBox className="skeleton-line skeleton-line-xs" /></th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, rowIndex) => <tr key={`doctor-row-skeleton-${rowIndex}`}>
              {Array.from({ length: 5 }, (_, columnIndex) => <td key={`doctor-cell-skeleton-${rowIndex}-${columnIndex}`}>
                <SkeletonBox className={`skeleton-line ${columnIndex === 0 ? "doctor-skeleton-line-name" : columnIndex === 4 ? "skeleton-line-sm" : "skeleton-line-md"}`} />
                {columnIndex < 4 ? <SkeletonBox className="skeleton-line skeleton-line-xs doctor-skeleton-subline" /> : null}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </section>;
}

function DoctorReviewsSkeleton() {
  return <section className="doctor-reviews-layout">
    <div className="appointment-surface-card skeleton-panel">
      <div className="doctor-review-summary-head">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
        <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
      </div>
      {Array.from({ length: 5 }, (_, index) => <div className="review-bar-row" key={`review-bar-skeleton-${index}`}>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-pill" />
      </div>)}
    </div>
    <div className="review-list-stack">
      {Array.from({ length: 3 }, (_, index) => <article className="review-entry-card skeleton-panel" key={`review-entry-skeleton-${index}`}>
        <div className="review-entry-head">
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <div>
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
        </div>
        <SkeletonBox className="skeleton-block" />
      </article>)}
    </div>
  </section>;
}

function DoctorAvailabilitySkeleton() {
  return <section className="doctor-availability-shell doctor-skeleton-page" aria-hidden="true">
    <div className="appointment-surface-card doctor-skeleton-card">
      <div className="panel-header">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
        <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
      </div>
      <div className="doctor-availability-grid">
        {Array.from({ length: 7 }, (_, index) => <article className="doctor-availability-card doctor-skeleton-card" key={`availability-skeleton-${index}`}>
          <div className="doctor-availability-head">
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
            <SkeletonBox className="skeleton-circle skeleton-circle-xs" />
          </div>
          <div className="doctor-availability-time-grid">
            <SkeletonBox className="skeleton-pill" />
            <SkeletonBox className="skeleton-pill" />
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}

function DoctorSettingsSkeleton() {
  return <section className="doctor-settings-shell doctor-skeleton-page" aria-hidden="true">
    <div className="appointment-surface-card doctor-skeleton-card">
      <div className="panel-header">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
        <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
      </div>
      <div className="doctor-settings-grid">
        {Array.from({ length: 3 }, (_, index) => <article className="doctor-settings-card doctor-skeleton-card" key={`settings-card-skeleton-${index}`}>
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          {Array.from({ length: 5 }, (_, rowIndex) => <SkeletonBox className="skeleton-pill" key={`settings-pill-skeleton-${index}-${rowIndex}`} />)}
        </article>)}
      </div>
    </div>
  </section>;
}

function DoctorProfileSkeleton() {
  return <section className="panel role-profile doctor-skeleton-card doctor-skeleton-page" aria-hidden="true">
    <div className="panel-header">
      <div>
        <SkeletonBox className="skeleton-line skeleton-line-lg" />
        <SkeletonBox className="skeleton-line skeleton-line-sm" />
      </div>
      <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
    </div>
    <div className="doctor-profile-metrics">
      {Array.from({ length: 4 }, (_, index) => <article className="skeleton-panel" key={`profile-skeleton-${index}`}>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-md" />
      </article>)}
    </div>
  </section>;
}

function DoctorOverview({ doctor, dashboard, appointments, orders, patients, reviews, reviewSummary, estimatedRevenue, storeCurrency, onOpenConsultations }) {
  const upcoming = getUpcomingDoctorAppointments(appointments).slice(0, 3);
  const todayKey = new Date().toISOString().slice(0, 10);
  const appointmentsToday = appointments.filter((item) => String(item.start_at || "").slice(0, 10) === todayKey).length;
  return <section className="page-view active" data-page-panel="overview">
    <section className="overview-panel" aria-label="Doctor overview dashboard">
      <div className="overview-card">
        <div className="overview-welcome-strip">
          <div className="overview-profile">
            <div className="overview-avatar" aria-hidden="true">
              {(doctor?.avatar_url || doctor?.profile_image) ? <img src={doctor.avatar_url || doctor.profile_image} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
              <span style={{ display: (doctor?.avatar_url || doctor?.profile_image) ? "none" : "inline" }}>{initials(doctor?.display_name || "Doctor")}</span>
            </div>
            <div>
              <p className="overview-label">Welcome back,</p>
              <p className="overview-name">{doctor?.display_name || "Doctor"}</p>
              <p className="overview-helper">{doctor?.email || "No email linked yet."}</p>
            </div>
          </div>
          <button className="btn primary" type="button" onClick={onOpenConsultations}>Start consultation</button>
        </div>
        <OverviewActions
          appointmentsTotal={appointments.length}
          appointmentsToday={appointmentsToday}
          ordersTotal={orders.length}
          availableDoctors={Number(dashboard?.available_doctors ?? 0)}
        />
        <div className="doctor-flow-grid-two">
          <section className="overview-section-block" aria-labelledby="overview-consultations-title">
            <div className="overview-section-head">
              <div>
                <h2 className="overview-section-title" id="overview-consultations-title">Upcoming consultations</h2>
                <p className="overview-helper">The next patient bookings requiring attention.</p>
              </div>
              <button className="btn text" type="button" onClick={onOpenConsultations}>View all</button>
            </div>
            {upcoming.length ? upcoming.map((item) => <article className="overview-row" key={item.id}>
              <div className="overview-avatar" aria-hidden="true">{initials(item.patient?.display_name || "Patient")}</div>
              <div>
                <p className="overview-patient-name">{item.patient?.display_name || `Patient #${item.patient_user_id}`}</p>
                <p className="overview-helper">{titleCase(item.type || "consultation")} - {formatDoctorDateTimeCompact(item.start_at)}</p>
              </div>
              <div className="overview-row-actions">
                <span className={`consultation-badge ${item.payment_status === "paid" ? "success" : "warning"}`}>{titleCase(item.payment_status || "pending")}</span>
                <button className="btn secondary" type="button" onClick={onOpenConsultations}>Open</button>
              </div>
            </article>) : <div className="doctor-flow-empty">No upcoming consultations are waiting for action.</div>}
          </section>
          
        </div>
      </div>
    </section>
  </section>;
}

function OverviewActions({ appointmentsTotal, appointmentsToday, ordersTotal, availableDoctors }) {
  const cards = [
    { key: "appointments-today", label: "Today's consultations", value: appointmentsToday, helper: "Scheduled for today", icon: "appointments" },
    { key: "appointments-total", label: "Upcoming consultations", value: appointmentsTotal, helper: "Current doctor bookings", icon: "appointments" },
    { key: "orders", label: "Orders", value: ordersTotal, helper: "Follow-up customer orders", icon: "shopping-basket" },
    { key: "available-doctors", label: "Available doctors", value: availableDoctors, helper: "Currently visible in the network", icon: "doctor" }
  ];

  return <section className="overview-metric-grid" aria-label="Dashboard summary metrics">
    {cards.map((card) => <article className="overview-metric-card" key={card.key}>
      <div className="overview-metric-top">
        <p className="overview-metric-label">{card.label}</p>
        <span className="overview-metric-icon" aria-hidden="true"><OverviewIcon name={card.icon} /></span>
      </div>
      <div>
        <p className="overview-metric-value">{card.value}</p>
        <p className="overview-helper">{card.helper}</p>
      </div>
    </article>)}
  </section>;
}

function OverviewIcon({ name }) {
  if (name === "shopping-basket") return <HugeiconsIcon icon={ShoppingCart01Icon} size={18} strokeWidth={1.8} />;
  if (name === "doctor") return <HugeiconsIcon icon={Doctor01Icon} size={18} strokeWidth={1.8} />;
  return <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.8} />;
}

function DoctorDetailBox({ label, value }) {
  return <div className="consultation-detail-box"><p className="consultation-detail-label">{label}</p><p className="consultation-detail-value">{value}</p></div>;
}

function canDoctorAppointmentComplete(appointment) {
  return String(appointment?.status || "").toLowerCase() === "confirmed"
    && Boolean(appointment?.doctor_checked_in_at)
    && Boolean(appointment?.patient_checked_in_at)
    && !appointment?.missed_attendance_at;
}

function DoctorSettingToggle({ label, checked, onChange }) {
  return <div className="doctor-setting-toggle">
    <span>{label}</span>
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-ui" aria-hidden="true" />
    </label>
  </div>;
}

function formatDoctorDateLong(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDoctorTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDoctorDateTimeCompact(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }
  return `${formatDoctorDateLong(date)}, ${formatDoctorTime(date)}`;
}

function formatDoctorNotificationDate(value, timeZone = storedStoreTimeZone()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "the scheduled date";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      month: "short",
      day: "numeric"
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric"
    }).format(date);
  }
}

function formatDoctorAppointmentWindow(startAt, endAt) {
  if (!startAt) {
    return "Not available";
  }
  const startLabel = formatDoctorDateTimeCompact(startAt);
  if (!endAt) {
    return startLabel;
  }
  return `${startLabel} - ${formatDoctorTime(endAt)}`;
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

function loadBookingIntervalMinutes() {
  if (typeof window === "undefined") {
    return DEFAULT_SLOT_INTERVAL_MINUTES;
  }
  try {
    const settings = JSON.parse(window.localStorage.getItem(ADMIN_APPOINTMENT_SETTINGS_KEY) || "{}");
    return normalizeSlotIntervalMinutes(settings?.minimumConsultationMinutes);
  } catch {
    return DEFAULT_SLOT_INTERVAL_MINUTES;
  }
}

function renderDoctorNavIcon(page) {
  if (page === "overview") return <HugeiconsIcon icon={Home01Icon} size={20} strokeWidth={1.7} />;
  if (page === "consultations") return <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={1.7} />;
  if (page === "availability") return <HugeiconsIcon icon={AddCircleIcon} size={20} strokeWidth={1.7} />;
  if (page === "settings") return <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.7} />;
  return null;
}

function defaultDoctorSettings() {
  return {
    displayName: "",
    specialization: "",
    bio: "",
    licenseNumber: "",
    autoAcceptAppointments: false,
    manualApprovalMode: true,
    emergencyAvailability: false,
    onlineConsultations: true,
    bufferMinutes: 15,
    maxDailyAppointments: 8,
    breakWindow: "1:00 PM - 2:00 PM",
    emailNotifications: true,
    instantAlerts: true,
    reminderNotifications: true,
    prescriptionBuilderEnabled: true
  };
}

function buildDoctorBootstrapState(session, fallbackState = emptyDoctorState) {
  const fallbackDoctor = fallbackState?.doctor || {};
  const sessionUser = session?.user || {};
  const doctorId = sessionUser?.id || fallbackDoctor?.id || fallbackDoctor?.user_id || null;

  return {
    error: fallbackState?.error || "",
    dashboard: {
      ...(fallbackState?.dashboard || {}),
      store_currency: fallbackState?.dashboard?.store_currency || storedStoreCurrency(),
      store_timezone: fallbackState?.dashboard?.store_timezone || fallbackDoctor.store_timezone || storedStoreTimeZone()
    },
    appointments: Array.isArray(fallbackState?.appointments) ? fallbackState.appointments : [],
    orders: Array.isArray(fallbackState?.orders) ? fallbackState.orders : [],
    products: Array.isArray(fallbackState?.products) ? fallbackState.products : [],
    patients: Array.isArray(fallbackState?.patients) ? fallbackState.patients : [],
    doctor: doctorId ? {
      id: doctorId,
      user_id: doctorId,
      display_name: fallbackDoctor.display_name || sessionUser.display_name || sessionUser.name || "Doctor",
      email: fallbackDoctor.email || sessionUser.email || "",
      avatar_url: fallbackDoctor.avatar_url || sessionUser.avatar_url || sessionUser.avatarUrl || sessionUser.picture || "",
      specialties: Array.isArray(fallbackDoctor.specialties) ? fallbackDoctor.specialties : [],
      languages: Array.isArray(fallbackDoctor.languages) ? fallbackDoctor.languages : [],
      consultation_fee: doctorConsultationFee(fallbackDoctor),
      store_currency: storedStoreCurrency(),
      store_timezone: fallbackDoctor.store_timezone || storedStoreTimeZone(),
      product_categories: Array.isArray(fallbackDoctor.product_categories) ? fallbackDoctor.product_categories : []
    } : null,
    reviews: fallbackState?.reviews || null,
    availability: fallbackState?.availability || {}
  };
}

function loadDoctorSettings() {
  if (typeof window === "undefined") {
    return defaultDoctorSettings();
  }
  try {
    return { ...defaultDoctorSettings(), ...JSON.parse(window.localStorage.getItem(DOCTOR_SETTINGS_KEY) || "{}") };
  } catch {
    return defaultDoctorSettings();
  }
}

function persistDoctorSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DOCTOR_SETTINGS_KEY, JSON.stringify(settings));
}

function DoctorMobileShell({
  doctor,
  pages: navPages,
  active,
  onPageChange,
  children,
  contentClassName = "",
  pageLabels = {},
  renderNavIcon = null,
  onLogout = null,
  logoutBusy = false,
  searchTerm = "",
  onSearchTermChange
}) {
  const [sideNavOpen, setSideNavOpen] = useState(false);
  const doctorName = String(doctor?.display_name || "Doctor").trim();
  const welcomeName = doctorName.split(/\s+/).filter(Boolean)[0] || doctorName;

  function handleSearchChange(nextValue) {
    onSearchTermChange?.(nextValue);
    if (String(nextValue || "").trim() && !["overview", "consultations"].includes(active)) {
      onPageChange("consultations");
      setSideNavOpen(false);
    }
  }

  return <div className="customer-mobile-app doctor-mobile-shell">
    <div className={`customer-mobile-drawer-layer ${sideNavOpen ? "open" : ""}`.trim()}>
      <ModalScrim className="customer-mobile-drawer-backdrop" label="Close navigation" onDismiss={() => setSideNavOpen(false)} />
      <aside className="customer-mobile-drawer doctor-mobile-drawer" aria-label="Doctor navigation">
        <div className="doctor-mobile-brand customer-mobile-drawer-brand">
          <div className="doctor-mobile-brand-mark">
            <Image src="/ne.webp" alt="Nevari Health" width={44} height={44} />
          </div>
          <div>
            <p className="doctor-mobile-brand-title">Nevari Health</p>
            <p className="doctor-mobile-brand-copy">Doctor Dashboard</p>
          </div>
        </div>
        <nav className="customer-mobile-drawer-nav doctor-mobile-nav-list" aria-label="Doctor menu">
          {navPages.map((item, index) => <button
            className={`customer-mobile-drawer-item doctor-mobile-nav-item ${active === item ? "active" : ""}`.trim()}
            key={item}
            type="button"
            onClick={() => {
              onPageChange(item);
              setSideNavOpen(false);
            }}
          >
            <span className="doctor-mobile-nav-icon" aria-hidden="true">{renderNavIcon ? renderNavIcon(item, index) : null}</span>
            <span>{pageLabels[item] || titleCase(item)}</span>
          </button>)}
          {onLogout ? <button className="customer-mobile-drawer-item doctor-mobile-nav-item logout" type="button" onClick={() => {
            setSideNavOpen(false);
            onLogout();
          }} disabled={logoutBusy}>
            <span className="doctor-mobile-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M15 17.5 20 12l-5-5.5M20 12H9m5 7H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>{logoutBusy ? "Logging out..." : "Logout"}</span>
          </button> : null}
        </nav>
        <div className="doctor-mobile-drawer-footer customer-mobile-drawer-footer">
          <div
            className="doctor-mobile-drawer-profile customer-mobile-drawer-profile"
            role="button"
            tabIndex={0}
            aria-label="Open profile settings"
            onClick={() => {
              onPageChange("settings");
              setSideNavOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPageChange("settings");
                setSideNavOpen(false);
              }
            }}
          >
            <div className="customer-mobile-avatar">
              {doctor?.avatar_url ? <img src={doctor.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
              <span style={{ display: doctor?.avatar_url ? "none" : "inline" }}>{initials(doctorName || "Doctor")}</span>
            </div>
            <div>
              <strong>{doctorName || "Doctor"}</strong>
              <span>{doctor?.email || "Doctor account"}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
    <header className="customer-mobile-header doctor-mobile-header">
      <div className="doctor-mobile-header-inner">
        <label className="doctor-mobile-search customer-mobile-searchbar" aria-label="Search doctor dashboard">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Zm5.3-2 4.4 4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search here for orders, appointments etc"
          />
        </label>
        <div className="doctor-mobile-header-row customer-mobile-greeting-row">
          <button className="doctor-mobile-menu-button customer-mobile-icon-button" type="button" aria-label="Open navigation" onClick={() => setSideNavOpen(true)}>
            <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.7} />
          </button>
          <p className="doctor-mobile-welcome">Welcome back, {welcomeName}</p>
        </div>
      </div>
    </header>
    <div className="doctor-mobile-header-spacer customer-mobile-header-spacer is-overview" aria-hidden="true" />
    <main className={`customer-mobile-frame doctor-mobile-content ${contentClassName}`.trim()}>{children}</main>
  </div>;
}

function DoctorMobilePageSection({ title, children, action = null }) {
  return <section className="doctor-mobile-page-section">
    <div className="doctor-mobile-page-head">
      <h1 className="doctor-mobile-page-title">{title}</h1>
      {action}
    </div>
    {children}
  </section>;
}

function DoctorMobileOverview({ doctor, appointments, searchTerm, onOpenConsultations }) {
  const [detailAppointment, setDetailAppointment] = useState(null);
  const filteredAppointments = useMemo(() => {
    const query = String(searchTerm || "").trim().toLowerCase();
    const sorted = getUpcomingDoctorAppointments(appointments);
    if (!query) {
      return sorted.slice(0, 4);
    }
    return sorted.filter((appointment) => doctorAppointmentMatchesSearch(appointment, query)).slice(0, 4);
  }, [appointments, searchTerm]);
  const appointmentMetrics = useMemo(() => {
    const now = Date.now();
    let upcomingAppointments = 0;
    let totalConsultationMinutes = 0;
    const uniquePatients = new Set();

    appointments.forEach((appointment) => {
      const startAtMs = Date.parse(appointment?.start_at || "");
      const endAtMs = Date.parse(appointment?.end_at || "");
      const status = String(appointment?.status || "").toLowerCase();
      const patientKey = appointment?.patient_user_id
        || appointment?.patient?.id
        || appointment?.patient?.email
        || appointment?.patient?.display_name;

      if (patientKey) {
        uniquePatients.add(String(patientKey));
      }
      if (Number.isFinite(startAtMs) && startAtMs > now && !["cancelled", "failed"].includes(status)) {
        upcomingAppointments += 1;
      }
      if (Number.isFinite(startAtMs) && Number.isFinite(endAtMs) && endAtMs > startAtMs) {
        totalConsultationMinutes += Math.round((endAtMs - startAtMs) / 60000);
      }
    });

    return {
      upcomingAppointments,
      customerInteractions: uniquePatients.size,
      totalConsultationMinutes
    };
  }, [appointments]);

  const metrics = [
    {
      key: "upcoming-appointments",
      label: "Upcoming appointments",
      value: appointmentMetrics.upcomingAppointments,
      icon: <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.8} />
    },
    {
      key: "total-appointments",
      label: "Total appointments",
      value: appointments.length,
      icon: <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.8} />
    },
    {
      key: "customer-interactions",
      label: "Patient interactions",
      value: appointmentMetrics.customerInteractions,
      icon: <HugeiconsIcon icon={UserIcon} size={18} strokeWidth={1.8} />
    },
    {
      key: "consultation-minutes",
      label: "Consultation minutes",
      value: appointmentMetrics.totalConsultationMinutes,
      icon: <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={1.8} />
    }
  ];

  return <div className="doctor-mobile-page doctor-mobile-overview">
    <DoctorMobilePageSection title="Overview">
      <div className="doctor-mobile-metric-grid">
        {metrics.map((metric) => <article className="doctor-mobile-metric-card" key={metric.key}>
          <span className="doctor-mobile-metric-icon" aria-hidden="true">{metric.icon}</span>
          <span className="doctor-mobile-metric-label">{metric.label}</span>
          <strong className="doctor-mobile-metric-value">{metric.value}</strong>
        </article>)}
      </div>
    </DoctorMobilePageSection>
    <DoctorMobilePageSection
      title="Appointments"
      action={<button className="doctor-mobile-inline-link" type="button" onClick={onOpenConsultations}>View all</button>}
    >
      <div className="doctor-mobile-appointment-listing">
        {filteredAppointments.length ? filteredAppointments.map((appointment) => {
          const statusTone = mobileDoctorStatusTone(appointment);
          const title = appointment.reason || appointment.patient?.display_name || `Appointment #${appointment.id}`;
          return <article
            className="doctor-mobile-overview-item"
            key={appointment.id}
            role="button"
            tabIndex={0}
            aria-label={`Open appointment details for ${appointment.patient?.display_name || `Appointment #${appointment.id}`}`}
            onClick={() => setDetailAppointment({ ...appointment, detailStatusMode: "single" })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setDetailAppointment({ ...appointment, detailStatusMode: "single" });
              }
            }}
          >
            <span className="doctor-mobile-overview-icon" aria-hidden="true">
              <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.8} />
            </span>
            <div className="doctor-mobile-overview-copy">
              <strong>{title}</strong>
              <span>{formatDoctorDateTimeCompact(appointment.start_at)}</span>
              <span>{appointment.patient?.display_name || doctor?.display_name || "Patient record"}</span>
            </div>
            <span className={`doctor-mobile-status-pill ${statusTone}`.trim()}>{mobileDoctorStatusLabel(appointment)}</span>
          </article>;
        }) : <div className="doctor-mobile-empty-card">No appointments match the current search.</div>}
      </div>
    </DoctorMobilePageSection>
    {detailAppointment ? <DoctorAppointmentDetailsModal
      appointment={detailAppointment}
      onConfirm={null}
      onComplete={null}
      onClose={() => setDetailAppointment(null)}
    /> : null}
  </div>;
}

function DoctorMobileConsultationsPage({ appointments, searchTerm, onComplete }) {
  const [filter, setFilter] = useState("all");
  const [pageNumber, setPageNumber] = useState(1);
  const [detailAppointment, setDetailAppointment] = useState(null);
  const sortedAppointments = useMemo(() => sortDoctorAppointments(appointments), [appointments]);
  const filteredAppointments = useMemo(
    () => filterDoctorAppointments(sortedAppointments, searchTerm, filter),
    [filter, searchTerm, sortedAppointments]
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredAppointments.length / pageSize));
  const paginatedAppointments = useMemo(() => {
    const startIndex = (pageNumber - 1) * pageSize;
    return filteredAppointments.slice(startIndex, startIndex + pageSize);
  }, [filteredAppointments, pageNumber]);

  useEffect(() => {
    setPageNumber(1);
  }, [filter, searchTerm]);

  useEffect(() => {
    if (pageNumber > pageCount) {
      setPageNumber(pageCount);
    }
  }, [pageCount, pageNumber]);

  return <div className="doctor-mobile-page doctor-mobile-consultations">
    <DoctorMobilePageSection title="Appointments">
      <div className="doctor-mobile-filter-strip">
        {[
          ["all", "All"],
          ["confirmed", "Confirmed"],
          ["pending", "Pending"],
          ["payment-issue", "Payment issue"]
        ].map(([value, label]) => <button
          className={`doctor-mobile-filter-pill ${filter === value ? "active" : ""}`.trim()}
          key={value}
          type="button"
          onClick={() => setFilter(value)}
        >
          {label}
        </button>)}
      </div>
      <div className="doctor-mobile-appointment-listing">
        {paginatedAppointments.length ? paginatedAppointments.map((appointment) => {
          const joinUrl = doctorAppointmentIsUpcoming(appointment) ? resolveDoctorDashboardJoinUrl(appointment) : "";
          const canComplete = canDoctorAppointmentComplete(appointment);
          const patientName = appointment.patient?.display_name || `Patient #${appointment.patient_user_id}`;
          return <article
            className="doctor-mobile-consultation-card"
            key={appointment.id}
            role="button"
            tabIndex={0}
            aria-label={`Open appointment details for ${patientName}`}
            onClick={() => setDetailAppointment(appointment)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setDetailAppointment(appointment);
              }
            }}
          >
            <div className="doctor-mobile-consultation-top">
              <div className="doctor-mobile-consultation-lead">
                <div className="customer-mobile-clock"><HugeiconsIcon icon={Clock01Icon} size={20} strokeWidth={1.7} /></div>
                <div className="customer-mobile-visit-copy">
                  <strong>{patientName}</strong>
                  <span>{formatDoctorAppointmentWindow(appointment.start_at, appointment.end_at)}</span>
                  <small>{appointment.patient?.email || "No email available"}</small>
                </div>
              </div>
              <div className="customer-mobile-appointment-status">
                <div className="appointment-status-stack">
                  <span className={`status-pill ${mobileDoctorStatusTone(appointment)}`}>{mobileDoctorStatusLabel(appointment)}</span>
                </div>
              </div>
            </div>
            <div className="doctor-mobile-card-actions">
              {joinUrl ? <a className="doctor-mobile-action-button primary" href={joinUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Join now</a> : null}
              {canComplete ? <button className="doctor-mobile-action-button primary" type="button" onClick={(event) => {
                event.stopPropagation();
                onComplete(appointment.id);
              }}>Complete</button> : null}
            </div>
          </article>;
        }) : <div className="doctor-mobile-empty-card">No appointments match the active filters.</div>}
      </div>
      {pageCount > 1 ? <DoctorAppointmentsPagination page={pageNumber} pageCount={pageCount} onPageChange={setPageNumber} /> : null}
    </DoctorMobilePageSection>
    {detailAppointment ? <DoctorAppointmentDetailsModal
      appointment={{ ...detailAppointment, detailStatusMode: "single" }}
      onConfirm={null}
      onComplete={onComplete}
      onClose={() => setDetailAppointment(null)}
    /> : null}
  </div>;
}

function DoctorMobileAvailabilityPage({ availabilityDraft, bookingIntervalMinutes, onChange, saving }) {
  const timeFrames = useMemo(() => buildAvailabilityTimeFrames(bookingIntervalMinutes), [bookingIntervalMinutes]);
  const selectedFramesByDay = useMemo(() => weekdays.reduce((accumulator, day) => ({
    ...accumulator,
    [day]: getSelectedAvailabilityFrames(availabilityDraft[day], bookingIntervalMinutes, timeFrames)
  }), {}), [availabilityDraft, bookingIntervalMinutes, timeFrames]);
  const activeDays = weekdays.filter((day) => selectedFramesByDay[day].length).length;
  const totalSlots = weekdays.reduce((sum, day) => sum + selectedFramesByDay[day].length, 0);
  const morningFrames = timeFrames.filter((time) => timeStringToMinutes(time) < 12 * 60);
  const afternoonFrames = timeFrames.filter((time) => timeStringToMinutes(time) >= 12 * 60 && timeStringToMinutes(time) < 17 * 60);
  const eveningFrames = timeFrames.filter((time) => timeStringToMinutes(time) >= 17 * 60);

  function applyPreset(day, preset) {
    onChange((current) => {
      const next = normalizeAvailability(current);
      if (preset === "clear") {
        next[day] = [];
        return next;
      }
      const frames = preset === "morning" ? morningFrames : preset === "afternoon" ? afternoonFrames : timeFrames;
      next[day] = buildAvailabilityRangesFromFrames(frames, bookingIntervalMinutes);
      return next;
    });
  }

  return <div className="doctor-mobile-page doctor-mobile-availability">
    <DoctorMobilePageSection
      title="Availability"
      action={<span className="save-state">{saving ? "Saving changes…" : "All changes saved"}</span>}
    >
      <div className="doctor-mobile-metric-grid compact">
        <article className="doctor-mobile-metric-card"><span className="doctor-mobile-metric-label">Active days</span><strong className="doctor-mobile-metric-value">{activeDays}</strong></article>
        <article className="doctor-mobile-metric-card"><span className="doctor-mobile-metric-label">Live slots</span><strong className="doctor-mobile-metric-value">{totalSlots}</strong></article>
      </div>
      <div className="doctor-mobile-card-stack">
        {weekdays.map((day) => {
          const enabled = Boolean(selectedFramesByDay[day].length);
          return <details className={`doctor-mobile-day-card ${enabled ? "" : "closed"}`.trim()} key={day}>
            <summary className="doctor-mobile-day-summary">
              <div>
                <strong>{titleCase(day)}</strong>
                <span>{selectedFramesByDay[day].length} slots selected</span>
              </div>
              <div className="doctor-mobile-day-controls">
                <label className="switch" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    aria-label={`Allow bookings on ${titleCase(day)}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onChange((current) => toggleAvailabilityDay(current, day, event.target.checked, bookingIntervalMinutes))}
                  />
                  <span className="switch-ui" aria-hidden="true" />
                </label>
                <span className={`doctor-mobile-status-pill ${enabled ? "success" : "warning"}`.trim()}>{enabled ? "Bookable" : "Closed"}</span>
              </div>
            </summary>
            <div className="doctor-mobile-day-body">
              <div className="doctor-mobile-filter-strip schedule">
                <button className="doctor-mobile-filter-pill" type="button" onClick={() => applyPreset(day, "morning")}>Morning</button>
                <button className="doctor-mobile-filter-pill" type="button" onClick={() => applyPreset(day, "afternoon")}>Afternoon</button>
                <button className="doctor-mobile-filter-pill" type="button" onClick={() => applyPreset(day, "full")}>Full day</button>
                <button className="doctor-mobile-filter-pill" type="button" onClick={() => applyPreset(day, "clear")}>Clear</button>
              </div>
              {[["Morning", morningFrames], ["Afternoon", afternoonFrames], ["Evening", eveningFrames]].map(([label, frames]) => <section className="doctor-mobile-slot-group" key={`${day}-${label}`}>
                <div className="doctor-mobile-slot-head">
                  <strong>{label}</strong>
                </div>
                <div className="doctor-mobile-slot-grid">
                  {frames.map((time) => {
                    const active = selectedFramesByDay[day].includes(time);
                    return <button
                      className={`doctor-mobile-slot-chip ${active ? "active" : ""}`.trim()}
                      key={`${day}-${time}`}
                      type="button"
                      disabled={!enabled}
                      onClick={() => onChange((current) => toggleAvailabilityFrame(current, day, time, bookingIntervalMinutes))}
                    >
                      {formatAvailabilityLabel(time)}
                    </button>;
                  })}
                </div>
              </section>)}
            </div>
          </details>;
        })}
      </div>
    </DoctorMobilePageSection>
  </div>;
}

function DoctorMobileSettingsPage({ doctor, session, doctorId, settings, onSettingsChange, onSaveDisplayName, onAvatarUploaded, onAvatarUploadError }) {
  return <div className="doctor-mobile-page doctor-mobile-settings">
    <DoctorMobilePageSection title="Settings">
      <div className="doctor-mobile-card-stack">
        <article className="doctor-mobile-surface-card">
          <div className="doctor-mobile-surface-head">
            <h2>Profile photo</h2>
            <p>This photo appears on your dashboard and to patients booking with you.</p>
          </div>
          <DoctorProfilePhotoWidget doctor={doctor} session={session} doctorId={doctorId} onUploaded={onAvatarUploaded} onUploadError={onAvatarUploadError} />
        </article>
        <article className="doctor-mobile-surface-card">
          <div className="doctor-mobile-surface-head">
            <h2>Profile preferences</h2>
            <p>Update the doctor information shown across the dashboard.</p>
          </div>
          <div className="doctor-mobile-form-stack">
            <label className="doctor-mobile-form-field"><span>Display name</span><input value={settings.displayName} placeholder={doctor?.display_name || "Doctor"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: event.target.value }))} onBlur={(event) => onSaveDisplayName?.(event.target.value)} /></label>
            <label className="doctor-mobile-form-field"><span>Specialization</span><input value={settings.specialization} placeholder={(doctor?.specialties || []).join(", ") || "General practice"} onChange={(event) => onSettingsChange((current) => ({ ...current, specialization: event.target.value }))} /></label>
            <label className="doctor-mobile-form-field"><span>License number</span><input value={settings.licenseNumber} onChange={(event) => onSettingsChange((current) => ({ ...current, licenseNumber: event.target.value }))} /></label>
            <label className="doctor-mobile-form-field"><span>Bio</span><textarea rows={4} value={settings.bio} onChange={(event) => onSettingsChange((current) => ({ ...current, bio: event.target.value }))} /></label>
          </div>
        </article>
      </div>
    </DoctorMobilePageSection>
  </div>;
}

function sortDoctorAppointments(appointments) {
  return [...appointments].sort((left, right) => {
    const rightStart = new Date(right?.start_at || 0).getTime();
    const leftStart = new Date(left?.start_at || 0).getTime();
    if (rightStart !== leftStart) {
      return rightStart - leftStart;
    }
    const rightCreated = new Date(right?.created_at || 0).getTime();
    const leftCreated = new Date(left?.created_at || 0).getTime();
    return rightCreated - leftCreated;
  });
}

function getUpcomingDoctorAppointments(appointments) {
  const now = Date.now();
  return [...appointments]
    .filter((appointment) => {
      const startAtMs = Date.parse(appointment?.start_at || "");
      const status = String(appointment?.status || "").toLowerCase();
      return Number.isFinite(startAtMs) && startAtMs > now && !["cancelled", "canceled", "failed"].includes(status);
    })
    .sort((left, right) => {
      const leftStart = Date.parse(left?.start_at || "");
      const rightStart = Date.parse(right?.start_at || "");
      return rightStart - leftStart;
    });
}

function doctorAppointmentIsUpcoming(appointment) {
  const startAtMs = Date.parse(appointment?.start_at || "");
  const status = String(appointment?.status || "").toLowerCase();
  const displayStatus = String(appointment?.display_status_key || "").toLowerCase();
  return Number.isFinite(startAtMs)
    && startAtMs > Date.now()
    && !["cancelled", "canceled", "failed", "completed"].includes(status)
    && !["ended", "missed", "doctor_absent", "patient_absent"].includes(displayStatus);
}

function resolveDoctorDashboardJoinUrl(appointment) {
  const candidates = [
    appointment?.doctor_join_url,
    appointment?.join_url,
    appointment?.meet_link,
    appointment?.google_meet_link,
    appointment?.meeting_link,
    appointment?.meeting_url
  ].filter((value) => typeof value === "string" && /^https?:\/\//i.test(value));

  const upstreamUrl = candidates[0] || "";
  if (!upstreamUrl) {
    return "";
  }
  if (typeof window === "undefined") {
    return upstreamUrl;
  }

  const joinToken = extractDoctorJoinToken(upstreamUrl);
  if (!joinToken) {
    return upstreamUrl;
  }

  return `${window.location.origin.replace(/\/+$/, "")}/appointment/join/${encodeURIComponent(joinToken)}`;
}

function extractDoctorJoinToken(url) {
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

function doctorAppointmentMatchesSearch(appointment, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    appointment?.patient?.display_name,
    appointment?.patient?.email,
    appointment?.reason,
    appointment?.payment_status,
    appointment?.status,
    appointment?.type
  ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
}

function doctorAppointmentDisplayStatusLabel(appointment) {
  return String(appointment?.display_status_label || titleCase(appointment?.status || appointment?.payment_status || "pending"));
}

function doctorAppointmentDisplayStatusTone(appointment) {
  const displayKey = String(appointment?.display_status_key || "").toLowerCase();
  const displayLabel = String(appointment?.display_status_label || "").toLowerCase();
  const rawStatus = String(appointment?.status || "").toLowerCase();
  const paymentStatus = String(appointment?.payment_status || "").toLowerCase();

  if (["failed"].includes(displayKey) || ["failed", "unpaid"].includes(paymentStatus) || displayLabel.includes("failed")) {
    return "danger";
  }
  if (["cancelled", "canceled"].includes(displayKey) || ["cancelled", "canceled"].includes(rawStatus) || displayLabel.includes("canceled")) {
    return "danger";
  }
  if (["upcoming"].includes(displayKey) || rawStatus === "confirmed" || displayLabel === "confirmed" || displayLabel === "upcoming") {
    return "success";
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

function doctorAppointmentPaymentTone(appointment) {
  const paymentStatus = String(appointment?.payment_status || "").toLowerCase();
  if (["failed", "unpaid", "cancelled"].includes(paymentStatus)) {
    return "danger";
  }
  if (paymentStatus === "paid") {
    return "success";
  }
  return "warning";
}

function filterDoctorAppointments(sortedAppointments, searchTerm, filter) {
  const query = String(searchTerm || "").trim().toLowerCase();
  return sortedAppointments.filter((appointment) => {
    const paymentStatus = String(appointment.payment_status || "").toLowerCase();
    const bookingStatus = String(appointment.status || "").toLowerCase();
    if (!doctorAppointmentMatchesSearch(appointment, query)) {
      return false;
    }
    if (filter === "confirmed") {
      return bookingStatus === "confirmed";
    }
    if (filter === "pending") {
      return ["requested", "pending_review", "awaiting_payment"].includes(bookingStatus) || paymentStatus !== "paid";
    }
    if (filter === "payment-issue") {
      return ["failed", "unpaid", "cancelled"].includes(paymentStatus) || bookingStatus === "awaiting_payment";
    }
    return true;
  });
}

function mobileDoctorStatusLabel(appointment) {
  return doctorAppointmentDisplayStatusLabel(appointment);
}

function mobileDoctorStatusTone(appointment) {
  return doctorAppointmentDisplayStatusTone(appointment);
}
