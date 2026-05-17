const API_NAMESPACE = "nevari/v1";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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
      { success: false, error: { message: "Proxy request failed." } },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: "Proxy request failed." } },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    return await proxyRequest(request);
  } catch (error) {
    return Response.json(
      { success: false, error: { message: "Proxy request failed." } },
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
