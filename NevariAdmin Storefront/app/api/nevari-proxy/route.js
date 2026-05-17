const API_NAMESPACE = "nevari/v1";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigins() {
  return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeBaseUrl(value))
    .filter(Boolean);
}

function isPrivateHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.startsWith("10.")
    || normalized.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || normalized.startsWith("169.254.");
}

function assertAllowedTarget(target) {
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Unsupported protocol.");
  }
  if (target.username || target.password) {
    throw new Error("Credentials in target URLs are not allowed.");
  }
  if (isPrivateHostname(target.hostname)) {
    throw new Error("Private network targets are not allowed.");
  }

  const allowlist = allowedOrigins();
  if (!allowlist.length) {
    throw new Error("Proxy allowlist is not configured.");
  }
  if (!allowlist.includes(target.origin)) {
    throw new Error("Target origin is not allowed.");
  }
}

function buildTargetUrl(requestUrl) {
  const url = new URL(requestUrl);
  const baseUrl = normalizeBaseUrl(url.searchParams.get("baseUrl"));
  const path = String(url.searchParams.get("path") || "").trim();

  if (!baseUrl) {
    throw new Error("Missing baseUrl.");
  }
  if (!path) {
    throw new Error("Missing path.");
  }

  const target = new URL(`${baseUrl}/wp-json/${API_NAMESPACE}${path}`);
  assertAllowedTarget(target);
  url.searchParams.forEach((value, key) => {
    if (key === "baseUrl" || key === "path") {
      return;
    }
    target.searchParams.set(key, value);
  });

  return target;
}

async function proxyRequest(request, { params } = {}) {
  const targetUrl = buildTargetUrl(request.url);
  const headers = new Headers();

  const forwardedHeaders = [
    "accept",
    "authorization",
    "content-type",
    "x-nevari-frontend-type",
    "x-nevari-frontend-origin"
  ];

  forwardedHeaders.forEach((name) => {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  });

  const init = {
    method: request.method,
    headers
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const response = await fetch(targetUrl, init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.set("Cache-Control", "no-store");

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const rawBody = await response.text();
    return Response.json(
      {
        success: false,
        error: {
          code: "upstream_non_json_response",
          message: htmlToTextMessage(rawBody) || `WordPress returned ${response.status} for ${targetUrl.pathname}.`,
          details: {
            status: response.status,
            statusText: response.statusText,
            path: targetUrl.pathname,
            upstream: `${targetUrl.origin}${targetUrl.pathname}`
          }
        }
      },
      { status: response.status || 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export async function GET(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: error?.message || "Proxy request failed." } },
      { status: 400 }
    );
  }
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
