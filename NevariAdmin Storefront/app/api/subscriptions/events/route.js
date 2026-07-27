import { getLastSubscriptionEvent, subscribeSubscriptionEvents } from "../_hub";

const encoder = new TextEncoder();
const PATIENT_FRONTEND_TYPE = "patient_dashboard";
const ADMIN_FRONTEND_TYPE = "storefront";

function cookieName(type = PATIENT_FRONTEND_TYPE) {
  return `nevari_access_${String(type || PATIENT_FRONTEND_TYPE).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
}

function requestCookie(request, name) {
  const match = String(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function resolveSessionUser(baseUrl, accessToken, request, frontendType = PATIENT_FRONTEND_TYPE) {
  if (!baseUrl || !accessToken) {
    return null;
  }
  const proxyUrl = new URL("/api/nevari-proxy", request.url);
  proxyUrl.searchParams.set("baseUrl", baseUrl);
  proxyUrl.searchParams.set("path", "/auth/me");
  const response = await fetch(proxyUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Nevari-Frontend-Type": frontendType,
      "X-Nevari-Frontend-Origin": new URL(request.url).origin,
      cookie: request.headers.get("cookie") || "",
      ...(request.headers.get("x-nevari-csrf") ? { "X-Nevari-CSRF": request.headers.get("x-nevari-csrf") } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json().catch(() => null);
  return payload?.success ? payload.data?.user || null : null;
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const baseUrl = String(url.searchParams.get("baseUrl") || "").trim().replace(/\/+$/, "");
  const frontendType = [PATIENT_FRONTEND_TYPE, ADMIN_FRONTEND_TYPE].includes(String(url.searchParams.get("frontendType") || "").trim())
    ? String(url.searchParams.get("frontendType") || "").trim()
    : PATIENT_FRONTEND_TYPE;
  const accessToken = requestCookie(request, cookieName(frontendType));
  const user = await resolveSessionUser(baseUrl, accessToken, request, frontendType);
  const userId = String(user?.id || "").trim();

  if (!userId) {
    return Response.json({ success: false, error: { message: "Unauthorized subscription stream." } }, { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk) => controller.enqueue(encoder.encode(chunk));
      write("event: ready\n");
      write(`data: ${JSON.stringify({ ok: true })}\n\n`);

      const unsubscribe = subscribeSubscriptionEvents(userId, (event) => {
        write("event: subscription\n");
        write(`data: ${JSON.stringify(event)}\n\n`);
      });

      const lastEvent = getLastSubscriptionEvent(userId);
      if (lastEvent) {
        write("event: subscription\n");
        write(`data: ${JSON.stringify(lastEvent)}\n\n`);
      }

      const heartbeat = setInterval(() => {
        write(": keep-alive\n\n");
      }, 25000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream may already be closed
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
