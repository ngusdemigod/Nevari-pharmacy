const API_NAMESPACE = "nevari/v1";
const UPSTREAM_TIMEOUT_MS = 30000;
const UPSTREAM_RETRY_COUNT = 1;
const SOFT_FAIL_TIMEOUT_MS = 8000;
const SOFT_FAIL_RETRY_COUNT = 0;
const inflightGetRequests = new Map();

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
    if (key === "baseUrl" || key === "path" || key === "softFail") {
      return;
    }
    target.searchParams.set(key, value);
  });

  return target;
}

function shouldSoftFail(requestUrl) {
  const url = new URL(requestUrl);
  return url.searchParams.get("softFail") === "1";
}

function softFailStatus(status) {
  return Number(status) >= 500;
}

function withSoftFailStatus(status, softFail) {
  return softFail && softFailStatus(status) ? 200 : status;
}

async function proxyRequest(request, { params } = {}) {
  const targetUrl = buildTargetUrl(request.url);
  const softFail = shouldSoftFail(request.url);
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

  let response;
  try {
    response = await fetchWithDedupe(targetUrl, init, request.method, request.headers.get("authorization"), softFail);
  } catch (error) {
    return buildTransportErrorResponse(error, targetUrl, softFail);
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.set("Cache-Control", "no-store");

  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("text/calendar")) {
    return new Response(response.body, {
      status: withSoftFailStatus(response.status, softFail),
      statusText: response.statusText,
      headers: responseHeaders
    });
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    const rawBody = await response.text();
    const recoveredJson = extractJsonPayload(rawBody);

    if (recoveredJson) {
      return Response.json(recoveredJson, {
        status: withSoftFailStatus(response.status, softFail),
        headers: { "Cache-Control": "no-store" }
      });
    }

    const message = normalizeUpstreamErrorMessage(rawBody, response, targetUrl);
    return Response.json(
      {
        success: false,
        error: {
          code: response.status === 503 ? "upstream_unavailable" : "upstream_non_json_response",
          message,
          details: {
            status: response.status,
            statusText: response.statusText,
            path: targetUrl.pathname,
            upstream: `${targetUrl.origin}${targetUrl.pathname}`
          }
        }
      },
      { status: withSoftFailStatus(response.status || 502, softFail), headers: { "Cache-Control": "no-store" } }
    );
  }

  return new Response(response.body, {
    status: withSoftFailStatus(response.status, softFail),
    statusText: response.statusText,
    headers: responseHeaders
  });
}

async function fetchWithDedupe(targetUrl, init, method, authorization = "", softFail = false) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    return fetchWithRetry(targetUrl, init, method, softFail);
  }

  const dedupeKey = `${normalizedMethod}:${targetUrl.toString()}:${authorization || ""}:${softFail ? "soft" : "hard"}`;
  if (inflightGetRequests.has(dedupeKey)) {
    return inflightGetRequests.get(dedupeKey);
  }

  const requestPromise = fetchWithRetry(targetUrl, init, method, softFail).finally(() => {
    inflightGetRequests.delete(dedupeKey);
  });
  inflightGetRequests.set(dedupeKey, requestPromise);
  return requestPromise;
}

async function fetchWithRetry(targetUrl, init, method, softFail = false) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const timeoutMs = softFail ? SOFT_FAIL_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS;
  const retryCount = softFail ? SOFT_FAIL_RETRY_COUNT : UPSTREAM_RETRY_COUNT;
  const maxAttempts = ["GET", "HEAD"].includes(normalizedMethod) ? retryCount + 1 : 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(targetUrl, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      lastError = error;
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      if (!isTimeout || attempt >= maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  throw lastError;
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

export async function PUT(request) {
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

function extractJsonPayload(value) {
  const text = String(value || "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function normalizeUpstreamErrorMessage(rawBody, response, targetUrl) {
  const text = htmlToTextMessage(rawBody);

  if (response.status === 503) {
    return "The pharmacy server is temporarily unavailable. Dashboard data could not be refreshed right now.";
  }

  return text || `WordPress returned ${response.status} for ${targetUrl.pathname}.`;
}

function buildTransportErrorResponse(error, targetUrl, softFail = false) {
  const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
  const status = isTimeout ? 504 : 502;

  return Response.json(
    {
      success: false,
      error: {
        code: isTimeout ? "upstream_timeout" : "upstream_unreachable",
        message: isTimeout
          ? "The pharmacy server took too long to respond. Try again shortly."
          : "The pharmacy server could not be reached. Verify the site is online and reachable from this storefront.",
        details: {
          status,
          path: targetUrl.pathname,
          upstream: `${targetUrl.origin}${targetUrl.pathname}`
        }
      }
    },
    { status: withSoftFailStatus(status, softFail), headers: { "Cache-Control": "no-store" } }
  );
}
