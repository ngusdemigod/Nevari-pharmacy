"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildUrl, describeDashboardFetchError, hydrateStoredSession, money, shortDate, titleCase } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";
import { RoleShell } from "./_doctor-dashboard";

const pages = ["overview", "orders", "appointment", "profile"];
const pageLabels = {
  overview: "Overview",
  orders: "Orders",
  appointment: "Appointment",
  profile: "My Profile"
};

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

export default function CustomerDashboard() {
  const router = useRouter();
  const [page, setPage] = useState("overview");
  const [state, setState] = useState({
    error: "",
    dashboard: null,
    orders: [],
    appointments: [],
    doctors: [],
    doctorsUnavailable: false
  });
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [storeUrl, setStoreUrl] = useState("#");
  const [journey, setJourney] = useState(createJourneyState());

  useEffect(() => {
    setDocumentMetadata(`Nevari Customer | ${pageLabels[page] || titleCase(page)}`, `${pageLabels[page] || titleCase(page)} view for the Nevari Customer dashboard.`);
  }, [page]);

  useEffect(() => {
    const session = hydrateStoredSession("patient");
    setStoreUrl(session.baseUrl || "#");
    if (!session.paired) {
      router.replace(FRONTENDS.admin.setupPath);
      return;
    }
    const roles = session.user?.roles || [];
    if (!session.accessToken || !roles.some((role) => ["customer", "patient"].includes(role))) {
      router.replace("/login");
      return;
    }
    loadDashboard(session);
  }, [router]);

  async function loadDashboard(session = hydrateStoredSession("patient")) {
    try {
      const [ordersResult, appointmentsResult, doctorsResult] = await Promise.allSettled([
        apiRequest(session, "/orders", { params: { per_page: 24 } }),
        apiRequest(session, "/appointments", { params: { per_page: 40 } }),
        apiRequest(session, "/doctors", { params: { per_page: 24 }, suppressHttpError: true })
      ]);
      const blockingResults = [ordersResult, appointmentsResult];
      const blockingErrors = blockingResults
        .filter((result) => result.status === "rejected")
        .map((result) => describeDashboardFetchError(result.reason));
      const fallbackProfile = {
        id: session.user?.id || null,
        email: session.user?.email || "",
        display_name: session.user?.display_name || session.user?.name || "Customer",
        roles: session.user?.roles || []
      };
      setState({
        error: blockingErrors[0] || "",
        dashboard: { profile: fallbackProfile },
        orders: ordersResult.status === "fulfilled" ? ordersResult.value : [],
        appointments: appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [],
        doctors: doctorsResult.status === "fulfilled" ? doctorsResult.value || [] : [],
        doctorsUnavailable: doctorsResult.status !== "fulfilled" || doctorsResult.value === null
      });
    } catch {
      setState((prev) => ({ ...prev, error: "The dashboard could not be loaded right now." }));
    }
  }

  const profile = state.dashboard?.profile || {};
  const storeCurrency = state.dashboard?.store_currency || state.doctors.find((doctor) => doctor.store_currency)?.store_currency || state.orders.find((order) => order.currency)?.currency || "USD";
  const doctorIds = useMemo(() => {
    const ids = new Set();
    state.orders.forEach((order) => {
      if (order.assigned_doctor_user_id) {
        ids.add(Number(order.assigned_doctor_user_id));
      }
    });
    state.appointments.forEach((appointment) => {
      if (appointment.doctor_user_id) {
        ids.add(Number(appointment.doctor_user_id));
      }
    });
    return ids;
  }, [state.appointments, state.orders]);

  const doctors = useMemo(() => {
    const relatedDoctors = state.doctors.filter((doctor) => doctorIds.has(Number(doctor.user_id || doctor.id)));
    return (relatedDoctors.length ? relatedDoctors : state.doctors)
      .filter((doctor) => !doctor.disabled)
      .slice(0, 8);
  }, [doctorIds, state.doctors]);

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
  const selectedDoctor = doctors.find((doctor) => Number(doctor.user_id || doctor.id) === Number(journey.doctorId))
    || state.doctors.find((doctor) => Number(doctor.user_id || doctor.id) === Number(journey.doctorId))
    || null;

  async function downloadOrderPdf(order) {
    const session = hydrateStoredSession("patient");
    const pdf = await apiRequest(session, `/orders/${order.id}/details-pdf`);
    const link = document.createElement("a");
    link.href = `data:${pdf.content_type};base64,${pdf.base64}`;
    link.download = pdf.filename;
    link.click();
  }

  async function cancelPendingOrder(order) {
    const session = hydrateStoredSession("patient");
    const next = await apiRequest(session, `/orders/${order.id}/cancel`, { method: "POST" });
    setState((prev) => ({ ...prev, orders: prev.orders.map((item) => item.id === next.id ? next : item) }));
  }

  async function openDoctorAvailability(doctor) {
    const session = hydrateStoredSession("patient");
    const nextDate = journey.doctorId === doctor.user_id ? journey.selectedDate : isoDate(new Date());
    setPage("appointment");
    setJourney({
      ...createJourneyState(),
      mode: "slots",
      doctorId: doctor.user_id || doctor.id,
      selectedDate: nextDate,
      loading: true
    });
    try {
      const availability = await apiRequest(session, `/doctors/${doctor.user_id || doctor.id}/availability`, { params: { date: nextDate } });
      setJourney((current) => ({
        ...current,
        mode: "slots",
        doctorId: doctor.user_id || doctor.id,
        selectedDate: nextDate,
        slots: availability?.slots || [],
        loading: false,
        error: ""
      }));
    } catch (error) {
      setJourney((current) => ({
        ...current,
        mode: "slots",
        doctorId: doctor.user_id || doctor.id,
        selectedDate: nextDate,
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
      setJourney((current) => ({
        ...current,
        selectedDate: nextDate,
        slots: availability?.slots || [],
        selectedSlot: null,
        loading: false
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
    setJourney((current) => ({ ...current, loading: true, error: "" }));
    try {
      const appointment = await apiRequest(session, "/appointments", {
        method: "POST",
        body: {
          doctor_user_id: journey.doctorId,
          type: "video",
          start_at: journey.selectedSlot.start_at,
          end_at: journey.selectedSlot.end_at,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
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
      await loadDashboard(session);
    } catch (error) {
      setJourney((current) => ({
        ...current,
        loading: false,
        error: error?.message || "The appointment could not be created."
      }));
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
      await loadDashboard(session);
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
    } catch (error) {
      setJourney((current) => ({
        ...current,
        mode: "reviews",
        doctorId: doctor.user_id || doctor.id,
        loading: false,
        error: error?.message || "Patient reviews could not be loaded."
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
      setJourney((current) => ({
        ...current,
        reviews,
        loading: false,
        reviewDraft: { rating: 5, reviewText: "" },
        reviewFeedback: "Your review has been added."
      }));
      await loadDashboard(session);
    } catch (error) {
      setJourney((current) => ({
        ...current,
        loading: false,
        reviewFeedback: error?.message || "The review could not be submitted."
      }));
    }
  }

  function resetAppointmentJourney() {
    setJourney(createJourneyState());
  }

  function handleLogout() {
    const session = hydrateStoredSession("patient");
    clearSessionAuth(FRONTENDS.patient, session);
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
    {page === "overview" ? <CustomerOverview
      doctors={doctors}
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
    {page === "orders" ? <OrdersPage
      orders={state.orders}
      counts={orderCounts}
      expandedOrderId={expandedOrderId}
      onToggleOrder={(id) => setExpandedOrderId((current) => current === id ? null : id)}
      onDownloadOrderPdf={downloadOrderPdf}
      onCancelPendingOrder={cancelPendingOrder}
      storeCurrency={storeCurrency}
    /> : null}
    {page === "appointment" ? <AppointmentPage
      doctors={doctors}
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
      calendarDownloadUrl={journey.appointment?.id ? buildUrl(hydrateStoredSession("patient"), `/appointments/${journey.appointment.id}/calendar`) : ""}
      storeCurrency={storeCurrency}
    /> : null}
    {page === "profile" ? <ProfilePage profile={profile} orders={state.orders} appointments={state.appointments} doctors={doctors} onLogout={handleLogout} /> : null}
  </RoleShell>;
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
        <div className="category-meta">processing and completed orders</div>
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
        <div><div className="category-meta">{doctors.length} assigned</div><div className="category-name">Doctors</div></div>
      </div>
    </div>

    <div className="tiny-title">Upcoming Appointments</div>
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
    {doctors.length ? doctors.map((doctor) => <div className="booking-card booking-card-interactive" key={doctor.user_id || doctor.id}>
      <div className="booking-row">
        <div className="booking-avatar">{initials(doctor.display_name || "Doctor")}</div>
        <div className="booking-meta">
          <h4>{doctor.display_name || "Doctor"}</h4>
          <p>{doctor.specialties?.[0] || "General consultation"} {doctor.years_experience ? `· ${doctor.years_experience} years exp` : ""}</p>
        </div>
        <button className="doctor-rating-trigger" type="button" onClick={() => onOpenReviews(doctor)}>
          <span aria-hidden="true">★</span>
          <strong>{Number(doctor.rating_average || 0).toFixed(1)}</strong>
          <small>{doctor.reviews_count || 0}</small>
        </button>
      </div>
      <div className="booking-stat-split">
        <div className="booking-stat"><strong>{doctor.telehealth_enabled ? "Video consult" : "Clinic consult"}</strong><span>{doctor.accepting_patients ? "Accepting patients" : "Unavailable"}</span></div>
        <div className="booking-stat"><strong>{money(doctor.consultation_fee || 0, doctor.store_currency || storeCurrency)}</strong><span>Consultation fee</span></div>
      </div>
      <button className="booking-btn" type="button" onClick={() => onOpenAvailability(doctor)}>Book appointment</button>
    </div>) : <div className="empty-card"><div className="card-title">{doctorsUnavailable ? "Doctor directory is temporarily unavailable" : "No available doctors for booking yet"}</div></div>}
  </div>;
}

function OrdersPage({ orders, counts, expandedOrderId, onToggleOrder, onDownloadOrderPdf, onCancelPendingOrder, storeCurrency }) {
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
                {order.status === "completed" ? <button className="customer-order-pdf-button" type="button" aria-label="Download PDF" title="Download PDF" onClick={() => onDownloadOrderPdf(order)}>
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
  storeCurrency
}) {
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
    return <CheckoutPage journey={journey} doctor={selectedDoctor} onBack={onResetJourney} onRefreshConfirmation={onRefreshConfirmation} storeCurrency={storeCurrency} />;
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
          <span className="customer-section-kicker">Book appointment</span>
          <h2>Choose a doctor</h2>
        </div>
      </div>
      <DoctorCards doctors={doctors} doctorsUnavailable={doctorsUnavailable} onOpenAvailability={onOpenAvailability} onOpenReviews={onOpenReviews} storeCurrency={storeCurrency} />
    </section>
    <AppointmentSection title="Upcoming appointments" items={upcoming} tone="upcoming" doctors={doctors} />
    <AppointmentSection title="Past appointments" items={past} tone="past" doctors={doctors} />
  </div>;
}

function AvailableTimePage({ doctor, journey, onBack, onUpdateAvailabilityDate, onSelectSlot, onCreateAppointmentCheckout }) {
  const days = nextSevenDays(journey.selectedDate);
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>‹</button>
     
     
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
      {journey.loading ? <div className="empty-card compact-empty"><div className="card-title">Loading slots…</div></div> : null}
      {journey.error ? <p className="receipt-feedback">{journey.error}</p> : null}
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
    <button className="appointment-primary-cta" type="button" disabled={!journey.selectedSlot || journey.loading} onClick={onCreateAppointmentCheckout}>Book appointment ›</button>
  </section>;
}

function CheckoutPage({ journey, doctor, onBack, onRefreshConfirmation, storeCurrency }) {
  const appointment = journey.checkout?.appointment || journey.appointment;
  const paymentUrl = journey.checkout?.payment_url;
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>‹</button>
      <h2>Payment details</h2>
      <div className="appointment-circle-button appointment-circle-button-static">¤</div>
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
      {paymentUrl ? <a className="appointment-primary-cta appointment-link-cta" href={paymentUrl} target="_blank" rel="noreferrer">Proceed to payment</a> : null}
      <button className="appointment-secondary-cta" type="button" onClick={onRefreshConfirmation} disabled={journey.loading}>I’ve completed payment</button>
    </div>
  </section>;
}

function ConfirmationPage({ journey, doctor, onBack, calendarDownloadUrl }) {
  const confirmation = journey.confirmation;
  const appointment = confirmation?.appointment || journey.appointment;
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>‹</button>
      <h2>Confirmation</h2>
      <div className="appointment-circle-button appointment-circle-button-static">✓</div>
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
  return <section className="appointment-mobile-sheet">
    <div className="appointment-mobile-header">
      <button className="appointment-circle-button" type="button" onClick={onBack}>‹</button>
      <h2>Patient reviews</h2>
      <div className="appointment-circle-button appointment-circle-button-static">★</div>
    </div>
    <div className="appointment-surface-card">
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = summary.distribution?.[rating] || 0;
        const fill = summary.count ? `${(count / summary.count) * 100}%` : "0%";
        return <div className="review-bar-row" key={rating}>
          <div className="review-bar-label"><span>{rating}</span><small>★</small></div>
          <div className="review-bar-track"><span style={{ width: fill }} /></div>
          <div className="review-bar-text">{rating === 5 ? "Excellent" : rating === 4 ? "Good" : rating === 3 ? "Average" : rating === 2 ? "Below" : "Poor"}</div>
        </div>;
      })}
    </div>
    {journey.error ? <p className="receipt-feedback">{journey.error}</p> : null}
    {journey.reviewFeedback ? <p className="receipt-feedback">{journey.reviewFeedback}</p> : null}
    {eligibleAppointment ? <div className="appointment-surface-card">
      <h3>Leave a review for {doctor?.display_name || "this doctor"}</h3>
      <div className="review-star-picker">
        {[1, 2, 3, 4, 5].map((rating) => <button key={rating} className={journey.reviewDraft.rating >= rating ? "active" : ""} type="button" onClick={() => onReviewDraftChange("rating", rating)}>★</button>)}
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
          <div className="review-rating-pill">★ {Number(review.rating || 0).toFixed(1)}</div>
        </div>
        <p>{review.review_text || "Verified completed appointment."}</p>
      </article>) : <div className="empty-card compact-empty"><div className="card-title">No reviews yet.</div></div>}
    </div>
  </section>;
}

function AppointmentSection({ title, items, tone, doctors }) {
  return <section className="customer-list-shell">
    <div className="customer-panel-head">
      <div>
        <span className="customer-section-kicker">Appointment</span>
        <h2>{title}</h2>
      </div>
    </div>
    <div className="customer-appointment-list">
      {items.length ? items.map((appointment) => {
        const doctor = doctors.find((item) => Number(item.user_id || item.id) === Number(appointment.doctor_user_id));
        return <article className={`customer-appointment-card ${tone}`} key={appointment.id}>
          <div className="customer-order-icon"><DashboardIcon name="appointment" /></div>
          <div className="customer-appointment-copy">
            <div className="card-title">{titleCase(appointment.type || "consultation")}</div>
            <div className="card-desc">{shortDate(appointment.start_at, true)}</div>
            <div className="customer-meta-line">{doctor?.display_name || `Doctor #${appointment.doctor_user_id}`}</div>
          </div>
          <span className={`status-badge ${appointment.payment_status === "paid" || appointment.status === "completed" ? "success" : "warning"}`}>{titleCase(appointment.status)}</span>
        </article>;
      }) : <div className="empty-card compact-empty"><div className="card-title">No appointments in this section.</div></div>}
    </div>
  </section>;
}

function ProfilePage({ profile, orders, appointments, doctors, onLogout }) {
  const rows = [
    ["Display name", profile.display_name || "Customer"],
    ["Email address", profile.email || "No email available"],
    ["Orders placed", String(orders.length)],
    ["Appointments booked", String(appointments.length)],
    ["Doctors in dashboard", String(doctors.length)]
  ];

  return <div className="customer-dashboard-stack">
    <section className="customer-profile-hero">
      <div className="avatar">{initials(profile.display_name || "Customer")}</div>
      <div>
        <span className="customer-section-kicker">My Profile</span>
        <h2>{profile.display_name || "Customer"}</h2>
        <p className="customer-hero-text">Profile details currently sync from your Nevari customer account.</p>
      </div>
      <button className="pill-button danger" type="button" onClick={onLogout}>Logout</button>
    </section>
    <section className="customer-profile-grid">
      {rows.map(([label, value]) => <article className="customer-profile-card" key={label}>
        <span>{label}</span>
        <strong>{value}</strong>
      </article>)}
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
  const firstItemName = order.items?.[0]?.name;
  if (firstItemName) {
    return firstItemName;
  }
  return `Order #${order.number}`;
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
