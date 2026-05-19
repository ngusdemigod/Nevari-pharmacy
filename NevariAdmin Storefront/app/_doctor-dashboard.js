"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { replaceById, updateListPayload, upsertById } from "../lib/fetcher";
import { isProxyAppointmentsKey, isProxyDashboardDoctorKey, isProxyDoctorPathKey, isProxyOrdersKey, swrKeys, withBaseUrl } from "../lib/swrKeys";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildDashboardCacheKey, buildUrl, DASHBOARD_CACHE_TTL_MS, describeDashboardFetchError, hydrateStoredSession, money, monthGrid, readDashboardCache, shortDate, titleCase, writeDashboardCache } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";

const DOCTOR_SETTINGS_KEY = "nevari_doctor_frontend_settings";
const DOCTOR_DASHBOARD_CACHE_SCOPE = "doctor-dashboard";
const pages = ["overview", "products", "orders", "patients", "consultations", "availability", "reviews", "profile", "settings"];
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
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

async function fetchDoctorDashboardPayload(session, doctorId) {
  const results = await Promise.allSettled([
    apiRequest(session, "/dashboard/doctor"),
    apiRequest(session, "/appointments", { params: { per_page: 5, page: 1 } }),
    apiRequest(session, "/orders", { params: { per_page: 5, page: 1 } }),
    apiRequest(session, `/doctors/${doctorId}`)
  ]);
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => describeDashboardFetchError(result.reason));

  return {
    error: errors[0] || "",
    dashboard: results[0].status === "fulfilled" ? results[0].value : null,
    appointments: results[1].status === "fulfilled" ? results[1].value : [],
    orders: results[2].status === "fulfilled" ? results[2].value : [],
    products: [],
    patients: [],
    doctor: results[3].status === "fulfilled" ? results[3].value : null,
    reviews: null,
    availability: {}
  };
}

async function fetchDoctorAppointments(session) {
  return apiRequest(session, "/appointments", { params: { per_page: 40, page: 1 } });
}

async function fetchDoctorOrders(session) {
  return apiRequest(session, "/orders", { params: { per_page: 40, page: 1 } });
}

async function fetchDoctorProducts(session, doctorId) {
  return apiRequest(session, `/doctors/${doctorId}/products`, { params: { per_page: 40, page: 1 } });
}

async function fetchDoctorPatients(session, doctorId) {
  return apiRequest(session, `/doctors/${doctorId}/patients`, { params: { per_page: 40, page: 1 } });
}

async function fetchDoctorReviews(session, doctorId) {
  return apiRequest(session, `/doctors/${doctorId}/reviews`);
}

async function fetchDoctorAvailability(session, doctorId) {
  const payload = await apiRequest(session, `/doctors/${doctorId}/availability`);
  return normalizeAvailability(payload?.availability || {});
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const [page, setPage] = useState("overview");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [session, setSession] = useState(null);
  const [doctorId, setDoctorId] = useState(null);
  const [cacheKey, setCacheKey] = useState(null);
  const [availabilityDraft, setAvailabilityDraft] = useState({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityFeedback, setAvailabilityFeedback] = useState("");
  const [appointmentFeedback, setAppointmentFeedback] = useState("");
  const [doctorSettings, setDoctorSettings] = useState(() => loadDoctorSettings());

  useEffect(() => {
    const section = titleCase(page);
    setDocumentMetadata(`Nevari Doctor | ${section}`, `${section} view for the Nevari Doctor dashboard.`);
  }, [page]);

  useEffect(() => {
    persistDoctorSettings(doctorSettings);
  }, [doctorSettings]);

  useEffect(() => {
    const hydratedSession = hydrateStoredSession("doctor");
    if (!hydratedSession.paired) {
      router.replace(FRONTENDS.admin.setupPath);
      return;
    }
    const nextDoctorId = hydratedSession.user?.id;
    const roles = hydratedSession.user?.roles || [];
    if (!hydratedSession.accessToken || !nextDoctorId || !roles.includes("doctor")) {
      router.replace("/admin/doctor/login");
      return;
    }
    setSession(hydratedSession);
    setDoctorId(nextDoctorId);
    setCacheKey(buildDashboardCacheKey("doctor", DOCTOR_DASHBOARD_CACHE_SCOPE, nextDoctorId));
  }, [router]);

  const cachedDoctorState = cacheKey ? readDashboardCache(cacheKey, DASHBOARD_CACHE_TTL_MS)?.state : null;
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
    () => fetchDoctorDashboardPayload(session, doctorId),
    {
      fallbackData: cachedDoctorState || undefined,
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

  useEffect(() => {
    setAvailabilityDraft(normalizeAvailability(state.availability || {}));
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
    } catch (error) {
      if (currentAppointment) {
        await mutateSummary((current) => current ? { ...current, appointments: replaceById(current.appointments || [], currentAppointment) } : current, { revalidate: false });
        await appointmentsQuery.mutate((current) => Array.isArray(current) ? replaceById(current, currentAppointment) : current, { revalidate: false });
        patchDoctorAppointmentCache(currentAppointment);
      }
      setAppointmentFeedback(error?.message || "The appointment update failed.");
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
    } catch (error) {
      await availabilityQuery.mutate();
      await mutateSummary();
      setAvailabilityFeedback(error?.message || "Availability could not be saved.");
    } finally {
      setSavingAvailability(false);
    }
  }

  function handleLogout() {
    clearSessionAuth(FRONTENDS.doctor, session || hydrateStoredSession("doctor"));
    router.replace("/admin/doctor/login");
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
  const estimatedRevenue = paidAppointments.reduce((sum, item) => sum + Number(state.doctor?.consultation_fee || 0), 0);
  const storeCurrency = state.dashboard?.store_currency || state.doctor?.store_currency || state.orders.find((order) => order.currency)?.currency || "USD";
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
      onComplete={(appointmentId) => handleAppointmentAction(appointmentId, "complete")}
    /> : null}
    {!showSkeleton && page === "reviews" ? <ReviewsPage doctor={state.doctor} summary={reviewSummary} reviews={reviews} /> : null}
    {!showSkeleton && page === "availability" ? <AvailabilityPage
      availabilityDraft={availabilityDraft}
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
    {!showSkeleton && page === "orders" ? <TablePanel title="Assigned Orders" rows={state.orders} columns={["Order", "Customer", "Total", "Status"]} render={(item) => [`#${item.number}`, item.customer_id || "Guest", money(item.total, item.currency || storeCurrency), titleCase(item.status)]} /> : null}
    {!showSkeleton && page === "products" ? <TablePanel title="Assigned Products" rows={state.products} columns={["Product", "Categories", "Price", "Stock"]} render={(item) => [item.name, (item.categories || []).join(", "), money(item.price, item.currency || storeCurrency), item.stock_quantity ?? "n/a"]} /> : null}
    {!showSkeleton && page === "patients" ? <TablePanel title="Customers" rows={state.patients} columns={["Customer", "Email", "First linked", "Last interaction"]} render={(item) => [item.display_name, item.email, shortDate(item.first_linked_at), shortDate(item.last_interaction_at)]} /> : null}
    {!showSkeleton && page === "profile" ? <ProfilePage doctor={state.doctor} estimatedRevenue={estimatedRevenue} storeCurrency={storeCurrency} onLogout={handleLogout} /> : null}
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
      <div><span>Review</span><strong>{appointment.review ? `${appointment.review.rating}/5` : "Pending"}</strong></div>
      <div><span>Order</span><strong>{appointment.order_id ? `#${appointment.order_id}` : "n/a"}</strong></div>
    </div>
    <div className="doctor-appointment-actions">
      <a className="pill-button" href={calendarUrl} target="_blank" rel="noreferrer">Calendar file</a>
      {appointment.calendar?.google_url ? <a className="pill-button" href={appointment.calendar.google_url} target="_blank" rel="noreferrer">Google</a> : null}
      {canConfirm ? <button className="pill-button" type="button" onClick={() => onConfirm(appointment.id)}>Confirm</button> : null}
      {canComplete ? <button className="pill-button" type="button" onClick={() => onComplete(appointment.id)}>Mark complete</button> : null}
    </div>
  </article>;
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

function AvailabilityPage({ availabilityDraft, onChange, onSave, saving, feedback }) {
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
      <div className="doctor-availability-grid">
        {weekdays.map((day) => {
          const entry = availabilityDraft[day]?.[0] || { start: "09:00", end: "17:00" };
          const enabled = Boolean(availabilityDraft[day]?.length);
          return <article className="doctor-availability-card" key={day}>
            <div className="doctor-availability-head">
              <strong>{titleCase(day)}</strong>
              <label className="doctor-switch">
                <input type="checkbox" checked={enabled} onChange={(event) => onChange((current) => toggleAvailabilityDay(current, day, event.target.checked))} />
                <span />
              </label>
            </div>
            <div className="doctor-availability-time-grid">
              <label>
                <span>Start</span>
                <input type="time" value={entry.start || "09:00"} disabled={!enabled} onChange={(event) => onChange((current) => updateAvailabilityTime(current, day, "start", event.target.value))} />
              </label>
              <label>
                <span>End</span>
                <input type="time" value={entry.end || "17:00"} disabled={!enabled} onChange={(event) => onChange((current) => updateAvailabilityTime(current, day, "end", event.target.value))} />
              </label>
            </div>
          </article>;
        })}
      </div>
    </div>
  </section>;
}

function ProfilePage({ doctor, estimatedRevenue, storeCurrency, onLogout }) {
  return <section className="panel role-profile">
    <div className="panel-header">
      <div>
        <h2>{doctor?.display_name || "Doctor profile"}</h2>
        <p>{doctor?.email || "No email available"}</p>
      </div>
      <button className="pill-button danger" type="button" onClick={onLogout}>Logout</button>
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
        <strong>{money(doctor?.consultation_fee || 0, doctor?.store_currency || storeCurrency)}</strong>
      </article>
      <article>
        <span>Estimated revenue</span>
        <strong>{money(estimatedRevenue, doctor?.store_currency || storeCurrency)}</strong>
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
          <div className="doctor-settings-summary"><span>Pricing tier</span><strong>{settings.pricingTier}</strong></div>
          <div className="doctor-settings-summary"><span>Consultation fee</span><strong>{money(doctor?.consultation_fee || 0, doctor?.store_currency || storeCurrency)}</strong></div>
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
          <div className="doctor-settings-summary"><span>Earnings overview</span><strong>{money(estimatedRevenue, doctor?.store_currency || storeCurrency)}</strong></div>
          <div className="doctor-settings-summary"><span>Paid appointments</span><strong>{appointments.filter((item) => item.payment_status === "paid").length}</strong></div>
          <div className="doctor-settings-summary"><span>Tier lock</span><strong>Admin controlled</strong></div>
          <p className="muted">Consultation pricing is read-only for doctors. Tiers, category rates, and customer billing remain under admin control.</p>
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
    return <SkeletonTablePanel title="Assigned Orders" columns={4} rows={6} />;
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
  const pendingPayments = appointments.filter((item) => item.payment_status !== "paid").length;

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

    <div className="tiny-title">Today</div>
    <div className="category-grid doctor-category-grid">
      {[
        ["Appointments today", dashboard?.appointments_today || 0],
        ["Awaiting payment", pendingPayments],
        ["Paid sessions", appointments.filter((item) => item.payment_status === "paid").length],
        ["Customers", patients.length]
      ].map(([label, value], index) => <div className="category-card" key={label}>
        <div className={`category-icon ${["green", "yellow", "lilac", "blue"][index]}`}><span>{value}</span></div>
        <div>
          <div className="category-meta">{value} total</div>
          <div className="category-name">{label}</div>
        </div>
      </div>)}
    </div>

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
        <strong>{money(estimatedRevenue, doctor?.store_currency || storeCurrency)}</strong>
        <small>Paid appointments using your current consultation fee.</small>
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

function toggleAvailabilityDay(current, day, enabled) {
  const next = normalizeAvailability(current);
  next[day] = enabled ? [{ start: "09:00", end: "17:00" }] : [];
  return next;
}

function updateAvailabilityTime(current, day, field, value) {
  const next = normalizeAvailability(current);
  const range = next[day]?.[0] || { start: "09:00", end: "17:00" };
  next[day] = [{ ...range, [field]: value }];
  return next;
}

function SettingsToggle({ label, checked, onChange }) {
  return <label className="customer-toggle-row">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function renderDoctorNavIcon(page) {
  if (page === "overview") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 12 4l8 8.5" /><path d="M7 10.5V20h10v-9.5" /></svg>;
  }
  if (page === "consultations") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v4" /><path d="M16 3v4" /><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18" /></svg>;
  }
  if (page === "reviews") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z" /></svg>;
  }
  if (page === "availability") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20" /><path d="M2 12h20" /><path d="m5 5 14 14" /><path d="m19 5-14 14" /></svg>;
  }
  if (page === "settings") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="m4.9 4.9 2.1 2.1" /><path d="m17 17 2.1 2.1" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 19.1 2.1-2.1" /><path d="M17 7l2.1-2.1" /></svg>;
  }
  if (page === "orders") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M7 12h10" /><path d="M9 17h6" /><rect x="3" y="4" width="18" height="16" rx="3" /></svg>;
  }
  if (page === "products") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 21 3 14a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z" /><path d="m8 8 8 8" /></svg>;
  }
  if (page === "patients") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3.5" /><circle cx="16.5" cy="10.5" r="2.5" /><path d="M3.5 20a6 6 0 0 1 11 0" /><path d="M14 19.5a4.8 4.8 0 0 1 6.5-3.6" /></svg>;
  }
  if (page === "profile") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M17.5 6.5h4" /><path d="M19.5 4.5v4" /></svg>;
  }
  return null;
}

function defaultDoctorSettings() {
  return {
    displayName: "",
    specialization: "",
    bio: "",
    licenseNumber: "",
    pricingTier: "Specialist",
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
  return <div className="desktop-dashboard-page role-shell-exact">
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
