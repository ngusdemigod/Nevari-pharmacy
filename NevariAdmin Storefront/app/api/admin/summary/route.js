const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigins() {
  return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeBaseUrl(value))
    .filter(Boolean);
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
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, String(value));
    }
  });
  return target;
}

async function upstreamJson(request, baseUrl, path, params = {}) {
  const headers = new Headers();
  ["accept", "authorization", "x-nevari-frontend-type", "x-nevari-frontend-origin"].forEach((name) => {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  });

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

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const baseUrl = normalizeBaseUrl(url.searchParams.get("baseUrl"));
    if (!baseUrl) {
      return Response.json({ success: false, error: { message: "Missing baseUrl." } }, { status: 400 });
    }

    const [dashboardResult, recentOrdersResult] = await Promise.all([
      upstreamJson(request, baseUrl, "/dashboard/store-admin"),
      upstreamJson(request, baseUrl, "/orders", { per_page: 5, page: 1 })
    ]);

    const firstError = [dashboardResult, recentOrdersResult].find((result) => result.error);
    if (firstError) {
      return Response.json(firstError.error, { status: firstError.status || 502 });
    }

    return Response.json(
      {
        success: true,
        data: {
          dashboard: dashboardResult.payload?.data || {},
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
