"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { removeById, replaceById, updateListPayload, upsertById } from "../lib/fetcher";
import { isProxyAppointmentsKey, isProxyDoctorsKey, isProxyOrdersKey, swrKeys, withBaseUrl } from "../lib/swrKeys";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildDashboardCacheKey, buildUrl, DASHBOARD_CACHE_TTL_MS, describeDashboardFetchError, hydrateStoredSession, money, readDashboardCache, shortDate, titleCase, writeDashboardCache } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";
import { RoleShell, SkeletonBox } from "./_doctor-dashboard";

const CUSTOMER_SETTINGS_KEY = "nevari_customer_frontend_settings";
const ADMIN_APPOINTMENT_SETTINGS_KEY = "nevari_admin_appointment_settings";
const CUSTOMER_DASHBOARD_CACHE_SCOPE = "customer-dashboard";
const pages = ["overview", "orders", "appointment", "settings", "profile"];
const CUSTOMER_DASHBOARD_REFRESH_MS = 60_000;
const pageLabels = {
  overview: "Overview",
  orders: "Orders",
  appointment: "Appointment",
  settings: "Settings",
  profile: "My Profile"
};

const emptyCustomerState = {
  error: "",
  dashboard: null,
  orders: [],
  appointments: [],
  doctors: [],
  doctorsUnavailable: false
};

async function fetchCustomerDashboardPayload(session, settings) {
  const [ordersResult, appointmentsResult, doctorsResult] = await Promise.allSettled([
    apiRequest(session, "/orders", { params: { per_page: 5, page: 1 } }),
    apiRequest(session, "/appointments", { params: { per_page: 5, page: 1 } }),
    apiRequest(session, "/doctors", { params: { per_page: 8, page: 1 }, suppressHttpError: true })
  ]);
  const blockingErrors = [ordersResult, appointmentsResult]
    .filter((result) => result.status === "rejected")
    .map((result) => describeDashboardFetchError(result.reason));
  const orders = ordersResult.status === "fulfilled" ? ordersResult.value || [] : [];
  const appointments = appointmentsResult.status === "fulfilled" ? appointmentsResult.value || [] : [];
  const liveDoctors = doctorsResult.status === "fulfilled" ? doctorsResult.value || [] : [];
  const doctors = liveDoctors;
  const fallbackProfile = {
    id: session.user?.id || null,
    email: session.user?.email || "",
    display_name: settings.displayName || session.user?.display_name || session.user?.name || "Customer",
    roles: session.user?.roles || []
  };

  return {
    error: blockingErrors[0] || "",
    dashboard: { profile: fallbackProfile },
    orders,
    appointments,
    doctors,
    doctorsUnavailable: !liveDoctors.length
  };
}

async function fetchCustomerOrders(session) {
  return apiRequest(session, "/orders", { params: { per_page: 24, page: 1 } });
}

async function fetchCustomerAppointments(session) {
  return apiRequest(session, "/appointments", { params: { per_page: 40, page: 1 } });
}

async function fetchCustomerDoctors(session) {
  return apiRequest(session, "/doctors", { params: { per_page: 24, page: 1 }, suppressHttpError: true });
}

function createJourneyState() {
  return {
    mode: "hub",
    doctorId: null,
    selectedDate: isoDate(new Date()),
    slots: [],
    selectedSlot: null,
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
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
    return { livePaymentsEnabled: false, googleMeetEnabled: true };
  }
  try {
    return {
      livePaymentsEnabled: false,
      googleMeetEnabled: true,
      ...JSON.parse(window.localStorage.getItem(ADMIN_APPOINTMENT_SETTINGS_KEY) || "{}")
    };
  } catch {
    return { livePaymentsEnabled: false, googleMeetEnabled: true };
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
  const [cacheKey, setCacheKey] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [storeUrl, setStoreUrl] = useState("#");
  const [journey, setJourney] = useState(createJourneyState());
  const [settings, setSettings] = useState(() => loadCustomerSettings());
  const storefrontSettings = useMemo(() => loadStorefrontSettings(), []);

  useEffect(() => {
    setDocumentMetadata(`Nevari Customer | ${pageLabels[page] || titleCase(page)}`, `${pageLabels[page] || titleCase(page)} view for the Nevari Customer dashboard.`);
  }, [page]);

  useEffect(() => {
    persistCustomerSettings(settings);
  }, [settings]);

  useEffect(() => {
    const hydratedSession = hydrateStoredSession("patient");
    setStoreUrl(hydratedSession.baseUrl || "#");
    if (!hydratedSession.paired) {
      router.replace(FRONTENDS.admin.setupPath);
      return;
    }
    const roles = hydratedSession.user?.roles || [];
    if (!hydratedSession.accessToken || !roles.some((role) => ["customer", "patient"].includes(role))) {
      router.replace("/login");
      return;
    }
    setSession(hydratedSession);
    setCacheKey(buildDashboardCacheKey("patient", CUSTOMER_DASHBOARD_CACHE_SCOPE, hydratedSession.user?.id || "guest"));
  }, [router]);

  const cachedCustomerState = cacheKey ? readDashboardCache(cacheKey, DASHBOARD_CACHE_TTL_MS)?.state : null;
  const customerSummaryKey = session
    ? swrKeys.proxy.path("/customer-dashboard/summary", withBaseUrl(session, { user_id: session.user?.id || "guest", display_name: settings.displayName }))
    : null;
  const customerOrdersKey = session && ["orders", "settings", "profile"].includes(page)
    ? swrKeys.proxy.path("/orders", withBaseUrl(session, { per_page: 24, page: 1 }))
    : null;
  const customerAppointmentsKey = session && ["appointment", "settings", "profile"].includes(page)
    ? swrKeys.proxy.path("/appointments", withBaseUrl(session, { per_page: 40, page: 1 }))
    : null;
  const customerDoctorsKey = session && ["appointment", "settings", "profile"].includes(page)
    ? swrKeys.proxy.path("/doctors", withBaseUrl(session, { per_page: 24, page: 1 }))
    : null;
  const { data: summaryState = emptyCustomerState, mutate: mutateSummary, isLoading } = useSWR(
    customerSummaryKey,
    () => fetchCustomerDashboardPayload(session, settings),
    {
      fallbackData: cachedCustomerState || undefined,
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
  const storeCurrency = state.dashboard?.store_currency || visibleDoctors.find((doctor) => doctor.store_currency)?.store_currency || state.orders.find((order) => order.currency)?.currency || "USD";
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
  const sortedAppointments = useMemo(() => [...state.appointments].sort((left, right) => new Date(left.start_at || 0) - new Date(right.start_at || 0)), [state.appointments]);
  const upcomingAppointments = sortedAppointments.filter((appointment) => new Date(appointment.start_at || 0).getTime() >= now);
  const pastAppointments = [...sortedAppointments.filter((appointment) => new Date(appointment.start_at || 0).getTime() < now)].reverse();
  const selectedDoctor = visibleDoctors.find((doctor) => String(doctor.user_id || doctor.id) === String(journey.doctorId)) || null;
  const pageQueryLoading = (
    (page === "orders" && ordersQuery.isLoading && !ordersQuery.data) ||
    (page === "appointment" && ((appointmentsQuery.isLoading && !appointmentsQuery.data) || (doctorsQuery.isLoading && !doctorsQuery.data))) ||
    (["settings", "profile"].includes(page) && ((ordersQuery.isLoading && !ordersQuery.data) || (appointmentsQuery.isLoading && !appointmentsQuery.data)))
  );
  const showSkeleton = (isLoading && !hasCustomerDashboardData(state)) || pageQueryLoading;

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
    const nextDate = journey.doctorId === doctorId ? journey.selectedDate : isoDate(new Date());
    setPage("appointment");
    setJourney({
      ...createJourneyState(),
      mode: "slots",
      doctorId,
      selectedDate: nextDate,
      loading: true
    });
    try {
      const availability = await apiRequest(session, `/doctors/${doctorId}/availability`, { params: { date: nextDate } });
      setJourney((current) => ({
        ...current,
        mode: "slots",
        doctorId,
        selectedDate: nextDate,
        slots: availability?.slots || [],
        loading: false,
        error: ""
      }));
    } catch (error) {
      const fallbackSlots = buildFallbackSlots(nextDate, doctor);
      setJourney((current) => ({
        ...current,
        mode: "slots",
        doctorId,
        selectedDate: nextDate,
        slots: fallbackSlots,
        loading: false,
        error: fallbackSlots.length ? "The pharmacy server is temporarily unavailable. Preview slots are shown so the booking flow stays testable." : (error?.message || "Doctor availability could not be loaded.")
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
      setJourney((current) => ({
        ...current,
        selectedDate: nextDate,
        slots: availability?.slots || [],
        selectedSlot: null,
        loading: false
      }));
    } catch (error) {
      const fallbackSlots = buildFallbackSlots(nextDate, selectedDoctor);
      setJourney((current) => ({
        ...current,
        selectedDate: nextDate,
        slots: fallbackSlots,
        selectedSlot: null,
        loading: false,
        error: fallbackSlots.length ? "Live availability could not be refreshed. Demo slots are shown instead." : (error?.message || "Slots could not be refreshed.")
      }));
    }
  }

  async function createAppointmentCheckout() {
    if (!journey.doctorId || !journey.selectedSlot) {
      return;
    }
    const session = hydrateStoredSession("patient");
    setJourney((current) => ({ ...current, loading: true, error: "" }));
    try {
      const appointment = await apiRequest(session, "/appointments", {
        method: "POST",
        body: {
          doctor_user_id: journey.doctorId,
          type: settings.preferredConsultationType,
          start_at: journey.selectedSlot.start_at,
          end_at: journey.selectedSlot.end_at,
          timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        }
      });
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
      if (storefrontSettings.livePaymentsEnabled) {
        setJourney((current) => ({
          ...current,
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
          currency: selectedDoctor?.store_currency || storeCurrency,
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
    if (!storefrontSettings.livePaymentsEnabled && (journey.checkout?.mock || journey.appointment?.mock)) {
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
    clearSessionAuth(FRONTENDS.patient, session || hydrateStoredSession("patient"));
    router.replace("/login");
  }

  return <RoleShell
    title="Nevari Customer"
    pages={pages}
    active={page}
    onPageChange={(nextPage) => {
      setPage(nextPage);
      if (nextPage !== "appointment") {
        setJourney(createJourneyState());
      }
    }}
    showHeader={page !== "overview"}
    topContent={<CustomerAppHeader profile={profile} />}
    pageLabels={pageLabels}
    renderNavIcon={renderDashboardIcon}
  >
    {state.error ? <p className="receipt-feedback">{state.error}</p> : null}
    {showSkeleton ? <CustomerDashboardSkeleton page={page} /> : null}
    {!showSkeleton && page === "overview" ? <CustomerOverview
      doctors={visibleDoctors}
      doctorsUnavailable={state.doctorsUnavailable}
      orders={state.orders}
      appointments={state.appointments}
      orderCounts={orderCounts}
      spentThisMonth={spentThisMonth}
      onOpenPage={setPage}
      onOpenAvailability={openDoctorAvailability}
      onOpenReviews={openDoctorReviews}
      storeCurrency={storeCurrency}
      storeUrl={storeUrl}
    /> : null}
    {!showSkeleton && page === "orders" ? <OrdersPage
      orders={state.orders}
      counts={orderCounts}
      expandedOrderId={expandedOrderId}
      onToggleOrder={(id) => setExpandedOrderId((current) => current === id ? null : id)}
      onOpenOrderDocuments={openOrderDocuments}
      onCancelPendingOrder={cancelPendingOrder}
      storeCurrency={storeCurrency}
    /> : null}
    {!showSkeleton && page === "appointment" ? <AppointmentPage
      doctors={visibleDoctors}
      doctorsUnavailable={state.doctorsUnavailable}
      journey={journey}
      selectedDoctor={selectedDoctor}
      upcoming={upcomingAppointments}
      past={pastAppointments}
      onOpenAvailability={openDoctorAvailability}
      onOpenReviews={openDoctorReviews}
      onUpdateAvailabilityDate={updateAvailabilityDate}
      onSelectSlot={(slot) => setJourney((current) => ({ ...current, selectedSlot: slot }))}
      onCreateAppointmentCheckout={createAppointmentCheckout}
      onRefreshConfirmation={refreshConfirmation}
      onResetJourney={resetAppointmentJourney}
      onReviewDraftChange={(field, value) => setJourney((current) => ({ ...current, reviewDraft: { ...current.reviewDraft, [field]: value } }))}
      onSubmitReview={submitReview}
      calendarDownloadUrl={journey.appointment?.mock ? "" : (journey.appointment?.id ? buildUrl(hydrateStoredSession("patient"), `/appointments/${journey.appointment.id}/calendar`) : "")}
      storeCurrency={storeCurrency}
    /> : null}
    {!showSkeleton && page === "settings" ? <SettingsPage
      profile={profile}
      doctors={visibleDoctors}
      orders={state.orders}
      appointments={state.appointments}
      settings={settings}
      onSettingsChange={setSettings}
      onLogout={handleLogout}
    /> : null}
    {!showSkeleton && page === "profile" ? <ProfilePage profile={profile} orders={state.orders} appointments={state.appointments} doctors={visibleDoctors} settings={settings} onSettingsChange={setSettings} onLogout={handleLogout} /> : null}
  </RoleShell>;
}

function hasCustomerDashboardData(state) {
  return Boolean(
    state.dashboard
    || state.orders.length
    || state.appointments.length
    || state.doctors.length
  );
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

function CustomerOverview({ doctors, doctorsUnavailable, orders, appointments, orderCounts, spentThisMonth, onOpenPage, onOpenAvailability, onOpenReviews, storeCurrency, storeUrl }) {
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
        meta: `${money(order.total, order.currency || storeCurrency)} · ${titleCase(order.status)}`,
        page: "orders"
      }));
    const appointmentMatches = appointments
      .filter((appointment) => String(appointment.id || "").toLowerCase().includes(term))
      .slice(0, 4)
      .map((appointment) => ({
        key: `appointment-${appointment.id}`,
        label: `Appointment ${appointment.id}`,
        meta: shortDate(appointment.start_at, true),
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
  }, [appointments, doctors, orders, query, storeCurrency]);

  const appointmentCards = [...appointments]
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
        <strong>{money(spentThisMonth, orders[0]?.currency || storeCurrency)}</strong>
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
        {appointmentCards.map((appointment, index) => <article className="appointment-stack-card appointment-card" key={appointment.id} style={{ "--stack": index }}>
          <div className="calendar-tile">
            <span>{new Date(appointment.start_at).toLocaleString("en-US", { month: "short" })}</span>
            <strong>{new Date(appointment.start_at).getDate()}</strong>
          </div>
          <div>
            <div className="card-title">{titleCase(appointment.type || "consultation")}</div>
            <div className="card-desc">{shortDate(appointment.start_at, true)}</div>
          </div>
          <span className={`status-badge ${appointment.payment_status === "paid" ? "success" : "warning"}`}>{titleCase(appointment.status)}</span>
        </article>)}
      </div>
    </div> : <div className="empty-card compact-empty mobile-gap-bottom"><div className="card-title">No appointment yet</div></div>}

    <div className="tiny-title">Nevari doctors</div>
    <DoctorCards doctors={doctors} doctorsUnavailable={doctorsUnavailable} onOpenAvailability={onOpenAvailability} onOpenReviews={onOpenReviews} storeCurrency={storeCurrency} />
  </>;
}

function DoctorCards({ doctors, doctorsUnavailable, onOpenAvailability, onOpenReviews, storeCurrency }) {
  return <div className="booking-list desktop-booking-list">
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
          <div className="booking-stat"><strong>{money(doctor.consultation_fee || 0, doctor.store_currency || storeCurrency)}</strong><span>Consultation fee</span></div>
        </div>
        <div className="doctor-card-actions">
          <button className="booking-btn" type="button" onClick={() => onOpenAvailability(doctor)}>Book appointment</button>
        </div>
      </div>;
    }) : <div className="empty-card"><div className="card-title">{doctorsUnavailable ? "Doctors not available at the moment" : "Doctors not available at the moment"}</div></div>}
  </div>;
}

function OrdersPage({ orders, counts, expandedOrderId, onToggleOrder, onOpenOrderDocuments, onCancelPendingOrder, storeCurrency }) {
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

    <section className="customer-list-shell">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Orders</span>
          <h2>Recent purchases</h2>
        </div>
      </div>
      <div className="customer-order-list">
        {orderedRows.length ? orderedRows.map((order) => {
          const isExpanded = expandedOrderId === order.id;
          const quantity = order.totals?.items_quantity || order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
          const statusMeta = orderStatusMeta(order.status);

          return <article className={`customer-order-card ${isExpanded ? "expanded" : ""}`} key={order.id}>
            <button className="customer-order-summary" type="button" onClick={() => onToggleOrder(order.id)}>
              <div className="customer-order-main">
                <div>
                  <div className="card-title">{orderPrimaryLabel(order)}</div>
                  <div className="card-desc">Order ID {order.number} · {quantity} items</div>
                </div>
              </div>
              <div className="customer-order-side">
                <span className={`status-badge ${statusMeta.tone}`}>{statusMeta.label}</span>
                <strong>{money(order.total, order.currency || storeCurrency)}</strong>
              </div>
            </button>
            {statusMeta.showProgress ? <div className={`customer-order-progress ${statusMeta.shimmer ? "is-processing" : ""}`} aria-hidden="true">
              <span style={{ "--order-progress": `${statusMeta.progress}%` }} />
            </div> : null}
            {isExpanded ? <div className="customer-order-detail">
              <div className="customer-order-detail-grid">
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
  journey,
  selectedDoctor,
  upcoming,
  past,
  onOpenAvailability,
  onOpenReviews,
  onUpdateAvailabilityDate,
  onSelectSlot,
  onCreateAppointmentCheckout,
  onRefreshConfirmation,
  onResetJourney,
  onReviewDraftChange,
  onSubmitReview,
  calendarDownloadUrl,
  storeCurrency,
}) {
  const [filter, setFilter] = useState("all");
  const [doctorTab, setDoctorTab] = useState("recent");
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

  if (journey.mode === "slots") {
    return <AvailableTimePage
      doctor={selectedDoctor}
      journey={journey}
      onBack={onResetJourney}
      onUpdateAvailabilityDate={onUpdateAvailabilityDate}
      onSelectSlot={onSelectSlot}
      onCreateAppointmentCheckout={onCreateAppointmentCheckout}
    />;
  }

  if (journey.mode === "checkout") {
    return <CheckoutPage journey={journey} doctor={selectedDoctor} onBack={onResetJourney} onRefreshConfirmation={onRefreshConfirmation} storeCurrency={storeCurrency} livePaymentsEnabled={storefrontSettings.livePaymentsEnabled} />;
  }

  if (journey.mode === "confirmation") {
    return <ConfirmationPage journey={journey} doctor={selectedDoctor} onBack={onResetJourney} calendarDownloadUrl={calendarDownloadUrl} />;
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

  return <div className="customer-dashboard-stack">
    <section className="customer-list-shell">
      <div className="customer-panel-head">
        <div>
          <span className="customer-section-kicker">Appointment</span>
          <h2>Appointment history</h2>
        </div>
      </div>
      <div className="filter-bar customer-filter-bar" role="tablist" aria-label="Appointment filters">
        {filters.map((item) => <button className={`filter-btn ${filter === item.id ? "active" : ""}`} key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>
          {item.label}
          <span className="filter-count">{item.count}</span>
        </button>)}
      </div>
      <AppointmentSection title="Appointments" items={visibleAppointments} tone={filter} doctors={doctors} />
    </section>
    <section className="customer-list-shell">
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
        onOpenAvailability={onOpenAvailability}
        onOpenReviews={onOpenReviews}
        storeCurrency={storeCurrency}
      />
    </section>
  </div>;
}

function AvailableTimePage({ doctor, journey, onBack, onUpdateAvailabilityDate, onSelectSlot, onCreateAppointmentCheckout }) {
  const days = nextSevenDays(journey.selectedDate);
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>{"<"}</button>
    </div>
    <div className="appointment-surface-card">
      <div className="appointment-surface-head">
        <div>
          <h3>{new Date(journey.selectedDate).toLocaleString("en-US", { month: "long" })}</h3>
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
            {formatTime(slot.start_at)}
          </button>;
        }) : !journey.loading ? <div className="empty-card compact-empty"><div className="card-title">No available slots on this date.</div></div> : null}
      </div>
    </div>
    <div className="appointment-summary-card">
      <h3>Selected appointment</h3>
      <div className="appointment-summary-row"><span>Date</span><strong>{friendlyDate(journey.selectedSlot?.start_at || journey.selectedDate)}</strong></div>
      <div className="appointment-summary-row"><span>Time</span><strong>{journey.selectedSlot ? formatTime(journey.selectedSlot.start_at) : "Select a time"}</strong></div>
    </div>
    <button className="appointment-primary-cta" type="button" disabled={!journey.selectedSlot || journey.loading} onClick={onCreateAppointmentCheckout}>Book appointment</button>
  </section>;
}

function CheckoutPage({ journey, doctor, onBack, onRefreshConfirmation, storeCurrency, livePaymentsEnabled = false }) {
  const appointment = journey.checkout?.appointment || journey.appointment;
  const paymentUrl = journey.checkout?.payment_url;
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>{"<"}</button>
      <h2>Payment details</h2>
      <div className="appointment-circle-button appointment-circle-button-static">$</div>
    </div>
    <div className="appointment-surface-card">
      <div className="checkout-summary-grid">
        <div><span>Doctor</span><strong>{doctor?.display_name || appointment?.doctor?.display_name || "Doctor"}</strong></div>
        <div><span>Date</span><strong>{friendlyDate(appointment?.start_at)}</strong></div>
        <div><span>Time</span><strong>{formatTime(appointment?.start_at)}</strong></div>
        <div><span>Amount</span><strong>{money(journey.checkout?.total || 0, journey.checkout?.currency || storeCurrency)}</strong></div>
      </div>
      <div className="checkout-status-banner">
        <strong>{titleCase(journey.checkout?.payment_status || appointment?.payment_status || "pending")}</strong>
        <span>Your booking is reserved. Complete payment with the active WooCommerce gateway.</span>
      </div>
      {journey.error ? <p className="receipt-feedback">{journey.error}</p> : null}
      {paymentUrl ? <a className="appointment-primary-cta appointment-link-cta" href={paymentUrl} target="_blank" rel="noreferrer">{!livePaymentsEnabled && paymentUrl === "#demo-payment" ? "Open demo payment" : "Proceed to payment"}</a> : null}
      <button className="appointment-secondary-cta" type="button" onClick={onRefreshConfirmation} disabled={journey.loading}>I've completed payment</button>
    </div>
  </section>;
}

function ConfirmationPage({ journey, doctor, onBack, calendarDownloadUrl }) {
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
        <div><span>Date</span><strong>{friendlyDate(appointment?.start_at)}</strong></div>
        <div><span>Time</span><strong>{formatTime(appointment?.start_at)}</strong></div>
        <div><span>Order</span><strong>{confirmation?.order_number || "Paid"}</strong></div>
      </div>
      <div className="calendar-action-stack">
        {getAppointmentJoinUrl(appointment) ? <a className="appointment-primary-cta appointment-link-cta" href={getAppointmentJoinUrl(appointment)} target="_blank" rel="noreferrer">Join meeting</a> : null}
        {calendarDownloadUrl ? <a className="appointment-primary-cta appointment-link-cta" href={calendarDownloadUrl} target="_blank" rel="noreferrer">Add to Apple Calendar</a> : null}
        {confirmation?.calendar?.google_url ? <a className="appointment-secondary-cta appointment-link-cta" href={confirmation.calendar.google_url} target="_blank" rel="noreferrer">Add to Google Calendar</a> : null}
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
      <textarea className="review-textarea" rows={4} placeholder="Share your consultation experience" value={journey.reviewDraft.reviewText} onChange={(event) => onReviewDraftChange("reviewText", event.target.value)} />
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

function AppointmentSection({ title, items, tone, doctors }) {
  return <div className="customer-appointment-list">
    {items.length ? items.map((appointment) => {
      const doctor = doctors.find((item) => String(item.user_id || item.id) === String(appointment.doctor_user_id));
      const chipTone = appointmentChipTone(appointment);
      return <article className={`customer-appointment-card ${tone}`} key={appointment.id}>
        <div className="customer-order-icon"><DashboardIcon name="appointment" /></div>
        <div className="customer-appointment-copy">
          <div className="card-title">{titleCase(appointment.type || "consultation")}</div>
          <div className="card-desc">{shortDate(appointment.start_at, true)}</div>
          <div className="customer-meta-line">{doctor?.display_name || `Doctor #${appointment.doctor_user_id}`}</div>
        </div>
        <div className="customer-appointment-side">
          <span className={`chip ${chipTone}`}><span className="chip-dot" />{appointmentChipLabel(appointment)}</span>
          {getAppointmentJoinUrl(appointment) ? <a className="pill-button" href={getAppointmentJoinUrl(appointment)} target="_blank" rel="noreferrer">Join</a> : null}
        </div>
      </article>;
    }) : <div className="empty-card compact-empty"><div className="card-title">No appointments in this section.</div></div>}
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
            <label><span>Display name</span><input value={settings.displayName} placeholder={profile.display_name || "Customer"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label><span>Email</span><input value={settings.email} placeholder={profile.email || "customer@email.com"} onChange={(event) => onSettingsChange((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span>Phone number</span><input value={settings.phone} placeholder="+234 ..." onChange={(event) => onSettingsChange((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label><span>Address</span><textarea rows={3} value={settings.address} onChange={(event) => onSettingsChange((current) => ({ ...current, address: event.target.value }))} /></label>
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
            <label><span>Timezone</span><input value={settings.timezone} onChange={(event) => onSettingsChange((current) => ({ ...current, timezone: event.target.value }))} /></label>
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
        <input value={settings.displayName} placeholder={profile.display_name || "Customer"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: event.target.value }))} />
      </article>
      <article className="customer-profile-card">
        <span>Email address</span>
        <input value={profile.email || "No email available"} readOnly aria-readonly="true" />
      </article>
      <article className="customer-profile-card">
        <span>Phone number</span>
        <input value={settings.phone} placeholder="+234 ..." onChange={(event) => onSettingsChange((current) => ({ ...current, phone: event.target.value }))} />
      </article>
      <article className="customer-profile-card customer-profile-card-wide">
        <span>Address</span>
        <textarea rows={3} value={settings.address} onChange={(event) => onSettingsChange((current) => ({ ...current, address: event.target.value }))} />
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
  if (name === "orders") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M7 12h10" /><path d="M9 17h6" /><rect x="3" y="4" width="18" height="16" rx="3" /></svg>;
  }
  if (name === "appointment") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v4" /><path d="M16 3v4" /><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18" /></svg>;
  }
  if (name === "settings") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="m4.9 4.9 2.1 2.1" /><path d="m17 17 2.1 2.1" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 19.1 2.1-2.1" /><path d="M17 7l2.1-2.1" /></svg>;
  }
  if (name === "profile") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 12 4l8 8.5" /><path d="M7 10.5V20h10v-9.5" /></svg>;
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

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function nextSevenDays(selectedDate) {
  const start = new Date(`${selectedDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return {
      key: isoDate(current),
      weekday: current.toLocaleString("en-US", { weekday: "short" }),
      day: current.getDate()
    };
  });
}

function formatTime(value) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function friendlyDate(value) {
  if (!value) {
    return "Select a date";
  }
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
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

function buildFallbackSlots(selectedDate, doctor) {
  const base = new Date(`${selectedDate}T09:00:00`);
  if (Number.isNaN(base.getTime())) {
    return [];
  }
  const seed = String(doctor?.user_id || doctor?.id || "doctor").length % 3;
  const hours = [9 + seed, 11 + seed, 14 + seed, 16 + seed].filter((hour) => hour < 20);
  return hours.map((hour, index) => {
    const start = new Date(base);
    start.setHours(hour, index % 2 === 0 ? 0 : 30, 0, 0);
    const end = new Date(start.getTime() + (30 * 60 * 1000));
    return {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      mock: true
    };
  });
}

function buildMockAppointment(journey, selectedDoctor, settings, storeCurrency) {
  return {
    id: `demo-appointment-${Date.now()}`,
    doctor_user_id: journey.doctorId,
    start_at: journey.selectedSlot?.start_at,
    end_at: journey.selectedSlot?.end_at,
    payment_status: "pending",
    status: "requested",
    type: settings.preferredConsultationType,
    timezone: settings.timezone,
    doctor: { display_name: selectedDoctor?.display_name || "Doctor" },
    calendar: { google_url: "" },
    currency: selectedDoctor?.store_currency || storeCurrency,
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
    currency: selectedDoctor?.store_currency || storeCurrency
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

function getAppointmentJoinUrl(appointment) {
  const paid = String(appointment?.payment_status || "").toLowerCase() === "paid" || String(appointment?.status || "").toLowerCase() === "confirmed";
  if (!paid) {
    return "";
  }
  return appointment?.meet_link || appointment?.calendar?.google_url || "";
}

function buildAppointmentFilters(upcoming, past) {
  const all = [...upcoming, ...past];
  return [
    { id: "all", label: "All", count: all.length },
    { id: "upcoming", label: "Upcoming", count: upcoming.length },
    { id: "past", label: "Past", count: past.length },
    { id: "completed", label: "Completed", count: all.filter((item) => String(item.status) === "completed").length },
    { id: "cancelled", label: "Cancelled", count: all.filter((item) => ["cancelled", "canceled"].includes(String(item.status))).length }
  ];
}

function filterAppointmentsList(appointments, filter) {
  if (filter === "upcoming") {
    return appointments.filter((item) => new Date(item.start_at || 0).getTime() >= Date.now());
  }
  if (filter === "past") {
    return appointments.filter((item) => new Date(item.start_at || 0).getTime() < Date.now());
  }
  if (filter === "completed") {
    return appointments.filter((item) => String(item.status) === "completed");
  }
  if (filter === "cancelled") {
    return appointments.filter((item) => ["cancelled", "canceled"].includes(String(item.status)));
  }
  return appointments;
}

function appointmentChipTone(appointment) {
  const status = String(appointment.status || "").toLowerCase();
  if (status === "completed") {
    return "complete";
  }
  if (status === "cancelled" || status === "canceled") {
    return "canceled";
  }
  if (status === "processing" || status === "confirmed") {
    return "processing";
  }
  return "pending";
}

function appointmentChipLabel(appointment) {
  const status = String(appointment.status || "");
  if (!status) {
    return "Pending";
  }
  return titleCase(status);
}
