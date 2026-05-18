"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, buildUrl, describeDashboardFetchError, hydrateStoredSession, money, monthGrid, shortDate, titleCase } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";

const pages = ["overview", "consultations", "reviews", "availability", "orders", "products", "patients", "profile"];
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export default function DoctorDashboard() {
  const router = useRouter();
  const [page, setPage] = useState("overview");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [state, setState] = useState({
    error: "",
    dashboard: null,
    appointments: [],
    orders: [],
    products: [],
    patients: [],
    doctor: null,
    reviews: null,
    availability: {}
  });
  const [availabilityDraft, setAvailabilityDraft] = useState({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityFeedback, setAvailabilityFeedback] = useState("");
  const [appointmentFeedback, setAppointmentFeedback] = useState("");

  useEffect(() => {
    const section = titleCase(page);
    setDocumentMetadata(`Nevari Doctor | ${section}`, `${section} view for the Nevari Doctor dashboard.`);
  }, [page]);

  useEffect(() => {
    const session = hydrateStoredSession("doctor");
    if (!session.paired) {
      router.replace(FRONTENDS.admin.setupPath);
      return;
    }
    const doctorId = session.user?.id;
    const roles = session.user?.roles || [];
    if (!session.accessToken || !doctorId || !roles.includes("doctor")) {
      router.replace("/admin/doctor/login");
      return;
    }
    void loadDashboard(session, doctorId);
  }, [router]);

  async function loadDashboard(session = hydrateStoredSession("doctor"), doctorId = session.user?.id) {
    if (!doctorId) {
      return;
    }
    try {
      const results = await Promise.allSettled([
        apiRequest(session, "/dashboard/doctor"),
        apiRequest(session, "/appointments", { params: { per_page: 100 } }),
        apiRequest(session, "/orders", { params: { per_page: 100 } }),
        apiRequest(session, `/doctors/${doctorId}/products`),
        apiRequest(session, `/doctors/${doctorId}/patients`),
        apiRequest(session, `/doctors/${doctorId}`),
        apiRequest(session, `/doctors/${doctorId}/reviews`),
        apiRequest(session, `/doctors/${doctorId}/availability`)
      ]);
      const errors = results
        .filter((result) => result.status === "rejected")
        .map((result) => describeDashboardFetchError(result.reason));
      const availability = results[7].status === "fulfilled" ? normalizeAvailability(results[7].value?.availability || {}) : {};
      setState({
        error: errors[0] || "",
        dashboard: results[0].status === "fulfilled" ? results[0].value : null,
        appointments: results[1].status === "fulfilled" ? results[1].value : [],
        orders: results[2].status === "fulfilled" ? results[2].value : [],
        products: results[3].status === "fulfilled" ? results[3].value : [],
        patients: results[4].status === "fulfilled" ? results[4].value : [],
        doctor: results[5].status === "fulfilled" ? results[5].value : null,
        reviews: results[6].status === "fulfilled" ? results[6].value : null,
        availability
      });
      setAvailabilityDraft(availability);
    } catch {
      setState((prev) => ({ ...prev, error: "The dashboard could not be loaded right now." }));
    }
  }

  async function handleAppointmentAction(appointmentId, action, body = {}) {
    const session = hydrateStoredSession("doctor");
    setAppointmentFeedback("");
    try {
      await apiRequest(session, `/appointments/${appointmentId}/${action}`, {
        method: "POST",
        body
      });
      setAppointmentFeedback(action === "confirm" ? "Appointment confirmed." : "Appointment completed.");
      await loadDashboard(session, session.user?.id);
    } catch (error) {
      setAppointmentFeedback(error?.message || "The appointment update failed.");
    }
  }

  async function saveAvailability() {
    const session = hydrateStoredSession("doctor");
    const doctorId = session.user?.id;
    if (!doctorId) {
      return;
    }
    setSavingAvailability(true);
    setAvailabilityFeedback("");
    try {
      const sanitized = normalizeAvailability(availabilityDraft);
      await apiRequest(session, `/doctors/${doctorId}/availability`, {
        method: "PUT",
        body: { availability: sanitized }
      });
      setAvailabilityFeedback("Availability updated.");
      await loadDashboard(session, doctorId);
    } catch (error) {
      setAvailabilityFeedback(error?.message || "Availability could not be saved.");
    } finally {
      setSavingAvailability(false);
    }
  }

  function handleLogout() {
    const session = hydrateStoredSession("doctor");
    clearSessionAuth(FRONTENDS.doctor, session);
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

  return <RoleShell title="Nevari Doctor" pages={pages} active={page} onPageChange={setPage}>
    {state.error ? <p className="receipt-feedback">{state.error}</p> : null}
    {page === "overview" ? <DoctorOverview
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
    /> : null}
    {page === "consultations" ? <ConsultationsPage
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      markedDates={appointmentDates}
      rows={visibleAppointments}
      appointmentFeedback={appointmentFeedback}
      onConfirm={(appointmentId) => handleAppointmentAction(appointmentId, "confirm")}
      onComplete={(appointmentId) => handleAppointmentAction(appointmentId, "complete")}
    /> : null}
    {page === "reviews" ? <ReviewsPage doctor={state.doctor} summary={reviewSummary} reviews={reviews} /> : null}
    {page === "availability" ? <AvailabilityPage
      availabilityDraft={availabilityDraft}
      onChange={setAvailabilityDraft}
      onSave={saveAvailability}
      saving={savingAvailability}
      feedback={availabilityFeedback}
    /> : null}
    {page === "orders" ? <TablePanel title="Assigned Orders" rows={state.orders} columns={["Order", "Customer", "Total", "Status"]} render={(item) => [`#${item.number}`, item.customer_id || "Guest", money(item.total, item.currency || storeCurrency), titleCase(item.status)]} /> : null}
    {page === "products" ? <TablePanel title="Assigned Products" rows={state.products} columns={["Product", "Categories", "Price", "Stock"]} render={(item) => [item.name, (item.categories || []).join(", "), money(item.price, item.currency || storeCurrency), item.stock_quantity ?? "n/a"]} /> : null}
    {page === "patients" ? <TablePanel title="Customers" rows={state.patients} columns={["Customer", "Email", "First linked", "Last interaction"]} render={(item) => [item.display_name, item.email, shortDate(item.first_linked_at), shortDate(item.last_interaction_at)]} /> : null}
    {page === "profile" ? <ProfilePage doctor={state.doctor} estimatedRevenue={estimatedRevenue} storeCurrency={storeCurrency} onLogout={handleLogout} /> : null}
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

export function TablePanel({ title, rows, columns, render }) {
  return <section className="table-panel"><div className="panel-header"><h2>{title}</h2></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}>{render(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="muted">No records found.</td></tr>}</tbody></table></div></section>;
}

function DoctorOverview({ doctor, dashboard, appointments, orders, patients, reviews, reviewSummary, estimatedRevenue, storeCurrency, onOpenConsultations, onOpenReviews }) {
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

    <div className="tiny-title">Clinical profile</div>
    <div className="plan-card purple">
      <div className="mini-person">
        <div className="avatar doctor-one">{initials(doctor?.display_name || "Doctor")}</div>
        <div><h4>{doctor?.display_name || "Doctor"}</h4><p>{doctor?.email || "No email available"}</p></div>
      </div>
      <h3 className="plan-title">{(doctor?.specialties || []).join(", ") || "General practice"}</h3>
      <div className="plan-footer">
        <span className="price">{categories.length} categories</span>
        <button className="register-pill" type="button" onClick={onOpenReviews}><span className="round">★</span>Reviews</button>
      </div>
      <div className="doctor-figure female" />
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
  const visibleNavPages = navPages.slice(0, 4);
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
