"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, hydrateStoredSession, money, shortDate, titleCase } from "./components/role-dashboard-utils";
import { RoleShell } from "./_doctor-dashboard";

const pages = ["overview", "orders", "appointment", "profile"];
const pageLabels = {
  overview: "Overview",
  orders: "Orders",
  appointment: "Appointment",
  profile: "My Profile"
};

export default function CustomerDashboard() {
  const router = useRouter();
  const [page, setPage] = useState("overview");
  const [state, setState] = useState({ error: "", dashboard: null, orders: [], appointments: [], doctors: [], doctorsUnavailable: false });
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [storeUrl, setStoreUrl] = useState("#");

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
    if (!session.accessToken || !roles.includes("customer")) {
      router.replace("/login");
      return;
    }
    Promise.allSettled([
      apiRequest(session, "/dashboard/patient"),
      apiRequest(session, "/orders", { params: { per_page: 100 } }),
      apiRequest(session, "/appointments", { params: { per_page: 100 } }),
      apiRequest(session, "/doctors", { params: { per_page: 100 }, suppressHttpError: true })
    ]).then(([dashboardResult, ordersResult, appointmentsResult, doctorsResult]) => {
      const fallbackProfile = {
        id: session.user?.id || null,
        email: session.user?.email || "",
        display_name: session.user?.display_name || session.user?.name || "Customer",
        roles: session.user?.roles || []
      };
      setState({
        error: "",
        dashboard: dashboardResult.status === "fulfilled" ? dashboardResult.value : { profile: fallbackProfile },
        orders: ordersResult.status === "fulfilled" ? ordersResult.value : [],
        appointments: appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [],
        doctors: doctorsResult.status === "fulfilled" ? doctorsResult.value || [] : [],
        doctorsUnavailable: doctorsResult.status !== "fulfilled" || doctorsResult.value === null
      });
    });
  }, [router]);

  const profile = state.dashboard?.profile || {};
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
      .slice(0, 6);
  }, [doctorIds, state.doctors]);
  const orderCounts = useMemo(() => ({
    total: state.orders.length,
    pending: state.orders.filter((order) => order.status === "pending").length,
    processing: state.orders.filter((order) => order.status === "processing").length,
    completed: state.orders.filter((order) => order.status === "completed").length
  }), [state.orders]);
  const now = Date.now();
  const sortedAppointments = useMemo(() => [...state.appointments].sort((left, right) => new Date(left.start_at || 0) - new Date(right.start_at || 0)), [state.appointments]);
  const upcomingAppointments = sortedAppointments.filter((appointment) => new Date(appointment.start_at || 0).getTime() >= now);
  const pastAppointments = [...sortedAppointments.filter((appointment) => new Date(appointment.start_at || 0).getTime() < now)].reverse();

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

  return <RoleShell
    title="Nevari Customer"
    pages={pages}
    active={page}
    onPageChange={setPage}
    showHeader={page !== "overview"}
    topContent={<CustomerAppHeader profile={profile} />}
    pageLabels={pageLabels}
    renderNavIcon={renderDashboardIcon}
  >
    {state.error ? <p className="receipt-feedback">{state.error}</p> : null}
    {page === "overview" ? <CustomerOverview
      profile={profile}
      doctors={doctors}
      doctorsUnavailable={state.doctorsUnavailable}
      orders={state.orders}
      appointments={state.appointments}
      orderCounts={orderCounts}
      onOpenPage={setPage}
      storeUrl={storeUrl}
    /> : null}
    {page === "orders" ? <OrdersPage
      orders={state.orders}
      counts={orderCounts}
      expandedOrderId={expandedOrderId}
      onToggleOrder={(id) => setExpandedOrderId((current) => current === id ? null : id)}
      onDownloadOrderPdf={downloadOrderPdf}
      onCancelPendingOrder={cancelPendingOrder}
    /> : null}
    {page === "appointment" ? <AppointmentPage upcoming={upcomingAppointments} past={pastAppointments} doctors={state.doctors} /> : null}
    {page === "profile" ? <ProfilePage profile={profile} orders={state.orders} appointments={state.appointments} doctors={doctors} /> : null}
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

function CustomerOverview({ profile, doctors, doctorsUnavailable, orders, appointments, orderCounts, onOpenPage, storeUrl }) {
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
        meta: `${money(order.total, order.currency)} · ${titleCase(order.status)}`,
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
        meta: doctor.email || (doctor.specialties?.join(", ") || "Available doctor"),
        page: "overview"
      }));

    return [...orderMatches, ...appointmentMatches, ...doctorMatches].slice(0, 8);
  }, [appointments, doctors, orders, query]);

  const appointmentCards = [...appointments]
    .sort((left, right) => new Date(left.start_at || 0) - new Date(right.start_at || 0))
    .slice(0, 5);

  const bookingDoctors = doctors.slice(0, 3);
  const bookingProfiles = [
    { specialty: "Cardiologist", experience: "8 years exp", rating: "4.9", fee: "NGN 25,000", availability: "Available Now" },
    { specialty: "General Physician", experience: "6 years exp", rating: "4.7", fee: "NGN 18,500", availability: "Available Now" },
    { specialty: "Dermatologist", experience: "5 years exp", rating: "4.8", fee: "NGN 20,000", availability: "Available Today" }
  ];

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
        onOpenPage(result.page);
      }}>
        <strong>{result.label}</strong>
        <span>{result.meta}</span>
      </button>) : <div className="booking-search-empty">No matching order, appointment, or doctor found.</div>}
    </div> : null}

    <div className="category-row">
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
          <span className="status-badge success">{titleCase(appointment.status)}</span>
        </article>)}
      </div>
    </div> : <div className="empty-card compact-empty mobile-gap-bottom"><div className="card-title">No appointment yet</div></div>}

    <div className="tiny-title">Nevari doctors</div>
    <div className="booking-list desktop-booking-list">
      {bookingDoctors.length ? bookingDoctors.map((doctor, index) => {
        const profileCard = bookingProfiles[index] || bookingProfiles[bookingProfiles.length - 1];
        return <div className="booking-card" key={doctor.user_id || doctor.id}>
          <div className="booking-row">
            <div className="booking-avatar">{initials(doctor.display_name || "Doctor")}</div>
            <div className="booking-meta">
              <h4>{doctor.display_name || "Doctor"}</h4>
              <p>{doctor.specialties?.[0] || profileCard.specialty} · {profileCard.experience}</p>
            </div>
            <span className="booking-pill">* {profileCard.rating}</span>
          </div>
          <div className="booking-stat-split">
            <div className="booking-stat"><strong>{profileCard.availability}</strong><span>Video consult</span></div>
            <div className="booking-stat"><strong>{profileCard.fee}</strong><span>Consultation fee</span></div>
          </div>
          <button className="booking-btn" type="button" onClick={() => onOpenPage("appointment")}>Book appointment</button>
        </div>;
      }) : <div className="empty-card"><div className="card-title">{doctorsUnavailable ? "Doctor directory is temporarily unavailable" : "No available doctors for booking yet"}</div></div>}
    </div>
  </>;
}

function OrdersPage({ orders, counts, expandedOrderId, onToggleOrder, onDownloadOrderPdf, onCancelPendingOrder }) {
  const orderedRows = [...orders].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  const stats = [
    ["Total", counts.total],
    ["Pending", counts.pending],
    ["Processing", counts.processing],
    ["Completed", counts.completed]
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
          return <article className={`customer-order-card ${isExpanded ? "expanded" : ""}`} key={order.id}>
            <button className="customer-order-summary" type="button" onClick={() => onToggleOrder(order.id)}>
              <div className="customer-order-main">
                <div className="customer-order-icon"><DashboardIcon name="orders" /></div>
                <div>
                  <div className="card-title">Order #{order.number}</div>
                  <div className="card-desc">{shortDate(order.created_at, true)}</div>
                </div>
              </div>
              <div className="customer-order-side">
                <strong>{money(order.total, order.currency)}</strong>
                <span className={`status-badge ${order.status === "completed" ? "success" : "warning"}`}>{titleCase(order.status)}</span>
              </div>
            </button>
            {isExpanded ? <div className="customer-order-detail">
              <div className="customer-order-detail-grid">
                <div><span>Payment</span><strong>{titleCase(order.payment_status || order.status)}</strong></div>
                <div><span>Items</span><strong>{order.totals?.items_quantity || 0}</strong></div>
                <div><span>Doctor</span><strong>{order.assigned_doctor?.display_name || "Not assigned"}</strong></div>
                <div><span>Prescription</span><strong>{order.prescription_id || "None"}</strong></div>
              </div>
              <div className="toolbar customer-order-actions">
                <button className="pill-button" type="button" onClick={() => onDownloadOrderPdf(order)}>Download PDF</button>
                {order.status === "pending" ? <button className="pill-button danger" type="button" onClick={() => onCancelPendingOrder(order)}>Cancel order</button> : null}
              </div>
            </div> : null}
          </article>;
        }) : <div className="empty-card"><div className="card-title">No orders found.</div></div>}
      </div>
    </section>
  </div>;
}

function AppointmentPage({ upcoming, past, doctors }) {
  return <div className="customer-dashboard-stack">
    <AppointmentSection title="Upcoming appointments" items={upcoming} tone="upcoming" doctors={doctors} />
    <AppointmentSection title="Past appointments" items={past} tone="past" doctors={doctors} />
  </div>;
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
          <span className={`status-badge ${appointment.status === "completed" ? "success" : "warning"}`}>{titleCase(appointment.status)}</span>
        </article>;
      }) : <div className="empty-card compact-empty"><div className="card-title">No appointments in this section.</div></div>}
    </div>
  </section>;
}

function ProfilePage({ profile, orders, appointments, doctors }) {
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
