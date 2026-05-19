export const ADMIN_API_PREFIX = "/api/admin";
export const PROXY_API_PREFIX = "/api/nevari-proxy";

export function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function compactParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function buildQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(compactParams(params))
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => search.set(key, String(value)));
  return search.toString();
}

export function buildAdminListKey(resource, params = {}) {
  const query = buildQueryString(params);
  return `${ADMIN_API_PREFIX}/${resource}${query ? `?${query}` : ""}`;
}

export function buildProxyMutationKey(path, params = {}) {
  const query = buildQueryString({ path, ...params });
  return `${PROXY_API_PREFIX}${query ? `?${query}` : ""}`;
}

export const swrKeys = {
  admin: {
    summary: (params = {}) => buildAdminListKey("summary", params),
    orders: (params = {}) => buildAdminListKey("orders", params),
    products: (params = {}) => buildAdminListKey("products", params),
    productSummary: (params = {}) => buildAdminListKey("products/summary", params),
    categories: (params = {}) => buildAdminListKey("categories", params),
    tags: (params = {}) => buildAdminListKey("tags", params),
    customers: (params = {}) => buildAdminListKey("customers", params),
    appointments: (params = {}) => buildAdminListKey("appointments", params),
    prescriptions: (params = {}) => buildAdminListKey("prescriptions", params),
    doctors: (params = {}) => buildAdminListKey("doctors", params),
    emails: (params = {}) => buildAdminListKey("emails", params),
    audit: (params = {}) => buildAdminListKey("audit", params)
  },
  proxy: {
    path: (path, params = {}) => buildProxyMutationKey(path, params)
  }
};

export function withBaseUrl(session, params = {}) {
  return {
    baseUrl: normalizeBaseUrl(session?.baseUrl),
    ...params
  };
}

export function isAdminCacheKey(resource) {
  const prefix = `${ADMIN_API_PREFIX}/${resource}`;
  return (key) => typeof key === "string" && key.startsWith(prefix);
}

export function isProxyPathKey(path) {
  return (key) => {
    if (typeof key !== "string" || !key.startsWith(PROXY_API_PREFIX)) {
      return false;
    }
    try {
      const url = new URL(key, "http://localhost");
      return url.searchParams.get("path") === path;
    } catch {
      return key.includes(`path=${encodeURIComponent(path)}`);
    }
  };
}

export function isProxyPathPrefix(prefix) {
  return (key) => {
    if (typeof key !== "string" || !key.startsWith(PROXY_API_PREFIX)) {
      return false;
    }
    try {
      const url = new URL(key, "http://localhost");
      return String(url.searchParams.get("path") || "").startsWith(prefix);
    } catch {
      return key.includes(`path=${encodeURIComponent(prefix)}`);
    }
  };
}

export const isProductListKey = isAdminCacheKey("products");
export const isProductCategoryListKey = isAdminCacheKey("categories");
export const isProductTagListKey = isAdminCacheKey("tags");
export const isOrderListKey = isAdminCacheKey("orders");
export const isCustomerListKey = isAdminCacheKey("customers");
export const isAppointmentListKey = isAdminCacheKey("appointments");
export const isDoctorListKey = isAdminCacheKey("doctors");
export const isAdminSummaryKey = isAdminCacheKey("summary");

export const isProxyOrdersKey = isProxyPathKey("/orders");
export const isProxyAppointmentsKey = isProxyPathKey("/appointments");
export const isProxyDoctorsKey = isProxyPathKey("/doctors");
export const isProxyDoctorPathKey = isProxyPathPrefix("/doctors/");
export const isProxyDashboardDoctorKey = isProxyPathKey("/dashboard/doctor");
