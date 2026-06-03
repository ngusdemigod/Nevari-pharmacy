import { createHmac } from "node:crypto";
import { isAllowedUrl, sanitizeText } from "../../../lib/inputValidation";

const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;
const SESSION_MARKER = "server-session";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigins() {
  return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeBaseUrl(value))
    .filter(Boolean);
}

function cookieName(frontendType) {
  return `nevari_access_${String(frontendType || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`;
}

function requestCookie(request, name) {
  const fromNextRequest = request.cookies?.get?.(name)?.value;
  if (fromNextRequest) return fromNextRequest;
  const match = String(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function assertFrontendRequest(request) {
  const requestOrigin = new URL(request.url).origin;
  const frontendOrigin = normalizeBaseUrl(request.headers.get("x-nevari-frontend-origin"));
  const origin = normalizeBaseUrl(request.headers.get("origin"));
  if (!frontendOrigin || frontendOrigin !== requestOrigin || (origin && origin !== requestOrigin)) {
    throw new Error("Same-origin frontend request is required.");
  }
}

function signedFrontendHeaders(request) {
  const secret = String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
  const frontendType = String(request.headers.get("x-nevari-frontend-type") || "").trim();
  if (!secret) {
    throw new Error("Proxy signing secret is not configured.");
  }
  if (!frontendType) {
    return {};
  }
  const frontendOrigin = new URL(request.url).origin;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${timestamp}\n${frontendType}\n${frontendOrigin}`;
  return {
    "x-nevari-frontend-type": frontendType,
    "x-nevari-frontend-origin": frontendOrigin,
    "x-nevari-proxy-timestamp": timestamp,
    "x-nevari-proxy-signature": createHmac("sha256", secret).update(message).digest("hex")
  };
}

function assertAllowedTarget(target) {
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Unsupported protocol.");
  }

  const allowlist = allowedOrigins();
  if (!allowlist.length || !allowlist.includes(target.origin)) {
    throw new Error("Target origin is not allowed.");
  }
}

function buildTarget(baseUrl, path, params = {}) {
  const target = new URL(`${normalizeBaseUrl(baseUrl)}/wp-json/${API_NAMESPACE}${path}`);
  assertAllowedTarget(target);
  Object.entries(params).forEach(([key, value]) => {
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key) || String(value).length > 120 || /[<>{}`]/.test(String(value))) {
      throw new Error("Invalid query parameter.");
    }
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, sanitizeText(value, { max: 120 }));
    }
  });
  return target;
}

async function upstreamJson(request, baseUrl, path, params = {}) {
  const headers = new Headers();
  ["accept"].forEach((name) => {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  });
  const frontendType = String(request.headers.get("x-nevari-frontend-type") || "").trim();
  const accessToken = requestCookie(request, cookieName(frontendType));
  const requestedAuthorization = String(request.headers.get("authorization") || "");
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  } else if (requestedAuthorization && requestedAuthorization !== `Bearer ${SESSION_MARKER}`) {
    headers.set("authorization", requestedAuthorization);
  }
  Object.entries(signedFrontendHeaders(request)).forEach(([name, value]) => headers.set(name, value));

  const response = await fetch(buildTarget(baseUrl, path, params), {
    headers,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && !payload.success)) {
    return { error: payload || { success: false, error: { message: response.statusText } }, status: response.status };
  }
  return { payload };
}

function buildMostSoldProducts(orders = []) {
  const quantities = new Map();
  orders.forEach((order) => {
    const status = String(order?.status || "").toLowerCase();
    if (["cancelled", "failed", "refunded", "trash"].includes(status)) {
      return;
    }
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item) => {
      const quantity = Number(item?.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return;
      }
      const key = String(item?.product_id || item?.id || item?.sku || item?.name || "").trim();
      if (!key) {
        return;
      }
      const name = item?.name || `Product #${item?.product_id || item?.id || "n/a"}`;
      const existing = quantities.get(key) || { key, name, quantity: 0 };
      existing.quantity += quantity;
      quantities.set(key, existing);
    });
  });
  return [...quantities.values()]
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 5);
}

export async function GET(request) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const baseUrl = normalizeBaseUrl(url.searchParams.get("baseUrl"));
    if (!baseUrl || !isAllowedUrl(baseUrl, allowedOrigins())) {
      return Response.json({ success: false, error: { message: "Missing baseUrl." } }, { status: 400 });
    }

    const [dashboardResult, recentOrdersResult, ordersForMetricsResult] = await Promise.all([
      upstreamJson(request, baseUrl, "/dashboard/store-admin"),
      upstreamJson(request, baseUrl, "/orders", { per_page: 5, page: 1 }),
      upstreamJson(request, baseUrl, "/orders", { per_page: 100, page: 1 })
    ]);

    const firstError = [dashboardResult, recentOrdersResult, ordersForMetricsResult].find((result) => result.error);
    if (firstError) {
      return Response.json(firstError.error, { status: firstError.status || 502 });
    }

    const ordersForMetrics = ordersForMetricsResult.payload?.data || [];
    const mostSoldProducts = buildMostSoldProducts(ordersForMetrics);
    const dashboardData = dashboardResult.payload?.data || {};

    return Response.json(
      {
        success: true,
        data: {
          dashboard: {
            ...dashboardData,
            products_metrics: {
              ...(dashboardData.products_metrics || {}),
              most_sold_products: mostSoldProducts
            }
          },
          recent_orders: recentOrdersResult.payload?.data || []
        }
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120"
        }
      }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Summary request failed." } },
      { status: 400 }
    );
  }
}
