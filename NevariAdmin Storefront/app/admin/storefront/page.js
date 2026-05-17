"use client";

import { createPortal } from "react-dom";
import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setDocumentMetadata } from "../../components/page-metadata";
import { clearStoredSessions, createPairingRequiredError, isPairingRequiredError, isPairingRequiredPayload } from "../../components/role-session";

const STORAGE_KEY = "nevari_admin_storefront_session";
const API_NAMESPACE = "nevari/v1";
const FRONTEND_TYPE = "storefront";
const PAIRING_FRONTEND_TYPE = "custom_frontend";
const DEFAULT_SITE_NAME = "Nevari Pharmacy";

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
      ["orders", "Orders", "i-cart"],
      ["payments", "Payments", "i-credit-card"],
      ["customers", "Customers", "i-users"]
    ]
  },
  {
    label: "Care Ops",
    items: [
      ["consultations", "Consultations", "i-stethoscope"],
      ["prescriptions", "Prescriptions", "i-clipboard"],
      ["products", "Products", "i-pill"],
      ["doctors", "Doctors", "i-briefcase-medical"]
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
  status: "pending",
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
  productCategoryIds: []
};

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
    doctors: [],
    products: [],
    productCategories: [],
    auditEvents: []
  };
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

function customerFullName(order) {
  const shippingName = joinNonEmpty([order?.shipping?.first_name, order?.shipping?.last_name]);
  if (shippingName) {
    return shippingName;
  }
  const billingName = joinNonEmpty([order?.billing?.first_name, order?.billing?.last_name]);
  return billingName || patientLabel(order?.customer_id);
}

function customerSummary(order) {
  return {
    name: customerFullName(order),
    email: order?.billing?.email || "No email on file",
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

function itemQuantityTotal(order) {
  if (order?.totals?.items_quantity !== undefined && order?.totals?.items_quantity !== null) {
    return Number(order.totals.items_quantity);
  }
  return (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function formatTopbarDate() {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function formatLiveLabel(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
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
    return formatMoney(getProductPrice(product, "sale_price"), product.currency || fallbackCurrency);
  }
  const basePrice = getProductPrice(product, "regular_price") || getProductPrice(product, "price");
  return formatMoney(basePrice, product.currency || fallbackCurrency);
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
  return product?.currency || fallbackCurrency;
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
  if (/appointment slot is no longer available/i.test(message)) {
    return "That appointment slot is no longer available.";
  }
  if (/appointment must be in the future/i.test(message)) {
    return "Appointment time must be in the future.";
  }
  if (/required|invalid|not found|already exists|not available/i.test(message)) {
    return "Please review the submitted details and try again.";
  }
  return "Something went wrong. Try again.";
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
  return describeRequestError({ message: payload?.error?.message || payload?.message || "" });
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, currentPage }));
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
  const [orderActionFeedback, setOrderActionFeedback] = useState("");
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderControlsModalOpen, setOrderControlsModalOpen] = useState(false);
  const [doctorAssignmentModalOpen, setDoctorAssignmentModalOpen] = useState(false);
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] = useState(null);
  const [paymentReceiptModalOpen, setPaymentReceiptModalOpen] = useState(false);
  const [paymentReceiptFeedback, setPaymentReceiptFeedback] = useState("");
  const [receiptActionLoading, setReceiptActionLoading] = useState("");
  const [tableActionLoading, setTableActionLoading] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState("");
  const [createFeedback, setCreateFeedback] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [productEditorMode, setProductEditorMode] = useState("edit");
  const [productCreateForm, setProductCreateForm] = useState(buildEmptyProductDraft());
  const [consultationCreateForm, setConsultationCreateForm] = useState(EMPTY_CONSULTATION_FORM);
  const [consultationCalendarMode, setConsultationCalendarMode] = useState("week");
  const [consultationPatientSearch, setConsultationPatientSearch] = useState("");
  const [doctorCreateForm, setDoctorCreateForm] = useState(EMPTY_DOCTOR_FORM);
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
  const [productListFilter, setProductListFilter] = useState("all");
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
  const [consultationFilter, setConsultationFilter] = useState("upcoming");
  const [selectedConsultationDate, setSelectedConsultationDate] = useState(isoDateKey());
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [consultationDetailForm, setConsultationDetailForm] = useState({ startAt: "", endAt: "", doctorNotes: "", cancellationReason: "" });
  const [consultationActionLoading, setConsultationActionLoading] = useState("");
  const [consultationActionFeedback, setConsultationActionFeedback] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [doctorDetailTab, setDoctorDetailTab] = useState("account");
  const [orderCreateModalOpen, setOrderCreateModalOpen] = useState(false);
  const [orderCreateForm, setOrderCreateForm] = useState(EMPTY_ORDER_FORM);
  const [orderCreateLoading, setOrderCreateLoading] = useState(false);
  const [orderCreateFeedback, setOrderCreateFeedback] = useState("");
  const [appDataLoaded, setAppDataLoaded] = useState(false);
  const latestSessionRef = useRef(session);
  const refreshPromiseRef = useRef(null);
  const bootstrapStartedRef = useRef(false);
  const productMediaInputRef = useRef(null);
  const productMediaUploadModeRef = useRef({ type: "append", index: null });
  const productMediaDragIndexRef = useRef(null);
  const productDescriptionEditorRef = useRef(null);

  function forcePairingReset(message = "Frontend access was revoked. Pair this dashboard again to continue.") {
    const nextSession = defaultSession();
    clearStoredSessions();
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession((prev) => ({ ...prev, ...parsed }));
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
    const hasPopupOpen = orderModalOpen || orderControlsModalOpen || doctorAssignmentModalOpen || orderCreateModalOpen || paymentReceiptModalOpen || Boolean(createModalType) || Boolean(selectedConsultation) || Boolean(selectedDoctorId) || Boolean(selectedProductEdit) || Boolean(selectedCustomerId);
    document.body.classList.toggle("auth-locked", authGate.visible);
    document.body.classList.toggle("modal-open", hasPopupOpen);
    return () => {
      document.body.classList.remove("auth-locked");
      document.body.classList.remove("modal-open");
    };
  }, [authGate.visible, createModalType, doctorAssignmentModalOpen, orderControlsModalOpen, orderCreateModalOpen, orderModalOpen, paymentReceiptModalOpen, selectedConsultation, selectedCustomerId, selectedDoctorId, selectedProductEdit]);

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

  function closeAllOrderPopups() {
    setOrderCreateModalOpen(false);
    setOrderControlsModalOpen(false);
    setDoctorAssignmentModalOpen(false);
    setOrderModalOpen(false);
  }

  function closeOrderModal() {
    closeNestedOrderPopups();
    setOrderModalOpen(false);
  }

  function closePaymentReceiptModal() {
    setPaymentReceiptModalOpen(false);
    setSelectedPaymentReceipt(null);
    setPaymentReceiptFeedback("");
    setReceiptActionLoading("");
  }

  async function fetchReceiptDocument(order) {
    const payload = await apiRequest(`/orders/${order.id}/receipt`);
    return {
      filename: payload?.data?.filename || `receipt-order-${order.number}.pdf`,
      blob: base64PdfToBlob(payload?.data?.base64 || ""),
    };
  }

  async function printReceiptForOrder(order, { feedback } = {}) {
    const { blob, filename } = await fetchReceiptDocument(order);
    const objectUrl = URL.createObjectURL(blob);
    const receiptWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!receiptWindow) {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
    } else {
      receiptWindow.addEventListener("load", () => {
        receiptWindow.focus();
        receiptWindow.print();
      }, { once: true });
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    if (feedback) {
      feedback("Printable PDF receipt generated.");
    }
  }

  async function downloadReceiptForOrder(order, { feedback } = {}) {
    const { blob, filename } = await fetchReceiptDocument(order);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    if (feedback) {
      feedback("Receipt download started.");
    }
  }

  async function sendReceiptForOrder(order, { feedback } = {}) {
    const payload = await apiRequest(`/orders/${order.id}/send-receipt`, { method: "POST" });
    if (feedback) {
      feedback(`Receipt sent to ${payload?.data?.recipient_email || order.billing?.email || "the customer"}.`);
    }
  }

  async function performTableOrderAction(actionKey, order, action) {
    setTableActionLoading(`${actionKey}-${order.id}`);
    try {
      await action();
    } finally {
      setTableActionLoading("");
    }
  }

  function openOrderCreateModal() {
    closeAllOrderPopups();
    setOrderCreateForm((prev) => ({
      ...EMPTY_ORDER_FORM,
      productId: prev.productId || String((data.products || [])[0]?.id || "")
    }));
    setOrderCreateItems((data.products || []).length ? [{ ...EMPTY_ORDER_LINE, key: "line-1", productId: String((data.products || [])[0]?.id || "") }] : [{ ...EMPTY_ORDER_LINE, key: "line-1" }]);
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
      const consultationWindow = buildDefaultConsultationWindow();
      setConsultationCreateForm({
        ...EMPTY_CONSULTATION_FORM,
        ...consultationWindow,
        doctorUserId: String((data.doctors || [])[0]?.user_id || (data.doctors || [])[0]?.id || "")
      });
      setConsultationCalendarMode("week");
      setConsultationPatientSearch("");
      setCreateModalType("consultation");
      return;
    }
    if (type === "doctor") {
      setDoctorCreateForm(EMPTY_DOCTOR_FORM);
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
    setCustomerCreateForm(EMPTY_CUSTOMER_FORM);
    setDoctorCreateForm(EMPTY_DOCTOR_FORM);
    setConsultationCreateForm(EMPTY_CONSULTATION_FORM);
    setConsultationCalendarMode("week");
    setConsultationPatientSearch("");
  }

  function closeOrderCreateModal() {
    setOrderCreateModalOpen(false);
    setOrderCreateFeedback("");
    setOrderCreateItems([{ ...EMPTY_ORDER_LINE, key: "line-1" }]);
  }

  function addOrderCreateItem() {
    setOrderCreateItems((prev) => [
      ...prev,
      {
        ...EMPTY_ORDER_LINE,
        key: `line-${Date.now()}-${prev.length + 1}`,
        productId: String((data.products || [])[0]?.id || "")
      }
    ]);
  }

  function updateOrderCreateItem(index, patch) {
    setOrderCreateItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeOrderCreateItem(index) {
    setOrderCreateItems((prev) => prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function switchPage(pageId) {
    startTransition(() => {
      setCurrentPage(normalizePageId(pageId));
      setSidebarOpen(false);
    });
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
      const payload = await apiRequest(`/orders/${selectedOrderDetail.id}`, {
        method: "POST",
        body: {
          status: selectedOrderStatus,
          customer_note: selectedOrderNote
        }
      });
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
          doctor_user_id: orderCreateForm.doctorId ? Number(orderCreateForm.doctorId) : 0,
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
      setOrderCreateItems([{ ...EMPTY_ORDER_LINE, key: "line-1" }]);
      setOrderCreateFeedback("Order created.");
      setOrderCreateModalOpen(false);
      setOrderModalOpen(true);
    } catch (error) {
      setOrderCreateFeedback(describeRequestError(error));
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
        closeCreateModal();
      } else if (createModalType === "consultation") {
        const payload = await apiRequest("/appointments", {
          method: "POST",
          body: {
            patient_user_id: consultationCreateForm.patientUserId ? Number(consultationCreateForm.patientUserId) : 0,
            doctor_user_id: consultationCreateForm.doctorUserId ? Number(consultationCreateForm.doctorUserId) : 0,
            start_at: consultationCreateForm.startAt,
            end_at: consultationCreateForm.endAt,
            type: consultationCreateForm.type,
            reason: consultationCreateForm.reason,
            status: consultationCreateForm.status
          }
        });
        if (payload?.data) {
          setData((prev) => ({ ...prev, appointments: [payload.data, ...(prev.appointments || [])] }));
        }
        setCreateFeedback("Consultation created.");
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
            product_category_ids: doctorCreateForm.productCategoryIds.map(Number)
          }
        });
        if (payload?.data) {
          setData((prev) => ({ ...prev, doctors: [payload.data, ...(prev.doctors || [])] }));
        }
        setCreateFeedback("Doctor created.");
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
          setData((prev) => ({ ...prev }));
        }
        setCreateFeedback("Customer created.");
        closeCreateModal();
      }
    } catch (error) {
      setCreateFeedback(describeRequestError(error));
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
      removeOrderState(selectedOrderDetail.id);
      setOrderActionFeedback("Order deleted.");
    } catch (error) {
      setOrderActionFeedback(describeRequestError(error));
    } finally {
      setOrderMutationLoading(false);
    }
  }

  function printSelectedOrder() {
    if (typeof window === "undefined" || !selectedOrderDetail) {
      return;
    }
    window.print();
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

  function contactSelectedCustomer() {
    if (typeof window === "undefined" || !selectedOrderDetail) {
      return;
    }
    const email = selectedOrderDetail.billing?.email;
    const phone = selectedOrderDetail.billing?.phone;
    if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Order #${selectedOrderDetail.number}`)}`;
      return;
    }
    if (phone) {
      window.location.href = `tel:${phone}`;
      return;
    }
    setOrderActionFeedback("No customer email or phone number is available for contact.");
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

  function openPaymentReceipt(order) {
    if (!order) {
      return;
    }
    setSelectedPaymentReceipt(order);
    setPaymentReceiptFeedback("");
    setReceiptActionLoading("");
    setPaymentReceiptModalOpen(true);
  }

  async function openCustomerDetails(customer) {
    setSelectedCustomerId(customer.id);
    setCustomerDetailTab("details");
    setCustomerOrderPage(1);
    setCustomerProductPage(1);
    setCustomerHistoryFeedback("");

    const cachedOrders = (data.orderDetails || []).filter((order) => (
      customer.id === (order.customer_id || `guest-${order.billing?.email || order.number || order.id}`)
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
    await performTableOrderAction("print", order, () => printReceiptForOrder(order));
  }

  async function downloadOrderReceiptFromRow(order) {
    if (typeof window === "undefined" || !order) {
      return;
    }
    await performTableOrderAction("download", order, () => downloadReceiptForOrder(order));
  }

  async function sendOrderReceiptFromRow(order) {
    if (!order) {
      return;
    }
    await performTableOrderAction("send", order, () => sendReceiptForOrder(order));
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
      removeOrderState(order.id);
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
      const payload = await apiRequest(`/orders/${selectedPaymentReceipt.id}/receipt`);
      const blob = base64PdfToBlob(payload?.data?.base64 || "");
      const objectUrl = URL.createObjectURL(blob);
      const receiptWindow = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (!receiptWindow) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = payload?.data?.filename || `receipt-order-${selectedPaymentReceipt.number}.pdf`;
        link.click();
      } else {
        receiptWindow.addEventListener("load", () => {
          receiptWindow.focus();
          receiptWindow.print();
        }, { once: true });
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setPaymentReceiptFeedback("Printable PDF receipt generated.");
    } catch (error) {
      setPaymentReceiptFeedback(describeRequestError(error));
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
      const payload = await apiRequest(`/orders/${selectedPaymentReceipt.id}/send-receipt`, { method: "POST" });
      setPaymentReceiptFeedback(`Receipt sent to ${payload?.data?.recipient_email || selectedPaymentReceipt.billing?.email || "the customer"}.`);
    } catch (error) {
      setPaymentReceiptFeedback(describeRequestError(error));
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
        const createdPayload = await apiRequest("/products", {
          method: "POST",
          body: {
            ...productPayload,
            catalog_visibility: "visible"
          }
        });
        const createdProduct = createdPayload?.data;
        if (!createdProduct) {
          throw new Error("Product creation returned no data.");
        }
        const mediaUpdatePayload = productEditMedia.length ? await apiRequest(`/products/${createdProduct.id}`, {
          method: "POST",
          body: {
            images: productEditMedia.map((item, index) => ({ id: item.attachmentId, src: item.src, position: index }))
          }
        }) : null;
        const nextProduct = mediaUpdatePayload?.data || createdProduct;
        setData((prev) => ({
          ...prev,
          products: [nextProduct, ...(prev.products || [])]
        }));
        setProductEditFeedback("Product created.");
        closeProductEditModal();
      } else {
        const payload = await apiRequest(`/products/${selectedProductEdit.id}`, {
          method: "POST",
          body: productPayload
        });

        const nextProduct = payload?.data || {
          ...selectedProductEdit,
          ...productPayload,
          images: productEditMedia.map((item) => ({ id: item.attachmentId, src: item.src, alt: item.alt }))
        };

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
      await apiRequest(`/products/${product.id}`, { method: "DELETE" });
      setDeletingProductIds((prev) => (prev.includes(product.id) ? prev : [...prev, product.id]));
      await new Promise((resolve) => window.setTimeout(resolve, 220));
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
      }
    } catch (error) {
      setProductEditFeedback(describeRequestError(error));
    } finally {
      setDuplicatingProductId(null);
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
  }

  async function runAppointmentAction(action, body = {}) {
    if (!selectedConsultation) {
      return;
    }
    setConsultationActionLoading(action);
    setConsultationActionFeedback("");
    try {
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
      await fetchAllData(session);
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

      if (!session.refreshToken) {
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

      let refreshed;
      try {
        refreshed = await refreshSession(session);
      } catch (error) {
        console.error(error);
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

      if (cancelled) {
        return;
      }

      try {
        await fetchAllData(refreshed);
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
    if (!session.accessToken) {
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
  }, [audit.category, audit.status, audit.source, deferredSearch, session.accessToken]);

  useEffect(() => {
    if (trendMode !== "live" || !session.accessToken) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activeSession = latestSessionRef.current;
      if (!activeSession?.accessToken || refreshing) {
        return;
      }

      fetchAllData(activeSession).catch((error) => {
        console.error(error);
        setSyncStatus({ text: "Sync error", mode: "error" });
      });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [trendMode, session.accessToken, refreshing]);

  const dashboard = data.dashboard || {};
  const sales = dashboard.sales || {};
  const storeCurrency = sales.currency || (data.orderDetails || []).find((order) => order.currency)?.currency || "USD";
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

  const orderQueueRows = data.orderDetails || [];
  const orderQueueCounts = {
    all: orderQueueRows.length,
    needs_rx: orderQueueRows.filter((order) => isNeedsRxOrder(order)).length,
    awaiting_payment: orderQueueRows.filter((order) => isAwaitingPaymentOrder(order)).length,
    doctor_follow_up: orderQueueRows.filter((order) => isDoctorFollowUpOrder(order)).length
  };

  const filteredOrders = orderQueueRows.filter((order) => {
    const names = (order.items || []).map((item) => item.name).join(" ");
    const searchText = `${order.number} ${order.status} ${order.rx_status || ""} ${names} ${order.customer_id || ""}`;
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

  const filteredDoctors = (data.doctors || []).filter((doctor) =>
    matchesSearch(`${doctor.display_name} ${doctor.email} ${doctor.specialties?.join(" ")} ${doctor.location} ${doctor.user_id}`, currentPage === "doctors")
  );

  const productCategoryOptions = Array.from(new Set((data.products || [])
    .flatMap((product) => getProductCategories(product).split(","))
    .map((item) => item.trim())
    .filter(Boolean)
  ));
  const productTagOptions = Array.from(new Set((data.products || [])
    .flatMap((product) => getProductTags(product).split(","))
    .map((item) => item.trim())
    .filter(Boolean)
  ));
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

  const allPaymentRows = (data.orderDetails || [])
    .filter((order) => {
      const paymentStatus = order.payment_status || order.status || "pending";
      return matchesSearch(`${order.number} ${paymentStatus} ${order.rx_status || ""} ${order.customer_id || ""} ${order.total || 0}`, currentPage === "payments");
    })
    .map((order) => {
      const paymentStatus = order.payment_status || order.status || "pending";
      const held = ["on_hold", "on-hold"].includes(order.rx_status || "");
      return {
        id: order.id,
        number: order.number,
        customerLabel: patientLabel(order.customer_id),
        amount: safeNumber(order.total),
        currency: order.currency || storeCurrency,
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
    pending: allPaymentRows.filter((row) => ["pending", "processing", "on-hold", "on_hold"].includes(row.paymentStatus)).length,
    rx: allPaymentRows.filter((row) => ["on_hold", "on-hold"].includes(row.rxStatus)).length,
    failed: allPaymentRows.filter((row) => ["failed", "cancelled", "refunded"].includes(row.paymentStatus)).length
  };

  const paymentRows = allPaymentRows.filter((row) => {
    if (paymentFilter === "completed") {
      return row.paymentStatus === "completed";
    }
    if (paymentFilter === "pending") {
      return ["pending", "processing", "on-hold", "on_hold"].includes(row.paymentStatus);
    }
    if (paymentFilter === "rx") {
      return ["on_hold", "on-hold"].includes(row.rxStatus);
    }
    if (paymentFilter === "failed") {
      return ["failed", "cancelled", "refunded"].includes(row.paymentStatus);
    }
    return true;
  });

  const paymentsPerPage = 10;
  const paymentPageCount = Math.max(1, Math.ceil(paymentRows.length / paymentsPerPage));
  const activePaymentPage = Math.min(paymentPage, paymentPageCount);
  const paginatedPaymentRows = paymentRows.slice((activePaymentPage - 1) * paymentsPerPage, activePaymentPage * paymentsPerPage);

  const allCustomerRows = (() => {
    const customerMap = new Map();

    (data.orderDetails || []).forEach((order) => {
      const key = order.customer_id || `guest-${order.billing?.email || order.number || order.id}`;
      const current = customerMap.get(key) || {
        id: key,
        label: patientLabel(order.customer_id),
        name: customerFullName(order),
        email: order.billing?.email || "No email on file",
        orders: 0,
        spend: 0,
        lastActivity: order.created_at || null,
        prescriptions: 0,
        appointments: 0
      };
      current.orders += 1;
      current.spend += safeNumber(order.total);
      if (!current.name || current.name === patientLabel(order.customer_id)) {
        current.name = customerFullName(order);
      }
      if (!current.email || current.email === "No email on file") {
        current.email = order.billing?.email || current.email;
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

  const consultationDoctorProfile = (data.doctors || []).find((doctor) => String(doctor.user_id || doctor.id) === String(consultationCreateForm.doctorUserId)) || (data.doctors || [])[0] || null;
  const consultationDoctorAppointments = (data.appointments || [])
    .filter((appointment) => String(appointment.doctor_user_id) === String(consultationDoctorProfile?.user_id || consultationDoctorProfile?.id || ""))
    .sort((a, b) => new Date(a.start_at || 0) - new Date(b.start_at || 0));
  const consultationCalendarDate = consultationCreateForm.startAt ? new Date(consultationCreateForm.startAt) : new Date();
  const consultationWeekStart = startOfWeek(consultationCalendarDate);
  const consultationPatientOptions = allCustomerRows.filter((row) => {
    if (!consultationPatientSearch.trim()) {
      return true;
    }
    return `${row.name} ${row.email} ${row.label} ${row.id}`.toLowerCase().includes(consultationPatientSearch.trim().toLowerCase());
  });
  const consultationCalendarDays = Array.from({ length: 7 }, (_, index) => addDays(consultationWeekStart, index));
  const consultationSelectedDayKey = normalizeDateKey(consultationCalendarDate);
  const consultationDayAppointments = consultationDoctorAppointments.filter((appointment) => normalizeDateKey(appointment.start_at) === consultationSelectedDayKey);
  const consultationVisiblePatientOptions = consultationPatientOptions.slice(0, 6);
  const consultationSelectedPatient = consultationPatientOptions.find((row) => String(row.id) === String(consultationCreateForm.patientUserId)) || null;

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
      currency: order.currency || storeCurrency,
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
    .filter((item) => item.group === consultationFilter)
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
              <button className="product-chip" key={`${field}-${value}`} type="button" onClick={() => toggleProductTerm(field, value)}>
                {value} <span aria-hidden="true">×</span>
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

          <div className="sidebar-card">
            <div className="sidebar-card-header">
              <div className="sidebar-orb" />
              <div>
                <strong>Operations Health</strong>
                <span>{formatNumber(rxHolds)} RX holds, {formatNumber(emailsSummary.failed_today || 0)} email failures today</span>
              </div>
            </div>
            <div className="sidebar-meter" aria-hidden="true">
              <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(18, 100 - emailFailureRate))}%` }} />
            </div>
            <button className="button-primary button-block" type="button" onClick={() => switchPage("audit")}>
              Open Audit Center
            </button>
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
              <button className="pill-button" type="button" onClick={() => (session.paired ? showAuthGate("auth") : router.push("/admin/storefront/setup"))}>
                <InlineIcon id="i-shield" />
                <span>{session.paired ? "Connection" : "Pair Storefront"}</span>
              </button>
              <span className={`sync-status ${syncStatus.mode}`.trim()}>{syncStatus.text}</span>
              <button className="pill-button" type="button" onClick={handleRefresh} disabled={!session.accessToken || refreshing}>
                <InlineIcon id="i-refresh-cw" />
                <span>{refreshing ? "Refreshing" : "Refresh"}</span>
              </button>
              <button className="pill-button" type="button" onClick={() => switchPage("consultations")}>
                <InlineIcon id="i-calendar" />
                <span>{formatTopbarDate()}</span>
              </button>
              <button className="icon-button" type="button" onClick={() => switchPage("audit")}><InlineIcon id="i-bell" /></button>
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
                    <div className="mini-stat"><span>Orders loaded</span><strong>{formatNumber(filteredOrders.length)}</strong><small>scoped by current search</small></div>
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
                      
                      <div className="order-queue-tabs" role="tablist" aria-label="Order queue filters">
                        {[
                          ["all", "All"],
                          ["needs_rx", "Needs RX"],
                          ["awaiting_payment", "Awaiting payment"],
                          ["doctor_follow_up", "Doctor follow-up"]
                        ].map(([key, label]) => (
                          <button
                            className={`pill-button order-queue-tab ${orderQueueFilter === key ? "active" : ""}`.trim()}
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
                          <th>Customer</th>
                          <th>Product mix</th>
                          <th>Prescription</th>
                          <th>Price</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length ? filteredOrders.map((order) => {
                          const prescription = (data.prescriptionDetails || []).find((item) => item.id === order.prescription_id);
                          return (
                            <tr
                              key={order.id}
                              className={`interactive-row ${selectedOrderId === order.id ? "active" : ""}`}
                              onClick={() => openOrderDetails(order.id)}
                            >
                              <td><div className="table-title"><strong>#{order.number}</strong><span className="muted">{formatDate(order.created_at, true)}</span></div></td>
                              <td>
                                <div className="table-customer-cell order-customer-cell">
                                  <strong>{customerSummary(order).name}</strong>
                                  <span>{customerSummary(order).email}</span>
                                </div>
                              </td>
                              <td>{(order.items || []).length ? `${order.items.length} items: ${(order.items || []).slice(0, 2).map((item) => item.name).join(", ")}` : "order details unavailable"}</td>
                              <td>{prescription ? `${prescription.prescription_number} • ${prescription.status}` : (order.prescription_id ? `Prescription #${order.prescription_id}` : "No linked prescription")}</td>
                              <td>{formatMoney(order.total || 0, order.currency || storeCurrency)}</td>
                              <td><StatusPill value={order.rx_status || order.status}>{order.rx_status || order.status}</StatusPill></td>
                              <td>
                                <div className="table-action-strip">
                                  <button className="icon-button table-action-button" type="button" title="Print receipt" aria-label={`Print receipt for order #${order.number}`} disabled={tableActionLoading === `print-${order.id}`} onClick={(event) => { event.stopPropagation(); printOrderReceiptFromRow(order); }}><InlineIcon id="i-printer" /></button>
                                  <button className="icon-button table-action-button" type="button" title="Send receipt" aria-label={`Send receipt for order #${order.number}`} disabled={tableActionLoading === `send-${order.id}`} onClick={(event) => { event.stopPropagation(); sendOrderReceiptFromRow(order); }}><InlineIcon id="i-mail" /></button>
                                  <button className="icon-button table-action-button" type="button" title="Change status" aria-label={`Change status for order #${order.number}`} disabled={tableActionLoading === `status-${order.id}`} onClick={(event) => { event.stopPropagation(); openOrderStatusFromRow(order); }}><InlineIcon id="i-refresh-cw" /></button>
                                  <button className="icon-button table-action-button danger" type="button" title="Delete order" aria-label={`Delete order #${order.number}`} disabled={tableActionLoading === `delete-${order.id}`} onClick={(event) => { event.stopPropagation(); deleteOrderFromRow(order); }}><InlineIcon id="i-trash" /></button>
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
                      <div className="mini-stat"><span>Completed payments</span><strong>{formatNumber(paymentRows.filter((row) => row.paymentStatus === "completed").length)}</strong><small>Processed Payments</small></div>
                      <div className="mini-stat"><span>Orders on hold</span><strong>{formatNumber(paymentRows.filter((row) => ["on_hold", "on-hold"].includes(row.rxStatus)).length)}</strong><small>Orders placed on hold</small></div>
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
                          ["completed", "Captured"],
                          ["pending", "Pending"],
                          ["rx", "RX blocked"],
                          ["failed", "Failed/Refunded"]
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
                        {paginatedPaymentRows.length ? paginatedPaymentRows.map((row) => (
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
                            <td className="amount-col">{formatMoney(row.amount, row.currency)}</td>
                            <td className="payment-col"><StatusPill value={row.paymentStatus}>{row.paymentStatus}</StatusPill></td>
                            <td className="rx-col"><StatusPill value={row.rxStatus}>{row.rxStatus}</StatusPill></td>
                            <td className="action-col">
                              <div className="table-action-strip">
                                <button className="icon-button table-action-button" type="button" title="Print receipt" aria-label={`Print receipt for order #${row.number}`} disabled={tableActionLoading === `print-${row.id}`} onClick={(event) => { event.stopPropagation(); printOrderReceiptFromRow(row.sourceOrder); }}><InlineIcon id="i-printer" /></button>
                                <button className="icon-button table-action-button" type="button" title="Download receipt" aria-label={`Download receipt for order #${row.number}`} disabled={tableActionLoading === `download-${row.id}`} onClick={(event) => { event.stopPropagation(); downloadOrderReceiptFromRow(row.sourceOrder); }}><InlineIcon id="i-download" /></button>
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
                            <td>{row.label}</td>
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
                        ["upcoming", "Upcoming"],
                        ["past", "Past"],
                        ["ongoing", "Ongoing"]
                      ].map(([key, label]) => (
                        <button className={`mini-stat clickable-stat ${consultationFilter === key ? "active" : ""}`} type="button" key={key} onClick={() => setConsultationFilter(key)}>
                          <span>{label}</span>
                          <strong>{formatNumber(consultationCounts[key] || 0)}</strong>
                          <small>{key === "past" ? "clickable when ended" : "locked until the consultation ends"}</small>
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
                      <button className="pill-button" type="button" onClick={() => setSelectedConsultationDate(isoDateKey())}>Today only</button>
                    </div>
                    <div className="consultation-list">
                      {consultationList.length ? consultationList.map((item) => {
                        const ended = item.group === "past";
                        return (
                          <button className="consultation-card" key={item.id} type="button" onClick={() => openConsultationDetails(item)}>
                            <div>
                              <strong>{patientLabel(item.patient_user_id)}</strong>
                              <span>{item.reason || item.type || "Consultation"}</span>
                            </div>
                            <div className="signal-meta">
                              <StatusPill value={item.group}>{formatStatusLabel(item.group)}</StatusPill>
                              <small>{formatDate(item.start_at, true)}</small>
                              <small>{doctorMap.get(item.doctor_user_id) || `Doctor #${item.doctor_user_id}`}</small>
                            </div>
                          </button>
                        );
                      }) : <div className="muted">No consultations match the selected status and date.</div>}
                    </div>
                  </article>

                  <article className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Calendar</p>
                        <h2>{new Date(`${selectedConsultationDate}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
                      </div>
                    </div>
                    <div className="calendar-widget">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
                      {calendarDays.map((day) => (
                        <button
                          className={`calendar-day ${day.muted ? "muted-day" : ""} ${day.active ? "active" : ""} ${day.hasAppointment ? "has-appointment" : ""}`}
                          type="button"
                          key={day.key}
                          onClick={() => setSelectedConsultationDate(day.key)}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
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
                        {filteredPrescriptions.length ? filteredPrescriptions.map((item) => (
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
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">All Products</p>
                      <h2>Pharmaceutical Products</h2>
                    </div>
                  </div>
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
                        {paginatedProducts.length ? paginatedProducts.map((product) => {
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
                        {filteredDoctors.length ? filteredDoctors.map((doctor) => {
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
                <section className="operations-grid single-page-grid">
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
                <section className="panel table-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Messaging</p>
                      <h2>Recent email log</h2>
                    </div>
                    <div className="toolbar">
                      <button className="pill-button" type="button">Assignment notices</button>
                      <button className="pill-button" type="button">Failures</button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Recipient</th>
                          <th>Template</th>
                          <th>Related object</th>
                          <th>Provider</th>
                          <th>Status</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmails.length ? filteredEmails.map((email, index) => (
                          <tr key={`${email.recipient_email}-${email.created_at || index}`}>
                            <td>{email.recipient_email}</td>
                            <td>{email.template_key || "custom"}</td>
                            <td>{email.related_object_type || "n/a"}{email.related_object_id ? ` #${email.related_object_id}` : ""}</td>
                            <td>{email.provider || "provider n/a"}</td>
                            <td><StatusPill value={email.status}>{email.status}</StatusPill></td>
                            <td>{formatDate(email.sent_at || email.failed_at || email.queued_at || email.created_at, true)}</td>
                          </tr>
                        )) : <tr><td colSpan="6" className="muted">No email log entries match the current search.</td></tr>}
                      </tbody>
                    </table>
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
                    <h2>Connection and session state</h2>
                    <p className="hero-text">This page keeps the operational frontend grounded in the paired WordPress environment without touching the auth screens.</p>
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
                    <strong>{[orderCreateForm.firstName, orderCreateForm.lastName].filter(Boolean).join(" ") || "Customer name"}</strong>
                    <span>{orderCreateForm.email || "customer@email.com"}</span>
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
                          {["pending", "processing", "on-hold", "completed"].map((status) => (
                            <option key={status} value={status}>{formatStatusLabel(status)}</option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="detail-field detail-field-wide">
                      <span>Assign Doctor</span>
                      <div className="select-wrap">
                        <select
                          value={orderCreateForm.doctorId}
                          onChange={(event) => setOrderCreateForm((prev) => ({ ...prev, doctorId: event.target.value }))}
                        >
                          <option value="">No doctor assigned</option>
                          {(data.doctors || []).map((doctor) => (
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
                      <h4>Line items</h4>
                    </div>
                    <span className="order-create-line-count">{orderCreateItems.length} item{orderCreateItems.length === 1 ? "" : "s"}</span>
                  </div>

                  <div className="table-scroll order-create-table-scroll">
                    <table className="order-create-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {orderCreateItems.length ? orderCreateItems.map((item, index) => {
                          const product = (data.products || []).find((entry) => String(entry.id) === String(item.productId)) || null;
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
                                  <div className="select-wrap">
                                    <select value={item.productId} onChange={(event) => updateOrderCreateItem(index, { productId: event.target.value })} required>
                                      <option value="">Select product</option>
                                      {(data.products || []).map((productOption) => (
                                        <option key={productOption.id} value={productOption.id}>
                                          {productOption.name || `Product #${productOption.id}`}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <span className="muted order-product-meta">
                                    {product ? getProductPriceLabel(product, storeCurrency) : "Choose a product"}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <input
                                  className="order-quantity-input"
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(event) => updateOrderCreateItem(index, { quantity: event.target.value })}
                                  required
                                />
                              </td>
                              <td>{product ? formatMoney(unitPrice, product.currency || storeCurrency) : "—"}</td>
                              <td>{product ? formatMoney(lineTotal, product.currency || storeCurrency) : "—"}</td>
                              <td>
                                <button
                                  className="icon-button subtle order-line-remove"
                                  type="button"
                                  aria-label={`Remove product line ${index + 1}`}
                                  onClick={() => removeOrderCreateItem(index)}
                                  disabled={orderCreateItems.length === 1}
                                >
                                  <InlineIcon id="i-x" />
                                </button>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan="5" className="muted">No products available.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <button className="pill-button order-line-add" type="button" onClick={addOrderCreateItem}>
                    <span className="order-line-add-icon">+</span>
                    Add product
                  </button>
                </section>
              </div>

              {orderCreateFeedback ? <p className="muted popup-support-copy">{orderCreateFeedback}</p> : null}
              <div className="stacked-order-popup-actions">
                <button className="pill-button" type="button" onClick={closeOrderCreateModal}>Cancel</button>
                <button className="button-primary" type="submit" disabled={orderCreateLoading || !(data.products || []).length || !orderCreateItems.length}>
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
            className={`panel order-detail-panel order-modal ${orderModalOpen ? "is-open" : "is-hidden"}`}
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
                    <button className="icon-button order-header-action-button" type="button" title="Print Invoice" aria-label="Print Invoice" onClick={printSelectedOrder}>
                      <InlineIcon id="i-printer" />
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title="Update Status" aria-label="Update Status" onClick={openOrderControlsPopup} disabled={orderMutationLoading}>
                      <InlineIcon id="i-package" />
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title="Refund" aria-label="Refund" onClick={refundSelectedOrder} disabled={orderMutationLoading}>
                      <InlineIcon id="i-refresh-cw" />
                    </button>
                    <button className="icon-button order-header-action-button" type="button" title="Contact Customer" aria-label="Contact Customer" onClick={contactSelectedCustomer}>
                      <InlineIcon id="i-mail" />
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
                      { label: "Total Amount", value: formatMoney(selectedOrderDetail.totals?.subtotal || 0, selectedOrderDetail.currency || storeCurrency), note: "item subtotal before adjustments" },
                      { label: "Items Count", value: formatNumber(itemQuantityTotal(selectedOrderDetail)), note: `${formatNumber(selectedOrderDetail.totals?.items_count || (selectedOrderDetail.items || []).length)} distinct line items` },
                      { label: "Shipping Fee", value: formatMoney((selectedOrderDetail.totals?.shipping_total || 0) + (selectedOrderDetail.totals?.shipping_tax || 0), selectedOrderDetail.currency || storeCurrency), note: "shipping and shipping tax" },
                      { label: "Discount", value: formatMoney(selectedOrderDetail.totals?.discount_total || 0, selectedOrderDetail.currency || storeCurrency), note: "line and order discounts" },
                      { label: "Tax/VAT", value: formatMoney(selectedOrderDetail.totals?.tax_total || 0, selectedOrderDetail.currency || storeCurrency), note: "tax across all items" },
                      { label: "Final Payable Amount", value: formatMoney(selectedOrderDetail.totals?.grand_total || selectedOrderDetail.total || 0, selectedOrderDetail.currency || storeCurrency), note: selectedOrderDetail.rx_status ? `RX: ${formatStatusLabel(selectedOrderDetail.rx_status)}` : "order grand total" }
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
                      <div className="detail-item-card"><strong>Email Address</strong><span className="muted">{selectedOrderDetail.billing?.email || "No email on file"}</span></div>
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
                            <td>{formatMoney(item.unit_price || 0, selectedOrderDetail.currency || storeCurrency)}</td>
                            <td>{formatMoney(item.discount_total || 0, selectedOrderDetail.currency || storeCurrency)}</td>
                            <td>{formatMoney(item.total || 0, selectedOrderDetail.currency || storeCurrency)}</td>
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
                    {["pending", "awaiting-doctor", "awaiting-prescription", "processing", "on-hold", "completed", "cancelled", "failed", "refunded"].map((status) => (
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
                <div className="select-wrap">
                  <select value={selectedOrderDoctorId} onChange={(event) => setSelectedOrderDoctorId(event.target.value)}>
                    <option value="">Select doctor</option>
                    {(data.doctors || []).map((doctor) => (
                      <option key={doctor.user_id} value={doctor.user_id}>{doctor.display_name}</option>
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

            <div className="receipt-command-bar">
              <div>
                <span>Total paid</span>
                <strong>{formatMoney(selectedPaymentReceipt.total || 0, selectedPaymentReceipt.currency || storeCurrency)}</strong>
              </div>
              <div className="receipt-command-actions">
                <button className="pill-button" type="button" onClick={printPaymentReceipt} disabled={Boolean(receiptActionLoading)}>
                  <InlineIcon id="i-printer" />
                  {receiptActionLoading === "print" ? "Preparing..." : "Print"}
                </button>
                <button className="button-primary receipt-send-button" type="button" onClick={sendPaymentReceipt} disabled={Boolean(receiptActionLoading) || !selectedPaymentReceipt.billing?.email}>
                  <InlineIcon id="i-mail" />
                  {receiptActionLoading === "send" ? "Sending..." : "Send Receipt"}
                </button>
              </div>
            </div>

            <div className="receipt-summary-grid receipt-summary-grid-redesign">
              <div className="mini-stat receipt-stat">
                <span>Customer</span>
                <strong>{customerFullName(selectedPaymentReceipt)}</strong>
                <small>{selectedPaymentReceipt.billing?.email || "No email on file"}</small>
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
                  <div className="detail-item-card"><strong>Email</strong><span className="muted">{selectedPaymentReceipt.billing?.email || "No email on file"}</span></div>
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
                  <div className="detail-item-card"><strong>Amount</strong><span className="muted">{formatMoney(selectedPaymentReceipt.total || 0, selectedPaymentReceipt.currency || storeCurrency)}</span></div>
                  <div className="detail-item-card"><strong>Order type</strong><span className="muted">{selectedPaymentReceipt.rx_status || "clear"}</span></div>
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
                          <span>{formatMoney(item.total || ((item.unit_price || 0) * Number(item.quantity || 0)), selectedPaymentReceipt.currency || storeCurrency)}</span>
                        </div>
                        <div className="receipt-line-item-meta">
                          <span>Qty {formatNumber(item.quantity || 0)}</span>
                          <span>{item.sku || "No SKU"}</span>
                          <span>{formatMoney(item.unit_price || 0, selectedPaymentReceipt.currency || storeCurrency)} each</span>
                        </div>
                      </div>
                    </div>
                  </article>
                )) : <div className="muted">No line items available on this receipt.</div>}
              </div>
            </div>

            {paymentReceiptFeedback ? <p className="receipt-feedback">{paymentReceiptFeedback}</p> : null}

            <div className="stacked-order-popup-actions receipt-footer-actions">
              <button className="pill-button" type="button" onClick={closePaymentReceiptModal}>Close</button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      {productEditForm && (selectedProductEdit || productEditorMode === "create") ? (
        <div className="app-modal-stack">
          <div className="app-modal-layer app-modal-layer-top is-open">
            <button className="app-modal-backdrop" type="button" aria-label="Close product editor" onClick={closeProductEditModal} />
            <section className="detail-section product-editor-popup product-editor-modal" role="dialog" aria-modal="true" aria-label={productEditorMode === "create" ? "Create product" : `Edit ${selectedProductEdit?.name || "product"}`}>
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
              <form onSubmit={submitGenericCreate}>
                <div className="panel-header stacked-order-popup-header">
                  <div>
                    <p className="section-kicker">Create record</p>
                    <h3>New {formatStatusLabel(createModalType)}</h3>
                  </div>
                  <button className="icon-button" type="button" aria-label="Close create form" onClick={closeCreateModal}><InlineIcon id="i-x" /></button>
                </div>

                {createModalType === "consultation" ? (
                  <div className="consultation-create-shell">
                    <aside className="consultation-calendar-panel">
                      <div className="consultation-calendar-header">
                        <div>
                          <p className="section-kicker">Doctor calendar</p>
                          <h4>{consultationDoctorProfile?.display_name || "Select a doctor"}</h4>
                        </div>
                        <div className="consultation-zoom-toggle" role="tablist" aria-label="Calendar zoom">
                          {["week", "day", "hour"].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={`pill-button ${consultationCalendarMode === mode ? "active" : ""}`}
                              onClick={() => setConsultationCalendarMode(mode)}
                            >
                              {mode === "week" ? "Week" : mode === "day" ? "Day" : "Hour"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="consultation-calendar-surface">
                        {consultationCalendarMode === "week" ? (
                          <div className="consultation-week-grid">
                            {consultationCalendarDays.map((day) => {
                              const dayKey = normalizeDateKey(day);
                              const dayItems = consultationDoctorAppointments.filter((appointment) => normalizeDateKey(appointment.start_at) === dayKey);
                              return (
                                <article className="consultation-day-column" key={dayKey}>
                                  <div className="consultation-day-head">
                                    <strong>{formatDayLabel(day)}</strong>
                                    <span>{dayItems.length} booked</span>
                                  </div>
                                  <div className="consultation-day-list">
                                    {dayItems.length ? dayItems.map((item) => (
                                      <div className="consultation-event-card" key={item.id}>
                                        <strong>{formatDate(item.start_at, true)}</strong>
                                        <span>{patientLabel(item.patient_user_id)}</span>
                                      </div>
                                    )) : <div className="consultation-empty-slot">Open</div>}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : null}

                        {consultationCalendarMode === "day" ? (
                          <div className="consultation-day-view">
                            <div className="consultation-day-head consultation-day-head-sticky">
                              <strong>{formatDayLabel(consultationCalendarDate)}</strong>
                              <span>{consultationDayAppointments.length} booked slots</span>
                            </div>
                            <div className="consultation-time-grid">
                              {Array.from({ length: 24 }, (_, hour) => {
                                const slotItems = consultationDayAppointments.filter((item) => new Date(item.start_at).getHours() === hour);
                                return (
                                  <div className="consultation-time-row" key={hour}>
                                    <span className="consultation-time-label">{formatHourLabel(hour)}</span>
                                    <div className="consultation-time-content">
                                      {slotItems.length ? slotItems.map((item) => (
                                        <div className="consultation-event-card" key={item.id}>
                                          <strong>{patientLabel(item.patient_user_id)}</strong>
                                          <span>{formatDate(item.start_at, true)}</span>
                                        </div>
                                      )) : <div className="consultation-empty-slot">Available</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {consultationCalendarMode === "hour" ? (
                          <div className="consultation-hour-view">
                            <div className="consultation-day-head consultation-day-head-sticky">
                              <strong>Hour view</strong>
                              <span>{consultationDayAppointments.length} bookings on selected day</span>
                            </div>
                            <div className="consultation-hour-grid">
                              {Array.from({ length: 24 }, (_, hour) => {
                                const slotItems = consultationDayAppointments.filter((item) => new Date(item.start_at).getHours() === hour);
                                return (
                                  <div className="consultation-hour-slot" key={hour}>
                                    <span>{formatHourLabel(hour)}</span>
                                    {slotItems.length ? slotItems.map((item) => (
                                      <article className="consultation-event-card" key={item.id}>
                                        <strong>{patientLabel(item.patient_user_id)}</strong>
                                        <span>{formatStatusLabel(item.status)}</span>
                                      </article>
                                    )) : <div className="consultation-empty-slot">No booking</div>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </aside>

                    <div className="consultation-form-panel">
                      <div className="consultation-doctor-banner">
                        <span>Selected doctor</span>
                        <strong>{consultationDoctorProfile?.display_name || "Choose a doctor"}</strong>
                        <small>{consultationDoctorAppointments.length} bookings visible</small>
                      </div>
                      <div className="detail-form-grid consultation-form-grid">
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
                              {consultationVisiblePatientOptions.length ? consultationVisiblePatientOptions.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className="consultation-search-result"
                                  onClick={() => {
                                    setConsultationCreateForm((prev) => ({ ...prev, patientUserId: String(option.id) }));
                                    setConsultationPatientSearch(option.name || option.label || option.email);
                                  }}
                                >
                                  <strong>{option.name || option.label}</strong>
                                  <span>{option.email}</span>
                                </button>
                              )) : <div className="consultation-search-empty">No matching customers.</div>}
                            </div>
                          </div>
                          <small className="product-field-note">{consultationSelectedPatient ? `Selected: ${consultationSelectedPatient.name} · ${consultationSelectedPatient.email}` : "Search and choose a patient from the list."}</small>
                        </label>
                        <label className="detail-field">
                          <span>Doctor</span>
                          <div className="select-wrap">
                            <select value={consultationCreateForm.doctorUserId} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, doctorUserId: event.target.value }))}>
                              <option value="">Select doctor</option>
                              {(data.doctors || []).map((doctor) => <option key={doctor.user_id || doctor.id} value={doctor.user_id || doctor.id}>{doctor.display_name}</option>)}
                            </select>
                          </div>
                        </label>
                        <label className="detail-field">
                          <span>Start time</span>
                          <input type="datetime-local" value={consultationCreateForm.startAt} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, startAt: event.target.value }))} required />
                        </label>
                        <label className="detail-field">
                          <span>End time</span>
                          <input type="datetime-local" value={consultationCreateForm.endAt} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, endAt: event.target.value }))} required />
                        </label>
                        <label className="detail-field">
                          <span>Type</span>
                          <div className="select-wrap">
                            <select value={consultationCreateForm.type} onChange={(event) => setConsultationCreateForm((prev) => ({ ...prev, type: event.target.value }))}>
                              <option value="video">Video</option>
                              <option value="phone">Phone</option>
                              <option value="in_person">In person</option>
                              <option value="async_form">Async form</option>
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
                            <span>Specialty</span>
                            <input value={doctorCreateForm.specialty} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, specialty: event.target.value }))} />
                          </label>
                          <label className="detail-field">
                            <span>Location</span>
                            <input value={doctorCreateForm.location} onChange={(event) => setDoctorCreateForm((prev) => ({ ...prev, location: event.target.value }))} />
                          </label>
                          <label className="detail-field">
                            <span>Product categories</span>
                            <select
                              multiple
                              value={doctorCreateForm.productCategoryIds}
                              onChange={(event) => setDoctorCreateForm((prev) => ({
                                ...prev,
                                productCategoryIds: Array.from(event.target.selectedOptions, (option) => option.value)
                              }))}
                            >
                              {(data.productCategories || []).map((category) => (
                                <option key={category.id} value={category.id}>{category.name}</option>
                              ))}
                            </select>
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
                  <button className="button-primary" type="submit" disabled={createLoading}>{createLoading ? "Submitting..." : "Create"}</button>
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
                  <input type="datetime-local" value={consultationDetailForm.startAt} onChange={(event) => setConsultationDetailForm((prev) => ({ ...prev, startAt: event.target.value }))} />
                </label>
                <label className="detail-field">
                  <span>Reschedule end</span>
                  <input type="datetime-local" value={consultationDetailForm.endAt} onChange={(event) => setConsultationDetailForm((prev) => ({ ...prev, endAt: event.target.value }))} />
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
              <div className="detail-section receipt-panel">
                <div className="panel-header"><div><p className="section-kicker">Prescriptions given</p><h3>Linked patient prescriptions</h3></div></div>
                <div className="history-list">
                  {(data.prescriptionDetails || []).filter((item) => Number(item.patient_user_id) === Number(selectedConsultation.patient_user_id)).map((item) => (
                    <article className="history-card" key={item.id}><strong>{item.prescription_number || `Prescription #${item.id}`}</strong><p>{item.diagnosis || "No diagnosis recorded"}</p><span>{formatStatusLabel(item.status)}</span></article>
                  ))}
                </div>
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
              {doctorDetailTab === "account" ? (
                <div className="detail-list">
                  <div className="detail-grid">
                    <div className="detail-block"><span>Email</span><strong>{selectedDoctorProfile.email || "n/a"}</strong></div>
                    <div className="detail-block"><span>Specialty</span><strong>{selectedDoctorProfile.specialty || "General practice"}</strong></div>
                    <div className="detail-block"><span>Location</span><strong>{selectedDoctorProfile.location || "Nevari network"}</strong></div>
                    <div className="detail-block"><span>Status</span><strong>{formatStatusLabel(getDoctorStatus(selectedDoctorProfile))}</strong></div>
                    <div className="detail-block customer-detail-wide"><span>Product categories</span><strong>{(selectedDoctorProfile.product_categories || []).map((item) => item.name).join(", ") || "No categories assigned"}</strong></div>
                  </div>
                  <div className="detail-section receipt-panel"><div className="panel-header"><div><p className="section-kicker">Linked patients</p><h3>Contacts</h3></div></div>{selectedDoctorPatients.length ? selectedDoctorPatients.map((patient) => <div className="signal-row" key={patient.id}><div><strong>{patient.name}</strong><span>{patient.email}</span></div><button className="pill-button" type="button">Unlink</button></div>) : <div className="muted">No linked patients found.</div>}</div>
                  <div className="toolbar"><button className="pill-button" type="button">Reset password</button><button className="pill-button danger" type="button">Suspend account</button><button className="pill-button" type="button">Other admin actions</button></div>
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
                        <p>Order {linkedOrder?.number ? `#${linkedOrder.number}` : "not linked"} - {patientLabel(item.patient_user_id)} - {formatMoney(linkedOrder?.total || 0, linkedOrder?.currency || storeCurrency)}</p>
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
                                <td>{formatMoney(order.total || 0, order.currency || storeCurrency)}</td>
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
                                <td>{formatMoney(product.total || 0, product.currency)}</td>
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
                        {authSubmitting ? "Signing in..." : "Sign In"}
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
                      <button className="auth-primary-button" type="submit" disabled={authSubmitting}>
                        {authSubmitting ? "Verifying..." : "Verify Code"}
                      </button>
                    </div>
                    <div className="auth-inline-links">
                      <button className="auth-text-link" type="button" onClick={() => setAuthView("login")}>
                        Back to login
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
                        {resetSubmitting ? "Submitting..." : "Send Reset Link"}
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
