"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate as mutateSWRKey, useSWRConfig } from "swr";
import { HugeiconsIcon } from "@hugeicons/react";
import { AddCircleIcon, Calendar03Icon, Doctor01Icon, Home01Icon, Package01Icon, Settings01Icon, ShoppingCart01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { replaceById, updateListPayload, upsertById } from "../lib/fetcher";
import { isProxyAppointmentsKey, isProxyDashboardDoctorKey, isProxyDoctorPathKey, isProxyOrdersKey, swrKeys, withBaseUrl } from "../lib/swrKeys";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildDashboardCacheKey, buildUrl, DASHBOARD_CACHE_TTL_MS, describeDashboardFetchError, fitTextToContainer, getOrderTypeMeta, hydrateStoredSession, isSessionUsable, money, monthGrid, readDashboardCache, rememberStoreContext, shortDate, storedStoreCurrency, storedStoreTimeZone, titleCase, writeDashboardCache } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";

const DOCTOR_SETTINGS_KEY = "nevari_doctor_frontend_settings";
const ADMIN_APPOINTMENT_SETTINGS_KEY = "nevari_admin_appointment_settings";
const DOCTOR_DASHBOARD_CACHE_SCOPE = "doctor-dashboard";
const pages = ["overview", "consultations", "availability", "profile", "settings"];
const DEFAULT_CONSULTATION_FEE_NGN = 5000;
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DOCTOR_DASHBOARD_REFRESH_MS = 45_000;
const DEFAULT_SLOT_INTERVAL_MINUTES = 30;
const DEFAULT_AVAILABILITY_START = "09:00";
const DEFAULT_AVAILABILITY_END = "17:00";
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
  const [availabilityFeedback, setAvailabilityFeedback] = useState("");
  const [appointmentFeedback, setAppointmentFeedback] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [completionModal, setCompletionModal] = useState({ open: false, appointmentId: null });
  const [completionDraft, setCompletionDraft] = useState({ doctorNotes: "", diagnosis: "", productQuantities: {} });
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [doctorSettings, setDoctorSettings] = useState(() => loadDoctorSettings());
  const [bookingIntervalMinutes, setBookingIntervalMinutes] = useState(() => loadBookingIntervalMinutes());

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
    const syncDoctorViewportMode = () => {
      if (window.innerWidth <= 1024) {
        document.body.classList.add("doctor-mobile-mode");
      } else {
        document.body.classList.remove("doctor-mobile-mode");
      }
    };
    syncDoctorViewportMode();
    window.addEventListener("resize", syncDoctorViewportMode);
    return () => {
      document.body.classList.remove("doctor-mobile-mode");
      window.removeEventListener("resize", syncDoctorViewportMode);
    };
  }, []);

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
  const doctorAppointmentsKey = session && doctorId && ["consultations", "settings"].includes(page)
    ? swrKeys.proxy.path("/appointments", withBaseUrl(session, { per_page: 40, page: 1, doctor_id: doctorId }))
    : null;
  const doctorOrdersKey = session && doctorId && page === "orders"
    ? swrKeys.proxy.path("/orders", withBaseUrl(session, { per_page: 40, page: 1, doctor_id: doctorId }))
    : null;
  const doctorProductsKey = session && doctorId && page === "products"
    ? swrKeys.proxy.path(`/doctors/${doctorId}/products`, withBaseUrl(session, { per_page: 40, page: 1 }))
    : null;
  const doctorPatientsKey = session && doctorId && page === "patients"
    ? swrKeys.proxy.path(`/doctors/${doctorId}/patients`, withBaseUrl(session, { per_page: 40, page: 1 }))
    : null;
  const doctorReviewsKey = session && doctorId && page === "reviews"
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
    setAppointmentFeedback("");
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
      setAppointmentFeedback(action === "confirm" ? "Appointment confirmed." : "Appointment completed.");
      revalidateDoctorGroups(isProxyAppointmentsKey, isProxyDashboardDoctorKey, isProxyOrdersKey);
      await autoRefreshDoctorLists(doctorSummaryKey, doctorAppointmentsKey, doctorOrdersKey);
    } catch (error) {
      if (currentAppointment) {
        await mutateSummary((current) => current ? { ...current, appointments: replaceById(current.appointments || [], currentAppointment) } : current, { revalidate: false });
        await appointmentsQuery.mutate((current) => Array.isArray(current) ? replaceById(current, currentAppointment) : current, { revalidate: false });
        patchDoctorAppointmentCache(currentAppointment);
      }
      setAppointmentFeedback(error?.message || "The appointment update failed.");
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
    setAppointmentFeedback("");
  }

  function closeCompleteAppointmentModal() {
    if (completionSubmitting) return;
    setCompletionModal({ open: false, appointmentId: null });
    setCompletionDraft({ doctorNotes: "", diagnosis: "", productQuantities: {} });
  }

  async function submitAppointmentCompletion() {
    const appointment = state.appointments.find((item) => String(item.id) === String(completionModal.appointmentId));
    if (!appointment) {
      setAppointmentFeedback("The appointment could not be found.");
      return;
    }
    const doctorNotes = String(completionDraft.doctorNotes || "").trim();
    if (!doctorNotes) {
      setAppointmentFeedback("Doctor remarks are required before completion.");
      return;
    }

    const selectedItems = Object.entries(completionDraft.productQuantities || {})
      .map(([productId, quantity]) => ({ product_id: Number(productId), quantity: Number(quantity) }))
      .filter((item) => item.product_id > 0 && item.quantity > 0);

    setCompletionSubmitting(true);
    setAppointmentFeedback("");
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
              first_name: firstName || "Customer",
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
    setAvailabilityFeedback("");
    try {
      const sanitized = normalizeAvailability(availabilityDraft);
      await mutateSummary((current) => current ? { ...current, availability: sanitized } : current, { revalidate: false });
      await availabilityQuery.mutate(sanitized, { revalidate: false });
      patchDoctorAvailabilityCache(sanitized);
      await apiRequest(session, `/doctors/${doctorId}/availability`, {
        method: "PUT",
        body: { availability: sanitized }
      });
      setAvailabilityFeedback("Availability updated.");
      revalidateDoctorGroups(isProxyDoctorPathKey, isProxyAppointmentsKey);
      await autoRefreshDoctorLists(doctorSummaryKey, doctorAvailabilityKey, doctorAppointmentsKey);
    } catch (error) {
      await availabilityQuery.mutate();
      await mutateSummary();
      setAvailabilityFeedback(error?.message || "Availability could not be saved.");
    } finally {
      setSavingAvailability(false);
    }
  }

  async function handleLogout() {
    if (logoutBusy) {
      return;
    }
    setLogoutBusy(true);
    try {
      clearSessionAuth(FRONTENDS.doctor, session || hydrateStoredSession("doctor"));
      router.replace("/admin/doctor/login");
    } catch {
      setLogoutBusy(false);
    }
  }

  const appointmentDates = useMemo(() => new Set(state.appointments.map((item) => String(item.start_at || "").slice(0, 10))), [state.appointments]);
  const visibleAppointments = useMemo(
    () => state.appointments.filter((item) => String(item.start_at || "").slice(0, 10) === selectedDate.toISOString().slice(0, 10)),
    [selectedDate, state.appointments]
  );
  const sortedAppointments = useMemo(
    () => [...state.appointments].sort((left, right) => new Date(left.start_at || 0) - new Date(right.start_at || 0)),
    [state.appointments]
  );
  const reviews = state.reviews?.reviews || [];
  const reviewSummary = state.reviews?.summary || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const paidAppointments = state.appointments.filter((item) => item.payment_status === "paid");
  const estimatedRevenue = paidAppointments.reduce((sum) => sum + doctorConsultationFee(state.doctor), 0);
  const storeCurrency = state.dashboard?.store_currency || storedStoreCurrency();
  useEffect(() => {
    rememberStoreContext(state.dashboard || state.doctor || {});
  }, [state.dashboard, state.doctor]);
  const pageQueryLoading = (
    (page === "consultations" && appointmentsQuery.isLoading && !appointmentsQuery.data) ||
    (page === "orders" && ordersQuery.isLoading && !ordersQuery.data) ||
    (page === "products" && productsQuery.isLoading && !productsQuery.data) ||
    (page === "patients" && patientsQuery.isLoading && !patientsQuery.data) ||
    (page === "reviews" && reviewsQuery.isLoading && !reviewsQuery.data) ||
    (page === "availability" && availabilityQuery.isLoading && !availabilityQuery.data) ||
    (page === "settings" && ((appointmentsQuery.isLoading && !appointmentsQuery.data) || (availabilityQuery.isLoading && !availabilityQuery.data)))
  );
  const showSkeleton = (isLoading && !hasDoctorDashboardData(state)) || pageQueryLoading;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const fitStats = () => {
      document.querySelectorAll(".overview-action-value, .doctor-profile-metrics strong, .doctor-insight-card strong, .doctor-settings-summary strong, .metric-card strong, .mini-stat strong").forEach((node) => {
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

  return <RoleShell title="Nevari Doctor" pages={pages} active={page} onPageChange={setPage} renderNavIcon={renderDoctorNavIcon}>
    {state.error ? <p className="receipt-feedback">{state.error}</p> : null}
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
      onOpenReviews={() => setPage("reviews")}
      onOpenProfile={() => setPage("profile")}
    /> : null}
    {!showSkeleton && page === "consultations" ? <ConsultationsPage
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      markedDates={appointmentDates}
      rows={visibleAppointments}
      appointmentFeedback={appointmentFeedback}
      onConfirm={(appointmentId) => handleAppointmentAction(appointmentId, "confirm")}
      onComplete={openCompleteAppointmentModal}
      /> : null}
    {!showSkeleton && page === "reviews" ? <ReviewsPage doctor={state.doctor} summary={reviewSummary} reviews={reviews} /> : null}
    {!showSkeleton && page === "availability" ? <AvailabilityPage
      availabilityDraft={availabilityDraft}
      bookingIntervalMinutes={bookingIntervalMinutes}
      onChange={setAvailabilityDraft}
      onSave={saveAvailability}
      saving={savingAvailability}
      feedback={availabilityFeedback}
    /> : null}
    {!showSkeleton && page === "settings" ? <DoctorSettingsPage
      doctor={state.doctor}
      appointments={state.appointments}
      settings={doctorSettings}
      onSettingsChange={setDoctorSettings}
      availabilityDraft={availabilityDraft}
      onOpenAvailability={() => setPage("availability")}
      estimatedRevenue={estimatedRevenue}
      storeCurrency={storeCurrency}
    /> : null}
    {!showSkeleton && page === "orders" ? <TablePanel title="Assigned Orders" rows={state.orders} columns={["Order", "Type", "Customer", "Total", "Status", "Documents"]} render={(item) => {
      const typeMeta = getOrderTypeMeta(item);
      return [
      `#${item.number}`,
      <span className={`status-badge ${typeMeta.tone}`}>{typeMeta.label}</span>,
      item.customer_id || "Guest",
      money(item.total, storeCurrency),
      titleCase(item.status),
      <a href={`/admin/orders/${item.id}/documents?role=doctor`} target="_blank" rel="noreferrer">Open</a>
    ];
    }} /> : null}
    {!showSkeleton && page === "products" ? <TablePanel title="Assigned Products" rows={state.products} columns={["Product", "Categories", "Price", "Stock"]} render={(item) => [item.name, (item.categories || []).join(", "), money(item.price, storeCurrency), item.stock_quantity ?? "n/a"]} /> : null}
    {!showSkeleton && page === "patients" ? <TablePanel title="Customers" rows={state.patients} columns={["Customer", "Email", "First linked", "Last interaction"]} render={(item) => [item.display_name, item.email, shortDate(item.first_linked_at), shortDate(item.last_interaction_at)]} /> : null}
    {!showSkeleton && page === "profile" ? <ProfilePage doctor={state.doctor} estimatedRevenue={estimatedRevenue} storeCurrency={storeCurrency} onLogout={handleLogout} logoutBusy={logoutBusy} /> : null}
    {completionModal.open ? <AppointmentCompletionModal
      appointment={state.appointments.find((item) => String(item.id) === String(completionModal.appointmentId)) || null}
      products={state.products}
      draft={completionDraft}
      onChange={setCompletionDraft}
      onClose={closeCompleteAppointmentModal}
      onSubmit={submitAppointmentCompletion}
      submitting={completionSubmitting}
    /> : null}
  </RoleShell>;
}

function ConsultationsPage({ selectedDate, onSelectDate, markedDates, rows, appointmentFeedback, onConfirm, onComplete }) {
  return <section className="doctor-consultation-layout">
    <aside className="panel role-calendar-panel">
      <div className="panel-header"><h2>{selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</h2></div>
      <div className="calendar-widget">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
        {monthGrid(selectedDate, markedDates).map((day) => <button className={`calendar-day ${day.muted ? "muted-day" : ""} ${day.selected ? "active" : ""} ${day.marked ? "has-appointment" : ""}`} key={day.key} onClick={() => onSelectDate(new Date(`${day.key}T12:00:00`))}>{day.day}</button>)}
      </div>
    </aside>
    <section className="doctor-appointment-stack">
      <div className="panel-header"><h2>Appointments</h2></div>
      {appointmentFeedback ? <p className="receipt-feedback">{appointmentFeedback}</p> : null}
      {rows.length ? rows.map((item) => <AppointmentDetailCard key={item.id} appointment={item} onConfirm={onConfirm} onComplete={onComplete} />) : <div className="empty-card compact-empty"><div className="card-title">No appointments on this date.</div></div>}
    </section>
  </section>;
}

function AppointmentDetailCard({ appointment, onConfirm, onComplete }) {
  const session = hydrateStoredSession("doctor");
  const canConfirm = appointment.status === "awaiting_payment" ? false : appointment.status === "requested";
  const canComplete = appointment.status === "confirmed";
  const calendarUrl = buildUrl(session, `/appointments/${appointment.id}/calendar`);
  const joinUrl = [appointment?.join_url, appointment?.meet_link, appointment?.google_meet_link, appointment?.meeting_link, appointment?.meeting_url]
    .find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) || "";
  return <article className="doctor-appointment-detail-card">
    <div className="doctor-appointment-detail-head">
      <div>
        <h3>{appointment.patient?.display_name || `Patient #${appointment.patient_user_id}`}</h3>
        <p>{titleCase(appointment.type || "consultation")} · {shortDate(appointment.start_at, true)}</p>
      </div>
      <div className="doctor-appointment-status-group">
        <span className={`status-badge ${appointment.payment_status === "paid" ? "success" : "warning"}`}>{titleCase(appointment.payment_status || "pending")}</span>
        <span className={`status-badge ${appointment.status === "completed" || appointment.status === "confirmed" ? "success" : "warning"}`}>{titleCase(appointment.status)}</span>
      </div>
    </div>
      <div className="doctor-appointment-grid">
        <div><span>Patient</span><strong>{appointment.patient?.display_name || appointment.patient_user_id}</strong></div>
        <div><span>Email</span><strong>{appointment.patient?.email || "n/a"}</strong></div>
        <div><span>Reason</span><strong>{appointment.reason || "Consultation booking"}</strong></div>
        <div><span>Time zone</span><strong>{appointment.timezone || "UTC"}</strong></div>
        <div><span>Booked time</span><strong>{appointment.created_at ? shortDate(appointment.created_at, true) : "n/a"}</strong></div>
        <div><span>Consultation time</span><strong>{appointment.start_at ? `${shortDate(appointment.start_at, true)}${appointment.end_at ? ` - ${new Date(appointment.end_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}` : "n/a"}</strong></div>
        <div><span>Review</span><strong>{appointment.review ? `${appointment.review.rating}/5` : "Pending"}</strong></div>
        <div><span>Order</span><strong>{appointment.order_id ? `#${appointment.order_id}` : "n/a"}</strong></div>
      </div>
      {appointment.doctor_notes ? <div className="doctor-appointment-note"><span>Doctor remarks</span><p>{appointment.doctor_notes}</p></div> : null}
      <div className="doctor-appointment-actions">
      {joinUrl ? <a className="pill-button" href={joinUrl} target="_blank" rel="noreferrer">Join Appointment</a> : null}
      <a className="pill-button" href={calendarUrl} target="_blank" rel="noreferrer">Calendar file</a>
      {canConfirm ? <button className="pill-button" type="button" onClick={() => onConfirm(appointment.id)}>Confirm</button> : null}
      {canComplete ? <button className="pill-button" type="button" onClick={() => onComplete(appointment.id)}>Mark complete</button> : null}
    </div>
    </article>;
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
    <button className="doctor-completion-backdrop" type="button" aria-label="Close completion modal" onClick={onClose} />
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
          <span>Optional. Quantities above zero will be prescribed and emailed to the customer with a payment link.</span>
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
        <button className="pill-button" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
        <button className="pill-button primary" type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Complete consultation"}
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
            <p>MTM request · {shortDate(selectedRequest.created_at)} · {titleCase(selectedRequest.status)}</p>
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
          <button className="pill-button" type="button" onClick={() => onApprove(selectedRequest.id)}>Approve</button>
          <button className="pill-button" type="button" onClick={() => onFollowUp(selectedRequest.id)}>Follow Up</button>
          <button className="pill-button" type="button" onClick={() => onComplete(selectedRequest.id)}>Complete</button>
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

function ReviewsPage({ doctor, summary, reviews }) {
  return <section className="doctor-reviews-layout">
    <div className="appointment-surface-card">
      <div className="doctor-review-summary-head">
        <div>
          <span className="customer-section-kicker">Review summary</span>
          <h2>{doctor?.display_name || "Doctor"}</h2>
        </div>
        <div className="doctor-review-average">
          <strong>{Number(summary.average || 0).toFixed(1)}</strong>
          <span>{summary.count || 0} reviews</span>
        </div>
      </div>
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = summary.distribution?.[rating] || 0;
        const fill = summary.count ? `${(count / summary.count) * 100}%` : "0%";
        return <div className="review-bar-row" key={rating}>
          <div className="review-bar-label"><span>{rating}</span><small>★</small></div>
          <div className="review-bar-track"><span style={{ width: fill }} /></div>
          <div className="review-bar-text">{count}</div>
        </div>;
      })}
    </div>
    <div className="review-list-stack">
      {reviews.length ? reviews.map((review) => <article className="review-entry-card" key={review.id}>
        <div className="review-entry-head">
          <div className="review-entry-avatar">{initials(review.patient?.display_name || "Patient")}</div>
          <div>
            <div className="card-title">{review.patient?.display_name || "Patient"}</div>
            <div className="card-desc">{shortDate(review.created_at)}</div>
          </div>
          <div className="review-rating-pill">★ {Number(review.rating || 0).toFixed(1)}</div>
        </div>
        <p>{review.review_text || "Verified completed appointment."}</p>
      </article>) : <div className="empty-card compact-empty"><div className="card-title">No patient reviews yet.</div></div>}
    </div>
  </section>;
}

function AvailabilityPage({ availabilityDraft, bookingIntervalMinutes, onChange, onSave, saving, feedback }) {
  const timeFrames = useMemo(() => buildAvailabilityTimeFrames(bookingIntervalMinutes), [bookingIntervalMinutes]);
  return <section className="doctor-availability-shell">
    <div className="appointment-surface-card">
      <div className="panel-header">
        <div>
          <span className="customer-section-kicker">Availability</span>
          <h2>Weekly schedule</h2>
        </div>
        <button className="pill-button" type="button" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
      </div>
      {feedback ? <p className="receipt-feedback">{feedback}</p> : null}
      <p className="doctor-availability-note">Select the time pills that should stay bookable. Slots follow the admin minimum booking time of {bookingIntervalMinutes} minutes.</p>
      <div className="doctor-availability-grid">
        {weekdays.map((day) => {
          const enabled = Boolean(availabilityDraft[day]?.length);
          const selectedFrames = new Set(getSelectedAvailabilityFrames(availabilityDraft[day], bookingIntervalMinutes, timeFrames));
          return <article className="doctor-availability-card" key={day}>
            <div className="doctor-availability-head">
              <strong>{titleCase(day)}</strong>
              <label className="doctor-switch">
                <input type="checkbox" checked={enabled} onChange={(event) => onChange((current) => toggleAvailabilityDay(current, day, event.target.checked, bookingIntervalMinutes))} />
                <span />
              </label>
            </div>
            <div className={`doctor-availability-pill-grid ${enabled ? "" : "is-disabled"}`.trim()}>
              {timeFrames.map((time) => {
                const active = selectedFrames.has(time);
                return <button
                  className={`doctor-availability-pill ${active ? "active" : ""}`.trim()}
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
          </article>;
        })}
      </div>
    </div>
  </section>;
}

function ProfilePage({ doctor, estimatedRevenue, storeCurrency, onLogout, logoutBusy = false }) {
  return <section className="panel role-profile">
    <div className="panel-header">
      <div>
        <h2>{doctor?.display_name || "Doctor profile"}</h2>
        <p>{doctor?.email || "No email available"}</p>
      </div>
      <button className="pill-button danger" type="button" onClick={onLogout} disabled={logoutBusy}>
        {logoutBusy ? <span className="appointment-cta-spinner" aria-label="Logging out" /> : "Logout"}
      </button>
    </div>
    <div className="doctor-profile-metrics">
      <article>
        <span>Specialties</span>
        <strong>{(doctor?.specialties || []).join(", ") || "General practice"}</strong>
      </article>
      <article>
        <span>Languages</span>
        <strong>{(doctor?.languages || []).join(", ") || "n/a"}</strong>
      </article>
      <article>
        <span>Consultation fee</span>
        <strong>{money(doctorConsultationFee(doctor), storeCurrency)}</strong>
      </article>
      <article>
        <span>Estimated revenue</span>
        <strong>{money(estimatedRevenue, storeCurrency)}</strong>
      </article>
    </div>
  </section>;
}

function DoctorSettingsPage({ doctor, appointments, settings, onSettingsChange, availabilityDraft, onOpenAvailability, estimatedRevenue, storeCurrency }) {
  const activeDays = weekdays.filter((day) => availabilityDraft[day]?.length).length;
  return <section className="doctor-settings-shell">
    <div className="appointment-surface-card">
      <div className="panel-header">
        <div>
          <span className="customer-section-kicker">Doctor settings</span>
          <h2>Booking and notification controls</h2>
        </div>
        <button className="pill-button" type="button" onClick={onOpenAvailability}>Open schedule</button>
      </div>
      <div className="doctor-settings-grid">
        <article className="doctor-settings-card">
          <h3>Profile</h3>
          <label><span>Display name</span><input value={settings.displayName} placeholder={doctor?.display_name || "Doctor"} onChange={(event) => onSettingsChange((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label><span>Specialization</span><input value={settings.specialization} placeholder={(doctor?.specialties || []).join(", ") || "General practice"} onChange={(event) => onSettingsChange((current) => ({ ...current, specialization: event.target.value }))} /></label>
          <label><span>Bio</span><textarea rows={3} value={settings.bio} onChange={(event) => onSettingsChange((current) => ({ ...current, bio: event.target.value }))} /></label>
          <label><span>License number</span><input value={settings.licenseNumber} onChange={(event) => onSettingsChange((current) => ({ ...current, licenseNumber: event.target.value }))} /></label>
        </article>

        <article className="doctor-settings-card">
          <h3>Consultation controls</h3>
          <div className="doctor-settings-summary"><span>Consultation fee</span><strong>{money(doctorConsultationFee(doctor), storeCurrency)}</strong></div>
          <div className="doctor-settings-summary"><span>Working days</span><strong>{activeDays}</strong></div>
          <SettingsToggle label="Auto-accept appointments" checked={settings.autoAcceptAppointments} onChange={(checked) => onSettingsChange((current) => ({ ...current, autoAcceptAppointments: checked, manualApprovalMode: checked ? false : current.manualApprovalMode }))} />
          <SettingsToggle label="Manual approval mode" checked={settings.manualApprovalMode} onChange={(checked) => onSettingsChange((current) => ({ ...current, manualApprovalMode: checked, autoAcceptAppointments: checked ? false : current.autoAcceptAppointments }))} />
          <SettingsToggle label="Emergency availability" checked={settings.emergencyAvailability} onChange={(checked) => onSettingsChange((current) => ({ ...current, emergencyAvailability: checked }))} />
          <SettingsToggle label="Online consultations" checked={settings.onlineConsultations} onChange={(checked) => onSettingsChange((current) => ({ ...current, onlineConsultations: checked }))} />
          <label><span>Buffer time between sessions (mins)</span><input type="number" min="0" value={settings.bufferMinutes} onChange={(event) => onSettingsChange((current) => ({ ...current, bufferMinutes: event.target.value }))} /></label>
          <label><span>Max daily appointments</span><input type="number" min="1" value={settings.maxDailyAppointments} onChange={(event) => onSettingsChange((current) => ({ ...current, maxDailyAppointments: event.target.value }))} /></label>
          <label><span>Break time notes</span><input value={settings.breakWindow} placeholder="1:00 PM - 2:00 PM" onChange={(event) => onSettingsChange((current) => ({ ...current, breakWindow: event.target.value }))} /></label>
        </article>

        <article className="doctor-settings-card">
          <h3>Notifications</h3>
          <SettingsToggle label="Email notifications" checked={settings.emailNotifications} onChange={(checked) => onSettingsChange((current) => ({ ...current, emailNotifications: checked }))} />
          <SettingsToggle label="Instant appointment alerts" checked={settings.instantAlerts} onChange={(checked) => onSettingsChange((current) => ({ ...current, instantAlerts: checked }))} />
          <SettingsToggle label="Reminder notifications" checked={settings.reminderNotifications} onChange={(checked) => onSettingsChange((current) => ({ ...current, reminderNotifications: checked }))} />
          <SettingsToggle label="Prescription builder visible" checked={settings.prescriptionBuilderEnabled} onChange={(checked) => onSettingsChange((current) => ({ ...current, prescriptionBuilderEnabled: checked }))} />
          <small>{appointments.filter((item) => item.status === "requested").length} requested consultations currently need review.</small>
        </article>

        <article className="doctor-settings-card">
          <h3>Payments</h3>
          <div className="doctor-settings-summary"><span>Earnings overview</span><strong>{money(estimatedRevenue, storeCurrency)}</strong></div>
          <div className="doctor-settings-summary"><span>Paid appointments</span><strong>{appointments.filter((item) => item.payment_status === "paid").length}</strong></div>
          <div className="doctor-settings-summary"><span>Pricing control</span><strong>Admin managed</strong></div>
          <p className="muted">Consultation pricing is read-only for doctors. The global consultation fee and customer billing remain under admin control.</p>
        </article>
      </div>
    </div>
  </section>;
}

export function TablePanel({ title, rows, columns, render }) {
  return <section className="table-panel"><div className="panel-header"><h2>{title}</h2></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}>{render(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="muted">No records found.</td></tr>}</tbody></table></div></section>;
}

export function SkeletonBox({ className = "" }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
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
    return <SkeletonTablePanel title="Customers" columns={4} rows={6} />;
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
  return <>
    <div className="app-header">
      <div className="profile-mini">
        <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-md" />
        </div>
      </div>
      <div className="cluster mobile-icon-cluster">
        <SkeletonBox className="skeleton-circle skeleton-circle-xs" />
      </div>
    </div>
    <div className="tiny-title">Today</div>
    <div className="category-grid doctor-category-grid">
      {Array.from({ length: 4 }, (_, index) => <div className="category-card skeleton-panel" key={`doctor-category-skeleton-${index}`}>
        <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
          <SkeletonBox className="skeleton-line skeleton-line-md" />
        </div>
      </div>)}
    </div>
    <div className="tiny-title doctor-clinical-title">Clinical profile</div>
    <div className="plan-card purple doctor-clinical-card skeleton-panel" aria-hidden="true">
      <div className="mini-person">
        <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
      </div>
      <SkeletonBox className="skeleton-line skeleton-line-lg skeleton-line-tall" />
      <div className="plan-footer">
        <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
        <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
      </div>
    </div>
    <div className="doctor-overview-insights">
      {Array.from({ length: 3 }, (_, index) => <article className="doctor-insight-card skeleton-panel" key={`doctor-insight-skeleton-${index}`}>
        <SkeletonBox className="skeleton-line skeleton-line-xs" />
        <SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" />
        <SkeletonBox className="skeleton-line skeleton-line-sm" />
      </article>)}
    </div>
    <div className="tiny-title">Upcoming consultations</div>
    <div className="doctor-list">
      {Array.from({ length: 3 }, (_, index) => <div className="doctor-card skeleton-panel" key={`doctor-list-skeleton-${index}`}>
        <div className="doctor-head">
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <div>
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
        </div>
        <SkeletonBox className="skeleton-line skeleton-line-lg" />
      </div>)}
    </div>
  </>;
}

function DoctorConsultationsSkeleton() {
  return <section className="doctor-consultation-layout">
    <aside className="panel role-calendar-panel skeleton-panel">
      <div className="panel-header"><SkeletonBox className="skeleton-line skeleton-line-lg" /></div>
      <div className="calendar-widget">
        {Array.from({ length: 42 }, (_, index) => <SkeletonBox className="skeleton-circle skeleton-circle-xs" key={`calendar-skeleton-${index}`} />)}
      </div>
    </aside>
    <section className="doctor-appointment-stack">
      <div className="panel-header"><SkeletonBox className="skeleton-line skeleton-line-md" /></div>
      {Array.from({ length: 3 }, (_, index) => <article className="doctor-appointment-detail-card skeleton-panel" key={`appointment-detail-skeleton-${index}`}>
        <div className="doctor-appointment-detail-head">
          <div>
            <SkeletonBox className="skeleton-line skeleton-line-md" />
            <SkeletonBox className="skeleton-line skeleton-line-sm" />
          </div>
        </div>
        <div className="doctor-appointment-grid">
          {Array.from({ length: 6 }, (_, itemIndex) => <div key={`appointment-grid-skeleton-${itemIndex}`}><SkeletonBox className="skeleton-line skeleton-line-xs" /><SkeletonBox className="skeleton-line skeleton-line-sm" /></div>)}
        </div>
      </article>)}
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
  return <section className="doctor-availability-shell">
    <div className="appointment-surface-card skeleton-panel">
      <div className="panel-header">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
        <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
      </div>
      <div className="doctor-availability-grid">
        {Array.from({ length: 7 }, (_, index) => <article className="doctor-availability-card skeleton-panel" key={`availability-skeleton-${index}`}>
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
  return <section className="doctor-settings-shell">
    <div className="appointment-surface-card skeleton-panel">
      <div className="panel-header">
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
          <SkeletonBox className="skeleton-line skeleton-line-lg" />
        </div>
        <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
      </div>
      <div className="doctor-settings-grid">
        {Array.from({ length: 3 }, (_, index) => <article className="doctor-settings-card skeleton-panel" key={`settings-card-skeleton-${index}`}>
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          {Array.from({ length: 5 }, (_, rowIndex) => <SkeletonBox className="skeleton-pill" key={`settings-pill-skeleton-${index}-${rowIndex}`} />)}
        </article>)}
      </div>
    </div>
  </section>;
}

function DoctorProfileSkeleton() {
  return <section className="panel role-profile skeleton-panel">
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

function DoctorOverview({ doctor, dashboard, appointments, orders, patients, reviews, reviewSummary, estimatedRevenue, storeCurrency, onOpenConsultations, onOpenReviews, onOpenProfile }) {
  const upcoming = appointments.filter((item) => ["requested", "confirmed", "awaiting_payment"].includes(item.status)).slice(0, 3);
  const categories = doctor?.product_categories || [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const appointmentsToday = appointments.filter((item) => String(item.start_at || "").slice(0, 10) === todayKey).length;

  return <>
    <div className="app-header">
      <div className="profile-mini">
        <div className="avatar doctor-one">{initials(doctor?.display_name || "Doctor")}</div>
        <div>
          <div className="small muted">Welcome back,</div>
          <div className="card-title">{doctor?.display_name || "Doctor"}</div>
        </div>
      </div>
      <div className="cluster mobile-icon-cluster">
        <button className="icon-btn small" type="button" onClick={onOpenReviews}><span>★</span></button>
      </div>
    </div>

    <OverviewActions
      appointmentsTotal={appointments.length}
      appointmentsToday={appointmentsToday}
      ordersTotal={orders.length}
      availableDoctors={Number(dashboard?.available_doctors ?? 4)}
    />

    <div className="tiny-title doctor-clinical-title">Clinical profile</div>
    <div className="plan-card purple doctor-clinical-card" role="button" tabIndex={0} onClick={onOpenProfile} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        onOpenProfile();
      }
    }}>
      <div className="mini-person">
        <div className="avatar doctor-one">{initials(doctor?.display_name || "Doctor")}</div>
        <div><h4>{doctor?.display_name || "Doctor"}</h4><p>{doctor?.email || "No email available"}</p></div>
      </div>
      <h3 className="plan-title">{(doctor?.specialties || []).join(", ") || "General practice"}</h3>
      <div className="plan-footer">
        <span className="price">{categories.length} categories</span>
        <span className="register-pill"><span className="round">★</span>Open profile</span>
      </div>
      <div className="doctor-figure female" />
    </div>
    <div className="doctor-overview-insights">
      <article className="doctor-insight-card">
        <span>Estimated revenue</span>
        <strong>{money(estimatedRevenue, storeCurrency)}</strong>
        <small>Paid appointments using the admin-managed global consultation fee.</small>
      </article>
      <article className="doctor-insight-card">
        <span>Rating</span>
        <strong>{Number(reviewSummary.average || 0).toFixed(1)} / 5</strong>
        <small>{reviews.length} completed-appointment reviews.</small>
      </article>
      <article className="doctor-insight-card">
        <span>Orders assigned</span>
        <strong>{orders.length}</strong>
        <small>{categories.length} linked product categories.</small>
      </article>
    </div>
    <div className="tiny-title">Upcoming consultations</div>
    <div className="doctor-list">
      {upcoming.length ? upcoming.map((item, index) => <div className="doctor-card doctor-card-clickable" key={item.id} onClick={onOpenConsultations} role="button" tabIndex={0} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onOpenConsultations();
        }
      }}>
        <div className="doctor-head">
          <div className={`avatar doctor-${["one", "two", "three"][index]}`}>{initials(item.patient?.display_name || "Customer")}</div>
          <div>
            <h4>{item.patient?.display_name || "Customer"}</h4>
            <p>{titleCase(item.type || "consultation")}</p>
          </div>
          <span className={`status-badge ${item.payment_status === "paid" ? "success" : "warning"} mobile-push`}>{titleCase(item.payment_status || "pending")}</span>
        </div>
        <div className="info-line"><span className="icon-wrap"><span className="mobile-icon-calendar" /></span>{shortDate(item.start_at, true)}</div>
      </div>) : <div className="empty-card compact-empty"><div className="card-title">No upcoming consultations</div></div>}
    </div>
  </>;
}

function OverviewActions({ appointmentsTotal, appointmentsToday, ordersTotal, availableDoctors }) {
  const valueRefs = useRef([]);
  const cards = [
    { key: "appointments-total", label: "Appointments", value: appointmentsTotal, icon: "appointments" },
    { key: "appointments-today", label: "Appointments", value: appointmentsToday, icon: "appointments" },
    { key: "orders", label: "Orders", value: ordersTotal, icon: "shopping-basket" },
    { key: "available-doctors", label: "Available Doctors", value: availableDoctors, icon: "doctor" }
  ];

  useEffect(() => {
    const fit = () => cards.forEach((card, index) => {
      fitTextToContainer(valueRefs.current[index], { minFontSize: 14 });
    });
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [appointmentsTotal, appointmentsToday, ordersTotal, availableDoctors]);

  return <section className="overview-actions" aria-label="Overview metrics">
    {cards.map((card, index) => <article className="overview-action-card" key={card.key}>
      <div className="overview-action-icon">
        <OverviewIcon name={card.icon} />
      </div>
      <div className="overview-action-info">
        <p>{card.label}</p>
        <strong ref={(node) => { valueRefs.current[index] = node; }} className="overview-action-value">{card.value}</strong>
      </div>
    </article>)}
  </section>;
}

function OverviewIcon({ name }) {
  if (name === "shopping-basket") return <HugeiconsIcon icon={ShoppingBasket01Icon} size={20} strokeWidth={1.7} />;
  if (name === "doctor") return <HugeiconsIcon icon={Doctor01Icon} size={20} strokeWidth={1.7} />;
  return <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={1.7} />;
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

function normalizeAvailability(value) {
  const normalized = {};
  weekdays.forEach((day) => {
    const ranges = Array.isArray(value?.[day]) ? value[day] : [];
    normalized[day] = ranges
      .filter((range) => range?.start && range?.end)
      .map((range) => ({
        start: String(range.start).slice(0, 5),
        end: String(range.end).slice(0, 5)
      }));
  });
  return normalized;
}

function availabilityEquals(left, right) {
  return weekdays.every((day) => {
    const leftRanges = Array.isArray(left?.[day]) ? left[day] : [];
    const rightRanges = Array.isArray(right?.[day]) ? right[day] : [];

    if (leftRanges.length !== rightRanges.length) {
      return false;
    }

    return leftRanges.every((range, index) => (
      String(range?.start || "") === String(rightRanges[index]?.start || "")
      && String(range?.end || "") === String(rightRanges[index]?.end || "")
    ));
  });
}

function toggleAvailabilityDay(current, day, enabled, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const next = normalizeAvailability(current);
  next[day] = enabled ? defaultAvailabilityRanges(intervalMinutes) : [];
  return next;
}

function toggleAvailabilityFrame(current, day, time, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const next = normalizeAvailability(current);
  const selected = new Set(getSelectedAvailabilityFrames(next[day], intervalMinutes));
  if (selected.has(time)) {
    selected.delete(time);
  } else {
    selected.add(time);
  }
  next[day] = buildAvailabilityRangesFromFrames([...selected], intervalMinutes);
  return next;
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

function normalizeSlotIntervalMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 5) {
    return DEFAULT_SLOT_INTERVAL_MINUTES;
  }
  return parsed;
}

function defaultAvailabilityRanges(intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  return buildAvailabilityRangesFromFrames(
    buildAvailabilityTimeFrames(intervalMinutes).filter((time) => time >= DEFAULT_AVAILABILITY_START && time < DEFAULT_AVAILABILITY_END),
    intervalMinutes
  );
}

function buildAvailabilityTimeFrames(intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const frames = [];
  const step = normalizeSlotIntervalMinutes(intervalMinutes);
  for (let minutes = 8 * 60; minutes < 20 * 60; minutes += step) {
    frames.push(minutesToTimeString(minutes));
  }
  return frames;
}

function getSelectedAvailabilityFrames(ranges, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES, timeFrames = buildAvailabilityTimeFrames(intervalMinutes)) {
  const normalizedRanges = Array.isArray(ranges) ? ranges : [];
  return timeFrames.filter((time) => {
    const slotStart = timeStringToMinutes(time);
    const slotEnd = slotStart + intervalMinutes;
    return normalizedRanges.some((range) => {
      const rangeStart = timeStringToMinutes(range?.start);
      const rangeEnd = timeStringToMinutes(range?.end);
      return Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && slotStart >= rangeStart && slotEnd <= rangeEnd;
    });
  });
}

function buildAvailabilityRangesFromFrames(frames, intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES) {
  const normalizedFrames = [...new Set(frames.map(timeStringToMinutes).filter(Number.isFinite))].sort((left, right) => left - right);
  if (!normalizedFrames.length) {
    return [];
  }
  const ranges = [];
  let rangeStart = normalizedFrames[0];
  let previous = normalizedFrames[0];

  for (let index = 1; index < normalizedFrames.length; index += 1) {
    const current = normalizedFrames[index];
    if (current !== previous + intervalMinutes) {
      ranges.push({
        start: minutesToTimeString(rangeStart),
        end: minutesToTimeString(previous + intervalMinutes)
      });
      rangeStart = current;
    }
    previous = current;
  }

  ranges.push({
    start: minutesToTimeString(rangeStart),
    end: minutesToTimeString(previous + intervalMinutes)
  });

  return ranges;
}

function timeStringToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.NaN;
  }
  return (hours * 60) + minutes;
}

function minutesToTimeString(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatAvailabilityLabel(time) {
  const [hoursValue, minutesValue] = String(time || "00:00").split(":");
  const hours = Number.parseInt(hoursValue, 10);
  const minutes = Number.parseInt(minutesValue, 10);
  const period = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function SettingsToggle({ label, checked, onChange }) {
  return <label className="customer-toggle-row">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function renderDoctorNavIcon(page) {
  if (page === "overview") return <HugeiconsIcon icon={Home01Icon} size={20} strokeWidth={1.7} />;
  if (page === "consultations") return <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={1.7} />;
  if (page === "reviews") return <HugeiconsIcon icon={StarIcon} size={20} strokeWidth={1.7} />;
  if (page === "availability") return <HugeiconsIcon icon={AddCircleIcon} size={20} strokeWidth={1.7} />;
  if (page === "settings") return <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.7} />;
  if (page === "orders") return <HugeiconsIcon icon={ShoppingCart01Icon} size={20} strokeWidth={1.7} />;
  if (page === "products") return <HugeiconsIcon icon={Package01Icon} size={20} strokeWidth={1.7} />;
  if (page === "profile") return <HugeiconsIcon icon={Doctor01Icon} size={20} strokeWidth={1.7} />;
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

export function RoleShell({
  title,
  pages: navPages,
  active,
  onPageChange,
  children,
  headerAction = null,
  showHeader = true,
  topContent = null,
  pageLabels = {},
  renderNavIcon = null
}) {
  const roleLabel = title.replace(/^Nevari\s+/i, "");
  const visibleNavPages = navPages;
  const labelFor = (page) => pageLabels[page] || titleCase(page);
  const [sideNavOpen, setSideNavOpen] = useState(false);
  return <div className="desktop-dashboard-page role-shell-exact doctor-mobile-shell">
    <section className="desktop-dashboard-shell">
      {sideNavOpen ? <button className="dashboard-side-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setSideNavOpen(false)} /> : null}
      <aside className={`dashboard-side-nav ${sideNavOpen ? "is-open" : ""}`} aria-label={`${roleLabel} sections`}>
        <div className="dashboard-side-nav-header">
          <img className="dashboard-side-nav-mark" src="/ne.webp" alt="" aria-hidden="true" />
          <div>
            <strong>Nevari Health</strong>
            <span>{roleLabel} Dashboard</span>
          </div>
        </div>
        <p className="dashboard-side-nav-label">Navigation</p>
        <div className="dashboard-side-nav-list">
          {navPages.map((item, index) => <button className={`dashboard-side-nav-item ${active === item ? "active" : ""}`} key={item} type="button" onClick={() => {
            onPageChange(item);
            setSideNavOpen(false);
          }}>
            <span className="dashboard-side-nav-icon" aria-hidden="true">
              {renderNavIcon ? renderNavIcon(item, index) : <span className={`mobile-nav-glyph glyph-${(index % 4) + 1}`} />}
            </span>
            <span>{labelFor(item)}</span>
          </button>)}
        </div>
      </aside>
      <div className="dashboard-tablet-toolbar">
        <button className="dashboard-menu-button" type="button" aria-label="Open navigation" onClick={() => setSideNavOpen(true)}>
          <span />
          <span />
          <span />
        </button>
      </div>
      {topContent ? <div className="desktop-dashboard-top-content">{topContent}</div> : null}
      {showHeader ? <header className="desktop-dashboard-header">
        <div>
          <p className="desktop-dashboard-kicker">{roleLabel}</p>
          <h1 className="desktop-dashboard-title">{labelFor(active)}</h1>
        </div>
        {headerAction}
      </header> : null}
      <div className="desktop-dashboard-screen">
        <div className="screen-scroll">
          {children}
        </div>
      </div>
      <nav className="bottom-nav desktop-bottom-nav" aria-label={`${roleLabel} dashboard navigation`}>
        {visibleNavPages.map((item, index) => <button className={`nav-item ${active === item ? "active green-active" : ""}`} key={item} type="button" onClick={() => onPageChange(item)}>
          <span className="dashboard-mobile-nav-icon" aria-hidden="true">
            {renderNavIcon ? renderNavIcon(item, index) : <span className={`mobile-nav-glyph glyph-${index + 1}`} />}
          </span>
          {active === item ? labelFor(item) : null}
        </button>)}
      </nav>
    </section>
  </div>;
}
