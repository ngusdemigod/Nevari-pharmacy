"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { apiRequest, hydrateStoredSession, money, monthGrid, shortDate, titleCase } from "./components/role-dashboard-utils";

const pages = ["overview", "consultations", "orders", "products", "patients", "profile"];

export default function DoctorDashboard() {
  const router = useRouter();
  const [page, setPage] = useState("overview");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [state, setState] = useState({ error: "", dashboard: null, appointments: [], orders: [], products: [], patients: [], doctor: null });

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
    Promise.all([
      apiRequest(session, "/dashboard/doctor"),
      apiRequest(session, "/appointments", { params: { per_page: 100 } }),
      apiRequest(session, "/orders", { params: { per_page: 100 } }),
      apiRequest(session, `/doctors/${doctorId}/products`),
      apiRequest(session, `/doctors/${doctorId}/patients`),
      apiRequest(session, `/doctors/${doctorId}`)
    ]).then(([dashboard, appointments, orders, products, patients, doctor]) => setState({ error: "", dashboard, appointments, orders, products, patients, doctor }))
      .catch((error) => setState((prev) => ({ ...prev, error: error.message })));
  }, [router]);

  const appointmentDates = useMemo(() => new Set(state.appointments.map((item) => String(item.start_at || "").slice(0, 10))), [state.appointments]);
  const visibleAppointments = state.appointments.filter((item) => String(item.start_at || "").slice(0, 10) === selectedDate.toISOString().slice(0, 10));
  return <RoleShell title="Nevari Doctor" pages={pages} active={page} onPageChange={setPage}>
    {state.error ? <p className="receipt-feedback">{state.error}</p> : null}
    {page === "overview" ? <DoctorOverview doctor={state.doctor} dashboard={state.dashboard} appointments={state.appointments} orders={state.orders} patients={state.patients} /> : null}
    {page === "consultations" ? <CalendarTable selectedDate={selectedDate} onSelect={setSelectedDate} markedDates={appointmentDates} rows={visibleAppointments} actor="Customer" field="patient_user_id" /> : null}
    {page === "orders" ? <TablePanel title="Assigned Orders" rows={state.orders} columns={["Order", "Customer", "Total", "Status"]} render={(item) => [`#${item.number}`, item.customer_id || "Guest", money(item.total, item.currency), titleCase(item.status)]} /> : null}
    {page === "products" ? <TablePanel title="Assigned Products" rows={state.products} columns={["Product", "Categories", "Price", "Stock"]} render={(item) => [item.name, (item.categories || []).join(", "), money(item.price, item.currency), item.stock_quantity ?? "n/a"]} /> : null}
    {page === "patients" ? <TablePanel title="Customers" rows={state.patients} columns={["Customer", "Email", "First linked", "Last interaction"]} render={(item) => [item.display_name, item.email, shortDate(item.first_linked_at), shortDate(item.last_interaction_at)]} /> : null}
    {page === "profile" ? <section className="panel role-profile"><h2>{state.doctor?.display_name || "Doctor profile"}</h2><p>{state.doctor?.email || "No email available"}</p><p>{(state.doctor?.specialties || []).join(", ") || "General practice"}</p></section> : null}
  </RoleShell>;
}

export function CalendarTable({ selectedDate, onSelect, markedDates, rows, actor, field }) {
  return <section className="role-split"><aside className="panel role-calendar-panel"><div className="panel-header"><h2>{selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</h2></div><div className="calendar-widget">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}{monthGrid(selectedDate, markedDates).map((day) => <button className={`calendar-day ${day.muted ? "muted-day" : ""} ${day.selected ? "active" : ""} ${day.marked ? "has-appointment" : ""}`} key={day.key} onClick={() => onSelect(new Date(`${day.key}T12:00:00`))}>{day.day}</button>)}</div></aside><TablePanel title="Appointments" rows={rows} columns={[actor, "Type", "Starts", "Status"]} render={(item) => [item[field], titleCase(item.type), shortDate(item.start_at, true), titleCase(item.status)]} /></section>;
}

export function TablePanel({ title, rows, columns, render }) {
  return <section className="table-panel"><div className="panel-header"><h2>{title}</h2></div><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}>{render(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="muted">No records found.</td></tr>}</tbody></table></div></section>;
}

function DoctorOverview({ doctor, dashboard, appointments, orders, patients }) {
  const upcoming = appointments.slice(0, 3);
  const categories = doctor?.product_categories || [];

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
        <button className="icon-btn small" type="button"><span className="mobile-icon-search" /></button>
        <button className="icon-btn small" type="button"><span className="dot" /><span className="mobile-icon-bell" /></button>
      </div>
    </div>

    <div className="tiny-title">Today</div>
    <div className="category-grid doctor-category-grid">
      {[
        ["Appointments today", dashboard?.appointments_today || 0],
        ["Requested", dashboard?.appointments_requested || 0],
        ["Orders", orders.length],
        ["Customers", patients.length]
      ].map(([label, value], index) => <div className="category-card" key={label}>
        <div className={`category-icon ${["green", "yellow", "lilac", "blue"][index]}`}><span>{value}</span></div>
        <div>
          <div className="category-meta">{value} total</div>
          <div className="category-name">{label}</div>
        </div>
      </div>)}
    </div>

    <div className="tiny-title">Upcoming consultations</div>
    <div className="doctor-list">
      {upcoming.length ? upcoming.map((item, index) => <div className="doctor-card" key={item.id}>
        <div className="doctor-head">
          <div className={`avatar doctor-${["one", "two", "three"][index]}`}>{initials(item.patient_user_id || "Customer")}</div>
          <div>
            <h4>{item.patient_user_id || "Customer"}</h4>
            <p>{titleCase(item.type || "consultation")}</p>
          </div>
          <span className="status-badge success mobile-push">{titleCase(item.status)}</span>
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
        <button className="register-pill" type="button"><span className="round">+</span>Manage</button>
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
