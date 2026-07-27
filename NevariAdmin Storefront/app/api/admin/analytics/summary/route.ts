import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPostHogAnalytics } from "../../../../lib/posthog-analytics.server";
import type { AnalyticsRange, CommerceAnalytics } from "../../../../lib/analytics-types";

const RANGES = new Set<AnalyticsRange>(["7d", "30d", "90d"]);
const SORTS = new Set(["sales", "purchases"]);
const ALLOWED_PARAMS = new Set(["baseUrl", "range", "compare", "sort", "page", "per_page"]);

function normalizeBaseUrl(value: string | null) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function allowedOrigins() {
  return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "").split(",").map(normalizeBaseUrl).filter(Boolean);
}

function requestCookie(request: NextRequest, name: string) {
  return request.cookies.get(name)?.value || "";
}

function frontendType(request: NextRequest) {
  return String(request.headers.get("x-nevari-frontend-type") || "storefront").replace(/[^a-z0-9_-]/gi, "_");
}

function signedHeaders(request: NextRequest) {
  const secret = String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
  if (!secret) throw new Error("Proxy signing secret is not configured.");
  const origin = new URL(request.url).origin;
  const type = frontendType(request);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}\n${type}\n${origin}`).digest("hex");
  return {
    "x-nevari-frontend-type": type,
    "x-nevari-frontend-origin": origin,
    "x-nevari-proxy-timestamp": timestamp,
    "x-nevari-proxy-signature": signature,
  };
}

function safeInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => !ALLOWED_PARAMS.has(key))) {
      return NextResponse.json({ success: false, error: { message: "Unsupported analytics parameter." } }, { status: 400 });
    }
    const baseUrl = normalizeBaseUrl(url.searchParams.get("baseUrl"));
    if (!baseUrl || !allowedOrigins().includes(new URL(baseUrl).origin)) {
      return NextResponse.json({ success: false, error: { message: "Invalid storefront connection." } }, { status: 400 });
    }
    const rangeValue = String(url.searchParams.get("range") || "30d");
    if (!RANGES.has(rangeValue as AnalyticsRange)) {
      return NextResponse.json({ success: false, error: { message: "Invalid date range." } }, { status: 400 });
    }
    const range = rangeValue as AnalyticsRange;
    const compareValue = String(url.searchParams.get("compare") || "1");
    if (!["0", "1"].includes(compareValue)) {
      return NextResponse.json({ success: false, error: { message: "Invalid comparison value." } }, { status: 400 });
    }
    const sort = String(url.searchParams.get("sort") || "sales");
    if (!SORTS.has(sort)) {
      return NextResponse.json({ success: false, error: { message: "Invalid product sort." } }, { status: 400 });
    }
    const page = safeInteger(url.searchParams.get("page"), 1, 1, 1000);
    const perPage = safeInteger(url.searchParams.get("per_page"), 10, 5, 25);
    const compare = compareValue === "1";
    const type = frontendType(request);
    const accessToken = requestCookie(request, `nevari_access_${type}`);
    if (!accessToken) {
      return NextResponse.json({ success: false, error: { message: "Authentication required." } }, { status: 401 });
    }

    const upstream = new URL(`${baseUrl}/wp-json/nevari/v1/dashboard/store-admin/analytics`);
    upstream.searchParams.set("range", range);
    upstream.searchParams.set("compare", compareValue);
    upstream.searchParams.set("sort", sort);
    upstream.searchParams.set("page", String(page));
    upstream.searchParams.set("per_page", String(perPage));
    const commerceResponse = await fetch(upstream, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...signedHeaders(request) },
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 120 },
    });
    const commercePayload = await commerceResponse.json().catch(() => null);
    if (!commerceResponse.ok || !commercePayload?.success) {
      const status = commerceResponse.status === 401 || commerceResponse.status === 403 ? commerceResponse.status : 502;
      return NextResponse.json(
        { success: false, error: { message: status === 403 ? "Analytics access is not permitted." : status === 401 ? "Authentication required." : "Commerce analytics is temporarily unavailable." } },
        { status }
      );
    }

    // Query PostHog only after Pharmacy Core has independently authorized this session.
    const growth = await getPostHogAnalytics(range, compare);
    const commerce = commercePayload.data as CommerceAnalytics;
    return NextResponse.json(
      {
        success: true,
        data: { range, compare, generated_at: new Date().toISOString(), growth, commerce },
      },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240", "X-Content-Type-Options": "nosniff" } }
    );
  } catch {
    return NextResponse.json({ success: false, error: { message: "Analytics is temporarily unavailable." } }, { status: 503 });
  }
}
