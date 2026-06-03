"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, ArrowUpRight01Icon, BatteryFullIcon, Calendar03Icon, Clock01Icon, Doctor01Icon, FileUploadIcon, Home01Icon, Logout01Icon, MedicalMaskIcon, Medicine01Icon, Menu01Icon, MoreHorizontalIcon, Search01Icon, Settings01Icon, ShoppingBasket01Icon, ShoppingCart01Icon, SignalFull01Icon, Upload01Icon, UserIcon, Wallet01Icon, Wifi01Icon } from "@hugeicons/core-free-icons";
import { removeById, replaceById, updateListPayload, upsertById } from "../lib/fetcher";
import { isProxyAppointmentsKey, isProxyDoctorsKey, isProxyOrdersKey, swrKeys, withBaseUrl } from "../lib/swrKeys";
import ManageSubscription from "./components/profile/ManageSubscription";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildDashboardCacheKey, buildUrl, clearDashboardCacheForFrontend, DASHBOARD_CACHE_TTL_MS, fitTextToContainer, getOrderTypeMeta, hydrateStoredSession, isSessionUsable, money, readDashboardCache, rememberStoreContext, shortDate, storedStoreCurrency, storedStoreTimeZone, titleCase, writeDashboardCache } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";
import ProtectedFeature from "./components/subscription/ProtectedFeature";
import SubscriptionGate from "./components/subscription/SubscriptionGate";
import { useSubscription } from "./hooks/use-subscription";
import { SkeletonBox } from "./_doctor-dashboard";

const CUSTOMER_SETTINGS_KEY = "nevari_customer_frontend_settings";
const ADMIN_APPOINTMENT_SETTINGS_KEY = "nevari_admin_appointment_settings";
const CUSTOMER_NURSE_REQUESTS_KEY = "nevari_customer_nurse_requests";
const CUSTOMER_DASHBOARD_CACHE_SCOPE = "customer-dashboard";
const SSR_SAFE_STORE_CURRENCY = "USD";
const SSR_SAFE_STORE_TIMEZONE = "UTC";
const pages = ["overview", "orders", "appointment", "request", "settings", "profile", "therapy"];
const CUSTOMER_DASHBOARD_REFRESH_MS = 60_000;
const pageLabels = {
  overview: "Overview",
  orders: "Orders",
  appointment: "Appointment",
  request: "Request a Nurse",
  settings: "Settings",
  profile: "My Profile",
  therapy: "Medical Therapy Management"
};

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
  orders: [],
  appointments: [],
  doctors: [],
  doctorsUnavailable: false
};

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
    blockingErrors.push("The pharmacy server is temporarily unavailable. Showing the last available customer dashboard data.");
  }
  const fallbackProfile = {
    id: session.user?.id || null,
    email: session.user?.email || "",
    display_name: settings.displayName || session.user?.display_name || session.user?.name || "Customer",
    roles: resolveUserRoles(session.user)
  };

  return {
    error: blockingErrors[0] || "",
    dashboard: { ...resolvedDashboard, profile: { ...fallbackProfile, ...(resolvedDashboard.profile || {}) } },
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
    error: "",
    appointment: null,
    checkout: null,
    confirmation: null,
    reviews: null,
    reviewDraft: { rating: 5, reviewText: "" },
    reviewFeedback: ""
  };
}

function defaultCustomerSettings() {
  return {
    displayName: "",
    email: "",
    phone: "",
    address: "",
    timezone: storedStoreTimeZone(),
    preferredConsultationType: "video",
    preferredDoctorIds: [],
    emailReminders: true,
    appointmentReminders: true,
    prescriptionAlerts: true,
    paymentReceipts: true,
    marketingOptIn: false,
    refundTracking: true,
    twoFactorEnabled: false,
    savedMethods: ["Card ending 4242"]
  };
}

function loadCustomerSettings() {
  if (typeof window === "undefined") {
    return defaultCustomerSettings();
  }
  try {
    return {
      ...defaultCustomerSettings(),
      ...JSON.parse(window.localStorage.getItem(CUSTOMER_SETTINGS_KEY) || "{}")
    };
  } catch {
    return defaultCustomerSettings();
  }
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

function persistCustomerSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CUSTOMER_SETTINGS_KEY, JSON.stringify(settings));
}

export default function CustomerDashboard() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const [page, setPage] = useState("overview");
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [cacheKey, setCacheKey] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [appointmentActionBusy, setAppointmentActionBusy] = useState(false);
  const [storeUrl, setStoreUrl] = useState("#");
  const [journey, setJourney] = useState(createJourneyState());
  const [reviewDeepLinkHandled, setReviewDeepLinkHandled] = useState(false);
  const [settings, setSettings] = useState(() => loadCustomerSettings());
  const storefrontSettings = useMemo(() => loadStorefrontSettings(), []);
  const minimumBookingMinutes = useMemo(() => normalizeBookingMinutes(storefrontSettings.minimumConsultationMinutes), [storefrontSettings.minimumConsultationMinutes]);

  useEffect(() => {
    setDocumentMetadata(`Nevari Customer | ${pageLabels[page] || titleCase(page)}`, `${pageLabels[page] || titleCase(page)} view for the Nevari Customer dashboard.`);
  }, [page]);

  useEffect(() => {
    document.body.classList.add("customer-mobile-mode");
    return () => {
      document.body.classList.remove("customer-mobile-mode");
    };
  }, []);

  useEffect(() => {
    persistCustomerSettings(settings);
  }, [settings]);

  useEffect(() => {
    const hydratedSession = hydrateStoredSession("patient");
    setStoreUrl(hydratedSession.baseUrl || "#");
    if (!hydratedSession.paired) {
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

  const cachedCustomerState = (cacheKey && isSessionUsable(session))
    ? readDashboardCache(cacheKey, DASHBOARD_CACHE_TTL_MS)?.state
    : null;
  const bootstrapCustomerState = useMemo(
    () => buildCustomerBootstrapState(session, settings, cachedCustomerState || emptyCustomerState),
    [cachedCustomerState, session, settings]
  );
  const customerSummaryKey = session
    ? swrKeys.proxy.path("/customer-dashboard/summary", withBaseUrl(session))
    : null;
  const customerOrdersKey = session && ["orders", "settings", "profile"].includes(page)
    ? swrKeys.proxy.path("/orders", withBaseUrl(session, { per_page: 24, page: 1 }))
    : null;
  const customerAppointmentsKey = session && ["overview", "appointment", "settings", "profile"].includes(page)
    ? swrKeys.proxy.path("/appointments", withBaseUrl(session, { per_page: 40, page: 1 }))
    : null;
  const customerDoctorsKey = session && ["appointment", "settings", "profile"].includes(page)
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
        if (cacheKey) {
          writeDashboardCache(cacheKey, { state: nextState });
        }
      }
    }
  );
  const ordersQuery = useSWR(
    customerOrdersKey,
    () => fetchCustomerOrders(session),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true }
  );
  const appointmentsQuery = useSWR(
    customerAppointmentsKey,
    () => fetchCustomerAppointments(session),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  );
  const doctorsQuery = useSWR(
    customerDoctorsKey,
    () => fetchCustomerDoctors(session),
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true }
  );

  const state = useMemo(() => ({
    ...summaryState,
    orders: ordersQuery.data || summaryState.orders || [],
    appointments: appointmentsQuery.data || summaryState.appointments || [],
    doctors: doctorsQuery.data || summaryState.doctors || [],
    doctorsUnavailable: doctorsQuery.data ? !doctorsQuery.data.length : summaryState.doctorsUnavailable
  }), [appointmentsQuery.data, doctorsQuery.data, ordersQuery.data, summaryState]);
  const mutate = async (updater, options) => {
    await mutateSummary(updater, options);
    if (page === "orders") {
      await ordersQuery.mutate();
    }
    if (page === "appointment") {
      await appointmentsQuery.mutate();
    }
  };

  function patchCustomerOrderCache(order, { remove = false } = {}) {
    globalMutate(isProxyOrdersKey, (current) => updateListPayload(current, (list) => (
      remove ? removeById(list, order?.id || order) : upsertById(list, order)
    )), { revalidate: false });
  }

  function patchCustomerAppointmentCache(appointment) {
    globalMutate(isProxyAppointmentsKey, (current) => updateListPayload(current, (list) => upsertById(list, appointment)), { revalidate: false });
  }

  function patchCustomerDoctorCache(doctor) {
    globalMutate(isProxyDoctorsKey, (current) => updateListPayload(current, (list) => replaceById(list, doctor)), { revalidate: false });
  }

  function revalidateCustomerGroups(...predicates) {
    predicates.forEach((predicate) => globalMutate(predicate, undefined, { revalidate: true }));
  }

  const profile = state.dashboard?.profile || {};
  const visibleDoctors = useMemo(() => sortPreferredDoctors(state.doctors, settings.preferredDoctorIds), [settings.preferredDoctorIds, state.doctors]);
  const subscriptionState = useSubscription(session);
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
  const now = Date.now();
  const sortedAppointments = useMemo(() => sortByDateDesc(state.appointments, ["start_at", "created_at", "updated_at"]), [state.appointments]);
  const upcomingAppointments = sortedAppointments.filter((appointment) => new Date(appointment.start_at || 0).getTime() >= now);
  const pastAppointments = sortedAppointments.filter((appointment) => new Date(appointment.start_at || 0).getTime() < now);
  const selectedDoctor = visibleDoctors.find((doctor) => String(doctor.user_id || doctor.id) === String(journey.doctorId)) || null;
  const pageQueryLoading = (
    (page === "orders" && ordersQuery.isLoading && !ordersQuery.data) ||
    (page === "appointment" && ((appointmentsQuery.isLoading && !appointmentsQuery.data) || (doctorsQuery.isLoading && !doctorsQuery.data))) ||
    (["settings", "profile"].includes(page) && ((ordersQuery.isLoading && !ordersQuery.data) || (appointmentsQuery.isLoading && !appointmentsQuery.data)))
  );
  const ordersLoading = Boolean(customerOrdersKey) && ordersQuery.isLoading && !Array.isArray(ordersQuery.data);
  const appointmentsLoading = Boolean(customerAppointmentsKey) && appointmentsQuery.isLoading && !Array.isArray(appointmentsQuery.data);
  const doctorsLoading = Boolean(customerDoctorsKey) && doctorsQuery.isLoading && !Array.isArray(doctorsQuery.data);
  const showSkeleton = (isLoading && !hasCustomerDashboardData(state)) || pageQueryLoading;

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
    return <CustomerMobileSkeleton page={page} />;
  }

  function openOrderDocuments(order) {
    if (!order?.id) return;
    router.push(`/admin/orders/${order.id}/documents?role=patient`);
  }

  async function cancelPendingOrder(order) {
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

  async function openDoctorAvailability(doctor) {
    const doctorId = doctor.user_id || doctor.id;
    const nextDate = journey.doctorId === doctorId ? journey.selectedDate : localDateKey(new Date());
    setPage("appointment");
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

  async function createAppointmentCheckout() {
    if (!journey.doctorId || !journey.selectedSlot) {
      return;
    }
    const session = hydrateStoredSession("patient");
    let createdAppointment = null;
    setJourney((current) => ({ ...current, loading: true, error: "" }));
    try {
      const appointment = await apiRequest(session, "/appointments", {
        method: "POST",
        body: {
          doctor_user_id: journey.doctorId,
          type: settings.preferredConsultationType,
          start_at: journey.selectedSlot.start_at,
          end_at: appointmentEndForSelection(journey.selectedSlot, journey.durationMinutes || minimumBookingMinutes),
          duration_minutes: journey.durationMinutes || minimumBookingMinutes,
          reason: sanitizeClientText(journey.reason, { max: 500 }).trim() || "Doctor consultation booking",
          timezone: settings.timezone || storeTimeZone
        }
      });
      createdAppointment = appointment;
      const checkout = await apiRequest(session, `/appointments/${appointment.id}/checkout`);
      setJourney((current) => ({
        ...current,
        mode: "checkout",
        appointment,
        checkout,
        loading: false,
        error: ""
      }));
      patchCustomerAppointmentCache(appointment);
      await mutateSummary((current) => current ? { ...current, appointments: upsertById(current.appointments || [], appointment) } : current, { revalidate: false });
      await appointmentsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, appointment) : current, { revalidate: false });
      revalidateCustomerGroups(isProxyAppointmentsKey);
    } catch (error) {
      if (!storefrontSettings.demoCheckoutFallbackEnabled) {
        setJourney((current) => ({
          ...current,
          mode: "checkout",
          appointment: createdAppointment || current.appointment,
          checkout: createdAppointment ? null : current.checkout,
          loading: false,
          error: error?.message || "Live checkout could not be created."
        }));
        return;
      }
      const appointment = buildMockAppointment(journey, selectedDoctor, settings, storeCurrency);
      setJourney((current) => ({
        ...current,
        mode: "checkout",
        appointment,
        checkout: {
          appointment,
          total: Number(selectedDoctor?.consultation_fee || 0),
          currency: storeCurrency,
          payment_status: "pending",
          payment_url: "#demo-payment",
          mock: true
        },
        loading: false,
        error: "The live appointment service is unavailable. A frontend checkout preview has been generated for testing."
      }));
    }
  }

  async function refreshConfirmation() {
    if (!journey.appointment?.id) {
      return;
    }
    if (storefrontSettings.demoCheckoutFallbackEnabled && (journey.checkout?.mock || journey.appointment?.mock)) {
      const confirmation = buildMockConfirmation(journey.appointment, selectedDoctor, storeCurrency);
      setJourney((current) => ({
        ...current,
        mode: "confirmation",
        appointment: confirmation.appointment,
        confirmation,
        loading: false,
        error: ""
      }));
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
      patchCustomerAppointmentCache(confirmation.appointment);
      await mutateSummary((current) => current ? { ...current, appointments: upsertById(current.appointments || [], confirmation.appointment) } : current, { revalidate: false });
      await appointmentsQuery.mutate((current) => Array.isArray(current) ? upsertById(current, confirmation.appointment) : current, { revalidate: false });
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
    setPage("appointment");
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
      await appointmentsQuery.mutate((current) => Array.isArray(current) ? replaceById(current, reviewedAppointment) : current, { revalidate: false });
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
  }

  function handleLogout() {
    const activeSession = session || hydrateStoredSession("patient");
    clearDashboardCacheForFrontend("patient", activeSession?.user?.id);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CUSTOMER_NURSE_REQUESTS_KEY);
    }
    clearSessionAuth(FRONTENDS.patient, activeSession);
    router.replace("/login");
  }

  async function cancelAppointmentFromDetails(appointmentId) {
    if (!appointmentId || appointmentActionBusy) {
      return;
    }
    const current = state.appointments.find((item) => String(item.id) === String(appointmentId));
    if (!current) {
      return;
    }
    setAppointmentActionBusy(true);
    try {
      const activeSession = hydrateStoredSession("patient");
      const response = await apiRequest(activeSession, `/appointments/${appointmentId}`, {
        method: "PATCH",
        body: { status: "cancelled" }
      });
      const updated = response?.appointment || response?.data?.appointment || response?.data || response;
      if (updated?.id) {
        patchCustomerAppointmentCache(updated);
        await mutateSummary((prev) => prev ? { ...prev, appointments: upsertById(prev.appointments || [], updated) } : prev, { revalidate: false });
        await appointmentsQuery.mutate((prev) => Array.isArray(prev) ? upsertById(prev, updated) : prev, { revalidate: false });
        setSelectedAppointment(updated);
      }
      revalidateCustomerGroups(isProxyAppointmentsKey);
    } finally {
      setAppointmentActionBusy(false);
    }
  }

  async function cancelCheckoutAppointment() {
    if (!journey.appointment?.id) {
      return;
    }
    await cancelAppointmentFromDetails(journey.appointment.id);
    setJourney(createJourneyState());
  }

  return <>
    <CustomerMobileDashboard
      page={page}
      setPage={setPage}
      showSkeleton={showSkeleton}
      state={state}
      stateError={state.error}
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
      onOpenAvailability={openDoctorAvailability}
      onOpenReviews={openDoctorReviews}
      onOpenAppointment={setSelectedAppointment}
      onOpenOrderDocuments={openOrderDocuments}
      onCancelPendingOrder={cancelPendingOrder}
      onUpdateAvailabilityDate={updateAvailabilityDate}
      onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
      onDurationChange={(durationMinutes) => setJourney((current) => ({ ...current, durationMinutes }))}
      onReasonChange={(reason) => setJourney((current) => ({ ...current, reason }))}
      onCreateAppointmentCheckout={createAppointmentCheckout}
      onRefreshConfirmation={refreshConfirmation}
      onCancelCheckoutAppointment={cancelCheckoutAppointment}
      onResetJourney={resetAppointmentJourney}
      onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
      onSubmitReview={submitReview}
      nurseRequestAuth={{
        baseUrl: session?.baseUrl || "",
        accessToken: session?.accessToken || "",
        adminEmail: "careteam@nevarihealth.com"
      }}
      onLogout={handleLogout}
    />
    {selectedAppointment ? <AppointmentDetailsModal
      appointment={selectedAppointment}
      doctors={visibleDoctors}
      storeTimeZone={storeTimeZone}
      busy={appointmentActionBusy}
      onCancelAppointment={cancelAppointmentFromDetails}
      onOpenOrderDocuments={openOrderDocuments}
      onClose={() => setSelectedAppointment(null)}
    /> : null}
    {selectedOrder ? <OrderDetailsModal
      order={selectedOrder}
      storeCurrency={storeCurrency}
      onOpenOrderDocuments={openOrderDocuments}
      onCancelPendingOrder={cancelPendingOrder}
      onClose={() => setSelectedOrder(null)}
    /> : null}
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
  const fallbackProfile = fallbackState?.dashboard?.profile || {};
  const sessionUser = session?.user || {};

  return {
    error: fallbackState?.error || "",
    dashboard: {
      ...(fallbackState?.dashboard || {}),
      store_currency: fallbackState?.dashboard?.store_currency || SSR_SAFE_STORE_CURRENCY,
      store_timezone: fallbackState?.dashboard?.store_timezone || SSR_SAFE_STORE_TIMEZONE,
      profile: {
        id: fallbackProfile.id || sessionUser.id || null,
        email: fallbackProfile.email || settings.email || sessionUser.email || "",
        display_name: fallbackProfile.display_name || settings.displayName || sessionUser.display_name || sessionUser.name || "Customer",
        roles: (Array.isArray(fallbackProfile.roles) && fallbackProfile.roles.length)
          ? fallbackProfile.roles
          : resolveUserRoles(sessionUser)
      }
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
  if (page === "appointment") {
    return <CustomerAppointmentSkeleton />;
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
  return <div className="customer-dashboard-stack">
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

function CustomerAppHeader({ profile }) {
  return <div className="app-header customer-persistent-app-header">
    <div className="profile-mini">
      <div className="avatar">{initials(profile.display_name || "Customer")}</div>
      <div>
        <div className="small muted">Hello,</div>
        <div className="card-title">{profile.display_name || "Customer"}</div>
      </div>
    </div>
  </div>;
}

function CustomerOverview({ doctors, doctorsUnavailable, orders, appointments, orderCounts, spentThisMonth, onOpenPage, onOpenAvailability, onOpenReviews, onOpenAppointment, storeCurrency, storeTimeZone, storeUrl }) {
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
        page: "appointment"
      }));
    const doctorMatches = doctors
      .filter((doctor) => String(doctor.display_name || "").toLowerCase().includes(term))
      .slice(0, 4)
      .map((doctor) => ({
        key: `doctor-${doctor.user_id || doctor.id}`,
        label: doctor.display_name || "Doctor",
        meta: doctor.specialties?.join(", ") || "Available doctor",
        page: "appointment",
        doctor
      }));
    return [...orderMatches, ...appointmentMatches, ...doctorMatches].slice(0, 8);
  }, [appointments, doctors, orders, query, storeCurrency, storeTimeZone]);

  const appointmentCards = [...appointments]
    .filter((appointment) => new Date(appointment.start_at || 0).getTime() >= Date.now())
    .sort((left, right) => new Date(left.start_at || 0) - new Date(right.start_at || 0))
    .slice(0, 5);

  return <>
    <div className="overview-row">
      <h1 className="overview-title">Overview</h1>
      <a className="desktop-dashboard-cta" href={storeUrl} target="_blank" rel="noreferrer"><span className="desktop-dashboard-cta-icon" aria-hidden="true" />Go to store</a>
    </div>

    <div className="search-box mobile-search-box">
      <span className="mobile-icon-search" />
      <input placeholder="Search order number, appointment id, doctor" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {query ? <div className="booking-search-results">
      {searchResults.length ? searchResults.map((result) => <button className="booking-search-result" key={result.key} type="button" onClick={() => {
        setQuery(result.label);
        if (result.doctor) {
          onOpenAvailability(result.doctor);
          return;
        }
        onOpenPage(result.page);
      }}>
        <strong>{result.label}</strong>
        <span>{result.meta}</span>
      </button>) : <div className="booking-search-empty">No matching order, appointment, or doctor found.</div>}
    </div> : null}

    <div className="category-row">
      <div className="category-card metric-card">
        <strong>{money(spentThisMonth, storeCurrency)}</strong>
        <div className="category-name">Spent this month</div>
        <div className="category-meta">Processing and completed orders</div>
      </div>
      <div className="category-card">
        <div className="category-icon green">{orderCounts.total}</div>
        <div><div className="category-meta">{orderCounts.total} total</div><div className="category-name">Orders</div></div>
      </div>
      <div className="category-card">
        <div className="category-icon yellow">{appointments.length}</div>
        <div><div className="category-meta">{appointments.length} total</div><div className="category-name">Appointments</div></div>
      </div>
      <div className="category-card">
        <div className="category-icon lilac">{doctors.length}</div>
        <div><div className="category-meta">{doctors.length} visible</div><div className="category-name">Doctors</div></div>
      </div>
    </div>

    <div className="tiny-title">Upcoming appointments</div>
    {appointmentCards.length ? <div className="appointment-stack-viewport mobile-gap-bottom">
      <div className="appointment-stack-track">
        {appointmentCards.map((appointment, index) => <button className="appointment-stack-card appointment-card appointment-stack-button" key={appointment.id} type="button" style={{ "--stack": index }} onClick={() => onOpenAppointment(appointment)}>
          <div className="calendar-tile">
            <span>{new Date(appointment.start_at).toLocaleString("en-US", { month: "short" })}</span>
            <strong>{new Date(appointment.start_at).getDate()}</strong>
          </div>
          <div>
            <div className="card-title">{titleCase(appointment.type || "consultation")}</div>
            <div className="card-desc">{shortDate(appointment.start_at, true, storeTimeZone)}</div>
          </div>
          <div className="appointment-status-stack">
            <span className={`chip ${appointmentChipTone(appointment)}`}><span className="chip-dot" />{appointmentChipLabel(appointment)}</span>
            {appointmentHasPrescription(appointment) ? <span className="appointment-prescription-availability">Prescription Available</span> : null}
          </div>
        </button>)}
      </div>
    </div> : <div className="empty-card compact-empty mobile-gap-bottom"><div className="card-title">No appointment yet</div></div>}

    <div className="tiny-title">Nevari doctors</div>
    <DoctorCards doctors={doctors} doctorsUnavailable={doctorsUnavailable} onOpenAvailability={onOpenAvailability} onOpenReviews={onOpenReviews} storeCurrency={storeCurrency} />
  </>;
}

function AppointmentDetailsModal({ appointment, doctors, storeTimeZone, busy = false, onCancelAppointment, onOpenOrderDocuments, onClose }) {
  const doctor = doctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id)) || appointment.doctor || null;
  const joinUrl = getAppointmentJoinUrl(appointment);
  const paymentUrl = resolveAppointmentCheckoutUrl({ appointment, order: appointment?.order, payment_url: appointment?.payment_url, checkout_url: appointment?.checkout_url });
  const prescriptionOrderId = appointment?.prescription?.order_id || appointment?.prescription_order_id || null;
  const status = String(appointment?.status || "").toLowerCase();
  const paymentStatus = String(appointment?.payment_status || "").toLowerCase();
  const appointmentStartMs = new Date(appointment?.start_at || 0).getTime();
  const isPastAppointment = Number.isFinite(appointmentStartMs) && appointmentStartMs > 0 && appointmentStartMs < Date.now();
  const isCancelled = status === "cancelled" || status === "canceled";
  const isCompleted = status === "completed";
  const isPendingPayment = !isCancelled && !isCompleted && ["pending", "failed", "abandoned"].includes(paymentStatus) && Boolean(paymentUrl);
  const isConfirmedPaid = !isCancelled && !isCompleted && paymentStatus === "paid";
  const canCancel = isConfirmedPaid && typeof onCancelAppointment === "function";

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
    <button className="customer-appointment-modal-backdrop" type="button" aria-label="Close appointment details" onClick={onClose} />
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
      {!isPastAppointment ? <div className="action-stack">
        {isPendingPayment ? <a className="btn btn-primary btn-wide appointment-link-cta" href={paymentUrl} target="_blank" rel="noreferrer">Pay now</a> : null}
        {isConfirmedPaid && joinUrl ? <a className="btn btn-primary btn-wide appointment-link-cta" href={joinUrl} target="_blank" rel="noreferrer">Join Google Meet</a> : null}
        {isConfirmedPaid && !joinUrl ? <div className="appointment-inline-alert">Google Meet link will appear when the appointment is confirmed.</div> : null}
        {prescriptionOrderId && typeof onOpenOrderDocuments === "function" ? <button className="btn btn-outline btn-wide" type="button" onClick={() => onOpenOrderDocuments({ id: prescriptionOrderId })}>Open prescription order details</button> : null}
        {canCancel ? <button className="btn btn-outline btn-wide" type="button" disabled={busy} onClick={() => onCancelAppointment(appointment.id)}>{busy ? "Cancelling..." : "Cancel appointment"}</button> : null}
        {appointment.calendar?.ics_url ? <a className="btn btn-outline btn-wide appointment-link-cta" href={appointment.calendar.ics_url} target="_blank" rel="noreferrer">Download calendar invite</a> : null}
      </div> : null}
    </section>
  </div>;
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
      return <div className="booking-card booking-card-interactive" key={doctorId}>
        <div className="booking-row">
          <div className="booking-avatar">{initials(doctor.display_name || "Doctor")}</div>
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
          <div className="booking-stat"><strong>{money(doctor.consultation_fee || 0, storeCurrency)}</strong><span>Consultation fee</span></div>
        </div>
        <div className="doctor-card-actions">
          {showReviewsAction ? <button className="pill-button" type="button" onClick={() => onOpenReviews(doctor)}>Reviews</button> : null}
          <button className="booking-btn" type="button" onClick={() => onOpenAvailability(doctor)}>Book appointment</button>
        </div>
      </div>;
    }) : <div className="empty-card"><div className="card-title">{doctorsUnavailable ? "Doctors not available at the moment" : "Doctors not available at the moment"}</div></div>}
  </div>;
}

function OrdersPage({ orders, counts, expandedOrderId, loading = false, onToggleOrder, onOpenOrderDocuments, onCancelPendingOrder, onOpenOrderDetails, storeCurrency }) {
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
                {order.status === "completed" ? <button className="customer-order-pdf-button" type="button" aria-label="Open documents" title="Open documents" onClick={() => onOpenOrderDocuments(order)}>
                  <DashboardIcon name="orders" />
                </button> : null}
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
  onUpdateAvailabilityDate,
  onSelectSlot,
  onDurationChange,
  onReasonChange,
  onCreateAppointmentCheckout,
  onRefreshConfirmation,
  onCancelCheckoutAppointment,
  onResetJourney,
  onReviewDraftChange,
  onSubmitReview,
  calendarDownloadUrl,
  storeCurrency,
  storeTimeZone,
  storefrontSettings,
  minimumBookingMinutes,
}) {
  const [filter, setFilter] = useState("all");
  const [doctorTab, setDoctorTab] = useState("recent");
  const bookDoctorSectionRef = useRef(null);
  const filters = useMemo(() => buildAppointmentFilters(upcoming, past), [past, upcoming]);
  const allAppointments = useMemo(() => [...upcoming, ...past], [past, upcoming]);
  const visibleAppointments = useMemo(() => filterAppointmentsList(allAppointments, filter), [allAppointments, filter]);
  const recentDoctorIds = useMemo(() => {
    const seen = new Set();
    return [...allAppointments]
      .sort((left, right) => new Date(right.start_at || 0) - new Date(left.start_at || 0))
      .reduce((acc, appointment) => {
        const doctorId = String(appointment.doctor_user_id || "");
        if (doctorId && !seen.has(doctorId)) {
          seen.add(doctorId);
          acc.push(doctorId);
        }
        return acc;
      }, []);
  }, [allAppointments]);
  const recentDoctors = useMemo(() => recentDoctorIds.map((doctorId) => doctors.find((item) => String(item.user_id || item.id) === doctorId)).filter(Boolean), [doctors, recentDoctorIds]);
  const displayedDoctors = doctorTab === "recent" && recentDoctors.length ? recentDoctors : doctors;
  const showBookAppointmentPlus = appointmentsLoading || visibleAppointments.length > 0;

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
    setDoctorTab("all");
    if (bookDoctorSectionRef.current && typeof bookDoctorSectionRef.current.scrollIntoView === "function") {
      bookDoctorSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return <div className="customer-dashboard-stack">
    <section className="customer-list-shell book-doctor-shell">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Appointment</span>
          <h2>Appointment history</h2>
        </div>
        {showBookAppointmentPlus ? <button className="pill-button customer-panel-booknow-btn" type="button" aria-label="Book now" title="Book now" onClick={handleNewAppointmentClick}>Book Now</button> : null}
      </div>
      <div className="filter-bar customer-filter-bar" role="tablist" aria-label="Appointment filters">
        {filters.map((item) => <button className={`filter-btn ${filter === item.id ? "active" : ""}`} key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>
          {item.label}
          <span className="filter-count">{item.count}</span>
        </button>)}
      </div>
      <AppointmentSection title="Appointments" items={visibleAppointments} tone={filter} doctors={doctors} storeTimeZone={storeTimeZone} loading={appointmentsLoading} />
    </section>
    <section className="customer-list-shell" ref={bookDoctorSectionRef}>
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Book appointment</span>
          <h2>Choose a doctor</h2>
        </div>
      </div>
      <div className="filter-bar customer-segmented-bar" role="tablist" aria-label="Doctor list filter">
        <button className={`filter-btn ${doctorTab === "recent" ? "active" : ""}`} type="button" role="tab" aria-selected={doctorTab === "recent"} onClick={() => setDoctorTab("recent")}>
          My doctor
          <span className="filter-count">{recentDoctors.length}</span>
        </button>
        <button className={`filter-btn ${doctorTab === "all" ? "active" : ""}`} type="button" role="tab" aria-selected={doctorTab === "all"} onClick={() => setDoctorTab("all")}>
          All doctors
          <span className="filter-count">{doctors.length}</span>
        </button>
      </div>
      <DoctorCards
        doctors={displayedDoctors}
        doctorsUnavailable={doctorsUnavailable}
        loading={doctorsLoading}
        onOpenAvailability={onOpenAvailability}
        onOpenReviews={onOpenReviews}
        showReviewsAction={doctorTab === "recent"}
        storeCurrency={storeCurrency}
        className="book-doctor-vertical-list"
      />
    </section>
  </div>;
}

function OrderDetailsModal({ order, storeCurrency, onOpenOrderDocuments, onCancelPendingOrder, onClose }) {
  const statusMeta = orderStatusMeta(order?.status);
  const typeMeta = getOrderTypeMeta(order || {});
  const canCancel = String(order?.status || "").toLowerCase() === "pending";
  const orderPaymentUrl = resolveOrderPaymentUrl(order);
  const canPayNow = Boolean(orderPaymentUrl);
  const items = Array.isArray(order?.items) ? order.items : [];
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)), 0);
  const deliveryFee = Math.max(0, Number(order?.total || 0) - subtotal);
  const timeline = [
    { label: "Order confirmed", done: true },
    { label: "Processing", done: ["processing", "completed"].includes(String(order?.status || "").toLowerCase()) },
    { label: "Delivered", done: String(order?.status || "").toLowerCase() === "completed" }
  ];

  return <div className="customer-appointment-modal" role="dialog" aria-modal="true" aria-label="Order details">
    <button className="customer-appointment-modal-backdrop" type="button" aria-label="Close order details" onClick={onClose} />
    <section className="customer-appointment-detail-card customer-order-details-card">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Order details</span>
          <h2>Order #{order?.number || order?.id}</h2>
        </div>
        <button className="icon-btn" type="button" aria-label="Close order details" onClick={onClose}>x</button>
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
        {canCancel ? <button className="btn btn-primary btn-wide" type="button" onClick={() => onCancelPendingOrder(order)}>Cancel order</button> : null}
      </div>
    </section>
  </div>;
}

function AvailableTimePage({ doctor, journey, onBack, onUpdateAvailabilityDate, onSelectSlot, onDurationChange, onReasonChange, onCreateAppointmentCheckout, minimumBookingMinutes, storeTimeZone }) {
  const days = nextSevenDays(journey.selectedDate);
  const durationOptions = consultationDurationOptions(minimumBookingMinutes);
  const selectedDuration = journey.durationMinutes || minimumBookingMinutes;
  const selectedDurationAvailable = !journey.selectedSlot || durationIsAvailable(journey.slots, journey.selectedSlot, selectedDuration, minimumBookingMinutes);
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" aria-label="Go back" onClick={onBack}>{"←"}</button>
    </div>
    <div className="appointment-surface-card">
      <div className="appointment-surface-head">
        <div>
          <h3>{parseDateKey(journey.selectedDate).toLocaleString("en-US", { month: "long" })}</h3>
          <p>{doctor?.display_name || "Doctor"}</p>
        </div>
      </div>
      <div className="appointment-date-strip">
        {days.map((day) => <button key={day.key} className={`appointment-date-pill ${day.key === journey.selectedDate ? "active" : ""}`} type="button" onClick={() => onUpdateAvailabilityDate(day.key)}>
          <span>{day.weekday}</span>
          <strong>{day.day}</strong>
        </button>)}
      </div>
      {journey.loading ? <div className="empty-card compact-empty"><div className="card-title">Loading slots...</div></div> : null}
      {journey.error ? <div className="appointment-inline-alert">{journey.error}</div> : null}
      <div className="appointment-slot-grid">
        {journey.slots.length ? journey.slots.map((slot) => {
          const active = journey.selectedSlot?.start_at === slot.start_at;
          return <button className={`appointment-slot-button ${active ? "active" : ""}`} key={slot.start_at} type="button" onClick={() => onSelectSlot(slot)}>
            {formatTime(slot.start_at, storeTimeZone)}
          </button>;
        }) : !journey.loading && !journey.error ? <div className="empty-card compact-empty"><div className="card-title">Doctor not available</div></div> : null}
      </div>
    </div>
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
    <button className="appointment-primary-cta" type="button" disabled={!journey.selectedSlot || journey.loading || !journey.reason.trim() || !selectedDurationAvailable} onClick={onCreateAppointmentCheckout}>Book appointment</button>
  </section>;
}

function CheckoutPage({ journey, doctor, onBack, onRefreshConfirmation, onCancelCheckoutAppointment, storeCurrency, storeTimeZone, livePaymentsEnabled = false }) {
  const appointment = journey.checkout?.appointment || journey.appointment;
  const paymentUrl = resolveAppointmentCheckoutUrl(journey.checkout);
  useEffect(() => {
    if (!paymentUrl || paymentUrl === "#demo-payment" || journey.loading) {
      return;
    }
    const intervalId = window.setInterval(() => {
      onRefreshConfirmation();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [journey.loading, onRefreshConfirmation, paymentUrl]);
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" aria-label="Go back" onClick={onBack}>{"←"}</button>
      <div className="appointment-circle-button appointment-circle-button-static" aria-hidden="true" />
    </div>
    <div className="appointment-surface-card">
      <div className="checkout-summary-grid">
        <div><span>Doctor</span><strong>{doctor?.display_name || appointment?.doctor?.display_name || "Doctor"}</strong></div>
        <div><span>Date</span><strong>{friendlyDate(appointment?.start_at, storeTimeZone)}</strong></div>
        <div><span>Time</span><strong>{formatTime(appointment?.start_at, storeTimeZone)}</strong></div>
        <div><span>Amount</span><strong>{money(journey.checkout?.total || 0, storeCurrency)}</strong></div>
      </div>
      <div className="checkout-status-banner">
        <strong>{titleCase(journey.checkout?.payment_status || appointment?.payment_status || "pending")}</strong>
        <span>Your booking is pending payment and will expire after 10 minutes if unpaid.</span>
      </div>
      {journey.error ? <p className="receipt-feedback">{journey.error}</p> : null}
      <div className="calendar-action-stack">
        {paymentUrl ? <a className="appointment-primary-cta appointment-link-cta" href={paymentUrl} target="_blank" rel="noreferrer">{!livePaymentsEnabled && paymentUrl === "#demo-payment" ? "Open demo payment" : "Proceed to payment"}</a> : null}
        <button className="appointment-secondary-cta" type="button" onClick={onCancelCheckoutAppointment}>Cancel appointment</button>
      </div>
    </div>
  </section>;
}

function ConfirmationPage({ journey, doctor, onBack, calendarDownloadUrl, storeTimeZone }) {
  const confirmation = journey.confirmation;
  const appointment = confirmation?.appointment || journey.appointment;
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>{"<"}</button>
      <h2>Confirmation</h2>
      <div className="appointment-circle-button appointment-circle-button-static">OK</div>
    </div>
    <div className="appointment-surface-card">
      <div className="confirmation-hero">
        <div className="confirmation-badge">08</div>
        <h3>Appointment confirmed</h3>
        <p>Your payment was received and your calendar invite is ready.</p>
      </div>
      <div className="checkout-summary-grid">
        <div><span>Doctor</span><strong>{doctor?.display_name || appointment?.doctor?.display_name || "Doctor"}</strong></div>
        <div><span>Date</span><strong>{friendlyDate(appointment?.start_at, storeTimeZone)}</strong></div>
        <div><span>Time</span><strong>{formatTime(appointment?.start_at, storeTimeZone)}</strong></div>
        <div><span>Order</span><strong>{confirmation?.order_number || "Paid"}</strong></div>
      </div>
      <div className="calendar-action-stack">
        {getAppointmentJoinUrl(appointment, confirmation) ? <a className="appointment-primary-cta appointment-link-cta" href={getAppointmentJoinUrl(appointment, confirmation)} target="_blank" rel="noreferrer">Join meeting</a> : null}
        {calendarDownloadUrl ? <a className="appointment-primary-cta appointment-link-cta" href={calendarDownloadUrl} target="_blank" rel="noreferrer">Add to Apple Calendar</a> : null}
        {confirmation?.calendar?.outlook_url ? <a className="appointment-secondary-cta appointment-link-cta" href={confirmation.calendar.outlook_url} target="_blank" rel="noreferrer">Add to Outlook</a> : null}
      </div>
    </div>
  </section>;
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

function AppointmentSection({ title, items, tone, doctors, storeTimeZone, loading = false }) {
  if (loading) {
    return <div className="customer-appointment-history-slider" role="region" aria-label={`${title} loading`}>
      <div className="customer-appointment-history-track">
        {Array.from({ length: 3 }, (_, index) => <article className={`customer-appointment-card customer-appointment-card-slide ${tone} skeleton-panel`} key={`customer-appointment-live-skeleton-${index}`}>
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <div className="customer-appointment-copy">
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
          <div className="customer-appointment-side">
            <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
          </div>
        </article>)}
      </div>
    </div>;
  }
  if (!items.length) {
    return <div className="customer-appointment-list">
      <div className="empty-card compact-empty"><div className="card-title">No appointments in this section.</div></div>
    </div>;
  }

  return <div className="customer-appointment-history-slider" role="region" aria-label={`${title} horizontal list`}>
    <div className="customer-appointment-history-track">
      {items.map((appointment) => {
        const doctor = doctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
        const chipTone = appointmentChipTone(appointment);
        return <article className={`customer-appointment-card customer-appointment-card-slide ${tone}`} key={appointment.id}>
          <div className="customer-order-icon"><DashboardIcon name="appointment" /></div>
          <div className="customer-appointment-copy">
            <div className="card-title">{titleCase(appointment.type || "consultation")}</div>
            <div className="card-desc">{shortDate(appointment.start_at, true, storeTimeZone)}</div>
            <div className="customer-meta-line">{doctor?.display_name || `Doctor #${appointment.doctor_user_id}`}</div>
          </div>
          <div className="customer-appointment-side">
            <div className="appointment-status-stack">
              <span className={`chip ${chipTone}`}><span className="chip-dot" />{appointmentChipLabel(appointment)}</span>
              {appointmentHasPrescription(appointment) ? <span className="appointment-prescription-availability">Prescription Available</span> : null}
            </div>
            {getAppointmentJoinUrl(appointment) ? <a className="pill-button" href={getAppointmentJoinUrl(appointment)} target="_blank" rel="noreferrer">Join</a> : null}
          </div>
        </article>;
      })}
    </div>
  </div>;
}

function SettingsPage({ profile, doctors, orders, appointments, settings, onSettingsChange, onLogout }) {
  const invoiceCount = orders.filter((order) => ["processing", "completed"].includes(String(order.status || "").toLowerCase())).length;
  return <div className="customer-dashboard-stack">
    <section className="customer-list-shell customer-settings-shell">
      <div className="profile-card customer-settings-hero">
        <div className="avatar">{initials(settings.displayName || profile.display_name || "Customer")}</div>
        <div>
          <div className="card-title">{settings.displayName || profile.display_name || "Customer"}</div>
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
            <label><span>Display name</span><input value={settings.displayName} placeholder={profile.display_name || "Customer"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: sanitizeClientText(event.target.value, { max: 120 }) }))} /></label>
            <label><span>Email</span><input value={settings.email} placeholder={profile.email || "customer@email.com"} onChange={(event) => onSettingsChange((current) => ({ ...current, email: sanitizeClientText(event.target.value, { max: 254 }) }))} /></label>
            <label><span>Phone number</span><input value={settings.phone} placeholder="+234 ..." onChange={(event) => onSettingsChange((current) => ({ ...current, phone: sanitizeClientText(event.target.value, { max: 24 }) }))} /></label>
            <label><span>Address</span><textarea rows={3} value={settings.address} onChange={(event) => onSettingsChange((current) => ({ ...current, address: sanitizeClientText(event.target.value, { max: 200 }) }))} /></label>
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
            <label><span>Timezone</span><input value={settings.timezone} onChange={(event) => onSettingsChange((current) => ({ ...current, timezone: sanitizeClientText(event.target.value, { max: 80 }) }))} /></label>
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
          <button className="button-primary customer-settings-logout" type="button" onClick={onLogout}>Logout all devices</button>
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

function ProfilePage({ profile, orders, appointments, doctors, settings, onSettingsChange, onLogout }) {
  return <div className="customer-dashboard-stack">
    <section className="customer-profile-hero">
      <div className="avatar">{initials(settings.displayName || profile.display_name || "Customer")}</div>
      <div>
        <span className="customer-section-kicker">My Profile</span>
        <h2>{settings.displayName || profile.display_name || "Customer"}</h2>
        <p className="customer-hero-text">Edit your profile inline. Email stays locked to your account.</p>
      </div>
      <button className="pill-button danger" type="button" onClick={onLogout}>Logout</button>
    </section>
    <section className="customer-profile-grid customer-profile-grid-editable">
      <article className="customer-profile-card">
        <span>Display name</span>
        <input value={settings.displayName} placeholder={profile.display_name || "Customer"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: sanitizeClientText(event.target.value, { max: 120 }) }))} />
      </article>
      <article className="customer-profile-card">
        <span>Email address</span>
        <input value={profile.email || "No email available"} readOnly aria-readonly="true" />
      </article>
      <article className="customer-profile-card">
        <span>Phone number</span>
        <input value={settings.phone} placeholder="+234 ..." onChange={(event) => onSettingsChange((current) => ({ ...current, phone: sanitizeClientText(event.target.value, { max: 24 }) }))} />
      </article>
      <article className="customer-profile-card customer-profile-card-wide">
        <span>Address</span>
        <textarea rows={3} value={settings.address} onChange={(event) => onSettingsChange((current) => ({ ...current, address: sanitizeClientText(event.target.value, { max: 200 }) }))} />
      </article>
      <article className="customer-profile-card">
        <span>Orders placed</span>
        <strong>{orders.length}</strong>
      </article>
      <article className="customer-profile-card">
        <span>Appointments booked</span>
        <strong>{appointments.length}</strong>
      </article>
      <article className="customer-profile-card">
        <span>Doctors in dashboard</span>
        <strong>{doctors.length}</strong>
      </article>
    </section>
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

function firstName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "Customer";
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

function sanitizeClientText(value, { max = 500, allowMarkup = false } = {}) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  const cleaned = allowMarkup ? text : text.replace(/[<>`]/g, "");
  return cleaned.slice(0, max);
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
  return file.size <= 5 * 1024 * 1024 && allowedExtensions.test(file.name || "") && (!file.type || allowedTypes.has(file.type));
}

function normalizeBookingMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 5 ? parsed : 30;
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
    total: Number(selectedDoctor?.consultation_fee || 0),
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
      patient: { display_name: profile.display_name || "Customer" }
    }, ...(current.reviews || [])]
  };
}

function getAppointmentJoinUrl(appointment, confirmation = null) {
  const paid = String(appointment?.payment_status || "").toLowerCase() === "paid" || String(appointment?.status || "").toLowerCase() === "confirmed";
  if (!paid) {
    return "";
  }
  const candidates = [
    appointment?.meet_link,
    appointment?.google_meet_link,
    appointment?.meeting_url,
    appointment?.meeting_link,
    confirmation?.appointment?.meet_link,
    confirmation?.appointment?.google_meet_link,
    confirmation?.meet_link,
    confirmation?.google_meet_link,
    confirmation?.meeting_url,
    confirmation?.meeting_link,
    confirmation?.calendar?.meet_link,
    appointment?.calendar?.meet_link
  ];
  const match = candidates.find((value) => typeof value === "string" && /https?:\/\/meet\.google\.com\//i.test(value));
  return match || "";
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
  // Do not fall back to WooCommerce checkout URLs for customer dashboard pay actions.
  return "";
}

function resolveBrandedAppointmentPayUrl(checkout) {
  if (typeof window === "undefined") {
    return "";
  }
  const invoiceRef = resolveCheckoutInvoiceRef(checkout);
  const paymentToken = String(checkout?.payment_token || checkout?.order?.payment_token || "").trim();
  if (!invoiceRef || !paymentToken) {
    return "";
  }
  return `${window.location.origin}/pay/${encodeURIComponent(invoiceRef)}?role=patient&payment_token=${encodeURIComponent(paymentToken)}`;
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

function filterAppointmentsList(appointments, filter) {
  const now = Date.now();
  const upcoming = appointments
    .filter((item) => new Date(item.start_at || 0).getTime() >= now)
    .sort((left, right) => dateTimeValue(right, ["start_at", "created_at", "updated_at"]) - dateTimeValue(left, ["start_at", "created_at", "updated_at"]));
  const past = appointments
    .filter((item) => new Date(item.start_at || 0).getTime() < now)
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
  return appointmentStatusMeta(appointment).tone;
}

function appointmentChipLabel(appointment) {
  return appointmentStatusMeta(appointment).label;
}

function appointmentHasPrescription(appointment) {
  return Boolean(appointment?.prescription?.id || appointment?.prescription_order_id || appointment?.prescription_id);
}

function appointmentStatusMeta(appointment) {
  const status = String(appointment?.status || "").toLowerCase();
  const paymentStatus = String(appointment?.payment_status || "").toLowerCase();
  const startMs = new Date(appointment?.start_at || 0).getTime();
  const endMs = new Date(appointment?.end_at || 0).getTime();
  const now = Date.now();
  const minutesToStart = Number.isFinite(startMs) && startMs > now ? Math.max(1, Math.round((startMs - now) / 60000)) : null;

  if (status === "cancelled" || status === "canceled") {
    return { tone: "canceled", label: "Canceled" };
  }
  if (paymentStatus === "failed" || status === "failed") {
    return { tone: "canceled", label: "Failed" };
  }
  if ((status === "awaiting_payment" || paymentStatus === "pending" || paymentStatus === "abandoned") && paymentStatus !== "paid") {
    return { tone: "pending", label: "Awaiting Payment" };
  }
  if (status === "requested" || status === "awaiting_confirmation") {
    return { tone: "processing", label: "Awaiting Confirmation" };
  }
  if (status === "checked_in") {
    return { tone: "processing", label: "In progress" };
  }
  if (Number.isFinite(startMs) && startMs > now && minutesToStart !== null && minutesToStart <= 30) {
    return { tone: "warning", label: `In ${minutesToStart} min` };
  }
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && now >= startMs && now < endMs) {
    return { tone: "processing", label: "In progress" };
  }
  if (status === "completed" || (Number.isFinite(endMs) && endMs > 0 && now >= endMs)) {
    return { tone: "complete", label: "Ended" };
  }
  return { tone: "processing", label: "Awaiting Confirmation" };
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

function localDateInputValue(date = new Date()) {
  const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return d.toISOString().slice(0, 10);
}

function CustomerMobileDashboard({
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
  onOpenAvailability,
  onOpenAppointment,
  onOpenOrderDocuments,
  onCancelPendingOrder,
  onUpdateAvailabilityDate,
  onSelectSlot,
  onDurationChange,
  onReasonChange,
  onCreateAppointmentCheckout,
  onRefreshConfirmation,
  onCancelCheckoutAppointment,
  onResetJourney,
  onReviewDraftChange,
  onSubmitReview,
  nurseRequestAuth,
  onLogout
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previousPage, setPreviousPage] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [appointmentTab, setAppointmentTab] = useState("all");
  const [appointmentComposerOpen, setAppointmentComposerOpen] = useState(false);
  const [appointmentComposerLoading, setAppointmentComposerLoading] = useState(false);
  const [appointmentComposerMonth, setAppointmentComposerMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [appointmentComposerDate, setAppointmentComposerDate] = useState("");
  const [appointmentComposerDatePicked, setAppointmentComposerDatePicked] = useState(false);
  const [appointmentComposerDoctorId, setAppointmentComposerDoctorId] = useState("");
  const [appointmentComposerDoctorMenuOpen, setAppointmentComposerDoctorMenuOpen] = useState(false);
  const [appointmentComposerSelectedSlot, setAppointmentComposerSelectedSlot] = useState("");
  const [appointmentComposerSlotsRefreshing, setAppointmentComposerSlotsRefreshing] = useState(false);
  const [appointmentComposerLiveSlots, setAppointmentComposerLiveSlots] = useState([]);
  const [appointmentComposerReason, setAppointmentComposerReason] = useState("");
  const [appointmentComposerErrors, setAppointmentComposerErrors] = useState({});
  const [appointmentComposerSuccess, setAppointmentComposerSuccess] = useState(null);
  const [localAppointments, setLocalAppointments] = useState([]);
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
  const [clinicalRequirements, setClinicalRequirements] = useState([]);
  const [uploadedMedicalFiles, setUploadedMedicalFiles] = useState({});
  const uploadInputRefs = useRef({});
  const requestStep2ErrorTimeoutRef = useRef(null);
  const requestStep3ErrorTimeoutRef = useRef(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitError, setRequestSubmitError] = useState("");
  const [requestSubmitLoadingState, setRequestSubmitLoadingState] = useState(false);
  const [latestSubmittedRequest, setLatestSubmittedRequest] = useState(null);
  const [nurseRequests, setNurseRequests] = useState([]);
  const [bookCalendarReason, setBookCalendarReason] = useState("");
  const [calendarDay, setCalendarDay] = useState(7);
  const [calendarTime, setCalendarTime] = useState("09:41");
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!["appointment", "request"].includes(page)) {
      setAppointmentTab("all");
      setRequestStep(1);
      setRequestSubmitted(false);
      setRequestSubmitting(false);
      setRequestSubmitLoadingState(false);
      setRequestSubmitError("");
      setLatestSubmittedRequest(null);
      setAppointmentComposerOpen(false);
      setAppointmentComposerLoading(false);
      setAppointmentComposerDate("");
      setAppointmentComposerDatePicked(false);
      setAppointmentComposerDoctorMenuOpen(false);
      setAppointmentComposerSelectedSlot("");
      setAppointmentComposerReason("");
      setAppointmentComposerErrors({});
      setAppointmentComposerSuccess(null);
      setRequestStep2Errors({});
      setRequestStep3Errors({});
    }
  }, [page]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(CUSTOMER_NURSE_REQUESTS_KEY) || "[]");
      if (Array.isArray(stored)) setNurseRequests(stored);
    } catch {
      setNurseRequests([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOMER_NURSE_REQUESTS_KEY, JSON.stringify(nurseRequests));
  }, [nurseRequests]);

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
    if (!["appointment", "request"].includes(page)) {
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

  const composerDoctors = useMemo(() => {
    if (visibleDoctors.length) {
      return visibleDoctors.map((doctor, index) => ({
        id: String(doctor.user_id || doctor.id || `doc-${index}`),
        initials: initials(doctor.display_name || "DR"),
        name: doctor.display_name || `Doctor ${index + 1}`,
        specialty: doctor.specialties?.[0] || "General Physician"
      }));
    }
    return [
      { id: "HA", initials: "HA", name: "Dr. Hazidat Ahmed", specialty: "General Physician" },
      { id: "DS", initials: "DS", name: "Dr. Daniel Smith", specialty: "Cardiologist" },
      { id: "MP", initials: "MP", name: "Dr. Maria Peters", specialty: "Pediatrician" },
      { id: "NO", initials: "NO", name: "Dr. Nora Okafor", specialty: "Dermatologist" }
    ];
  }, [visibleDoctors]);

  const selectedComposerDoctor = useMemo(
    () => composerDoctors.find((doctor) => doctor.id === appointmentComposerDoctorId) || composerDoctors[0] || null,
    [appointmentComposerDoctorId, composerDoctors]
  );

  useEffect(() => {
    if (!appointmentComposerDoctorId && composerDoctors.length) {
      setAppointmentComposerDoctorId(composerDoctors[0].id);
    }
  }, [appointmentComposerDoctorId, composerDoctors]);

  const appointmentComposerSlots = useMemo(() => {
    if (!appointmentComposerDate || !selectedComposerDoctor?.id) return [];
    const fallbackPool = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];
    const pool = appointmentComposerLiveSlots.length ? appointmentComposerLiveSlots : fallbackPool;
    const todayKey = localDateInputValue(new Date());
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    return pool.map((time) => {
      const [hours = "0", minutes = "0"] = time.split(":");
      const minutesValue = Number(hours) * 60 + Number(minutes);
      const disabledByToday = appointmentComposerDate === todayKey && minutesValue <= nowMinutes;
      return { value: time, disabled: disabledByToday };
    });
  }, [appointmentComposerDate, selectedComposerDoctor]);

  const appointmentComposerHasAvailableSlots = appointmentComposerSlots.some((slot) => !slot.disabled);

  useEffect(() => {
    if (!appointmentComposerOpen || !appointmentComposerDatePicked || !appointmentComposerDate || !selectedComposerDoctor?.id) {
      setAppointmentComposerLiveSlots([]);
      return;
    }
    let ignore = false;
    setAppointmentComposerSlotsRefreshing(true);
    const activeSession = hydrateStoredSession("patient");
    apiRequest(activeSession, `/doctors/${selectedComposerDoctor.id}/availability`, {
      params: { date: appointmentComposerDate },
      suppressHttpError: true
    })
      .then((payload) => {
        if (ignore) return;
        const slots = Array.isArray(payload?.slots) ? payload.slots : [];
        const normalized = [...new Set(slots
          .map((slot) => {
            const startAt = slot?.start_at || slot?.start || slot?.time || "";
            if (!startAt) return "";
            const date = new Date(startAt);
            if (!Number.isNaN(date.getTime())) {
              return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
            }
            const match = String(startAt).match(/(\d{2}):(\d{2})/);
            return match ? `${match[1]}:${match[2]}` : "";
          })
          .filter(Boolean))];
        setAppointmentComposerLiveSlots(normalized);
      })
      .catch(() => {
        if (!ignore) setAppointmentComposerLiveSlots([]);
      })
      .finally(() => {
        if (!ignore) setAppointmentComposerSlotsRefreshing(false);
      });
    return () => {
      ignore = true;
    };
  }, [appointmentComposerDate, appointmentComposerDatePicked, appointmentComposerOpen, selectedComposerDoctor]);

  useEffect(() => {
    if (!appointmentComposerOpen || appointmentComposerDate) return;
    const today = localDateInputValue(new Date());
    setAppointmentComposerDate(today);
    setAppointmentComposerDatePicked(false);
  }, [appointmentComposerDate, appointmentComposerOpen]);

  const mergedAppointments = useMemo(
    () => [...localAppointments, ...upcomingAppointments, ...pastAppointments]
      .sort((a, b) => dateTimeValue(b, ["start_at", "created_at", "updated_at"]) - dateTimeValue(a, ["start_at", "created_at", "updated_at"])),
    [localAppointments, pastAppointments, upcomingAppointments]
  );
  const visibleAppointments = useMemo(() => {
    if (appointmentTab === "upcoming") {
      return mergedAppointments.filter((item) => new Date(item.start_at || 0).getTime() >= Date.now());
    }
    if (appointmentTab === "previous") {
      return mergedAppointments.filter((item) => new Date(item.start_at || 0).getTime() < Date.now());
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
  const showAppointmentPagePlus = appointmentsLoading || visibleAppointments.length > 0;
  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (term.length < 3) {
      return [];
    }

    const orderMatches = state.orders
      .filter((order) => [
        order.number,
        order.id,
        order.order_number,
        order.reference
      ].some((value) => String(value || "").toLowerCase().includes(term)))
      .slice(0, 5)
      .map((order) => ({
        key: `order-${order.id}`,
        area: "Orders",
        label: `Order #${order.number || order.id}`,
        meta: `${money(order.total, storeCurrency)} · ${titleCase(order.status)}`,
        onSelect: () => {
          setExpandedOrderId(order.id);
          setSelectedOrder(order);
          goToPage("orders");
        }
      }));

    const appointmentMatches = state.appointments
      .filter((appointment) => {
        const doctor = visibleDoctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
        return [
          appointment.id,
          appointment.status,
          doctor?.display_name,
          doctor?.specialties?.join(" "),
          shortDate(appointment.start_at, true, storeTimeZone)
        ].some((value) => String(value || "").toLowerCase().includes(term));
      })
      .slice(0, 5)
      .map((appointment) => {
        const doctor = visibleDoctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
        return {
          key: `appointment-${appointment.id}`,
          area: "Appointments",
          label: `Appointment #${appointment.id}`,
          meta: `${shortDate(appointment.start_at, true, storeTimeZone)} · ${doctor?.display_name || "Doctor"}`,
          onSelect: () => {
            setSelectedAppointment(appointment);
            goToPage("appointment");
          }
        };
      });

    const doctorMatches = visibleDoctors
      .filter((doctor) => [
        doctor.display_name,
        doctor.specialties?.join(" "),
        doctor.email
      ].some((value) => String(value || "").toLowerCase().includes(term)))
      .slice(0, 5)
      .map((doctor) => ({
        key: `doctor-${doctor.user_id || doctor.id}`,
        area: "Doctors",
        label: doctor.display_name || "Doctor",
        meta: doctor.specialties?.join(", ") || "Available doctor",
        onSelect: () => onOpenAvailability(doctor)
      }));

    return [...orderMatches, ...appointmentMatches, ...doctorMatches].slice(0, 10);
  }, [goToPage, onOpenAvailability, searchQuery, setExpandedOrderId, setSelectedOrder, state.appointments, state.orders, storeTimeZone, storeCurrency, visibleDoctors]);

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
    if (nextPage !== "appointment") {
      setJourney(createJourneyState());
    }
  }

  function openSearchPage() {
    if (page !== "search") {
      setPreviousPage(page);
    }
    setPage("search");
  }

  function exitSearchPage() {
    setPage(previousPage || "overview");
  }

  function openRequestFlow() {
    setAppointmentComposerOpen(false);
    setAppointmentTab("upcoming");
    setRequestSubmitted(false);
    setRequestStep(1);
    goToPage("request");
  }

  function transitionToRequestStep(nextStep) {
    setRequestSubmitError("");
    setRequestStep2Errors({});
    setRequestStep3Errors({});
    setRequestStepAnimatingOut(true);
    window.setTimeout(() => {
      setRequestStep(nextStep);
      setRequestStepAnimatingOut(false);
    }, 140);
  }

  function validateAppointmentComposer() {
    const errors = {};
    if (!selectedComposerDoctor) errors.doctor = "Select a doctor.";
    if (!appointmentComposerDate) errors.date = "Select a date.";
    if (!appointmentComposerSelectedSlot) errors.time = "Select a time slot.";
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
      const payload = {
        doctorId: selectedComposerDoctor?.id || "",
        doctorName: selectedComposerDoctor?.name || "",
        doctorSpecialty: selectedComposerDoctor?.specialty || "",
        date: appointmentComposerDate,
        time: appointmentComposerSelectedSlot,
        reason: sanitizeClientText(appointmentComposerReason, { max: 500 }).trim(),
        selectedEpochMs: new Date(`${appointmentComposerDate}T${appointmentComposerSelectedSlot}:00`).getTime(),
        clientNowMs: Date.now(),
        customerEmail: profile.email || settings.email || "",
        customerName: settings.displayName || profile.display_name || "",
        baseUrl: nurseRequestAuth?.baseUrl || "",
        adminEmail: nurseRequestAuth?.adminEmail || "",
        appOrigin: typeof window !== "undefined" ? window.location.origin : ""
      };

      const response = await fetch("/api/customer/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setAppointmentComposerErrors({ submit: result?.error?.message || "Unable to book appointment right now." });
        return;
      }

      const createdAppointment = result?.appointment || {
        id: `local-${Date.now()}`,
        doctor_user_id: selectedComposerDoctor?.id || 0,
        start_at: `${appointmentComposerDate}T${appointmentComposerSelectedSlot}:00`,
        end_at: `${appointmentComposerDate}T${appointmentComposerSelectedSlot}:00`,
        title: "Doctor Consultation",
        reason: sanitizeClientText(appointmentComposerReason, { max: 500 }).trim(),
        status: "confirmed",
        meeting_url: result?.meeting?.url || ""
      };

      setLocalAppointments((current) => [createdAppointment, ...current]);
      setAppointmentTab("upcoming");
      setAppointmentComposerSuccess({
        title: result?.degraded ? "Appointment Saved Pending Sync" : "Appointment Booked Successfully",
        subtitle: result?.degraded
          ? `Your appointment with ${selectedComposerDoctor?.name || "the doctor"} was saved locally for ${friendlyDateFromDateKey(appointmentComposerDate, storeTimeZone)} at ${formatSlotTime(appointmentComposerSelectedSlot)}. It will need to sync once the appointment server is available.`
          : `Your appointment with ${selectedComposerDoctor?.name || "the doctor"} has been booked for ${friendlyDateFromDateKey(appointmentComposerDate, storeTimeZone)} at ${formatSlotTime(appointmentComposerSelectedSlot)}.`,
        appointment: createdAppointment
      });
    } catch {
      setAppointmentComposerErrors({ submit: "Unable to book appointment right now." });
    } finally {
      setAppointmentComposerLoading(false);
    }
  }

  function validateRequestStep2() {
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
      if (!String(requestForm[key] || "").trim()) errors[key] = message;
    });
    if (!errors.name && !/^[a-zA-Z\s'.-]{2,120}$/.test(String(requestForm.name || "").trim())) {
      errors.name = "Enter a valid name (letters only).";
    }
    if (!errors.age && !/^\d{1,3}$/.test(String(requestForm.age || "").trim())) {
      errors.age = "Age must be numbers only (max 3 digits).";
    }
    if (!errors.gender && !["Male", "Female"].includes(String(requestForm.gender || "").trim())) {
      errors.gender = "Select Male or Female.";
    }
    if (!errors.emergencyContact && !/^[0-9+\-()\s]{7,20}$/.test(String(requestForm.emergencyContact || "").trim())) {
      errors.emergencyContact = "Enter a valid phone number.";
    }
    if (!errors.address && String(requestForm.address || "").trim().length < 5) {
      errors.address = "Enter a valid address.";
    }
    if (!errors.mobilityStatus && !/^[a-zA-Z\s'.-]{2,120}$/.test(String(requestForm.mobilityStatus || "").trim())) {
      errors.mobilityStatus = "Enter a valid mobility status.";
    }
    setRequestStep2Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateRequestStep3() {
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
      if (!String(careDetails[key] || "").trim()) errors[key] = message;
    });
    const today = localDateInputValue(new Date());
    if (!errors.preferredDate && careDetails.preferredDate < today) {
      errors.preferredDate = "Past dates are not allowed.";
    }
    if (!errors.preferredDate && !errors.preferredTime && careDetails.preferredDate === today) {
      const [hh = "0", mm = "0"] = String(careDetails.preferredTime || "").split(":");
      const selected = new Date();
      selected.setHours(Number(hh), Number(mm), 0, 0);
      if (selected.getTime() < Date.now()) {
        errors.preferredTime = "Past time is not allowed.";
      }
    }
    setRequestStep3Errors(errors);
    return Object.keys(errors).length === 0;
  }

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
    setRequestSubmitError("");
    setRequestSubmitting(true);
    setRequestSubmitLoadingState(true);
    try {
      const response = await fetch("/api/customer/nurse-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careType: selectedCareType,
          patient: requestForm,
          careDetails,
          clinicalRequirements,
          uploadedMedicalFiles: Object.fromEntries(Object.entries(uploadedMedicalFiles).map(([key, value]) => [key, value?.name || ""])),
          customerEmail: profile.email || settings.email || "",
          customerName: requestForm.name || settings.displayName || profile.display_name || "",
          customerPhone: settings.phone || requestForm.emergencyContact || "",
          appOrigin: typeof window !== "undefined" ? window.location.origin : "",
          baseUrl: nurseRequestAuth?.baseUrl || "",
          accessToken: nurseRequestAuth?.accessToken || "",
          adminEmail: nurseRequestAuth?.adminEmail || ""
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequestSubmitError(result?.error?.message || "Unable to submit nurse request.");
        return;
      }
      const created = result?.request || {
        id: `nurse-${Date.now()}`,
        status: "pending_review",
        title: `Nurse Visit Request - ${selectedCareType}`,
        careType: selectedCareType,
        preferredDate: careDetails.preferredDate,
        preferredTime: careDetails.preferredTime,
        visitType: careDetails.visitType
      };
      setNurseRequests((current) => [created, ...current]);
      setLatestSubmittedRequest(created);
      setRequestSubmitted(true);
    } catch {
      setRequestSubmitError("Unable to submit nurse request.");
    } finally {
      window.setTimeout(() => setRequestSubmitLoadingState(false), 320);
      setRequestSubmitting(false);
    }
  }

  function renderHeader(title, showBack = false, onBack = onResetJourney, headerAction = null) {
    const greetingName = firstName(settings.displayName || profile.display_name || "Tee");
    const isOverviewHeader = page === "overview";
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
          <h1>{title}</h1>
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
      <div className={`customer-mobile-header-spacer ${isOverviewHeader ? "is-overview" : "is-compact"}`} aria-hidden="true" />
    </>;
  }

  function renderDrawer() {
    return <div className={`customer-mobile-drawer-layer ${drawerOpen ? "open" : ""}`}>
      <button className="customer-mobile-drawer-backdrop" type="button" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />
      <aside className="customer-mobile-drawer">
        <div className="customer-mobile-drawer-brand" aria-label="Nevari logo">
          <img src="/ne.webp" alt="Nevari" width="32" height="32" />
        </div>
        <nav className="customer-mobile-drawer-nav" aria-label="Customer menu">
          {[
            { id: "overview", label: "Overview", icon: "home" },
            { id: "orders", label: "Orders", icon: "orders" },
            { id: "pharmacy", label: "Pharmacy", icon: "pharmacy" },
            { id: "appointment", label: "Appointments", icon: "calendar" },
            { id: "request", label: "Request a Nurse", icon: "nurse" },
            { id: "therapy", label: "Medical Therapy Management", icon: "cross" },
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
                  goToPage("orders");
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
          <button className="customer-mobile-drawer-item logout" type="button" onClick={onLogout}>
            <MobileIcon name="logout" />
            <span>Log Out</span>
          </button>
        </nav>
        <div className="customer-mobile-drawer-footer">
          <div className="customer-mobile-drawer-profile">
            <div className="customer-mobile-avatar">{initials(settings.displayName || profile.display_name || "Customer")}</div>
            <div>
              <strong>{settings.displayName || profile.display_name || "Tee Godwin"}</strong>
              <span>{profile.email || settings.email || "tee@example.com"}</span>
            </div>
            <button className="customer-mobile-more" type="button" aria-label="More options">
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
          </div> : searchResults.length ? searchResults.map((result) => <button className="customer-mobile-search-result" key={result.key} type="button" onClick={result.onSelect}>
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
    return <div className="customer-mobile-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        {renderHeader("Orders")}
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
                <button className="customer-mobile-row-overlay" type="button" aria-label="Open order details" onClick={() => setSelectedOrder(order)} />
              </article>;
            })}
          </div> : <CustomerMobileEmptyState
            message="No orders found"
            ctaLabel="Shop Medicines"
            onCta={() => window.open(storeUrl, "_blank", "noreferrer")}
            icon="orders"
            illustrationSrc="/group-3.png"
            ctaStyle="shop"
          />}
        </section>
      </main>
    </div>;
  }

  if (page === "therapy") {
    return <div className="customer-mobile-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        <SubscriptionGate
          allowed={subscriptionState.canAccessTherapyManagement}
          loading={subscriptionState.isLoading}
          showSuccess={subscriptionState.showSuccess}
          error={subscriptionState.actionError}
          busy={subscriptionState.isActionBusy}
          onOpenMenu={() => setDrawerOpen(true)}
          onSubscribe={() => subscriptionState.launchCheckout()}
          onContinue={async () => {
            await subscriptionState.refresh();
            subscriptionState.dismissSuccess();
          }}
        >
          <section className="therapy-content-shell">
            <header className="therapy-page-head">
              <button className="customer-mobile-icon-button" type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
                <MobileIcon name="menu" />
              </button>
              <div>
                <h1>Medical Therapy Management</h1>
                <p>Premium care planning and medication support for Nevari Access Pro members.</p>
              </div>
            </header>
            <div className="therapy-feature-grid">
              <ProtectedFeature allowed={subscriptionState.canAccessTherapyManagement}>
                <article className="therapy-feature-card">
                  <strong>Medication review</strong>
                  <p>Review current prescriptions, track side effects, and keep your therapy plan aligned with care guidance.</p>
                </article>
                <article className="therapy-feature-card">
                  <strong>Follow-up scheduling</strong>
                  <p>Coordinate follow-up care and keep specialist consultations flowing without losing context.</p>
                </article>
                <article className="therapy-feature-card">
                  <strong>Refill continuity</strong>
                  <p>Stay on track with premium refill and delivery support designed for ongoing treatment.</p>
                </article>
              </ProtectedFeature>
            </div>
          </section>
        </SubscriptionGate>
      </main>
    </div>;
  }

  if (page === "profile" || page === "settings") {
    return <div className="customer-mobile-app">
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
        {profileTab === "user" ? <section className="customer-mobile-panel">
          <ManageSubscription
            subscription={subscriptionState.subscription}
            loading={subscriptionState.isLoading}
            busy={subscriptionState.isActionBusy}
            error={subscriptionState.actionError}
            onUpgrade={() => subscriptionState.launchCheckout()}
            onCancel={async () => {
              await subscriptionState.cancelCurrentSubscription();
            }}
          />
          <label className="customer-mobile-field">
            <span>Display Name:</span>
            <input value={settings.displayName} placeholder={profile.display_name || "Tee Godwin"} onChange={(event) => setSettings((current) => ({ ...current, displayName: sanitizeClientText(event.target.value, { max: 120 }) }))} />
          </label>
          <label className="customer-mobile-field">
            <span>Email:</span>
            <input value={profile.email || settings.email || ""} readOnly />
          </label>
          <label className="customer-mobile-field">
            <span>Phone Number:</span>
            <input value={settings.phone} placeholder="+234 000 000 0000" onChange={(event) => setSettings((current) => ({ ...current, phone: sanitizeClientText(event.target.value, { max: 24 }) }))} />
          </label>
          <label className="customer-mobile-field">
            <span>Address:</span>
            <input value={settings.address} placeholder="No. 1, Example Street" onChange={(event) => setSettings((current) => ({ ...current, address: sanitizeClientText(event.target.value, { max: 200 }) }))} />
          </label>
          <label className="customer-mobile-field">
            <span>Address:</span>
            <input value={settings.address} placeholder="example@domain.com" onChange={(event) => setSettings((current) => ({ ...current, address: sanitizeClientText(event.target.value, { max: 200 }) }))} />
          </label>
          <div className="customer-mobile-upload-group">
            <div>
              <strong>Your photo</strong>
              <p>This will be displayed on your profile.</p>
            </div>
            <div className="customer-mobile-upload-row">
              <div className="customer-mobile-avatar large">{initials(settings.displayName || profile.display_name || "Customer")}</div>
              <button className="customer-mobile-dropzone" type="button">
                <div className="customer-mobile-upload-icon"><MobileIcon name="upload" /></div>
                <span><strong>Click to upload</strong> or drag and drop</span>
                <small>SVG, PNG, JPG or GIF (max. 800x400px)</small>
              </button>
            </div>
          </div>
          <button className="customer-mobile-primary-button" type="button">Continue</button>
        </section> : <section className="customer-mobile-panel customer-mobile-toggle-panel">
          {[
            ["Email Reminders", settings.emailReminders],
            ["Appointment Reminders", settings.appointmentReminders],
            ["Prescription Reminders", settings.prescriptionAlerts],
            ["Payment Receipts", settings.paymentReceipts],
            ["Two-factor Authentication", settings.twoFactorEnabled]
          ].map(([label, checked]) => (
            <label className="customer-mobile-toggle-row" key={label}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={(event) => {
                  const next = event.target.checked;
                  setSettings((current) => {
                    if (label === "Email Reminders") return { ...current, emailReminders: next };
                    if (label === "Appointment Reminders") return { ...current, appointmentReminders: next };
                    if (label === "Prescription Reminders") return { ...current, prescriptionAlerts: next };
                    if (label === "Payment Receipts") return { ...current, paymentReceipts: next };
                    return { ...current, twoFactorEnabled: next };
                  });
                }}
              />
            </label>
          ))}
          <button className="customer-mobile-primary-button" type="button">Continue</button>
        </section>}
      </main>
    </div>;
  }

  if (page === "appointment" || page === "request") {
    const monthLabel = appointmentComposerMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const monthStart = new Date(appointmentComposerMonth.getFullYear(), appointmentComposerMonth.getMonth(), 1);
    const monthEnd = new Date(appointmentComposerMonth.getFullYear(), appointmentComposerMonth.getMonth() + 1, 0);
    const leadingDays = monthStart.getDay();
    const daysInMonth = monthEnd.getDate();
    const calendarCells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
      const dayNumber = index - leadingDays + 1;
      return dayNumber > 0 ? dayNumber : null;
    });
    return <div className="customer-mobile-app">
      {renderDrawer()}
      <main className={`customer-mobile-frame ${pageTransitionClass}`}>
        {renderHeader(
          showNurseRequestFlow ? "Request a Nurse" : "Appointments",
          false,
          onResetJourney,
          (!showNurseRequestFlow && !appointmentComposerOpen && showAppointmentPagePlus)
            ? <button className="pill-button customer-mobile-appointment-booknow-btn" type="button" aria-label="Book now" title="Book now" onClick={() => setAppointmentComposerOpen(true)}>Book Now</button>
            : null
        )}
        {stateError ? <p className="customer-mobile-alert">{stateError}</p> : null}
        {!showNurseRequestFlow && !appointmentComposerOpen ? <div className="customer-mobile-pill-tabs" role="tablist" aria-label="Appointment tabs">
          {[
            ["all", "All"],
            ["upcoming", "Upcoming"],
            ["previous", "Previous"]
          ].map(([id, label]) => (
            <button
              key={id}
              className={`customer-mobile-pill-tab ${appointmentTab === id ? "active" : ""}`}
              type="button"
              onClick={() => setAppointmentTab(id)}
            >
              {label}
            </button>
          ))}
        </div> : null}

        {showNurseRequestFlow ? <section className="customer-mobile-flow">
          {!requestSubmitted ? <>
            <div className="customer-mobile-step-title">Step {requestStep} of 5 - {requestStep === 1 ? "Care Type" : requestStep === 2 ? "Patient Details" : requestStep === 3 ? "Care Details" : requestStep === 4 ? "Clinical Requirements" : "Upload Medical Information"}</div>
            <p className="customer-mobile-step-copy">{requestStep === 1 ? "Please select as appropriate:" : requestStep === 2 ? "Please fill out the form" : requestStep === 3 ? "Set the care schedule details." : requestStep === 4 ? "Select required clinical services." : "You can upload any of these, if available:"}</p>
            <div className={`customer-mobile-step-panel ${requestStepAnimatingOut ? "is-out" : "is-in"}`}>
              {requestStep === 1 ? <div className="customer-mobile-flow-stack">
                {["Elderly Care", "Post Surgery Recovery", "Medication Assistance", "Wound Dressing", "Injection Administration", "Chronic Disease Monitoring", "Palliative Care"].map((label) => (
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
                    className={requestStep2Errors[key] ? "has-error" : ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRequestForm((current) => ({ ...current, [key]: value }));
                      if (requestStep2Errors[key] && value.trim()) {
                        setRequestStep2Errors((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select> : <input
                    type={key === "emergencyContact" ? "tel" : "text"}
                    inputMode={key === "age" ? "numeric" : undefined}
                    maxLength={key === "age" ? 3 : undefined}
                    value={requestForm[key]}
                    placeholder={placeholder}
                    className={requestStep2Errors[key] ? "has-error" : ""}
                    onChange={(event) => {
                      let value = event.target.value;
                      if (key === "age") value = value.replace(/\D/g, "").slice(0, 3);
                      if (key === "name" || key === "mobilityStatus") value = value.replace(/[^a-zA-Z\s'.-]/g, "");
                      if (key === "emergencyContact") value = value.replace(/[^0-9+\-()\s]/g, "");
                      setRequestForm((current) => ({ ...current, [key]: value }));
                      if (requestStep2Errors[key] && value.trim()) {
                        setRequestStep2Errors((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                  />}
                  {required && requestStep2Errors[key] ? <small className="customer-mobile-field-error">{requestStep2Errors[key]}</small> : null}
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
                    {["Recurring", "One Time"].map((label) => <label key={label}>
                      <input
                        type="radio"
                        name="visitType"
                        checked={careDetails.visitType === label}
                        onChange={() => {
                          setCareDetails((current) => ({ ...current, visitType: label }));
                          if (requestStep3Errors.visitType) {
                            setRequestStep3Errors((current) => {
                              const next = { ...current };
                              delete next.visitType;
                              return next;
                            });
                          }
                        }}
                      />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {label}
                    </label>)}
                  </div>
                  {requestStep3Errors.visitType ? <small className="customer-mobile-field-error">{requestStep3Errors.visitType}</small> : null}
                </div>

                <label className="customer-mobile-field">
                  <span>Preferred Visit Date:</span>
                  <input type="date" min={localDateInputValue(new Date())} value={careDetails.preferredDate} className={requestStep3Errors.preferredDate ? "has-error" : ""} onChange={(event) => {
                    const value = event.target.value;
                    setCareDetails((current) => ({ ...current, preferredDate: value }));
                    if (requestStep3Errors.preferredDate && value.trim()) {
                      setRequestStep3Errors((current) => {
                        const next = { ...current };
                        delete next.preferredDate;
                        return next;
                      });
                    }
                  }} />
                  {requestStep3Errors.preferredDate ? <small className="customer-mobile-field-error">{requestStep3Errors.preferredDate}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Preferred Time:</span>
                  <input type="time" min={careDetails.preferredDate === localDateInputValue(new Date()) ? new Date(Date.now() + 60000).toTimeString().slice(0, 5) : undefined} value={careDetails.preferredTime} className={requestStep3Errors.preferredTime ? "has-error" : ""} onChange={(event) => {
                    const value = event.target.value;
                    setCareDetails((current) => ({ ...current, preferredTime: value }));
                    if (requestStep3Errors.preferredTime && value.trim()) {
                      setRequestStep3Errors((current) => {
                        const next = { ...current };
                        delete next.preferredTime;
                        return next;
                      });
                    }
                  }} />
                  {requestStep3Errors.preferredTime ? <small className="customer-mobile-field-error">{requestStep3Errors.preferredTime}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Duration needed:</span>
                  <select value={careDetails.duration} className={requestStep3Errors.duration ? "has-error" : ""} onChange={(event) => {
                    const value = event.target.value;
                    setCareDetails((current) => ({ ...current, duration: value }));
                    if (requestStep3Errors.duration && value.trim()) {
                      setRequestStep3Errors((current) => {
                        const next = { ...current };
                        delete next.duration;
                        return next;
                      });
                    }
                  }}>
                    <option value="">Select duration</option>
                    <option value="30 mins">30 mins</option>
                    <option value="1 hour">1 hour</option>
                    <option value="2 hours">2 hours</option>
                    <option value="4 hours">4 hours</option>
                    <option value="8 hours">8 hours</option>
                    <option value="12 hours">12 hours</option>
                  </select>
                  {requestStep3Errors.duration ? <small className="customer-mobile-field-error">{requestStep3Errors.duration}</small> : null}
                </label>

                <div className="customer-mobile-radio-group">
                  <span>Day/Night Care?</span>
                  <div className="customer-mobile-inline-radios">
                    {["Day", "Night"].map((choice) => <label key={choice}>
                      <input type="radio" name="careShift" checked={careDetails.careShift === choice} onChange={() => {
                        setCareDetails((current) => ({ ...current, careShift: choice }));
                        if (requestStep3Errors.careShift) {
                          setRequestStep3Errors((current) => {
                            const next = { ...current };
                            delete next.careShift;
                            return next;
                          });
                        }
                      }} />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {choice}
                    </label>)}
                  </div>
                  {requestStep3Errors.careShift ? <small className="customer-mobile-field-error">{requestStep3Errors.careShift}</small> : null}
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
                      {["Yes", "No"].map((choice) => <label key={choice}>
                        <input type="radio" name={key} checked={careDetails[key] === choice} onChange={() => {
                          setCareDetails((current) => ({ ...current, [key]: choice }));
                          if (requestStep3Errors[key]) {
                            setRequestStep3Errors((current) => {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            });
                          }
                        }} />
                        <span className="customer-mobile-radio" aria-hidden="true" />
                        {choice}
                      </label>)}
                    </div>
                    {requestStep3Errors[key] ? <small className="customer-mobile-field-error">{requestStep3Errors[key]}</small> : null}
                  </div>
                ))}
              </div> : null}
              {requestStep === 4 ? <div className="customer-mobile-flow-stack">
                {["Medication Administration", "Catheter Care", "Blood Pressure Monitoring", "Diabetes Monitoring", "IV Therapy", "Feeding Tube Support"].map((label) => {
                  const selected = clinicalRequirements.includes(label);
                  return <button key={label} type="button" className={`customer-mobile-option-row ${selected ? "active" : ""}`} onClick={() => setClinicalRequirements((current) => selected ? current.filter((item) => item !== label) : [...current, label])}><span>{label}</span><span className={`customer-mobile-select-indicator ${selected ? "selected" : ""}`} aria-hidden="true">{selected ? "✓" : ""}</span></button>;
                })}
              </div> : null}
              {requestStep === 5 ? <div className="customer-mobile-flow-stack">
                {["Medical Prescription", "Doctor Notes", "Discharge Summaries", "Lab Reports", "Medication Lists"].map((label) => {
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
                      <button type="button" onClick={() => {
                        setUploadedMedicalFiles((current) => {
                          const next = { ...current };
                          delete next[label];
                          return next;
                        });
                        if (uploadInputRefs.current[label]) uploadInputRefs.current[label].value = "";
                      }}>Remove</button>
                      <button type="button" onClick={() => uploadInputRefs.current[label]?.click()}>Replace</button>
                    </div> : null}
                  </div>;
                })}
              </div> : null}
            </div>
            <button className="customer-mobile-primary-button" type="button" disabled={(requestStep === 1 && !selectedCareType) || requestSubmitting} onClick={handleRequestContinue}>{requestSubmitting ? "Submitting..." : "Continue"}</button>
            {requestSubmitError ? <small className="customer-mobile-field-error">{requestSubmitError}</small> : null}
            {requestStep > 1 ? <button className="customer-mobile-secondary-button" type="button" onClick={() => transitionToRequestStep(Math.max(1, requestStep - 1))}>Go Back</button> : null}
          </> : <div className="customer-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="nurse-request-confirmation-title">
            <section className="customer-mobile-panel customer-mobile-submit-state customer-confirmation-shell">
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
              {!requestSubmitLoadingState ? <button className="customer-mobile-primary-button" type="button" onClick={() => goToPage("appointment")}>View Request Status</button> : null}
              {!requestSubmitLoadingState ? <button className="customer-mobile-secondary-button" type="button" onClick={() => goToPage("appointment")}>Back to Appointments</button> : null}
            </section>
          </div>}
        </section> : null}

        {appointmentComposerOpen ? <section className="customer-mobile-appointment-pane customer-mobile-book-pane">
          <div className="customer-mobile-title-row">
            <button className="customer-mobile-back-link" type="button" onClick={() => {
              setAppointmentComposerOpen(false);
              setAppointmentComposerDatePicked(false);
            }}>
              <MobileIcon name="arrow-left" />
              <span>Go back</span>
            </button>
          </div>
          <section className="customer-mobile-panel customer-mobile-doctor-select-panel">
            <span className="customer-mobile-field-label">Select Doctor</span>
            <div className="customer-mobile-doctor-picker-wrap">
              <button className="customer-mobile-doctor-picker" type="button" onClick={() => setAppointmentComposerDoctorMenuOpen((current) => !current)}>
                <div className="customer-mobile-doctor-pill">
                  <span className="customer-mobile-doctor-avatar">{selectedComposerDoctor?.initials || "DR"}</span>
                  <span className="customer-mobile-doctor-copy">
                    <strong>{selectedComposerDoctor?.name || "Select doctor"}</strong>
                    <small>{selectedComposerDoctor?.specialty || "General Physician"}</small>
                  </span>
                </div>
                <MobileIcon name="arrow-right" />
              </button>
              {appointmentComposerDoctorMenuOpen ? <div className="customer-mobile-doctor-menu">
                {composerDoctors.map((doctor) => <button key={doctor.id} type="button" className={`customer-mobile-doctor-menu-item ${appointmentComposerDoctorId === doctor.id ? "active" : ""}`} onClick={() => {
                  setAppointmentComposerDoctorId(doctor.id);
                  setAppointmentComposerDoctorMenuOpen(false);
                  setAppointmentComposerSelectedSlot("");
                  if (appointmentComposerErrors.doctor) {
                    setAppointmentComposerErrors((current) => {
                      const next = { ...current };
                      delete next.doctor;
                      return next;
                    });
                  }
                  setAppointmentComposerSlotsRefreshing(true);
                  window.setTimeout(() => setAppointmentComposerSlotsRefreshing(false), 180);
                }}>
                  <span className="customer-mobile-doctor-avatar">{doctor.initials}</span>
                  <span className="customer-mobile-doctor-copy">
                    <strong>{doctor.name}</strong>
                    <small>{doctor.specialty}</small>
                  </span>
                </button>)}
              </div> : null}
            </div>
            {appointmentComposerErrors.doctor ? <small className="customer-mobile-field-error">{appointmentComposerErrors.doctor}</small> : null}
          </section>
          <section className="customer-mobile-panel customer-mobile-calendar-card">
            <div className="customer-mobile-book-month">
              <strong>{monthLabel}</strong>
              <div className="customer-mobile-book-arrows">
                <button type="button" aria-label="Previous month" onClick={() => setAppointmentComposerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><MobileIcon name="arrow-left" /></button>
                <button type="button" aria-label="Next month" onClick={() => setAppointmentComposerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><MobileIcon name="arrow-right" /></button>
              </div>
            </div>
            <div className="customer-mobile-calendar-head">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => <span key={label}>{label}</span>)}
            </div>
            <div className="customer-mobile-calendar-grid">
              {calendarCells.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} />;
                const dateValue = `${appointmentComposerMonth.getFullYear()}-${String(appointmentComposerMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSelected = appointmentComposerDate === dateValue;
                const isPast = new Date(`${dateValue}T00:00:00`).getTime() < new Date(`${localDateInputValue(new Date())}T00:00:00`).getTime();
                return <button key={dateValue} type="button" className={`customer-mobile-calendar-day ${isSelected ? "active" : ""} ${isPast ? "is-past" : ""}`} disabled={isPast} onClick={() => {
                  setAppointmentComposerDate(dateValue);
                  setAppointmentComposerDatePicked(true);
                  setAppointmentComposerSelectedSlot("");
                  if (appointmentComposerErrors.date || appointmentComposerErrors.time) {
                    setAppointmentComposerErrors((current) => {
                      const next = { ...current };
                      delete next.date;
                      delete next.time;
                      return next;
                    });
                  }
                  setAppointmentComposerSlotsRefreshing(true);
                  window.setTimeout(() => setAppointmentComposerSlotsRefreshing(false), 180);
                }}>{day}</button>;
              })}
            </div>
            <div className={`customer-mobile-slot-row ${appointmentComposerSlotsRefreshing ? "is-refreshing" : ""}`}>
              <strong>Available Times</strong>
              <div className="customer-mobile-slot-pills">
                {appointmentComposerSlots.map((slot) => <button
                  key={slot.value}
                  type="button"
                  className={`customer-mobile-slot-pill ${appointmentComposerSelectedSlot === slot.value ? "active" : ""}`}
                  disabled={slot.disabled || !appointmentComposerDate}
                  onClick={() => {
                    setAppointmentComposerSelectedSlot(slot.value);
                    if (appointmentComposerErrors.time) {
                      setAppointmentComposerErrors((current) => {
                        const next = { ...current };
                        delete next.time;
                        return next;
                      });
                    }
                  }}
                >
                  {formatSlotTime(slot.value)}
                </button>)}
              </div>
              {appointmentComposerDate && !appointmentComposerHasAvailableSlots ? <small className="customer-mobile-slot-empty">No available times for this date. Please choose another date.</small> : null}
              {appointmentComposerErrors.time ? <small className="customer-mobile-field-error">{appointmentComposerErrors.time}</small> : null}
            </div>
          </section>
          <label className="customer-mobile-field">
            <span>Reason for Appointment:</span>
            <textarea rows={4} value={appointmentComposerReason} placeholder="Briefly state the reason for your appointment" onChange={(event) => {
              const value = sanitizeClientText(event.target.value, { max: 500 });
              setAppointmentComposerReason(value);
              if (appointmentComposerErrors.reason && value.trim()) {
                setAppointmentComposerErrors((current) => {
                  const next = { ...current };
                  delete next.reason;
                  return next;
                });
              }
            }} />
            {appointmentComposerErrors.reason ? <small className="customer-mobile-field-error">{appointmentComposerErrors.reason}</small> : null}
          </label>
          {!appointmentComposerSuccess ? <>
            <button
              className="customer-mobile-primary-button"
              type="button"
              disabled={!selectedComposerDoctor || !appointmentComposerDate || !appointmentComposerSelectedSlot || !appointmentComposerReason.trim() || appointmentComposerLoading}
              onClick={handleAppointmentComposerBooking}
            >
              {appointmentComposerLoading ? "Booking..." : "Book Appointment"}
            </button>
            {appointmentComposerErrors.submit ? <small className="customer-mobile-field-error">{appointmentComposerErrors.submit}</small> : null}
          </> : <div className="customer-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-confirmation-title">
            <section className="customer-mobile-panel customer-mobile-submit-state appointment-booking-success customer-confirmation-shell">
              <div className="customer-confirmation-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#22A06B" strokeWidth="2" /><path d="M16 24L22 30L32 18" stroke="#22A06B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 id="appointment-confirmation-title">{appointmentComposerSuccess.title || "Appointment Booked!"}</h2>
              <p>{appointmentComposerSuccess.subtitle}</p>
              <div className="customer-confirmation-next">
                <h3>What happens next?</h3>
                <div className="customer-confirmation-next-row"><span>Status</span><strong className="badge">{appointmentComposerSuccess.appointment?.pending_sync ? "Pending Sync" : "Confirmed"}</strong></div>
                <div className="customer-confirmation-next-row"><span>Next step</span><strong>{appointmentComposerSuccess.appointment?.pending_sync ? "Server sync" : "Calendar + reminders"}</strong></div>
                <div className="customer-confirmation-next-row"><span>Notification</span><strong>{appointmentComposerSuccess.appointment?.pending_sync ? "Pending" : "Email sent"}</strong></div>
              </div>
              <button className="customer-mobile-primary-button" type="button" onClick={() => {
                setSelectedAppointment(appointmentComposerSuccess.appointment);
                setAppointmentComposerOpen(false);
                setAppointmentComposerDatePicked(false);
                setAppointmentComposerSuccess(null);
              }}>View Appointment Details</button>
              <button className="customer-mobile-secondary-button" type="button" onClick={() => {
                setAppointmentComposerOpen(false);
                setAppointmentComposerSuccess(null);
                setAppointmentComposerDate(localDateInputValue(new Date()));
                setAppointmentComposerDatePicked(false);
                setAppointmentComposerSelectedSlot("");
                setAppointmentComposerReason("");
              }}>Back to Appointments</button>
            </section>
          </div>}
        </section> : null}

        {false && appointmentTab === "request" ? <section className="customer-mobile-flow">
          {!requestSubmitted ? <>
            <div className="customer-mobile-step-title">Step {requestStep} of 5 - {requestStep === 1 ? "Care Type" : requestStep === 2 ? "Patient Details" : requestStep === 3 ? "Care Details" : requestStep === 4 ? "Clinical Requirements" : "Upload Medical Information"}</div>
            <p className="customer-mobile-step-copy">{requestStep === 1 ? "Please select as appropriate:" : requestStep === 2 ? "Please fill out the form" : requestStep === 3 ? "Set the care schedule details." : requestStep === 4 ? "Select required clinical services." : "You can upload any of these, if available:"}</p>
            <div className={`customer-mobile-step-panel ${requestStepAnimatingOut ? "is-out" : "is-in"}`}>
              {requestStep === 1 ? <div className="customer-mobile-flow-stack">
                {["Elderly Care", "Post Surgery Recovery", "Medication Assistance", "Wound Dressing", "Injection Administration", "Chronic Disease Monitoring", "Palliative Care"].map((label) => (
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
                    className={requestStep2Errors[key] ? "has-error" : ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRequestForm((current) => ({ ...current, [key]: value }));
                      if (requestStep2Errors[key] && value.trim()) {
                        setRequestStep2Errors((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select> : <input
                    type={key === "emergencyContact" ? "tel" : "text"}
                    inputMode={key === "age" ? "numeric" : undefined}
                    maxLength={key === "age" ? 3 : undefined}
                    value={requestForm[key]}
                    placeholder={placeholder}
                    className={requestStep2Errors[key] ? "has-error" : ""}
                    onChange={(event) => {
                      let value = event.target.value;
                      if (key === "age") value = value.replace(/\D/g, "").slice(0, 3);
                      if (key === "name" || key === "mobilityStatus") value = value.replace(/[^a-zA-Z\s'.-]/g, "");
                      if (key === "emergencyContact") value = value.replace(/[^0-9+\-()\s]/g, "");
                      setRequestForm((current) => ({ ...current, [key]: value }));
                      if (requestStep2Errors[key] && value.trim()) {
                        setRequestStep2Errors((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                  />}
                  {required && requestStep2Errors[key] ? <small className="customer-mobile-field-error">{requestStep2Errors[key]}</small> : null}
                </label>)}
                {[
                  ["Existing Conditions (If any):", "conditions", "Enter existing conditions"],
                  ["Allergies (If any):", "allergies", "Enter known allergies"],
                  ["Current Medication:", "currentMedication", "Enter current medications"]
                ].map(([label, key, placeholder]) => <label className="customer-mobile-field" key={label}>
                  <span>{label}</span>
                  <textarea
                    rows={4}
                    value={requestForm[key]}
                    placeholder={placeholder}
                    onChange={(event) => setRequestForm((current) => ({ ...current, [key]: sanitizeClientText(event.target.value, { max: 500 }) }))}
                  />
                </label>)}
              </div> : null}

              {requestStep === 3 ? <div className="customer-mobile-form-stack">
                <div className="customer-mobile-radio-group">
                  <span>Is this a recurring visit or one time care?</span>
                  <div className="customer-mobile-inline-radios">
                    {["Recurring", "One Time"].map((label) => <label key={label}>
                      <input
                        type="radio"
                        name="visitType"
                        checked={careDetails.visitType === label}
                        onChange={() => {
                          setCareDetails((current) => ({ ...current, visitType: label }));
                          if (requestStep3Errors.visitType) {
                            setRequestStep3Errors((current) => {
                              const next = { ...current };
                              delete next.visitType;
                              return next;
                            });
                          }
                        }}
                      />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {label}
                    </label>)}
                  </div>
                  {requestStep3Errors.visitType ? <small className="customer-mobile-field-error">{requestStep3Errors.visitType}</small> : null}
                </div>

                <label className="customer-mobile-field">
                  <span>Preferred Visit Date:</span>
                  <input type="date" min={localDateInputValue(new Date())} value={careDetails.preferredDate} className={requestStep3Errors.preferredDate ? "has-error" : ""} onChange={(event) => {
                    const value = event.target.value;
                    setCareDetails((current) => ({ ...current, preferredDate: value }));
                    if (requestStep3Errors.preferredDate && value.trim()) {
                      setRequestStep3Errors((current) => {
                        const next = { ...current };
                        delete next.preferredDate;
                        return next;
                      });
                    }
                  }} />
                  {requestStep3Errors.preferredDate ? <small className="customer-mobile-field-error">{requestStep3Errors.preferredDate}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Preferred Time:</span>
                  <input type="time" min={careDetails.preferredDate === localDateInputValue(new Date()) ? new Date(Date.now() + 60000).toTimeString().slice(0, 5) : undefined} value={careDetails.preferredTime} className={requestStep3Errors.preferredTime ? "has-error" : ""} onChange={(event) => {
                    const value = event.target.value;
                    setCareDetails((current) => ({ ...current, preferredTime: value }));
                    if (requestStep3Errors.preferredTime && value.trim()) {
                      setRequestStep3Errors((current) => {
                        const next = { ...current };
                        delete next.preferredTime;
                        return next;
                      });
                    }
                  }} />
                  {requestStep3Errors.preferredTime ? <small className="customer-mobile-field-error">{requestStep3Errors.preferredTime}</small> : null}
                </label>
                <label className="customer-mobile-field">
                  <span>Duration needed:</span>
                  <select value={careDetails.duration} className={requestStep3Errors.duration ? "has-error" : ""} onChange={(event) => {
                    const value = event.target.value;
                    setCareDetails((current) => ({ ...current, duration: value }));
                    if (requestStep3Errors.duration && value.trim()) {
                      setRequestStep3Errors((current) => {
                        const next = { ...current };
                        delete next.duration;
                        return next;
                      });
                    }
                  }}>
                    <option value="">Select duration</option>
                    <option value="30 mins">30 mins</option>
                    <option value="1 hour">1 hour</option>
                    <option value="2 hours">2 hours</option>
                    <option value="4 hours">4 hours</option>
                    <option value="8 hours">8 hours</option>
                    <option value="12 hours">12 hours</option>
                  </select>
                  {requestStep3Errors.duration ? <small className="customer-mobile-field-error">{requestStep3Errors.duration}</small> : null}
                </label>

                <div className="customer-mobile-radio-group">
                  <span>Day/Night Care?</span>
                  <div className="customer-mobile-inline-radios">
                    {["Day", "Night"].map((choice) => <label key={choice}>
                      <input type="radio" name="careShift" checked={careDetails.careShift === choice} onChange={() => {
                        setCareDetails((current) => ({ ...current, careShift: choice }));
                        if (requestStep3Errors.careShift) {
                          setRequestStep3Errors((current) => {
                            const next = { ...current };
                            delete next.careShift;
                            return next;
                          });
                        }
                      }} />
                      <span className="customer-mobile-radio" aria-hidden="true" />
                      {choice}
                    </label>)}
                  </div>
                  {requestStep3Errors.careShift ? <small className="customer-mobile-field-error">{requestStep3Errors.careShift}</small> : null}
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
                      {["Yes", "No"].map((choice) => <label key={choice}>
                        <input type="radio" name={key} checked={careDetails[key] === choice} onChange={() => {
                          setCareDetails((current) => ({ ...current, [key]: choice }));
                          if (requestStep3Errors[key]) {
                            setRequestStep3Errors((current) => {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            });
                          }
                        }} />
                        <span className="customer-mobile-radio" aria-hidden="true" />
                        {choice}
                      </label>)}
                    </div>
                    {requestStep3Errors[key] ? <small className="customer-mobile-field-error">{requestStep3Errors[key]}</small> : null}
                  </div>
                ))}
              </div> : null}

              {requestStep === 4 ? <div className="customer-mobile-flow-stack">
                {["Medication Administration", "Catheter Care", "Blood Pressure Monitoring", "Diabetes Monitoring", "IV Therapy", "Feeding Tube Support"].map((label) => {
                  const selected = clinicalRequirements.includes(label);
                  return <button
                    key={label}
                    type="button"
                    className={`customer-mobile-option-row ${selected ? "active" : ""}`}
                    onClick={() => {
                      setClinicalRequirements((current) => selected ? current.filter((item) => item !== label) : [...current, label]);
                    }}
                  >
                    <span>{label}</span>
                    <span className={`customer-mobile-select-indicator ${selected ? "selected" : ""}`} aria-hidden="true">{selected ? "✓" : ""}</span>
                  </button>;
                })}
              </div> : null}

              {requestStep === 5 ? <div className="customer-mobile-flow-stack">
                {["Medical Prescription", "Doctor Notes", "Discharge Summaries", "Lab Reports", "Medication Lists"].map((label) => {
                  const uploaded = uploadedMedicalFiles[label];
                  return <div key={label} className="customer-mobile-upload-row-wrap">
                    <button type="button" className={`customer-mobile-upload-row-button ${uploaded ? "uploaded" : ""}`} onClick={() => uploadInputRefs.current[label]?.click()}>
                      <span>{label}</span>
                      {uploaded ? <span className="customer-mobile-upload-success">✓</span> : <MobileIcon name="upload-file" />}
                    </button>
                    <input
                      ref={(node) => { uploadInputRefs.current[label] = node; }}
                      type="file"
                      className="customer-mobile-hidden-file"
                      onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (!isAllowedMedicalFile(file)) {
                        setRequestSubmitError("Upload PDF, DOC, DOCX, PNG, JPG, or WEBP files up to 5MB.");
                        event.target.value = "";
                        return;
                      }
                      setRequestSubmitError("");
                      setUploadedMedicalFiles((current) => ({ ...current, [label]: { name: sanitizeClientText(file.name, { max: 180 }) } }));
                    }}
                    />
                    {uploaded ? <div className="customer-mobile-upload-meta">
                      <small className="customer-mobile-upload-filename" title={uploaded.name}>{uploaded.name}</small>
                      <button type="button" onClick={() => {
                        setUploadedMedicalFiles((current) => {
                          const next = { ...current };
                          delete next[label];
                          return next;
                        });
                        if (uploadInputRefs.current[label]) uploadInputRefs.current[label].value = "";
                      }}>Remove</button>
                      <button type="button" onClick={() => uploadInputRefs.current[label]?.click()}>Replace</button>
                    </div> : null}
                  </div>;
                })}
              </div> : null}
            </div>

            <button className="customer-mobile-primary-button" type="button" disabled={(requestStep === 1 && !selectedCareType) || requestSubmitting} onClick={handleRequestContinue}>{requestSubmitting ? "Submitting..." : "Continue"}</button>
            {requestSubmitError ? <small className="customer-mobile-field-error">{requestSubmitError}</small> : null}
            {requestStep > 1 ? <button className="customer-mobile-secondary-button" type="button" onClick={() => transitionToRequestStep(Math.max(1, requestStep - 1))}>Go Back</button> : null}
          </> : <div className="customer-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="nurse-request-confirmation-title-secondary">
            <section className="customer-mobile-panel customer-mobile-submit-state customer-confirmation-shell">
            <div className="customer-mobile-empty-icon"><MobileIcon name="appointments" /></div>
            <h2>{requestSubmitLoadingState ? "Submitting request..." : "Nurse Request Submitted"}</h2>
            {!requestSubmitLoadingState ? <p>Your nurse request has been received. Our care team will review your details and assign a suitable nurse. You’ll be notified once the visit is confirmed.</p> : null}
            {!requestSubmitLoadingState ? <div className="detail-card info-list">
              <div className="info-row"><span className="info-label">Care Type</span><span className="info-value">{latestSubmittedRequest?.careType || selectedCareType || "Not set"}</span></div>
              <div className="info-row"><span className="info-label">Preferred Date</span><span className="info-value">{latestSubmittedRequest?.preferredDate || careDetails.preferredDate || "Not set"}</span></div>
              <div className="info-row"><span className="info-label">Preferred Time</span><span className="info-value">{latestSubmittedRequest?.preferredTime || careDetails.preferredTime || "Not set"}</span></div>
              <div className="info-row"><span className="info-label">Visit Type</span><span className="info-value">{latestSubmittedRequest?.visitType || careDetails.visitType || "Not set"}</span></div>
              <div className="info-row"><span className="info-label">Status</span><span className="info-value">Pending Review</span></div>
            </div> : null}
            {!requestSubmitLoadingState ? <button className="customer-mobile-primary-button" type="button" onClick={() => goToPage("appointment")}>View Request Status</button> : null}
            {!requestSubmitLoadingState ? <button className="customer-mobile-secondary-button" type="button" onClick={() => goToPage("overview")}>Back to Home</button> : null}
            </section>
          </div>}
        </section> : null}

        {!showNurseRequestFlow && !appointmentComposerOpen && (appointmentTab === "all" || appointmentTab === "upcoming" || appointmentTab === "previous") ? <section className="customer-mobile-list-section customer-mobile-appointment-pane">
          {appointmentsLoading ? Array.from({ length: 4 }, (_, index) => <article className="customer-mobile-visit-row skeleton-panel" key={`customer-mobile-visit-skeleton-${index}`}>
            <div className="customer-mobile-clock skeleton-circle skeleton-circle-sm" />
            <div className="customer-mobile-visit-copy">
              <SkeletonBox className="skeleton-line skeleton-line-md" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
            </div>
            <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
          </article>) : visibleAppointments.length ? visibleAppointments.map((appointment) => {
            const doctor = visibleDoctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
            const appointmentTitle = appointmentDisplayTitle(appointment, doctor);
            const doctorLabel = appointmentDoctorLabel(appointment, doctor);
            const appointmentStatusTone = appointmentChipTone(appointment);
            const appointmentStatusLabel = appointmentChipLabel(appointment);
            return <article className="customer-mobile-visit-row" key={appointment.id}>
              <div className="customer-mobile-clock">
                <MobileIcon name="clock" />
              </div>
              <div className="customer-mobile-visit-copy">
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
            message="You have no appointments"
            ctaLabel="Book an appointment"
            onCta={() => {
              setAppointmentComposerDatePicked(false);
              setAppointmentComposerOpen(true);
            }}
            icon="appointments"
            illustrationSrc="/group-3.png"
            ctaStyle="appointment"
          />}
        </section> : null}
      </main>
    </div>;
  }

  return <div className="customer-mobile-app">
    {renderDrawer()}
    <main className={`customer-mobile-frame ${pageTransitionClass}`}>
      {renderHeader("Overview")}
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
  const calendarDays = Array.from({ length: 30 }, (_, index) => index + 1);
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
    <button className="customer-mobile-primary-button" type="button" onClick={onCreateAppointmentCheckout}>Book Appointment</button>
  </section>;
}

function CustomerMobileEmptyState({ message, ctaLabel, onCta, icon = "appointments", illustrationSrc = "", ctaStyle = "" }) {
  const isAppointmentCta = ctaStyle === "appointment";
  return <div className="customer-mobile-empty-state">
    {illustrationSrc ? <img className="customer-mobile-empty-illustration" src={illustrationSrc} alt="" aria-hidden="true" /> : <div className="customer-mobile-empty-icon"><MobileIcon name={icon} /></div>}
    <p>{message}</p>
    {ctaLabel && onCta ? <button className={`${ctaStyle === "shop" ? "shop-medicine-btn" : `customer-mobile-empty-button ${ctaStyle ? `is-${ctaStyle}` : ""}`}`.trim()} type="button" onClick={onCta}>
      <span>{ctaLabel}</span>
      <span className={ctaStyle === "shop" ? "shop-medicine-icon" : "customer-mobile-empty-button-icon"}>
        {isAppointmentCta ? <svg className="customer-mobile-empty-phone-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22 16.92V20A2 2 0 0 1 19.82 22C10.95 21.36 3.64 14.05 3 5.18A2 2 0 0 1 5 3H8.09A2 2 0 0 1 10.04 4.63L10.7 7.86A2 2 0 0 1 10.13 9.81L8.91 11.03A16 16 0 0 0 12.97 15.09L14.19 13.87A2 2 0 0 1 16.14 13.3L19.37 13.96A2 2 0 0 1 21 15.91V16.92Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg> : <MobileIcon name={ctaStyle === "shop" ? "arrow-up-right" : (icon === "orders" ? "arrow-right" : "phone")} />}
      </span>
    </button> : null}
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
