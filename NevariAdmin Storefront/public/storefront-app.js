const STORAGE_KEY = "nevari_admin_storefront_session";
const API_NAMESPACE = "nevari/v1";
const FRONTEND_TYPE = "storefront";

const state = {
  session: {
    baseUrl: "",
    frontendType: FRONTEND_TYPE,
    frontendOrigin: window.location.origin === "null" ? "null" : window.location.origin,
    frontendUrl: window.location.origin === "null" ? "null" : window.location.href,
    paired: false,
    siteName: "",
    siteLogo: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  },
  audit: {
    category: "orders",
    status: "all",
    source: "all",
    search: ""
  },
  data: {
    dashboard: null,
    orders: [],
    orderDetails: [],
    appointments: [],
    prescriptions: [],
    prescriptionDetails: [],
    prescriptionHistory: [],
    emails: [],
    doctors: [],
    products: [],
    auditEvents: []
  },
  searchTimer: null,
  currentPage: "overview"
};

const refs = {
  queueTableBody: document.getElementById("queueTableBody"),
  appointmentColumns: document.getElementById("appointmentColumns"),
  historyList: document.getElementById("historyList"),
  emailLogBody: document.getElementById("emailLogBody"),
  auditTabs: document.getElementById("auditTabs"),
  auditTableBody: document.getElementById("auditTableBody"),
  auditDetail: document.getElementById("auditDetail"),
  auditStatusFilter: document.getElementById("auditStatusFilter"),
  auditSourceFilter: document.getElementById("auditSourceFilter"),
  globalSearch: document.getElementById("globalSearch"),
  navToggle: document.getElementById("navToggle"),
  sidebar: document.getElementById("sidebar"),
  connectButton: document.getElementById("connectButton"),
  connectionLabel: document.getElementById("connectionLabel"),
  syncStatus: document.getElementById("syncStatus"),
  currentUserName: document.getElementById("currentUserName"),
  currentUserRole: document.getElementById("currentUserRole"),
  authGate: document.getElementById("authGate"),
  setupStage: document.getElementById("setupStage"),
  authStage: document.getElementById("authStage"),
  setupForm: document.getElementById("setupForm"),
  setupFrontendType: document.getElementById("setupFrontendType"),
  setupPairingCode: document.getElementById("setupPairingCode"),
  setupPreview: document.getElementById("setupPreview"),
  setupSubmit: document.getElementById("setupSubmit"),
  setupFeedback: document.getElementById("setupFeedback"),
  authForm: document.getElementById("authForm"),
  configuredApiRoot: document.getElementById("configuredApiRoot"),
  wpUsername: document.getElementById("wpUsername"),
  wpPassword: document.getElementById("wpPassword"),
  authSubmit: document.getElementById("authSubmit"),
  logoutButton: document.getElementById("logoutButton"),
  authFeedback: document.getElementById("authFeedback"),
  revenueChart: document.getElementById("revenueChart"),
  heroOrdersCount: document.getElementById("heroOrdersCount"),
  heroOrdersLabel: document.getElementById("heroOrdersLabel"),
  heroRxCount: document.getElementById("heroRxCount"),
  heroRxLabel: document.getElementById("heroRxLabel"),
  salesMetricValue: document.getElementById("salesMetricValue"),
  salesMetricNote: document.getElementById("salesMetricNote"),
  appointmentsMetricValue: document.getElementById("appointmentsMetricValue"),
  appointmentsMetricNote: document.getElementById("appointmentsMetricNote"),
  rxMetricValue: document.getElementById("rxMetricValue"),
  rxMetricNote: document.getElementById("rxMetricNote"),
  emailMetricValue: document.getElementById("emailMetricValue"),
  emailMetricNote: document.getElementById("emailMetricNote"),
  mixTotalValue: document.getElementById("mixTotalValue"),
  operationsLegend: document.getElementById("operationsLegend"),
  catalogStats: document.getElementById("catalogStats"),
  catalogStatsPage: document.getElementById("catalogStatsPage"),
  teamStats: document.getElementById("teamStats"),
  teamStatsPage: document.getElementById("teamStatsPage"),
  emailStats: document.getElementById("emailStats"),
  emailStatsPage: document.getElementById("emailStatsPage"),
  pageViews: document.querySelectorAll(".page-view")
};

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    state.session = { ...state.session, ...parsed };
  } catch (error) {
    console.error("Could not load stored session", error);
  }
}

function persistSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
}

function clearAuthSession() {
  state.session.accessToken = "";
  state.session.refreshToken = "";
  state.session.expiresAt = 0;
  state.session.user = null;
  persistSession();
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePairingCode(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/NV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9]+/i);
  return match ? match[0] : raw;
}

function decodePairingBaseUrl(pairingCode) {
  const normalizedCode = normalizePairingCode(pairingCode);
  const parts = normalizedCode.split(".");
  if (parts.length < 3) {
    throw new Error("Pairing code is incomplete. Paste the full code from WordPress.");
  }

  const [version, encodedBaseUrl, secret] = parts;
  if (version.toUpperCase() !== "NV1" || !encodedBaseUrl || !secret) {
    throw new Error("Pairing code format is invalid.");
  }

  const base64 = encodedBaseUrl.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  let decoded;

  try {
    decoded = atob(padded);
  } catch (error) {
    throw new Error("Pairing code format is invalid. Generate a new code and paste it exactly as shown in WordPress.");
  }

  const baseUrl = normalizeBaseUrl(decoded);
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("Pairing code did not contain a valid pharmacy URL.");
  }

  return baseUrl;
}

function apiRoot() {
  return `${normalizeBaseUrl(state.session.baseUrl)}/wp-json/${API_NAMESPACE}`;
}

function buildUrl(path, params = {}) {
  const url = new URL(`${apiRoot()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function frontendContext() {
  return {
    frontend_type: state.session.frontendType,
    frontend_origin: state.session.frontendOrigin,
    frontend_url: state.session.frontendUrl
  };
}

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function describeRequestError(error) {
  const message = String(error?.message || "");
  if (!message || message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.") {
    if (isFileProtocol()) {
      return "Network request failed. This storefront is being opened with file://, which often breaks WordPress API requests. Serve this folder over http://localhost and verify the pharmacy CORS settings allow that origin.";
    }
    return "Network request failed. Verify the pharmacy URL is reachable and that the Nevari WordPress plugin allows this frontend origin.";
  }
  return message;
}

function extractApiErrorMessage(payload) {
  if (payload?.error?.message) {
    return String(payload.error.message);
  }
  if (payload?.message) {
    return String(payload.message);
  }
  return "";
}

function isRouteMissingPayload(payload) {
  return payload?.code === "rest_no_route" || payload?.error?.code === "rest_no_route";
}

function setSyncStatus(text, mode = "") {
  refs.syncStatus.textContent = text;
  refs.syncStatus.classList.remove("live", "error");
  if (mode) {
    refs.syncStatus.classList.add(mode);
  }
}

function setSetupFeedback(text) {
  refs.setupFeedback.textContent = text;
}

function setAuthFeedback(text) {
  refs.authFeedback.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateConnectionPreview() {
  const pairingCode = refs.setupPairingCode?.value || "";
  let baseUrl = state.session.baseUrl || "";

  if (pairingCode) {
    try {
      baseUrl = decodePairingBaseUrl(pairingCode);
    } catch (error) {
      refs.setupPreview.textContent = "Pairing code format is invalid.";
      refs.configuredApiRoot.textContent = state.session.paired
        ? `${state.session.siteName || "Paired pharmacy"} • ${apiRoot()}`
        : "Not paired";
      return;
    }
  }
  refs.setupPreview.textContent = baseUrl
    ? `${baseUrl}/wp-json/${API_NAMESPACE}/connections/verify`
    : "https://example.com/wp-json/nevari/v1/connections/verify";
  refs.configuredApiRoot.textContent = state.session.paired
    ? `${state.session.siteName || "Paired pharmacy"} • ${apiRoot()}`
    : "Not paired";
}

function updateUserUI() {
  const user = state.session.user;
  refs.connectionLabel.textContent = state.session.paired ? "Connection" : "Pair Storefront";
  refs.currentUserName.textContent = user?.display_name || state.session.siteName || "Disconnected";
  refs.currentUserRole.textContent = user?.roles?.join(", ") || (state.session.paired ? "Paired frontend" : "WordPress pairing required");
  refs.setupFrontendType.value = state.session.frontendType;
  refs.wpUsername.value = state.session.user?.email || "";
  updateConnectionPreview();
}

function switchPage(pageId) {
  state.currentPage = pageId;
  refs.pageViews.forEach((view) => {
    view.classList.toggle("active", view.dataset.page === pageId);
  });
}

function setAppLocked(locked) {
  document.body.classList.toggle("auth-locked", locked);
}

function showAuthGate(stage = "auth") {
  refs.authGate.hidden = false;
  refs.setupStage.hidden = stage !== "setup";
  refs.authStage.hidden = stage !== "auth";
  setAppLocked(true);
}

function hideAuthGate() {
  refs.authGate.hidden = true;
  setAppLocked(false);
}

function formatMoney(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDate(value, withTime = false) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined
  }).format(date);
}

function toneClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["success", "fulfilled", "completed", "sent", "processing", "released", "trusted", "confirmed"].includes(normalized)) {
    return "success";
  }
  if (["error", "failed", "cancelled", "invalid", "forbidden"].includes(normalized)) {
    return "error";
  }
  if (["warning", "on_hold", "on-hold", "pending", "draft", "requested", "issued", "assigned_to_patient", "expired"].includes(normalized)) {
    return "warning";
  }
  return "info";
}

function patientLabel(userId) {
  return userId ? `Customer #${userId}` : "Guest checkout";
}

function doctorNameMap() {
  return new Map((state.data.doctors || []).map((doctor) => [doctor.user_id || doctor.id, doctor.display_name]));
}

async function apiRequest(path, { method = "GET", body, params = {}, auth = true, retry = true } = {}) {
  if (!state.session.baseUrl) {
    throw new Error("WordPress base URL is not configured.");
  }

  if (auth && state.session.refreshToken && Date.now() > (Number(state.session.expiresAt) - 30_000)) {
    await refreshSession();
  }

  const headers = {
    Accept: "application/json",
    "X-Nevari-Frontend-Type": state.session.frontendType,
    "X-Nevari-Frontend-Origin": state.session.frontendOrigin
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth && state.session.accessToken) {
    headers.Authorization = `Bearer ${state.session.accessToken}`;
  }

  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new Error(describeRequestError(error));
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (response.status === 404) {
      throw new Error(`API route not found: ${path}. Verify the live WordPress site has the latest Nevari plugin with this endpoint enabled.`);
    }
    throw new Error("Unexpected API response.");
  }

  if ((response.status === 401 || response.status === 403) && auth && retry && state.session.refreshToken) {
    await refreshSession();
    return apiRequest(path, { method, body, params, auth, retry: false });
  }

  if (!response.ok || !payload?.success) {
    const message = extractApiErrorMessage(payload);
    if (response.status === 404 && isRouteMissingPayload(payload)) {
      throw new Error(`API route not found: ${path}. Verify the live WordPress site has the latest Nevari plugin with this endpoint enabled.`);
    }
    throw new Error(message || `Request failed with status ${response.status}.`);
  }

  return payload;
}

async function refreshSession() {
  const payload = await apiRequest("/auth/refresh", {
    method: "POST",
    auth: false,
    body: {
      refresh_token: state.session.refreshToken,
      ...frontendContext()
    }
  });
  hydrateAuthSession(payload.data);
}

function hydrateAuthSession(data) {
  state.session.accessToken = data.access_token;
  state.session.refreshToken = data.refresh_token;
  state.session.expiresAt = Date.now() + (Number(data.expires_in || 0) * 1000);
  state.session.user = data.user || null;
  persistSession();
  updateUserUI();
}

async function verifyAndRegisterPairing(baseUrl, pairingCode) {
  state.session.baseUrl = normalizeBaseUrl(baseUrl);
  persistSession();

  const verifyPayload = await apiRequest("/connections/verify", {
    method: "POST",
    auth: false,
    body: {
      pairing_code: pairingCode,
      frontend_type: state.session.frontendType,
      frontend_origin: state.session.frontendOrigin,
      frontend_url: state.session.frontendUrl
    }
  });

  const registerPayload = await apiRequest("/connections/register", {
    method: "POST",
    auth: false,
    body: {
      pairing_session_id: verifyPayload.data.pairing_session_id,
      frontend_type: state.session.frontendType,
      frontend_origin: state.session.frontendOrigin,
      frontend_url: state.session.frontendUrl,
      connection_status: "trusted"
    }
  });

  state.session.paired = true;
  state.session.siteName = registerPayload.data.site_name || verifyPayload.data.site_name || "";
  state.session.siteLogo = registerPayload.data.site_logo || verifyPayload.data.site_logo || "";
  persistSession();
  updateUserUI();
}

async function login(username, password) {
  const payload = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    body: {
      username,
      password,
      ...frontendContext()
    }
  });
  hydrateAuthSession(payload.data);
}

async function logout() {
  try {
    if (state.session.refreshToken && state.session.accessToken) {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: {
          refresh_token: state.session.refreshToken,
          ...frontendContext()
        }
      });
    }
  } catch (error) {
    console.warn(error);
  }
  clearAuthSession();
  updateUserUI();
  setSyncStatus(state.session.paired ? "Paired" : "Disconnected");
  setAuthFeedback("Session cleared.");
  showAuthGate(state.session.paired ? "auth" : "setup");
}

function renderRevenueChart() {
  const orders = state.data.orderDetails || [];
  const now = new Date();
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(now.getDate() - offset);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const total = orders
      .filter((order) => {
        const created = new Date(order.created_at);
        return !Number.isNaN(created.getTime()) && created >= day && created < next;
      })
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    days.push({
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      total
    });
  }

  const max = Math.max(...days.map((day) => day.total), 1);
  const colors = ["#f0c99f", "#ecb3b7", "#d7edb5", "#7dd8cf", "#b1bbeb", "#a2d9da", "#f0c99f"];

  refs.revenueChart.innerHTML = days.map((day, index) => `
    <div class="bar-col">
      <div class="bar-shell">
        <div class="bar-fill" style="height:${Math.max(16, (day.total / max) * 190)}px; background-color:${colors[index]};"></div>
      </div>
      <div class="bar-note">
        <strong>${formatMoney(day.total)}</strong>
        <span>${day.label}</span>
      </div>
    </div>
  `).join("");
}

function renderSummary() {
  const dashboard = state.data.dashboard || {};
  const sales = dashboard.sales || {};
  const consultations = dashboard.consultations || {};
  const prescriptions = dashboard.prescriptions || {};
  const emails = dashboard.emails || {};
  const orderDetails = state.data.orderDetails || [];
  const rxHolds = orderDetails.filter((order) => ["on_hold", "on-hold"].includes(order.rx_status || order.status)).length;
  const appointmentInProgress = Number(consultations.requested || 0) + Number(consultations.confirmed || 0);
  const emailTotal = Number(emails.sent_today || 0) + Number(emails.failed_today || 0);
  const emailFailureRate = emailTotal ? (Number(emails.failed_today || 0) / emailTotal) * 100 : 0;

  refs.heroOrdersCount.textContent = formatNumber(sales.orders_today || 0);
  refs.heroOrdersLabel.textContent = "orders today";
  refs.heroRxCount.textContent = formatNumber(prescriptions.assigned || 0);
  refs.heroRxLabel.textContent = "prescriptions awaiting assignment";
  refs.salesMetricValue.textContent = formatMoney(sales.month || 0);
  refs.salesMetricNote.innerHTML = `<svg><use href="#i-arrow-up-right"></use></svg> ${formatMoney(sales.today || 0)} processed today`;
  refs.appointmentsMetricValue.textContent = formatNumber(appointmentInProgress);
  refs.appointmentsMetricNote.textContent = `${formatNumber(consultations.confirmed || 0)} confirmed and ${formatNumber(consultations.requested || 0)} requested`;
  refs.rxMetricValue.textContent = formatNumber(rxHolds);
  refs.rxMetricNote.textContent = `${formatNumber(prescriptions.draft || 0)} draft and ${formatNumber(prescriptions.expired || 0)} expired`;
  refs.emailMetricValue.textContent = formatPercent(emailFailureRate);
  refs.emailMetricNote.textContent = `${formatNumber(emails.failed_today || 0)} failed of ${formatNumber(emailTotal)} processed today`;

  const legendItems = [
    { color: "teal", label: "Orders awaiting review", value: orderDetails.filter((order) => ["pending", "on-hold"].includes(order.status)).length },
    { color: "rose", label: "Assigned prescriptions", value: prescriptions.assigned || 0 },
    { color: "lime", label: "Completed consultations", value: consultations.completed || 0 },
    { color: "violet", label: "Email failures today", value: emails.failed_today || 0 }
  ];
  refs.mixTotalValue.textContent = formatNumber(legendItems.reduce((sum, item) => sum + Number(item.value), 0));
  refs.operationsLegend.innerHTML = legendItems.map((item) => `
    <div class="legend-item">
      <span class="legend-swatch ${item.color}"></span>
      <div><strong>${item.label}</strong><span>${formatNumber(item.value)}</span></div>
    </div>
  `).join("");
}

function renderCatalogStats() {
  const products = state.data.products || [];
  const total = Math.max(products.length, 1);
  const items = [
    { label: "Prescription needed", value: products.filter((product) => product.pharmacy_rules?.rx_required).length, meterClass: "" },
    { label: "Consultation required", value: products.filter((product) => product.pharmacy_rules?.consultation_required).length, meterClass: "mint-fill" },
    { label: "OTC inventory", value: products.filter((product) => product.pharmacy_rules?.otc).length, meterClass: "lime-fill" },
    { label: "Restricted visibility", value: products.filter((product) => product.pharmacy_rules?.restricted_visibility).length, meterClass: "rose-fill" }
  ];
  const markup = items.map((item) => `
    <div class="stack-row"><span>${item.label}</span><strong>${formatNumber(item.value)}</strong></div>
    <div class="stack-meter ${item.meterClass}"><span style="width:${Math.max(8, (item.value / total) * 100)}%"></span></div>
  `).join("");
  refs.catalogStats.innerHTML = markup;
  if (refs.catalogStatsPage) {
    refs.catalogStatsPage.innerHTML = markup;
  }
}

function renderTeamStats() {
  const doctors = state.data.doctors || [];
  const prescriptions = state.data.prescriptionDetails || [];
  const appointments = state.data.appointments || [];
  const activePatients = new Set([...appointments.map((item) => item.patient_user_id), ...prescriptions.map((item) => item.patient_user_id)].filter(Boolean));
  const items = [
    { label: "Doctors", value: doctors.length, note: `${doctors.filter((doctor) => doctor.accepting_patients).length} accepting patients` },
    { label: "Linked patients", value: activePatients.size, note: "derived from consultations and prescriptions" },
    { label: "Draft prescriptions", value: prescriptions.filter((item) => item.status === "draft").length, note: "awaiting issue review" },
    { label: "Awaiting assignment", value: prescriptions.filter((item) => ["issued", "assigned_to_patient"].includes(item.status)).length, note: "patient notification queue" }
  ];
  const markup = items.map((item) => `
    <div class="mini-stat">
      <span>${item.label}</span>
      <strong>${formatNumber(item.value)}</strong>
      <small>${item.note}</small>
    </div>
  `).join("");
  refs.teamStats.innerHTML = markup;
  if (refs.teamStatsPage) {
    refs.teamStatsPage.innerHTML = markup;
  }
}

function renderEmailStats() {
  const emails = state.data.emails || [];
  const sent = emails.filter((email) => email.status === "sent").length;
  const queued = emails.filter((email) => email.status === "queued").length;
  const failed = emails.filter((email) => email.status === "failed").length;
  const templates = new Set(emails.map((email) => email.template_key).filter(Boolean));
  const items = [
    { label: "Queued", value: queued, note: "appointment and assignment notices" },
    { label: "Sent", value: sent, note: "recent delivery log entries" },
    { label: "Failed", value: failed, note: "provider or recipient issues" },
    { label: "Templates in use", value: templates.size, note: "visible in the current email log" }
  ];
  const markup = items.map((item) => `
    <div class="mini-stat">
      <span>${item.label}</span>
      <strong>${formatNumber(item.value)}</strong>
      <small>${item.note}</small>
    </div>
  `).join("");
  refs.emailStats.innerHTML = markup;
  if (refs.emailStatsPage) {
    refs.emailStatsPage.innerHTML = markup;
  }
}

function renderQueue(search = "") {
  const prescriptionsById = new Map((state.data.prescriptionDetails || []).map((item) => [item.id, item]));
  const query = search.trim().toLowerCase();
  const orders = (state.data.orderDetails || []).filter((order) => {
    const names = (order.items || []).map((item) => item.name).join(" ");
    return `${order.number} ${order.status} ${order.rx_status || ""} ${names}`.toLowerCase().includes(query);
  });

  refs.queueTableBody.innerHTML = orders.length ? orders.map((order) => {
    const prescription = prescriptionsById.get(order.prescription_id);
    return `
      <tr>
        <td><div class="table-title"><strong>#${escapeHtml(order.number)}</strong><span class="muted">${formatDate(order.created_at, true)}</span></div></td>
        <td><div class="table-title"><strong>${escapeHtml(patientLabel(order.customer_id))}</strong><span class="muted">WordPress user ${escapeHtml(order.customer_id || "guest")}</span></div></td>
        <td>${(order.items || []).length ? `${order.items.length} items: ${(order.items || []).slice(0, 2).map((item) => escapeHtml(item.name)).join(", ")}` : "order details unavailable"}</td>
        <td>${prescription ? `${escapeHtml(prescription.prescription_number)} • ${escapeHtml(prescription.status)}` : (order.prescription_id ? `Prescription #${order.prescription_id}` : "No linked prescription")}</td>
        <td><span class="status-pill ${toneClass(order.rx_status || order.status)}">${escapeHtml(order.rx_status || order.status)}</span></td>
        <td>${formatMoney(order.total || 0, order.currency || "USD")}</td>
        <td>${order.rx_status === "on_hold" ? "Release hold" : (order.prescription_id ? "Review linkage" : "Link prescription")}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7" class="muted">No orders match the current search.</td></tr>`;
}

function renderAppointments() {
  const doctors = doctorNameMap();
  const lanes = [
    { key: "requested", label: "Requested" },
    { key: "confirmed", label: "Confirmed" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Escalations", statuses: ["cancelled", "no_show"] }
  ];

  refs.appointmentColumns.innerHTML = lanes.map((lane) => {
    const items = (state.data.appointments || [])
      .filter((item) => lane.statuses ? lane.statuses.includes(item.status) : item.status === lane.key)
      .slice(0, 4);

    return `
      <div class="status-lane">
        <div class="lane-head">
          <div><strong>${lane.label}</strong><div class="muted">${items.length} items</div></div>
          <span class="audit-pill ${toneClass(lane.key)}">${formatNumber(items.length)}</span>
        </div>
        <div class="lane-list">
          ${items.length ? items.map((item) => `
            <div class="lane-card">
              <strong>${escapeHtml(patientLabel(item.patient_user_id))}</strong>
              <small><span>${escapeHtml(doctors.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`)}</span><span>${formatDate(item.start_at, true)}</span></small>
              <div class="muted">${escapeHtml(item.reason || item.type)}</div>
            </div>
          `).join("") : `<div class="lane-card"><div class="muted">No appointments in this lane.</div></div>`}
        </div>
      </div>
    `;
  }).join("");
}

function renderHistory() {
  const prescriptionMap = new Map((state.data.prescriptionDetails || []).map((item) => [item.id, item.prescription_number]));
  const history = (state.data.prescriptionHistory || [])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  refs.historyList.innerHTML = history.length ? history.map((item) => `
    <article class="history-card">
      <div class="history-meta">
        <strong>${escapeHtml(prescriptionMap.get(item.prescription_id) || `Prescription #${item.prescription_id}`)}</strong>
        <span class="audit-pill ${toneClass(item.new_status || item.action)}">${formatDate(item.created_at, true)}</span>
      </div>
      <p>${escapeHtml(item.action)} moved ${escapeHtml(item.previous_status || "new")} to ${escapeHtml(item.new_status)}.</p>
      <span>Actor user #${item.actor_user_id}${item.note ? ` • ${escapeHtml(item.note)}` : ""}</span>
    </article>
  `).join("") : `<article class="history-card"><p>No prescription history is available yet.</p></article>`;
}

function renderEmailLogs(search = "") {
  const query = search.trim().toLowerCase();
  const emails = (state.data.emails || []).filter((email) => `${email.recipient_email} ${email.template_key} ${email.status}`.toLowerCase().includes(query));
  refs.emailLogBody.innerHTML = emails.length ? emails.map((email) => `
    <tr>
      <td>${escapeHtml(email.recipient_email)}</td>
      <td>${escapeHtml(email.template_key || "custom")}</td>
      <td>${escapeHtml(email.related_object_type || "n/a")}${email.related_object_id ? ` #${email.related_object_id}` : ""}</td>
      <td>${escapeHtml(email.provider || "provider n/a")}</td>
      <td><span class="status-pill ${toneClass(email.status)}">${escapeHtml(email.status)}</span></td>
      <td>${formatDate(email.sent_at || email.failed_at || email.queued_at || email.created_at, true)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="muted">No email log entries match the current search.</td></tr>`;
}

function renderAuditTabs() {
  const categories = ["orders", "payments", "security", "consultation", "emails"];
  refs.auditTabs.innerHTML = categories.map((category) => `
    <button class="audit-tab ${category === state.audit.category ? "active" : ""}" data-category="${category}">
      ${category.toUpperCase()}
    </button>
  `).join("");

  refs.auditTabs.querySelectorAll(".audit-tab").forEach((button) => {
    button.addEventListener("click", async () => {
      state.audit.category = button.dataset.category;
      await fetchAuditEvents();
      renderAuditTabs();
    });
  });
}

function renderAuditDetail(event) {
  if (!event) {
    refs.auditDetail.innerHTML = `
      <div class="audit-detail-empty">
        <span class="detail-icon"><svg><use href="#i-shield"></use></svg></span>
        <strong>Select an event</strong>
        <p>View metadata, request id, IP address, and related pharmacy objects.</p>
      </div>
    `;
    return;
  }

  refs.auditDetail.innerHTML = `
    <div class="audit-detail-content">
      <div>
        <span class="section-kicker">Event detail</span>
        <h3>${escapeHtml(event.action)}</h3>
      </div>
      <span class="audit-pill ${toneClass(event.status === "error" ? "error" : event.severity)}">${escapeHtml(event.status)} • ${escapeHtml(event.severity)}</span>
      <div class="detail-grid">
        <div class="detail-block"><span>Timestamp</span><strong>${formatDate(event.created_at, true)}</strong></div>
        <div class="detail-block"><span>Source</span><strong>${escapeHtml(event.source)}</strong></div>
        <div class="detail-block"><span>Actor</span><strong>${event.actor_user_id ? `User #${event.actor_user_id}` : "system"}</strong></div>
        <div class="detail-block"><span>Role</span><strong>${escapeHtml(event.actor_role || "n/a")}</strong></div>
        <div class="detail-block"><span>Request ID</span><strong>${escapeHtml(event.request_id || "n/a")}</strong></div>
        <div class="detail-block"><span>IP Address</span><strong>${escapeHtml(event.actor_ip || "n/a")}</strong></div>
      </div>
      <div class="meta-block"><span>Message</span><pre>${escapeHtml(event.message || event.error_message || "No message stored.")}</pre></div>
      <div class="meta-block"><span>Metadata JSON</span><pre>${escapeHtml(JSON.stringify(event.metadata || {}, null, 2))}</pre></div>
    </div>
  `;
}

function renderAuditTable() {
  const rows = state.data.auditEvents || [];
  refs.auditTableBody.innerHTML = rows.length ? rows.map((event, index) => `
    <tr class="audit-row" data-index="${index}">
      <td>${formatDate(event.created_at, true)}</td>
      <td><span class="audit-pill ${toneClass(event.status === "error" ? "error" : event.severity)}">${escapeHtml(event.status)}</span></td>
      <td>${escapeHtml(event.severity)}</td>
      <td>${escapeHtml(event.source)}</td>
      <td>${escapeHtml(event.action)}</td>
      <td><div class="table-title"><strong>${event.actor_user_id ? `User #${event.actor_user_id}` : "system"}</strong><span class="muted">${escapeHtml(event.actor_role || "n/a")}</span></div></td>
      <td>${escapeHtml(event.object_type || "n/a")}${event.object_id ? ` #${event.object_id}` : ""}</td>
      <td>${escapeHtml(event.message || event.error_message || "No message")}</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="muted">No audit events match the current filters.</td></tr>`;

  refs.auditTableBody.querySelectorAll(".audit-row").forEach((row) => {
    row.addEventListener("click", () => {
      refs.auditTableBody.querySelectorAll(".audit-row").forEach((item) => item.classList.remove("active"));
      row.classList.add("active");
      renderAuditDetail(rows[Number(row.dataset.index)]);
    });
  });

  if (rows.length) {
    const first = refs.auditTableBody.querySelector(".audit-row");
    if (first) {
      first.classList.add("active");
      renderAuditDetail(rows[0]);
    }
  } else {
    renderAuditDetail(null);
  }
}

async function fetchAuditEvents() {
  if (!state.session.accessToken) {
    state.data.auditEvents = [];
    renderAuditTable();
    return;
  }

  const payload = await apiRequest("/audit-logs", {
    params: {
      category: state.audit.category,
      status: state.audit.status === "all" ? "" : state.audit.status,
      source: state.audit.source === "all" ? "" : state.audit.source,
      search: state.audit.search,
      per_page: 20
    }
  });
  state.data.auditEvents = payload.data || [];
  renderAuditTable();
}

async function fetchAllData() {
  setSyncStatus("Syncing...");
  const [dashboardPayload, ordersPayload, appointmentsPayload, prescriptionsPayload, emailsPayload, doctorsPayload, productsPayload] = await Promise.all([
    apiRequest("/dashboard/store-admin"),
    apiRequest("/orders", { params: { per_page: 12 } }),
    apiRequest("/appointments", { params: { per_page: 40 } }),
    apiRequest("/prescriptions", { params: { per_page: 40 } }),
    apiRequest("/emails/logs", { params: { per_page: 10 } }),
    apiRequest("/doctors", { params: { per_page: 50 } }),
    apiRequest("/products", { params: { per_page: 100 } })
  ]);

  state.data.dashboard = dashboardPayload.data || {};
  state.data.orders = ordersPayload.data || [];
  state.data.appointments = appointmentsPayload.data || [];
  state.data.prescriptions = prescriptionsPayload.data || [];
  state.data.emails = emailsPayload.data || [];
  state.data.doctors = doctorsPayload.data || [];
  state.data.products = productsPayload.data || [];

  state.data.orderDetails = await Promise.all(state.data.orders.slice(0, 10).map((order) =>
    apiRequest(`/orders/${order.id}`).then((payload) => payload.data).catch(() => order)
  ));

  state.data.prescriptionDetails = await Promise.all(state.data.prescriptions.slice(0, 8).map((prescription) =>
    apiRequest(`/prescriptions/${prescription.id}`).then((payload) => payload.data).catch(() => prescription)
  ));

  state.data.prescriptionHistory = (await Promise.all(
    state.data.prescriptionDetails.slice(0, 4).map((prescription) =>
      apiRequest(`/prescriptions/${prescription.id}/history`)
        .then((payload) => (payload.data || []).map((item) => ({ ...item, prescription_id: prescription.id })))
        .catch(() => [])
    )
  )).flat();

  renderSummary();
  renderRevenueChart();
  renderCatalogStats();
  renderTeamStats();
  renderEmailStats();
  renderQueue(refs.globalSearch.value);
  renderAppointments();
  renderHistory();
  renderEmailLogs(refs.globalSearch.value);
  await fetchAuditEvents();
  setSyncStatus(`Live • ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, "live");
}

function renderDisconnectedState() {
  refs.heroOrdersCount.textContent = "0";
  refs.heroRxCount.textContent = "0";
  refs.salesMetricValue.textContent = "$0.00";
  refs.appointmentsMetricValue.textContent = "0";
  refs.rxMetricValue.textContent = "0";
  refs.emailMetricValue.textContent = "0%";
  refs.mixTotalValue.textContent = "0";
  refs.operationsLegend.innerHTML = `<div class="legend-item"><span class="legend-swatch teal"></span><div><strong>Live metrics unavailable</strong><span>Pair the frontend to populate this panel.</span></div></div>`;
  refs.catalogStats.innerHTML = `<div class="muted">Pair the frontend to load product rule counts.</div>`;
  if (refs.catalogStatsPage) {
    refs.catalogStatsPage.innerHTML = refs.catalogStats.innerHTML;
  }
  refs.teamStats.innerHTML = `<div class="mini-stat"><span>Team</span><strong>0</strong><small>Pair the frontend to load doctor data.</small></div>`;
  if (refs.teamStatsPage) {
    refs.teamStatsPage.innerHTML = refs.teamStats.innerHTML;
  }
  refs.emailStats.innerHTML = `<div class="mini-stat"><span>Emails</span><strong>0</strong><small>Pair the frontend to load delivery logs.</small></div>`;
  if (refs.emailStatsPage) {
    refs.emailStatsPage.innerHTML = refs.emailStats.innerHTML;
  }
  refs.queueTableBody.innerHTML = `<tr><td colspan="7" class="muted">Pair and sign in to load live orders.</td></tr>`;
  refs.appointmentColumns.innerHTML = "";
  refs.historyList.innerHTML = `<article class="history-card"><p>Pair and sign in to load prescription history.</p></article>`;
  refs.emailLogBody.innerHTML = `<tr><td colspan="6" class="muted">Pair and sign in to load email logs.</td></tr>`;
  renderRevenueChart();
  renderAuditTabs();
  renderAuditTable();
}

function initNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      switchPage(button.dataset.target);
      refs.sidebar.classList.remove("open");
    });
  });

  refs.navToggle.addEventListener("click", () => {
    refs.sidebar.classList.toggle("open");
  });
}

function initSetupFlow() {
  refs.setupPairingCode.addEventListener("input", updateConnectionPreview);

  refs.setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    refs.setupSubmit.disabled = true;
    setSetupFeedback("Verifying pairing code...");
    try {
      const baseUrl = decodePairingBaseUrl(refs.setupPairingCode.value);
      await verifyAndRegisterPairing(baseUrl, refs.setupPairingCode.value);
      setSetupFeedback(`Paired successfully with ${state.session.siteName || "your pharmacy"}. Continue to sign in.`);
      showAuthGate("auth");
      setSyncStatus("Paired", "live");
    } catch (error) {
      console.error(error);
      setSyncStatus("Pairing error", "error");
      setSetupFeedback(error.message || "Pairing failed.");
    } finally {
      refs.setupSubmit.disabled = false;
    }
  });
}

function initAuthFlow() {
  refs.connectButton.addEventListener("click", () => {
    if (!state.session.paired) {
      showAuthGate("setup");
      return;
    }
    showAuthGate("auth");
  });

  refs.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    refs.authSubmit.disabled = true;
    setAuthFeedback("Signing in...");
    try {
      await login(refs.wpUsername.value, refs.wpPassword.value);
      await fetchAllData();
      hideAuthGate();
      refs.wpPassword.value = "";
      setAuthFeedback("Signed in.");
    } catch (error) {
      console.error(error);
      setSyncStatus("Authentication error", "error");
      setAuthFeedback(error.message || "Login failed.");
    } finally {
      refs.authSubmit.disabled = false;
    }
  });

  refs.logoutButton.addEventListener("click", async () => {
    await logout();
  });
}

function initSearch() {
  refs.auditStatusFilter.addEventListener("change", async () => {
    state.audit.status = refs.auditStatusFilter.value;
    await fetchAuditEvents();
  });

  refs.auditSourceFilter.addEventListener("change", async () => {
    state.audit.source = refs.auditSourceFilter.value;
    await fetchAuditEvents();
  });

  refs.globalSearch.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(async () => {
      const query = refs.globalSearch.value;
      renderQueue(query);
      renderEmailLogs(query);
      state.audit.search = query;
      await fetchAuditEvents();
    }, 250);
  });
}

async function bootstrap() {
  loadSession();
  updateUserUI();
  initNavigation();
  initSetupFlow();
  initAuthFlow();
  initSearch();
  switchPage(state.currentPage);
  renderDisconnectedState();

  if (!state.session.paired) {
    showAuthGate("setup");
    setSetupFeedback(
      isFileProtocol()
        ? "Enter the one-time pairing code to trust this storefront. If requests fail, serve this folder over http://localhost instead of opening index.html directly."
        : "Enter the one-time pairing code to trust this storefront."
    );
    setSyncStatus("Pairing required");
    return;
  }

  setSyncStatus("Paired", "live");
  if (!state.session.refreshToken) {
    showAuthGate("auth");
    setAuthFeedback(
      isFileProtocol()
        ? "The storefront is paired. Sign in to load live data. If requests fail from file://, serve this folder over http://localhost first."
        : "The storefront is paired. Sign in to load live data."
    );
    return;
  }

  try {
    await refreshSession();
    await fetchAllData();
    hideAuthGate();
    setAuthFeedback("Session restored.");
  } catch (error) {
    console.error(error);
    clearAuthSession();
    updateUserUI();
    showAuthGate("auth");
    setSyncStatus("Paired", "live");
    setAuthFeedback("Stored session expired. Sign in again.");
  }
}

bootstrap();
