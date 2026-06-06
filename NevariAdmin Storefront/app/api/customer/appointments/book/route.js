"use server";

import { NextResponse } from "next/server";
import {
  invalidNextJson,
  isAllowedUrl,
  isFutureDateTime,
  isValidEmail,
  isValidTimeKey,
  rejectUnknownFields,
  sanitizeText
} from "../../../../lib/inputValidation";

const CUSTOMER_FRONTEND_TYPE = "patient_dashboard";
const CSRF_COOKIE_NAME = "nevari_csrf";

function invalid(message, field) {
  return invalidNextJson(NextResponse, message, field);
}

function asText(value) {
  return String(value || "").trim();
}

function buildIso(date, time) {
  return `${date}T${time}:00`;
}

function requestCookie(request, name) {
  const fromNextRequest = request.cookies?.get?.(name)?.value;
  if (fromNextRequest) {
    return fromNextRequest;
  }
  const match = String(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function proxy(request, baseUrl, path, options = {}) {
  const endpoint = new URL("/api/nevari-proxy", request.url);
  endpoint.searchParams.set("baseUrl", String(baseUrl || "").replace(/\/+$/, ""));
  endpoint.searchParams.set("path", path);

  const csrf = request.headers.get("x-nevari-csrf") || requestCookie(request, CSRF_COOKIE_NAME);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Nevari-Frontend-Type": CUSTOMER_FRONTEND_TYPE,
    "X-Nevari-Frontend-Origin": endpoint.origin,
    Cookie: request.headers.get("cookie") || "",
    ...(csrf ? { "X-Nevari-CSRF": csrf } : {})
  };

  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const raw = await response.text().catch(() => "");
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return {
    ok: response.ok && data?.success !== false,
    status: response.status,
    data,
    raw: raw || ""
  };
}

function fallbackAppointment({ startAt, endAt, reason }) {
  return {
    id: `local-${Date.now()}`,
    doctor_user_id: 0,
    doctor_name: "Assigned doctor pending",
    doctor: {
      display_name: "Assigned doctor pending",
      specialty: "Consultation"
    },
    title: "Doctor Consultation",
    reason,
    start_at: startAt,
    end_at: endAt,
    duration_minutes: 30,
    status: "pending",
    payment_status: "pending",
    checkout_url: "",
    mock: true,
    pending_sync: true
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return invalid("Invalid request payload.", "payload");

  const unknownFieldError = rejectUnknownFields(body, [
    "doctorId",
    "doctorName",
    "doctorSpecialty",
    "date",
    "time",
    "reason",
    "selectedEpochMs",
    "clientNowMs",
    "customerEmail",
    "customerName",
    "baseUrl",
    "adminEmail",
    "appOrigin"
  ]);
  if (unknownFieldError) return invalid(unknownFieldError, "payload");

  const date = asText(body.date);
  const time = asText(body.time);
  const reason = sanitizeText(body.reason, { max: 500 });
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const baseUrl = asText(body.baseUrl);
  const selectedEpochMs = Number(body.selectedEpochMs);
  const clientNowMs = Number(body.clientNowMs);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid("Date is invalid.", "date");
  if (!isValidTimeKey(time)) return invalid("Time is invalid.", "time");
  if (reason.length < 3 || reason.length > 500) return invalid("Reason must be 3 to 500 characters.", "reason");
  if (customerEmail && !isValidEmail(customerEmail)) return invalid("Customer email is invalid.", "customerEmail");
  if (!isAllowedUrl(baseUrl)) return invalid("Backend URL is invalid.", "baseUrl");

  const startAt = buildIso(date, time);
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) {
    return invalid("Date/time is invalid.", "time");
  }

  const hasClientTimestamps = Number.isFinite(selectedEpochMs) && Number.isFinite(clientNowMs);
  if (hasClientTimestamps) {
    if (selectedEpochMs < (clientNowMs - 60_000)) {
      return invalid("Past date/time is not allowed.", "time");
    }
  } else if (!isFutureDateTime(date, time)) {
    return invalid("Past date/time is not allowed.", "time");
  }

  const endDate = new Date(startDate.getTime() + (30 * 60 * 1000));
  const endAt = `${date}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;

  let createResponse = await proxy(request, baseUrl, "/appointments", {
    method: "POST",
    body: {
      start_at: startAt,
      end_at: endAt,
      duration_minutes: 30,
      reason,
      type: "video",
      timezone: "Africa/Lagos"
    }
  });

  if (!createResponse.ok) {
    createResponse = await proxy(request, baseUrl, "/appointments", {
      method: "POST",
      body: {
        start_at: startAt,
        end_at: endAt,
        reason,
        type: "video"
      }
    });
  }

  if (!createResponse.ok) {
    if (createResponse.status >= 500) {
      return NextResponse.json({
        ok: true,
        degraded: true,
        appointment: fallbackAppointment({ startAt, endAt, reason }),
        meeting: { url: "" },
        warning: "The appointment server is temporarily unavailable. The appointment was added locally as pending sync.",
        upstream_status: createResponse.status,
        emailDispatch: {
          customer: { sent: false, status: createResponse.status, skipped: true },
          admin: { sent: false, status: createResponse.status, skipped: true },
          reminders: []
        }
      });
    }

    return NextResponse.json({
      ok: false,
      error: { message: "Unable to create appointment." },
      upstream: createResponse.data,
      upstream_status: createResponse.status,
      upstream_raw: createResponse.raw?.slice(0, 1200) || null
    }, { status: 502 });
  }

  const created = createResponse.data?.appointment || createResponse.data?.data || createResponse.data;
  const appointmentId = created?.id;

  let checkoutData = null;
  if (appointmentId) {
    const checkout = await proxy(request, baseUrl, `/appointments/${appointmentId}/checkout`);
    if (checkout.ok) {
      checkoutData = checkout.data;
    }
  }

  return NextResponse.json({
    ok: true,
    appointment: {
      ...created,
      checkout_url: checkoutData?.payment_url || created?.checkout_url || "",
      payment_status: checkoutData?.payment_status || created?.payment_status || "pending",
      status: created?.status || "awaiting_payment"
    },
    meeting: { url: "" },
    emailDispatch: {
      customer: { sent: false, status: 0, deferred: true },
      admin: { sent: false, status: 0, deferred: true },
      reminders: []
    }
  });
}
