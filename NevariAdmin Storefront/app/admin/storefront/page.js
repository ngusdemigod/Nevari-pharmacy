"use client";

import { createPortal } from "react-dom";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { removeById, replaceById, updateListPayload, upsertById } from "../../../lib/fetcher";
import { isAdminSummaryKey, isAppointmentListKey, isCustomerListKey, isDoctorListKey, isOrderListKey, isProductCategoryListKey, isProductListKey, isProductTagListKey, swrKeys, withBaseUrl } from "../../../lib/swrKeys";
import { useCreateProduct, useDeleteProduct, useUpdateProduct } from "../../../hooks/products";
import { useUpdateOrderStatus } from "../../../hooks/orders/useUpdateOrderStatus";
import { setDocumentMetadata } from "../../components/page-metadata";
import { getOrderTypeMeta } from "../../components/role-dashboard-utils";
import { clearStoredSessions, createPairingRequiredError, isPairingRequiredError, isPairingRequiredPayload } from "../../components/role-session";

const STORAGE_KEY = "nevari_admin_storefront_session";
const STORE_CURRENCY_KEY = "nevari_store_currency";
const STORE_TIMEZONE_KEY = "nevari_store_timezone";
const API_NAMESPACE = "nevari/v1";
const FRONTEND_TYPE = "storefront";
const PAIRING_FRONTEND_TYPE = "custom_frontend";
const DEFAULT_SITE_NAME = "Nevari Pharmacy";
const ADMIN_APPOINTMENT_SETTINGS_KEY = "nevari_admin_appointment_settings";
const EMAIL_TEMPLATE_STORAGE_KEY = "nevari_admin_email_templates";
const SESSION_EXPIRY_SKEW_MS = 30 * 1000;

const EMAIL_HOOKS = [
  { key: "{content}", label: "Body content injected by the sending workflow." },
  { key: "{customer_firstname}", label: "Customer first name." },
  { key: "{customer_lastname}", label: "Customer last name." },
  { key: "{order_id}", label: "WooCommerce order number or ID." },
  { key: "{order_number}", label: "Formatted order number." },
  { key: "{appointment_date}", label: "Formatted consultation date and time." },
  { key: "{appointment_time}", label: "Formatted consultation time." },
  { key: "{appointment_start}", label: "Full appointment start timestamp." },
  { key: "{consultation_type}", label: "Consultation type or specialty." },
  { key: "{amount_paid}", label: "Formatted appointment amount paid." },
  { key: "{booking_id}", label: "Appointment booking ID." },
  { key: "{google_meet_link}", label: "Google Meet or video consultation URL." },
  { key: "{google_meet_link_html}", label: "Clickable Google Meet consultation link." },
  { key: "{join_link}", label: "Direct consultation join URL." },
  { key: "{join_link_html}", label: "Clickable consultation join link." },
  { key: "{cancel_link}", label: "Appointment cancellation URL." },
  { key: "{reschedule_link}", label: "Appointment reschedule URL." },
  { key: "{review_link}", label: "Doctor review page link on the customer dashboard." },
  { key: "{feedback_link}", label: "Alias for the doctor review page link." },
  { key: "{dashboard_link}", label: "Relevant dashboard URL for the recipient." },
  { key: "{doctor_dashboard_link}", label: "Doctor dashboard URL." },
  { key: "{site_name}", label: "Configured pharmacy site name." },
  { key: "{support_email}", label: "Primary support inbox." },
  { key: "{doctor_name}", label: "Assigned doctor display name." },
  { key: "{patient_name}", label: "Patient or customer display name." },
  { key: "{recipient_name}", label: "Recipient display name." },
  { key: "{customer_email}", label: "Customer email address." },
  { key: "{customer_phone}", label: "Customer phone number." },
  { key: "{patient_note}", label: "Reason or note supplied by the patient." },
  { key: "{reason}", label: "Alias for the patient note." },
  { key: "{primary_product_name}", label: "Primary product selected for doctor assignment." },
  { key: "{product_service_assigned}", label: "Product or service assigned to the doctor." },
  { key: "{invoice_total}", label: "Formatted invoice or order total." },
  { key: "{document_type}", label: "Invoice or receipt label." },
  { key: "{document_title}", label: "Human-readable document title." },
  { key: "{payment_link}", label: "Customer payment URL." },
  { key: "{payment_link_html}", label: "Clickable payment link markup." }
];

const DEFAULT_EMAIL_TEMPLATES = [
  { id: "welcome", name: "Welcome Email", category: "Account", status: "active", subject: "Welcome to {site_name}", html: "<h1>Welcome, {customer_firstname}</h1><p>{content}</p><p>Contact us at {support_email}.</p>" },
  { id: "password-reset", name: "Password Reset", category: "Account", status: "active", subject: "Reset your {site_name} password", html: "<h1>Password reset</h1><p>{content}</p>" },
  { id: "order-confirmation", name: "Order Confirmation", category: "Orders", status: "active", subject: "Order #{order_id} confirmed", html: "<h1>Order #{order_id}</h1><p>Hello {customer_firstname},</p><p>{content}</p><p>Total: {invoice_total}</p>" },
  { id: "order-invoice-email", name: "Order Invoice Email", category: "Orders", status: "active", subject: "Invoice for order #{order_number}", html: "<h1>{document_title}</h1><p>Hello {customer_firstname},</p><p>Your invoice for order #{order_number} is attached.</p><p>{payment_link_html}</p><p>Total due: {invoice_total}</p>" },
  { id: "order-receipt-email", name: "Order Receipt Email", category: "Orders", status: "active", subject: "Receipt for order #{order_number}", html: "<h1>{document_title}</h1><p>Hello {customer_firstname},</p><p>Your receipt for order #{order_number} is attached.</p><p>Thank you for shopping with {site_name}.</p>" },
  { id: "doctor_order_assigned", name: "Doctor Order Assigned", category: "Orders", status: "active", subject: "A pharmacy order needs your review", html: "<p>Hello {doctor_name},</p><p>Order {order_number} has been assigned to you for {patient_name}.</p><p>Product/service: {product_service_assigned}</p><p>You can open your dashboard to create a prescription or schedule an appointment.</p>" },
  { id: "appointment_customer_confirmation", name: "Appointment Customer Confirmation", category: "Consultations", status: "active", subject: "Appointment confirmed with {doctor_name}", html: "<h1>Appointment confirmed</h1><p>Hello {patient_name},</p><p>Your {consultation_type} appointment is confirmed for {appointment_date} at {appointment_time}.</p><p><strong>Doctor:</strong> {doctor_name}<br /><strong>Amount paid:</strong> {amount_paid}<br /><strong>Booking ID:</strong> {booking_id}<br /><strong>Order ID:</strong> {order_id}</p><p>{google_meet_link_html}</p><p><a href=\"{cancel_link}\">Cancel appointment</a> | <a href=\"{reschedule_link}\">Reschedule appointment</a></p><p>Please join 5 minutes before the appointment starts.</p>" },
  { id: "appointment_doctor_notification", name: "Appointment Doctor Notification", category: "Consultations", status: "active", subject: "New appointment with {patient_name}", html: "<h1>New appointment</h1><p>Hello {doctor_name},</p><p>A new {consultation_type} appointment has been confirmed.</p><p><strong>Patient:</strong> {patient_name}<br /><strong>Email:</strong> {customer_email}<br /><strong>Phone:</strong> {customer_phone}<br /><strong>Date:</strong> {appointment_date}<br /><strong>Time:</strong> {appointment_time}</p><p><strong>Patient note:</strong> {patient_note}</p><p>{google_meet_link_html}</p><p><a href=\"{dashboard_link}\">Open dashboard</a></p>" },
  { id: "appointment_customer_reminder_24h", name: "Customer Reminder 24h", category: "Consultations", status: "active", subject: "Reminder: appointment with {doctor_name} tomorrow", html: "<h1>Appointment reminder</h1><p>Hello {patient_name},</p><p>Your appointment with {doctor_name} is scheduled for {appointment_date} at {appointment_time}.</p><p>{google_meet_link_html}</p><p><a href=\"{cancel_link}\">Cancel</a> | <a href=\"{reschedule_link}\">Reschedule</a></p>" },
  { id: "appointment_customer_reminder_1h", name: "Customer Reminder 1h", category: "Consultations", status: "active", subject: "Your appointment starts in 1 hour", html: "<h1>Your appointment starts in 1 hour</h1><p>Hello {patient_name},</p><p>Your appointment with {doctor_name} starts at {appointment_time}.</p><p>{google_meet_link_html}</p>" },
  { id: "appointment_doctor_reminder_24h", name: "Doctor Reminder 24h", category: "Consultations", status: "active", subject: "Reminder: appointment with {patient_name} tomorrow", html: "<h1>Appointment reminder</h1><p>Hello {doctor_name},</p><p>Your appointment with {patient_name} is scheduled for {appointment_date} at {appointment_time}.</p><p><strong>Patient note:</strong> {patient_note}</p><p>{google_meet_link_html}</p>" },
  { id: "appointment_doctor_reminder_1h", name: "Doctor Reminder 1h", category: "Consultations", status: "active", subject: "Your appointment starts in 1 hour", html: "<h1>Your appointment starts in 1 hour</h1><p>Hello {doctor_name},</p><p>Your appointment with {patient_name} starts at {appointment_time}.</p><p>{google_meet_link_html}</p>" },
  { id: "appointment_customer_followup", name: "Customer Follow Up", category: "Consultations", status: "active", subject: "How was your appointment with {doctor_name}?", html: "<h1>How was your appointment?</h1><p>Hello {patient_name},</p><p>Thank you for choosing Nevari. Please review your appointment with {doctor_name}.</p><p><a href=\"{review_link}\">Leave a doctor review</a></p><p><a href=\"{dashboard_link}\">Book another appointment</a></p>" },
  { id: "appointment_cancelled", name: "Appointment Cancelled", category: "Consultations", status: "active", subject: "Appointment cancelled", html: "<h1>Appointment cancelled</h1><p>Hello {recipient_name},</p><p>The appointment between {patient_name} and {doctor_name} for {appointment_start} has been cancelled.</p>" },
  { id: "appointment_rescheduled", name: "Appointment Rescheduled", category: "Consultations", status: "active", subject: "Appointment rescheduled", html: "<h1>Appointment rescheduled</h1><p>Hello {recipient_name},</p><p>The appointment has been rescheduled to {appointment_start}.</p><p>{google_meet_link_html}</p>" },
  { id: "appointment-approved", name: "Appointment Approved", category: "Consultations", status: "active", subject: "Appointment approved for {appointment_date}", html: "<h1>Appointment approved</h1><p>Your consultation with {doctor_name} is set for {appointment_date}.</p><p>{google_meet_link_html}</p><p>{content}</p>" },
  { id: "appointment-cancelled", name: "Appointment Cancelled", category: "Consultations", status: "draft", subject: "Appointment cancelled", html: "<h1>Appointment cancelled</h1><p>{content}</p>" },
  { id: "invoice-email", name: "Invoice Email", category: "Orders", status: "active", subject: "Invoice for order #{order_id}", html: "<h1>Invoice #{order_id}</h1><p>{content}</p><p>Total due: {invoice_total}</p>" },
  { id: "subscription-renewal", name: "Subscription Renewal", category: "Subscriptions", status: "draft", subject: "Subscription renewal reminder", html: "<h1>Renewal reminder</h1><p>{content}</p>" },
  { id: "admin-notification", name: "Admin Notification", category: "System", status: "active", subject: "{site_name} admin notification", html: "<h1>Admin notification</h1><p>{content}</p>" },
  { id: "vendor-notification", name: "Vendor Notification", category: "System", status: "draft", subject: "{site_name} vendor notification", html: "<h1>Vendor notification</h1><p>{content}</p>" }
];

const LEGACY_PAGE_ALIASES = {
  queue: "orders",
  communications: "emails",
  team: "doctors",
  catalog: "products"
};

const FRONTEND_PAGES = [
  {
    label: "Command",
    items: [
      ["overview", "Overview", "i-layout"],
      ["products", "Products", "i-pill"],
      ["orders", "Orders", "i-cart"],
      ["payments", "Payments", "i-credit-card"],
      ["customers", "Customers", "i-users"]
    ]
  },
  {
    label: "Care Ops",
    items: [
      ["doctors", "Doctors", "i-briefcase-medical"],
      ["consultations", "Consultations", "i-stethoscope"],
      ["prescriptions", "Prescriptions", "i-clipboard"]
    ]
  },
  {
    label: "Trust",
    items: [
      ["emails", "Emails", "i-mail"],
      ["audit", "Audit Center", "i-shield"],
      ["settings", "Settings", "i-settings"]
    ]
  }
];

const SEARCH_PLACEHOLDERS = {
  orders: "Search orders",
  payments: "Search payments",
  customers: "Search patients",
  consultations: "Search appointments",
  prescriptions: "Search prescriptions",
  products: "Search products",
  doctors: "Search doctors",
  emails: "Search emails",
  audit: "Search audit events",
  settings: "Search settings",
  profile: "Search profile"
};

const EMPTY_ORDER_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postcode: "",
  country: "US",
  productId: "",
  quantity: 1,
  status: "awaiting-doctor",
  doctorId: "",
  note: ""
};

const EMPTY_PRODUCT_FORM = {
  name: "",
  sku: "",
  regularPrice: "",
  salePrice: "",
  status: "draft",
  stockQuantity: 0,
  stockStatus: "instock",
  category: "",
  visibility: "visible"
};

const EMPTY_PRODUCT_DRAFT = {
  title: "",
  shortDescription: "",
  longDescription: "",
  regularPrice: "",
  salePrice: "",
  categories: [],
  tags: [],
  brands: [],
  shippingInfo: "",
  stockQuantity: "",
  sku: "",
  linkedProducts: "",
  purchaseNotes: "",
  status: "draft"
};

const EMPTY_ORDER_LINE = {
  key: "",
  productId: "",
  quantity: 1
};

const EMPTY_CUSTOMER_FORM = {
  fullName: "",
  email: "",
  phone: "",
  address: ""
};

const EMPTY_CONSULTATION_FORM = {
  patientUserId: "",
  doctorUserId: "",
  startAt: "",
  endAt: "",
  type: "video",
  reason: "",
  status: "requested"
};

const EMPTY_DOCTOR_FORM = {
  fullName: "",
  email: "",
  specialty: "",
  location: "",
  status: "active",
  bio: "",
  pricingTier: "specialist",
  productCategoryIds: []
};

const DOCTOR_PRICING_TIER_OPTIONS = [
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "specialist", label: "Specialist" }
];

const BOOKING_SLOT_TIMES = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "13:00", "13:30", "14:00",
  "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"
];

const BOOKING_DURATION_OPTIONS = [30, 45, 60, 90, 120];

const CUSTOMER_STATUS_EMAILS = new Set(["awaiting-doctor", "processing", "completed", "failed", "refunded"]);

function shouldNotifyCustomerForOrderStatus(status) {
  return CUSTOMER_STATUS_EMAILS.has(String(status || "").toLowerCase().replace(/\s+/g, "-"));
}

function buildDefaultConsultationWindow() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    startAt: start.toISOString().slice(0, 16),
    endAt: end.toISOString().slice(0, 16)
  };
}

function defaultSession() {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  const href = hasWindow ? window.location.href : "";

  return {
    baseUrl: "",
    frontendType: FRONTEND_TYPE,
    frontendOrigin: origin === "null" ? "null" : origin,
    frontendUrl: origin === "null" ? "null" : href,
    paired: false,
    siteName: "",
    siteLogo: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  };
}

function emptyData() {
  return {
    dashboard: null,
    orders: [],
    orderDetails: [],
    appointments: [],
    prescriptions: [],
    prescriptionDetails: [],
    prescriptionHistory: [],
    emails: [],
    customers: [],
    doctors: [],
    products: [],
    productCategories: [],
    auditEvents: []
  };
}

function defaultAdminAppointmentSettings() {
  return {
    googleMeetEnabled: true,
    livePaymentsEnabled: false,
    externalMeetingServiceUrl: "/api/create-meeting",
    emailNotificationsEnabled: true,
    reminderMinutesPrimary: 15,
    reminderMinutesSecondary: 5,
    smtpHost: "smtp.nevari.local",
    smtpPort: "587",
    smtpSender: "care@nevarihealth.com",
    idempotencyProtection: true,
    minimumConsultationMinutes: 30,
    apiKeyRotationEnabled: true,
    auditLogRetention: 90,
    rolePermissionsLocked: true,
    pricingTiers: {
      junior: "5000",
      senior: "8000",
      specialist: "12000"
    },
    categoryPricing: {
      cardiology: "12000",
      dermatology: "9000",
      general: "6000"
    }
  };
}

function loadAdminAppointmentSettings() {
  if (typeof window === "undefined") {
    return defaultAdminAppointmentSettings();
  }
  try {
    return {
      ...defaultAdminAppointmentSettings(),
      ...JSON.parse(window.localStorage.getItem(ADMIN_APPOINTMENT_SETTINGS_KEY) || "{}")
    };
  } catch {
    return defaultAdminAppointmentSettings();
  }
}

function persistAdminAppointmentSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ADMIN_APPOINTMENT_SETTINGS_KEY, JSON.stringify(settings));
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
  let decoded = "";

  try {
    decoded = atob(padded);
  } catch {
    throw new Error("Pairing code format is invalid. Generate a new code and paste it exactly as shown in WordPress.");
  }

  const baseUrl = normalizeBaseUrl(decoded);
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("Pairing code did not contain a valid pharmacy URL.");
  }

  return baseUrl;
}

function rememberStoreContext(context = {}) {
  if (typeof window === "undefined") {
    return;
  }
  const currency = normalizeCurrency(context.store_currency || context.currency);
  const timezone = normalizeTimeZone(context.store_timezone || context.timezone);
  if (currency) {
    window.localStorage.setItem(STORE_CURRENCY_KEY, currency);
  }
  if (timezone) {
    window.localStorage.setItem(STORE_TIMEZONE_KEY, timezone);
  }
}

function isSessionUsable(session) {
  if (!session || typeof session !== "object") {
    return false;
  }
  const hasAccessToken = Boolean(String(session.accessToken || "").trim());
  const expiresAt = Number(session.expiresAt || 0);
  return hasAccessToken && Number.isFinite(expiresAt) && Date.now() < (expiresAt - SESSION_EXPIRY_SKEW_MS);
}

function sanitizedPersistedSession(session = {}) {
  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  return {
    ...session,
    refreshToken: "",
    user: session?.user ? {
      id: session.user.id || "",
      display_name: session.user.display_name || session.user.name || "",
      email: session.user.email || "",
      role: session.user.role || "",
      roles
    } : null
  };
}

function clearDashboardCacheStorage() {
  if (typeof window === "undefined") {
    return;
  }
  const keysToRemove = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith("nevari:")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

function storedStoreCurrency() {
  if (typeof window === "undefined") {
    return "USD";
  }
  return normalizeCurrency(window.localStorage.getItem(STORE_CURRENCY_KEY)) || "USD";
}

function storedStoreTimeZone() {
  if (typeof window === "undefined") {
    return "UTC";
  }
  return normalizeTimeZone(window.localStorage.getItem(STORE_TIMEZONE_KEY)) || "UTC";
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return "";
  }
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(0);
    return currency;
  } catch {
    return "";
  }
}

function normalizeTimeZone(value) {
  const timeZone = String(value || "").trim();
  if (!timeZone) {
    return "";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "";
  }
}

function formatMoney(value, currency = storedStoreCurrency()) {
  const resolvedCurrency = normalizeCurrency(currency) || storedStoreCurrency();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: resolvedCurrency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDate(value, withTime = false, timeZone = storedStoreTimeZone()) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone) || storedStoreTimeZone(),
    month: "short",
    day: "numeric",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined
  }).format(date);
}

function formatStatusLabel(value) {
  return String(value || "n/a")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function splitFullName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "", fullName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "", fullName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: parts.join(" ")
  };
}

function getNameInitials(fullName, fallback = "??") {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return fallback;
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function buildEmptyProductDraft() {
  return { ...EMPTY_PRODUCT_DRAFT };
}

function normalizeDateKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay();
  const shift = (day + 6) % 7;
  result.setDate(result.getDate() - shift);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function formatDayLabel(date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function formatHourLabel(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(date);
}

function normalizeOrderQueueValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function isNeedsRxOrder(order) {
  const status = normalizeOrderQueueValue(order?.status);
  const rxStatus = normalizeOrderQueueValue(order?.rx_status);
  return ["requires-prescription", "awaiting-prescription", "on-hold"].includes(rxStatus)
    || ["awaiting-prescription", "on-hold"].includes(status);
}

function isAwaitingPaymentOrder(order) {
  const status = normalizeOrderQueueValue(order?.payment_status || order?.status);
  return ["pending", "processing", "awaiting-payment", "on-hold"].includes(status);
}

function isDoctorFollowUpOrder(order) {
  const status = normalizeOrderQueueValue(order?.status);
  const rxStatus = normalizeOrderQueueValue(order?.rx_status);
  return ["awaiting-doctor", "awaiting-prescription", "doctor-follow-up"].includes(status)
    || ["awaiting-prescription"].includes(rxStatus)
    || Boolean(order?.assigned_doctor_user_id || order?.assigned_doctor);
}

function upstreamOrderStatusFilter(filter) {
  const normalized = normalizeOrderQueueValue(filter);
  if (!normalized || ["all", "needs-rx", "awaiting-payment", "doctor-follow-up"].includes(normalized)) {
    return "";
  }
  return normalized;
}

function normalizedPaymentStatus(order) {
  const normalized = normalizeOrderQueueValue(order?.payment_status || order?.status || "pending");
  if (["paid", "completed", "processing"].includes(normalized)) {
    return "completed";
  }
  if (["pending", "awaiting-payment", "unpaid", "on-hold"].includes(normalized)) {
    return "pending";
  }
  if (["failed", "cancelled", "canceled"].includes(normalized)) {
    return "failed";
  }
  if (normalized === "refunded") {
    return "refunded";
  }
  return normalized || "pending";
}

function matchesOrderQueueFilter(order, filter) {
  if (filter === "needs_rx") {
    return isNeedsRxOrder(order);
  }
  if (filter === "awaiting_payment") {
    return isAwaitingPaymentOrder(order);
  }
  if (filter === "doctor_follow_up") {
    return isDoctorFollowUpOrder(order);
  }
  return true;
}

function joinNonEmpty(values, separator = " ") {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function metaValue(record, keys = []) {
  const rows = Array.isArray(record?.meta_data) ? record.meta_data : Array.isArray(record?.meta) ? record.meta : [];
  const normalizedKeys = keys.map((key) => String(key).toLowerCase());
  const match = rows.find((item) => normalizedKeys.includes(String(item?.key || "").toLowerCase()));
  return match?.value || "";
}

function isPlaceholderCustomerName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "guest checkout" || /^customer\s*#?\d+$/.test(normalized) || /^patient\s*#?\d+$/.test(normalized);
}

function customerEmail(orderOrCustomer) {
  const metaEmail = Array.isArray(orderOrCustomer?.meta_data)
    ? orderOrCustomer.meta_data.find((item) => ["billing_email", "email", "_billing_email"].includes(item?.key))?.value
    : "";
  return firstNonEmpty(
    orderOrCustomer?.billing?.email,
    orderOrCustomer?.billing_address?.email,
    orderOrCustomer?.customer?.email,
    orderOrCustomer?.customer?.billing?.email,
    orderOrCustomer?.customer_email,
    orderOrCustomer?.billing_email,
    orderOrCustomer?.email,
    orderOrCustomer?.user?.email,
    orderOrCustomer?.user_email,
    orderOrCustomer?.meta?.billing_email,
    metaEmail,
    orderOrCustomer?.shipping?.email
  );
}

function customerNameFromRecord(record) {
  const billingName = joinNonEmpty([record?.billing?.first_name, record?.billing?.last_name]);
  const billingAddressName = joinNonEmpty([record?.billing_address?.first_name, record?.billing_address?.last_name]);
  const customerBillingName = joinNonEmpty([record?.customer?.billing?.first_name, record?.customer?.billing?.last_name]);
  const explicitName = joinNonEmpty([record?.first_name, record?.last_name]);
  const metaName = joinNonEmpty([
    metaValue(record, ["billing_first_name", "_billing_first_name", "first_name"]),
    metaValue(record, ["billing_last_name", "_billing_last_name", "last_name"])
  ]);
  const directName = firstNonEmpty(record?.display_name, record?.name, record?.full_name, record?.customer_name, record?.username);
  return billingName || billingAddressName || customerBillingName || explicitName || metaName || (isPlaceholderCustomerName(directName) ? "" : directName);
}

function customerFullName(order) {
  const explicitName = firstNonEmpty(order?.customer_name, order?.customer_display_name, order?.billing_name, order?.display_name, order?.name);
  const billingName = joinNonEmpty([order?.billing?.first_name, order?.billing?.last_name]);
  const customerName = customerNameFromRecord(order?.customer);
  const shippingName = joinNonEmpty([order?.shipping?.first_name, order?.shipping?.last_name]);
  const email = customerEmail(order);
  const billingAddressName = joinNonEmpty([order?.billing_address?.first_name, order?.billing_address?.last_name]);
  const metaName = joinNonEmpty([
    metaValue(order, ["billing_first_name", "_billing_first_name", "first_name"]),
    metaValue(order, ["billing_last_name", "_billing_last_name", "last_name"])
  ]);
  const fallback = email ? email.split("@")[0] : (order?.customer_id || order?.id ? `Customer #${order?.customer_id || order?.id}` : "");
  return explicitName || billingName || customerName || billingAddressName || metaName || shippingName || fallback;
}

function customerNameForOrder(order) {
  return customerFullName(order);
}

function customerSummary(order) {
  const email = customerEmail(order);
  const name = customerFullName(order);
  return {
    name: name || (order?.customer_id || order?.id ? `Customer #${order?.customer_id || order?.id}` : "Customer"),
    email: email || "",
  };
}

function orderCustomerSummary(order, customerRowsById = new Map(), customerRowsByEmail = new Map()) {
  const customerRecord = customerRowsById.get(String(order?.customer_id || "")) || customerRowsByEmail.get(normalizeText(customerEmail(order))) || null;
  const name = firstNonEmpty(
    customerRecord?.name,
    customerRecord?.label,
    order?.customer_name,
    order?.customer_display_name,
    order?.billing_name,
    order?.display_name,
    customerFullName(order),
    customerNameFromRecord(order?.customer)
  );
  const email = firstNonEmpty(customerRecord?.email, customerEmail(order));
  return {
    name: isPlaceholderCustomerName(name) ? (email ? email.split("@")[0] : `Customer #${order?.customer_id || order?.id || ""}`.trim()) : name || "",
    email: !email || email === "No email on file" ? "" : email,
  };
}

function formatAddress(address) {
  if (!address) {
    return "No delivery address on file";
  }

  const lines = [
    joinNonEmpty([address.first_name, address.last_name]),
    address.company,
    joinNonEmpty([address.address_1, address.address_2]),
    joinNonEmpty([address.city, address.state, address.postcode], ", "),
    address.country
  ].filter(Boolean);

  return lines.length ? lines.join(", ") : "No delivery address on file";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOrderDocumentType(order) {
  return normalizeOrderQueueValue(order?.status) === "completed" ? "receipt" : "invoice";
}

function mergeRequiredEmailTemplates(templates) {
  const list = Array.isArray(templates) ? templates.filter(Boolean) : [];
  const seen = new Set(list.map((template) => template.id));
  const missingDefaults = DEFAULT_EMAIL_TEMPLATES.filter((template) => !seen.has(template.id));
  return missingDefaults.length ? [...list, ...missingDefaults] : list;
}

function loadEmailTemplates() {
  if (typeof window === "undefined") {
    return DEFAULT_EMAIL_TEMPLATES;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(EMAIL_TEMPLATE_STORAGE_KEY) || "[]");
    return mergeRequiredEmailTemplates(Array.isArray(saved) && saved.length ? saved : DEFAULT_EMAIL_TEMPLATES);
  } catch {
    return DEFAULT_EMAIL_TEMPLATES;
  }
}

function renderEmailTemplate(html, values = {}) {
  const hookValues = {
    content: "Your care team has an update for you.",
    customer_firstname: "Ada",
    customer_lastname: "Okafor",
    order_id: "1048",
    order_number: "1048",
    appointment_date: "May 22, 2026",
    appointment_time: "10:00 AM",
    appointment_start: "May 22, 2026 at 10:00 AM",
    consultation_type: "Video consultation",
    amount_paid: "$75.00",
    booking_id: "BK-1048",
    site_name: DEFAULT_SITE_NAME,
    support_email: "support@nevarihealth.com",
    doctor_name: "Dr. Morgan Lee",
    patient_name: "Ada Okafor",
    recipient_name: "Ada Okafor",
    customer_email: "ada@example.com",
    customer_phone: "+1 555 0100",
    patient_note: "Follow-up on blood pressure medication.",
    reason: "Follow-up on blood pressure medication.",
    google_meet_link: "https://meet.google.com/example-room",
    google_meet_link_html: '<a href="https://meet.google.com/example-room">Join Google Meet</a>',
    join_link: "https://meet.google.com/example-room",
    join_link_html: '<a href="https://meet.google.com/example-room">Join Consultation</a>',
    cancel_link: "https://example.com/dashboard?cancel=BK-1048",
    reschedule_link: "https://example.com/dashboard?reschedule=BK-1048",
    review_link: "https://example.com/dashboard?review=1&doctor_id=8&appointment_id=1048",
    feedback_link: "https://example.com/dashboard?review=1&doctor_id=8&appointment_id=1048",
    dashboard_link: "https://example.com/dashboard",
    doctor_dashboard_link: "https://example.com/admin/doctor",
    document_type: "invoice",
    document_title: "Invoice",
    invoice_total: "$128.00",
    payment_link: "https://example.com/pay",
    payment_link_html: '<a href="https://example.com/pay">Pay now</a>',
    ...values
  };
  return String(html || "").replace(/\{([a-z0-9_]+)\}/gi, (match, key) => hookValues[key] ?? match);
}

function unsupportedEmailHooks(template) {
  const supported = new Set(EMAIL_HOOKS.map((hook) => hook.key));
  const found = String(`${template?.subject || ""} ${template?.html || ""}`).match(/\{[a-z0-9_]+\}/gi) || [];
  return Array.from(new Set(found.filter((hook) => !supported.has(hook))));
}

function itemQuantityTotal(order) {
  if (order?.totals?.items_quantity !== undefined && order?.totals?.items_quantity !== null) {
    return Number(order.totals.items_quantity);
  }
  return (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function formatTopbarDate() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: storedStoreTimeZone(),
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function formatLiveLabel(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: storedStoreTimeZone(),
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function toneClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["success", "fulfilled", "completed", "sent", "processing", "released", "trusted", "confirmed", "active"].includes(normalized)) {
    return "success";
  }
  if (["error", "failed", "cancelled", "invalid", "forbidden", "revoked"].includes(normalized)) {
    return "error";
  }
  if (["warning", "on_hold", "on-hold", "pending", "draft", "requested", "issued", "assigned_to_patient", "expired", "queued"].includes(normalized)) {
    return "warning";
  }
  return "info";
}

function patientLabel(userId) {
  return userId ? `Customer #${userId}` : "Guest checkout";
}

function normalizePageId(pageId) {
  return LEGACY_PAGE_ALIASES[pageId] || pageId || "overview";
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function normalizePricingTier(value) {
  return String(value || "").trim().toLowerCase() || "specialist";
}

function formatPricingTierLabel(value) {
  const normalized = normalizePricingTier(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function safeNumber(value) {
  return Number(value || 0);
}

function isoDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function localDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildDateTimeLocalValue(dateValue, timeValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const [hours = "09", minutes = "00"] = String(timeValue || "09:00").split(":");
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return `${localDateKey(date)}T${localTimeKey(date)}`;
}

function nowDateTimeLocalValue() {
  const date = new Date();
  date.setSeconds(0, 0);
  return `${localDateKey(date)}T${localTimeKey(date)}`;
}

function isFutureLocalDateTimeValue(value) {
  const date = value ? new Date(value) : null;
  return Boolean(date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now());
}

function addMinutesToLocalValue(value, minutes) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setMinutes(date.getMinutes() + Number(minutes || 30));
  return `${localDateKey(date)}T${localTimeKey(date)}`;
}

function getProductImage(product) {
  return product?.image_url || product?.image?.src || product?.images?.[0]?.src || product?.thumbnail || "";
}

function getProductType(product) {
  return product?.type || product?.product_type || product?.badge?.label || product?.badge?.key || "simple";
}

function getProductStatus(product) {
  return product?.status || product?.post_status || "publish";
}

function getProductCategories(product) {
  const categories = product?.categories || product?.category_names || [];
  if (Array.isArray(categories)) {
    return categories.map((item) => item?.name || item?.label || item).filter(Boolean).join(", ") || "Uncategorized";
  }
  return categories || "Uncategorized";
}

function getDoctorCategoryEntries(doctor) {
  const categories = doctor?.product_categories || doctor?.categories || [];
  if (Array.isArray(categories)) {
    return categories
      .map((item) => ({
        id: item?.id ?? item?.term_id ?? item?.category_id ?? item?.value ?? null,
        name: item?.name || item?.label || item?.slug || item?.title || "",
        slug: item?.slug || normalizeCategoryKey(item?.name || item?.label || item?.title || ""),
        raw: item
      }))
      .filter((item) => item.name);
  }
  if (typeof categories === "string" && categories.trim()) {
    return categories.split(",").map((item) => item.trim()).filter(Boolean).map((name) => ({
      id: null,
      name,
      slug: normalizeCategoryKey(name),
      raw: name
    }));
  }
  return [];
}

function getDoctorCategoryIds(doctor) {
  const ids = new Set();
  if (Array.isArray(doctor?.product_category_ids)) {
    doctor.product_category_ids.forEach((id) => {
      const value = Number(id);
      if (Number.isFinite(value) && value > 0) {
        ids.add(value);
      }
    });
  }
  getDoctorCategoryEntries(doctor).forEach((item) => {
    const value = Number(item.id);
    if (Number.isFinite(value) && value > 0) {
      ids.add(value);
    }
  });
  return [...ids];
}

function getDoctorCategoryNames(doctor) {
  return getDoctorCategoryEntries(doctor).map((item) => item.name);
}

function replaceCategoryNameInProduct(product, oldName, nextName) {
  const nextCategories = getProductCategories(product)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => (name === oldName ? nextName : name));

  return {
    ...product,
    categories: nextCategories
  };
}

function removeCategoryNameFromProduct(product, categoryName) {
  const nextCategories = getProductCategories(product)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((name) => name !== categoryName);

  return {
    ...product,
    categories: nextCategories
  };
}

function replaceCategoryNameInDoctor(doctor, oldCategoryId, oldName, nextName, nextCategoryId) {
  const nextIds = new Set(getDoctorCategoryIds(doctor));
  const currentEntries = getDoctorCategoryEntries(doctor);
  const matched = currentEntries.some((item) => (
    (oldCategoryId && Number(item.id) === Number(oldCategoryId)) ||
    item.name === oldName ||
    item.slug === normalizeCategoryKey(oldName)
  ));

  if (!matched) {
    return doctor;
  }

  const nextCategories = currentEntries.map((item) => {
    const baseCategory = typeof item.raw === "object" && item.raw !== null ? item.raw : {};
    if (
      (oldCategoryId && Number(item.id) === Number(oldCategoryId)) ||
      item.name === oldName ||
      item.slug === normalizeCategoryKey(oldName)
    ) {
      return {
        ...baseCategory,
        id: nextCategoryId ?? item.id,
        name: nextName,
        label: nextName,
        slug: normalizeCategoryKey(nextName)
      };
    }
    return baseCategory.id ? baseCategory : {
      id: item.id,
      name: item.name,
      label: item.name,
      slug: item.slug
    };
  });

  if (oldCategoryId) {
    nextIds.delete(Number(oldCategoryId));
  }
  if (nextCategoryId) {
    nextIds.add(Number(nextCategoryId));
  }

  return {
    ...doctor,
    product_categories: nextCategories,
    product_category_ids: [...nextIds]
  };
}

function normalizeCategoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveCategoryConsultationPrice(category, categoryPricing = {}) {
  const candidates = [category?.slug, category?.name, category?.label]
    .map((value) => normalizeCategoryKey(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (categoryPricing?.[candidate] !== undefined && categoryPricing?.[candidate] !== "") {
      return categoryPricing[candidate];
    }
  }

  return categoryPricing?.general || "";
}

function getProductTerms(product, keys = []) {
  for (const key of keys) {
    const value = product?.[key];
    if (Array.isArray(value)) {
      const labels = value.map((item) => item?.name || item?.label || item?.slug || item).filter(Boolean);
      if (labels.length) {
        return labels.join(", ");
      }
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getProductTags(product) {
  return getProductTerms(product, ["tags", "tag_names", "product_tags"]);
}

function getProductBrands(product) {
  return getProductTerms(product, ["brands", "brand_names", "brand", "product_brands"]);
}

function isFeaturedProduct(product) {
  return Boolean(product?.featured || product?.is_featured || product?.meta?.featured);
}

function getProductDateValue(product) {
  return product?.date_modified || product?.updated_at || product?.modified_at || product?.created_at || product?.date_created || null;
}

function getProductDateLabel(product) {
  return getProductDateValue(product) ? "Last modified" : "Date unavailable";
}

function getProductPriceLabel(product, fallbackCurrency = "USD") {
  if (hasActiveSalePrice(product)) {
    return formatMoney(getProductPrice(product, "sale_price"), fallbackCurrency);
  }
  const basePrice = getProductPrice(product, "regular_price") || getProductPrice(product, "price");
  return formatMoney(basePrice, fallbackCurrency);
}

  function extractProductMediaItems(product) {
  const imageCandidates = Array.isArray(product?.images) && product.images.length
    ? product.images
    : [product?.image, product?.image_url, product?.thumbnail].filter(Boolean);

  return imageCandidates
    .map((item, index) => {
      if (typeof item === "string") {
        return { id: `media-${product?.id || "product"}-${index}`, src: item, alt: product?.name || "Product image" };
      }
      const src = item?.src || item?.url || item?.thumbnail || item?.image_url || "";
      if (!src) {
        return null;
      }
      return {
        id: String(item?.id || `media-${product?.id || "product"}-${index}`),
        attachmentId: item?.id ? Number(item.id) : null,
        src,
        alt: item?.alt || product?.name || "Product image"
      };
    })
    .filter(Boolean);
}

function buildProductEditDraft(product) {
  return {
    id: product?.id || null,
    title: product?.name || "",
    shortDescription: product?.short_description || product?.excerpt || "",
    longDescription: product?.description || product?.content || "",
    regularPrice: String(getProductPrice(product, "regular_price") || product?.price || ""),
    salePrice: String(product?.sale_price || ""),
    categories: getProductCategories(product).split(",").map((item) => item.trim()).filter(Boolean),
    tags: getProductTags(product).split(",").map((item) => item.trim()).filter(Boolean),
    brands: getProductBrands(product).split(",").map((item) => item.trim()).filter(Boolean),
    shippingInfo: product?.shipping_information || product?.shipping_class || product?.shipping_class_name || "",
    stockQuantity: String(getProductStockQuantity(product) ?? ""),
    sku: product?.sku || "",
    linkedProducts: Array.isArray(product?.linked_products)
      ? product.linked_products.map((item) => item?.name || item?.label || item).filter(Boolean).join(", ")
      : product?.linked_products || product?.upsell_ids?.join(", ") || "",
    purchaseNotes: product?.purchase_note || product?.purchase_notes || "",
    status: getProductStatus(product)
  };
}

function getEditorCurrency(product, fallbackCurrency = "USD") {
  return fallbackCurrency;
}

function base64PdfToBlob(base64) {
  const bytes = atob(base64);
  const values = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    values[index] = bytes.charCodeAt(index);
  }
  return new Blob([values], { type: "application/pdf" });
}

function getProductPrice(product, key) {
  return product?.[key] || product?.prices?.[key] || product?.price || 0;
}

function hasActiveSalePrice(product) {
  const regularPrice = Number(getProductPrice(product, "regular_price") || 0);
  const salePrice = Number(getProductPrice(product, "sale_price") || 0);
  return salePrice > 0 && (regularPrice === 0 || salePrice < regularPrice);
}

function getProductStockQuantity(product) {
  const quantity = product?.stock_quantity ?? product?.stock;
  if (quantity === undefined || quantity === null || quantity === "") {
    return null;
  }
  const nextValue = Number(quantity);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function buildProductActionLinks(product, session) {
  const baseUrl = session?.baseUrl ? normalizeBaseUrl(session.baseUrl) : "";
  const viewHref = product?.permalink || product?.link || product?.url || (baseUrl && product?.slug ? `${baseUrl}/product/${product.slug}` : "#");

  return {
    viewHref
  };
}

function getDoctorStatus(doctor) {
  const raw = String(doctor?.status || doctor?.account_status || "").toLowerCase();
  if (raw.includes("suspend") || raw === "inactive" || raw === "blocked") {
    return "suspended";
  }
  return "active";
}

function appointmentStatusGroup(appointment) {
  const status = String(appointment?.status || "").toLowerCase();
  const start = appointment?.start_at ? new Date(appointment.start_at) : null;
  const end = appointment?.end_at ? new Date(appointment.end_at) : null;
  const now = new Date();
  if (["completed", "cancelled", "no_show"].includes(status) || (end && !Number.isNaN(end.getTime()) && end < now)) {
    return "past";
  }
  if (["confirmed", "in_progress", "ongoing"].includes(status) && start && !Number.isNaN(start.getTime()) && start <= now) {
    return "ongoing";
  }
  if (start && !Number.isNaN(start.getTime()) && start > now) {
    return "upcoming";
  }
  if (["requested", "pending"].includes(status)) {
    return "upcoming";
  }
  return "ongoing";
}

function getInitials(value) {
  return String(value || "NP")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "NP";
}

function isFileProtocol() {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

function describeRequestError(error) {
  const message = String(error?.message || "");
  if (!message || message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.") {
    if (isFileProtocol()) {
      return "Network request failed. This storefront is being opened with file://, which often breaks WordPress API requests. Serve this folder over http://localhost and verify the pharmacy CORS settings allow that origin.";
    }
    return "Network request failed. Verify the pharmacy URL is reachable and that the Nevari WordPress plugin allows this frontend origin.";
  }
  if (/unauthorized user/i.test(message)) {
    return "Unauthorized user.";
  }
  if (/stored session expired/i.test(message)) {
    return "Stored session expired. Sign in again.";
  }
  if (isExpiredRefreshSessionError(error)) {
    return "Stored session expired. Sign in again.";
  }
  if (/appointment slot is no longer available/i.test(message)) {
    return "That appointment slot is no longer available.";
  }
  if (/appointment must be in the future/i.test(message)) {
    return "Appointment time must be in the future.";
  }
  if (/already exists|duplicate|conflict/i.test(message)) {
    return message;
  }
  if (/required|invalid|not found|not available|validation/i.test(message)) {
    return message || "Please review the submitted details and try again.";
  }
  return message || "Something went wrong. Try again.";
}

function isExpiredRefreshSessionError(error) {
  return /refresh token is invalid or expired|invalid refresh token|expired refresh token/i.test(String(error?.message || error || ""));
}

function htmlToTextMessage(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractApiErrorMessage(payload) {
  const message = payload?.error?.message || payload?.message || "";
  const code = payload?.error?.code || payload?.code || "";

  if (["order_not_found", "product_not_found", "doctor_not_found", "prescription_not_found", "appointment_not_found"].includes(code)) {
    return message || "The requested record no longer exists.";
  }

  if (message) {
    return describeRequestError({ message });
  }

  return describeRequestError({ message });
}

function getSettledValue(result, fallbackValue) {
  return result.status === "fulfilled" ? result.value : fallbackValue;
}

function isRouteMissingPayload(payload) {
  return payload?.code === "rest_no_route" || payload?.error?.code === "rest_no_route";
}

function frontendContext(session) {
  return {
    frontend_type: session.frontendType,
    frontend_origin: session.frontendOrigin,
    frontend_url: session.frontendUrl
  };
}

function buildUrl(session, path, params = {}) {
  const url = new URL("/api/nevari-proxy", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", normalizeBaseUrl(session.baseUrl));
  url.searchParams.set("path", path);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function buildAdminUrl(session, route, params = {}) {
  const url = new URL(`/api/admin/${route}`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", normalizeBaseUrl(session.baseUrl));
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function hydrateAuthSession(session, data) {
  return {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || session.refreshToken || "",
    expiresAt: Date.now() + (Number(data.expires_in || 0) * 1000),
    user: data.user || null
  };
}

function persistSessionSnapshot(session, currentPage) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...sanitizedPersistedSession(session), currentPage }));
  } catch (error) {
    console.warn("Could not persist storefront session", error);
  }
}

function InlineIcon({ id }) {
  return (
    <svg aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

function StatusPill({ value, children, className = "status-pill" }) {
  return <span className={`${className} ${toneClass(value)}`}>{children}</span>;
}

function BookingCalendarWidget({
  title = "Book an Appointment",
  subtitle = "Select a date and your preferred time slot",
  datePanelSubtitle = "Tap any available day to continue",
  appointments = [],
  selectedDate,
  selectedStartAt,
  viewDate,
  duration,
  contextualFlow = false,
  loading = false,
  onViewDateChange,
  onClearDate,
  onDateSelect,
  onSlotSelect,
  onDurationChange,
  showStepsHeader = true,
  showTimeSlots = true
}) {
  const currentView = viewDate instanceof Date && !Number.isNaN(viewDate.getTime()) ? viewDate : new Date();
  const selectedDateKey = selectedStartAt ? localDateKey(selectedStartAt) : (selectedDate || "");
  const selectedTimeKey = selectedStartAt ? localTimeKey(selectedStartAt) : "";
  const todayKey = localDateKey();
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const viewMonthStart = new Date(currentView.getFullYear(), currentView.getMonth(), 1);
  const canGoPrevious = !showTimeSlots || viewMonthStart > currentMonthStart;
  const monthLabel = currentView.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const first = new Date(currentView.getFullYear(), currentView.getMonth(), 1);
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, () => {
    const date = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    return date;
  });
  const selectedDateObject = selectedDateKey ? new Date(`${selectedDateKey}T00:00:00`) : new Date();
  const selectedDayAppointments = appointments.filter((appointment) => localDateKey(appointment.start_at) === selectedDateKey);
  const selectedBookedSlots = new Set(selectedDayAppointments.map((appointment) => localTimeKey(appointment.start_at)).filter(Boolean));
  const showDatePanel = !contextualFlow || !selectedDateKey;
  const showSlotPanel = showTimeSlots && (!contextualFlow || Boolean(selectedDateKey));

  function appointmentsForDay(date) {
    const key = localDateKey(date);
    return appointments.filter((appointment) => localDateKey(appointment.start_at) === key);
  }

  function statusForDay(date) {
    if (showTimeSlots && localDateKey(date) < todayKey) {
      return "past";
    }
    const count = appointmentsForDay(date).length;
    if (count >= 6) {
      return "full";
    }
    if (count >= 3) {
      return "partial";
    }
    return "avail";
  }

  function changeMonth(offset) {
    if (offset < 0 && !canGoPrevious) {
      return;
    }
    const next = new Date(currentView);
    next.setMonth(next.getMonth() + offset, 1);
    onViewDateChange?.(next);
  }

  function selectToday() {
    const today = new Date();
    onViewDateChange?.(today);
    onDateSelect?.(localDateKey(today), today);
  }

  return (
    <div className="booking-widget admin-booking-widget">
      <div className="booking-steps-header">
        <div className="booking-title-row">
          <div>
            <div className="booking-widget-title">{title}</div>
            <div className="booking-widget-subtitle">{subtitle}</div>
          </div>
          <div className="booking-legend">
            <div className="booking-legend-item"><span className="booking-legend-dot avail" />Available</div>
            <div className="booking-legend-item"><span className="booking-legend-dot partial" />Limited</div>
            <div className="booking-legend-item"><span className="booking-legend-dot full" />Full</div>
          </div>
        </div>
        {showStepsHeader ? (
          <div className="booking-steps-track">
            <div className="booking-step-item active">
              <div className="booking-step-circle">1</div>
              <div className="booking-step-label">Select Date</div>
            </div>
            {showTimeSlots ? (
              <div className={`booking-step-item ${selectedDateKey ? "active" : ""}`}>
                <div className="booking-step-circle">2</div>
                <div className="booking-step-label">Choose Time</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {showDatePanel ? <div className="booking-panel">
        <div className="booking-panel-head">
          <div>
            <div className="booking-panel-heading">Pick a Date</div>
            <div className="booking-panel-sub">{datePanelSubtitle}</div>
          </div>
          <div className="booking-month-controls">
            <button className="booking-calendar-nav" type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} disabled={!canGoPrevious}>‹</button>
            <button className="booking-pill-btn" type="button" onClick={selectToday}>Today</button>
            <button className="booking-calendar-nav" type="button" aria-label="Next month" onClick={() => changeMonth(1)}>›</button>
          </div>
        </div>
        <div className="booking-month-row">
          <div className="booking-month-label">{monthLabel}</div>
        </div>
        <div className="booking-day-names">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="booking-day-name" key={day}>{day}</div>)}
        </div>
        <div className="booking-cal-grid">
          {loading ? Array.from({ length: 42 }, (_, index) => (
            <SkeletonBox className="booking-cal-day-skeleton" key={index} />
          )) : days.map((date) => {
            const key = localDateKey(date);
            const otherMonth = date.getMonth() !== currentView.getMonth();
            const status = statusForDay(date);
            const dayAppointments = appointmentsForDay(date);
            const disabled = showTimeSlots ? (otherMonth || status === "past" || status === "full") : otherMonth;
            const bookingCount = dayAppointments.length;
            return (
              <button
                className={`booking-cal-day ${status} ${otherMonth ? "other-month" : ""} ${key === todayKey ? "today" : ""} ${key === selectedDateKey ? "selected" : ""}`.trim()}
                type="button"
                key={`${key}-${otherMonth ? "other" : "current"}`}
                disabled={disabled}
                onClick={() => onDateSelect?.(key, date)}
              >
                <span className="booking-d-num">{date.getDate()}</span>
                {showTimeSlots ? (
                  <span className="booking-d-dots">
                    {Array.from({ length: Math.min(Math.max(dayAppointments.length, 1), 3) }, (_, index) => <span key={index} />)}
                  </span>
                ) : null}
                <span className="booking-d-slots">
                  {showTimeSlots
                    ? `${Math.max(0, BOOKING_SLOT_TIMES.length - bookingCount)} slots`
                    : bookingCount}
                </span>
              </button>
            );
          })}
        </div>
      </div> : null}

      {showSlotPanel ? (
        <div className="booking-panel booking-time-panel">
          <div className="booking-panel-head">
            <div>
              <div className="booking-panel-heading">Choose a Time</div>
              <div className="booking-panel-sub">{formatDayLabel(selectedDateObject)}</div>
            </div>
            {contextualFlow ? <button className="booking-pill-btn" type="button" onClick={onClearDate}>Change day</button> : null}
          </div>
          <div className="booking-section-label">Session Duration</div>
          <div className="booking-duration-row">
            {BOOKING_DURATION_OPTIONS.map((minutes) => (
              <button className={`booking-dur-pill ${Number(duration) === minutes ? "active" : ""}`} type="button" key={minutes} onClick={() => onDurationChange?.(minutes)}>
                {minutes < 60 ? `${minutes} min` : minutes === 60 ? "1 hr" : `${minutes / 60} hr`}
              </button>
            ))}
          </div>
          <div className="booking-section-label">Available Slots</div>
          <div className="booking-slots-grid">
            {loading ? Array.from({ length: 10 }, (_, index) => (
              <SkeletonBox className="booking-t-slot-skeleton" key={index} />
            )) : BOOKING_SLOT_TIMES.map((time) => {
              const taken = selectedBookedSlots.has(time);
              const pastSlot = showTimeSlots && !isFutureLocalDateTimeValue(buildDateTimeLocalValue(selectedDateKey, time));
              return (
                <button
                  className={`booking-t-slot ${taken || pastSlot ? "taken" : ""} ${selectedTimeKey === time ? "chosen" : ""}`.trim()}
                  type="button"
                  key={time}
                  disabled={taken || pastSlot}
                  onClick={() => onSlotSelect?.(selectedDateKey, time)}
                >
                  <span className="booking-t-time">{time}</span>
                  <span className="booking-t-label">{taken ? "Booked" : pastSlot ? "Past" : "Open"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SkeletonBox({ className = "" }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="i-layout" viewBox="0 0 24 24">
        <rect x="3" y="4" width="7" height="7" rx="2" />
        <rect x="14" y="4" width="7" height="4" rx="2" />
        <rect x="14" y="11" width="7" height="9" rx="2" />
        <rect x="3" y="14" width="7" height="6" rx="2" />
      </symbol>
      <symbol id="i-pill" viewBox="0 0 24 24">
        <path d="M10.5 20.5 3.5 13.5a5 5 0 1 1 7-7l7 7a5 5 0 1 1-7 7Z" />
        <path d="m8 8 8 8" />
      </symbol>
      <symbol id="i-cart" viewBox="0 0 24 24">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H7" />
      </symbol>
      <symbol id="i-stethoscope" viewBox="0 0 24 24">
        <path d="M6 3v5a4 4 0 0 0 8 0V3" />
        <path d="M10 17a6 6 0 0 0 12 0v-1" />
        <circle cx="20" cy="10" r="2" />
        <path d="M8 3h4" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3Z" />
        <path d="m9.5 12 1.7 1.7 3.8-4.2" />
      </symbol>
      <symbol id="i-mail" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </symbol>
      <symbol id="i-paper-plane" viewBox="0 0 24 24">
        <path d="M21 3 3 11.5l7 2.5 2.5 7L21 3Z" />
        <path d="m10 14 11-11" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>
      <symbol id="i-search" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </symbol>
      <symbol id="i-bell" viewBox="0 0 24 24">
        <path d="M15 17H5l1.5-2.5V10a5.5 5.5 0 0 1 11 0v4.5L19 17h-4" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </symbol>
      <symbol id="i-settings" viewBox="0 0 24 24">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="m4.9 4.9 2.1 2.1" />
        <path d="m17 17 2.1 2.1" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m4.9 19.1 2.1-2.1" />
        <path d="m17 7 2.1-2.1" />
        <circle cx="12" cy="12" r="4" />
      </symbol>
      <symbol id="i-more" viewBox="0 0 24 24">
        <circle cx="6" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="18" cy="12" r="1.6" />
      </symbol>
      <symbol id="i-arrow-up-right" viewBox="0 0 24 24">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </symbol>
      <symbol id="i-menu" viewBox="0 0 24 24">
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </symbol>
      <symbol id="i-filter" viewBox="0 0 24 24">
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </symbol>
      <symbol id="i-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </symbol>
      <symbol id="i-lock" viewBox="0 0 24 24">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      </symbol>
      <symbol id="i-link" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20" />
      </symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M3 10h18" />
      </symbol>
      <symbol id="i-credit-card" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </symbol>
      <symbol id="i-clipboard" viewBox="0 0 24 24">
        <rect x="6" y="5" width="12" height="16" rx="2" />
        <path d="M9 5.5h6" />
        <path d="M9 10h6" />
        <path d="M9 14h6" />
      </symbol>
      <symbol id="i-briefcase-medical" viewBox="0 0 24 24">
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        <path d="M12 10v6" />
        <path d="M9 13h6" />
      </symbol>
      <symbol id="i-refresh-cw" viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </symbol>
      <symbol id="i-printer" viewBox="0 0 24 24">
        <path d="M7 8V4h10v4" />
        <rect x="6" y="14" width="12" height="6" rx="2" />
        <rect x="4" y="8" width="16" height="8" rx="2" />
      </symbol>
      <symbol id="i-download" viewBox="0 0 24 24">
        <path d="M12 4v10" />
        <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
        <path d="M4 19h16" />
      </symbol>
      <symbol id="i-trash" viewBox="0 0 24 24">
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 12h10l1-12" />
        <path d="M9 7V4h6v3" />
      </symbol>
      <symbol id="i-x" viewBox="0 0 24 24">
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </symbol>
      <symbol id="i-plus" viewBox="0 0 24 24">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </symbol>
      <symbol id="i-pencil" viewBox="0 0 24 24">
        <path d="m4 20 4.5-1 9.8-9.8a2.2 2.2 0 0 0-3.1-3.1L5.4 15.9 4 20Z" />
        <path d="m13.5 6.5 4 4" />
      </symbol>
      <symbol id="i-upload" viewBox="0 0 24 24">
        <path d="M12 16V5" />
        <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
        <path d="M5 19h14" />
      </symbol>
      <symbol id="i-package" viewBox="0 0 24 24">
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" />
      </symbol>
    </svg>
  );
}

export default function Page() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const [session, setSession] = useState(defaultSession);
  const [currentPage, setCurrentPage] = useState("overview");
  const [trendMode, setTrendMode] = useState("week");
  const [data, setData] = useState(emptyData);
  const [audit, setAudit] = useState({ category: "orders", status: "all", source: "all" });
  const [search, setSearch] = useState("");
  const [liveSnapshots, setLiveSnapshots] = useState([]);
  const deferredSearch = useDeferredValue(search);
  const [selectedAuditIndex, setSelectedAuditIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authGate, setAuthGate] = useState({ visible: false, stage: "auth" });
  const [setupFeedback, setSetupFeedback] = useState("Enter the pairing code to trust this storefront.");
  const [authFeedback, setAuthFeedback] = useState("Not connected.");
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authResendLoading, setAuthResendLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [setupPairingCode, setSetupPairingCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [verification, setVerification] = useState({ challengeId: "", maskedEmail: "", code: "" });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [authView, setAuthView] = useState("login");
  const [syncStatus, setSyncStatus] = useState({ text: "Disconnected", mode: "" });
  const [hydrated, setHydrated] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [selectedOrderDoctorId, setSelectedOrderDoctorId] = useState("");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState("");
  const [selectedOrderNote, setSelectedOrderNote] = useState("");
  const [orderQueueFilter, setOrderQueueFilter] = useState("all");
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderMutationLoading, setOrderMutationLoading] = useState(false);
  const [orderEmailActionLoading, setOrderEmailActionLoading] = useState("");
  const [orderActionFeedback, setOrderActionFeedback] = useState("");
  const [deletingOrderIds, setDeletingOrderIds] = useState([]);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderControlsModalOpen, setOrderControlsModalOpen] = useState(false);
  const [doctorAssignmentModalOpen, setDoctorAssignmentModalOpen] = useState(false);
  const [snackbar, setSnackbar] = useState(null);
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] = useState(null);
  const [paymentReceiptModalOpen, setPaymentReceiptModalOpen] = useState(false);
  const [paymentReceiptFeedback, setPaymentReceiptFeedback] = useState("");
  const [receiptActionLoading, setReceiptActionLoading] = useState("");
  const [tableActionLoading, setTableActionLoading] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState("");
  const [createFeedback, setCreateFeedback] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [orderCreateSearch, setOrderCreateSearch] = useState("");
  const [productEditorMode, setProductEditorMode] = useState("edit");
  const [productCreateForm, setProductCreateForm] = useState(buildEmptyProductDraft());
  const [consultationCreateForm, setConsultationCreateForm] = useState(EMPTY_CONSULTATION_FORM);
  const [consultationCalendarMode, setConsultationCalendarMode] = useState("week");
  const [consultationDuration, setConsultationDuration] = useState(30);
  const [consultationBookingDate, setConsultationBookingDate] = useState("");
  const [consultationCalendarViewDate, setConsultationCalendarViewDate] = useState(() => new Date());
  const [consultationCreateCalendarViewDate, setConsultationCreateCalendarViewDate] = useState(() => new Date());
  const [consultationPatientSearch, setConsultationPatientSearch] = useState("");
  const [consultationDoctorSearch, setConsultationDoctorSearch] = useState("");
  const [doctorCreateForm, setDoctorCreateForm] = useState(EMPTY_DOCTOR_FORM);
  const [doctorCreateCategorySearch, setDoctorCreateCategorySearch] = useState("");
  const [customerCreateForm, setCustomerCreateForm] = useState(EMPTY_CUSTOMER_FORM);
  const [orderCreateItems, setOrderCreateItems] = useState([{ ...EMPTY_ORDER_LINE, key: "line-1" }]);
  const [selectedProductEdit, setSelectedProductEdit] = useState(null);
  const [productEditForm, setProductEditForm] = useState(null);
  const [productEditMedia, setProductEditMedia] = useState([]);
  const [activeProductMediaId, setActiveProductMediaId] = useState("");
  const [productEditTab, setProductEditTab] = useState("details");
  const [productEditSearch, setProductEditSearch] = useState({ categories: "", tags: "", brands: "" });
  const [productEditFeedback, setProductEditFeedback] = useState("");
  const [productEditLoading, setProductEditLoading] = useState(false);
  const [productMediaUploading, setProductMediaUploading] = useState(false);
  const [duplicatingProductId, setDuplicatingProductId] = useState(null);
  const [productCatalogView, setProductCatalogView] = useState("products");
  const [productListFilter, setProductListFilter] = useState("all");
  const [selectedProductCategoryName, setSelectedProductCategoryName] = useState("");
  const [categoryProductSearch, setCategoryProductSearch] = useState("");
  const [categoryAssignmentLoading, setCategoryAssignmentLoading] = useState("");
  const [categoryAssignmentFeedback, setCategoryAssignmentFeedback] = useState("");
  const [categoryDoctorSearch, setCategoryDoctorSearch] = useState("");
  const [debouncedCategoryDoctorSearch, setDebouncedCategoryDoctorSearch] = useState("");
  const [categoryMutationLoading, setCategoryMutationLoading] = useState("");
  const [categoryMutationFeedback, setCategoryMutationFeedback] = useState("");
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [categoryCreateForm, setCategoryCreateForm] = useState({ name: "", pricePerMinute: "" });
  const [categoryEditDraft, setCategoryEditDraft] = useState({ name: "", pricePerMinute: "" });
  const [categoryInlineField, setCategoryInlineField] = useState("");
  const [categorySaveNotice, setCategorySaveNotice] = useState("");
  const [categoryProductPage, setCategoryProductPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [deletingProductIds, setDeletingProductIds] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [paymentPage, setPaymentPage] = useState(1);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerDetailTab, setCustomerDetailTab] = useState("details");
  const [customerOrderPage, setCustomerOrderPage] = useState(1);
  const [customerProductPage, setCustomerProductPage] = useState(1);
  const [customerHistoryOrders, setCustomerHistoryOrders] = useState([]);
  const [customerHistoryLoading, setCustomerHistoryLoading] = useState(false);
  const [customerHistoryFeedback, setCustomerHistoryFeedback] = useState("");
  const [consultationFilter, setConsultationFilter] = useState("all");
  const [selectedConsultationDate, setSelectedConsultationDate] = useState("");
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [consultationDetailForm, setConsultationDetailForm] = useState({ startAt: "", endAt: "", doctorNotes: "", cancellationReason: "" });
  const [consultationActionLoading, setConsultationActionLoading] = useState("");
  const [consultationActionFeedback, setConsultationActionFeedback] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState(DEFAULT_EMAIL_TEMPLATES);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState(DEFAULT_EMAIL_TEMPLATES[0].id);
  const [emailTemplateSearch, setEmailTemplateSearch] = useState("");
  const [emailTemplateCategory, setEmailTemplateCategory] = useState("all");
  const [emailEditorMode, setEmailEditorMode] = useState("edit");
  const [emailPreviewMode, setEmailPreviewMode] = useState("desktop");
  const [emailTemplateFeedback, setEmailTemplateFeedback] = useState("");
  const [bookingEmailTest, setBookingEmailTest] = useState({ recipientEmail: "", loading: false, feedback: "", meetLink: "", emailLogIds: [] });
  const [doctorDetailTab, setDoctorDetailTab] = useState("account");
  const [orderCreateModalOpen, setOrderCreateModalOpen] = useState(false);
  const [orderCreateForm, setOrderCreateForm] = useState(EMPTY_ORDER_FORM);
  const [orderCreateLoading, setOrderCreateLoading] = useState(false);
  const [orderCreateFeedback, setOrderCreateFeedback] = useState("");
  const [appDataLoaded, setAppDataLoaded] = useState(false);
  const [appointmentSettings, setAppointmentSettings] = useState(() => loadAdminAppointmentSettings());
  const [doctorDetailTierLoading, setDoctorDetailTierLoading] = useState(false);
  const latestSessionRef = useRef(session);
  const refreshPromiseRef = useRef(null);
  const bootstrapStartedRef = useRef(false);
  const categoryNameInputRef = useRef(null);
  const categoryPriceInputRef = useRef(null);
  const productMediaInputRef = useRef(null);
  const productMediaUploadModeRef = useRef({ type: "append", index: null });
  const productMediaDragIndexRef = useRef(null);
  const productDescriptionEditorRef = useRef(null);
  const DELETE_EXIT_DURATION = 220;
  const createProductMutation = useCreateProduct(session);
  const updateProductMutation = useUpdateProduct(session);
  const deleteProductMutation = useDeleteProduct(session);
  const updateOrderStatusMutation = useUpdateOrderStatus(session);

  function forcePairingReset(message = "Frontend access was revoked. Pair this dashboard again to continue.") {
    const nextSession = defaultSession();
    clearStoredSessions();
    clearDashboardCacheStorage();
    latestSessionRef.current = nextSession;
    setSession(nextSession);
    setCurrentPage("overview");
    setData(emptyData());
    setAppDataLoaded(false);
    hideAuthGate();
    setSetupFeedback(message);
    setAuthFeedback("Pairing required.");
    setSyncStatus({ text: "Pairing required", mode: "" });
    persistSessionSnapshot(nextSession, "overview");
    router.replace("/admin/storefront/setup");
  }

  useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const pageLabel = FRONTEND_PAGES.flatMap((group) => group.items).find(([id]) => id === currentPage)?.[1] || "Dashboard";
    setDocumentMetadata(`Nevari Admin | ${pageLabel}`, `${pageLabel} view for the Nevari Admin dashboard.`);
  }, [currentPage]);

  useEffect(() => {
    persistAdminAppointmentSettings(appointmentSettings);
  }, [appointmentSettings]);

  useEffect(() => {
    setEmailTemplates(loadEmailTemplates());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(EMAIL_TEMPLATE_STORAGE_KEY, JSON.stringify(emailTemplates));
  }, [emailTemplates]);

  useEffect(() => {
    if (!snackbar) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setSnackbar(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = { ...defaultSession(), ...parsed };
        setSession((prev) => (
          isSessionUsable(merged)
            ? { ...prev, ...merged }
            : { ...prev, ...merged, accessToken: "", refreshToken: "", expiresAt: 0, user: null }
        ));
        if (parsed.currentPage) {
          setCurrentPage(normalizePageId(parsed.currentPage));
        }
      }
    } catch (error) {
      console.error("Could not load stored session", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    persistSessionSnapshot(session, currentPage);
  }, [session, currentPage, hydrated]);

  useEffect(() => {
    const hasPopupOpen = orderModalOpen || orderControlsModalOpen || doctorAssignmentModalOpen || orderCreateModalOpen || paymentReceiptModalOpen || categoryCreateOpen || Boolean(createModalType) || Boolean(selectedConsultation) || Boolean(selectedDoctorId) || Boolean(selectedProductEdit) || Boolean(selectedCustomerId);
    document.body.classList.toggle("auth-locked", authGate.visible);
    document.body.classList.toggle("modal-open", hasPopupOpen);
    return () => {
      document.body.classList.remove("auth-locked");
      document.body.classList.remove("modal-open");
    };
  }, [authGate.visible, categoryCreateOpen, createModalType, doctorAssignmentModalOpen, orderControlsModalOpen, orderCreateModalOpen, orderModalOpen, paymentReceiptModalOpen, selectedConsultation, selectedCustomerId, selectedDoctorId, selectedProductEdit]);

  useEffect(() => {
    function handleStackedModalCtaClick(event) {
      if (!(event.target instanceof Element)) {
        return;
      }

      const cta = event.target.closest(".app-modal-layer .button-primary");
      if (!cta || cta.disabled) {
        return;
      }

      const currentLayer = cta.closest(".app-modal-layer");
      if (!currentLayer) {
        return;
      }

      const visibleLayers = [...document.querySelectorAll(".app-modal-layer")].filter((layer) => {
        const styles = window.getComputedStyle(layer);
        return styles.display !== "none" && styles.visibility !== "hidden";
      });

      if (visibleLayers.length < 2) {
        return;
      }

      const topLayer = visibleLayers.reduce((top, layer) => {
        const topIndex = Number.parseInt(window.getComputedStyle(top).zIndex || "0", 10);
        const layerIndex = Number.parseInt(window.getComputedStyle(layer).zIndex || "0", 10);
        return layerIndex >= topIndex ? layer : top;
      });

      if (topLayer !== currentLayer) {
        return;
      }

      window.setTimeout(() => {
        if (!document.body.contains(currentLayer)) {
          return;
        }
        currentLayer.querySelector(".app-modal-backdrop")?.click();
      }, 0);
    }

    document.addEventListener("click", handleStackedModalCtaClick);
    return () => document.removeEventListener("click", handleStackedModalCtaClick);
  }, []);

  useEffect(() => {
    if (currentPage !== "orders") {
      setSelectedOrderId(null);
      setSelectedOrderDetail(null);
      setSelectedOrderDoctorId("");
      setSelectedOrderStatus("");
      setSelectedOrderNote("");
      setOrderActionFeedback("");
      setOrderModalOpen(false);
      setOrderControlsModalOpen(false);
      setDoctorAssignmentModalOpen(false);
      setOrderCreateModalOpen(false);
      setPaymentReceiptModalOpen(false);
      setSelectedPaymentReceipt(null);
      setCreateMenuOpen(false);
      setCreateModalType("");
      setSelectedConsultation(null);
      setSelectedCustomerId(null);
      setCustomerHistoryOrders([]);
      setCustomerHistoryLoading(false);
      setCustomerHistoryFeedback("");
      setSelectedDoctorId(null);
      setSelectedProductEdit(null);
      setTableActionLoading("");
      setProductEditForm(null);
      setProductEditMedia([]);
      setActiveProductMediaId("");
      setProductEditFeedback("");
    }
  }, [currentPage]);

  useEffect(() => {
    setPaymentPage(1);
  }, [paymentFilter, deferredSearch, data.orderDetails]);

  useEffect(() => {
    setProductPage(1);
  }, [productListFilter, deferredSearch, data.products]);

  useEffect(() => {
    if (productCatalogView !== "categories") {
      return;
    }
    setCategoryProductSearch("");
  }, [productCatalogView]);

  useEffect(() => {
    setSelectedProductIds((prev) => prev.filter((id) => (data.products || []).some((product) => product.id === id)));
  }, [data.products]);

  useEffect(() => {
    if (!selectedOrderId) {
      return;
    }
    const matchingOrder = (data.orderDetails || []).find((order) => order.id === selectedOrderId);
    if (matchingOrder && !selectedOrderDetail) {
      setSelectedOrderDetail(matchingOrder);
      setSelectedOrderDoctorId(matchingOrder.assigned_doctor_user_id ? String(matchingOrder.assigned_doctor_user_id) : "");
      setSelectedOrderStatus(matchingOrder.status || "");
      setSelectedOrderNote(matchingOrder.customer_note || "");
      setOrderModalOpen(true);
    }
  }, [data.orderDetails, selectedOrderDetail, selectedOrderId]);

  useEffect(() => {
    if (!productDescriptionEditorRef.current || !productEditForm) {
      return;
    }
    if (productDescriptionEditorRef.current.innerHTML !== productEditForm.longDescription) {
      productDescriptionEditorRef.current.innerHTML = productEditForm.longDescription || "";
    }
  }, [productEditForm]);

  function showAuthGate(stage) {
    if (stage === "setup") {
      router.push("/admin/storefront/setup");
      return;
    }
    router.push("/admin/storefront/login");
  }

  function hideAuthGate() {
    setAuthGate((prev) => ({ ...prev, visible: false }));
  }

  function closeNestedOrderPopups() {
    setOrderControlsModalOpen(false);
    setDoctorAssignmentModalOpen(false);
  }

  function resetSelectedOrderState() {
    setSelectedOrderId(null);
    setSelectedOrderDetail(null);
    setSelectedOrderDoctorId("");
    setSelectedOrderStatus("");
    setSelectedOrderNote("");
    setOrderActionFeedback("");
  }

  function closeAllOrderPopups() {
    setOrderCreateModalOpen(false);
    setOrderControlsModalOpen(false);
    setDoctorAssignmentModalOpen(false);
    setOrderModalOpen(false);
    resetSelectedOrderState();
  }

  function closeOrderModal() {
    closeNestedOrderPopups();
    setOrderModalOpen(false);
    resetSelectedOrderState();
  }

  function closePaymentReceiptModal() {
    setPaymentReceiptModalOpen(false);
    setSelectedPaymentReceipt(null);
    setPaymentReceiptFeedback("");
    setReceiptActionLoading("");
  }

  function showSnackbar(message, tone = "info") {
    if (!message) {
      return;
    }
    setSnackbar({ message, tone });
  }

  function updateSelectedEmailTemplate(patch) {
    setEmailTemplates((prev) => prev.map((template) => (
      template.id === selectedEmailTemplateId ? { ...template, ...patch } : template
    )));
    setEmailTemplateFeedback("");
  }

  function duplicateSelectedEmailTemplate() {
    const source = emailTemplates.find((template) => template.id === selectedEmailTemplateId);
    if (!source) {
      return;
    }
    const duplicate = {
      ...source,
      id: `${source.id}-${Date.now()}`,
      name: `${source.name} Copy`,
      status: "draft"
    };
    setEmailTemplates((prev) => [duplicate, ...prev]);
    setSelectedEmailTemplateId(duplicate.id);
    setEmailTemplateFeedback("Template duplicated as draft.");
  }

  function createEmailTemplate() {
    const template = {
      id: `custom-${Date.now()}`,
      name: "Custom Template",
      category: "Custom",
      status: "draft",
      subject: "New message from {site_name}",
      html: "<h1>{site_name}</h1><p>{content}</p>"
    };
    setEmailTemplates((prev) => [template, ...prev]);
    setSelectedEmailTemplateId(template.id);
    setEmailTemplateFeedback("New template created.");
  }

  function saveSelectedEmailTemplate(status = "active") {
    const template = emailTemplates.find((item) => item.id === selectedEmailTemplateId);
    const unsupported = unsupportedEmailHooks(template);
    if (unsupported.length) {
      setEmailTemplateFeedback(`Unsupported hooks: ${unsupported.join(", ")}`);
      showSnackbar(`Unsupported hooks: ${unsupported.join(", ")}`, "error");
      return;
    }
    updateSelectedEmailTemplate({ status });
    setEmailTemplateFeedback(status === "draft" ? "Template saved as draft." : "Template saved.");
    showSnackbar(status === "draft" ? "Template saved as draft." : "Template saved.", "success");
  }

  function insertHookIntoSelectedTemplate(hookKey) {
    const template = emailTemplates.find((item) => item.id === selectedEmailTemplateId);
    updateSelectedEmailTemplate({ html: `${template?.html || ""}${template?.html ? "\n" : ""}${hookKey}` });
  }

  async function sendBookingEmailTest() {
    const recipientEmail = bookingEmailTest.recipientEmail.trim();
    if (!recipientEmail) {
      setBookingEmailTest((current) => ({ ...current, feedback: "Enter an email address." }));
      return;
    }
    setBookingEmailTest((current) => ({ ...current, loading: true, feedback: "Sending booking email preview...", meetLink: "", emailLogIds: [] }));
    try {
      const payload = await apiRequest("/emails/booking-test", {
        method: "POST",
        body: { recipient_email: recipientEmail }
      });
      const result = payload.data || {};
      setBookingEmailTest((current) => ({
        ...current,
        loading: false,
        feedback: `Sent ${result.email_log_ids?.length || 0} booking preview emails.`,
        meetLink: result.google_meet_link || "",
        emailLogIds: result.email_log_ids || []
      }));
      showSnackbar("Booking email preview sent.", "success");
    } catch (error) {
      const message = error?.message || "Booking email preview failed.";
      setBookingEmailTest((current) => ({ ...current, loading: false, feedback: message, meetLink: "", emailLogIds: [] }));
      showSnackbar(message, "error");
    }
  }

  function parseCreateError(error, entityLabel) {
    const message = String(error?.message || "");
    const status = Number(error?.status || error?.details?.status || 0);
    const code = String(error?.code || error?.details?.code || "").toLowerCase();
    if (/invalid email/i.test(message) || code.includes("invalid_email") || status === 422) {
      return `Enter a valid ${entityLabel} email address.`;
    }
    if (/already exists|duplicate|conflict|exists/i.test(message) || status === 409) {
      return `A ${entityLabel} with that email already exists.`;
    }
    return extractApiErrorMessage(error);
  }

  function normalizeDoctorTierOption(value) {
    return normalizePricingTier(value);
  }

  function consultationFeeForTier(pricingTier) {
    const tier = normalizeDoctorTierOption(pricingTier);
    const fee = appointmentSettings.pricingTiers?.[tier];
    return fee === undefined || fee === null ? "" : String(fee);
  }

  function addDoctorCreateCategory(categoryId) {
    const nextId = String(categoryId || "");
    if (!nextId) {
      return;
    }
    setDoctorCreateForm((prev) => ({
      ...prev,
      productCategoryIds: Array.from(new Set([...(prev.productCategoryIds || []), nextId]))
    }));
    setDoctorCreateCategorySearch("");
  }

  function removeDoctorCreateCategory(categoryId) {
    setDoctorCreateForm((prev) => ({
      ...prev,
      productCategoryIds: (prev.productCategoryIds || []).filter((id) => String(id) !== String(categoryId))
    }));
  }

  async function fetchOrderDocument(order, documentType = getOrderDocumentType(order)) {
    const attachment = await fetchOrderDocumentAttachment(order, documentType);
    return {
      filename: attachment.filename || `${documentType}-order-${order.number}.pdf`,
      blob: base64PdfToBlob(attachment.base64 || attachment.content || ""),
    };
  }

  async function fetchReceiptDocument(order) {
    return fetchOrderDocument(order, "receipt");
  }

  async function fetchOrderDocumentAttachment(order, documentType) {
    const routes = documentType === "receipt"
      ? ["receipt", "details-pdf"]
      : documentType === "prescription"
        ? ["prescription-pdf"]
        : ["details-pdf"];
    let lastError = null;
    for (const route of routes) {
      try {
        const payload = await apiRequest(`/orders/${order.id}/${route}`);
        const base64 = payload?.data?.base64 || "";
        const filename = payload?.data?.filename || `${documentType}-order-${order.number}.pdf`;
        return {
          filename,
          content_type: payload?.data?.content_type || "application/pdf",
          mime_type: payload?.data?.content_type || "application/pdf",
          base64,
          content: base64
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Unable to build the order document attachment.");
  }

  function buildOrderEmailVariables(order, documentType, paymentLink) {
    const customerName = customerNameForOrder(order) || "Customer";
    const [customerFirstName = "", ...customerLastParts] = String(customerName).trim().split(/\s+/);
    const customerLastName = customerLastParts.join(" ");
    const documentTitle = documentType === "receipt" ? "Receipt" : "Invoice";
    const paymentLinkHtml = paymentLink
      ? `<a href="${escapeHtml(paymentLink)}" target="_blank" rel="noopener noreferrer">Pay now</a>`
      : "";
    return {
      customer_name: customerName,
      customer_firstname: customerFirstName || customerName,
      customer_lastname: customerLastName,
      order_id: String(order?.id || ""),
      order_number: String(order?.number || order?.id || ""),
      order_total: formatMoney(order?.total || 0, storeCurrency),
      invoice_total: formatMoney(order?.total || 0, storeCurrency),
      payment_link: paymentLink,
      payment_link_html: paymentLinkHtml,
      document_type: documentType,
      document_title: documentTitle,
      site_name: siteName,
      support_email: appointmentSettings.smtpSender || "support@nevarihealth.com"
    };
  }

  function buildOrderEmailFallbackHtml(order, documentType, paymentLink) {
    const documentLabel = documentType === "receipt" ? "receipt" : "invoice";
    const paymentLinkBlock = paymentLink ? `<p><a href="${escapeHtml(paymentLink)}" target="_blank" rel="noopener noreferrer">Pay now</a></p>` : "";
    return `
      <p>Hello ${escapeHtml(customerNameForOrder(order) || "Customer")},</p>
      <p>Your ${escapeHtml(documentLabel)} for order <strong>#${escapeHtml(order?.number || order?.id || "")}</strong> is attached.</p>
      ${paymentLinkBlock}
      <p>Thank you for choosing ${escapeHtml(siteName)}.</p>
    `;
  }

  function buildOrderEmailFallbackText(order, documentType, paymentLink) {
    const documentLabel = documentType === "receipt" ? "receipt" : "invoice";
    const paymentText = paymentLink ? ` Pay now: ${paymentLink}` : "";
    return `Hello ${customerNameForOrder(order) || "Customer"}, your ${documentLabel} for order #${order?.number || order?.id || ""} is attached.${paymentText} Thank you for choosing ${siteName}.`;
  }

  async function sendOrderDocumentEmail(order, { documentType: requestedDocumentType, feedback } = {}) {
    if (typeof window === "undefined" || !order) {
      return null;
    }
    const email = customerEmail(order);
    if (!email) {
      throw new Error("No customer email is available for contact.");
    }
    const documentType = requestedDocumentType || getOrderDocumentType(order);
    const invoiceNumber = `NVH-INV-${String(order?.number || order?.id || "").padStart(5, "0")}`;
    const paymentLink = normalizeOrderQueueValue(order?.payment_status || order?.status) === "pending"
      ? `${window.location.origin}/pay/${encodeURIComponent(invoiceNumber)}?role=patient`
      : "";
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/documents/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_type: documentType,
        baseUrl: session.baseUrl,
        accessToken: session.accessToken,
        frontendType: session.frontendType || FRONTEND_TYPE,
        frontendOrigin: session.frontendOrigin || window.location.origin,
        appOrigin: window.location.origin,
        fallback_payment_link: paymentLink,
        fallback_body_html: buildOrderEmailFallbackHtml(order, documentType, paymentLink),
        fallback_body_text: buildOrderEmailFallbackText(order, documentType, paymentLink),
        fallback_variables: buildOrderEmailVariables(order, documentType, paymentLink)
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error?.message || payload?.message || "Document email could not be sent.");
    }
    return payload;
  }

  async function printReceiptForOrder(order, { documentType = getOrderDocumentType(order), feedback, statusMode = "order" } = {}) {
    const tab = documentType === "receipt" ? "receipt" : documentType === "prescription" ? "prescription" : "invoice";
    if (typeof window !== "undefined" && order?.id) {
      try {
        window.localStorage.setItem(`nevari-document-order-${String(order.id)}`, JSON.stringify(order));
      } catch {}
    }
    const documentUrl = `/admin/orders/${encodeURIComponent(order.id || order.number || "")}/documents?role=admin&tab=${encodeURIComponent(tab)}&print=1&statusMode=${encodeURIComponent(statusMode)}`;
    const frame = document.createElement("iframe");
    frame.title = `${documentType} print frame`;
    frame.src = documentUrl;
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.setAttribute("aria-hidden", "true");
    await new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        window.setTimeout(resolve, 1_200);
      };
      frame.addEventListener("load", settle, { once: true });
      document.body.appendChild(frame);
      window.setTimeout(settle, 8_000);
    });
    window.setTimeout(() => {
      try {
        frame.remove();
      } catch {}
    }, 30_000);
    if (feedback) {
      feedback(`Print dialog opened for ${documentType === "receipt" ? "receipt" : "invoice"}.`);
    }
  }

  async function downloadReceiptForOrder(order, { documentType = getOrderDocumentType(order), feedback } = {}) {
    const { blob, filename } = await fetchOrderDocument(order, documentType);
    const objectUrl = URL.createObjectURL(blob);
    const viewer = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!viewer) {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    if (feedback) {
      feedback(`${documentType === "receipt" ? "Receipt" : "Invoice"} PDF viewer opened.`);
    }
  }

  async function sendReceiptForOrder(order, { documentType, feedback } = {}) {
    const payload = await sendOrderDocumentEmail(order, { documentType, feedback });
    if (feedback) {
      const documentLabel = (documentType || getOrderDocumentType(order)) === "receipt" ? "Receipt" : "Invoice";
      feedback(`${documentLabel} sent to ${payload?.data?.recipient_email || order.billing?.email || "the customer"}.`);
    }
  }

  async function performTableOrderAction(actionKey, order, action) {
    setTableActionLoading(`${actionKey}-${order.id}`);
    try {
      const message = await action();
      if (message) {
        showSnackbar(message, "success");
      }
    } catch (error) {
      showSnackbar(describeRequestError(error), "error");
    } finally {
      setTableActionLoading("");
    }
  }

  function openOrderCreateModal() {
    closeAllOrderPopups();
    setOrderCreateForm(EMPTY_ORDER_FORM);
    setOrderCreateItems([]);
    setOrderCreateSearch("");
    setOrderCreateFeedback("");
    setOrderCreateModalOpen(true);
  }

  function openCreateModal(type) {
    setCreateMenuOpen(false);
    setCreateFeedback("");
    if (type === "order") {
      openOrderCreateModal();
      return;
    }
    if (type === "product") {
      openProductCreateModal();
      return;
    }
    if (type === "consultation") {
      const firstDoctor = (data.doctors || [])[0] || null;
      setConsultationCreateForm({
        ...EMPTY_CONSULTATION_FORM,
        doctorUserId: String(firstDoctor?.user_id || firstDoctor?.id || "")
      });
      setConsultationCalendarMode("week");
      setConsultationDuration(30);
      setConsultationBookingDate("");
      setConsultationCreateCalendarViewDate(new Date());
      setConsultationDoctorSearch(firstDoctor?.display_name || firstDoctor?.email || "");
      setConsultationPatientSearch("");
      setCreateModalType("consultation");
      return;
    }
    if (type === "doctor") {
      setDoctorCreateForm(EMPTY_DOCTOR_FORM);
      setDoctorCreateCategorySearch("");
      setCreateModalType("doctor");
      return;
    }
    if (type === "customer") {
      setCustomerCreateForm(EMPTY_CUSTOMER_FORM);
      setCreateModalType("customer");
    }
  }

  function closeCreateModal() {
    setCreateModalType("");
    setCreateFeedback("");
    setOrderCreateSearch("");
    setCustomerCreateForm(EMPTY_CUSTOMER_FORM);
    setDoctorCreateForm(EMPTY_DOCTOR_FORM);
    setDoctorCreateCategorySearch("");
    setConsultationCreateForm(EMPTY_CONSULTATION_FORM);
    setConsultationCalendarMode("week");
    setConsultationDuration(30);
    setConsultationBookingDate("");
    setConsultationPatientSearch("");
    setConsultationDoctorSearch("");
  }

  function closeOrderCreateModal() {
    setOrderCreateModalOpen(false);
    setOrderCreateFeedback("");
    setOrderCreateItems([]);
    setOrderCreateSearch("");
  }

  function addOrderCreateItem(product = null) {
    if (!product) {
      return;
    }
    const productId = String(product.id);
    setOrderCreateItems((prev) => {
      const existingIndex = prev.findIndex((item) => String(item.productId) === productId);
      if (existingIndex >= 0) {
        return prev.map((item, index) => (
          index === existingIndex ? { ...item, quantity: Math.max(1, Number(item.quantity || 1)) + 1 } : item
        ));
      }
      return [
        ...prev,
        {
          ...EMPTY_ORDER_LINE,
          key: `line-${Date.now()}-${prev.length + 1}`,
          productId,
          quantity: 1
        }
      ];
    });
    setOrderCreateSearch("");
  }

  function updateOrderCreateItem(index, patch) {
    setOrderCreateItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeOrderCreateItem(index) {
    setOrderCreateItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function selectConsultationCalendarSlot(dateValue, timeValue = "09:00", minutes = consultationDuration) {
    const startAt = buildDateTimeLocalValue(dateValue, timeValue);
    if (!startAt || !isFutureLocalDateTimeValue(startAt)) {
      return;
    }
    const endAt = addMinutesToLocalValue(startAt, minutes);
    setConsultationCreateForm((prev) => ({
      ...prev,
      startAt,
      endAt
    }));
    setConsultationBookingDate(localDateKey(startAt));
    setConsultationCreateCalendarViewDate(new Date(`${localDateKey(startAt)}T00:00:00`));
  }

  function selectConsultationBookingDate(dateKey, date) {
    const bookedSlots = new Set(
      consultationDoctorAppointments
        .filter((appointment) => localDateKey(appointment.start_at) === dateKey)
        .map((appointment) => localTimeKey(appointment.start_at))
        .filter(Boolean)
    );
    const nextTime = BOOKING_SLOT_TIMES.find((time) => !bookedSlots.has(time) && isFutureLocalDateTimeValue(buildDateTimeLocalValue(dateKey, time))) || "";
    setConsultationBookingDate(dateKey);
    setConsultationCreateCalendarViewDate(date || new Date(`${dateKey}T00:00:00`));
    if (nextTime) {
      selectConsultationCalendarSlot(dateKey, nextTime, consultationDuration);
      return;
    }
    setConsultationCreateForm((prev) => ({
      ...prev,
      startAt: "",
      endAt: ""
    }));
  }

  function clearConsultationBookingDate() {
    setConsultationBookingDate("");
    setConsultationCreateForm((prev) => ({
      ...prev,
      startAt: "",
      endAt: ""
    }));
  }

  function selectConsultationDoctor(doctorId, label = "") {
    setConsultationCreateForm((prev) => ({
      ...prev,
      doctorUserId: String(doctorId || ""),
      startAt: "",
      endAt: ""
    }));
    setConsultationDoctorSearch(label);
    setConsultationBookingDate("");
  }

  function switchPage(pageId) {
    startTransition(() => {
      setCurrentPage(normalizePageId(pageId));
      setSidebarOpen(false);
    });
  }

  function patchCacheList(predicate, updater, { revalidate = false } = {}) {
    globalMutate(predicate, (current) => updateListPayload(current, updater), { revalidate });
  }

  function revalidateCacheGroups(...predicates) {
    predicates.forEach((predicate) => {
      globalMutate(predicate, undefined, { revalidate: true });
    });
  }

  function patchOrderCache(order) {
    patchCacheList(isOrderListKey, (list) => upsertById(list, order));
  }

  function patchAppointmentCache(appointment) {
    patchCacheList(isAppointmentListKey, (list) => upsertById(list, appointment));
  }

  function patchDoctorCache(doctor) {
    patchCacheList(isDoctorListKey, (list) => upsertById(list, doctor));
  }

  function patchCustomerCache(customer) {
    patchCacheList(isCustomerListKey, (list) => upsertById(list, customer));
  }

  function syncOrderState(nextOrder) {
    setData((prev) => ({
      ...prev,
      orderDetails: (prev.orderDetails || []).some((order) => order.id === nextOrder.id)
        ? (prev.orderDetails || []).map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order))
        : [nextOrder, ...(prev.orderDetails || [])],
      orders: (prev.orders || []).some((order) => order.id === nextOrder.id)
        ? (prev.orders || []).map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order))
        : [nextOrder, ...(prev.orders || [])]
    }));
    setSelectedOrderDetail(nextOrder);
    setSelectedOrderId(nextOrder.id);
    patchOrderCache(nextOrder);
    revalidateCacheGroups(isOrderListKey, isAdminSummaryKey);
  }

  function removeOrderState(orderId) {
    setData((prev) => ({
      ...prev,
      orderDetails: (prev.orderDetails || []).filter((order) => order.id !== orderId),
      orders: (prev.orders || []).filter((order) => order.id !== orderId)
    }));
    setSelectedOrderId(null);
    setSelectedOrderDetail(null);
    setSelectedOrderDoctorId("");
    setSelectedOrderStatus("");
    setSelectedOrderNote("");
    closeOrderModal();
    patchCacheList(isOrderListKey, (list) => removeById(list, orderId));
    revalidateCacheGroups(isOrderListKey, isAdminSummaryKey);
  }

  function waitForDeleteExit() {
    return new Promise((resolve) => window.setTimeout(resolve, DELETE_EXIT_DURATION));
  }

  function markOrderDeleting(orderId) {
    setDeletingOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
  }

  function clearOrderDeleting(orderId) {
    setDeletingOrderIds((prev) => prev.filter((id) => id !== orderId));
  }

  async function openOrderDetails(orderId) {
    const cachedOrder = [...(data.orderDetails || []), ...(data.orders || [])].find((order) => order.id === orderId);
    closeAllOrderPopups();
    setSelectedOrderId(orderId);
    if (cachedOrder) {
      setSelectedOrderDetail(cachedOrder);
      setSelectedOrderDoctorId(cachedOrder.assigned_doctor_user_id ? String(cachedOrder.assigned_doctor_user_id) : "");
      setSelectedOrderStatus(cachedOrder.status || "");
      setSelectedOrderNote(cachedOrder.customer_note || "");
    } else {
      setSelectedOrderDetail(null);
      setSelectedOrderDoctorId("");
      setSelectedOrderStatus("");
      setSelectedOrderNote("");
    }
    setOrderModalOpen(true);
    setOrderDetailLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${orderId}`);
      const nextOrder = payload?.data;
      if (nextOrder) {
        setSelectedOrderDetail(nextOrder);
        setSelectedOrderDoctorId(nextOrder.assigned_doctor_user_id ? String(nextOrder.assigned_doctor_user_id) : "");
        setSelectedOrderStatus(nextOrder.status || "");
        setSelectedOrderNote(nextOrder.customer_note || "");
        syncOrderState(nextOrder);
      }
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderDetailLoading(false);
    }
  }

  async function saveSelectedOrder() {
    if (!selectedOrderDetail) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await updateOrderStatusMutation.updateOrderStatus(
        selectedOrderDetail.id,
        {
          status: selectedOrderStatus,
          customer_note: selectedOrderNote,
          notify_status_change: selectedOrderStatus !== selectedOrderDetail.status,
          notify_doctor: selectedOrderStatus !== selectedOrderDetail.status,
          notify_admin: selectedOrderStatus !== selectedOrderDetail.status,
          notify_customer: selectedOrderStatus !== selectedOrderDetail.status && shouldNotifyCustomerForOrderStatus(selectedOrderStatus)
        },
        {
          ...selectedOrderDetail,
          status: selectedOrderStatus,
          customer_note: selectedOrderNote
        }
      );
      syncOrderState(payload.data);
      setOrderActionFeedback("Order updated.");
      setOrderControlsModalOpen(false);
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function createOrderFromForm(event) {
    event.preventDefault();
    const lineItems = orderCreateItems
      .map((item) => ({
        product_id: Number(item.productId || 0),
        quantity: Number(item.quantity || 1)
      }))
      .filter((item) => item.product_id && item.quantity > 0);

    if (!lineItems.length) {
      setOrderCreateFeedback("Add at least one product before creating the order.");
      showSnackbar("Add at least one product before creating the order.", "warning");
      return;
    }

    const selectedDoctorId = orderCreateForm.doctorId ? String(orderCreateForm.doctorId) : "";
    const doctorIsValid = !selectedDoctorId || popupOrderDoctors.some((doctor) => String(doctor.user_id || doctor.id) === selectedDoctorId);
    if (!doctorIsValid) {
      const message = "Please choose a valid doctor from the dropdown or leave the field blank.";
      setOrderCreateFeedback(message);
      showSnackbar(message, "warning");
      return;
    }

    setOrderCreateLoading(true);
    setOrderCreateFeedback("");
    try {
      const payload = await apiRequest("/orders", {
        method: "POST",
        body: {
          product_id: lineItems[0].product_id,
          quantity: lineItems[0].quantity,
          items: lineItems,
          status: orderCreateForm.status,
          notify_status_change: true,
          notify_doctor: true,
          notify_admin: true,
          notify_customer: shouldNotifyCustomerForOrderStatus(orderCreateForm.status),
          doctor_user_id: selectedDoctorId ? Number(selectedDoctorId) : 0,
          customer_note: orderCreateForm.note,
          billing: {
            first_name: orderCreateForm.firstName,
            last_name: orderCreateForm.lastName,
            email: orderCreateForm.email,
            phone: orderCreateForm.phone,
            address_1: orderCreateForm.address,
            city: orderCreateForm.city,
            state: orderCreateForm.state,
            postcode: orderCreateForm.postcode,
            country: orderCreateForm.country
          }
        }
      });
      syncOrderState(payload.data);
      setOrderCreateForm(EMPTY_ORDER_FORM);
      setOrderCreateItems([]);
      setOrderCreateSearch("");
      setOrderCreateFeedback("Order created.");
      showSnackbar("Order created.", "success");
      setOrderCreateModalOpen(false);
      setOrderModalOpen(true);
    } catch (error) {
      const message = parseCreateError(error, "customer");
      setOrderCreateFeedback(message);
      showSnackbar(message, "error");
    } finally {
      setOrderCreateLoading(false);
    }
  }

  async function submitGenericCreate(event) {
    event.preventDefault();
    setCreateLoading(true);
    setCreateFeedback("");
    try {
      if (createModalType === "product") {
        const payload = await apiRequest("/products", {
          method: "POST",
          body: {
            name: productCreateForm.name,
            sku: productCreateForm.sku,
            regular_price: productCreateForm.regularPrice,
            sale_price: productCreateForm.salePrice,
            status: productCreateForm.status,
            stock_status: productCreateForm.stockStatus,
            stock_quantity: Number(productCreateForm.stockQuantity || 0),
            categories: productCreateForm.category ? [productCreateForm.category] : [],
            catalog_visibility: productCreateForm.visibility
          }
        });
        if (payload?.data) {
          setData((prev) => ({ ...prev, products: [payload.data, ...(prev.products || [])] }));
        }
        setCreateFeedback("Product created.");
        showSnackbar("Product created.", "success");
        closeCreateModal();
      } else if (createModalType === "consultation") {
        if (!consultationCreateForm.doctorUserId || !consultationCreateForm.patientUserId || !consultationCreateForm.startAt || !consultationCreateForm.endAt || !consultationCreateForm.type) {
          const message = "Select a doctor, patient, date, time, and consultation type before creating the consultation.";
          setCreateFeedback(message);
          showSnackbar(message, "warning");
          setCreateLoading(false);
          return;
        }
        if (!isFutureLocalDateTimeValue(consultationCreateForm.startAt) || !isFutureLocalDateTimeValue(consultationCreateForm.endAt)) {
          const message = "Choose a future date and time for the consultation.";
          setCreateFeedback(message);
          showSnackbar(message, "warning");
          setCreateLoading(false);
          return;
        }
        const doubleBooked = consultationDoctorAppointments.some((appointment) => (
          localDateKey(appointment.start_at) === localDateKey(consultationCreateForm.startAt)
          && localTimeKey(appointment.start_at) === localTimeKey(consultationCreateForm.startAt)
        ));
        if (doubleBooked) {
          const message = "That time slot is no longer available. Choose another slot.";
          setCreateFeedback(message);
          showSnackbar(message, "error");
          setCreateLoading(false);
          return;
        }
        const payload = await apiRequest("/appointments", {
          method: "POST",
          body: {
            patient_user_id: consultationCreateForm.patientUserId ? Number(consultationCreateForm.patientUserId) : 0,
            doctor_user_id: consultationCreateForm.doctorUserId ? Number(consultationCreateForm.doctorUserId) : 0,
            start_at: consultationCreateForm.startAt,
            end_at: consultationCreateForm.endAt,
            type: consultationCreateForm.type,
            reason: consultationCreateForm.reason,
            status: consultationCreateForm.status,
            generate_google_meet: consultationCreateForm.type === "video",
            create_meeting: consultationCreateForm.type === "video",
            notify_patient: true,
            notify_doctor: true,
            notify_admin: true,
            email_template_key: "appointment-approved",
            email_hooks: {
              patient_name: consultationSelectedPatient?.name || "",
              doctor_name: consultationDoctorProfile?.display_name || "",
              booking_date: formatDate(consultationCreateForm.startAt),
              booking_time: localTimeKey(consultationCreateForm.startAt),
              consultation_type: consultationCreateForm.type,
              consultation_status: consultationCreateForm.status,
              google_meet_link: "{google_meet_link}"
            }
          }
        });
        if (payload?.data) {
          setData((prev) => ({ ...prev, appointments: [payload.data, ...(prev.appointments || [])] }));
          patchAppointmentCache(payload.data);
          revalidateCacheGroups(isAppointmentListKey, isAdminSummaryKey);
        }
        setCreateFeedback("Consultation created.");
        showSnackbar("Consultation created.", "success");
        closeCreateModal();
      } else if (createModalType === "doctor") {
        const payload = await apiRequest("/doctors", {
          method: "POST",
          body: {
            display_name: doctorCreateForm.fullName,
            email: doctorCreateForm.email,
            specialty: doctorCreateForm.specialty,
            location: doctorCreateForm.location,
            status: doctorCreateForm.status,
            bio: doctorCreateForm.bio,
            pricing_tier: normalizeDoctorTierOption(doctorCreateForm.pricingTier),
            consultation_fee: consultationFeeForTier(doctorCreateForm.pricingTier),
            product_category_ids: doctorCreateForm.productCategoryIds.map(Number)
          }
        });
        if (payload?.data) {
          setData((prev) => ({ ...prev, doctors: [payload.data, ...(prev.doctors || [])] }));
          patchDoctorCache(payload.data);
          revalidateCacheGroups(isDoctorListKey);
        }
        setCreateFeedback("Doctor created.");
        showSnackbar("Doctor created.", "success");
        closeCreateModal();
      } else if (createModalType === "customer") {
        const { firstName, lastName, fullName } = splitFullName(customerCreateForm.fullName);
        const payload = await apiRequest("/customers", {
          method: "POST",
          body: {
            display_name: fullName,
            first_name: firstName,
            last_name: lastName,
            email: customerCreateForm.email,
            phone: customerCreateForm.phone,
            address: customerCreateForm.address
          }
        });
        if (payload?.data) {
          setData((prev) => ({ ...prev, customers: [payload.data, ...(prev.customers || [])] }));
          patchCustomerCache(payload.data);
          revalidateCacheGroups(isCustomerListKey);
        }
        setCreateFeedback("Customer created.");
        showSnackbar("Customer created.", "success");
        closeCreateModal();
      }
    } catch (error) {
      const entityLabel = createModalType === "doctor" ? "doctor" : "customer";
      const message = parseCreateError(error, entityLabel);
      setCreateFeedback(message);
      showSnackbar(message, "error");
    } finally {
      setCreateLoading(false);
    }
  }

  async function assignSelectedOrderDoctor() {
    if (!selectedOrderDetail || !selectedOrderDoctorId) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${selectedOrderDetail.id}/assign-doctor`, {
        method: "POST",
        body: { doctor_user_id: Number(selectedOrderDoctorId) }
      });
      syncOrderState(payload.data);
      setOrderActionFeedback("Doctor assigned and notified.");
      setDoctorAssignmentModalOpen(false);
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function updateDoctorPricingTier(doctor, pricingTier) {
    if (!doctor) {
      return;
    }
    const doctorId = doctor.user_id || doctor.id;
    if (!doctorId) {
      return;
    }
    setDoctorDetailTierLoading(true);
    try {
      const consultationFee = consultationFeeForTier(pricingTier);
      const payload = await apiRequest(`/doctors/${doctorId}`, {
        method: "POST",
        body: {
          pricing_tier: normalizeDoctorTierOption(pricingTier),
          consultation_fee: consultationFee
        }
      });
      const nextDoctor = payload?.data || { ...doctor, pricing_tier: normalizeDoctorTierOption(pricingTier), consultation_fee: consultationFee };
      setData((prev) => ({
        ...prev,
        doctors: (prev.doctors || []).map((item) => (
          String(item.user_id || item.id) === String(doctorId)
            ? { ...item, ...nextDoctor }
            : item
        ))
      }));
      patchDoctorCache(nextDoctor);
      revalidateCacheGroups(isDoctorListKey);
      showSnackbar(`${nextDoctor.display_name || doctor.display_name || "Doctor"} moved to the ${formatPricingTierLabel(pricingTier)} tier.`, "success");
    } catch (error) {
      const message = extractApiErrorMessage(error) || "Doctor tier could not be updated.";
      showSnackbar(message, "error");
    } finally {
      setDoctorDetailTierLoading(false);
    }
  }

  async function suspendSelectedDoctor() {
    if (!selectedDoctorProfile) {
      return;
    }
    const doctorId = selectedDoctorProfile.user_id || selectedDoctorProfile.id;
    if (!doctorId) {
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`Suspend ${selectedDoctorProfile.display_name || "this doctor"}?`)) {
      return;
    }
    setDoctorDetailTierLoading(true);
    try {
      let payload;
      try {
        payload = await apiRequest(`/doctors/${doctorId}/suspend`, {
          method: "POST",
          body: {
            status: "suspended"
          }
        });
      } catch (error) {
        if (!/required service is unavailable|not found|no route/i.test(String(error?.message || ""))) {
          throw error;
        }
        payload = await apiRequest(`/doctors/${doctorId}`, {
          method: "POST",
          body: {
            status: "suspended"
          }
        });
      }
      const nextDoctor = payload?.data || { ...selectedDoctorProfile, status: "suspended" };
      setData((prev) => ({
        ...prev,
        doctors: (prev.doctors || []).map((doctor) => (
          String(doctor.user_id || doctor.id) === String(doctorId)
            ? { ...doctor, ...nextDoctor }
            : doctor
        ))
      }));
      patchDoctorCache(nextDoctor);
      revalidateCacheGroups(isDoctorListKey);
      showSnackbar(`${nextDoctor.display_name || selectedDoctorProfile.display_name || "Doctor"} suspended.`, "success");
    } catch (error) {
      const message = extractApiErrorMessage(error) || "Doctor could not be suspended.";
      showSnackbar(message, "error");
    } finally {
      setDoctorDetailTierLoading(false);
    }
  }

  async function resetSelectedDoctorPassword() {
    if (!selectedDoctorProfile) {
      return;
    }
    const doctorId = selectedDoctorProfile.user_id || selectedDoctorProfile.id;
    if (!doctorId) {
      return;
    }
    setDoctorDetailTierLoading(true);
    try {
      await apiRequest(`/doctors/${doctorId}/reset-password`, {
        method: "POST",
        body: {
          send_email: true
        }
      });
      showSnackbar(`Password reset email sent to ${selectedDoctorProfile.email || "the doctor"}.`, "success");
    } catch (error) {
      const message = extractApiErrorMessage(error) || "Password reset email could not be sent.";
      showSnackbar(message, "error");
    } finally {
      setDoctorDetailTierLoading(false);
    }
  }

  async function deleteSelectedDoctor() {
    if (!selectedDoctorProfile) {
      return;
    }
    const doctorId = selectedDoctorProfile.user_id || selectedDoctorProfile.id;
    if (!doctorId) {
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`Delete ${selectedDoctorProfile.display_name || "this doctor"}?`)) {
      return;
    }
    setDoctorDetailTierLoading(true);
    try {
      await apiRequest(`/doctors/${doctorId}`, { method: "DELETE" });
      setData((prev) => ({
        ...prev,
        doctors: (prev.doctors || []).filter((doctor) => String(doctor.user_id || doctor.id) !== String(doctorId))
      }));
      patchCacheList(isDoctorListKey, (list) => list.filter((doctor) => String(doctor.user_id || doctor.id) !== String(doctorId)));
      revalidateCacheGroups(isDoctorListKey);
      setSelectedDoctorId(null);
      showSnackbar("Doctor deleted.", "success");
    } catch (error) {
      const message = extractApiErrorMessage(error) || "Doctor could not be deleted.";
      showSnackbar(message, "error");
    } finally {
      setDoctorDetailTierLoading(false);
    }
  }

  async function deleteSelectedOrder() {
    if (!selectedOrderDetail || typeof window === "undefined") {
      return;
    }
    if (!window.confirm(`Delete order #${selectedOrderDetail.number}?`)) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      await apiRequest(`/orders/${selectedOrderDetail.id}`, { method: "DELETE" });
      markOrderDeleting(selectedOrderDetail.id);
      await waitForDeleteExit();
      removeOrderState(selectedOrderDetail.id);
      clearOrderDeleting(selectedOrderDetail.id);
      setOrderActionFeedback("Order deleted.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function printSelectedOrder() {
    if (typeof window === "undefined" || !selectedOrderDetail) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const documentType = getOrderDocumentType(selectedOrderDetail);
      await printReceiptForOrder(selectedOrderDetail, { documentType });
      setOrderActionFeedback(`${documentType === "receipt" ? "Receipt" : "Invoice"} PDF generated.`);
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function refundSelectedOrder() {
    if (!selectedOrderDetail) {
      return;
    }
    setOrderMutationLoading(true);
    setOrderActionFeedback("");
    try {
      const payload = await apiRequest(`/orders/${selectedOrderDetail.id}`, {
        method: "POST",
        body: {
          status: "refunded",
          customer_note: selectedOrderNote
        }
      });
      syncOrderState(payload.data);
      setSelectedOrderStatus(payload?.data?.status || "refunded");
      setOrderActionFeedback("Order marked as refunded. Capture gateway-side refund separately if required.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  async function contactSelectedCustomer() {
    if (typeof window === "undefined" || !selectedOrderDetail) {
      return;
    }
    setOrderEmailActionLoading(String(selectedOrderDetail.id || selectedOrderDetail.number || "order"));
    setOrderActionFeedback("");
    try {
      const payload = await sendOrderDocumentEmail(selectedOrderDetail);
      const email = payload?.data?.recipient_email || customerEmail(selectedOrderDetail) || "the customer";
      setOrderActionFeedback(`Order email sent to ${email}.`);
      showSnackbar(`Order email sent to ${email}.`, "success");
    } catch (error) {
      const message = describeRequestError(error);
      setOrderActionFeedback(message);
      showSnackbar(message, "error");
    } finally {
      setOrderEmailActionLoading("");
    }
  }

  function openOrderControlsPopup() {
    if (!selectedOrderDetail) {
      return;
    }
    setOrderCreateModalOpen(false);
    setDoctorAssignmentModalOpen(false);
    setOrderControlsModalOpen(true);
  }

  function openDoctorAssignmentPopup() {
    if (!selectedOrderDetail) {
      return;
    }
    setOrderCreateModalOpen(false);
    setDoctorAssignmentModalOpen(true);
  }

  async function openPaymentReceipt(order) {
    if (!order) {
      return;
    }
    setSelectedPaymentReceipt(order);
    setPaymentReceiptFeedback("Loading payment details...");
    setReceiptActionLoading("");
    setPaymentReceiptModalOpen(true);
    try {
      const payload = await apiRequest(`/orders/${order.id}`);
      const nextOrder = payload?.data || order;
      setSelectedPaymentReceipt(nextOrder);
      setPaymentReceiptFeedback("");
      syncOrderState(nextOrder);
    } catch (error) {
      const message = describeRequestError(error);
      setPaymentReceiptFeedback(message);
      showSnackbar(message, "error");
    }
  }

  async function openCustomerDetails(customer) {
    setSelectedCustomerId(customer.id);
    setCustomerDetailTab("details");
    setCustomerOrderPage(1);
    setCustomerProductPage(1);
    setCustomerHistoryFeedback("");

    const cachedOrders = (data.orderDetails || []).filter((order) => (
      customer.id === (order.customer_id || `guest-${customerEmail(order) || order.number || order.id}`)
    ));
    setCustomerHistoryOrders(cachedOrders);

    const params = { per_page: 100 };
    if (/^\d+$/.test(String(customer.id))) {
      params.patient_id = customer.id;
    } else if (customer.email && customer.email !== "No email on file") {
      params.customer_email = customer.email;
    } else {
      return;
    }

    setCustomerHistoryLoading(true);
    try {
      const payload = await apiRequest("/orders", { params });
      const orders = payload.data || [];
      const orderDetailsResults = await Promise.allSettled(
        orders.map((order) => apiRequest(`/orders/${order.id}`).then((response) => response.data).catch(() => order))
      );
      setCustomerHistoryOrders(orderDetailsResults.map((result, index) => getSettledValue(result, orders[index])));
    } catch (error) {
      setCustomerHistoryFeedback(describeRequestError(error));
    } finally {
      setCustomerHistoryLoading(false);
    }
  }

  async function printOrderReceiptFromRow(order) {
    if (typeof window === "undefined" || !order) {
      return;
    }
    await performTableOrderAction("print", order, async () => {
      await printReceiptForOrder(order, { documentType: "receipt", statusMode: "payment" });
      return `Receipt for order #${order.number || order.id} is ready.`;
    });
  }

  async function printOrderDocumentFromRow(order) {
    if (typeof window === "undefined" || !order) {
      return;
    }
    await performTableOrderAction("print", order, async () => {
      const documentType = getOrderDocumentType(order);
      await printReceiptForOrder(order, { documentType });
      return `${documentType === "receipt" ? "Receipt" : "Invoice"} for order #${order.number || order.id} is ready.`;
    });
  }

  async function downloadOrderReceiptFromRow(order) {
    if (typeof window === "undefined" || !order) {
      return;
    }
    await performTableOrderAction("download", order, async () => {
      await downloadReceiptForOrder(order, { documentType: "receipt" });
      return `Receipt PDF viewer opened for order #${order.number || order.id}.`;
    });
  }

  async function sendOrderReceiptFromRow(order) {
    if (!order) {
      return;
    }
    await performTableOrderAction("send", order, async () => {
      let message = "";
      await sendReceiptForOrder(order, { feedback: (nextMessage) => { message = nextMessage; } });
      return message || `Receipt sent for order #${order.number || order.id}.`;
    });
  }

  async function openOrderStatusFromRow(order) {
    if (!order) {
      return;
    }
    await performTableOrderAction("status", order, async () => {
      await openOrderDetails(order.id);
      setOrderCreateModalOpen(false);
      setDoctorAssignmentModalOpen(false);
      setOrderControlsModalOpen(true);
      return `Order #${order.number || order.id} controls opened.`;
    });
  }

  async function deleteOrderFromRow(order) {
    if (!order || typeof window === "undefined") {
      return;
    }
    if (!window.confirm(`Delete order #${order.number}?`)) {
      return;
    }
    await performTableOrderAction("delete", order, async () => {
      await apiRequest(`/orders/${order.id}`, { method: "DELETE" });
      markOrderDeleting(order.id);
      await waitForDeleteExit();
      removeOrderState(order.id);
      clearOrderDeleting(order.id);
      return `Order #${order.number || order.id} deleted.`;
    });
  }

  function closeCustomerDetails() {
    setSelectedCustomerId(null);
    setCustomerDetailTab("details");
    setCustomerOrderPage(1);
    setCustomerProductPage(1);
    setCustomerHistoryOrders([]);
    setCustomerHistoryLoading(false);
    setCustomerHistoryFeedback("");
  }

  async function openCustomerOrderInOrdersPage(orderId) {
    closeCustomerDetails();
    switchPage("orders");
    await openOrderDetails(orderId);
  }

  async function printPaymentReceipt() {
    if (!selectedPaymentReceipt) {
      return;
    }

    setReceiptActionLoading("print");
    setPaymentReceiptFeedback("");
    try {
      await printReceiptForOrder(selectedPaymentReceipt, { documentType: "receipt" });
      setPaymentReceiptFeedback("Printable PDF receipt generated.");
      showSnackbar(`Receipt for order #${selectedPaymentReceipt.number || selectedPaymentReceipt.id} is ready.`, "success");
    } catch (error) {
      const message = describeRequestError(error);
      setPaymentReceiptFeedback(message);
      showSnackbar(message, "error");
    } finally {
      setReceiptActionLoading("");
    }
  }

  async function sendPaymentReceipt() {
    if (!selectedPaymentReceipt) {
      return;
    }

    setReceiptActionLoading("send");
    setPaymentReceiptFeedback("");
    try {
      let message = "";
      await sendReceiptForOrder(selectedPaymentReceipt, { documentType: "receipt", feedback: (nextMessage) => { message = nextMessage; } });
      const finalMessage = message || `Receipt sent to ${customerEmail(selectedPaymentReceipt) || "the customer"}.`;
      setPaymentReceiptFeedback(finalMessage);
      showSnackbar(finalMessage, "success");
    } catch (error) {
      const message = describeRequestError(error);
      setPaymentReceiptFeedback(message);
      showSnackbar(message, "error");
    } finally {
      setReceiptActionLoading("");
    }
  }

  function closeProductEditModal() {
    setSelectedProductEdit(null);
    setProductEditForm(null);
    setProductEditMedia([]);
    setActiveProductMediaId("");
    setProductEditTab("details");
    setProductEditSearch({ categories: "", tags: "", brands: "" });
    setProductEditFeedback("");
    setProductEditLoading(false);
    setProductMediaUploading(false);
    setProductEditorMode("edit");
  }

  function openProductEditModal(product) {
    if (!product) {
      return;
    }
    const nextMedia = extractProductMediaItems(product);
    setProductEditorMode("edit");
    setSelectedProductEdit(product);
    setProductEditForm(buildProductEditDraft(product));
    setProductEditMedia(nextMedia);
    setActiveProductMediaId(nextMedia[0]?.id || "");
    setProductEditTab("details");
    setProductEditSearch({ categories: "", tags: "", brands: "" });
    setProductEditFeedback("");
  }

  function openProductCreateModal() {
    closeProductEditModal();
    setProductEditorMode("create");
    setSelectedProductEdit(null);
    setProductEditForm(buildEmptyProductDraft());
    setProductEditMedia([]);
    setActiveProductMediaId("");
    setProductEditTab("details");
    setProductEditSearch({ categories: "", tags: "", brands: "" });
    setProductEditFeedback("");
    setProductEditLoading(false);
    setProductMediaUploading(false);
  }

  function triggerProductMediaUpload(type, index = null) {
    if (productMediaUploading || productEditLoading) {
      return;
    }
    productMediaUploadModeRef.current = { type, index };
    if (productMediaInputRef.current) {
      productMediaInputRef.current.value = "";
    }
    productMediaInputRef.current?.click();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        resolve(raw.includes(",") ? raw.split(",").pop() : raw);
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadProductMediaFile(file) {
    const dataBase64 = await fileToBase64(file);
    const payload = await apiRequest("/products/media", {
      method: "POST",
      body: {
        filename: file.name,
        mime_type: file.type,
        data_base64: dataBase64
      }
    });
    const uploaded = payload?.data;
    if (!uploaded?.id || !uploaded?.src) {
      throw new Error("Image upload did not return a usable media item.");
    }
    return {
      id: String(uploaded.id),
      attachmentId: Number(uploaded.id),
      src: uploaded.src,
      alt: uploaded.alt || file.name || "Uploaded product image"
    };
  }

  async function handleProductMediaUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }
    setProductMediaUploading(true);
    setProductEditFeedback("Uploading image...");
    try {
      const nextItems = await Promise.all(files.map(uploadProductMediaFile));
      const uploadMode = productMediaUploadModeRef.current;
      setProductEditMedia((prev) => {
        if (uploadMode.type === "replace" && uploadMode.index !== null && prev[uploadMode.index]) {
          const next = [...prev];
          next[uploadMode.index] = nextItems[0];
          setActiveProductMediaId(next[uploadMode.index].id);
          return next;
        }
        const merged = [...prev, ...nextItems];
        if (!activeProductMediaId && merged[0]) {
          setActiveProductMediaId(merged[0].id);
        }
        return merged;
      });
      setProductEditFeedback("Image uploaded.");
    } catch (error) {
      setProductEditFeedback(describeRequestError(error));
    } finally {
      setProductMediaUploading(false);
      event.target.value = "";
    }
  }

  function removeProductMediaItem(index) {
    setProductEditMedia((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      if (!next.some((item) => item.id === activeProductMediaId)) {
        setActiveProductMediaId(next[0]?.id || "");
      }
      return next;
    });
  }

  function moveProductMediaItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex === null || toIndex === null) {
      return;
    }
    setProductEditMedia((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleProductDescriptionInput(event) {
    const html = event.currentTarget.innerHTML;
    setProductEditForm((prev) => (prev ? { ...prev, longDescription: html } : prev));
  }

  function formatProductDescription(command, value = null) {
    if (typeof document === "undefined") {
      return;
    }
    productDescriptionEditorRef.current?.focus();
    document.execCommand(command, false, value);
    const html = productDescriptionEditorRef.current?.innerHTML || "";
    setProductEditForm((prev) => (prev ? { ...prev, longDescription: html } : prev));
  }

  function formatProductBlock(tagName) {
    formatProductDescription("formatBlock", tagName);
  }

  function insertProductDescriptionLink() {
    if (typeof window === "undefined") {
      return;
    }
    const href = window.prompt("Enter link URL");
    if (href) {
      formatProductDescription("createLink", href);
    }
  }

  function toggleProductTerm(field, value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }
    setProductEditForm((prev) => {
      if (!prev) {
        return prev;
      }
      const exists = prev[field].includes(normalizedValue);
      return {
        ...prev,
        [field]: exists ? prev[field].filter((item) => item !== normalizedValue) : [...prev[field], normalizedValue]
      };
    });
  }

  function addProductTerm(field) {
    const query = String(productEditSearch[field] || "").trim();
    if (!query) {
      return;
    }
    toggleProductTerm(field, query);
    setProductEditSearch((prev) => ({ ...prev, [field]: "" }));
  }

  async function saveProductEdits(event) {
    event.preventDefault();
    if (!productEditForm) {
      return;
    }

    setProductEditLoading(true);
    setProductEditFeedback("");
    try {
      const productPayload = {
        name: productEditForm.title,
        short_description: productEditForm.shortDescription,
        description: productEditForm.longDescription,
        status: productEditForm.status,
        regular_price: productEditForm.regularPrice,
        sale_price: productEditForm.salePrice,
        sku: productEditForm.sku,
        stock_quantity: Number(productEditForm.stockQuantity || 0),
        categories: productEditForm.categories,
        tags: productEditForm.tags,
        brands: productEditForm.brands,
        purchase_note: productEditForm.purchaseNotes,
        shipping_information: productEditForm.shippingInfo,
        linked_products: productEditForm.linkedProducts,
        images: productEditMedia.map((item, index) => ({ id: item.attachmentId, src: item.src, position: index }))
      };

      if (productEditorMode === "create") {
        const createdPayload = await createProductMutation.createProduct({
          ...productPayload,
          catalog_visibility: "visible"
        });
        const createdProduct = createdPayload?.data;
        if (!createdProduct) {
          throw new Error("Product creation returned no data.");
        }
        const mediaUpdatePayload = productEditMedia.length ? await updateProductMutation.updateProduct(
          createdProduct.id,
          {
            images: productEditMedia.map((item, index) => ({ id: item.attachmentId, src: item.src, position: index }))
          },
          createdProduct
        ) : null;
        const nextProduct = mediaUpdatePayload?.data || createdProduct;
        setData((prev) => ({
          ...prev,
          products: [nextProduct, ...(prev.products || [])]
        }));
        setProductEditFeedback("Product created.");
        closeProductEditModal();
      } else {
        const optimisticProduct = {
          ...selectedProductEdit,
          ...productPayload,
          images: productEditMedia.map((item) => ({ id: item.attachmentId, src: item.src, alt: item.alt }))
        };
        const payload = await updateProductMutation.updateProduct(selectedProductEdit.id, productPayload, optimisticProduct);

        const nextProduct = payload?.data || optimisticProduct;

        setData((prev) => ({
          ...prev,
          products: (prev.products || []).map((product) => (product.id === nextProduct.id ? { ...product, ...nextProduct } : product))
        }));
        setSelectedProductEdit(nextProduct);
        setProductEditFeedback("Product updated.");
      }
    } catch (error) {
      setProductEditFeedback(describeRequestError(error));
    } finally {
      setProductEditLoading(false);
    }
  }

  async function trashProduct(product, { closeEditor = false, skipConfirm = false } = {}) {
    if (!product || typeof window === "undefined") {
      return;
    }
    if (!skipConfirm && !window.confirm(`Delete ${product.name || "this product"}?`)) {
      return;
    }

    const wasSelected = selectedProductEdit?.id === product.id;
    if (wasSelected) {
      setProductEditLoading(true);
      setProductEditFeedback("");
    }

    try {
      setDeletingProductIds((prev) => (prev.includes(product.id) ? prev : [...prev, product.id]));
      await deleteProductMutation.deleteProduct(product.id);
      await waitForDeleteExit();
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).filter((item) => item.id !== product.id)
      }));
      setSelectedProductIds((prev) => prev.filter((id) => id !== product.id));
      setDeletingProductIds((prev) => prev.filter((id) => id !== product.id));
      if (wasSelected || closeEditor) {
        closeProductEditModal();
      }
    } catch (error) {
      if (wasSelected) {
        setProductEditFeedback(describeRequestError(error));
        setProductEditLoading(false);
      }
      return;
    }
  }

  async function duplicateProduct(product) {
    if (!product) {
      return;
    }
    setDuplicatingProductId(product.id);
    try {
      const payload = await apiRequest(`/products/${product.id}/duplicate`, {
        method: "POST"
      });
      if (payload?.data) {
        setData((prev) => ({
          ...prev,
          products: [payload.data, ...(prev.products || [])]
        }));
        patchCacheList(isProductListKey, (list) => upsertById(list, payload.data));
        revalidateCacheGroups(isProductListKey, isProductCategoryListKey, isProductTagListKey);
      }
    } catch (error) {
      setProductEditFeedback(describeRequestError(error));
    } finally {
      setDuplicatingProductId(null);
    }
  }

  async function addProductToCategory(product, category) {
    if (!product || !category) {
      return;
    }
    const loadingKey = `${product.id}:${category.name}`;
    setCategoryAssignmentLoading(loadingKey);
    setCategoryAssignmentFeedback("");
    const previousProduct = product;
    try {
      const existingCategories = getProductCategories(product).split(",").map((item) => item.trim()).filter(Boolean);
      const nextCategories = Array.from(new Set([...existingCategories, category.name]));
      const optimisticProduct = { ...product, categories: nextCategories };
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).map((item) => (item.id === product.id ? { ...item, ...optimisticProduct } : item))
      }));
      patchCacheList(isProductListKey, (list) => replaceById(list, optimisticProduct));
      setCategoryProductSearch("");
      const payload = await apiRequest(`/products/${product.id}`, {
        method: "POST",
        body: {
          categories: nextCategories
        }
      });
      const nextProduct = payload?.data || optimisticProduct;
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).map((item) => (item.id === product.id ? { ...item, ...nextProduct } : item))
      }));
      patchCacheList(isProductListKey, (list) => replaceById(list, nextProduct));
      revalidateCacheGroups(isProductListKey, isProductCategoryListKey, isProductTagListKey);
      showSnackbar(`${product.name || "Product"} added to ${category.name}.`, "success");
    } catch (error) {
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).map((item) => (item.id === product.id ? previousProduct : item))
      }));
      patchCacheList(isProductListKey, (list) => replaceById(list, previousProduct));
      showSnackbar(describeRequestError(error), "error");
    } finally {
      setCategoryAssignmentLoading("");
    }
  }

  async function removeProductFromCategory(product, category) {
    if (!product || !category) {
      return;
    }
    const loadingKey = `${product.id}:${category.name}:remove`;
    setCategoryAssignmentLoading(loadingKey);
    setCategoryAssignmentFeedback("");
    const previousProduct = product;
    try {
      const existingCategories = getProductCategories(product).split(",").map((item) => item.trim()).filter(Boolean);
      const nextCategories = existingCategories.filter((item) => item !== category.name);
      if (!nextCategories.length) {
        const message = "Product must belong to atleast 1 category";
        showSnackbar(message, "warning");
        return;
      }
      const optimisticProduct = { ...product, categories: nextCategories };
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).map((item) => (item.id === product.id ? { ...item, ...optimisticProduct } : item))
      }));
      patchCacheList(isProductListKey, (list) => replaceById(list, optimisticProduct));
      const payload = await apiRequest(`/products/${product.id}`, {
        method: "POST",
        body: {
          categories: nextCategories
        }
      });
      const nextProduct = payload?.data || optimisticProduct;
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).map((item) => (item.id === product.id ? { ...item, ...nextProduct } : item))
      }));
      patchCacheList(isProductListKey, (list) => replaceById(list, nextProduct));
      revalidateCacheGroups(isProductListKey, isProductCategoryListKey, isProductTagListKey);
      showSnackbar(`${product.name || "Product"} removed from ${category.name}.`, "success");
    } catch (error) {
      setData((prev) => ({
        ...prev,
        products: (prev.products || []).map((item) => (item.id === product.id ? previousProduct : item))
      }));
      patchCacheList(isProductListKey, (list) => replaceById(list, previousProduct));
      showSnackbar(describeRequestError(error), "error");
    } finally {
      setCategoryAssignmentLoading("");
    }
  }

  function openCategoryCreateForm() {
    const defaultPrice = String(appointmentSettings.categoryPricing?.general || selectedCategory?.price || "6000");
    setCategoryCreateOpen(true);
    setCategoryCreateForm({ name: "", pricePerMinute: defaultPrice });
    setCategoryMutationFeedback("");
  }

  function closeCategoryCreateForm() {
    setCategoryCreateOpen(false);
    setCategoryCreateForm({ name: "", pricePerMinute: "" });
  }

  async function saveNewCategory(event) {
    event.preventDefault();
    const nextName = String(categoryCreateForm.name || "").trim();
    if (!nextName) {
      setCategoryMutationFeedback("Enter a category name.");
      return;
    }
    const nextPrice = String(categoryCreateForm.pricePerMinute || appointmentSettings.categoryPricing?.general || "6000").trim();
    setCategoryMutationLoading("create-category");
    setCategoryMutationFeedback("");
    try {
      const payload = await apiRequest("/products/categories", {
        method: "POST",
        body: {
          name: nextName,
          slug: normalizeCategoryKey(nextName)
        }
      });

      const createdCategory = payload?.data || {
        id: nextName,
        name: nextName,
        slug: normalizeCategoryKey(nextName)
      };

      setData((prev) => ({
        ...prev,
        productCategories: [createdCategory, ...(prev.productCategories || [])]
      }));
      patchCacheList(isProductCategoryListKey, (list) => upsertById(list, createdCategory));
      revalidateCacheGroups(isProductListKey, isProductCategoryListKey, isProductTagListKey);
      setAppointmentSettings((prev) => ({
        ...prev,
        categoryPricing: {
          ...prev.categoryPricing,
          [normalizeCategoryKey(createdCategory.slug || createdCategory.name || nextName)]: nextPrice
        }
      }));
      setSelectedProductCategoryName(createdCategory.name || nextName);
      closeCategoryCreateForm();
      setCategoryMutationFeedback(`Created ${createdCategory.name || nextName}.`);
    } catch (error) {
      setCategoryMutationFeedback(describeRequestError(error));
    } finally {
      setCategoryMutationLoading("");
    }
  }

  async function saveCategoryEdit(field = "all") {
    if (!selectedCategory) {
      return;
    }
    const existingCategory = selectedCategoryRecord || selectedCategory;
    const nextName = String(categoryEditDraft?.name || "").trim();
    if ((field === "all" || field === "name") && !nextName) {
      setCategoryMutationFeedback("Enter a category name.");
      return;
    }
    const resolvedName = nextName || String(existingCategory.name || "").trim();
    const oldKey = normalizeCategoryKey(existingCategory.slug || existingCategory.name || "");
    const nextKey = normalizeCategoryKey(resolvedName);
    const previousPrice = String(existingCategory.price || appointmentSettings.categoryPricing?.[oldKey] || "");
    const nextPrice = String(categoryEditDraft?.pricePerMinute ?? previousPrice).trim();
    const nameChanged = resolvedName !== String(existingCategory.name || "");
    const priceChanged = nextPrice !== previousPrice;
    if ((field === "name" && !nameChanged) || (field === "price" && !priceChanged) || (field === "all" && !nameChanged && !priceChanged)) {
      setCategoryInlineField("");
      return;
    }
    const previousCategoryName = existingCategory.name || "";
    const snapshotData = data;
    const snapshotSettings = appointmentSettings;
    setCategoryMutationLoading("edit-category");
    setCategoryMutationFeedback("");
    try {
      let nextCategory = {
        ...existingCategory,
        name: resolvedName,
        slug: nextKey
      };
      if (nameChanged) {
        setData((prev) => ({
          ...prev,
          productCategories: (prev.productCategories || []).map((category) => (
            String(category.id || category.slug || category.name || "") === String(existingCategory.id || existingCategory.slug || existingCategory.name || "")
              ? { ...category, name: resolvedName, slug: nextKey }
              : category
          )),
          products: (prev.products || []).map((product) => replaceCategoryNameInProduct(product, previousCategoryName, resolvedName)),
          doctors: (prev.doctors || []).map((doctor) => replaceCategoryNameInDoctor(doctor, existingCategory.id, previousCategoryName, resolvedName, nextCategory.id))
        }));
        setSelectedProductCategoryName(resolvedName);
        const payload = await apiRequest(`/products/categories/${existingCategory.id}`, {
          method: "POST",
          body: {
            name: resolvedName,
            slug: nextKey
          }
        });
        nextCategory = payload?.data || nextCategory;
      }

      setData((prev) => ({
        ...prev,
        productCategories: (prev.productCategories || []).map((category) => (
          String(category.id || category.slug || category.name || "") === String(existingCategory.id || existingCategory.slug || existingCategory.name || "")
            ? { ...category, ...nextCategory, name: resolvedName, slug: nextKey }
            : category
        )),
        products: nameChanged ? (prev.products || []).map((product) => replaceCategoryNameInProduct(product, existingCategory.name || "", resolvedName)) : (prev.products || []),
        doctors: nameChanged ? (prev.doctors || []).map((doctor) => replaceCategoryNameInDoctor(doctor, existingCategory.id, existingCategory.name || "", resolvedName, nextCategory.id)) : (prev.doctors || [])
      }));
      patchCacheList(isProductCategoryListKey, (list) => replaceById(list, { ...nextCategory, name: resolvedName, slug: nextKey }));
      revalidateCacheGroups(isProductListKey, isProductCategoryListKey, isProductTagListKey, isDoctorListKey);

      setAppointmentSettings((prev) => {
        const nextPricing = { ...(prev.categoryPricing || {}) };
        if (oldKey && oldKey !== nextKey) {
          delete nextPricing[oldKey];
        }
        nextPricing[nextKey] = nextPrice;
        return {
          ...prev,
          categoryPricing: nextPricing
        };
      });
      setSelectedProductCategoryName(resolvedName);
      setCategoryEditDraft({
        name: resolvedName,
          pricePerMinute: nextPrice
        });
      setCategoryInlineField("");
      setCategorySaveNotice("Saved");
    } catch (error) {
      if (nameChanged) {
        setData(snapshotData);
        setSelectedProductCategoryName(previousCategoryName);
      }
      setAppointmentSettings(snapshotSettings);
      setCategoryMutationFeedback(describeRequestError(error));
    } finally {
      setCategoryMutationLoading("");
    }
  }

  async function updateCategoryDoctorAssignment(doctor, assign = true) {
    if (!selectedCategory || !doctor) {
      return;
    }
    const doctorId = doctor.user_id || doctor.id;
    const categoryId = selectedCategoryRecord?.id || selectedCategory.id;
    if (!categoryId) {
      setCategoryMutationFeedback("This category needs a saved category ID before doctors can be assigned.");
      return;
    }

    const loadingKey = `${doctorId}:${assign ? "assign" : "remove"}`;
    setCategoryMutationLoading(loadingKey);
    setCategoryMutationFeedback("");
    const doctorIdKey = String(doctorId || "");
    const updateAssignedDoctorCache = (nextDoctor, shouldAssign) => (current) => {
      const currentRows = Array.isArray(current?.data) ? current.data : [];
      if (shouldAssign) {
        const existing = currentRows.some((item) => String(item.user_id || item.id || "") === doctorIdKey);
        return {
          data: existing
            ? currentRows.map((item) => (String(item.user_id || item.id || "") === doctorIdKey ? { ...item, ...nextDoctor } : item))
            : [...currentRows, nextDoctor]
        };
      }
      return {
        data: currentRows.filter((item) => String(item.user_id || item.id || "") !== doctorIdKey)
      };
    };

    try {
      const currentIds = new Set(getDoctorCategoryIds(doctor));
      const resolvedCategoryId = Number(categoryId);
      if (Number.isFinite(resolvedCategoryId) && resolvedCategoryId > 0) {
        if (assign) {
          currentIds.add(resolvedCategoryId);
        } else {
          currentIds.delete(resolvedCategoryId);
        }
      }

      const optimisticDoctor = {
        ...doctor,
        product_category_ids: [...currentIds]
      };
      await categoryAssignedDoctorsQuery.mutate(updateAssignedDoctorCache(optimisticDoctor, assign), false);
      await categoryDoctorSearchQuery.mutate((current) => ({
        data: (Array.isArray(current?.data) ? current.data : []).filter((item) => (
          assign || String(item.user_id || item.id || "") !== doctorIdKey
        ))
      }), false);

      const payload = await apiRequest(`/doctors/${doctorId}`, {
        method: "POST",
        body: {
          product_category_ids: [...currentIds]
        }
      });
      const nextDoctor = payload?.data || {
        ...doctor,
        product_category_ids: [...currentIds]
      };
      setData((prev) => ({
        ...prev,
        doctors: (prev.doctors || []).map((item) => (
          String(item.user_id || item.id) === String(doctorId)
            ? { ...item, ...nextDoctor }
            : item
        ))
      }));
      await categoryAssignedDoctorsQuery.mutate(updateAssignedDoctorCache(nextDoctor, assign), false);
      patchDoctorCache(nextDoctor);
      revalidateCacheGroups(isDoctorListKey);

      setCategoryDoctorSearch("");
      showSnackbar(assign
        ? `${doctor.display_name || "Doctor"} assigned to ${selectedCategory.name}.`
        : `${doctor.display_name || "Doctor"} removed from ${selectedCategory.name}.`, "success");
    } catch (error) {
      await categoryAssignedDoctorsQuery.mutate();
      await categoryDoctorSearchQuery.mutate();
      showSnackbar(describeRequestError(error), "error");
    } finally {
      setCategoryMutationLoading("");
    }
  }

  function toggleProductSelection(productId) {
    setSelectedProductIds((prev) => (
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    ));
  }

  function toggleVisibleProductSelection() {
    setSelectedProductIds((prev) => {
      if (allVisibleProductsSelected) {
        return prev.filter((id) => !visibleProductIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleProductIds]));
    });
  }

  async function deleteSelectedProductsBulk() {
    if (!selectedProductIds.length || typeof window === "undefined") {
      return;
    }
    if (!window.confirm(`Delete ${selectedProductIds.length} selected product${selectedProductIds.length === 1 ? "" : "s"}?`)) {
      return;
    }

    const selectedProducts = (data.products || []).filter((product) => selectedProductIds.includes(product.id));
    for (const product of selectedProducts) {
      await trashProduct(product, { skipConfirm: true });
    }
  }

  async function deleteSelectedProduct() {
    try {
      await trashProduct(selectedProductEdit, { closeEditor: true });
    } catch (error) {
      return;
    }
  }

  function openOrderPrescriptionView() {
    if (!selectedOrderDetail) {
      return;
    }
    const query = selectedOrderPrescription?.prescription_number || selectedOrderDetail.prescription_id || selectedOrderDetail.customer_id || selectedOrderDetail.number;
    setSearch(String(query || ""));
    closeOrderModal();
    switchPage("prescriptions");
  }

  function openOrderConsultationView() {
    if (!selectedOrderDetail) {
      return;
    }
    const linkedAppointment = (data.appointments || []).find((appointment) => Number(appointment.patient_user_id) === Number(selectedOrderDetail.customer_id));
    const query = linkedAppointment?.id || selectedOrderDetail.customer_id || selectedOrderDetail.number;
    setSearch(String(query || ""));
    closeOrderModal();
    switchPage("consultations");
  }

  function openConsultationDetails(appointment) {
    setSelectedConsultation(appointment);
    setConsultationDetailForm({
      startAt: appointment.start_at ? appointment.start_at.slice(0, 16) : "",
      endAt: appointment.end_at ? appointment.end_at.slice(0, 16) : "",
      doctorNotes: appointment.doctor_notes || "",
      cancellationReason: appointment.cancellation_reason || ""
    });
    setConsultationActionFeedback("");
  }

  function syncAppointmentState(nextAppointment) {
    setData((prev) => ({
      ...prev,
      appointments: (prev.appointments || []).map((appointment) => (
        appointment.id === nextAppointment.id ? nextAppointment : appointment
      ))
    }));
    setSelectedConsultation(nextAppointment);
    patchAppointmentCache(nextAppointment);
    revalidateCacheGroups(isAppointmentListKey, isAdminSummaryKey);
  }

  async function runAppointmentAction(action, body = {}) {
    if (!selectedConsultation) {
      return;
    }
    setConsultationActionLoading(action);
    setConsultationActionFeedback("");
    try {
      if (action === "reschedule" && (!isFutureLocalDateTimeValue(body.start_at) || !isFutureLocalDateTimeValue(body.end_at))) {
        setConsultationActionFeedback("Choose a future date and time before rescheduling.");
        return;
      }
      const payload = await apiRequest(`/appointments/${selectedConsultation.id}/${action}`, {
        method: "POST",
        body
      });
      syncAppointmentState(payload.data);
      const feedbackByAction = {
        confirm: "Appointment confirmed.",
        complete: "Appointment completed.",
        cancel: "Appointment cancelled.",
        reschedule: "Appointment rescheduled.",
        notes: "Appointment notes updated."
      };
      setConsultationActionFeedback(feedbackByAction[action] || "Appointment updated.");
    } catch (error) {
      setConsultationActionFeedback(describeRequestError(error));
    } finally {
      setConsultationActionLoading("");
    }
  }

  async function apiRequest(path, { method = "GET", body, params = {}, auth = true, retry = true } = {}, activeSession = session) {
    if (!activeSession.baseUrl) {
      throw new Error("WordPress base URL is not configured.");
    }

    if (auth && activeSession.refreshToken && Date.now() > (Number(activeSession.expiresAt) - 30_000)) {
      activeSession = await refreshSession(activeSession);
    }

    const headers = {
      Accept: "application/json",
      "X-Nevari-Frontend-Type": activeSession.frontendType,
      "X-Nevari-Frontend-Origin": activeSession.frontendOrigin
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (auth && activeSession.accessToken) {
      headers.Authorization = `Bearer ${activeSession.accessToken}`;
    }

    let response;
    try {
      response = await fetch(buildUrl(activeSession, path, params), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      throw new Error(describeRequestError(error));
    }

    const rawResponse = await response.text();
    let payload = null;
    if (rawResponse) {
      try {
        payload = JSON.parse(rawResponse);
      } catch {
        payload = null;
      }
    }

    if (isPairingRequiredPayload(payload)) {
      forcePairingReset(payload?.error?.message || payload?.message || "Frontend access was revoked. Pair this dashboard again to continue.");
      throw createPairingRequiredError(payload?.error?.message || payload?.message);
    }

    if ((response.status === 401 || response.status === 403) && auth && retry && activeSession.refreshToken) {
      const refreshed = await refreshSession(activeSession);
      return apiRequest(path, { method, body, params, auth, retry: false }, refreshed);
    }

    if (!response.ok || (payload && !payload?.success)) {
      const message = extractApiErrorMessage(payload);
      if (response.status === 404 && isRouteMissingPayload(payload)) {
        throw new Error("A required service is unavailable. Refresh and try again.");
      }
      if (!payload && response.status === 404) {
        throw new Error("A required service is unavailable. Refresh and try again.");
      }
      throw new Error(message);
    }

    if (!payload) {
      throw new Error("Unexpected API response.");
    }

    return payload;
  }

  async function adminApiRequest(route, { params = {}, retry = true } = {}, activeSession = session) {
    if (!activeSession.baseUrl) {
      throw new Error("WordPress base URL is not configured.");
    }

    if (activeSession.refreshToken && Date.now() > (Number(activeSession.expiresAt) - 30_000)) {
      activeSession = await refreshSession(activeSession);
    }

    let response;
    try {
      response = await fetch(buildAdminUrl(activeSession, route, params), {
        headers: {
          Accept: "application/json",
          Authorization: activeSession.accessToken ? `Bearer ${activeSession.accessToken}` : "",
          "X-Nevari-Frontend-Type": activeSession.frontendType,
          "X-Nevari-Frontend-Origin": activeSession.frontendOrigin
        }
      });
    } catch (error) {
      throw new Error(describeRequestError(error));
    }

    const payload = await response.json().catch(() => null);
    if ((response.status === 401 || response.status === 403) && retry && activeSession.refreshToken) {
      const refreshed = await refreshSession(activeSession);
      return adminApiRequest(route, { params, retry: false }, refreshed);
    }
    if (!response.ok || (payload && !payload?.success)) {
      throw new Error(extractApiErrorMessage(payload));
    }
    if (!payload) {
      throw new Error("Unexpected API response.");
    }
    return payload;
  }

  async function refreshSession(activeSession = session) {
    const workingSession = activeSession?.refreshToken ? activeSession : latestSessionRef.current;
    if (!workingSession?.refreshToken) {
      throw new Error("No refresh token is available.");
    }

    const latestSession = latestSessionRef.current;
    if (
      latestSession?.refreshToken &&
      latestSession.refreshToken !== workingSession.refreshToken &&
      Date.now() < Number(latestSession.expiresAt || 0) - 30_000
    ) {
      return latestSession;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const payload = await apiRequest("/auth/refresh", {
          method: "POST",
          auth: false,
          body: {
            refresh_token: workingSession.refreshToken,
            ...frontendContext(workingSession)
          }
        }, workingSession);

        const nextSession = hydrateAuthSession(workingSession, payload.data);
        latestSessionRef.current = nextSession;
        setSession(nextSession);
        persistSessionSnapshot(nextSession, currentPage);
        return nextSession;
      } catch (error) {
        if (isExpiredRefreshSessionError(error)) {
          const nextSession = { ...workingSession, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
          latestSessionRef.current = nextSession;
          setSession(nextSession);
          persistSessionSnapshot(nextSession, currentPage);
          setSyncStatus({ text: nextSession.paired ? "Paired" : "Disconnected", mode: "" });
          setAuthFeedback("Stored session expired. Sign in again.");
          showAuthGate("auth");
          throw new Error("Stored session expired. Sign in again.");
        }
        throw error;
      }
    })();

    refreshPromiseRef.current = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null;
      }
    }
  }

  async function fetchAuditEvents(activeSession = session, nextAudit = audit, nextSearch = deferredSearch) {
    if (!activeSession.accessToken) {
      setData((prev) => ({ ...prev, auditEvents: [] }));
      setSelectedAuditIndex(0);
      return;
    }

    const payload = await apiRequest("/audit-logs", {
      params: {
        category: nextAudit.category,
        status: nextAudit.status === "all" ? "" : nextAudit.status,
        source: nextAudit.source === "all" ? "" : nextAudit.source,
        search: nextSearch,
        per_page: 20
      }
    }, activeSession);

    const rows = payload.data || [];
    setData((prev) => ({ ...prev, auditEvents: rows }));
    setSelectedAuditIndex(0);
  }

  async function fetchDashboardSummary(activeSession = session) {
    setSyncStatus({ text: "Loading summary...", mode: "" });
    setRefreshing(true);
    try {
      const payload = await adminApiRequest("summary", {}, activeSession);
      const summary = payload.data || {};
      rememberStoreContext(summary.dashboard || summary);
      const recentOrders = summary.recent_orders || summary.orders || [];
      setData((prev) => ({
        ...prev,
        dashboard: summary.dashboard || summary,
        orders: ["orders", "payments"].includes(currentPage) ? prev.orders : recentOrders,
        orderDetails: ["orders", "payments"].includes(currentPage) ? prev.orderDetails : recentOrders
      }));
      setLiveSnapshots((prev) => ([
        ...prev,
        {
          label: formatLiveLabel(),
          total: safeNumber(summary.dashboard?.sales?.today || summary.sales?.today || 0),
          volume: Number(summary.dashboard?.orders?.today || summary.orders_today || recentOrders.length || 0)
        }
      ].slice(-7)));
      setSyncStatus({ text: `Live | ${formatLiveLabel()}`, mode: "live" });
      setAppDataLoaded(true);
      return payload;
    } finally {
      setRefreshing(false);
    }
  }

  async function fetchAllData(activeSession = session) {
    setSyncStatus({ text: "Syncing...", mode: "" });
    setRefreshing(true);

    try {
      const endpointResults = await Promise.allSettled([
        apiRequest("/dashboard/store-admin", {}, activeSession),
        apiRequest("/orders", { params: { per_page: 24 } }, activeSession),
        apiRequest("/appointments", { params: { per_page: 40 } }, activeSession),
        apiRequest("/prescriptions", { params: { per_page: 40 } }, activeSession),
        apiRequest("/emails/logs", { params: { per_page: 20 } }, activeSession),
        apiRequest("/doctors", { params: { per_page: 50 } }, activeSession),
        apiRequest("/products", { params: { per_page: 100 } }, activeSession),
        apiRequest("/products/categories", { params: { per_page: 100 } }, activeSession)
      ]);

      const endpointErrors = endpointResults
        .filter((result) => result.status === "rejected")
        .map((result) => describeRequestError(result.reason));

      const [
        dashboardPayload,
        ordersPayload,
        appointmentsPayload,
        prescriptionsPayload,
        emailsPayload,
        doctorsPayload,
        productsPayload,
        productCategoriesPayload
      ] = [
        getSettledValue(endpointResults[0], { data: {} }),
        getSettledValue(endpointResults[1], { data: [] }),
        getSettledValue(endpointResults[2], { data: [] }),
        getSettledValue(endpointResults[3], { data: [] }),
        getSettledValue(endpointResults[4], { data: [] }),
        getSettledValue(endpointResults[5], { data: [] }),
        getSettledValue(endpointResults[6], { data: [] }),
        getSettledValue(endpointResults[7], { data: [] })
      ];

      const orders = ordersPayload.data || [];
      const prescriptions = prescriptionsPayload.data || [];

      const orderDetailsResults = await Promise.allSettled(
        orders.slice(0, 18).map((order) =>
          apiRequest(`/orders/${order.id}`, {}, activeSession).then((payload) => payload.data).catch(() => order)
        )
      );
      const orderDetails = orderDetailsResults.map((result, index) => getSettledValue(result, orders[index]));

      const prescriptionDetailsResults = await Promise.allSettled(
        prescriptions.slice(0, 18).map((prescription) =>
          apiRequest(`/prescriptions/${prescription.id}`, {}, activeSession).then((payload) => payload.data).catch(() => prescription)
        )
      );
      const prescriptionDetails = prescriptionDetailsResults.map((result, index) => getSettledValue(result, prescriptions[index]));

      const prescriptionHistorySettled = await Promise.allSettled(
        prescriptionDetails.slice(0, 8).map((prescription) =>
          apiRequest(`/prescriptions/${prescription.id}/history`, {}, activeSession)
            .then((payload) => (payload.data || []).map((item) => ({ ...item, prescription_id: prescription.id })))
            .catch(() => [])
        )
      );

      const prescriptionHistory = prescriptionHistorySettled
        .map((result) => getSettledValue(result, []))
        .flat();

      const nextDashboard = dashboardPayload.data || {};
      const nextAppointments = appointmentsPayload.data || [];
      const nextEmails = emailsPayload.data || [];
      const nextDoctors = doctorsPayload.data || [];
      const nextProducts = productsPayload.data || [];
      const nextProductCategories = productCategoriesPayload.data || [];
      rememberStoreContext(nextDashboard);

      setData({
        dashboard: nextDashboard,
        orders,
        orderDetails,
        appointments: nextAppointments,
        prescriptions,
        prescriptionDetails,
        prescriptionHistory,
        emails: nextEmails,
        doctors: nextDoctors,
        products: nextProducts,
        productCategories: nextProductCategories,
        auditEvents: []
      });

      const now = new Date();
      const ordersToday = orderDetails.filter((order) => {
        const created = new Date(order.created_at);
        return !Number.isNaN(created.getTime()) &&
          created.getFullYear() === now.getFullYear() &&
          created.getMonth() === now.getMonth() &&
          created.getDate() === now.getDate();
      }).length;

      setLiveSnapshots((prev) => (
        [
          ...prev,
          {
            label: formatLiveLabel(now),
            total: safeNumber(nextDashboard.sales?.today || 0),
            volume: ordersToday
          }
        ].slice(-7)
      ));

      try {
        await fetchAuditEvents(activeSession, audit, deferredSearch);
      } catch (error) {
        endpointErrors.push(describeRequestError(error));
      }

      setSyncStatus(endpointErrors.length ? {
        text: `Partial sync | ${formatLiveLabel()}`,
        mode: "warning"
      } : {
        text: `Live | ${formatLiveLabel()}`,
        mode: "live"
      });

      if (endpointErrors.length) {
        setAuthFeedback(endpointErrors[0]);
      }
    } finally {
      setAppDataLoaded(true);
      setRefreshing(false);
    }
  }

  async function handlePairingSubmit(event) {
    event.preventDefault();
    setSetupSubmitting(true);
    setSetupFeedback("Verifying pairing code...");

    try {
      const baseUrl = decodePairingBaseUrl(setupPairingCode);
      const workingSession = { ...session, baseUrl: normalizeBaseUrl(baseUrl) };
      setSession(workingSession);
      const pairingContext = {
        frontend_type: PAIRING_FRONTEND_TYPE,
        frontend_origin: workingSession.frontendOrigin,
        frontend_url: workingSession.frontendUrl
      };

      const verifyPayload = await apiRequest("/connections/verify", {
        method: "POST",
        auth: false,
        body: {
          pairing_code: setupPairingCode,
          ...pairingContext
        }
      }, workingSession);

      const registerPayload = await apiRequest("/connections/register", {
        method: "POST",
        auth: false,
        body: {
          pairing_session_id: verifyPayload.data.pairing_session_id,
          ...pairingContext,
          connection_status: "trusted"
        }
      }, workingSession);

      const nextSession = {
        ...workingSession,
        paired: true,
        siteName: registerPayload.data.site_name || verifyPayload.data.site_name || "",
        siteLogo: registerPayload.data.site_logo || verifyPayload.data.site_logo || ""
      };

      setSession(nextSession);
      persistSessionSnapshot(nextSession, currentPage);
      setSetupFeedback("Pairing verified. Continue to sign in.");
      setSyncStatus({ text: "Paired", mode: "live" });
      showAuthGate("auth");
    } catch (error) {
      console.error(error);
      setSyncStatus({ text: "Pairing error", mode: "error" });
      setSetupFeedback(describeRequestError(error));
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthFeedback("Signing in...");

    try {
      const payload = await apiRequest("/auth/login", {
        method: "POST",
        auth: false,
        body: {
          username,
          password,
          ...frontendContext(session)
        }
      }, session);

      if (payload.data.verification_required) {
        setVerification({
          challengeId: payload.data.challenge_id,
          maskedEmail: payload.data.masked_email || "",
          code: ""
        });
        setPassword("");
        setPasswordVisible(false);
        setAuthFeedback(`Enter the code sent to ${payload.data.masked_email || "your email"}.`);
        setAuthView("verify");
        return;
      }

      const nextSession = hydrateAuthSession(session, payload.data);
      setSession(nextSession);
      setAppDataLoaded(false);
      persistSessionSnapshot(nextSession, currentPage);
      setPassword("");
      setPasswordVisible(false);
      setAuthFeedback("Signed in.");
      hideAuthGate();

      try {
        await fetchAllData(nextSession);
      } catch (syncError) {
        console.error(syncError);
        setSyncStatus({ text: "Sync error", mode: "error" });
      }
    } catch (error) {
      console.error(error);
      setSyncStatus({ text: "Authentication error", mode: "error" });
      setAuthFeedback(describeRequestError(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleVerificationSubmit(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthFeedback("Verifying code...");

    try {
      const payload = await apiRequest("/auth/verify-code", {
        method: "POST",
        auth: false,
        body: {
          challenge_id: verification.challengeId,
          code: verification.code,
          ...frontendContext(session)
        }
      }, session);
      const nextSession = hydrateAuthSession(session, payload.data);
      setSession(nextSession);
      setAppDataLoaded(false);
      persistSessionSnapshot(nextSession, currentPage);
      setVerification({ challengeId: "", maskedEmail: "", code: "" });
      setAuthFeedback("Signed in.");
      hideAuthGate();
      await fetchAllData(nextSession);
    } catch (error) {
      console.error(error);
      setAuthFeedback(describeRequestError(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResendVerificationCode() {
    if (!verification.challengeId) {
      setAuthFeedback("No verification challenge is active. Sign in again.");
      return;
    }

    setAuthResendLoading(true);
    setAuthFeedback("Sending a new verification code...");

    try {
      const payload = await apiRequest("/auth/resend-code", {
        method: "POST",
        auth: false,
        body: {
          challenge_id: verification.challengeId,
          ...frontendContext(session)
        }
      }, session);

      setVerification((prev) => ({
        ...prev,
        challengeId: payload.data.challenge_id || prev.challengeId,
        maskedEmail: payload.data.masked_email || prev.maskedEmail,
        code: ""
      }));
      setAuthFeedback(`A new code was sent to ${payload.data.masked_email || verification.maskedEmail || "your email"}.`);
    } catch (error) {
      setAuthFeedback(describeRequestError(error));
    } finally {
      setAuthResendLoading(false);
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    setResetSubmitting(true);
    setAuthFeedback("Sending reset instructions...");

    try {
      await apiRequest("/auth/password-reset", {
        method: "POST",
        auth: false,
        body: {
          username: resetUsername,
          ...frontendContext(session)
        },
      }, session);

      setAuthFeedback("If that account exists, password reset instructions have been sent.");
      setAuthView("login");
    } catch (error) {
      console.error(error);
      setAuthFeedback("Could not submit the reset request. Try again.");
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      if (session.refreshToken && session.accessToken) {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: {
            refresh_token: session.refreshToken,
            ...frontendContext(session)
          }
        }, session);
      }
    } catch (error) {
      console.warn(error);
    }

    const nextSession = { ...session, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
    clearDashboardCacheStorage();
    setSession(nextSession);
    setAppDataLoaded(false);
    persistSessionSnapshot(nextSession, currentPage);
    setData(emptyData());
    setSyncStatus({ text: nextSession.paired ? "Paired" : "Disconnected", mode: "" });
    setAuthFeedback("Session cleared.");
    router.replace(nextSession.paired ? "/admin/storefront/login" : "/admin/storefront/setup");
  }

  async function handleRefresh() {
    if (!session.accessToken || refreshing) {
      return;
    }

    try {
      await refreshDashboardData(session);
    } catch (error) {
      console.error(error);
      setSyncStatus({ text: "Sync error", mode: "error" });
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;

    let cancelled = false;

    async function bootstrap() {
      if (!session.paired) {
        router.replace("/admin/storefront/setup");
        setSetupFeedback(
          isFileProtocol()
            ? "Enter the one-time pairing code to trust this storefront. If requests fail, serve this folder over http://localhost instead of opening index.html directly."
            : "Enter the one-time pairing code to trust this storefront."
        );
        setSyncStatus({ text: "Pairing required", mode: "" });
        return;
      }

      setSyncStatus({ text: "Paired", mode: "live" });

      if (!isSessionUsable(session) && !session.refreshToken) {
        router.replace("/admin/storefront/login");
        setAuthFeedback(
          isFileProtocol()
            ? "The storefront is paired. Sign in to load live data. If requests fail from file://, serve this folder over http://localhost first."
            : "The storefront is paired. Sign in to load live data."
        );
        return;
      }

      hideAuthGate();
      setSyncStatus({ text: "Restoring session...", mode: "" });

      let restoredSession = session;
      if (!isSessionUsable(session) && session.refreshToken) {
        try {
          restoredSession = await refreshSession(session);
        } catch (error) {
          if (!isExpiredRefreshSessionError(error) && !/stored session expired/i.test(String(error?.message || ""))) {
            console.error(error);
          }
          if (cancelled) {
            return;
          }
          if (isPairingRequiredError(error)) {
            forcePairingReset("Frontend access was revoked. Pair this dashboard again to continue.");
            return;
          }
          const nextSession = { ...session, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
          setSession(nextSession);
          persistSessionSnapshot(nextSession, currentPage);
          router.replace("/admin/storefront/login");
          setSyncStatus({ text: "Paired", mode: "live" });
          setAuthFeedback(error.message === "Unauthorized user" ? "Unauthorized user" : "Stored session expired. Sign in again.");
          return;
        }
      }

      if (cancelled) {
        return;
      }

      try {
        await fetchDashboardSummary(restoredSession);
        if (cancelled) {
          return;
        }
        hideAuthGate();
        setAuthFeedback("Session restored.");
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        hideAuthGate();
        setSyncStatus({ text: "Sync error", mode: "error" });
        setAuthFeedback("Session restored, but live data could not sync.");
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hydrated, router]);

  useEffect(() => {
    if (!session.accessToken || currentPage !== "audit") {
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        await fetchAuditEvents(session, audit, deferredSearch);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    }
    run();

    return () => {
      cancelled = true;
    };
  }, [audit.category, audit.status, audit.source, currentPage, deferredSearch, session.accessToken]);

  useEffect(() => {
    if (trendMode !== "live" || !session.accessToken) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activeSession = latestSessionRef.current;
      if (!activeSession?.accessToken || refreshing) {
        return;
      }

      refreshDashboardData(activeSession).catch((error) => {
        console.error(error);
        setSyncStatus({ text: "Sync error", mode: "error" });
      });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [trendMode, session.accessToken, refreshing, currentPage]);

  const canLoadSections = hydrated && Boolean(session.accessToken) && !authGate.visible;
  const lazyQueryOptions = {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 10_000
  };
  const ordersApiStatusFilter = currentPage === "orders" ? upstreamOrderStatusFilter(orderQueueFilter) : "";
  const ordersListKey = canLoadSections && ["orders", "payments"].includes(currentPage)
    ? swrKeys.admin.orders(withBaseUrl(session, { per_page: 24, page: 1, status: ordersApiStatusFilter, search: deferredSearch }))
    : null;
  const productsListKey = canLoadSections && currentPage === "products"
    ? swrKeys.admin.products(withBaseUrl(session, { per_page: 24, page: 1, search: deferredSearch }))
    : null;
  const productCategoriesListKey = canLoadSections && currentPage === "products"
    ? swrKeys.admin.categories(withBaseUrl(session, { per_page: 100, page: 1 }))
    : null;
  const categoryPaneProductsListKey = canLoadSections && currentPage === "products" && productCatalogView === "categories"
    ? swrKeys.admin.products(withBaseUrl(session, { per_page: 100, page: 1 }))
    : null;
  const categoryPaneCategoriesListKey = canLoadSections && currentPage === "products" && productCatalogView === "categories"
    ? swrKeys.admin.categories(withBaseUrl(session, { per_page: 100, page: 1 }))
    : null;
  const categoryPaneDoctorsListKey = canLoadSections && currentPage === "products" && productCatalogView === "categories"
    ? swrKeys.admin.doctors(withBaseUrl(session, { per_page: 100, page: 1 }))
    : null;
  const customersListKey = canLoadSections && currentPage === "customers"
    ? swrKeys.admin.customers(withBaseUrl(session, { per_page: 24, page: 1, search: deferredSearch }))
    : null;
  const consultationsListKey = canLoadSections && currentPage === "consultations"
    ? swrKeys.admin.appointments(withBaseUrl(session, { per_page: 50, page: 1, search: deferredSearch }))
    : null;
  const prescriptionsListKey = canLoadSections && currentPage === "prescriptions"
    ? swrKeys.admin.prescriptions(withBaseUrl(session, { per_page: 30, page: 1, search: deferredSearch }))
    : null;
  const doctorsListKey = canLoadSections && currentPage === "doctors"
    ? swrKeys.admin.doctors(withBaseUrl(session, { per_page: 50, page: 1, search: deferredSearch }))
    : null;
  const emailsListKey = canLoadSections && currentPage === "emails"
    ? swrKeys.admin.emails(withBaseUrl(session, { per_page: 20, page: 1, search: deferredSearch }))
    : null;
  const ordersQuery = useSWR(
    ordersListKey,
    () => adminApiRequest("orders", { params: { per_page: 24, page: 1, status: ordersApiStatusFilter, search: deferredSearch } }, session),
    { ...lazyQueryOptions, refreshInterval: 0, dedupingInterval: 30_000 }
  );
  const productsQuery = useSWR(
    productsListKey,
    () => adminApiRequest("products", { params: { per_page: 24, page: 1, search: deferredSearch } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const productCategoriesQuery = useSWR(
    productCategoriesListKey,
    () => adminApiRequest("categories", { params: { per_page: 100, page: 1 } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const categoryPaneProductsQuery = useSWR(
    categoryPaneProductsListKey,
    () => adminApiRequest("products", { params: { per_page: 100, page: 1 } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const categoryPaneCategoriesQuery = useSWR(
    categoryPaneCategoriesListKey,
    () => adminApiRequest("categories", { params: { per_page: 100, page: 1 } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const categoryPaneDoctorsQuery = useSWR(
    categoryPaneDoctorsListKey,
    () => adminApiRequest("doctors", { params: { per_page: 100, page: 1 } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const customersQuery = useSWR(
    customersListKey,
    () => adminApiRequest("customers", { params: { per_page: 24, page: 1, search: deferredSearch } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const consultationsQuery = useSWR(
    consultationsListKey,
    () => adminApiRequest("appointments", { params: { per_page: 50, page: 1, search: deferredSearch } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 60_000 }
  );
  const prescriptionsQuery = useSWR(
    prescriptionsListKey,
    () => adminApiRequest("prescriptions", { params: { per_page: 30, page: 1, search: deferredSearch } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 60_000 }
  );
  const doctorsQuery = useSWR(
    doctorsListKey,
    () => adminApiRequest("doctors", { params: { per_page: 50, page: 1, search: deferredSearch } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 120_000 }
  );
  const emailsQuery = useSWR(
    emailsListKey,
    () => adminApiRequest("emails", { params: { per_page: 20, page: 1, search: deferredSearch } }, session),
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 60_000 }
  );
  const popupQueryOptions = {
    ...lazyQueryOptions,
    keepPreviousData: true,
    dedupingInterval: 120_000
  };
  const orderCreateProductsQuery = useSWR(
    canLoadSections && orderCreateModalOpen
      ? swrKeys.admin.products(withBaseUrl(session, { per_page: 20, page: 1, search: orderCreateSearch }))
      : null,
    () => adminApiRequest("products", { params: { per_page: 20, page: 1, search: orderCreateSearch } }, session),
    { ...popupQueryOptions, fallbackData: data.products?.length ? { data: data.products.slice(0, 20) } : undefined }
  );
  const orderCreateDoctorsQuery = useSWR(
    canLoadSections && orderCreateModalOpen
      ? swrKeys.admin.doctors(withBaseUrl(session, { per_page: 50, page: 1 }))
      : null,
    () => adminApiRequest("doctors", { params: { per_page: 50, page: 1 } }, session),
    { ...popupQueryOptions, fallbackData: data.doctors?.length ? { data: data.doctors } : undefined }
  );
  const orderAssignmentDoctorsQuery = useSWR(
    canLoadSections && doctorAssignmentModalOpen
      ? swrKeys.admin.doctors(withBaseUrl(session, { per_page: 50, page: 1 }))
      : null,
    () => adminApiRequest("doctors", { params: { per_page: 50, page: 1 } }, session),
    { ...popupQueryOptions, fallbackData: data.doctors?.length ? { data: data.doctors } : undefined }
  );
  const orderCreateCustomersQuery = useSWR(
    canLoadSections && orderCreateModalOpen
      ? swrKeys.admin.customers(withBaseUrl(session, { per_page: 20, page: 1, search: orderCreateForm.email || `${orderCreateForm.firstName} ${orderCreateForm.lastName}`.trim() }))
      : null,
    () => adminApiRequest("customers", { params: { per_page: 20, page: 1, search: orderCreateForm.email || `${orderCreateForm.firstName} ${orderCreateForm.lastName}`.trim() } }, session),
    { ...popupQueryOptions, fallbackData: data.customers?.length ? { data: data.customers.slice(0, 20) } : undefined }
  );
  const productEditorCategoriesQuery = useSWR(
    canLoadSections && Boolean(productEditForm && (selectedProductEdit || productEditorMode === "create"))
      ? swrKeys.admin.categories(withBaseUrl(session, { per_page: 100, page: 1 }))
      : null,
    () => adminApiRequest("categories", { params: { per_page: 100, page: 1 } }, session),
    { ...popupQueryOptions, fallbackData: data.productCategories?.length ? { data: data.productCategories } : undefined }
  );
  const productEditorTagsQuery = useSWR(
    canLoadSections && Boolean(productEditForm && (selectedProductEdit || productEditorMode === "create"))
      ? swrKeys.admin.tags(withBaseUrl(session, { per_page: 100, page: 1 }))
      : null,
    () => adminApiRequest("tags", { params: { per_page: 100, page: 1 } }, session),
    { ...popupQueryOptions }
  );
  const doctorCreateCategoriesQuery = useSWR(
    canLoadSections && createModalType === "doctor"
      ? swrKeys.admin.categories(withBaseUrl(session, { per_page: 100, page: 1 }))
      : null,
    () => adminApiRequest("categories", { params: { per_page: 100, page: 1 } }, session),
    { ...popupQueryOptions, fallbackData: data.productCategories?.length ? { data: data.productCategories } : undefined }
  );
  const consultationCreatePatientsQuery = useSWR(
    canLoadSections && createModalType === "consultation"
      ? swrKeys.admin.customers(withBaseUrl(session, { per_page: 20, page: 1, search: consultationPatientSearch }))
      : null,
    () => adminApiRequest("customers", { params: { per_page: 20, page: 1, search: consultationPatientSearch } }, session),
    { ...popupQueryOptions, fallbackData: data.customers?.length ? { data: data.customers.slice(0, 20) } : undefined }
  );
  const consultationCreateDoctorsQuery = useSWR(
    canLoadSections && createModalType === "consultation"
      ? swrKeys.admin.doctors(withBaseUrl(session, { per_page: 50, page: 1 }))
      : null,
    () => adminApiRequest("doctors", { params: { per_page: 50, page: 1 } }, session),
    { ...popupQueryOptions, fallbackData: data.doctors?.length ? { data: data.doctors } : undefined }
  );
  const consultationCreateAppointmentsQuery = useSWR(
    canLoadSections && createModalType === "consultation"
      ? swrKeys.admin.appointments(withBaseUrl(session, { per_page: 40, page: 1, doctor_user_id: consultationCreateForm.doctorUserId, date: normalizeDateKey(consultationCreateForm.startAt ? new Date(consultationCreateForm.startAt) : new Date()) }))
      : null,
    () => adminApiRequest("appointments", { params: { per_page: 40, page: 1, doctor_user_id: consultationCreateForm.doctorUserId, date: normalizeDateKey(consultationCreateForm.startAt ? new Date(consultationCreateForm.startAt) : new Date()) } }, session),
    { ...popupQueryOptions, fallbackData: data.appointments?.length ? { data: data.appointments } : undefined }
  );

  async function refreshDashboardData(activeSession = session) {
    const tasks = [fetchDashboardSummary(activeSession)];

    if (["orders", "payments"].includes(currentPage) && ordersListKey) {
      tasks.push(ordersQuery.mutate());
    }
    if (currentPage === "products") {
      if (productsListKey) {
        tasks.push(productsQuery.mutate());
      }
      if (productCategoriesListKey) {
        tasks.push(productCategoriesQuery.mutate());
      }
      if (categoryPaneProductsListKey) {
        tasks.push(categoryPaneProductsQuery.mutate());
      }
      if (categoryPaneCategoriesListKey) {
        tasks.push(categoryPaneCategoriesQuery.mutate());
      }
      if (categoryPaneDoctorsListKey) {
        tasks.push(categoryPaneDoctorsQuery.mutate());
      }
    }
    if (currentPage === "customers" && customersListKey) {
      tasks.push(customersQuery.mutate());
    }
    if (currentPage === "consultations" && consultationsListKey) {
      tasks.push(consultationsQuery.mutate());
    }
    if (currentPage === "prescriptions" && prescriptionsListKey) {
      tasks.push(prescriptionsQuery.mutate());
    }
    if (currentPage === "doctors" && doctorsListKey) {
      tasks.push(doctorsQuery.mutate());
    }
    if (currentPage === "emails" && emailsListKey) {
      tasks.push(emailsQuery.mutate());
    }
    if (currentPage === "audit") {
      tasks.push(fetchAuditEvents(activeSession, audit, deferredSearch));
    }

    const results = await Promise.allSettled(tasks);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      throw failed.reason;
    }
  }

  useEffect(() => {
    if (!ordersQuery.data?.data) return;
    let cancelled = false;
    const orders = ordersQuery.data.data || [];
    setData((prev) => ({ ...prev, orders, orderDetails: orders }));

    async function hydrateOrderRows() {
      const detailResults = await Promise.allSettled(
        orders.map((order) =>
          apiRequest(`/orders/${order.id}`, {}, latestSessionRef.current)
            .then((payload) => ({ ...order, ...(payload?.data || {}) }))
            .catch(() => order)
        )
      );
      if (cancelled) {
        return;
      }
      const orderDetails = detailResults.map((result, index) => getSettledValue(result, orders[index]));
      setData((prev) => {
        const previousById = new Map((prev.orderDetails || []).map((order) => [order.id, order]));
        const merged = orderDetails.map((order) => ({ ...(previousById.get(order.id) || {}), ...order }));
        return { ...prev, orders: merged, orderDetails: merged };
      });
    }

    hydrateOrderRows();
    return () => {
      cancelled = true;
    };
  }, [ordersQuery.data]);

  useEffect(() => {
    if (!productsQuery.data?.data && !productCategoriesQuery.data?.data) return;
    setData((prev) => ({
      ...prev,
      products: productsQuery.data?.data || prev.products || [],
      productCategories: productCategoriesQuery.data?.data || prev.productCategories || []
    }));
  }, [productsQuery.data, productCategoriesQuery.data]);

  useEffect(() => {
    if (!categoryPaneProductsQuery.data?.data && !categoryPaneCategoriesQuery.data?.data && !categoryPaneDoctorsQuery.data?.data) return;
    setData((prev) => ({
      ...prev,
      products: categoryPaneProductsQuery.data?.data || prev.products || [],
      productCategories: categoryPaneCategoriesQuery.data?.data || prev.productCategories || [],
      doctors: categoryPaneDoctorsQuery.data?.data || prev.doctors || []
    }));
  }, [categoryPaneProductsQuery.data, categoryPaneCategoriesQuery.data, categoryPaneDoctorsQuery.data]);

  useEffect(() => {
    if (!customersQuery.data?.data) return;
    setData((prev) => ({ ...prev, customers: customersQuery.data.data }));
  }, [customersQuery.data]);

  useEffect(() => {
    if (!consultationsQuery.data?.data) return;
    setData((prev) => ({ ...prev, appointments: consultationsQuery.data.data }));
  }, [consultationsQuery.data]);

  useEffect(() => {
    if (!prescriptionsQuery.data?.data) return;
    setData((prev) => ({ ...prev, prescriptions: prescriptionsQuery.data.data, prescriptionDetails: prescriptionsQuery.data.data }));
  }, [prescriptionsQuery.data]);

  useEffect(() => {
    if (!doctorsQuery.data?.data) return;
    setData((prev) => ({ ...prev, doctors: doctorsQuery.data.data }));
  }, [doctorsQuery.data]);

  useEffect(() => {
    if (!emailsQuery.data?.data) return;
    setData((prev) => ({ ...prev, emails: emailsQuery.data.data }));
  }, [emailsQuery.data]);

  const dashboard = data.dashboard || {};
  const sales = dashboard.sales || {};
  const storeCurrency = dashboard.store_currency || sales.currency || storedStoreCurrency();
  const consultations = dashboard.consultations || {};
  const prescriptionsSummary = dashboard.prescriptions || {};
  const emailsSummary = dashboard.emails || {};
  const doctorMap = new Map((data.doctors || []).map((doctor) => [doctor.user_id || doctor.id, doctor.display_name]));
  const query = deferredSearch.trim().toLowerCase();
  const showPageSearch = currentPage !== "overview";
  const searchPlaceholder = SEARCH_PLACEHOLDERS[currentPage] || "Search this page";
  const matchesSearch = (text, enabled) => !enabled || !query || normalizeText(text).includes(query);
  const siteName = session.siteName || DEFAULT_SITE_NAME;
  const siteLogo = session.siteLogo || "/ne.webp";

  const rxHolds = (data.orderDetails || []).filter((order) => ["on_hold", "on-hold"].includes(order.rx_status || order.status)).length;
  const appointmentInProgress = Number(consultations.requested || 0) + Number(consultations.confirmed || 0);
  const emailTotal = Number(emailsSummary.sent_today || 0) + Number(emailsSummary.failed_today || 0);
  const emailFailureRate = emailTotal ? (Number(emailsSummary.failed_today || 0) / emailTotal) * 100 : 0;

  const weeklyTrend = (() => {
    const orders = data.orderDetails || [];
    const now = new Date();
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(now.getDate() - offset);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const dayOrders = orders
        .filter((order) => {
          const created = new Date(order.created_at);
          return !Number.isNaN(created.getTime()) && created >= day && created < next;
        });
      days.push({
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        total: dayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
        volume: dayOrders.length
      });
    }
    return days;
  })();

  const liveTrend = (() => {
    const placeholders = Array.from({ length: Math.max(0, 7 - liveSnapshots.length) }, (_, index) => ({
      label: index === 0 ? "Live" : "",
      total: 0,
      volume: 0,
      placeholder: true
    }));
    return [...placeholders, ...liveSnapshots];
  })();

  const trendSeries = trendMode === "live" ? liveTrend : weeklyTrend;
  const chartMax = Math.max(...trendSeries.map((day) => day.total), 1);
  const chartColors = ["#b9996d", "#d99860", "#d8cab6", "#344a6e", "#5c6d89", "#adb7c8", "#b9996d"];

  const legendItems = [
    { color: "teal", label: "Orders awaiting review", value: (data.orderDetails || []).filter((order) => ["pending", "on-hold"].includes(order.status)).length },
    { color: "rose", label: "Assigned prescriptions", value: prescriptionsSummary.assigned || 0 },
    { color: "lime", label: "Completed consultations", value: consultations.completed || 0 },
    { color: "violet", label: "Email failures today", value: emailsSummary.failed_today || 0 }
  ];

  const donutSegments = (() => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const total = Math.max(legendItems.reduce((sum, item) => sum + Number(item.value), 0), 1);
    let offset = 0;

    return legendItems.map((item) => {
      const segmentLength = (Number(item.value) / total) * circumference;
      const segment = {
        ...item,
        circumference,
        dasharray: `${segmentLength} ${circumference - segmentLength}`,
        dashoffset: -offset
      };
      offset += segmentLength;
      return segment;
    });
  })();

  const catalogItems = (() => {
    const products = data.products || [];
    const total = Math.max(products.length, 1);
    const rxRequired = products.filter((product) => product.pharmacy_rules?.rx_required).length;
    const consultationRequired = products.filter((product) => product.pharmacy_rules?.consultation_required).length;
    const otcCount = products.filter((product) => product.pharmacy_rules?.otc).length;
    const restrictedCount = products.filter((product) => product.pharmacy_rules?.restricted_visibility).length;

    return [
      { label: "Prescription needed", value: rxRequired, meterClass: "", width: Math.max(8, (rxRequired / total) * 100) },
      { label: "Consultation required", value: consultationRequired, meterClass: "mint-fill", width: Math.max(8, (consultationRequired / total) * 100) },
      { label: "OTC inventory", value: otcCount, meterClass: "lime-fill", width: Math.max(8, (otcCount / total) * 100) },
      { label: "Restricted visibility", value: restrictedCount, meterClass: "rose-fill", width: Math.max(8, (restrictedCount / total) * 100) }
    ];
  })();

  const teamItems = (() => {
    const prescriptionDetails = data.prescriptionDetails || [];
    const appointments = data.appointments || [];
    const activeDoctors = (data.doctors || []).filter((doctor) => getDoctorStatus(doctor) === "active").length;
    const suspendedDoctors = (data.doctors || []).filter((doctor) => getDoctorStatus(doctor) === "suspended").length;
    return [
      { label: "Active", value: activeDoctors, note: `${appointments.filter((item) => appointmentStatusGroup(item) === "ongoing").length} ongoing consultations` },
      { label: "Suspended", value: suspendedDoctors, note: "accounts needing admin review" },
      { label: "Total", value: (data.doctors || []).length, note: `${prescriptionDetails.length} prescriptions in scope` }
    ];
  })();

  const emailItems = (() => {
    const list = data.emails || [];
    const sent = list.filter((email) => email.status === "sent").length;
    const queued = list.filter((email) => email.status === "queued").length;
    const failed = list.filter((email) => email.status === "failed").length;
    const templates = new Set(list.map((email) => email.template_key).filter(Boolean));
    return [
      { label: "Queued", value: queued, note: "appointment and assignment notices" },
      { label: "Sent", value: sent, note: "recent delivery log entries" },
      { label: "Failed", value: failed, note: "provider or recipient issues" },
      { label: "Templates in use", value: templates.size, note: "visible in the current email log" }
    ];
  })();
  const emailTemplateCategories = ["all", ...Array.from(new Set(emailTemplates.map((template) => template.category).filter(Boolean)))];
  const selectedEmailTemplate = emailTemplates.find((template) => template.id === selectedEmailTemplateId) || emailTemplates[0] || DEFAULT_EMAIL_TEMPLATES[0];
  const emailTemplateSearchQuery = normalizeText(emailTemplateSearch);
  const filteredEmailTemplates = emailTemplates.filter((template) => {
    const matchesCategory = emailTemplateCategory === "all" || template.category === emailTemplateCategory;
    const matchesTemplateSearch = !emailTemplateSearchQuery || normalizeText(`${template.name} ${template.category} ${template.subject}`).includes(emailTemplateSearchQuery);
    return matchesCategory && matchesTemplateSearch;
  });
  const selectedEmailTemplateUnsupportedHooks = unsupportedEmailHooks(selectedEmailTemplate);
  const selectedEmailTemplatePreview = renderEmailTemplate(selectedEmailTemplate?.html, {
    site_name: siteName,
    support_email: appointmentSettings.smtpSender || "support@nevarihealth.com"
  });

  const orderCustomerSummaryRows = (() => {
    const customerMap = new Map();

    (data.customers || []).forEach((customer) => {
      const id = customer.id || customer.user_id || customer.customer_id;
      if (!id) {
        return;
      }
      const name = customerNameFromRecord(customer) || customerEmail(customer) || `Customer #${id}`;
      customerMap.set(id, {
        id,
        label: name,
        name,
        email: customerEmail(customer) || "No email on file",
        orders: Number(customer.orders || customer.order_count || 0),
        spend: safeNumber(customer.spend || customer.total_spend || 0),
        lastActivity: customer.updated_at || customer.created_at || null,
        prescriptions: Number(customer.prescriptions || 0),
        appointments: Number(customer.appointments || 0)
      });
    });

    (data.orderDetails || []).forEach((order) => {
      const customerId = order.customer_id || order.customer?.id || order.user_id;
      const email = customerEmail(order);
      const id = customerId || email;
      if (!id) {
        return;
      }

      const current = customerMap.get(id) || {
        id,
        label: customerFullName(order) || email || `Customer #${id}`,
        name: customerFullName(order) || email || `Customer #${id}`,
        email: email || "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: null,
        prescriptions: 0,
        appointments: 0
      };
      current.orders += 1;
      current.spend += safeNumber(order.total || 0);
      if (!current.lastActivity || new Date(order.created_at || 0) > new Date(current.lastActivity || 0)) {
        current.lastActivity = order.created_at;
      }
      customerMap.set(id, current);
    });

    (data.appointments || []).forEach((appointment) => {
      const id = appointment.patient_user_id || appointment.customer_id || appointment.user_id;
      if (!id) {
        return;
      }
      const current = customerMap.get(id) || {
        id,
        label: `Customer #${id}`,
        name: `Customer #${id}`,
        email: "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: null,
        prescriptions: 0,
        appointments: 0
      };
      current.appointments += 1;
      if (!current.lastActivity || new Date(appointment.start_at || 0) > new Date(current.lastActivity || 0)) {
        current.lastActivity = appointment.start_at;
      }
      customerMap.set(id, current);
    });

    return [...customerMap.values()];
  })();
  const orderCustomerRowsById = new Map(
    orderCustomerSummaryRows
      .filter((row) => row.id !== undefined && row.id !== null && row.id !== "")
      .map((row) => [String(row.id), row])
  );
  const orderCustomerRowsByEmail = new Map(
    orderCustomerSummaryRows
      .filter((row) => row.email && row.email !== "No email on file")
      .map((row) => [normalizeText(row.email), row])
  );
  function resolveOrderCustomerSummary(order) {
    return orderCustomerSummary(order, orderCustomerRowsById, orderCustomerRowsByEmail);
  }

  const orderQueueRows = data.orderDetails || [];
  const ordersLoading = Boolean(ordersListKey) && !ordersQuery.data?.data;
  const paymentsLoading = Boolean(ordersListKey) && currentPage === "payments" && !ordersQuery.data?.data;
  const productsLoading = Boolean(productsListKey) && !productsQuery.data?.data;
  const doctorsLoading = Boolean(doctorsListKey) && !doctorsQuery.data?.data;
  const consultationsLoading = Boolean(consultationsListKey) && !consultationsQuery.data?.data;
  const prescriptionsLoading = Boolean(prescriptionsListKey) && !prescriptionsQuery.data?.data;
  const orderQueueCounts = {
    all: orderQueueRows.length,
    needs_rx: orderQueueRows.filter((order) => isNeedsRxOrder(order)).length,
    awaiting_payment: orderQueueRows.filter((order) => isAwaitingPaymentOrder(order)).length,
    doctor_follow_up: orderQueueRows.filter((order) => isDoctorFollowUpOrder(order)).length
  };

  const filteredOrders = orderQueueRows.filter((order) => {
    const names = (order.items_summary || order.items || []).map ? ((order.items_summary || order.items || []).map((item) => item.name || item)).join(" ") : "";
    const customer = resolveOrderCustomerSummary(order);
    const searchText = `${order.number} ${order.status} ${order.rx_status || ""} ${names} ${order.customer_id || ""} ${customer.name} ${customer.email}`;
    return matchesSearch(searchText, currentPage === "orders") && matchesOrderQueueFilter(order, orderQueueFilter);
  });

  const selectedOrderPrescription = selectedOrderDetail
    ? (data.prescriptionDetails || []).find((item) => item.id === selectedOrderDetail.prescription_id)
    : null;

  const selectedOrderDoctorProfile = selectedOrderDetail?.assigned_doctor_user_id
    ? (data.doctors || []).find((doctor) => Number(doctor.user_id) === Number(selectedOrderDetail.assigned_doctor_user_id))
    : null;

  const filteredEmails = (data.emails || []).filter((email) =>
    matchesSearch(`${email.recipient_email} ${email.template_key} ${email.status} ${email.related_object_type} ${email.provider}`, currentPage === "emails")
  );

  const filteredAppointments = (data.appointments || []).filter((appointment) =>
    matchesSearch(`${appointment.status} ${appointment.reason} ${appointment.type} ${appointment.patient_user_id} ${appointment.doctor_user_id}`, currentPage === "consultations")
  );

  const filteredPrescriptions = (data.prescriptionDetails || []).filter((prescription) =>
    matchesSearch(`${prescription.prescription_number} ${prescription.status} ${prescription.patient_user_id} ${prescription.doctor_user_id} ${prescription.diagnosis}`, currentPage === "prescriptions")
  );

  const productFilterCounts = {
    all: (data.products || []).length,
    published: (data.products || []).filter((product) => getProductStatus(product) === "publish").length,
    draft: (data.products || []).filter((product) => getProductStatus(product) === "draft").length,
    in_stock: (data.products || []).filter((product) => (product.stock_status || "instock") === "instock").length,
    out_of_stock: (data.products || []).filter((product) => (product.stock_status || "instock") === "outofstock").length,
    on_sale: (data.products || []).filter((product) => hasActiveSalePrice(product)).length
  };

  const filteredProducts = (data.products || []).filter((product) => {
    const rules = product.pharmacy_rules || {};
    const matchesProductSearch = matchesSearch(`${product.name} ${product.sku} ${product.badge?.label} ${product.badge?.key} ${product.stock_status} ${rules.rx_required} ${rules.otc} ${rules.consultation_required}`, currentPage === "products");
    if (!matchesProductSearch) {
      return false;
    }
    if (productListFilter === "published") {
      return getProductStatus(product) === "publish";
    }
    if (productListFilter === "draft") {
      return getProductStatus(product) === "draft";
    }
    if (productListFilter === "in_stock") {
      return (product.stock_status || "instock") === "instock";
    }
    if (productListFilter === "out_of_stock") {
      return (product.stock_status || "instock") === "outofstock";
    }
    if (productListFilter === "on_sale") {
      return hasActiveSalePrice(product);
    }
    return true;
  });

  const productsPerPage = 10;
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const activeProductPage = Math.min(productPage, productPageCount);
  const paginatedProducts = filteredProducts.slice((activeProductPage - 1) * productsPerPage, activeProductPage * productsPerPage);
  const visibleProductIds = paginatedProducts.map((product) => product.id);
  const allVisibleProductsSelected = visibleProductIds.length > 0 && visibleProductIds.every((id) => selectedProductIds.includes(id));
  const deferredCategoryProductSearch = useDeferredValue(categoryProductSearch);
  const productCategoryRows = (() => {
    const categoryMap = new Map();

    (data.productCategories || []).forEach((category) => {
      const name = category?.name || category?.label;
      if (!name) {
        return;
      }
      const key = String(category.id || category.slug || name);
      categoryMap.set(key, {
        id: category.id || key,
        key,
        name,
        slug: category.slug || normalizeCategoryKey(name),
        price: resolveCategoryConsultationPrice(category, appointmentSettings.categoryPricing),
        productCount: 0
      });
    });

    (data.products || []).forEach((product) => {
      getProductCategories(product).split(",").map((item) => item.trim()).filter(Boolean).forEach((categoryName) => {
        const existing = [...categoryMap.values()].find((item) => item.name === categoryName);
        const nextKey = existing?.key || categoryName;
        const nextRow = existing || {
          id: nextKey,
          key: nextKey,
          name: categoryName,
          slug: normalizeCategoryKey(categoryName),
          price: resolveCategoryConsultationPrice({ name: categoryName }, appointmentSettings.categoryPricing),
          productCount: 0
        };
        nextRow.productCount += 1;
        categoryMap.set(nextKey, nextRow);
      });
    });

    return [...categoryMap.values()].sort((left, right) => left.name.localeCompare(right.name));
  })();
  const selectedCategory = productCategoryRows.find((category) => category.name === selectedProductCategoryName) || productCategoryRows[0] || null;
  const selectedCategoryRecord = selectedCategory
    ? (data.productCategories || []).find((category) => (
      String(category.id || category.slug || category.name || category.label || "") === String(selectedCategory.id || "")
      || normalizeCategoryKey(category.slug || category.name || category.label) === normalizeCategoryKey(selectedCategory.slug || selectedCategory.name)
    ))
    : null;
  const selectedCategoryProducts = selectedCategory
    ? (data.products || []).filter((product) => getProductCategories(product).split(",").map((item) => item.trim()).includes(selectedCategory.name))
    : [];
  const categorySearchQuery = deferredCategoryProductSearch.trim().toLowerCase();
  const selectedCategoryId = selectedCategoryRecord?.id || selectedCategory?.id || null;
  const selectedCategoryName = selectedCategory?.name || "";
  const minimumConsultationMinutes = Number(appointmentSettings.minimumConsultationMinutes || 0) || 0;
  const minimumConsultationLabel = minimumConsultationMinutes > 0
    ? `${formatNumber(minimumConsultationMinutes)}min`
    : "minimum consultation time";
  const formatCategoryPricing = (value) => (
    value ? (
      <>
        <strong>{formatMoney(value, storeCurrency)}</strong>
        <span className="product-category-price-suffix"> per {minimumConsultationLabel}</span>
      </>
    ) : "Not set"
  );
  const categoryDoctorsKey = canLoadSections && currentPage === "products" && productCatalogView === "categories" && selectedCategoryId
    ? ["category-doctors-local", String(selectedCategoryId), selectedCategoryName, (data.doctors || []).length]
    : null;
  const categoryDoctorSearchKey = canLoadSections && currentPage === "products" && productCatalogView === "categories" && debouncedCategoryDoctorSearch.trim()
    ? ["doctor-search-local", debouncedCategoryDoctorSearch.trim(), (data.doctors || []).length]
    : null;
  const categoryAssignedDoctorsQuery = useSWR(
    categoryDoctorsKey,
    async () => {
      const fallbackRows = (data.doctors || []).filter((doctor) => (
        getDoctorCategoryEntries(doctor).some((item) => (
          String(item.id || "") === String(selectedCategoryId || "")
          || item.name === selectedCategoryName
          || item.slug === normalizeCategoryKey(selectedCategoryName)
        ))
      ));
      return { data: fallbackRows };
    },
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 30_000 }
  );
  const categoryDoctorSearchQuery = useSWR(
    categoryDoctorSearchKey,
    async () => {
      const searchTerm = debouncedCategoryDoctorSearch.trim().toLowerCase();
      const fallbackRows = (data.doctors || []).filter((doctor) => (
        !searchTerm
        || normalizeText(`${doctor.display_name} ${doctor.email} ${doctor.specialty || ""} ${doctor.specialties?.join(" ") || ""} ${doctor.location || ""} ${doctor.user_id || doctor.id || ""}`).includes(searchTerm)
      ));
      return { data: fallbackRows };
    },
    { ...lazyQueryOptions, keepPreviousData: true, dedupingInterval: 15_000 }
  );
  const assignedCategoryDoctorRows = selectedCategory
    ? ((categoryAssignedDoctorsQuery.data?.data || []).map((doctor) => ({ doctor })))
    : [];
  const assignedDoctorIds = new Set(
    assignedCategoryDoctorRows.map(({ doctor }) => String(doctor.user_id || doctor.id || ""))
  );
  const availableCategoryDoctorRows = selectedCategory
    ? (categoryDoctorSearchQuery.data?.data || [])
      .filter((doctor) => !assignedDoctorIds.has(String(doctor.user_id || doctor.id || "")))
      .map((doctor) => ({ doctor }))
    : [];
  const categoryProductCandidates = selectedCategory
    ? (data.products || []).filter((product) => {
      const categoryNames = getProductCategories(product).split(",").map((item) => item.trim()).filter(Boolean);
      if (categoryNames.includes(selectedCategory.name)) {
        return false;
      }
      if (!categorySearchQuery) {
        return false;
      }
      return `${product.name} ${product.sku} ${getProductCategories(product)}`.toLowerCase().includes(categorySearchQuery);
    }).slice(0, 8)
    : [];
  const categoryProductsPerPage = 4;
  const categoryProductPageCount = Math.max(1, Math.ceil(selectedCategoryProducts.length / categoryProductsPerPage));
  const activeCategoryProductPage = Math.min(categoryProductPage, categoryProductPageCount);
  const paginatedSelectedCategoryProducts = selectedCategoryProducts.slice(
    (activeCategoryProductPage - 1) * categoryProductsPerPage,
    activeCategoryProductPage * categoryProductsPerPage
  );

  useEffect(() => {
    setCategoryDoctorSearch("");
    setDebouncedCategoryDoctorSearch("");
    setCategoryAssignmentFeedback("");
    setCategoryMutationFeedback("");
    setCategoryInlineField("");
    setCategorySaveNotice("");
    setCategoryProductPage(1);
    setCategoryEditDraft({
      name: selectedCategory?.name || "",
      pricePerMinute: String(selectedCategory?.price || "")
    });
  }, [selectedCategory?.id, selectedCategory?.name]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedCategoryDoctorSearch(categoryDoctorSearch.trim());
    }, 280);
    return () => window.clearTimeout(timeoutId);
  }, [categoryDoctorSearch]);

  useEffect(() => {
    setCategoryProductPage((prev) => Math.min(prev, categoryProductPageCount));
  }, [categoryProductPageCount]);

  useEffect(() => {
    if (categoryInlineField === "name") {
      categoryNameInputRef.current?.focus();
      categoryNameInputRef.current?.select();
    }
    if (categoryInlineField === "price") {
      categoryPriceInputRef.current?.focus();
      categoryPriceInputRef.current?.select();
    }
  }, [categoryInlineField]);

  useEffect(() => {
    if (!categorySaveNotice) {
      return;
    }
    const timeoutId = window.setTimeout(() => setCategorySaveNotice(""), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [categorySaveNotice]);

  const filteredDoctors = (data.doctors || []).filter((doctor) =>
    matchesSearch(`${doctor.display_name} ${doctor.email} ${doctor.specialties?.join(" ")} ${doctor.location} ${doctor.user_id}`, currentPage === "doctors")
  );

  const popupOrderProducts = orderCreateProductsQuery.data?.data || data.products || [];
  const popupOrderDoctors = orderCreateDoctorsQuery.data?.data || data.doctors || [];
  const popupAssignmentDoctors = orderAssignmentDoctorsQuery.data?.data || data.doctors || [];
  const popupProductCategories = productEditorCategoriesQuery.data?.data || data.productCategories || [];
  const popupProductTags = productEditorTagsQuery.data?.data || [];
  const popupDoctorCategories = doctorCreateCategoriesQuery.data?.data || data.productCategories || [];
  const selectedDoctorCreateCategories = popupDoctorCategories.filter((category) => (
    (doctorCreateForm.productCategoryIds || []).some((id) => String(id) === String(category.id))
  ));
  const availableDoctorCreateCategories = popupDoctorCategories
    .filter((category) => !(doctorCreateForm.productCategoryIds || []).some((id) => String(id) === String(category.id)))
    .filter((category) => {
      const searchTerm = normalizeText(doctorCreateCategorySearch);
      return !searchTerm || normalizeText(`${category.name || ""} ${category.slug || ""}`).includes(searchTerm);
    })
    .slice(0, 8);
  const popupConsultationDoctors = consultationCreateDoctorsQuery.data?.data || data.doctors || [];
  const popupConsultationAppointments = consultationCreateAppointmentsQuery.data?.data || data.appointments || [];
  const popupConsultationPatients = (consultationCreatePatientsQuery.data?.data || []).map((customer) => ({
    id: customer.id || customer.user_id || customer.customer_id,
    label: customer.label || customerNameFromRecord(customer) || customerEmail(customer) || `Customer #${customer.id || customer.user_id}`,
    name: customerNameFromRecord(customer) || customerEmail(customer) || `Customer #${customer.id || customer.user_id}`,
    email: customerEmail(customer) || "No email on file",
    orders: Number(customer.orders || customer.order_count || 0),
    spend: safeNumber(customer.spend || customer.total_spend || 0),
    lastActivity: customer.updated_at || customer.created_at || null,
    prescriptions: Number(customer.prescriptions || 0),
    appointments: Number(customer.appointments || 0)
  })).filter((row) => row.id);

  const productCategoryOptions = Array.from(new Set([
    ...popupProductCategories.map((category) => category.name || category.label).filter(Boolean),
    ...(data.products || [])
    .flatMap((product) => getProductCategories(product).split(","))
    .map((item) => item.trim())
    .filter(Boolean)
  ]));
  const productTagOptions = Array.from(new Set([
    ...popupProductTags.map((tag) => tag.name || tag.label).filter(Boolean),
    ...(data.products || [])
    .flatMap((product) => getProductTags(product).split(","))
    .map((item) => item.trim())
    .filter(Boolean)
  ]));
  const productBrandOptions = Array.from(new Set((data.products || [])
    .flatMap((product) => getProductBrands(product).split(","))
    .map((item) => item.trim())
    .filter(Boolean)
  ));

  const activeProductMedia = productEditMedia.find((item) => item.id === activeProductMediaId) || productEditMedia[0] || null;
  const productMediaSizing = productEditMedia.length > 18
    ? { thumbMin: "58px" }
    : productEditMedia.length > 12
      ? { thumbMin: "66px" }
      : productEditMedia.length > 8
        ? { thumbMin: "76px" }
        : { thumbMin: "88px" };
  const productEditorCurrency = getEditorCurrency(selectedProductEdit, storeCurrency);

  useEffect(() => {
    if (!productCategoryRows.length) {
      if (selectedProductCategoryName) {
        setSelectedProductCategoryName("");
      }
      return;
    }
    if (!selectedProductCategoryName || !productCategoryRows.some((category) => category.name === selectedProductCategoryName)) {
      setSelectedProductCategoryName(productCategoryRows[0].name);
    }
  }, [productCategoryRows, selectedProductCategoryName]);

  const allPaymentRows = (data.orderDetails || [])
    .filter((order) => {
      const paymentStatus = normalizedPaymentStatus(order);
      if (!["pending", "failed", "completed", "refunded"].includes(paymentStatus)) {
        return false;
      }
      const customer = customerSummary(order);
      return matchesSearch(`${order.number} ${paymentStatus} ${order.rx_status || ""} ${order.customer_id || ""} ${customer.name} ${customer.email} ${order.total || 0}`, currentPage === "payments");
    })
    .map((order) => {
      const paymentStatus = normalizedPaymentStatus(order);
      const held = ["on_hold", "on-hold"].includes(order.rx_status || "");
      const customer = customerSummary(order);
      return {
        id: order.id,
        number: order.number,
        customerLabel: customer.name,
        customerEmail: customer.email,
        amount: safeNumber(order.total),
        currency: storeCurrency,
        paymentStatus,
        rxStatus: order.rx_status || "clear",
        createdAt: order.created_at,
        actionLabel: held ? "Resolve RX hold" : paymentStatus === "completed" ? "Archive payment" : "Review capture",
        sourceOrder: order
      };
    });

  const paymentFilterCounts = {
    all: allPaymentRows.length,
    completed: allPaymentRows.filter((row) => row.paymentStatus === "completed").length,
    pending: allPaymentRows.filter((row) => row.paymentStatus === "pending").length,
    failed: allPaymentRows.filter((row) => row.paymentStatus === "failed").length,
    refunded: allPaymentRows.filter((row) => row.paymentStatus === "refunded").length
  };

  const paymentRows = allPaymentRows.filter((row) => {
    if (paymentFilter === "completed") {
      return row.paymentStatus === "completed";
    }
    if (paymentFilter === "pending") {
      return row.paymentStatus === "pending";
    }
    if (paymentFilter === "failed") {
      return row.paymentStatus === "failed";
    }
    if (paymentFilter === "refunded") {
      return row.paymentStatus === "refunded";
    }
    return true;
  });

  const paymentsPerPage = 10;
  const paymentPageCount = Math.max(1, Math.ceil(paymentRows.length / paymentsPerPage));
  const activePaymentPage = Math.min(paymentPage, paymentPageCount);
  const paginatedPaymentRows = paymentRows.slice((activePaymentPage - 1) * paymentsPerPage, activePaymentPage * paymentsPerPage);

  const allCustomerRows = (() => {
    const customerMap = new Map();

    (data.customers || []).forEach((customer) => {
      const id = customer.id || customer.user_id || customer.customer_id;
      if (!id) {
        return;
      }
      const name = customerNameFromRecord(customer) || customerEmail(customer) || `Customer #${id}`;
      customerMap.set(id, {
        id,
        label: name,
        name,
        email: customerEmail(customer) || "No email on file",
        orders: Number(customer.orders || customer.order_count || 0),
        spend: safeNumber(customer.spend || customer.total_spend || 0),
        lastActivity: customer.updated_at || customer.created_at || null,
        prescriptions: Number(customer.prescriptions || 0),
        appointments: Number(customer.appointments || 0)
      });
    });

    (data.orderDetails || []).forEach((order) => {
      const summary = customerSummary(order);
      const key = order.customer_id || `guest-${customerEmail(order) || order.number || order.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: summary.name,
        name: summary.name,
        email: summary.email,
        orders: 0,
        spend: 0,
        lastActivity: order.created_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.orders += 1;
      current.spend += safeNumber(order.total);
      if (isPlaceholderCustomerName(current.name) || current.name === patientLabel(order.customer_id)) {
        current.name = summary.name;
      }
      if (isPlaceholderCustomerName(current.label) || current.label === patientLabel(order.customer_id)) {
        current.label = summary.name;
      }
      if (!current.email || current.email === "No email on file") {
        current.email = customerEmail(order) || current.email;
      }
      if (order.created_at && (!current.lastActivity || new Date(order.created_at) > new Date(current.lastActivity))) {
        current.lastActivity = order.created_at;
      }
      customerMap.set(key, current);
    });

    (data.prescriptionDetails || []).forEach((prescription) => {
      const key = prescription.patient_user_id || `patient-rx-${prescription.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: patientLabel(prescription.patient_user_id),
        name: patientLabel(prescription.patient_user_id),
        email: "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: prescription.updated_at || prescription.created_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.prescriptions += 1;
      if (prescription.updated_at && (!current.lastActivity || new Date(prescription.updated_at) > new Date(current.lastActivity))) {
        current.lastActivity = prescription.updated_at;
      }
      customerMap.set(key, current);
    });

    (data.appointments || []).forEach((appointment) => {
      const key = appointment.patient_user_id || `patient-appt-${appointment.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: patientLabel(appointment.patient_user_id),
        name: patientLabel(appointment.patient_user_id),
        email: "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: appointment.updated_at || appointment.start_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.appointments += 1;
      if (appointment.start_at && (!current.lastActivity || new Date(appointment.start_at) > new Date(current.lastActivity))) {
        current.lastActivity = appointment.start_at;
      }
      customerMap.set(key, current);
    });

    return [...customerMap.values()]
      .filter((row) => matchesSearch(`${row.label} ${row.name} ${row.email} ${row.id}`, currentPage === "customers"))
      .sort((a, b) => safeNumber(b.spend) - safeNumber(a.spend))
      .slice(0, 18);
  })();
  const consultationDoctorProfile = popupConsultationDoctors.find((doctor) => String(doctor.user_id || doctor.id) === String(consultationCreateForm.doctorUserId)) || null;
  const consultationDoctorAppointments = popupConsultationAppointments
    .filter((appointment) => String(appointment.doctor_user_id) === String(consultationDoctorProfile?.user_id || consultationDoctorProfile?.id || ""))
    .sort((a, b) => new Date(a.start_at || 0) - new Date(b.start_at || 0));
  const consultationCalendarDate = consultationCreateForm.startAt ? new Date(consultationCreateForm.startAt) : new Date();
  const consultationWeekStart = startOfWeek(consultationCalendarDate);
  const consultationPatientRows = popupConsultationPatients.length ? popupConsultationPatients : allCustomerRows;
  const consultationPatientOptions = consultationPatientRows.filter((row) => {
    if (!consultationPatientSearch.trim()) {
      return true;
    }
    return `${row.name} ${row.email} ${row.label} ${row.id}`.toLowerCase().includes(consultationPatientSearch.trim().toLowerCase());
  });
  const consultationDoctorOptions = popupConsultationDoctors.filter((doctor) => {
    const searchTerm = consultationDoctorSearch.trim().toLowerCase();
    if (!searchTerm) {
      return true;
    }
    return normalizeText(`${doctor.display_name || ""} ${doctor.email || ""} ${doctor.specialty || ""} ${doctor.location || ""}`).includes(searchTerm);
  }).slice(0, 8);
  const consultationCalendarDays = Array.from({ length: 7 }, (_, index) => addDays(consultationWeekStart, index));
  const consultationSelectedDayKey = normalizeDateKey(consultationCalendarDate);
  const consultationDayAppointments = consultationDoctorAppointments.filter((appointment) => normalizeDateKey(appointment.start_at) === consultationSelectedDayKey);
  const consultationVisiblePatientOptions = consultationPatientOptions.slice(0, 6);
  const consultationSelectedPatient = consultationPatientOptions.find((row) => String(row.id) === String(consultationCreateForm.patientUserId)) || null;
  const consultationCanSubmit = createModalType !== "consultation" || Boolean(
    consultationCreateForm.doctorUserId
    && consultationCreateForm.patientUserId
    && consultationCreateForm.startAt
    && consultationCreateForm.endAt
    && consultationCreateForm.type
  );

  useEffect(() => {
    if (createModalType !== "consultation" || consultationCreateForm.doctorUserId || !popupConsultationDoctors.length) {
      return;
    }
    const firstDoctor = popupConsultationDoctors[0];
    const firstDoctorId = firstDoctor?.user_id || firstDoctor?.id;
    if (!firstDoctorId) {
      return;
    }
    setConsultationCreateForm((prev) => ({
      ...prev,
      doctorUserId: String(firstDoctorId)
    }));
    setConsultationDoctorSearch(firstDoctor.display_name || firstDoctor.email || "");
  }, [createModalType, consultationCreateForm.doctorUserId, popupConsultationDoctors]);

  const customerRows = allCustomerRows.filter((row) => {
    if (customerFilter === "repeat") {
      return row.orders > 1;
    }
    if (customerFilter === "prescriptions") {
      return row.prescriptions > 0;
    }
    if (customerFilter === "appointments") {
      return row.appointments > 0;
    }
    return true;
  });

  const selectedCustomerProfile = selectedCustomerId
    ? allCustomerRows.find((row) => String(row.id) === String(selectedCustomerId))
    : null;
  const selectedCustomerOrders = selectedCustomerProfile
    ? [...customerHistoryOrders]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    : [];
  const selectedCustomerProducts = selectedCustomerOrders
    .flatMap((order) => (order.items || []).map((item) => ({
      id: `${order.id}-${item.id || item.sku || item.name}`,
      orderId: order.id,
      orderNumber: order.number,
      name: item.name,
      sku: item.sku || "No SKU",
      quantity: Number(item.quantity || 0),
      total: item.total || ((item.unit_price || 0) * Number(item.quantity || 0)),
      currency: storeCurrency,
      createdAt: order.created_at,
      image_url: item.image_url || item.image?.src || item.thumbnail || item.image || ""
    })))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const customerHistoryPerPage = 8;
  const customerOrderPageCount = Math.max(1, Math.ceil(selectedCustomerOrders.length / customerHistoryPerPage));
  const activeCustomerOrderPage = Math.min(customerOrderPage, customerOrderPageCount);
  const paginatedCustomerOrders = selectedCustomerOrders.slice(
    (activeCustomerOrderPage - 1) * customerHistoryPerPage,
    activeCustomerOrderPage * customerHistoryPerPage
  );
  const customerProductPageCount = Math.max(1, Math.ceil(selectedCustomerProducts.length / customerHistoryPerPage));
  const activeCustomerProductPage = Math.min(customerProductPage, customerProductPageCount);
  const paginatedCustomerProducts = selectedCustomerProducts.slice(
    (activeCustomerProductPage - 1) * customerHistoryPerPage,
    activeCustomerProductPage * customerHistoryPerPage
  );

  const consultationCounts = {
    all: filteredAppointments.length,
    upcoming: filteredAppointments.filter((item) => appointmentStatusGroup(item) === "upcoming").length,
    past: filteredAppointments.filter((item) => appointmentStatusGroup(item) === "past").length,
    ongoing: filteredAppointments.filter((item) => appointmentStatusGroup(item) === "ongoing").length
  };

  const appointmentDateSet = new Set((data.appointments || []).map((item) => isoDateKey(item.start_at)).filter(Boolean));

  const calendarDays = (() => {
    const base = new Date(`${selectedConsultationDate || isoDateKey()}T00:00:00`);
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const days = [];
    const cursor = new Date(first);
    cursor.setDate(first.getDate() - first.getDay());
    for (let index = 0; index < 42; index += 1) {
      days.push({
        key: isoDateKey(cursor),
        label: cursor.getDate(),
        muted: cursor.getMonth() !== month,
        active: isoDateKey(cursor) === selectedConsultationDate,
        hasAppointment: appointmentDateSet.has(isoDateKey(cursor))
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  })();

  const consultationList = filteredAppointments
    .map((item) => ({ ...item, group: appointmentStatusGroup(item) }))
    .filter((item) => consultationFilter === "all" || item.group === consultationFilter)
    .filter((item) => !selectedConsultationDate || isoDateKey(item.start_at) === selectedConsultationDate)
    .sort((a, b) => new Date(a.start_at || 0) - new Date(b.start_at || 0));

  const sortedHistory = [...(data.prescriptionHistory || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  const selectedAuditEvent = data.auditEvents[selectedAuditIndex] || null;
  const selectedDoctorProfile = selectedDoctorId
    ? (data.doctors || []).find((doctor) => String(doctor.user_id || doctor.id) === String(selectedDoctorId))
    : null;
  const selectedDoctorPatients = selectedDoctorProfile ? (() => {
    const doctorId = selectedDoctorProfile.user_id || selectedDoctorProfile.id;
    const map = new Map();
    (data.appointments || []).filter((item) => Number(item.doctor_user_id) === Number(doctorId)).forEach((item) => {
      map.set(item.patient_user_id || `appt-${item.id}`, {
        id: item.patient_user_id || `appt-${item.id}`,
        name: patientLabel(item.patient_user_id),
        email: "No email on file",
        source: "Consultation"
      });
    });
    (data.prescriptionDetails || []).filter((item) => Number(item.doctor_user_id) === Number(doctorId)).forEach((item) => {
      map.set(item.patient_user_id || `rx-${item.id}`, {
        id: item.patient_user_id || `rx-${item.id}`,
        name: patientLabel(item.patient_user_id),
        email: "No email on file",
        source: "Prescription"
      });
    });
    return [...map.values()];
  })() : [];
  const selectedDoctorPrescriptions = selectedDoctorProfile
    ? (data.prescriptionDetails || []).filter((item) => Number(item.doctor_user_id) === Number(selectedDoctorProfile.user_id || selectedDoctorProfile.id))
    : [];
  const orderProductCandidates = useMemo(() => {
    const query = normalizeText(orderCreateSearch).trim();
    const products = popupOrderProducts || [];
    if (!query) {
      return products.slice(0, 8);
    }
    return products
      .filter((product) => normalizeText(`${product.name || ""} ${product.sku || ""} ${getProductCategories(product)} ${getProductTags(product)} ${getProductBrands(product)}`).includes(query))
      .slice(0, 8);
  }, [popupOrderProducts, orderCreateSearch]);

  const todayAppointments = filteredAppointments
    .filter((appointment) => {
      const start = new Date(appointment.start_at);
      const today = new Date();
      return !Number.isNaN(start.getTime()) &&
        start.getFullYear() === today.getFullYear() &&
        start.getMonth() === today.getMonth() &&
        start.getDate() === today.getDate();
    })
    .slice(0, 6);

  const urgentItems = [
    {
      label: "RX holds",
      value: rxHolds,
      note: `${formatNumber(prescriptionsSummary.assigned || 0)} assignments pending`,
      action: "orders"
    },
    {
      label: "Consultation queue",
      value: appointmentInProgress,
      note: `${formatNumber(consultations.completed || 0)} completed today`,
      action: "consultations"
    },
    {
      label: "Email failures",
      value: emailsSummary.failed_today || 0,
      note: `${formatNumber(emailItems[0]?.value || 0)} still queued`,
      action: "emails"
    }
  ];

  const settingsCards = [
    {
      label: "Frontend type",
      value: session.frontendType || FRONTEND_TYPE,
      note: "paired storefront identity"
    },
    {
      label: "Connected base URL",
      value: session.baseUrl || "Not configured",
      note: "WordPress REST source"
    },
    {
      label: "Active role",
      value: session.user?.roles?.join(", ") || "Not authenticated",
      note: "current signed-in permissions"
    },
    {
      label: "Session state",
      value: session.accessToken ? "Authenticated" : "Awaiting sign-in",
      note: "refresh token kept locally for this frontend"
    }
  ];

  const profileCards = [
    {
      label: "Display name",
      value: session.user?.display_name || siteName,
      note: "visible in the storefront command center"
    },
    {
      label: "Email",
      value: session.user?.email || "Not available",
      note: "current authenticated WordPress account"
    },
    {
      label: "Role",
      value: session.user?.roles?.join(", ") || "Frontend guest",
      note: "active session permissions"
    },
    {
      label: "Connection",
      value: session.baseUrl || "Not configured",
      note: "paired WordPress environment"
    }
  ];

  const showPageSkeleton = Boolean(session.accessToken && !appDataLoaded);

  if (!hydrated) {
    return renderPageSkeleton();
  }

  function renderMetricSkeletons(count = 4) {
    return Array.from({ length: count }, (_, index) => (
      <article className="metric-card skeleton-panel" key={`metric-skeleton-${index}`}>
        <div className="metric-row">
          <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
          <SkeletonBox className="skeleton-circle skeleton-circle-xs" />
        </div>
        <SkeletonBox className="skeleton-line skeleton-line-md" />
        <SkeletonBox className="skeleton-line skeleton-line-lg skeleton-line-tall" />
        <SkeletonBox className="skeleton-line skeleton-line-sm" />
      </article>
    ));
  }

  function renderTableRowSkeletons(count = 5, columns = 7) {
    return Array.from({ length: count }, (_, rowIndex) => (
      <tr key={`table-skeleton-${rowIndex}`}>
        {Array.from({ length: columns }, (_, columnIndex) => (
          <td key={`table-skeleton-${rowIndex}-${columnIndex}`}>
            <SkeletonBox className={`skeleton-line ${columnIndex % 3 === 0 ? "skeleton-line-lg" : columnIndex % 3 === 1 ? "skeleton-line-md" : "skeleton-line-sm"}`} />
          </td>
        ))}
      </tr>
    ));
  }

  function renderCardListSkeletons(count = 4) {
    return Array.from({ length: count }, (_, index) => (
      <div className="list-card-skeleton skeleton-panel" key={`list-card-skeleton-${index}`}>
        <div>
          <SkeletonBox className="skeleton-line skeleton-line-md" />
          <SkeletonBox className="skeleton-line skeleton-line-sm" />
        </div>
        <div>
          <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
          <SkeletonBox className="skeleton-line skeleton-line-xs" />
        </div>
      </div>
    ));
  }

  function renderOrderDetailSkeleton() {
    return (
      <div className="order-detail-grid">
        <div className="order-detail-stack">
          <div className="mini-stat-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="mini-stat skeleton-panel" key={`order-stat-skeleton-${index}`}>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" />
                <SkeletonBox className="skeleton-line skeleton-line-sm" />
              </div>
            ))}
          </div>
          <div className="detail-form-grid">
            <div className="detail-field">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-pill" />
            </div>
            <div className="detail-field">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-pill" />
            </div>
            <div className="detail-field detail-field-wide">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-block" />
            </div>
          </div>
        </div>
        <div className="order-detail-stack">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="detail-item-card skeleton-panel" key={`order-detail-item-skeleton-${index}`}>
              <SkeletonBox className="skeleton-line skeleton-line-md" />
              <SkeletonBox className="skeleton-line skeleton-line-sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderPageSkeleton() {
    if (currentPage === "overview") {
      return (
        <section className="page-view active">
          <section className="metrics-grid">
            {renderMetricSkeletons(4)}
          </section>
          <section className="analytics-grid">
            <article className="panel skeleton-panel">
              <div className="panel-header">
                <div>
                  <SkeletonBox className="skeleton-line skeleton-line-xs" />
                  <SkeletonBox className="skeleton-line skeleton-line-lg" />
                </div>
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </div>
              <div className="skeleton-chart-bars">
                {Array.from({ length: 7 }, (_, index) => (
                  <SkeletonBox className={`skeleton-bar skeleton-bar-${(index % 4) + 1}`} key={`overview-bar-${index}`} />
                ))}
              </div>
            </article>
            <article className="panel skeleton-panel">
              <div className="panel-header">
                <div>
                  <SkeletonBox className="skeleton-line skeleton-line-xs" />
                  <SkeletonBox className="skeleton-line skeleton-line-lg" />
                </div>
                <SkeletonBox className="skeleton-circle skeleton-circle-sm" />
              </div>
              <div className="skeleton-donut-layout">
                <SkeletonBox className="skeleton-donut" />
                <div className="detail-list">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="detail-item-card skeleton-panel" key={`overview-legend-${index}`}>
                      <SkeletonBox className="skeleton-line skeleton-line-md" />
                      <SkeletonBox className="skeleton-line skeleton-line-sm" />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
        </section>
      );
    }

    if (currentPage === "orders") {
      return (
        <section className="page-view active">
          <section className="page-banner panel skeleton-panel">
            <div className="detail-list">
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-line skeleton-line-lg" />
              <SkeletonBox className="skeleton-line skeleton-line-md" />
            </div>
            <div className="banner-stats">
              <div className="mini-stat skeleton-panel"><SkeletonBox className="skeleton-line skeleton-line-xs" /><SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" /></div>
              <div className="mini-stat skeleton-panel"><SkeletonBox className="skeleton-line skeleton-line-xs" /><SkeletonBox className="skeleton-line skeleton-line-md skeleton-line-tall" /></div>
            </div>
          </section>
          <section className="panel table-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-lg" />
              </div>
              <div className="toolbar">
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
                <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              </div>
            </div>
            <div className="table-scroll">
              <table><tbody>{renderTableRowSkeletons(5, 7)}</tbody></table>
            </div>
          </section>
          <section className="panel order-detail-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <SkeletonBox className="skeleton-line skeleton-line-xs" />
                <SkeletonBox className="skeleton-line skeleton-line-lg" />
              </div>
            </div>
            {renderOrderDetailSkeleton()}
          </section>
        </section>
      );
    }

    return (
      <section className="page-view active">
        <section className="panel table-panel skeleton-panel">
          <div className="panel-header">
            <div>
              <SkeletonBox className="skeleton-line skeleton-line-xs" />
              <SkeletonBox className="skeleton-line skeleton-line-lg" />
            </div>
            <div className="toolbar">
              <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
              <SkeletonBox className="skeleton-pill skeleton-pill-sm" />
            </div>
          </div>
          <div className="table-scroll">
            <table><tbody>{renderTableRowSkeletons(6, 7)}</tbody></table>
          </div>
        </section>
      </section>
    );
  }

  function renderCatalogBlock() {
    return catalogItems.length ? (
      <div className="stack-list">
        {catalogItems.map((item) => (
          <div key={item.label}>
            <div className="stack-row"><span>{item.label}</span><strong>{formatNumber(item.value)}</strong></div>
            <div className={`stack-meter ${item.meterClass}`}><span style={{ width: `${item.width}%` }} /></div>
          </div>
        ))}
      </div>
    ) : <div className="muted">Pair the frontend to load product rule counts.</div>;
  }

  function renderProductTermField(field, label, options) {
    if (!productEditForm) {
      return null;
    }
    const activeValues = productEditForm[field] || [];
    const query = normalizeText(productEditSearch[field]);
    const visibleOptions = options.filter((option) => normalizeText(option).includes(query) && !activeValues.includes(option)).slice(0, 8);

    return (
      <div className="detail-section product-editor-panel">
        <div className="product-term-header">
          <div>
            <p className="section-kicker">{label}</p>
            <h4>{label} assignment</h4>
          </div>
        </div>
        <div className="product-term-field">
          <div className="product-term-chips">
            {activeValues.length ? activeValues.map((value) => (
              <button className="product-chip removable-chip" key={`${field}-${value}`} type="button" aria-label={`Remove ${value}`} onClick={() => toggleProductTerm(field, value)}>
                {value} <InlineIcon id="i-x" />
              </button>
            )) : <span className="muted">No {label.toLowerCase()} assigned yet.</span>}
          </div>
          <div className="product-term-search-row">
            <input
              type="text"
              value={productEditSearch[field]}
              onChange={(event) => setProductEditSearch((prev) => ({ ...prev, [field]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addProductTerm(field);
                }
              }}
              placeholder={`Search or add ${label.toLowerCase()}`}
            />
            <button className="pill-button" type="button" onClick={() => addProductTerm(field)}>Add</button>
          </div>
          {visibleOptions.length ? (
            <div className="product-term-options">
              {visibleOptions.map((option) => (
                <button className="product-term-option" type="button" key={`${field}-option-${option}`} onClick={() => toggleProductTerm(field, option)}>
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderTeamBlock() {
    return (
      <div className="mini-stat-grid">
        {teamItems.map((item) => (
          <div className="mini-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
    );
  }

  function renderEmailBlock() {
    return (
      <div className="mini-stat-grid">
        {emailItems.map((item) => (
          <div className="mini-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <IconSprite />

      <div className="page-shell">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <div className="brand-mark brand-logo-shell">
                <img className="brand-logo" src={siteLogo} alt={`${siteName} logo`} />
              </div>
              <div>
                <strong>{siteName}</strong>
                <span>Admin Storefront</span>
              </div>
            </div>

            <nav className="nav-groups" aria-label="Primary">
              {FRONTEND_PAGES.map((group) => (
                <div className="nav-group" key={group.label}>
                  <p className="nav-label">{group.label}</p>
                  {group.items.map(([pageId, label, icon]) => (
                    <button
                      key={pageId}
                      className={`nav-item ${currentPage === pageId ? "active" : ""}`}
                      onClick={() => switchPage(pageId)}
                      type="button"
                    >
                      <span className="nav-icon"><InlineIcon id={icon} /></span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </div>

          
        </aside>

        <main className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-button mobile-only" type="button" aria-label="Toggle navigation" onClick={() => setSidebarOpen((prev) => !prev)}>
                <InlineIcon id="i-menu" />
              </button>
              {showPageSearch && (
                <label className="search-field" htmlFor="globalSearch">
                  <InlineIcon id="i-search" />
                  <input
                    id="globalSearch"
                    type="search"
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="topbar-actions">
              <div className="create-menu-wrap">
                <button className="btn-add-icon" type="button" aria-label="Create new record" onClick={() => setCreateMenuOpen((prev) => !prev)}>
                  +
                </button>
                {createMenuOpen ? (
                  <div className="create-menu" role="menu">
                    {[
                      ["product", "New Product"],
                      ["order", "New Order"],
                      ["consultation", "New Consultation"],
                      ["doctor", "New Doctor"],
                      ["customer", "New Customer"]
                    ].map(([type, label]) => (
                      <button key={type} type="button" role="menuitem" onClick={() => openCreateModal(type)}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button className="pill-button" type="button" onClick={() => switchPage("consultations")}>
                <InlineIcon id="i-calendar" />
                <span>{formatTopbarDate()}</span>
              </button>
              <button className="icon-button" type="button" onClick={() => switchPage("settings")}><InlineIcon id="i-settings" /></button>
              <button className="user-chip user-chip-button" type="button" onClick={() => switchPage("profile")}>
                <div className="user-avatar">
                  {getInitials(session.user?.display_name || siteName)}
                </div>
                <div className="user-meta">
                  <strong>{session.user?.display_name || siteName}</strong>
                  <span>{session.user?.roles?.join(", ") || (session.paired ? "Paired frontend" : "WordPress pairing required")}</span>
                </div>
              </button>
            </div>
          </header>

          <div className="pages-stack">
            {showPageSkeleton ? renderPageSkeleton() : (
              <>
            {currentPage === "overview" && (
              <section className="page-view active">
                <section className="metrics-grid">
                  <article className="metric-card lime">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-cart" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("orders")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">Gross sales</span>
                    <strong>{formatMoney(sales.month || 0, storeCurrency)}</strong>
                    <small><InlineIcon id="i-arrow-up-right" /> {formatMoney(sales.today || 0, storeCurrency)} processed today</small>
                  </article>
                  <article className="metric-card mint">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-stethoscope" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("consultations")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">Appointments in progress</span>
                    <strong>{formatNumber(appointmentInProgress)}</strong>
                    <small>{formatNumber(consultations.confirmed || 0)} confirmed and {formatNumber(consultations.requested || 0)} requested</small>
                  </article>
                  <article className="metric-card rose">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-clipboard" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("prescriptions")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">RX holds</span>
                    <strong>{formatNumber(rxHolds)}</strong>
                    <small>{formatNumber(prescriptionsSummary.draft || 0)} draft and {formatNumber(prescriptionsSummary.expired || 0)} expired</small>
                  </article>
                  <article className="metric-card violet">
                    <div className="metric-row">
                      <span className="metric-icon"><InlineIcon id="i-mail" /></span>
                      <button className="icon-button subtle" type="button" onClick={() => switchPage("emails")}><InlineIcon id="i-more" /></button>
                    </div>
                    <span className="metric-label">Email failure rate</span>
                    <strong>{formatPercent(emailFailureRate)}</strong>
                    <small>{formatNumber(emailsSummary.failed_today || 0)} failed of {formatNumber(emailTotal)} processed today</small>
                  </article>
                </section>

                <section className="analytics-grid">
                  <article className="panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Commerce + care</p>
                        <h2>Weekly revenue and order velocity</h2>
                      </div>
                      <div className="segmented">
                        <button className={`segment ${trendMode === "week" ? "active" : ""}`} type="button" onClick={() => setTrendMode("week")}>Week</button>
                        <button
                          className={`segment ${trendMode === "live" ? "active" : ""}`}
                          type="button"
                          onClick={() => {
                            setTrendMode("live");
                            handleRefresh();
                          }}
                        >
                          Live
                        </button>
                      </div>
                    </div>
                    <div className="chart-scroll">
                    <div className="bar-chart">
                      {trendSeries.map((day, index) => (
                        <div className="bar-col" key={`${trendMode}-${day.label || "slot"}-${index}`}>
                          <div className="bar-shell">
                            <div
                              className={`bar-fill ${day.placeholder ? "placeholder" : ""}`}
                              style={{ height: `${Math.max(16, (day.total / chartMax) * 190)}px`, backgroundColor: chartColors[index] }}
                            />
                          </div>
                          <div className="bar-note">
                            <strong>{formatMoney(day.total, storeCurrency)}</strong>
                            <span>{day.label}</span>
                            <small>{day.volume ? `${formatNumber(day.volume)} orders` : (trendMode === "live" ? "Waiting for updates" : "No orders")}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Operational mix</p>
                        <h2>Order and prescription states</h2>
                      </div>
                      <button className="icon-button" type="button" onClick={() => switchPage("audit")}><InlineIcon id="i-filter" /></button>
                    </div>
                    <div className="mix-layout">
                      <div className="donut-wrap">
                        <div className="donut-chart">
                          <svg className="donut-svg" viewBox="0 0 140 140" aria-hidden="true">
                            <circle className="donut-track" cx="70" cy="70" r="54" />
                            {donutSegments.map((item) => (
                              <circle
                                key={item.label}
                                className={`donut-segment ${item.color}`}
                                cx="70"
                                cy="70"
                                r="54"
                                strokeDasharray={item.dasharray}
                                strokeDashoffset={item.dashoffset}
                              />
                            ))}
                          </svg>
                          <div className="donut-center">
                            <span>Total active</span>
                            <strong>{formatNumber(legendItems.reduce((sum, item) => sum + Number(item.value), 0))}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="legend-list">
                        {legendItems.map((item) => (
                          <div className="legend-item" key={item.label}>
                            <span className={`legend-swatch ${item.color}`} />
                            <div><strong>{item.label}</strong><span>{formatNumber(item.value)}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </section>

                <section className="overview-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Priority queue</p>
                        <h2>Immediate operational focus</h2>
                      </div>
                    </div>
                    <div className="priority-list">
                      {urgentItems.map((item) => (
                        <button className="priority-card" key={item.label} type="button" onClick={() => switchPage(item.action)}>
                          <span>{item.label}</span>
                          <strong>{formatNumber(item.value)}</strong>
                          <small>{item.note}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Catalog controls</p>
                        <h2>Products by badge and type</h2>
                      </div>
                    </div>
                    {renderCatalogBlock()}
                  </article>
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Clinical team</p>
                        <h2>Doctors and patient access</h2>
                      </div>
                    </div>
                    {renderTeamBlock()}
                  </article>
                </section>

                <section className="overview-grid overview-grid-secondary">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Today's appointments</p>
                        <h2>Closest consultation slots</h2>
                      </div>
                      <button className="pill-button" type="button" onClick={() => switchPage("consultations")}>Open board</button>
                    </div>
                    <div className="signal-list">
                      {todayAppointments.length ? todayAppointments.map((item) => (
                        <div className="signal-row" key={item.id}>
                          <div>
                            <strong>{patientLabel(item.patient_user_id)}</strong>
                            <span>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</span>
                          </div>
                          <div className="signal-meta">
                            <StatusPill value={item.status}>{item.status}</StatusPill>
                            <small>{formatDate(item.start_at, true)}</small>
                          </div>
                        </div>
                      )) : <div className="muted">No appointments scheduled for today.</div>}
                    </div>
                  </article>
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Comms</p>
                        <h2>Email delivery health</h2>
                      </div>
                    </div>
                    {renderEmailBlock()}
                  </article>
                </section>
                </section>
            )}

            {currentPage === "orders" && (
              <section className="page-view active">
                <section className="page-banner panel">
                  <div>
                    <p className="section-kicker">Order operations</p>
                    <h2>Prescription-sensitive order queue</h2>
                    <p className="hero-text">Review WooCommerce orders that intersect with RX validation, payment state, or fulfillment risk.</p>
                  </div>
                  <div className="banner-stats">
                    <div className="mini-stat"><span>Orders loaded</span><strong>{ordersLoading ? "—" : formatNumber(filteredOrders.length)}</strong><small>scoped by current search</small></div>
                    <div className="mini-stat"><span>RX holds</span><strong>{formatNumber(rxHolds)}</strong><small>need release or linkage</small></div>
                  </div>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Fulfillment queue</p>
                      <h2>Orders requiring operational review</h2>
                    </div>
                    <div className="toolbar">
                      
                      <div className="filter-bar order-queue-tabs" role="tablist" aria-label="Order queue filters">
                        {[
                          ["all", "All"],
                          ["needs_rx", "Needs RX"],
                          ["awaiting_payment", "Awaiting payment"],
                          ["doctor_follow_up", "Doctor follow-up"]
                        ].map(([key, label]) => (
                          <button
                            className={`filter-btn order-queue-tab ${orderQueueFilter === key ? "active" : ""}`.trim()}
                            type="button"
                            key={key}
                            role="tab"
                            aria-selected={orderQueueFilter === key}
                            onClick={() => setOrderQueueFilter(key)}
                          >
                            {label}
                            <span className="filter-count">{formatNumber(orderQueueCounts[key] || 0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Type</th>
                          <th>Customer</th>
                          <th>Product mix</th>
                          <th>Prescription</th>
                          <th>Price</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordersLoading ? renderTableRowSkeletons(6, 8) : filteredOrders.length ? filteredOrders.map((order) => {
                          const prescription = (data.prescriptionDetails || []).find((item) => item.id === order.prescription_id);
                          const itemNames = Array.isArray(order.items_summary) ? order.items_summary.filter(Boolean) : [];
                          const itemCount = Number(order.totals?.items_count || order.items_count || itemNames.length || 0);
                          const productMixText = itemNames.length
                            ? `${itemNames.slice(0, 2).join(", ")}${itemNames.length > 2 ? ` +${itemNames.length - 2}` : ""}`
                            : itemCount > 0
                              ? `${itemCount} item${itemCount === 1 ? "" : "s"}`
                              : "Order details unavailable";
                          const typeMeta = getOrderTypeMeta(order);
                          return (
                            <tr
                              key={order.id}
                              className={`interactive-row ${selectedOrderId === order.id ? "active" : ""} ${deletingOrderIds.includes(order.id) ? "order-row-deleting" : ""}`}
                              onClick={() => openOrderDetails(order.id)}
                            >
                              <td><div className="table-title"><strong>#{order.number}</strong><span className="muted">{formatDate(order.created_at, true)}</span></div></td>
                              <td><StatusPill value={typeMeta.tone}>{typeMeta.label}</StatusPill></td>
                              <td>
                                <div className="table-customer-cell order-customer-cell">
                                  <strong>{resolveOrderCustomerSummary(order).name}</strong>
                                  <span>{resolveOrderCustomerSummary(order).email}</span>
                                </div>
                              </td>
                              <td>{productMixText}</td>
                              <td>{prescription ? `${prescription.prescription_number} • ${prescription.status}` : (order.prescription_id ? `Prescription #${order.prescription_id}` : "No linked prescription")}</td>
                              <td>{formatMoney(order.total || 0, storeCurrency)}</td>
                              <td><StatusPill value={order.rx_status || order.status}>{order.rx_status || order.status}</StatusPill></td>
                              <td>
                                <div className="table-action-strip">
                                  <button className="icon-button table-action-button" type="button" title={getOrderDocumentType(order) === "receipt" ? "Print receipt" : "Print invoice"} aria-label={`${getOrderDocumentType(order) === "receipt" ? "Print receipt" : "Print invoice"} for order #${order.number}`} disabled={tableActionLoading === `print-${order.id}`} onClick={(event) => { event.stopPropagation(); printOrderDocumentFromRow(order); }}>{tableActionLoading === `print-${order.id}` ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-printer" />}</button>
                                  <button className="icon-button table-action-button" type="button" title="Send receipt" aria-label={`Send receipt for order #${order.number}`} disabled={tableActionLoading === `send-${order.id}`} onClick={(event) => { event.stopPropagation(); sendOrderReceiptFromRow(order); }}>{tableActionLoading === `send-${order.id}` ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-mail" />}</button>
                                  <button className="icon-button table-action-button danger" type="button" title="Delete order" aria-label={`Delete order #${order.number}`} disabled={tableActionLoading === `delete-${order.id}`} onClick={(event) => { event.stopPropagation(); deleteOrderFromRow(order); }}>{tableActionLoading === `delete-${order.id}` ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-trash" />}</button>
                                </div>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr><td colSpan="7" className="muted">No orders match the current search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "payments" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Payment summary</p>
                        
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      <div className="mini-stat"><span>Month revenue</span><strong>{formatMoney(sales.month || 0, storeCurrency)}</strong><small>WooCommerce totals from dashboard</small></div>
                      <div className="mini-stat"><span>Today revenue</span><strong>{formatMoney(sales.today || 0, storeCurrency)}</strong><small>Processed today</small></div>
                      <div className="mini-stat"><span>Completed payments</span><strong>{formatNumber(paymentRows.filter((row) => row.paymentStatus === "completed").length)}</strong><small>Processed payments</small></div>
                      <div className="mini-stat"><span>Failed or refunded</span><strong>{formatNumber(paymentRows.filter((row) => ["failed", "refunded"].includes(row.paymentStatus)).length)}</strong><small>Payment exceptions</small></div>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker"> Store Payments</p>
                      
                    </div>
                    <div className="toolbar">
                      <div className="filter-bar" aria-label="Payment filters">
                        {[
                          ["all", "All"],
                          ["completed", "Completed"],
                          ["pending", "Pending"],
                          ["failed", "Failed"],
                          ["refunded", "Refunded"]
                        ].map(([key, label]) => (
                          <button className={`filter-btn ${paymentFilter === key ? "active" : ""}`} type="button" key={key} onClick={() => setPaymentFilter(key)}>
                            {label} <span className="filter-count">{formatNumber(paymentFilterCounts[key] || 0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="payments-table">
                      <thead>
                        <tr>
                          <th className="order-col">Order</th>
                          <th className="customer-col">Customer</th>
                          <th className="created-col">Created</th>
                          <th className="amount-col">Amount</th>
                          <th className="payment-col">Payment</th>
                          <th className="rx-col">RX state</th>
                          <th className="action-col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsLoading ? renderTableRowSkeletons(6, 7) : paginatedPaymentRows.length ? paginatedPaymentRows.map((row) => (
                          <tr
                            key={row.id}
                            className="table-row-button"
                            role="button"
                            tabIndex={0}
                            onClick={() => openPaymentReceipt(row.sourceOrder)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openPaymentReceipt(row.sourceOrder);
                              }
                            }}
                          >
                            <td className="order-col">#{row.number}</td>
                            <td>
                              <div className="table-customer-cell payment-customer-cell">
                                <strong>{customerSummary(row.sourceOrder).name}</strong>
                                <span>{customerSummary(row.sourceOrder).email}</span>
                              </div>
                            </td>
                            <td className="created-col">{formatDate(row.createdAt, true)}</td>
                            <td className="amount-col">{formatMoney(row.amount, storeCurrency)}</td>
                            <td className="payment-col"><StatusPill value={row.paymentStatus}>{row.paymentStatus}</StatusPill></td>
                            <td className="rx-col"><StatusPill value={row.rxStatus}>{row.rxStatus}</StatusPill></td>
                            <td className="action-col">
                              <div className="table-action-strip">
                                <button className="icon-button table-action-button" type="button" title="Print receipt" aria-label={`Print receipt for order #${row.number}`} disabled={tableActionLoading === `print-${row.id}`} onClick={(event) => { event.stopPropagation(); printOrderReceiptFromRow(row.sourceOrder); }}>{tableActionLoading === `print-${row.id}` ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-printer" />}</button>
                                <button className="icon-button table-action-button" type="button" title="Download receipt" aria-label={`Download receipt for order #${row.number}`} disabled={tableActionLoading === `download-${row.id}`} onClick={(event) => { event.stopPropagation(); downloadOrderReceiptFromRow(row.sourceOrder); }}>{tableActionLoading === `download-${row.id}` ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-download" />}</button>
                                <button className="icon-button table-action-button" type="button" title="Send receipt" aria-label={`Send receipt for order #${row.number}`} disabled={tableActionLoading === `send-${row.id}`} onClick={(event) => { event.stopPropagation(); sendOrderReceiptFromRow(row.sourceOrder); }}>{tableActionLoading === `send-${row.id}` ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-mail" />}</button>
                              </div>
                            </td>
                          </tr>
                        )) : <tr><td colSpan="7" className="muted">No payment rows match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination-row">
                    <div className="pagination">
                      <button className="page-item" type="button" disabled={activePaymentPage === 1} onClick={() => setPaymentPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                      {Array.from({ length: paymentPageCount }, (_, index) => index + 1).slice(0, 7).map((page) => (
                        <button className={`page-item ${activePaymentPage === page ? "active" : ""}`} type="button" key={page} onClick={() => setPaymentPage(page)}>{page}</button>
                      ))}
                      <button className="page-item" type="button" disabled={activePaymentPage === paymentPageCount} onClick={() => setPaymentPage((prev) => Math.min(paymentPageCount, prev + 1))}>Next</button>
                    </div>
                    <div className="pagination-summary">Showing {paymentRows.length ? `${formatNumber(((activePaymentPage - 1) * paymentsPerPage) + 1)}-${formatNumber(Math.min(activePaymentPage * paymentsPerPage, paymentRows.length))}` : "0"} of {formatNumber(paymentRows.length)} payments</div>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "customers" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      
                    </div>
                    <div className="mini-stat-grid">
                      <button className={`mini-stat clickable-stat ${customerFilter === "all" ? "active" : ""}`} type="button" onClick={() => setCustomerFilter("all")}><span>Visible customers</span><strong>{formatNumber(allCustomerRows.length)}</strong><small>derived from orders, appointments, and prescriptions</small></button>
                      <button className={`mini-stat clickable-stat ${customerFilter === "repeat" ? "active" : ""}`} type="button" onClick={() => setCustomerFilter("repeat")}><span>Repeat customers</span><strong>{formatNumber(allCustomerRows.filter((row) => row.orders > 1).length)}</strong><small>more than one order in current dataset</small></button>
                      <button className={`mini-stat clickable-stat ${customerFilter === "prescriptions" ? "active" : ""}`} type="button" onClick={() => setCustomerFilter("prescriptions")}><span>With prescriptions</span><strong>{formatNumber(allCustomerRows.filter((row) => row.prescriptions > 0).length)}</strong><small>linked to active pharmacy workflow</small></button>
                      <button className={`mini-stat clickable-stat ${customerFilter === "appointments" ? "active" : ""}`} type="button" onClick={() => setCustomerFilter("appointments")}><span>With appointments</span><strong>{formatNumber(allCustomerRows.filter((row) => row.appointments > 0).length)}</strong><small>consultation touchpoints</small></button>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Customer list</p>
                      
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th className="narrow-col">Orders</th>
                          <th>Spend</th>
                          <th className="narrow-col">Prescriptions</th>
                          <th className="narrow-col">Appointments</th>
                          <th>Last activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerRows.length ? customerRows.map((row) => (
                          <tr
                            key={row.id}
                            className="table-row-button"
                            role="button"
                            tabIndex={0}
                            onClick={() => openCustomerDetails(row)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openCustomerDetails(row);
                              }
                            }}
                          >
                            <td>
                              <div className="customer-list-profile">
                                <span className="customer-list-avatar">{getNameInitials(row.name || row.label || row.email || "Customer", "CU")}</span>
                                <span>{row.label}</span>
                              </div>
                            </td>
                            <td>{row.name}</td>
                            <td className="email-cell">{row.email}</td>
                            <td>{formatNumber(row.orders)}</td>
                            <td>{formatMoney(row.spend, storeCurrency)}</td>
                            <td>{formatNumber(row.prescriptions)}</td>
                            <td>{formatNumber(row.appointments)}</td>
                            <td>{formatDate(row.lastActivity, true)}</td>
                          </tr>
                        )) : <tr><td colSpan="8" className="muted">No customer rows match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "consultations" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Consultation status</p>
                        <h2>Care schedule summary</h2>
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      {[
                        ["all", "All"],
                        ["upcoming", "Upcoming"],
                        ["past", "Past"],
                        ["ongoing", "Ongoing"]
                      ].map(([key, label]) => (
                        <button className={`mini-stat clickable-stat ${consultationFilter === key ? "active" : ""}`} type="button" key={key} onClick={() => setConsultationFilter(key)}>
                          <span>{label}</span>
                          <strong>{formatNumber(consultationCounts[key] || 0)}</strong>
                          <small>{key === "all" ? "all visible consultations" : key === "past" ? "clickable when ended" : "locked until the consultation ends"}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                </section>
                <section className="dual-table-grid">
                  <article className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Consultation flow</p>
                        <h2>{formatStatusLabel(consultationFilter)} consultations</h2>
                      </div>
                      <div className="toolbar consultation-list-actions">
                        <button className="pill-button" type="button" onClick={() => setSelectedConsultationDate(isoDateKey())}>Today only</button>
                        {selectedConsultationDate ? <button className="pill-button" type="button" onClick={() => setSelectedConsultationDate("")}>All dates</button> : null}
                      </div>
                    </div>
                    <div className="table-scroll consultation-table-scroll">
                      <table className="consultations-table">
                        <thead>
                          <tr>
                            <th>Patient</th>
                            <th>Doctor</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Starts</th>
                            <th>Ends</th>
                          </tr>
                        </thead>
                        <tbody>
                          {consultationsLoading ? renderTableRowSkeletons(6, 6) : consultationList.length ? consultationList.map((item) => (
                            <tr
                              key={item.id}
                              className="table-row-button"
                              role="button"
                              tabIndex={0}
                              onClick={() => openConsultationDetails(item)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openConsultationDetails(item);
                                }
                              }}
                            >
                              <td>
                                <div className="customer-list-profile">
                                  <span className="customer-list-avatar">{getNameInitials(patientLabel(item.patient_user_id), "PT")}</span>
                                  <span>{patientLabel(item.patient_user_id)}</span>
                                </div>
                              </td>
                              <td>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</td>
                              <td>{formatStatusLabel(item.type || "consultation")}</td>
                              <td><StatusPill value={item.group}>{formatStatusLabel(item.group)}</StatusPill></td>
                              <td>{formatDate(item.start_at, true)}</td>
                              <td>{formatDate(item.end_at, true)}</td>
                            </tr>
                          )) : <tr><td colSpan="6" className="muted">No consultations match the selected status{selectedConsultationDate ? " and date" : ""}.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="panel table-panel">
                    <BookingCalendarWidget
                      title="Consultation Calendar"
                      subtitle="Review bookings and filter the consultation list"
                      datePanelSubtitle="Tap any day to review bookings"
                      appointments={data.appointments || []}
                      selectedDate={selectedConsultationDate}
                      viewDate={consultationCalendarViewDate}
                      duration={consultationDuration}
                      onViewDateChange={setConsultationCalendarViewDate}
                      onDateSelect={(dateKey, date) => {
                        setSelectedConsultationDate(dateKey);
                        setConsultationCalendarViewDate(date);
                      }}
                      onSlotSelect={(dateKey) => setSelectedConsultationDate(dateKey)}
                      onDurationChange={setConsultationDuration}
                      showStepsHeader={false}
                      showTimeSlots={false}
                    />
                    <div className="history-list removed-history" hidden>
                      {sortedHistory.length ? sortedHistory.map((item, index) => {
                        const prescription = (data.prescriptionDetails || []).find((entry) => entry.id === item.prescription_id);
                        return (
                          <article className="history-card" key={`${item.prescription_id}-${item.created_at}-${index}`}>
                            <div className="history-meta">
                              <strong>{prescription?.prescription_number || `Prescription #${item.prescription_id}`}</strong>
                              <StatusPill value={item.new_status || item.action} className="audit-pill">{formatDate(item.created_at, true)}</StatusPill>
                            </div>
                            <p>{item.action} moved {item.previous_status || "new"} to {item.new_status}.</p>
                            <span>Actor user #{item.actor_user_id}{item.note ? ` • ${item.note}` : ""}</span>
                          </article>
                        );
                      }) : <article className="history-card"><p>No prescription history is available yet.</p></article>}
                    </div>
                  </article>
                </section>
              </section>
            )}

            {currentPage === "prescriptions" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Prescription program</p>
                        <h2>Status summary</h2>
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      <div className="mini-stat"><span>Draft</span><strong>{formatNumber(prescriptionsSummary.draft || 0)}</strong><small>awaiting issue review</small></div>
                      <div className="mini-stat"><span>Assigned</span><strong>{formatNumber(prescriptionsSummary.assigned || 0)}</strong><small>patient notification queue</small></div>
                      <div className="mini-stat"><span>Fulfilled</span><strong>{formatNumber(prescriptionsSummary.fulfilled || 0)}</strong><small>completed medication flow</small></div>
                      <div className="mini-stat"><span>Expired</span><strong>{formatNumber(prescriptionsSummary.expired || 0)}</strong><small>needs renewal handling</small></div>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Prescription registry</p>
                      <h2>Current patient medication instructions</h2>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Prescription</th>
                          <th>Patient</th>
                          <th>Doctor</th>
                          <th>Status</th>
                          <th>Issued</th>
                          <th>Valid until</th>
                          <th>Diagnosis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescriptionsLoading ? renderTableRowSkeletons(6, 7) : filteredPrescriptions.length ? filteredPrescriptions.map((item) => (
                          <tr key={item.id}>
                            <td>{item.prescription_number || `Prescription #${item.id}`}</td>
                            <td>{patientLabel(item.patient_user_id)}</td>
                            <td>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</td>
                            <td><StatusPill value={item.status}>{item.status}</StatusPill></td>
                            <td>{formatDate(item.issued_at || item.created_at, true)}</td>
                            <td>{formatDate(item.valid_until)}</td>
                            <td>{item.diagnosis || "Diagnosis not recorded"}</td>
                          </tr>
                        )) : <tr><td colSpan="7" className="muted">No prescriptions match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "products" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Product stats</p>
                        <h2>Catalog health</h2>
                      </div>
                    </div>
                    <div className="mini-stat-grid">
                      <div className="mini-stat"><span>Total products</span><strong>{formatNumber((data.products || []).length)}</strong><small>available in current sync</small></div>
                      <div className="mini-stat"><span>Published</span><strong>{formatNumber((data.products || []).filter((product) => getProductStatus(product) === "publish").length)}</strong><small>visible products</small></div>
                      <div className="mini-stat"><span>In stock</span><strong>{formatNumber((data.products || []).filter((product) => (product.stock_status || "instock") === "instock").length)}</strong><small>ready to sell</small></div>
                      <div className="mini-stat"><span>RX required</span><strong>{formatNumber((data.products || []).filter((product) => product.pharmacy_rules?.rx_required).length)}</strong><small>doctor workflow products</small></div>
                    </div>
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header products-panel-header">
                    <div>
                      <p className="section-kicker">All Products</p>
                      <h2>Pharmaceutical Products</h2>
                    </div>
                    <div className="filter-bar products-segmented-bar" aria-label="Products and categories view">
                      {[
                        ["products", "All products", formatNumber((data.products || []).length)],
                        ["categories", "Categories", formatNumber(productCategoryRows.length)]
                      ].map(([key, label, count]) => (
                        <button className={`filter-btn ${productCatalogView === key ? "active" : ""}`} type="button" key={key} onClick={() => startTransition(() => setProductCatalogView(key))}>
                          {label} <span className="filter-count">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {productCatalogView === "products" ? <>
                  <div className="filter-bar products-filter-bar" aria-label="Product list filters">
                    {[
                      ["all", "All"],
                      ["published", "Published"],
                      ["draft", "Draft"],
                      ["in_stock", "In stock"],
                      ["out_of_stock", "Out of stock"],
                      ["on_sale", "On sale"]
                    ].map(([key, label]) => (
                      <button className={`filter-btn ${productListFilter === key ? "active" : ""}`} type="button" key={key} onClick={() => setProductListFilter(key)}>
                        {label} <span className="filter-count">{formatNumber(productFilterCounts[key] || 0)}</span>
                      </button>
                    ))}
                  </div>
                  {selectedProductIds.length ? (
                    <div className="products-bulk-bar" role="status" aria-live="polite">
                      <div className="active-tags">
                        <span className="active-tag">{formatNumber(selectedProductIds.length)} selected</span>
                      </div>
                      <button className="products-bulk-delete" type="button" onClick={deleteSelectedProductsBulk}>Delete selected</button>
                    </div>
                  ) : null}
                  <div className="table-scroll">
                    <table className="products-table">
                      <thead>
                        <tr>
                          <th className="bulk-check-col"><input className="bulk-check" type="checkbox" checked={allVisibleProductsSelected} aria-label="Select all products" onChange={toggleVisibleProductSelection} /></th>
                          <th className="image-col">Image</th>
                          <th> Name</th>
                          <th className="sku-col">SKU</th>
                          <th>Stock</th>
                          <th className="price-col">Price</th>
                          <th>Categories</th>
                          <th>Tags</th>
                          <th>Brands</th>
                          <th className="featured-col">★</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicatingProductId ? (
                          <tr className="product-row product-row-skeleton" aria-hidden="true">
                            <td className="bulk-check-col"><SkeletonBox className="skeleton-circle skeleton-circle-xs" /></td>
                            <td className="image-col"><div className="product-thumb"><SkeletonBox className="skeleton" /></div></td>
                            <td className="product-name-cell">
                              <div className="product-name-wrap">
                                <SkeletonBox className="skeleton-line skeleton-line-md" />
                                <SkeletonBox className="skeleton-line skeleton-line-sm" />
                              </div>
                            </td>
                            <td className="sku-col"><SkeletonBox className="skeleton-line skeleton-line-sm" /></td>
                            <td><SkeletonBox className="skeleton-line skeleton-line-md" /></td>
                            <td className="price-col"><SkeletonBox className="skeleton-line skeleton-line-sm" /></td>
                            <td><SkeletonBox className="skeleton-line skeleton-line-md" /></td>
                            <td><SkeletonBox className="skeleton-line skeleton-line-sm" /></td>
                            <td><SkeletonBox className="skeleton-line skeleton-line-sm" /></td>
                            <td className="featured-col"><SkeletonBox className="skeleton-circle skeleton-circle-xs" /></td>
                            <td><SkeletonBox className="skeleton-line skeleton-line-md" /></td>
                          </tr>
                        ) : null}
                        {productsLoading ? renderTableRowSkeletons(8, 11) : paginatedProducts.length ? paginatedProducts.map((product) => {
                          const actionLinks = buildProductActionLinks(product, session);
                          const stockQuantity = getProductStockQuantity(product);
                          const stockStatus = product.stock_status || "instock";
                          const isDraftProduct = getProductStatus(product) === "draft";
                          const tags = getProductTags(product);
                          const brands = getProductBrands(product);
                          return (
                            <tr key={product.id} className={`product-row ${isDraftProduct ? "product-row-draft" : ""} ${deletingProductIds.includes(product.id) ? "product-row-deleting" : ""}`}>
                              <td className="bulk-check-col"><input className="bulk-check" type="checkbox" checked={selectedProductIds.includes(product.id)} aria-label={`Select ${product.name || `Product ${product.id}`}`} onChange={() => toggleProductSelection(product.id)} /></td>
                              <td className="image-col"><div className="product-thumb">{getProductImage(product) ? <img src={getProductImage(product)} alt={product.name || "Product"} /> : <InlineIcon id="i-pill" />}</div></td>
                              <td className="product-name-cell">
                                <div className="product-name-wrap">
                                  <button className="table-link" type="button" onClick={() => openProductEditModal(product)}>{product.name || `Product #${product.id}`}</button>
                                  <div className="row-actions" aria-label={`Actions for ${product.name || `Product ${product.id}`}`}>
                                    <button type="button" onClick={() => openProductEditModal(product)}>Edit</button>
                                    <a href={actionLinks.viewHref} target="_blank" rel="noreferrer">View</a>
                                    <button type="button" disabled={duplicatingProductId === product.id} onClick={() => duplicateProduct(product)}>{duplicatingProductId === product.id ? "Duplicating..." : "Duplicate"}</button>
                                    <button className="row-action-trash" type="button" disabled={duplicatingProductId === product.id} onClick={() => trashProduct(product)}>Trash</button>
                                  </div>
                                </div>
                              </td>
                              <td className="sku-col">{product.sku || "n/a"}</td>
                              <td>
                                <div className="table-title">
                                  <strong className={`stock-label ${stockStatus}`}>{formatStatusLabel(stockStatus)}</strong>
                                  <span className="muted">{stockQuantity === null ? "Qty unavailable" : `${formatNumber(stockQuantity)} in inventory`}</span>
                                </div>
                              </td>
                              <td className="price-col">{getProductPriceLabel(product, storeCurrency)}</td>
                              <td>{getProductCategories(product)}</td>
                              <td>{tags || "—"}</td>
                              <td>{brands || "—"}</td>
                              <td className="featured-col">
                                <button type="button" className={`featured-toggle ${isFeaturedProduct(product) ? "active" : ""}`} aria-label={`Featured status for ${product.name || `Product ${product.id}`}`}>
                                  ★
                                </button>
                              </td>
                              <td>
                                <div className="table-title">
                                  <strong>{getProductDateLabel(product)}</strong>
                                  <span className="muted">{formatDate(getProductDateValue(product), true)}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        }) : <tr><td colSpan="11" className="muted">No products match the current search or list filter.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination-row">
                    <div className="pagination">
                      <button className="page-item" type="button" disabled={activeProductPage === 1} onClick={() => setProductPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                      {Array.from({ length: productPageCount }, (_, index) => index + 1).slice(0, 7).map((page) => (
                        <button className={`page-item ${activeProductPage === page ? "active" : ""}`} type="button" key={page} onClick={() => setProductPage(page)}>{page}</button>
                      ))}
                      <button className="page-item" type="button" disabled={activeProductPage === productPageCount} onClick={() => setProductPage((prev) => Math.min(productPageCount, prev + 1))}>Next</button>
                    </div>
                    <div className="pagination-summary">Showing {filteredProducts.length ? `${formatNumber(((activeProductPage - 1) * productsPerPage) + 1)}-${formatNumber(Math.min(activeProductPage * productsPerPage, filteredProducts.length))}` : "0"} of {formatNumber(filteredProducts.length)} products</div>
                  </div>
                  </> : <div className="product-categories-pane">
                    <aside className="product-categories-sidebar">
                      <div className="product-categories-pane-head">
                        <div>
                          <h3>Product categories</h3>
                          <span className="pagination-summary">{formatNumber(productCategoryRows.length)} categories</span>
                        </div>
                        <div className="product-category-head-actions">
                          <button
                            className="pill-button product-category-new-button"
                            type="button"
                            onClick={openCategoryCreateForm}
                            disabled={categoryCreateOpen || categoryMutationLoading === "create-category"}
                          >
                            + New category
                          </button>
                        </div>
                      </div>
                      <div className="product-category-list" role="tablist" aria-label="Product categories">
                        {productCategoryRows.length ? productCategoryRows.map((category) => (
                          <button
                            className={`product-category-row ${selectedCategory?.name === category.name ? "active" : ""}`}
                            type="button"
                            role="tab"
                            aria-selected={selectedCategory?.name === category.name}
                            key={category.key}
                            onClick={() => startTransition(() => setSelectedProductCategoryName(category.name))}
                          >
                            <div>
                              <strong>{category.name}</strong>
                              <span>{formatNumber(category.productCount)} products linked</span>
                            </div>
                            <div className="product-category-row-price">
                              {formatCategoryPricing(category.price)}
                          
                            </div>
                          </button>
                        )) : <div className="empty-card compact-empty"><div className="card-title">No product categories available.</div></div>}
                      </div>
                    </aside>
                    <section className="product-categories-content">
                      <div className="product-categories-pane-head product-category-inline-head">
                        <div className="product-category-inline-group">
                          
                          {selectedCategory ? (
                            categoryInlineField === "name" ? (
                              <div className="product-category-name-editor">
                                <input
                                  ref={categoryNameInputRef}
                                  className="product-category-inline-input product-category-name-input"
                                  value={categoryEditDraft.name}
                                  onChange={(event) => setCategoryEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                                  onBlur={() => saveCategoryEdit("name")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveCategoryEdit("name");
                                    }
                                    if (event.key === "Escape") {
                                      setCategoryEditDraft((prev) => ({ ...prev, name: selectedCategory.name || "" }));
                                      setCategoryInlineField("");
                                    }
                                  }}
                                />
                                {categoryMutationLoading === "edit-category" ? <span className="category-saving-spinner" aria-label="Saving category name" role="status" /> : null}
                              </div>
                            ) : (
                              <button className="product-category-inline-trigger product-category-name-trigger" type="button" onClick={() => setCategoryInlineField("name")}>
                                <strong>{selectedCategory.name}</strong>
                                <InlineIcon id="i-pencil" />
                              </button>
                            )
                          ) : <h3>Select a category</h3>}
                        </div>
                        <div className="product-category-price-chip product-category-inline-group">
                          <span>Per {minimumConsultationLabel}</span>
                          {selectedCategory ? (
                            categoryInlineField === "price" ? (
                              <div className="product-category-price-editor">
                                <span className="product-category-currency">{storeCurrency}</span>
                                <input
                                  ref={categoryPriceInputRef}
                                  className="product-category-inline-input product-category-price-input"
                                  type="number"
                                  step="0.01"
                                  value={categoryEditDraft.pricePerMinute}
                                  onChange={(event) => setCategoryEditDraft((prev) => ({ ...prev, pricePerMinute: event.target.value }))}
                                  onBlur={() => saveCategoryEdit("price")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveCategoryEdit("price");
                                    }
                                    if (event.key === "Escape") {
                                      setCategoryEditDraft((prev) => ({ ...prev, pricePerMinute: String(selectedCategory.price || "") }));
                                      setCategoryInlineField("");
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <button className="product-category-inline-trigger product-category-price-trigger" type="button" onClick={() => setCategoryInlineField("price")}>
                                {formatCategoryPricing(selectedCategory.price)}
                                <InlineIcon id="i-pencil" />
                              </button>
                            )
                          ) : <strong>Not set</strong>}
                          {categorySaveNotice ? <small className="product-category-save-notice">{categorySaveNotice}</small> : null}
                        </div>
                      </div>
                      {selectedCategory ? <>
                        <section className="product-category-doctor-strip-card" data-component="DoctorAssignmentSection">
                          <div className="panel-header product-category-products-header">
                            
                            <span className="pagination-summary">{formatNumber(assignedCategoryDoctorRows.length)} assigned</span>
                          </div>
                          <div className="doctor-search-wrapper" data-component="DoctorSearchInput">
                            <label className="product-category-searchfield category-doctor-searchfield">
                              <input value={categoryDoctorSearch} onChange={(event) => setCategoryDoctorSearch(event.target.value)} placeholder="Search by doctor name, specialty, or email" />
                            </label>
                            {categoryDoctorSearch ? (
                              <div className="doctor-search-results" data-component="DoctorSearchDropdown">
                                {availableCategoryDoctorRows.length ? availableCategoryDoctorRows.map(({ doctor }) => {
                                  const doctorId = doctor.user_id || doctor.id;
                                  const loadingKey = `${doctorId}:assign`;
                                  return (
                                    <div className="doctor-result-item" key={`doctor-search-${doctorId}`}>
                                      <div className="doctor-result-left">
                                        <div className={`doctor-avatar ${doctorId ? `doctor-${String(doctorId).toString().slice(-1)}` : ""}`}>{getInitials(doctor.display_name || doctor.email || "Dr")}</div>
                                        <div className="doctor-result-info">
                                          <strong className="doctor-result-name">{doctor.display_name || `Doctor #${doctorId}`}</strong>
                                          <span className="doctor-result-meta">{doctor.specialty || doctor.specialties?.join(", ") || "General practice"}</span>
                                        </div>
                                      </div>
                                      <button
                                        className="pill-button doctor-assign-btn"
                                        type="button"
                                        disabled={categoryMutationLoading === loadingKey}
                                        onClick={() => updateCategoryDoctorAssignment(doctor, true)}
                                      >
                                        {categoryMutationLoading === loadingKey ? "Saving..." : "Assign"}
                                      </button>
                                    </div>
                                  );
                                }) : (
                                  <div className="empty-card compact-empty">
                                    <div className="card-title">No doctors match the current search.</div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                          {categoryMutationFeedback ? <p className="receipt-feedback">{categoryMutationFeedback}</p> : null}
                          {assignedCategoryDoctorRows.length ? (
                            <div className="doctor-strip" aria-label={`Assigned doctors for ${selectedCategory.name}`}>
                              {assignedCategoryDoctorRows.map(({ doctor }) => {
                                const doctorId = doctor.user_id || doctor.id;
                                const loadingKey = `${doctorId}:remove`;
                                return (
                                  <article className="doctor-mini" data-component="AssignedDoctorCard" key={`doctor-strip-${doctorId}`}>
                                    <button
                                      className="doctor-mini-close"
                                      type="button"
                                      aria-label={`Remove ${doctor.display_name || "doctor"} from ${selectedCategory.name}`}
                                      disabled={categoryMutationLoading === loadingKey}
                                      onClick={() => updateCategoryDoctorAssignment(doctor, false)}
                                    >
                                      <InlineIcon id="i-x" />
                                    </button>
                                    <div className={`avatar ${doctorId ? `doctor-${String(doctorId).toString().slice(-1)}` : ""}`}>{getInitials(doctor.display_name || doctor.email || "Dr")}</div>
                                    <div className="card-title">{doctor.display_name || `Doctor #${doctorId}`}</div>
                                    <div className="card-desc">{doctor.specialty || doctor.specialties?.join(", ") || "General practice"}</div>
                                  </article>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="empty-card compact-empty">
                              <div className="card-title">No doctors assigned yet. Search to add one.</div>
                            </div>
                          )}
                        </section>
                        
                        <div className="product-category-products">
                          <div className="panel-header product-category-products-header">
                            <div>
                          
                              
                              <p className="product-category-section-copy">Manage products attached to this consultation category.</p>
                              <div className="product-category-searchbar">
                            
                          <label className="product-category-searchfield product-category-searchfield-inline">
                            
                            <InlineIcon id="i-search" />
                            <input value={categoryProductSearch} onChange={(event) => setCategoryProductSearch(event.target.value)} placeholder="Search product name to add" />
                          </label>
                        {categorySearchQuery ? <div className="product-category-add-results">
                          {categoryProductCandidates.length ? categoryProductCandidates.map((product) => {
                            const loadingKey = `${product.id}:${selectedCategory.name}`;
                            return <div className="product-category-add-row" key={`add-${product.id}`}>
                              <div className="table-title">
                                <strong>{product.name || `Product #${product.id}`}</strong>
                                <span>{product.sku || "No SKU"} • {getProductPriceLabel(product, storeCurrency)}</span>
                              </div>
                              <button className="pill-button" type="button" disabled={categoryAssignmentLoading === loadingKey} onClick={() => addProductToCategory(product, selectedCategory)}>
                                {categoryAssignmentLoading === loadingKey ? "Adding..." : "Add"}
                              </button>
                            </div>;
                          }) : <div className="empty-card compact-empty"><div className="card-title">No matching products available to add.</div></div>}
                        </div> : null}
                        </div>
                              <h3>{formatNumber(selectedCategoryProducts.length)} linked products</h3>
                            </div>
                          </div>
                          <div className="product-category-linked-list">
                            {paginatedSelectedCategoryProducts.length ? paginatedSelectedCategoryProducts.map((product) => (
                              <article className="product-category-product-card" key={`linked-${product.id}`}>
                                <button
                                  className="product-category-product-remove"
                                  type="button"
                                  aria-label={`Remove ${product.name || "product"} from ${selectedCategory.name}`}
                                  disabled={categoryAssignmentLoading === `${product.id}:${selectedCategory.name}:remove`}
                                  onClick={() => removeProductFromCategory(product, selectedCategory)}
                                >
                                  <InlineIcon id="i-x" />
                                </button>
                                <div className="product-thumb">{getProductImage(product) ? <img src={getProductImage(product)} alt={product.name || "Product"} /> : <InlineIcon id="i-pill" />}</div>
                                <div className="table-title">
                                  <strong>{product.name || `Product #${product.id}`}</strong>
                                  <span>{product.sku || "No SKU"} • {getProductPriceLabel(product, storeCurrency)}</span>
                                </div>
                                <span className={`status-pill ${getProductStatus(product) === "publish" ? "success" : "warning"}`}>{formatStatusLabel(getProductStatus(product))}</span>
                              </article>
                            )) : <div className="empty-card compact-empty"><div className="card-title">No products linked to this category yet.</div></div>}
                          </div>
                          <div className="pagination-row product-category-pagination-row">
                            <div className="pagination">
                              <button className="page-item" type="button" disabled={activeCategoryProductPage === 1} onClick={() => setCategoryProductPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                              {Array.from({ length: categoryProductPageCount }, (_, index) => index + 1).slice(0, 7).map((page) => (
                                <button className={`page-item ${activeCategoryProductPage === page ? "active" : ""}`} type="button" key={page} onClick={() => setCategoryProductPage(page)}>{page}</button>
                              ))}
                              <button className="page-item" type="button" disabled={activeCategoryProductPage === categoryProductPageCount} onClick={() => setCategoryProductPage((prev) => Math.min(categoryProductPageCount, prev + 1))}>Next</button>
                            </div>
                            <div className="pagination-summary">Showing {selectedCategoryProducts.length ? `${formatNumber(((activeCategoryProductPage - 1) * categoryProductsPerPage) + 1)}-${formatNumber(Math.min(activeCategoryProductPage * categoryProductsPerPage, selectedCategoryProducts.length))}` : "0"} of {formatNumber(selectedCategoryProducts.length)} products</div>
                          </div>
                        </div>
                      </> : <div className="empty-card compact-empty"><div className="card-title">Select a category to manage linked products.</div></div>}
                    </section>
                  </div>}
                </section>
              </section>
            )}

            {currentPage === "doctors" && (
              <section className="page-view active">
                <section className="operations-grid">
                  <article className="panel compact">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Clinical team</p>
                        <h2>Doctor capacity and role coverage</h2>
                      </div>
                    </div>
                    {renderTeamBlock()}
                  </article>
                </section>
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Doctor directory</p>
                      <h2>Assigned practitioners</h2>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Specialty</th>
                          <th>Location</th>
                          <th>Status</th>
                          <th>Linked patients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doctorsLoading ? renderTableRowSkeletons(6, 6) : filteredDoctors.length ? filteredDoctors.map((doctor) => {
                          const doctorId = doctor.user_id || doctor.id;
                          const linkedPatients = new Set([
                            ...(data.appointments || []).filter((item) => Number(item.doctor_user_id) === Number(doctorId)).map((item) => item.patient_user_id),
                            ...(data.prescriptionDetails || []).filter((item) => Number(item.doctor_user_id) === Number(doctorId)).map((item) => item.patient_user_id)
                          ].filter(Boolean));
                          return (
                          <tr key={doctorId} className="table-row-button" onClick={() => setSelectedDoctorId(doctorId)}>
                            <td>{doctor.display_name || `Doctor #${doctor.user_id || doctor.id}`}</td>
                            <td>{doctor.email || "n/a"}</td>
                            <td>{doctor.specialty || "General practice"}</td>
                            <td>{doctor.location || "Nevari network"}</td>
                            <td><StatusPill value={getDoctorStatus(doctor)}>{formatStatusLabel(getDoctorStatus(doctor))}</StatusPill></td>
                            <td>{formatNumber(linkedPatients.size)}</td>
                          </tr>
                        );}) : <tr><td colSpan="6" className="muted">No doctors match the current search.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "emails" && (
              <section className="page-view active">
                <section className="panel email-booking-test-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Booking email test</p>
                      <h2>Preview appointment lifecycle emails</h2>
                    </div>
                    <StatusPill value={bookingEmailTest.meetLink ? "success" : "info"}>
                      {bookingEmailTest.meetLink ? "Direct Meet link created" : "Ready"}
                    </StatusPill>
                  </div>
                  <div className="email-editor-grid">
                    <div className="email-editor-fields">
                      <label className="detail-field detail-field-wide">
                        <span>Recipient email</span>
                        <input
                          type="email"
                          value={bookingEmailTest.recipientEmail}
                          onChange={(event) => setBookingEmailTest((current) => ({ ...current, recipientEmail: event.target.value, feedback: "" }))}
                          placeholder="test@example.com"
                        />
                      </label>
                      <div className="toolbar">
                        <button className="button-primary" type="button" onClick={sendBookingEmailTest} disabled={bookingEmailTest.loading}>
                          {bookingEmailTest.loading ? "Sending..." : "Send 7 booking emails"}
                        </button>
                      </div>
                      {bookingEmailTest.feedback ? <p className="receipt-feedback">{bookingEmailTest.feedback}</p> : null}
                      {bookingEmailTest.meetLink ? (
                        <p className="receipt-feedback">
                          Google Meet: <a href={bookingEmailTest.meetLink} target="_blank" rel="noreferrer">{bookingEmailTest.meetLink}</a>
                        </p>
                      ) : null}
                    </div>
                    <aside className="email-hook-panel">
                      <div className="panel-header compact-header">
                        <div>
                          <p className="section-kicker">Emails sent</p>
                          <h3>7-message booking preview</h3>
                        </div>
                      </div>
                      <div className="email-hook-list">
                        {["Customer confirmation", "Doctor notification", "Customer 24h reminder", "Customer 1h reminder", "Doctor 24h reminder", "Doctor 1h reminder", "Customer follow up"].map((label, index) => (
                          <div className="email-hook-row" key={label}>
                            <strong>{label}</strong>
                            <span>{bookingEmailTest.emailLogIds[index] ? `Email log #${bookingEmailTest.emailLogIds[index]}` : "Preview email"}</span>
                          </div>
                        ))}
                      </div>
                    </aside>
                  </div>
                </section>
                <section className="email-template-manager panel">
                  <aside className="email-template-list">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Email Templates</p>
                        <h2>Global templates</h2>
                      </div>
                    </div>
                    <div className="email-template-controls">
                      <label className="email-template-search">
                        <InlineIcon id="i-search" />
                        <input value={emailTemplateSearch} onChange={(event) => setEmailTemplateSearch(event.target.value)} placeholder="Search templates" />
                      </label>
                      <div className="email-segmented-tabs" role="tablist" aria-label="Email template categories">
                        {emailTemplateCategories.map((category) => (
                          <button className={`email-segmented-tab ${emailTemplateCategory === category ? "active" : ""}`} type="button" role="tab" aria-selected={emailTemplateCategory === category} key={category} onClick={() => setEmailTemplateCategory(category)}>
                            {category === "all" ? "All" : category}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="email-template-scroll">
                      {filteredEmailTemplates.map((template) => (
                        <button className={`email-template-row ${selectedEmailTemplate?.id === template.id ? "active" : ""}`} type="button" key={template.id} onClick={() => setSelectedEmailTemplateId(template.id)}>
                          <span>
                            <strong>{template.name}</strong>
                            <small>{template.category}</small>
                          </span>
                          <StatusPill value={template.status}>{template.status}</StatusPill>
                        </button>
                      ))}
                    </div>
                  </aside>

                  <div className="email-template-editor">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Template editor</p>
                        <h2>{selectedEmailTemplate?.name}</h2>
                      </div>
                      <div className="toolbar">
                        <div className="email-mode-toggle" role="tablist" aria-label="Email editor mode">
                          {["edit", "preview"].map((mode) => (
                            <button className={`email-mode-tab ${emailEditorMode === mode ? "active" : ""}`} type="button" role="tab" aria-selected={emailEditorMode === mode} key={mode} onClick={() => setEmailEditorMode(mode)}>
                              {formatStatusLabel(mode)}
                            </button>
                          ))}
                        </div>
                        <div className="email-editor-actions">
                          <button className="pill-button" type="button" onClick={() => saveSelectedEmailTemplate("draft")}>Save Draft</button>
                          <button className="pill-button" type="button" onClick={duplicateSelectedEmailTemplate}>Duplicate</button>
                          <button className="button-primary" type="button" onClick={() => saveSelectedEmailTemplate("active")}>Save</button>
                        </div>
                      </div>
                    </div>
                    <div className="email-mode-panel" hidden={emailEditorMode !== "edit"}>
                    <div className="email-editor-grid">
                      <div className="email-editor-fields">
                        <label className="detail-field">
                          <span>Name</span>
                          <input value={selectedEmailTemplate?.name || ""} onChange={(event) => updateSelectedEmailTemplate({ name: event.target.value })} />
                        </label>
                        <label className="detail-field">
                          <span>Category</span>
                          <input value={selectedEmailTemplate?.category || ""} onChange={(event) => updateSelectedEmailTemplate({ category: event.target.value })} />
                        </label>
                        <label className="detail-field detail-field-wide">
                          <span>Subject</span>
                          <input value={selectedEmailTemplate?.subject || ""} onChange={(event) => updateSelectedEmailTemplate({ subject: event.target.value })} />
                        </label>
                        <label className="detail-field detail-field-wide">
                          <span>HTML</span>
                          <textarea rows={12} value={selectedEmailTemplate?.html || ""} onChange={(event) => updateSelectedEmailTemplate({ html: event.target.value })} />
                        </label>
                        {selectedEmailTemplateUnsupportedHooks.length ? <p className="receipt-feedback">Unsupported hooks: {selectedEmailTemplateUnsupportedHooks.join(", ")}</p> : null}
                        {emailTemplateFeedback ? <p className="receipt-feedback">{emailTemplateFeedback}</p> : null}
                      </div>
                      <aside className="email-hook-panel">
                        <div className="panel-header compact-header">
                          <div>
                            <p className="section-kicker">Hooks</p>
                            <h3>Reusable variables</h3>
                          </div>
                        </div>
                        <div className="email-hook-list">
                          {EMAIL_HOOKS.map((hook) => (
                            <button className="email-hook-row" type="button" key={hook.key} onClick={() => insertHookIntoSelectedTemplate(hook.key)}>
                              <strong>{hook.key}</strong>
                              <span>{hook.label}</span>
                            </button>
                          ))}
                        </div>
                      </aside>
                    </div>
                    </div>
                    <div className="email-mode-panel" hidden={emailEditorMode !== "preview"}>
                    <div className="email-preview-panel">
                      <div className="panel-header">
                        <div>
                          <p className="section-kicker">Live preview</p>
                          <h3>{renderEmailTemplate(selectedEmailTemplate?.subject, { site_name: siteName })}</h3>
                        </div>
                        <div className="filter-bar">
                          {["desktop", "mobile"].map((mode) => (
                            <button className={`filter-btn ${emailPreviewMode === mode ? "active" : ""}`} type="button" key={mode} onClick={() => setEmailPreviewMode(mode)}>{formatStatusLabel(mode)}</button>
                          ))}
                        </div>
                      </div>
                      <div className={`email-preview-frame ${emailPreviewMode}`} dangerouslySetInnerHTML={{ __html: selectedEmailTemplatePreview }} />
                    </div>
                    </div>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "audit" && (
              <section className="page-view active">
                <section className="panel audit-panel">
                  <div className="panel-header audit-header">
                    <div>
                      <p className="section-kicker">Compliance</p>
                      <h2>Audit center</h2>
                    </div>
                    <div className="toolbar">
                      <label className="select-wrap">
                        <span>Status</span>
                        <select value={audit.status} onChange={(event) => setAudit((prev) => ({ ...prev, status: event.target.value }))}>
                          <option value="all">All</option>
                          <option value="success">Success</option>
                          <option value="error">Error</option>
                        </select>
                      </label>
                      <label className="select-wrap">
                        <span>Source</span>
                        <select value={audit.source} onChange={(event) => setAudit((prev) => ({ ...prev, source: event.target.value }))}>
                          <option value="all">All</option>
                          <option value="woocommerce">WooCommerce</option>
                          <option value="nevari">Nevari</option>
                          <option value="wordpress">WordPress</option>
                          <option value="system">System</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="audit-tabs">
                    {["orders", "payments", "security", "consultation", "emails"].map((category) => (
                      <button
                        key={category}
                        className={`audit-tab ${category === audit.category ? "active" : ""}`}
                        type="button"
                        onClick={() => setAudit((prev) => ({ ...prev, category }))}
                      >
                        {category.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="audit-layout">
                    <div className="audit-table-wrap">
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Status</th>
                              <th>Severity</th>
                              <th>Source</th>
                              <th>Action</th>
                              <th>Actor</th>
                              <th>Object</th>
                              <th>Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.auditEvents.length ? data.auditEvents.map((event, index) => (
                              <tr
                                key={`${event.request_id || event.created_at}-${index}`}
                                className={`audit-row ${selectedAuditIndex === index ? "active" : ""}`}
                                onClick={() => setSelectedAuditIndex(index)}
                              >
                                <td>{formatDate(event.created_at, true)}</td>
                                <td><StatusPill value={event.status === "error" ? "error" : event.severity} className="audit-pill">{event.status}</StatusPill></td>
                                <td>{event.severity}</td>
                                <td>{event.source}</td>
                                <td>{event.action}</td>
                                <td><div className="table-title"><strong>{event.actor_user_id ? `User #${event.actor_user_id}` : "system"}</strong><span className="muted">{event.actor_role || "n/a"}</span></div></td>
                                <td>{event.object_type || "n/a"}{event.object_id ? ` #${event.object_id}` : ""}</td>
                                <td>{event.message || event.error_message || "No message"}</td>
                              </tr>
                            )) : <tr><td colSpan="8" className="muted">No audit events match the current filters.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <aside className="audit-detail">
                      {!selectedAuditEvent ? (
                        <div className="audit-detail-empty">
                          <span className="detail-icon"><InlineIcon id="i-shield" /></span>
                          <strong>Select an event</strong>
                          <p>View metadata, request id, IP address, and related pharmacy objects.</p>
                        </div>
                      ) : (
                        <div className="audit-detail-content">
                          <div>
                            <span className="section-kicker">Event detail</span>
                            <h3>{selectedAuditEvent.action}</h3>
                          </div>
                          <StatusPill value={selectedAuditEvent.status === "error" ? "error" : selectedAuditEvent.severity} className="audit-pill">
                            {selectedAuditEvent.status} • {selectedAuditEvent.severity}
                          </StatusPill>
                          <div className="detail-grid">
                            <div className="detail-block"><span>Timestamp</span><strong>{formatDate(selectedAuditEvent.created_at, true)}</strong></div>
                            <div className="detail-block"><span>Source</span><strong>{selectedAuditEvent.source}</strong></div>
                            <div className="detail-block"><span>Actor</span><strong>{selectedAuditEvent.actor_user_id ? `User #${selectedAuditEvent.actor_user_id}` : "system"}</strong></div>
                            <div className="detail-block"><span>Role</span><strong>{selectedAuditEvent.actor_role || "n/a"}</strong></div>
                            <div className="detail-block"><span>Request ID</span><strong>{selectedAuditEvent.request_id || "n/a"}</strong></div>
                            <div className="detail-block"><span>IP Address</span><strong>{selectedAuditEvent.actor_ip || "n/a"}</strong></div>
                          </div>
                          <div className="meta-block"><span>Message</span><pre>{selectedAuditEvent.message || selectedAuditEvent.error_message || "No message stored."}</pre></div>
                          <div className="meta-block"><span>Metadata JSON</span><pre>{JSON.stringify(selectedAuditEvent.metadata || {}, null, 2)}</pre></div>
                        </div>
                      )}
                    </aside>
                  </div>
                </section>
              </section>
            )}

            {currentPage === "settings" && (
              <section className="page-view active">
                <section className="page-banner panel">
                  <div>
                    <p className="section-kicker">Storefront settings</p>
                    <h2>Appointment system controls</h2>
                    <p className="hero-text">Manage frontend test controls for booking automation, reminders, pricing tiers, security, and the external meeting service without leaving the admin dashboard.</p>
                  </div>
                  <div className="banner-actions">
                    <button className="button-primary" type="button" onClick={() => showAuthGate("auth")}>Manage session</button>
                    <button className="pill-button" type="button" onClick={handleLogout}>Clear tokens</button>
                  </div>
                </section>
                <section className="settings-grid">
                  {settingsCards.map((card) => (
                    <article className="mini-stat" key={card.label}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.note}</small>
                    </article>
                  ))}
                </section>
                <div className="filter-bar admin-settings-filter-bar" role="tablist" aria-label="Settings groups">
                  <button className="filter-btn active" type="button">Automation <span className="filter-count">4</span></button>
                  <button className="filter-btn" type="button">Reminders <span className="filter-count">3</span></button>
                  <button className="filter-btn" type="button">Pricing <span className="filter-count">2</span></button>
                  <div className="filter-divider" />
                  <button className="filter-btn" type="button">Security <span className="filter-count">3</span></button>
                </div>
                <div className="status-pill-grid admin-settings-status-grid">
                  <div className={`status-pill ${appointmentSettings.googleMeetEnabled ? "success" : "error"}`}><span className="dot" />Meeting service</div>
                  <div className={`status-pill ${appointmentSettings.emailNotificationsEnabled ? "info" : "warning"}`}><span className="dot" />Notifications</div>
                  <div className={`status-pill ${appointmentSettings.livePaymentsEnabled ? "success" : "warning"}`}><span className="dot" />{appointmentSettings.livePaymentsEnabled ? "Live payments" : "Test mode"}</div>
                  <div className={`status-pill ${appointmentSettings.idempotencyProtection ? "success" : "warning"}`}><span className="dot" />Idempotency</div>
                </div>
                <section className="doctor-settings-grid admin-settings-grid">
                  <article className="doctor-settings-card">
                    <h3>Meeting service</h3>
                    <label className="customer-toggle-row"><span>Google Meet integration</span><input type="checkbox" checked={appointmentSettings.googleMeetEnabled} onChange={(event) => setAppointmentSettings((current) => ({ ...current, googleMeetEnabled: event.target.checked }))} /></label>
                    <label className="customer-toggle-row"><span>{appointmentSettings.livePaymentsEnabled ? "Live mode" : "Test mode"}</span><input type="checkbox" checked={appointmentSettings.livePaymentsEnabled} onChange={(event) => setAppointmentSettings((current) => ({ ...current, livePaymentsEnabled: event.target.checked }))} /></label>
                    <label className="customer-toggle-row"><span>Idempotency protection</span><input type="checkbox" checked={appointmentSettings.idempotencyProtection} onChange={(event) => setAppointmentSettings((current) => ({ ...current, idempotencyProtection: event.target.checked }))} /></label>
                    <label className="customer-toggle-row"><span>API key rotation</span><input type="checkbox" checked={appointmentSettings.apiKeyRotationEnabled} onChange={(event) => setAppointmentSettings((current) => ({ ...current, apiKeyRotationEnabled: event.target.checked }))} /></label>
                    <label className="detail-field detail-field-wide">
                      <span>External meeting service endpoint</span>
                      <input value={appointmentSettings.externalMeetingServiceUrl} onChange={(event) => setAppointmentSettings((current) => ({ ...current, externalMeetingServiceUrl: event.target.value }))} />
                    </label>
                  </article>

                  <article className="doctor-settings-card">
                    <h3>Reminder and email rules</h3>
                    <label className="customer-toggle-row"><span>Email notifications enabled</span><input type="checkbox" checked={appointmentSettings.emailNotificationsEnabled} onChange={(event) => setAppointmentSettings((current) => ({ ...current, emailNotificationsEnabled: event.target.checked }))} /></label>
                    <label><span>Primary reminder (minutes before)</span><input type="number" min="1" value={appointmentSettings.reminderMinutesPrimary} onChange={(event) => setAppointmentSettings((current) => ({ ...current, reminderMinutesPrimary: event.target.value }))} /></label>
                    <label><span>Secondary reminder (minutes before)</span><input type="number" min="1" value={appointmentSettings.reminderMinutesSecondary} onChange={(event) => setAppointmentSettings((current) => ({ ...current, reminderMinutesSecondary: event.target.value }))} /></label>
                    <label><span>SMTP host</span><input value={appointmentSettings.smtpHost} onChange={(event) => setAppointmentSettings((current) => ({ ...current, smtpHost: event.target.value }))} /></label>
                    <label><span>SMTP port</span><input value={appointmentSettings.smtpPort} onChange={(event) => setAppointmentSettings((current) => ({ ...current, smtpPort: event.target.value }))} /></label>
                    <label><span>Sender address</span><input value={appointmentSettings.smtpSender} onChange={(event) => setAppointmentSettings((current) => ({ ...current, smtpSender: event.target.value }))} /></label>
                  </article>

                  <article className="doctor-settings-card">
                    <h3>Consultation pricing</h3>
                    <label><span>Minimum consultation minutes</span><input type="number" min="5" value={appointmentSettings.minimumConsultationMinutes} onChange={(event) => setAppointmentSettings((current) => ({ ...current, minimumConsultationMinutes: event.target.value }))} /></label>
                    <label><span>Junior tier</span><input value={appointmentSettings.pricingTiers.junior} onChange={(event) => setAppointmentSettings((current) => ({ ...current, pricingTiers: { ...current.pricingTiers, junior: event.target.value } }))} /></label>
                    <label><span>Senior tier</span><input value={appointmentSettings.pricingTiers.senior} onChange={(event) => setAppointmentSettings((current) => ({ ...current, pricingTiers: { ...current.pricingTiers, senior: event.target.value } }))} /></label>
                    <label><span>Specialist tier</span><input value={appointmentSettings.pricingTiers.specialist} onChange={(event) => setAppointmentSettings((current) => ({ ...current, pricingTiers: { ...current.pricingTiers, specialist: event.target.value } }))} /></label>
                    <label><span>General category price</span><input value={appointmentSettings.categoryPricing.general} onChange={(event) => setAppointmentSettings((current) => ({ ...current, categoryPricing: { ...current.categoryPricing, general: event.target.value } }))} /></label>
                    <label><span>Cardiology category price</span><input value={appointmentSettings.categoryPricing.cardiology} onChange={(event) => setAppointmentSettings((current) => ({ ...current, categoryPricing: { ...current.categoryPricing, cardiology: event.target.value } }))} /></label>
                  </article>

                  <article className="doctor-settings-card">
                    <h3>Security and logging</h3>
                    <label className="customer-toggle-row"><span>Role permissions locked</span><input type="checkbox" checked={appointmentSettings.rolePermissionsLocked} onChange={(event) => setAppointmentSettings((current) => ({ ...current, rolePermissionsLocked: event.target.checked }))} /></label>
                    <label><span>Audit log retention (days)</span><input type="number" min="7" value={appointmentSettings.auditLogRetention} onChange={(event) => setAppointmentSettings((current) => ({ ...current, auditLogRetention: event.target.value }))} /></label>
                    <div className="doctor-settings-summary"><span>Visible consultations</span><strong>{formatNumber((data.appointments || []).length)}</strong></div>
                    <div className="doctor-settings-summary"><span>Doctors in scope</span><strong>{formatNumber((data.doctors || []).length)}</strong></div>
                    <div className="doctor-settings-summary"><span>Queued emails</span><strong>{formatNumber(emailItems[0]?.value || 0)}</strong></div>
                  </article>
                </section>
              </section>
            )}

            {currentPage === "profile" && (
              <section className="page-view active">
                <section className="page-banner panel">
                  <div>
                    <p className="section-kicker">Profile</p>
                    <h2>Storefront account and identity</h2>
                    <p className="hero-text">Review the current signed-in user, paired environment, and storefront identity in one place.</p>
                  </div>
                  <div className="banner-actions">
                    <button className="button-primary" type="button" onClick={() => showAuthGate("auth")}>Manage session</button>
                    <button className="pill-button" type="button" onClick={() => switchPage("settings")}>Open settings</button>
                    <button className="pill-button danger" type="button" onClick={handleLogout}>Logout</button>
                  </div>
                </section>
                <section className="settings-grid profile-grid">
                  {profileCards.map((card) => (
                    <article className="mini-stat" key={card.label}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.note}</small>
                    </article>
                  ))}
                </section>
              </section>
            )}
              </>
            )}
          </div>
        </main>
      </div>

      {orderCreateModalOpen ? (
      <div className="app-modal-stack">
        <div className="app-modal-layer">
          <button className="app-modal-backdrop" type="button" aria-label="Close order creation" onClick={closeOrderCreateModal} />
          <section className="detail-section stacked-order-popup order-create-popup" role="dialog" aria-modal="true" aria-label="Create order">
            <form className="order-create-form" onSubmit={createOrderFromForm}>
              <div className="panel-header stacked-order-popup-header">
                <div>
                  <p className="section-kicker">Order creation</p>
                  <h3>Create pharmacy order</h3>
                </div>
                <button className="icon-button" type="button" aria-label="Close order creation" onClick={closeOrderCreateModal}>
                  <InlineIcon id="i-x" />
                </button>
              </div>

              <div className="order-create-shell">
                <aside className="order-create-customer-column">
                  <div className="profile-create-preview order-create-preview">
                    <div className="profile-avatar">
                      <span>{getNameInitials([orderCreateForm.firstName, orderCreateForm.lastName].filter(Boolean).join(" "))}</span>
                    </div>
                    <div className="order-create-profile-details">
                      <strong>{[orderCreateForm.firstName, orderCreateForm.lastName].filter(Boolean).join(" ") || "Customer name"}</strong>
                      <span>{orderCreateForm.email || "customer@email.com"}</span>
                    </div>
                  </div>

                  <div className="detail-form-grid order-create-grid">
                    <label className="detail-field">
                      <span>First Name</span>
                      <input
                        value={orderCreateForm.firstName}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, firstName: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="detail-field">
                      <span>Last Name</span>
                      <input
                        value={orderCreateForm.lastName}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, lastName: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="detail-field">
                      <span>Email Address</span>
                      <input
                        type="email"
                        value={orderCreateForm.email}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="detail-field">
                      <span>Phone Number</span>
                      <input
                        value={orderCreateForm.phone}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </label>
                    <label className="detail-field detail-field-wide">
                      <span>Delivery Address</span>
                      <input
                        value={orderCreateForm.address}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, address: event.target.value }))}
                      />
                    </label>
                    <label className="detail-field">
                      <span>City</span>
                      <input
                        value={orderCreateForm.city}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, city: event.target.value }))}
                      />
                    </label>
                    <label className="detail-field">
                      <span>State</span>
                      <input
                        value={orderCreateForm.state}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, state: event.target.value }))}
                      />
                    </label>
                    <label className="detail-field">
                      <span>Postcode</span>
                      <input
                        value={orderCreateForm.postcode}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, postcode: event.target.value }))}
                      />
                    </label>
                    <label className="detail-field">
                      <span>Country</span>
                      <input
                        value={orderCreateForm.country}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, country: event.target.value.toUpperCase() }))}
                        maxLength={2}
                      />
                    </label>
                    <label className="detail-field">
                      <span>Order Status</span>
                      <div className="select-wrap">
                        <select
                          value={orderCreateForm.status}
                          onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            {["awaiting-doctor", "pending", "processing", "in-delivery", "on-hold", "completed", "failed", "refunded"].map((status) => (
                            <option key={status} value={status}>{formatStatusLabel(status)}</option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="detail-field detail-field-wide">
                      <span>Assign Doctor</span>
                      {orderCreateDoctorsQuery.isLoading ? <small className="product-field-note">Loading doctors...</small> : null}
                      <div className="select-wrap">
                        <select
                          value={orderCreateForm.doctorId}
                          onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, doctorId: event.target.value }))}
                        >
                          <option value="">No doctor assigned</option>
                          {popupOrderDoctors.map((doctor) => (
                            <option key={doctor.user_id} value={doctor.user_id}>{doctor.display_name}</option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="detail-field detail-field-wide">
                      <span>Customer Note</span>
                      <textarea
                        value={orderCreateForm.note}
                        onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, note: event.target.value }))}
                        rows={4}
                      />
                    </label>
                  </div>
                </aside>

                <section className="order-create-items-column">
                  <div className="panel-header order-create-items-header">
                    <div>
                      <p className="section-kicker">Products</p>
                      <h4>Search and add products</h4>
                    </div>
                    <span className="order-create-line-count">{orderCreateItems.length} item{orderCreateItems.length === 1 ? "" : "s"}</span>
                  </div>
                  {orderCreateProductsQuery.isLoading ? <p className="muted popup-support-copy">Loading product matches...</p> : null}
                  {orderCreateProductsQuery.error ? <p className="muted popup-support-copy">Products could not be loaded. Try again shortly.</p> : null}

                  <label className="detail-field detail-field-wide order-product-search-field">
                    <span>Search product</span>
                    <div className="product-term-search-row">
                      <input
                        value={orderCreateSearch}
                        onChange={(event) => setOrderCreateSearch(event.target.value)}
                        placeholder="Search by name, SKU, brand, or category"
                      />
                    </div>
                  </label>

                  {orderCreateSearch ? (
                    <div className="product-term-options order-product-search-results" role="listbox" aria-label="Product search results">
                      {orderProductCandidates.length ? orderProductCandidates.map((product) => {
                        const productId = String(product.id);
                        const alreadySelected = orderCreateItems.some((item) => String(item.productId) === productId);
                        return (
                          <button
                            key={productId}
                            className={`product-term-option order-product-search-result ${alreadySelected ? "active" : ""}`}
                            type="button"
                            onClick={() => addOrderCreateItem(product)}
                          >
                            <strong>{product.name || `Product #${productId}`}</strong>
                            <span>{getProductPriceLabel(product, storeCurrency)}</span>
                          </button>
                        );
                      }) : <div className="empty-card compact-empty"><div className="card-title">No matching products found.</div></div>}
                    </div>
                  ) : null}

                  <div className="order-create-line-summary">
                    <span>Added items</span>
                    <strong>{orderCreateItems.length}</strong>
                  </div>

                  <div className="table-scroll order-create-table-scroll">
                    <table className="order-create-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderCreateItems.length ? orderCreateItems.map((item, index) => {
                          const product = popupOrderProducts.find((entry) => String(entry.id) === String(item.productId)) || null;
                          const quantity = Math.max(1, Number(item.quantity || 1));
                          const unitPrice = product ? Number(hasActiveSalePrice(product) ? getProductPrice(product, "sale_price") : (getProductPrice(product, "regular_price") || getProductPrice(product, "price") || 0)) : 0;
                          const lineTotal = unitPrice * quantity;
                          return (
                            <tr key={item.key || index}>
                              <td>
                                <div className="order-product-cell">
                                  <div className="order-product-media order-product-list-media">
                                    {product ? (
                                      getProductImage(product) ? <img src={getProductImage(product)} alt={product.name || "Product"} className="order-product-image" /> : <div className="order-product-image order-product-fallback"><InlineIcon id="i-pill" /></div>
                                    ) : (
                                      <div className="order-product-image order-product-fallback"><InlineIcon id="i-pill" /></div>
                                    )}
                                  </div>
                                  <div className="order-product-copy">
                                    <strong>{product ? (product.name || `Product #${item.productId}`) : "Choose a product"}</strong>
                                    <span className="muted order-product-meta">
                                      {product ? getProductPriceLabel(product, storeCurrency) : "Add products using the search bar above"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className="qty-widget">
                                  <button type="button" aria-label="Decrease quantity" onClick={() => updateOrderCreateItem(index, { quantity: Math.max(1, quantity - 1) })}>−</button>
                                  <span>{quantity}</span>
                                  <button type="button" aria-label="Increase quantity" onClick={() => updateOrderCreateItem(index, { quantity: quantity + 1 })}>+</button>
                                </div>
                              </td>
                              <td>{product ? formatMoney(unitPrice, storeCurrency) : "—"}</td>
                              <td>{product ? formatMoney(lineTotal, storeCurrency) : "—"}</td>
                              <td>
                                <button className="icon-button order-line-remove" type="button" aria-label="Remove product" onClick={() => removeOrderCreateItem(index)}>
                                  <InlineIcon id="i-x" />
                                </button>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan="5" className="muted">Add products using the search bar above.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              {orderCreateFeedback ? <p className="muted popup-support-copy">{orderCreateFeedback}</p> : null}
              <div className="stacked-order-popup-actions">
                <button className="pill-button" type="button" onClick={closeOrderCreateModal}>Cancel</button>
                <button className="button-primary" type="submit" disabled={orderCreateLoading}>
                  {orderCreateLoading ? "Creating..." : "Create Order"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
      ) : null}

      {orderModalOpen ? (
      <div className="app-modal-stack">
        <div className="app-modal-layer app-modal-layer-base">
          <button className="app-modal-backdrop" type="button" aria-label="Close order details" onClick={closeOrderModal} />
          <section
            className={`panel order-detail-panel order-modal ${orderModalOpen ? "is-open" : "is-hidden"} ${selectedOrderDetail && deletingOrderIds.includes(selectedOrderDetail.id) ? "order-modal-deleting" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={selectedOrderDetail ? `Order #${selectedOrderDetail.number}` : "Order details"}
          >
            <div className="panel-header order-modal-topbar">
              {selectedOrderDetail ? (
                <div className="order-modal-topbar-content">
                  <div className="toolbar order-modal-topbar-primary">
                    <button className="button-primary" type="button" onClick={openOrderPrescriptionView}>Open Prescriptions</button>
                    <button className="button-primary" type="button" onClick={openOrderConsultationView}>Open Consultations</button>
                  </div>
                  <div className="toolbar order-modal-topbar-actions">
                    <button className="icon-button" type="button" aria-label="Close order details" onClick={closeOrderModal}>
                      <InlineIcon id="i-x" />
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title={getOrderDocumentType(selectedOrderDetail) === "receipt" ? "Print Receipt" : "Print Invoice"} aria-label={getOrderDocumentType(selectedOrderDetail) === "receipt" ? "Print Receipt" : "Print Invoice"} onClick={printSelectedOrder} disabled={orderMutationLoading}>
                      {orderMutationLoading ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-printer" />}
                    </button>
                    <button
                      className="icon-button order-header-action-button"
                      type="button"
                      title={orderEmailActionLoading === String(selectedOrderDetail.id || selectedOrderDetail.number || "order") ? "Sending..." : "Email Customer"}
                      aria-label={orderEmailActionLoading === String(selectedOrderDetail.id || selectedOrderDetail.number || "order") ? "Sending customer email" : "Email Customer"}
                      onClick={contactSelectedCustomer}
                      disabled={orderMutationLoading || orderEmailActionLoading === String(selectedOrderDetail.id || selectedOrderDetail.number || "order") || !customerEmail(selectedOrderDetail)}
                    >
                      {orderEmailActionLoading === String(selectedOrderDetail.id || selectedOrderDetail.number || "order") ? (
                        <span className="category-saving-spinner" aria-hidden="true" />
                      ) : (
                        <InlineIcon id="i-paper-plane" />
                      )}
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title="Update Status" aria-label="Update Status" onClick={openOrderControlsPopup} disabled={orderMutationLoading}>
                      <InlineIcon id="i-package" />
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title="Refund" aria-label="Refund" onClick={refundSelectedOrder} disabled={orderMutationLoading}>
                      <InlineIcon id="i-refresh-cw" />
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title="Assign Doctor" aria-label="Assign Doctor" onClick={openDoctorAssignmentPopup} disabled={orderMutationLoading}>
                      <InlineIcon id="i-user" />
                    </button>
                    <button className="pill-button danger" type="button" onClick={deleteSelectedOrder} disabled={orderMutationLoading}>
                      Delete Order
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="order-detail-scroll">
            {orderDetailLoading ? (
              renderOrderDetailSkeleton()
            ) : selectedOrderDetail ? (
              <div className="order-detail-page">
                <div className="order-detail-hero">
                  <div className="order-detail-meta-card">
                    <div className="order-detail-title-row">
                      <div>
                        <h3>Order #{selectedOrderDetail.number}</h3>
                        <div className="order-detail-meta">
                          <StatusPill value={selectedOrderDetail.status}>{formatStatusLabel(selectedOrderDetail.status)}</StatusPill>
                          <span>{formatDate(selectedOrderDetail.created_at, true)}</span>
                          <span>Payment: {formatStatusLabel(selectedOrderDetail.payment_status)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="order-summary-grid">
                    {[
                      { label: "Total Amount", value: formatMoney(selectedOrderDetail.totals?.subtotal || 0, storeCurrency), note: "item subtotal before adjustments" },
                      { label: "Items Count", value: formatNumber(itemQuantityTotal(selectedOrderDetail)), note: `${formatNumber(selectedOrderDetail.totals?.items_count || (selectedOrderDetail.items || []).length)} distinct line items` },
                      { label: "Shipping Fee", value: formatMoney((selectedOrderDetail.totals?.shipping_total || 0) + (selectedOrderDetail.totals?.shipping_tax || 0), storeCurrency), note: "shipping and shipping tax" },
                      { label: "Discount", value: formatMoney(selectedOrderDetail.totals?.discount_total || 0, storeCurrency), note: "line and order discounts" },
                      { label: "Tax/VAT", value: formatMoney(selectedOrderDetail.totals?.tax_total || 0, storeCurrency), note: "tax across all items" },
                      { label: "Final Payable Amount", value: formatMoney(selectedOrderDetail.totals?.grand_total || selectedOrderDetail.total || 0, storeCurrency), note: selectedOrderDetail.rx_status ? `RX: ${formatStatusLabel(selectedOrderDetail.rx_status)}` : "order grand total" }
                    ].map((metric) => (
                      <div className="mini-stat order-mini-stat" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <small>{metric.note}</small>
                      </div>
                    ))}
                  </div>

                  <div className="detail-section order-customer-card">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Customer information</p>
                        <h3>{customerFullName(selectedOrderDetail)}</h3>
                      </div>
                    </div>
                    <div className="detail-list customer-info-grid">
                      <div className="detail-item-card"><strong>Full Name</strong><span className="muted">{customerFullName(selectedOrderDetail)}</span></div>
                      <div className="detail-item-card"><strong>Email Address</strong><span className="muted">{customerSummary(selectedOrderDetail).email}</span></div>
                      <div className="detail-item-card"><strong>Phone Number</strong><span className="muted">{selectedOrderDetail.billing?.phone || "No phone number on file"}</span></div>
                      <div className="detail-item-card"><strong>Delivery Address</strong><span className="muted">{formatAddress(selectedOrderDetail.shipping)}</span></div>
                      <div className="detail-item-card customer-note-card"><strong>Customer Notes</strong><span className="muted">{selectedOrderNote || "No customer note recorded."}</span></div>
                    </div>
                  </div>

                </div>

                <div className="detail-section order-products-section">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Products</p>
                      <h3>Product list</h3>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="order-products-table">
                      <thead>
                        <tr>
                          <th>Product Image</th>
                          <th>Name</th>
                          <th>SKU</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Discount</th>
                          <th>Total Price</th>
                          <th>Stock Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedOrderDetail.items || []).length ? selectedOrderDetail.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="order-product-media">
                                {item.image_url ? <img src={item.image_url} alt={item.name} className="order-product-image" /> : <div className="order-product-image order-product-fallback"><InlineIcon id="i-package" /></div>}
                              </div>
                            </td>
                            <td>
                              <div className="table-title">
                                <strong>{item.name}</strong>
                                <span className="muted">{item.rx_required ? "Doctor review required" : "Standard fulfilment"}</span>
                              </div>
                            </td>
                            <td>{item.sku || "n/a"}</td>
                            <td>{formatNumber(item.quantity)}</td>
                            <td>{formatMoney(item.unit_price || 0, storeCurrency)}</td>
                            <td>{formatMoney(item.discount_total || 0, storeCurrency)}</td>
                            <td>{formatMoney(item.total || 0, storeCurrency)}</td>
                            <td><StatusPill value={item.stock_status || "info"}>{formatStatusLabel(item.stock_status || (item.rx_required ? "rx required" : "available"))}</StatusPill></td>
                          </tr>
                        )) : (
                          <tr><td colSpan="8" className="muted">No line items available.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="order-detail-secondary-grid">
                  <div className="detail-section">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Care linkage</p>
                        <h3>{selectedOrderDetail.assigned_doctor?.display_name || "Awaiting doctor assignment"}</h3>
                      </div>
                    </div>
                    <div className="detail-list">
                      <div className="detail-item-card">
                        <strong>Assigned Doctor</strong>
                        <span className="muted">{selectedOrderDetail.assigned_doctor?.email || "No doctor email available yet."}</span>
                      </div>
                      <div className="detail-item-card">
                        <strong>Linked Prescription</strong>
                        <span className="muted">{selectedOrderPrescription?.prescription_number || "No linked prescription yet."}</span>
                      </div>
                      <div className="detail-item-card">
                        <strong>Specialty</strong>
                        <span className="muted">{selectedOrderDoctorProfile?.specialties?.length ? selectedOrderDoctorProfile.specialties.join(", ") : "No specialty metadata available."}</span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Prescription context</p>
                        <h3>{selectedOrderPrescription?.prescription_number || "No linked prescription"}</h3>
                      </div>
                    </div>
                    {selectedOrderPrescription ? (
                      <div className="detail-list">
                        <div className="detail-item-card">
                          <strong>{formatStatusLabel(selectedOrderPrescription.status)}</strong>
                          <span className="muted">{selectedOrderPrescription.diagnosis || "No diagnosis recorded."}</span>
                        </div>
                        <div className="detail-item-card">
                          <strong>Instructions</strong>
                          <span className="muted">{selectedOrderPrescription.instructions || "No prescription instructions recorded."}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="muted">No prescription is linked to this order yet.</div>
                    )}
                  </div>

                  <div className="detail-section order-notes-section">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Order notes</p>
                        <h3>Timeline</h3>
                      </div>
                    </div>
                    <div className="detail-list">
                      {(selectedOrderDetail.order_notes || []).length ? selectedOrderDetail.order_notes.map((note) => (
                        <div className="detail-item-card" key={note.id}>
                          <strong>{formatDate(note.created_at, true)}</strong>
                          <span className="muted">{note.content}</span>
                        </div>
                      )) : <div className="muted">No order notes recorded.</div>}
                    </div>
                  </div>
                </div>

                {orderActionFeedback ? <div className="muted order-feedback">{orderActionFeedback}</div> : null}
              </div>
            ) : (
              <div className="muted">Choose an order from the table to open its details.</div>
            )}
            </div>
          </section>
        </div>

        {orderControlsModalOpen && selectedOrderDetail ? (
        <div className="app-modal-layer app-modal-layer-nested is-open">
          <button className="app-modal-backdrop nested" type="button" aria-label="Close order controls" onClick={() => setOrderControlsModalOpen(false)} />
          <section className="detail-section stacked-order-popup" role="dialog" aria-modal="true" aria-label="Order controls">
            <div className="panel-header stacked-order-popup-header">
              <div>
                <p className="section-kicker">Order controls</p>
                <h3>Operational updates</h3>
              </div>
              <button className="icon-button" type="button" aria-label="Close order controls" onClick={() => setOrderControlsModalOpen(false)}>
                <InlineIcon id="i-x" />
              </button>
            </div>
            <div className="detail-form-grid">
              <label className="detail-field">
                <span>Order Status</span>
                <div className="select-wrap">
                  <select value={selectedOrderStatus} onChange={(event) => setSelectedOrderStatus(event.target.value)}>
                    {["pending", "awaiting-doctor", "awaiting-prescription", "processing", "in-delivery", "on-hold", "completed", "cancelled", "failed", "refunded"].map((status) => (
                      <option key={status} value={status}>{formatStatusLabel(status)}</option>
                    ))}
                  </select>
                </div>
              </label>
              <div className="detail-field">
                <span>Doctor Assignment</span>
                <button className="pill-button popup-link-button" type="button" onClick={openDoctorAssignmentPopup}>
                  {selectedOrderDetail?.assigned_doctor?.display_name || "Select doctor"}
                </button>
              </div>
              <label className="detail-field detail-field-wide">
                <span>Customer Note</span>
                <textarea value={selectedOrderNote} onChange={(event) => setSelectedOrderNote(event.target.value)} rows={4} />
              </label>
            </div>
            <p className="muted popup-support-copy">Order marked as refunded. Capture gateway-side refund separately if required.</p>
            <div className="stacked-order-popup-actions">
              <button className="pill-button" type="button" onClick={() => setOrderControlsModalOpen(false)}>Cancel</button>
              <button className="button-primary" type="button" onClick={saveSelectedOrder} disabled={orderMutationLoading}>
                {orderMutationLoading ? "Updating..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
        ) : null}

        {doctorAssignmentModalOpen && selectedOrderDetail ? (
        <div className="app-modal-layer app-modal-layer-nested app-modal-layer-top is-open">
          <button className="app-modal-backdrop nested" type="button" aria-label="Close doctor assignment" onClick={() => setDoctorAssignmentModalOpen(false)} />
          <section className="detail-section stacked-order-popup assignment-popup" role="dialog" aria-modal="true" aria-label="Assign doctor">
            <div className="panel-header stacked-order-popup-header">
              <div>
                <p className="section-kicker">Doctor assignment</p>
                <h3>Assign clinician to this order</h3>
              </div>
              <button className="icon-button" type="button" aria-label="Close doctor assignment" onClick={() => setDoctorAssignmentModalOpen(false)}>
                <InlineIcon id="i-x" />
              </button>
            </div>
            <div className="detail-form-grid">
              <label className="detail-field detail-field-wide">
                <span>Select doctor</span>
                {orderAssignmentDoctorsQuery.isLoading ? <small className="product-field-note">Loading doctors...</small> : null}
                {orderAssignmentDoctorsQuery.error ? <small className="product-field-note">Doctor list could not be refreshed. Cached doctors are shown.</small> : null}
                <div className="select-wrap">
                  <select value={selectedOrderDoctorId} onChange={(event) => setSelectedOrderDoctorId(event.target.value)}>
                    <option value="">Select doctor</option>
                    {popupAssignmentDoctors.map((doctor) => (
                      <option key={doctor.user_id || doctor.id} value={doctor.user_id || doctor.id}>{doctor.display_name}</option>
                    ))}
                  </select>
                </div>
              </label>
              <div className="detail-item-card detail-field-wide assignment-summary-card">
                <strong>Current assignment</strong>
                <span className="muted">{selectedOrderDetail?.assigned_doctor?.display_name || "No doctor assigned yet."}</span>
              </div>
            </div>
            <div className="stacked-order-popup-actions">
              <button className="pill-button" type="button" onClick={() => setDoctorAssignmentModalOpen(false)}>Cancel</button>
              <button className="button-primary" type="button" onClick={assignSelectedOrderDoctor} disabled={orderMutationLoading || !selectedOrderDoctorId}>
                {orderMutationLoading ? "Assigning..." : "Assign Doctor"}
              </button>
            </div>
          </section>
        </div>
        ) : null}

      </div>
      ) : null}

      {paymentReceiptModalOpen && selectedPaymentReceipt && typeof document !== "undefined" ? createPortal(
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close payment receipt" onClick={closePaymentReceiptModal} />
            <section className="detail-section stacked-order-popup receipt-popup receipt-popup-redesign" role="dialog" aria-modal="true" aria-label={`Receipt for order #${selectedPaymentReceipt.number}`}>
            <div className="receipt-hero">
              <div>
                <p className="section-kicker">Payment receipt</p>
                <h3>Order #{selectedPaymentReceipt.number}</h3>
                <div className="receipt-meta-row">
                  <span>{customerFullName(selectedPaymentReceipt)}</span>
                  <span>{formatDate(selectedPaymentReceipt.created_at, true)}</span>
                </div>
              </div>
              <div className="receipt-hero-actions">
                <StatusPill value={selectedPaymentReceipt.payment_status || selectedPaymentReceipt.status}>
                  {formatStatusLabel(selectedPaymentReceipt.payment_status || selectedPaymentReceipt.status)}
                </StatusPill>
                <button className="icon-button" type="button" aria-label="Close payment receipt" onClick={closePaymentReceiptModal}>
                  <InlineIcon id="i-x" />
                </button>
              </div>
            </div>

            <div className="app-modal-scroll">
            <div className="receipt-command-bar">
              <div>
                <span>Total paid</span>
                <strong>{formatMoney(selectedPaymentReceipt.total || 0, storeCurrency)}</strong>
              </div>
              <div className="receipt-command-actions">
                <button className="pill-button" type="button" onClick={printPaymentReceipt} disabled={Boolean(receiptActionLoading)}>
                  {receiptActionLoading === "print" ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-printer" />}
                  {receiptActionLoading === "print" ? "Preparing..." : "Print"}
                </button>
                <button className="button-primary receipt-send-button" type="button" onClick={sendPaymentReceipt} disabled={Boolean(receiptActionLoading) || !customerEmail(selectedPaymentReceipt)}>
                  {receiptActionLoading === "send" ? <span className="category-saving-spinner" aria-hidden="true" /> : <InlineIcon id="i-mail" />}
                  {receiptActionLoading === "send" ? "Sending..." : "Send Receipt"}
                </button>
              </div>
            </div>

            <div className="receipt-summary-grid receipt-summary-grid-redesign">
              <div className="mini-stat receipt-stat">
                <span>Customer</span>
                <strong>{customerFullName(selectedPaymentReceipt)}</strong>
                <small>{customerSummary(selectedPaymentReceipt).email}</small>
              </div>
              <div className="mini-stat receipt-stat">
                <span>RX state</span>
                <strong>{formatStatusLabel(selectedPaymentReceipt.rx_status || "clear")}</strong>
                <small>{selectedPaymentReceipt.assigned_doctor?.display_name || "No doctor assigned"}</small>
              </div>
              <div className="mini-stat receipt-stat">
                <span>Reference</span>
                <strong>#{selectedPaymentReceipt.number}</strong>
                <small>{formatStatusLabel(selectedPaymentReceipt.payment_status || selectedPaymentReceipt.status)}</small>
              </div>
            </div>

            <div className="receipt-body-grid">
              <div className="detail-section receipt-panel">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Customer information</p>
                    <h3>{customerFullName(selectedPaymentReceipt)}</h3>
                  </div>
                </div>
                <div className="detail-list receipt-info-grid">
                  <div className="detail-item-card"><strong>Email</strong><span className="muted">{customerSummary(selectedPaymentReceipt).email}</span></div>
                  <div className="detail-item-card"><strong>Phone</strong><span className="muted">{selectedPaymentReceipt.billing?.phone || "No phone number on file"}</span></div>
                  <div className="detail-item-card"><strong>Billing address</strong><span className="muted">{formatAddress(selectedPaymentReceipt.billing)}</span></div>
                  <div className="detail-item-card"><strong>Shipping address</strong><span className="muted">{formatAddress(selectedPaymentReceipt.shipping)}</span></div>
                </div>
              </div>

              <div className="detail-section receipt-panel">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Payment details</p>
                    <h3>Capture summary</h3>
                  </div>
                </div>
                <div className="detail-list receipt-info-grid">
                  <div className="detail-item-card"><strong>Payment status</strong><span className="muted">{formatStatusLabel(selectedPaymentReceipt.payment_status || selectedPaymentReceipt.status)}</span></div>
                  <div className="detail-item-card"><strong>Amount</strong><span className="muted">{formatMoney(selectedPaymentReceipt.total || 0, storeCurrency)}</span></div>
                  <div className="detail-item-card"><strong>Order type</strong><span className="muted">{getOrderTypeMeta(selectedPaymentReceipt).label}</span></div>
                  <div className="detail-item-card"><strong>Reference</strong><span className="muted">Order #{selectedPaymentReceipt.number}</span></div>
                </div>
              </div>
            </div>

            <div className="detail-section receipt-panel receipt-items-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Line items</p>
                  <h3>Receipt items</h3>
                </div>
              </div>
              <div className="receipt-items">
                {(selectedPaymentReceipt.items || []).length ? selectedPaymentReceipt.items.map((item) => (
                  <article className="receipt-line-item" key={item.id || `${item.name}-${item.sku}`}>
                    <div className="receipt-line-item-body">
                      <div className="receipt-line-item-media">
                        {item.image_url ? <img src={item.image_url} alt={item.name} className="receipt-line-item-image" /> : <div className="receipt-line-item-fallback"><InlineIcon id="i-package" /></div>}
                      </div>
                      <div className="receipt-line-item-copy">
                        <div className="receipt-line-item-head">
                          <strong>{item.name}</strong>
                          <span>{formatMoney(item.total || ((item.unit_price || 0) * Number(item.quantity || 0)), storeCurrency)}</span>
                        </div>
                        <div className="receipt-line-item-meta">
                          <span>Qty {formatNumber(item.quantity || 0)}</span>
                          <span>{item.sku || "No SKU"}</span>
                          <span>{formatMoney(item.unit_price || 0, storeCurrency)} each</span>
                        </div>
                      </div>
                    </div>
                  </article>
                )) : <div className="muted">No line items available on this receipt.</div>}
              </div>
            </div>

            {paymentReceiptFeedback ? <p className="receipt-feedback">{paymentReceiptFeedback}</p> : null}
            </div>

            <div className="stacked-order-popup-actions receipt-footer-actions">
              <button className="pill-button" type="button" onClick={closePaymentReceiptModal}>Close</button>
            </div>
            </section>
          </div>
        </div>,
        document.body
      ) : null}

      {productEditForm && (selectedProductEdit || productEditorMode === "create") ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close product editor" onClick={closeProductEditModal} />
            <section className={`detail-section product-editor-popup product-editor-modal ${selectedProductEdit && deletingProductIds.includes(selectedProductEdit.id) ? "product-editor-modal-deleting" : ""}`} role="dialog" aria-modal="true" aria-label={productEditorMode === "create" ? "Create product" : `Edit ${selectedProductEdit?.name || "product"}`}>
              <form className="product-editor-form" onSubmit={saveProductEdits}>
                <input ref={productMediaInputRef} type="file" accept="image/*" multiple hidden onChange={handleProductMediaUpload} />
                <div className="panel-header stacked-order-popup-header product-editor-header">
                  <div>
                    <p className="section-kicker">{productEditorMode === "create" ? "New product" : "Product editor"}</p>
                    <h3>{productEditorMode === "create" ? (productEditForm.title || "New Product") : (productEditForm.title || selectedProductEdit?.name || "Untitled product")}</h3>
                  </div>
                  <div className="toolbar product-editor-top-actions">
                    <button
                      className={`product-status-toggle ${productEditForm.status === "publish" ? "active" : ""}`}
                      type="button"
                      role="switch"
                      aria-checked={productEditForm.status === "publish"}
                      aria-label={`Product status: ${productEditForm.status === "publish" ? "Published" : "Draft"}`}
                      disabled={productEditLoading}
                      onClick={() => setProductEditForm((prev) => ({ ...prev, status: prev.status === "publish" ? "draft" : "publish" }))}
                    >
                      <span className="product-status-toggle-track">
                        <span className="product-status-toggle-thumb" />
                      </span>
                      <span className="product-status-toggle-label">{productEditForm.status === "publish" ? "Published" : "Draft"}</span>
                    </button>
                    <button className="icon-button" type="button" aria-label={productEditorMode === "create" ? "Close product creator" : "Close product editor"} disabled={productEditLoading} onClick={closeProductEditModal}><InlineIcon id="i-x" /></button>
                  </div>
                </div>

                <div className="product-editor-shell">
                  <aside
                    className="product-editor-media-column"
                    style={{ "--product-thumb-min": productMediaSizing.thumbMin }}
                  >
                    <div className="detail-section product-editor-panel product-media-panel">
                      <div className="panel-header product-editor-panel-header">
                        <div>
                          <p className="section-kicker">Media gallery</p>
                        </div>
                      </div>
                      <div className="product-thumbnail-grid">
                        {productEditMedia.map((item, index) => (
                          <div
                            className={`product-thumbnail ${activeProductMedia?.id === item.id ? "active" : ""}`}
                            key={item.id}
                            draggable
                            onDragStart={() => {
                              productMediaDragIndexRef.current = index;
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              moveProductMediaItem(productMediaDragIndexRef.current, index);
                              productMediaDragIndexRef.current = null;
                            }}
                          >
                            <span className="product-thumbnail-index">{index + 1}</span>
                            <button
                              className="product-thumbnail-surface"
                              type="button"
                              onClick={() => setActiveProductMediaId(item.id)}
                              aria-label={`Select ${item.alt}`}
                            >
                              <img src={item.src} alt={item.alt} />
                            </button>
                            <button
                              className="product-thumbnail-edit"
                              type="button"
                              aria-label={`Replace ${item.alt}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                triggerProductMediaUpload("replace", index);
                              }}
                            >
                              <InlineIcon id="i-pencil" />
                            </button>
                            <button
                              className="product-thumbnail-remove"
                              type="button"
                              aria-label={`Remove ${item.alt}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeProductMediaItem(index);
                              }}
                            >
                              <InlineIcon id="i-x" />
                            </button>
                          </div>
                        ))}
                        {!productEditMedia.length ? <div className="product-media-empty"><InlineIcon id="i-pill" /><span>No media yet</span></div> : null}
                      </div>
                      <button className="product-upload-dropzone" type="button" disabled={productMediaUploading || productEditLoading} onClick={() => triggerProductMediaUpload("append")}>
                        <span className="product-upload-dropzone-icon">+</span>
                        <span className="product-upload-dropzone-copy">
                          <strong>{productMediaUploading ? "Uploading images..." : "Upload images"}</strong>
                          <small>PNG, JPG up to 10MB each</small>
                        </span>
                      </button>
                    </div>
                  </aside>

                  <div className="product-editor-form-column">
                    <div className="product-editor-form-card">
                      <div className="product-editor-tablist" aria-label="Product editor tabs">
                      {[
                        ["details", "Details"],
                        ["organization", "Tags & Organization"],
                        ["inventory", "Inventory & Shipping"]
                      ].map(([key, label]) => (
                        <button className={`product-editor-tab ${productEditTab === key ? "active" : ""}`} type="button" key={key} disabled={productEditLoading} onClick={() => setProductEditTab(key)}>
                          {label}
                        </button>
                      ))}
                      </div>

                      <div className="product-editor-form-scroll">
                      {productEditTab === "details" ? (
                        <div className="product-editor-tab-grid product-editor-tab-grid-details">
                          <label className="detail-field detail-field-wide">
                            <span>Product Title *</span>
                            <input value={productEditForm.title} onChange={(event) => setProductEditForm((prev) => ({ ...prev, title: event.target.value }))} required />
                          </label>
                          <label className="detail-field">
                            <span>Short Description</span>
                            <textarea rows={3} maxLength={160} value={productEditForm.shortDescription} onChange={(event) => setProductEditForm((prev) => ({ ...prev, shortDescription: event.target.value }))} />
                            <small className="product-field-note">{`${productEditForm.shortDescription.length}/160`}</small>
                          </label>
                          <div className="detail-field detail-field-wide product-long-description-field">
                            <span>Long Description</span>
                            <div className="product-rich-editor product-rich-editor-card">
                              <div className="product-rich-toolbar product-rich-toolbar-reference">
                                <button type="button" onClick={() => formatProductBlock("p")}>Paragraph</button>
                                <button type="button" onClick={() => formatProductDescription("bold")}><strong>B</strong></button>
                                <button type="button" onClick={() => formatProductDescription("italic")}><em>I</em></button>
                                <button type="button" onClick={() => formatProductDescription("underline")}><span className="text-underline">U</span></button>
                                <button type="button" onClick={() => formatProductDescription("insertOrderedList")}>1.</button>
                                <button type="button" onClick={() => formatProductBlock("blockquote")}>Quote</button>
                                <button type="button" onClick={insertProductDescriptionLink}>Link</button>
                                <button type="button" onClick={() => triggerProductMediaUpload("append")}>Image</button>
                                <button type="button" onClick={() => formatProductDescription("insertUnorderedList")}>• List</button>
                              </div>
                              <div
                                ref={productDescriptionEditorRef}
                                className="product-rich-surface"
                                contentEditable
                                suppressContentEditableWarning
                                onInput={handleProductDescriptionInput}
                              />
                            </div>
                          </div>
                          <label className="detail-field">
                            <span>Regular Price *</span>
                            <div className="product-price-input">
                              <div className="select-wrap"><select value={productEditorCurrency} readOnly><option value={productEditorCurrency}>{productEditorCurrency}</option></select></div>
                              <input type="number" min="0" step="0.01" value={productEditForm.regularPrice} onChange={(event) => setProductEditForm((prev) => ({ ...prev, regularPrice: event.target.value }))} />
                            </div>
                          </label>
                          <label className="detail-field">
                            <span>Sale Price</span>
                            <div className="product-price-input">
                              <div className="select-wrap"><select value={productEditorCurrency} readOnly><option value={productEditorCurrency}>{productEditorCurrency}</option></select></div>
                              <input type="number" min="0" step="0.01" value={productEditForm.salePrice} onChange={(event) => setProductEditForm((prev) => ({ ...prev, salePrice: event.target.value }))} />
                            </div>
                            <small className="product-field-note">Leave empty if product is not on sale</small>
                          </label>
                        </div>
                      ) : null}

                      {productEditTab === "organization" ? (
                        <div className="product-editor-stack product-editor-stack-inline">
                          {productEditorCategoriesQuery.isLoading || productEditorTagsQuery.isLoading ? <p className="muted popup-support-copy">Loading taxonomy options...</p> : null}
                          {productEditorCategoriesQuery.error || productEditorTagsQuery.error ? <p className="muted popup-support-copy">Some taxonomy options could not be loaded.</p> : null}
                          {renderProductTermField("categories", "Category", productCategoryOptions)}
                          {renderProductTermField("tags", "Tags", productTagOptions)}
                          {renderProductTermField("brands", "Brand", productBrandOptions)}
                        </div>
                      ) : null}

                      {productEditTab === "inventory" ? (
                        <div className="product-editor-tab-grid product-editor-tab-grid-inventory">
                          <label className="detail-field detail-field-wide">
                            <span>Shipping Information</span>
                            <textarea rows={3} value={productEditForm.shippingInfo} onChange={(event) => setProductEditForm((prev) => ({ ...prev, shippingInfo: event.target.value }))} />
                          </label>
                          <label className="detail-field">
                            <span>Inventory / Stock Quantity</span>
                            <input type="number" min="0" value={productEditForm.stockQuantity} onChange={(event) => setProductEditForm((prev) => ({ ...prev, stockQuantity: event.target.value }))} />
                          </label>
                          <label className="detail-field">
                            <span>SKU</span>
                            <input value={productEditForm.sku} onChange={(event) => setProductEditForm((prev) => ({ ...prev, sku: event.target.value }))} />
                          </label>
                          <label className="detail-field detail-field-wide">
                            <span>Linked Products</span>
                            <input value={productEditForm.linkedProducts} onChange={(event) => setProductEditForm((prev) => ({ ...prev, linkedProducts: event.target.value }))} placeholder="Search or comma-separate related products" />
                          </label>
                          <label className="detail-field detail-field-wide">
                            <span>Purchase Notes</span>
                            <textarea rows={3} value={productEditForm.purchaseNotes} onChange={(event) => setProductEditForm((prev) => ({ ...prev, purchaseNotes: event.target.value }))} />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  </div>
                </div>

                <div className="product-editor-footer">
                  {productEditorMode === "create" ? <div /> : <button className="pill-button danger product-delete-button" type="button" onClick={deleteSelectedProduct} disabled={productEditLoading}>Delete Product</button>}
                  <div className="product-editor-footer-end">
                    <div className="product-editor-feedback">{productEditFeedback ? <p className="muted popup-support-copy">{productEditFeedback}</p> : null}</div>
                    <div className="stacked-order-popup-actions product-editor-actions">
                      <button className="pill-button product-cancel-button" type="button" disabled={productEditLoading} onClick={closeProductEditModal}>Cancel</button>
                      <button className="button-primary product-save-button" type="submit" disabled={productEditLoading}>{productEditLoading ? "Saving..." : (productEditorMode === "create" ? "Create Product" : "Save Changes")}</button>
                    </div>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </div>
      ) : null}

      {createModalType ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close create form" onClick={closeCreateModal} />
            <section className={`detail-section stacked-order-popup create-record-popup ${createModalType === "consultation" ? "consultation-create-popup" : "profile-create-popup"}`} role="dialog" aria-modal="true" aria-label={`Create ${createModalType}`}>
              <form className="create-record-form" onSubmit={submitGenericCreate}>
                <div className="panel-header stacked-order-popup-header">
                  <div>
                    <p className="section-kicker">Create record</p>
                    <h3>New {formatStatusLabel(createModalType)}</h3>
                  </div>
                  <button className="icon-button" type="button" aria-label="Close create form" onClick={closeCreateModal}><InlineIcon id="i-x" /></button>
                </div>

                {createModalType === "consultation" ? (
                  <div className="consultation-create-shell">
                    {consultationCreateDoctorsQuery.isLoading || consultationCreatePatientsQuery.isLoading || consultationCreateAppointmentsQuery.isLoading ? (
                      <p className="muted popup-support-copy detail-field-wide">Loading consultation dependencies...</p>
                    ) : null}
                    {consultationCreateDoctorsQuery.error || consultationCreatePatientsQuery.error || consultationCreateAppointmentsQuery.error ? (
                      <p className="muted popup-support-copy detail-field-wide">Some consultation dependencies could not be loaded. Existing cached options are shown where available.</p>
                    ) : null}
                    <aside className="consultation-calendar-panel consultation-booking-panel">
                      <BookingCalendarWidget
                        title={consultationDoctorProfile?.display_name || "Doctor Calendar"}
                        subtitle="Select the booking day and time slot"
                        appointments={consultationDoctorAppointments}
                        selectedDate={consultationBookingDate}
                        selectedStartAt={consultationCreateForm.startAt}
                        viewDate={consultationCreateCalendarViewDate}
                        duration={consultationDuration}
                        contextualFlow
                        loading={consultationCreateAppointmentsQuery.isLoading && !consultationCreateAppointmentsQuery.data}
                        onViewDateChange={setConsultationCreateCalendarViewDate}
                        onClearDate={clearConsultationBookingDate}
                        onDateSelect={selectConsultationBookingDate}
                        onSlotSelect={(dateKey, time) => selectConsultationCalendarSlot(dateKey, time, consultationDuration)}
                        onDurationChange={(minutes) => {
                          setConsultationDuration(minutes);
                          if (consultationCreateForm.startAt) {
                            setConsultationCreateForm((prev) => ({
                              ...prev,
                              endAt: addMinutesToLocalValue(prev.startAt, minutes)
                            }));
                          }
                        }}
                      />
                    </aside>

                    <div className="consultation-form-panel consultation-booking-form-panel">
                      <div className="consultation-doctor-banner">
                        <span>Selected doctor</span>
                        <strong>{consultationDoctorProfile?.display_name || "Choose a doctor"}</strong>
                        <small>{consultationDoctorAppointments.length} bookings visible</small>
                      </div>
                      <div className="detail-form-grid consultation-form-grid">
                        <label className="detail-field detail-field-wide">
                          <span>Doctor</span>
                          <div className="consultation-search-combo">
                            <input
                              value={consultationDoctorSearch}
                              onChange={(event) => {
                                setConsultationDoctorSearch(event.target.value);
                                setConsultationCreateForm((prev) => ({ ...prev, doctorUserId: "", startAt: "", endAt: "" }));
                                setConsultationBookingDate("");
                              }}
                              placeholder="Search by doctor name, specialty, or email"
                              aria-label="Search doctors for consultation"
                            />
                            <div className="consultation-search-results">
                              {consultationCreateDoctorsQuery.isLoading ? <div className="consultation-search-loading" role="status" aria-label="Loading doctors"><span className="consultation-form-spinner" aria-hidden="true" /></div> : null}
                              {consultationDoctorOptions.length ? consultationDoctorOptions.map((doctor) => {
                                const doctorId = doctor.user_id || doctor.id;
                                return (
                                  <button
                                    key={doctorId}
                                    type="button"
                                    className={`consultation-search-result consultation-strip-result ${String(consultationCreateForm.doctorUserId) === String(doctorId) ? "active" : ""}`}
                                    onClick={() => selectConsultationDoctor(doctorId, doctor.display_name || doctor.email || `Doctor #${doctorId}`)}
                                  >
                                    <span className="consultation-strip-avatar">{getNameInitials(doctor.display_name || doctor.email || `Doctor ${doctorId}`, "DR")}</span>
                                    <span className="consultation-strip-copy">
                                      <strong>{doctor.display_name || `Doctor #${doctorId}`}</strong>
                                      <span>{[doctor.specialty || doctor.specialties?.[0], doctor.email].filter(Boolean).join(" - ") || "Doctor profile"}</span>
                                    </span>
                                  </button>
                                );
                              }) : <div className="consultation-search-empty">No matching doctors.</div>}
                            </div>
                          </div>
                          <small className="product-field-note">{consultationDoctorProfile ? `Selected: ${consultationDoctorProfile.display_name || "Doctor"} - ${consultationDoctorProfile.email || "No email on file"}` : "Search and choose a doctor to load availability."}</small>
                        </label>
                        <label className="detail-field detail-field-wide">
                          <span>Patient</span>
                          <div className="consultation-search-combo">
                            <input
                              value={consultationPatientSearch}
                              onChange={(event) => {
                                setConsultationPatientSearch(event.target.value);
                                setConsultationCreateForm((prev) => ({ ...prev, patientUserId: "" }));
                              }}
                              placeholder="Search by email, username, or name"
                            />
                            <div className="consultation-search-results">
                              {consultationCreatePatientsQuery.isLoading ? <div className="consultation-search-loading" role="status" aria-label="Loading patients"><span className="consultation-form-spinner" aria-hidden="true" /></div> : null}
                              {consultationVisiblePatientOptions.length ? consultationVisiblePatientOptions.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`consultation-search-result consultation-strip-result ${String(consultationCreateForm.patientUserId) === String(option.id) ? "active" : ""}`}
                                  onClick={() => {
                                    setConsultationCreateForm((prev) => ({ ...prev, patientUserId: String(option.id) }));
                                    setConsultationPatientSearch(option.name || option.label || option.email);
                                  }}
                                >
                                  <span className="consultation-strip-avatar patient">{getNameInitials(option.name || option.label || option.email || "PT", "PT")}</span>
                                  <span className="consultation-strip-copy">
                                    <strong>{option.name || option.label}</strong>
                                    <span>{option.email}</span>
                                  </span>
                                </button>
                              )) : <div className="consultation-search-empty">No matching customers.</div>}
                            </div>
                          </div>
                          <small className="product-field-note">{consultationSelectedPatient ? `Selected: ${consultationSelectedPatient.name} - ${consultationSelectedPatient.email}` : "Search and choose a patient from the list."}</small>
                        </label>
                        <label className="detail-field consultation-hidden-time-field">
                          <span>Doctor</span>
                          <div className="select-wrap">
                            <select value={consultationCreateForm.doctorUserId} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, doctorUserId: event.target.value }))}>
                              <option value="">Select doctor</option>
                              {popupConsultationDoctors.map((doctor) => <option key={doctor.user_id || doctor.id} value={doctor.user_id || doctor.id}>{doctor.display_name}</option>)}
                            </select>
                          </div>
                        </label>
                        <label className="detail-field consultation-hidden-time-field">
                          <span>Start time</span>
                          <input type="datetime-local" value={consultationCreateForm.startAt} min={nowDateTimeLocalValue()} readOnly required />
                        </label>
                        <label className="detail-field consultation-hidden-time-field">
                          <span>End time</span>
                          <input type="datetime-local" value={consultationCreateForm.endAt} min={nowDateTimeLocalValue()} readOnly required />
                        </label>
                        <label className="detail-field">
                          <span>Type</span>
                          <div className="select-wrap">
                            <select value={consultationCreateForm.type} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, type: event.target.value }))}>
                              <option value="video">Video</option>
                              <option value="audio">Audio</option>
                            </select>
                          </div>
                        </label>
                        <label className="detail-field">
                          <span>Status</span>
                          <div className="select-wrap">
                            <select value={consultationCreateForm.status} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, status: event.target.value }))}>
                              <option value="requested">Requested</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </label>
                        <label className="detail-field detail-field-wide">
                          <span>Reason</span>
                          <textarea rows={4} value={consultationCreateForm.reason} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, reason: event.target.value }))} />
                        </label>
                        <article className="consultation-summary-card detail-field-wide">
                          <div><span>Selected doctor</span><strong>{consultationDoctorProfile?.display_name || "Not selected"}</strong></div>
                          <div><span>Selected patient</span><strong>{consultationSelectedPatient?.name || "Not selected"}</strong></div>
                          <div><span>Date</span><strong>{consultationCreateForm.startAt ? formatDate(consultationCreateForm.startAt) : "Choose a day"}</strong></div>
                          <div><span>Time</span><strong>{consultationCreateForm.startAt ? `${localTimeKey(consultationCreateForm.startAt)} - ${consultationDuration} min` : "Choose a slot"}</strong></div>
                          <div><span>Type</span><strong>{formatStatusLabel(consultationCreateForm.type)}</strong></div>
                          <div><span>Status</span><strong>{formatStatusLabel(consultationCreateForm.status)}</strong></div>
                        </article>
                        {!consultationCanSubmit ? <p className="consultation-validation-message detail-field-wide">Select a doctor, patient, booking day, booking time, and consultation type to continue.</p> : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="profile-create-shell">
                    <aside className="profile-create-preview">
                      <div className="profile-avatar">
                        <span>{getNameInitials((createModalType === "doctor" ? doctorCreateForm.fullName : customerCreateForm.fullName) || "")}</span>
                      </div>
                      <strong>{createModalType === "doctor" ? (doctorCreateForm.fullName || "Doctor name") : (customerCreateForm.fullName || "Customer name")}</strong>
                      <span>{createModalType === "doctor" ? (doctorCreateForm.email || "doctor@email.com") : (customerCreateForm.email || "customer@email.com")}</span>
                    </aside>
                    <div className="profile-create-form-column">
                      {createModalType === "doctor" ? (
                        <div className="detail-form-grid profile-create-grid">
                          <label className="detail-field detail-field-wide">
                            <span>Full name</span>
                            <input value={doctorCreateForm.fullName} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, fullName: event.target.value }))} required />
                          </label>
                          <label className="detail-field">
                            <span>Email</span>
                            <input type="email" value={doctorCreateForm.email} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, email: event.target.value }))} required />
                          </label>
                          <label className="detail-field">
                            <span>Status</span>
                            <div className="select-wrap">
                              <select value={doctorCreateForm.status} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, status: event.target.value }))}>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                              </select>
                            </div>
                          </label>
                          <label className="detail-field">
                            <span>Pricing tier</span>
                            <div className="select-wrap">
                              <select value={doctorCreateForm.pricingTier} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, pricingTier: event.target.value }))}>
                                {DOCTOR_PRICING_TIER_OPTIONS.map((tier) => (
                                  <option key={tier.value} value={tier.value}>{tier.label}</option>
                                ))}
                              </select>
                            </div>
                          </label>
                          <label className="detail-field">
                            <span>Specialty</span>
                            <input value={doctorCreateForm.specialty} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, specialty: event.target.value }))} />
                          </label>
                          <label className="detail-field">
                            <span>Location</span>
                            <input value={doctorCreateForm.location} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, location: event.target.value }))} />
                          </label>
                          <label className="detail-field detail-field-wide">
                            <span>Product categories</span>
                            {doctorCreateCategoriesQuery.isLoading ? <small className="product-field-note">Loading categories...</small> : null}
                            {doctorCreateCategoriesQuery.error ? <small className="product-field-note">Category options could not be refreshed.</small> : null}
                            <div className="assignment-search-field">
                              <div className="product-term-chips">
                                {selectedDoctorCreateCategories.length ? selectedDoctorCreateCategories.map((category) => (
                                  <button className="product-chip removable-chip" key={category.id} type="button" aria-label={`Remove ${category.name}`} onClick={() => removeDoctorCreateCategory(category.id)}>
                                    {category.name} <InlineIcon id="i-x" />
                                  </button>
                                )) : <span className="muted">No products assigned yet.</span>}
                              </div>
                              <input
                                value={doctorCreateCategorySearch}
                                onChange={(event) => setDoctorCreateCategorySearch(event.target.value)}
                                placeholder="Search product categories to assign"
                              />
                              {doctorCreateCategorySearch ? (
                                <div className="product-term-options assignment-search-results">
                                  {availableDoctorCreateCategories.length ? availableDoctorCreateCategories.map((category) => (
                                    <button className="product-term-option" type="button" key={category.id} onClick={() => addDoctorCreateCategory(category.id)}>
                                      {category.name}
                                    </button>
                                  )) : <div className="consultation-search-empty">No matching categories.</div>}
                                </div>
                              ) : null}
                            </div>
                          </label>
                          <label className="detail-field detail-field-wide">
                            <span>Bio</span>
                            <textarea rows={4} value={doctorCreateForm.bio} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, bio: event.target.value }))} />
                          </label>
                        </div>
                      ) : (
                        <div className="detail-form-grid profile-create-grid">
                          <label className="detail-field detail-field-wide">
                            <span>Full name</span>
                            <input value={customerCreateForm.fullName} onChange={(event) => setCustomerCreateForm((prev) => ({ ...prev, fullName: event.target.value }))} required />
                          </label>
                          <label className="detail-field">
                            <span>Email</span>
                            <input type="email" value={customerCreateForm.email} onChange={(event) => setCustomerCreateForm((prev) => ({ ...prev, email: event.target.value }))} required />
                          </label>
                          <label className="detail-field">
                            <span>Phone</span>
                            <input value={customerCreateForm.phone} onChange={(event) => setCustomerCreateForm((prev) => ({ ...prev, phone: event.target.value }))} />
                          </label>
                          <label className="detail-field detail-field-wide">
                            <span>Address</span>
                            <textarea rows={4} value={customerCreateForm.address} onChange={(event) => setCustomerCreateForm((prev) => ({ ...prev, address: event.target.value }))} />
                          </label>
                          <p className="muted popup-support-copy detail-field-wide">Customer creation is submitted to the customer endpoint using the paired WordPress API session.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {createFeedback ? <p className="muted popup-support-copy">{createFeedback}</p> : null}
                <div className="stacked-order-popup-actions">
                  <button className="pill-button" type="button" onClick={closeCreateModal}>Cancel</button>
                  <button className="button-primary" type="submit" disabled={createLoading || !consultationCanSubmit}>{createLoading ? "Submitting..." : "Create"}</button>
                </div>
              </form>
            </section>
          </div>
        </div>
      ) : null}

      {selectedConsultation ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close consultation details" onClick={() => setSelectedConsultation(null)} />
            <section className="detail-section stacked-order-popup receipt-popup" role="dialog" aria-modal="true" aria-label="Consultation details">
              <div className="panel-header stacked-order-popup-header">
                <div><p className="section-kicker">Consultation</p><h3>{patientLabel(selectedConsultation.patient_user_id)}</h3></div>
                <button className="icon-button" type="button" onClick={() => setSelectedConsultation(null)}><InlineIcon id="i-x" /></button>
              </div>
              <div className="app-modal-scroll">
              <div className="detail-grid">
                <div className="detail-block"><span>Doctor</span><strong>{doctorMap.get(selectedConsultation.doctor_user_id) || `Doctor #${selectedConsultation.doctor_user_id}`}</strong></div>
                <div className="detail-block"><span>Starts</span><strong>{formatDate(selectedConsultation.start_at, true)}</strong></div>
                <div className="detail-block"><span>Ends</span><strong>{formatDate(selectedConsultation.end_at, true)}</strong></div>
                <div className="detail-block"><span>Status</span><strong>{formatStatusLabel(selectedConsultation.status)}</strong></div>
                <div className="detail-block"><span>Reason</span><strong>{selectedConsultation.reason || selectedConsultation.type || "n/a"}</strong></div>
              </div>
              <div className="detail-form-grid consultation-action-grid">
                <label className="detail-field">
                  <span>Reschedule start</span>
                  <input type="datetime-local" value={consultationDetailForm.startAt} min={nowDateTimeLocalValue()} onChange={(event) => setConsultationDetailForm((prev) => ({ ...prev, startAt: event.target.value }))} />
                </label>
                <label className="detail-field">
                  <span>Reschedule end</span>
                  <input type="datetime-local" value={consultationDetailForm.endAt} min={nowDateTimeLocalValue()} onChange={(event) => setConsultationDetailForm((prev) => ({ ...prev, endAt: event.target.value }))} />
                </label>
                <label className="detail-field detail-field-wide">
                  <span>Doctor notes</span>
                  <textarea rows={3} value={consultationDetailForm.doctorNotes} onChange={(event) => setConsultationDetailForm((prev) => ({ ...prev, doctorNotes: event.target.value }))} />
                </label>
                <label className="detail-field detail-field-wide">
                  <span>Cancellation reason</span>
                  <textarea rows={2} value={consultationDetailForm.cancellationReason} onChange={(event) => setConsultationDetailForm((prev) => ({ ...prev, cancellationReason: event.target.value }))} />
                </label>
              </div>
              {consultationActionFeedback ? <p className="muted popup-support-copy">{consultationActionFeedback}</p> : null}
              <div className="detail-section receipt-panel">
                <div className="panel-header"><div><p className="section-kicker">Prescriptions given</p><h3>Linked patient prescriptions</h3></div></div>
                <div className="history-list">
                  {(data.prescriptionDetails || []).filter((item) => Number(item.patient_user_id) === Number(selectedConsultation.patient_user_id)).map((item) => (
                    <article className="history-card" key={item.id}><strong>{item.prescription_number || `Prescription #${item.id}`}</strong><p>{item.diagnosis || "No diagnosis recorded"}</p><span>{formatStatusLabel(item.status)}</span></article>
                  ))}
                </div>
              </div>
              </div>
              <div className="stacked-order-popup-actions consultation-action-buttons">
                <button className="pill-button" type="button" onClick={() => runAppointmentAction("reschedule", { start_at: consultationDetailForm.startAt, end_at: consultationDetailForm.endAt })} disabled={Boolean(consultationActionLoading) || !consultationDetailForm.startAt || !consultationDetailForm.endAt}>
                  {consultationActionLoading === "reschedule" ? "Rescheduling..." : "Reschedule"}
                </button>
                <button className="pill-button" type="button" onClick={() => runAppointmentAction("notes", { doctor_notes: consultationDetailForm.doctorNotes })} disabled={Boolean(consultationActionLoading)}>
                  {consultationActionLoading === "notes" ? "Saving..." : "Save Notes"}
                </button>
                {selectedConsultation.status === "requested" ? (
                  <button className="button-primary" type="button" onClick={() => runAppointmentAction("confirm")} disabled={Boolean(consultationActionLoading)}>
                    {consultationActionLoading === "confirm" ? "Confirming..." : "Confirm"}
                  </button>
                ) : null}
                {!["completed", "cancelled", "no_show"].includes(selectedConsultation.status) ? (
                  <button className="button-primary" type="button" onClick={() => runAppointmentAction("complete", { doctor_notes: consultationDetailForm.doctorNotes })} disabled={Boolean(consultationActionLoading)}>
                    {consultationActionLoading === "complete" ? "Completing..." : "Complete"}
                  </button>
                ) : null}
                {!["completed", "cancelled", "no_show"].includes(selectedConsultation.status) ? (
                  <button className="pill-button danger" type="button" onClick={() => runAppointmentAction("cancel", { reason: consultationDetailForm.cancellationReason })} disabled={Boolean(consultationActionLoading)}>
                    {consultationActionLoading === "cancel" ? "Cancelling..." : "Cancel"}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {selectedDoctorProfile ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close doctor details" onClick={() => setSelectedDoctorId(null)} />
            <section className="detail-section stacked-order-popup receipt-popup" role="dialog" aria-modal="true" aria-label="Doctor details">
              <div className="panel-header stacked-order-popup-header">
                <div><p className="section-kicker">Doctor details</p><h3>{selectedDoctorProfile.display_name}</h3></div>
                <button className="icon-button" type="button" onClick={() => setSelectedDoctorId(null)}><InlineIcon id="i-x" /></button>
              </div>
              <div className="filter-bar tabs-bar">
                <button className={`filter-btn ${doctorDetailTab === "account" ? "active" : ""}`} type="button" onClick={() => setDoctorDetailTab("account")}>Account</button>
                <button className={`filter-btn ${doctorDetailTab === "prescriptions" ? "active" : ""}`} type="button" onClick={() => setDoctorDetailTab("prescriptions")}>Prescriptions</button>
              </div>
              <div className="app-modal-scroll">
              {doctorDetailTab === "account" ? (
                <div className="detail-list">
                  <div className="detail-grid">
                    <div className="detail-block"><span>Email</span><strong>{selectedDoctorProfile.email || "n/a"}</strong></div>
                    <div className="detail-block"><span>Specialty</span><strong>{selectedDoctorProfile.specialty || "General practice"}</strong></div>
                    <div className="detail-block"><span>Location</span><strong>{selectedDoctorProfile.location || "Nevari network"}</strong></div>
                    <div className="detail-block"><span>Status</span><strong>{formatStatusLabel(getDoctorStatus(selectedDoctorProfile))}</strong></div>
                    <div className="detail-block">
                      <span>Pricing tier</span>
                      <div className="select-wrap doctor-tier-select">
                        <select
                          value={normalizeDoctorTierOption(selectedDoctorProfile.pricing_tier || selectedDoctorProfile.pricingTier || "specialist")}
                          onChange={(event) => updateDoctorPricingTier(selectedDoctorProfile, event.target.value)}
                          disabled={doctorDetailTierLoading}
                        >
                          {DOCTOR_PRICING_TIER_OPTIONS.map((tier) => (
                            <option key={tier.value} value={tier.value}>{tier.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="detail-block customer-detail-wide"><span>Product categories</span><strong>{(selectedDoctorProfile.product_categories || []).map((item) => item.name).join(", ") || "No categories assigned"}</strong></div>
                  </div>
                  <div className="detail-section receipt-panel"><div className="panel-header"><div><p className="section-kicker">Linked patients</p><h3>Contacts</h3></div></div>{selectedDoctorPatients.length ? selectedDoctorPatients.map((patient) => <div className="signal-row" key={patient.id}><div><strong>{patient.name}</strong><span>{patient.email}</span></div><button className="pill-button" type="button">Unlink</button></div>) : <div className="muted">No linked patients found.</div>}</div>
                </div>
              ) : (
                <div className="history-list">
                  {selectedDoctorPrescriptions.length ? selectedDoctorPrescriptions.map((item) => {
                    const linkedOrder = (data.orderDetails || []).find((order) => Number(order.prescription_id) === Number(item.id));
                    return (
                      <article className="history-card" key={item.id}>
                        <div className="history-meta">
                          <strong>{item.prescription_number || `Prescription #${item.id}`}</strong>
                          <StatusPill value={item.status}>{formatStatusLabel(item.status)}</StatusPill>
                        </div>
                        <p>Order {linkedOrder?.number ? `#${linkedOrder.number}` : "not linked"} - {patientLabel(item.patient_user_id)} - {formatMoney(linkedOrder?.total || 0, storeCurrency)}</p>
                        <div className="product-chip-list">
                          {(linkedOrder?.items || []).length ? (linkedOrder.items || []).map((product) => (
                            <div className="product-chip-item" key={`${item.id}-${product.id || product.sku || product.name}`}>
                              <div className="order-product-media order-product-list-media">
                                {product.image_url ? <img src={product.image_url} alt={product.name} className="order-product-image" /> : <div className="order-product-image order-product-fallback"><InlineIcon id="i-pill" /></div>}
                              </div>
                              <strong>{product.name}</strong>
                            </div>
                          )) : <span>No product items available</span>}
                        </div>
                      </article>
                    );
                  }) : <div className="muted">No prescriptions created by this doctor in the current sync.</div>}
                </div>
              )}
              </div>
              {doctorDetailTab === "account" ? (
                <div className="stacked-order-popup-actions doctor-detail-actions">
                  <button className="pill-button" type="button" onClick={resetSelectedDoctorPassword} disabled={doctorDetailTierLoading}>Reset password</button>
                  <button className="pill-button danger" type="button" onClick={suspendSelectedDoctor} disabled={doctorDetailTierLoading}>Suspend doctor</button>
                  <button className="pill-button danger" type="button" onClick={deleteSelectedDoctor} disabled={doctorDetailTierLoading}>Delete doctor</button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {selectedCustomerProfile ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close customer details" onClick={closeCustomerDetails} />
            <section className="detail-section stacked-order-popup receipt-popup customer-detail-popup" role="dialog" aria-modal="true" aria-label={`Customer details for ${selectedCustomerProfile.name}`}>
              <div className="panel-header stacked-order-popup-header">
                <div>
                  <p className="section-kicker">Customer profile</p>
                  <h3>{selectedCustomerProfile.name}</h3>
                </div>
                <button className="icon-button" type="button" aria-label="Close customer details" onClick={closeCustomerDetails}>
                  <InlineIcon id="i-x" />
                </button>
              </div>

              <div className="filter-bar tabs-bar">
                <button className={`filter-btn ${customerDetailTab === "details" ? "active" : ""}`} type="button" onClick={() => setCustomerDetailTab("details")}>Details</button>
                <button className={`filter-btn ${customerDetailTab === "orders" ? "active" : ""}`} type="button" onClick={() => setCustomerDetailTab("orders")}>Orders</button>
                <button className={`filter-btn ${customerDetailTab === "products" ? "active" : ""}`} type="button" onClick={() => setCustomerDetailTab("products")}>Products</button>
              </div>
              <div className="customer-detail-scroll">
                {customerDetailTab === "details" ? (
                  <div className="customer-detail-grid">
                    <div className="detail-item-card"><strong>Customer</strong><span className="muted">{selectedCustomerProfile.label}</span></div>
                    <div className="detail-item-card"><strong>Email</strong><span className="muted">{selectedCustomerProfile.email}</span></div>
                    <div className="detail-item-card"><strong>Total orders</strong><span className="muted">{formatNumber(selectedCustomerProfile.orders)}</span></div>
                    <div className="detail-item-card"><strong>Total spend</strong><span className="muted">{formatMoney(selectedCustomerProfile.spend, storeCurrency)}</span></div>
                    <div className="detail-item-card"><strong>Prescriptions</strong><span className="muted">{formatNumber(selectedCustomerProfile.prescriptions)}</span></div>
                    <div className="detail-item-card"><strong>Appointments</strong><span className="muted">{formatNumber(selectedCustomerProfile.appointments)}</span></div>
                    <div className="detail-item-card customer-detail-wide"><strong>Last activity</strong><span className="muted">{formatDate(selectedCustomerProfile.lastActivity, true)}</span></div>
                  </div>
                ) : null}

                {customerDetailTab === "orders" ? (
                  <div className="customer-history-section">
                    {customerHistoryLoading ? <div className="muted">Loading full order history...</div> : null}
                    <div className="customer-history-scroll">
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Order</th>
                              <th>Total price</th>
                              <th>Date</th>
                              <th>Doctor assigned</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedCustomerOrders.length ? paginatedCustomerOrders.map((order) => (
                              <tr key={order.id}>
                                <td><button className="table-link" type="button" onClick={() => openCustomerOrderInOrdersPage(order.id)}>#{order.number}</button></td>
                                <td>{formatMoney(order.total || 0, storeCurrency)}</td>
                                <td>{formatDate(order.created_at, true)}</td>
                                <td>{order.assigned_doctor?.display_name || "Not assigned"}</td>
                              </tr>
                            )) : <tr><td colSpan="4" className="muted">No orders found for this customer.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="pagination-row">
                        <div className="pagination">
                          <button className="page-item" type="button" disabled={activeCustomerOrderPage === 1} onClick={() => setCustomerOrderPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                          {Array.from({ length: customerOrderPageCount }, (_, index) => index + 1).slice(0, 7).map((page) => (
                            <button className={`page-item ${activeCustomerOrderPage === page ? "active" : ""}`} type="button" key={page} onClick={() => setCustomerOrderPage(page)}>{page}</button>
                          ))}
                          <button className="page-item" type="button" disabled={activeCustomerOrderPage === customerOrderPageCount} onClick={() => setCustomerOrderPage((prev) => Math.min(customerOrderPageCount, prev + 1))}>Next</button>
                        </div>
                        <div className="pagination-summary">Showing {selectedCustomerOrders.length ? `${formatNumber(((activeCustomerOrderPage - 1) * customerHistoryPerPage) + 1)}-${formatNumber(Math.min(activeCustomerOrderPage * customerHistoryPerPage, selectedCustomerOrders.length))}` : "0"} of {formatNumber(selectedCustomerOrders.length)} orders</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {customerDetailTab === "products" ? (
                  <div className="customer-history-section">
                    {customerHistoryLoading ? <div className="muted">Loading full product history...</div> : null}
                    <div className="customer-history-scroll">
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Order</th>
                              <th>Date</th>
                              <th>Price</th>
                              <th>Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedCustomerProducts.length ? paginatedCustomerProducts.map((product) => (
                              <tr key={product.id}>
                                <td>
                                  <div className="order-product-media order-product-list-media">
                                    {product.image_url ? <img src={product.image_url} alt={product.name} className="order-product-image" /> : <div className="order-product-image order-product-fallback"><InlineIcon id="i-pill" /></div>}
                                    <div className="table-title">
                                      <strong>{product.name}</strong>
                                      <span className="muted">{product.sku}</span>
                                    </div>
                                  </div>
                                </td>
                                <td>{product.orderNumber ? <button className="table-link" type="button" onClick={() => openCustomerOrderInOrdersPage(product.orderId)}>#{product.orderNumber}</button> : "n/a"}</td>
                                <td>{formatDate(product.createdAt, true)}</td>
                                <td>{formatMoney(product.total || 0, storeCurrency)}</td>
                                <td>{formatNumber(product.quantity)}</td>
                              </tr>
                            )) : <tr><td colSpan="5" className="muted">No purchased products found for this customer.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="pagination-row">
                        <div className="pagination">
                          <button className="page-item" type="button" disabled={activeCustomerProductPage === 1} onClick={() => setCustomerProductPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                          {Array.from({ length: customerProductPageCount }, (_, index) => index + 1).slice(0, 7).map((page) => (
                            <button className={`page-item ${activeCustomerProductPage === page ? "active" : ""}`} type="button" key={page} onClick={() => setCustomerProductPage(page)}>{page}</button>
                          ))}
                          <button className="page-item" type="button" disabled={activeCustomerProductPage === customerProductPageCount} onClick={() => setCustomerProductPage((prev) => Math.min(customerProductPageCount, prev + 1))}>Next</button>
                        </div>
                        <div className="pagination-summary">Showing {selectedCustomerProducts.length ? `${formatNumber(((activeCustomerProductPage - 1) * customerHistoryPerPage) + 1)}-${formatNumber(Math.min(activeCustomerProductPage * customerHistoryPerPage, selectedCustomerProducts.length))}` : "0"} of {formatNumber(selectedCustomerProducts.length)} products</div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {customerHistoryFeedback ? <p className="receipt-feedback">{customerHistoryFeedback}</p> : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {categoryCreateOpen ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close create category" onClick={closeCategoryCreateForm} />
            <form className="category-create-popup" role="dialog" aria-modal="true" aria-label="Create new category" onSubmit={saveNewCategory}>
              <div className="category-create-copy">
                <h3>Create new category</h3>
                <p>Add a new consultation product category.</p>
              </div>
              <label className="category-create-field">
                <span>Category name</span>
                <input
                  autoFocus
                  value={categoryCreateForm.name}
                  onChange={(event) => setCategoryCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeCategoryCreateForm();
                    }
                  }}
                  placeholder="Enter category name"
                />
              </label>
              <input type="hidden" value={categoryCreateForm.pricePerMinute} readOnly />
              {categoryMutationFeedback ? <p className="category-create-feedback">{categoryMutationFeedback}</p> : null}
              <div className="category-create-actions">
                <button className="pill-button category-create-cancel" type="button" onClick={closeCategoryCreateForm}>Cancel</button>
                <button className="button-primary category-create-save" type="submit" disabled={categoryMutationLoading === "create-category"}>
                  {categoryMutationLoading === "create-category" ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {snackbar ? (
        <div className={`snackbar ${snackbar.tone || "info"}`} role="status" aria-live="polite">
          <strong className="snackbar-title">{snackbar.tone === "success" ? "Success" : snackbar.tone === "error" ? "Error" : snackbar.tone === "warning" ? "Warning" : "Notice"}</strong>
          <span className="snackbar-message">{snackbar.message}</span>
        </div>
      ) : null}

      <div className="auth-gate" hidden={!authGate.visible}>
        <div className="auth-gate-shell">
          <section className="auth-card auth-screen-card">
            <div className="auth-card-body">
              <div className="auth-intro">
                <img className="auth-logo" src="/ne.webp" alt="Storefront logo" />
                <h1 className="auth-title">
                  {authView === "reset" ? "Reset your password" : authView === "verify" ? "Verify your login" : "Signin to your storefront"}
                </h1>
              </div>
              <section hidden={authGate.stage !== "auth"}>
                {authView === "login" ? (
                  <form className="auth-form auth-reference-form" onSubmit={handleLoginSubmit}>
                    <label className="form-group">
                      <span>Username or email</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-user" /></span>
                        <input
                          name="loginIdentifier"
                          type="text"
                          autoComplete="off"
                          required
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                        />
                      </div>
                    </label>
                    <label className="form-group">
                      <span>Password</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-lock" /></span>
                        <input
                          name="password"
                          type={passwordVisible ? "text" : "password"}
                          autoComplete="off"
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <button className="input-suffix" type="button" onClick={() => setPasswordVisible((prev) => !prev)}>
                          {passwordVisible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </label>
                    <div className="auth-actions">
                      <button className="auth-primary-button" type="submit" disabled={authSubmitting}>
                        {authSubmitting ? <><span className="auth-button-spinner" aria-hidden="true" />Signing in...</> : "Sign In"}
                      </button>
                    </div>
                    <div className="auth-inline-links">
                      <button className="auth-text-link" type="button" onClick={() => setAuthView("reset")}>
                        Reset password
                      </button>
                    </div>
                  </form>
                ) : authView === "verify" ? (
                  <form className="auth-form auth-reference-form" onSubmit={handleVerificationSubmit}>
                    <label className="form-group">
                      <span>Verification code</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-lock" /></span>
                        <input
                          name="verificationCode"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          value={verification.code}
                          onChange={(event) => setVerification((prev) => ({ ...prev, code: event.target.value.replace(/\D+/g, "").slice(0, 6) }))}
                        />
                      </div>
                    </label>
                    <div className="auth-actions">
                      <button className="auth-primary-button" type="submit" disabled={authSubmitting || authResendLoading}>
                        {authSubmitting ? <><span className="auth-button-spinner" aria-hidden="true" />Verifying...</> : "Verify Code"}
                      </button>
                    </div>
                    <div className="auth-inline-links">
                      <button className="auth-text-link" type="button" onClick={() => setAuthView("login")}>
                        Back to login
                      </button>
                      <button className="auth-text-link" type="button" onClick={handleResendVerificationCode} disabled={authResendLoading || authSubmitting}>
                        {authResendLoading ? <><span className="auth-button-spinner" aria-hidden="true" />Sending...</> : "Resend code"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="auth-form auth-reference-form" onSubmit={handleResetSubmit}>
                    <label className="form-group">
                      <span>Username or email</span>
                      <div className="input-wrap">
                        <span className="input-icon"><InlineIcon id="i-user" /></span>
                        <input
                          name="resetUsername"
                          type="text"
                          autoComplete="username email"
                          required
                          value={resetUsername}
                          onChange={(event) => setResetUsername(event.target.value)}
                        />
                      </div>
                    </label>
                    <div className="auth-actions">
                      <button className="auth-primary-button" type="submit" disabled={resetSubmitting}>
                        {resetSubmitting ? <><span className="auth-button-spinner" aria-hidden="true" />Submitting...</> : "Send Reset Link"}
                      </button>
                    </div>
                    <div className="auth-inline-links">
                      <button className="auth-text-link" type="button" onClick={() => setAuthView("login")}>
                        Back to login
                      </button>
                    </div>
                  </form>
                )}
                <p className="auth-feedback">{authFeedback}</p>
              </section>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
