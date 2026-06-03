import { NextResponse } from "next/server";
import {
  escapeHtml,
  invalidNextJson,
  isAllowedUrl,
  isFutureDateTime,
  isValidEmail,
  isValidId,
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

function isAllowedAppOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(text)) return true;
  return isAllowedUrl(text);
}

function fallbackAppointment({ doctorId, doctorName, doctorSpecialty, startAt, endAt, reason }) {
  return {
    id: `local-${Date.now()}`,
    doctor_user_id: Number(doctorId) || doctorId,
    doctor_name: doctorName || "Doctor",
    doctor: {
      display_name: doctorName || "Doctor",
      specialty: doctorSpecialty || "General Physician"
    },
    title: "Doctor Consultation",
    reason,
    start_at: startAt,
    end_at: endAt,
    duration_minutes: 30,
    status: "pending",
    meeting_url: "",
    mock: true,
    pending_sync: true
  };
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

async function sendEmail(request, baseUrl, payload) {
  try {
    const response = await proxy(request, baseUrl, "/emails/send", { method: "POST", body: payload });
    return { sent: response.ok, status: response.status };
  } catch {
    return { sent: false, status: 0 };
  }
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

  const doctorId = sanitizeText(body.doctorId, { max: 80 });
  const doctorName = sanitizeText(body.doctorName, { max: 120 });
  const doctorSpecialty = sanitizeText(body.doctorSpecialty || "General Physician", { max: 120 });
  const date = asText(body.date);
  const time = asText(body.time);
  const reason = sanitizeText(body.reason, { max: 500 });
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const customerName = sanitizeText(body.customerName || "Customer", { max: 120 });
  const baseUrl = asText(body.baseUrl);
  const adminEmail = sanitizeText(body.adminEmail || process.env.NEVARI_CARE_TEAM_EMAIL, { max: 254 });
  const appOrigin = sanitizeText(body.appOrigin, { max: 300 });
  const selectedEpochMs = Number(body.selectedEpochMs);
  const clientNowMs = Number(body.clientNowMs);

  if (!doctorId || !isValidId(doctorId)) return invalid("Doctor is required.", "doctor");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid("Date is invalid.", "date");
  if (!isValidTimeKey(time)) return invalid("Time is invalid.", "time");
  if (reason.length < 3 || reason.length > 500) return invalid("Reason must be 3 to 500 characters.", "reason");
  if (customerEmail && !isValidEmail(customerEmail)) return invalid("Customer email is invalid.", "customerEmail");
  if (adminEmail && !isValidEmail(adminEmail)) return invalid("Admin email is invalid.", "adminEmail");
  if (!isAllowedAppOrigin(appOrigin)) return invalid("Application origin is invalid.", "appOrigin");
  if (!isAllowedUrl(baseUrl)) return invalid("Backend URL is invalid.", "baseUrl");

  const startAt = buildIso(date, time);
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) {
    return invalid("Date/time is invalid.", "time");
  }
  const hasClientTimestamps = Number.isFinite(selectedEpochMs) && Number.isFinite(clientNowMs);
  if (hasClientTimestamps) {
    // Accept small client clock skew (60s) while enforcing no past booking.
    if (selectedEpochMs < (clientNowMs - 60_000)) {
      return invalid("Past date/time is not allowed.", "time");
    }
  } else if (!isFutureDateTime(date, time)) {
    return invalid("Past date/time is not allowed.", "time");
  }

  if (!baseUrl) {
    return invalid("Missing backend URL.", "baseUrl");
  }

  const endDate = new Date(startDate.getTime() + (30 * 60 * 1000));
  const endAt = `${date}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;

  const baseCreatePayload = {
    doctor_user_id: Number(doctorId) || doctorId,
    start_at: startAt,
    end_at: endAt,
    duration_minutes: 30,
    reason,
    type: "consultation",
    timezone: "Africa/Lagos"
  };

  let createResponse = await proxy(request, baseUrl, "/appointments", {
    method: "POST",
    body: baseCreatePayload
  });

  // Retry with a lighter payload if upstream validation differs.
  if (!createResponse.ok) {
    createResponse = await proxy(request, baseUrl, "/appointments", {
      method: "POST",
      body: {
        doctor_user_id: baseCreatePayload.doctor_user_id,
        start_at: startAt,
        end_at: endAt,
        reason
      }
    });
  }

  if (!createResponse.ok) {
    if (createResponse.status >= 500) {
      const appointment = fallbackAppointment({
        doctorId,
        doctorName,
        doctorSpecialty,
        startAt,
        endAt,
        reason
      });
      return NextResponse.json({
        ok: true,
        degraded: true,
        appointment,
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

  let confirmationData = null;
  if (appointmentId) {
    const confirmation = await proxy(request, baseUrl, `/appointments/${appointmentId}/confirmation`);
    if (confirmation.ok) confirmationData = confirmation.data;
  }

  const meetLink = confirmationData?.appointment?.meet_link
    || confirmationData?.appointment?.google_meet_link
    || created?.meet_link
    || created?.google_meet_link
    || "";

  const formattedDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(startDate);
  const formattedTime = new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(startDate);

  const customerSubject = "Appointment booked successfully";
  const customerBody = [
    `<p>Hello ${escapeHtml(customerName)},</p>`,
    `<p>Your appointment with ${escapeHtml(doctorName || "your doctor")} has been booked for ${escapeHtml(formattedDate)} at ${escapeHtml(formattedTime)}.</p>`,
    `<p><strong>Status:</strong> Confirmed</p>`,
    meetLink ? `<p><strong>Google Meet:</strong> <a href="${escapeHtml(meetLink)}">${escapeHtml(meetLink)}</a></p>` : "",
    "<p>We will send reminders before your appointment.</p>"
  ].join("");

  const adminSubject = "New appointment booked";
  const adminBody = [
    "<p>A new appointment has been booked.</p>",
    `<p><strong>Customer:</strong> ${escapeHtml(customerName)}<br/>`,
    `<strong>Email:</strong> ${escapeHtml(customerEmail || "n/a")}<br/>`,
    `<strong>Doctor:</strong> ${escapeHtml(doctorName || doctorId)}<br/>`,
    `<strong>Specialty:</strong> ${escapeHtml(doctorSpecialty)}<br/>`,
    `<strong>Date:</strong> ${escapeHtml(formattedDate)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(formattedTime)}<br/>`,
    `<strong>Reason:</strong> ${escapeHtml(reason)}</p>`,
    appOrigin ? `<p><a href="${escapeHtml(appOrigin)}/admin/storefront">View in dashboard</a></p>` : ""
  ].join("");

  const customerEmailResult = customerEmail
    ? await sendEmail(request, baseUrl, {
      template_key: "appointment_customer_confirmation",
      recipient_email: customerEmail,
      send_now: true,
      subject: customerSubject,
      body_html: customerBody
    })
    : { sent: false, status: 0 };

  const adminEmailResult = adminEmail
    ? await sendEmail(request, baseUrl, {
      template_key: "appointment_admin_notification",
      recipient_email: adminEmail,
      send_now: true,
      subject: adminSubject,
      body_html: adminBody
    })
    : { sent: false, status: 0 };

  const reminderOffsets = [60, 30, 5, 0];
  const reminderResults = [];
  for (const minutesBefore of reminderOffsets) {
    if (!customerEmail) break;
    const sendAt = new Date(startDate.getTime() - (minutesBefore * 60 * 1000));
    if (sendAt.getTime() < Date.now()) continue;
    const includeMeet = minutesBefore <= 5 && meetLink;
    const reminderBody = [
      `<p>Hello ${escapeHtml(customerName)},</p>`,
      `<p>Reminder: Your appointment with ${escapeHtml(doctorName || "your doctor")} starts in ${minutesBefore === 0 ? "now" : `${minutesBefore} minutes`}.</p>`,
      `<p><strong>Date:</strong> ${escapeHtml(formattedDate)}<br/><strong>Time:</strong> ${escapeHtml(formattedTime)}</p>`,
      includeMeet ? `<p><strong>Google Meet:</strong> <a href="${escapeHtml(meetLink)}">${escapeHtml(meetLink)}</a></p>` : ""
    ].join("");
    const response = await sendEmail(request, baseUrl, {
      template_key: "appointment_reminder",
      recipient_email: customerEmail,
      send_now: false,
      send_at: sendAt.toISOString(),
      subject: "Appointment reminder",
      body_html: reminderBody
    });
    reminderResults.push({ minutesBefore, ...response });
  }

  const appointmentOut = {
    ...(confirmationData?.appointment || created),
    meeting_url: meetLink || created?.meeting_url || "",
    status: (confirmationData?.appointment?.status || created?.status || "confirmed")
  };

  return NextResponse.json({
    ok: true,
    appointment: appointmentOut,
    meeting: { url: meetLink || "" },
    emailDispatch: {
      customer: customerEmailResult,
      admin: adminEmailResult,
      reminders: reminderResults
    }
  });
}
