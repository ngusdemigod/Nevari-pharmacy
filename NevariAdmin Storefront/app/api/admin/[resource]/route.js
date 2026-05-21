const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;

const RESOURCE_PATHS = {
  orders: "/orders",
  products: "/products",
  customers: "/customers",
  categories: "/products/categories",
  tags: "/products/tags",
  appointments: "/appointments",
  prescriptions: "/prescriptions",
  doctors: "/doctors",
  emails: "/emails/logs",
  audit: "/audit-logs"
};

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

export async function GET(request, context) {
  try {
    const params = await context.params;
    const resource = String(params?.resource || "");
    const upstreamPath = RESOURCE_PATHS[resource];
    if (!upstreamPath) {
      return Response.json({ success: false, error: { message: "Unknown admin resource." } }, { status: 404 });
    }

    const requestUrl = new URL(request.url);
    const baseUrl = normalizeBaseUrl(requestUrl.searchParams.get("baseUrl"));
    if (!baseUrl) {
      return Response.json({ success: false, error: { message: "Missing baseUrl." } }, { status: 400 });
    }

    const target = new URL(`${baseUrl}/wp-json/${API_NAMESPACE}${upstreamPath}`);
    assertAllowedTarget(target);
    requestUrl.searchParams.forEach((value, key) => {
      if (key !== "baseUrl") {
        target.searchParams.set(key, value);
      }
    });

    const headers = new Headers();
    ["accept", "authorization", "x-nevari-frontend-type", "x-nevari-frontend-origin"].forEach((name) => {
      const value = request.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    });

    const response = await fetch(target, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Admin resource request failed." } },
      { status: 400 }
    );
  }
}
