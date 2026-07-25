"use server";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  escapeHtml,
  invalidNextJson,
  isAllowedUrl,
  isFutureDateTime,
  isValidEmail,
  isValidTimeKey,
  rejectUnknownFields,
  sanitizeText
} from "../../../../lib/inputValidation";
import {
  absoluteFrontendUrl,
  buildEmailLinkVariable,
  buildBrandedAppointmentPaymentUrl,
  buildPaymentButtonHtml,
  customerSessionError,
  findMeetLink,
  formatCurrencyAmount,
  formatAppointmentDateLabel,
  formatAppointmentTimeLabel,
  isUpstreamAuthFailure,
  requestUpstreamJson,
  resolveCustomerSession,
  sendUpstreamEmail,
  upstreamErrorMessage
} from "../_shared";
import { sendConfirmationEmails } from "../notify/route";

const DEFAULT_ADMIN_EMAIL = "careteam@nevarihealth.com";

function invalid(message, field) {
  return invalidNextJson(NextResponse, message, field);
}

function asText(value) {
  return String(value || "").trim();
}

function buildIso(date, time) {
  return `${date}T${time}:00`;
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

async function sendBookingEmails({
  baseUrl,
  appOrigin,
  accessToken,
  adminEmail,
  customerEmail,
  customerName,
  appointment,
  checkout,
  confirmation,
  quotaCovered = false
}) {
  const doctorId = appointment?.doctor_user_id || appointment?.doctor?.id || appointment?.assigned_doctor_id || "";
  const doctorResponse = doctorId ? await requestUpstreamJson(baseUrl, accessToken, `/doctors/${doctorId}`) : null;
  const doctor = doctorResponse?.ok ? (doctorResponse.data?.data || doctorResponse.data || {}) : {};
  const doctorName = appointment?.doctor?.display_name || appointment?.doctor_name || doctor.display_name || "Assigned doctor";
  const doctorEmail = appointment?.doctor?.email || doctor.email || "";
  const meetLink = findMeetLink(confirmation?.appointment, confirmation, checkout?.appointment, checkout, appointment);
  const startValue = appointment?.start_at || confirmation?.appointment?.start_at || "";
  const durationMinutes = Number(appointment?.duration_minutes || confirmation?.appointment?.duration_minutes || 30) || 30;
  const dateLabel = formatAppointmentDateLabel(startValue, "Africa/Lagos");
  const timeLabel = formatAppointmentTimeLabel(startValue, "Africa/Lagos");
  const appointmentReference = String(
    appointment?.reference
    || appointment?.appointment_reference
    || appointment?.booking_reference
    || appointment?.id
    || ""
  ).trim();
  const paymentUrl = String(
    buildBrandedAppointmentPaymentUrl(appOrigin, checkout, appointment, "patient") || ""
  ).trim();
  const paymentStatus = String(
    confirmation?.appointment?.payment_status
    || checkout?.payment_status
    || appointment?.payment_status
    || ""
  ).trim().toLowerCase();
  const statusLabel = String(confirmation?.appointment?.status || appointment?.status || (paymentStatus === "paid" ? "confirmed" : "pending")).trim();
  const patientLoginLink = absoluteFrontendUrl(appOrigin, "/login");
  const doctorDashboardLink = appOrigin ? `${appOrigin.replace(/\/+$/, "")}/admin/doctor` : "";
  const orderId = String(checkout?.order_id || checkout?.order?.id || appointment?.order_id || "").trim();
  const amountPaid = formatCurrencyAmount(
    confirmation?.amount
    ?? checkout?.amount
    ?? checkout?.total
    ?? checkout?.order?.total
    ?? "",
    confirmation?.currency || checkout?.currency || checkout?.order?.currency || "NGN"
  );
  const meetMarkup = meetLink ? `<p><strong>Join appointment:</strong> <a href="${escapeHtml(meetLink)}">${escapeHtml(meetLink)}</a></p>` : "<p><strong>Join appointment:</strong> A direct join link will be sent once the appointment is confirmed.</p>";
  const paymentMarkup = !quotaCovered && paymentStatus !== "paid" && paymentUrl
    ? `${buildPaymentButtonHtml(paymentUrl, "Pay Now")}<p><strong>Payment link:</strong> <a href="${escapeHtml(paymentUrl)}">${escapeHtml(paymentUrl)}</a></p>`
    : "";
  const paymentLinkVariable = !quotaCovered && paymentStatus !== "paid" && paymentUrl
    ? buildEmailLinkVariable(paymentUrl, "Pay Now", { button: true })
    : "";
  const meetLinkVariable = meetLink
    ? buildEmailLinkVariable(meetLink, "Join Appointment", { button: true })
    : "";
  const appointmentVariables = {
    patient_name: customerName || "Patient",
    customer_name: customerName || "Patient",
    doctor_name: doctorName,
    customer_email: customerEmail || "",
    customer_phone: "",
    consultation_type: appointment?.type ? String(appointment.type).replace(/_/g, " ") : "Video Consultation",
    appointment_start: `${dateLabel} at ${timeLabel}`,
    appointment_date: dateLabel,
    appointment_time: timeLabel,
    appointment_duration: `${durationMinutes} minutes`,
    appointment_reference: appointmentReference || "Pending",
    booking_id: String(appointment?.id || confirmation?.appointment?.id || ""),
    order_id: orderId,
    invoice_number: String(checkout?.invoice_number || appointment?.invoice_number || ""),
    patient_note: appointment?.reason || "Consultation booking",
    reason: appointment?.reason || "Consultation booking",
    appointment_status: statusLabel || "pending",
    payment_link: paymentUrl,
    payment_link_html: paymentLinkVariable,
    google_meet_link: meetLink,
    google_meet_link_html: meetLinkVariable,
    join_link: meetLink,
    join_link_html: meetLinkVariable,
    patient_join_link: meetLink,
    patient_join_link_html: meetLinkVariable,
    dashboard_link: patientLoginLink,
    doctor_dashboard_link: doctorDashboardLink,
    site_url: appOrigin || "",
    manage_link: patientLoginLink,
    manage_link_html: patientLoginLink ? buildEmailLinkVariable(patientLoginLink, "Manage appointment") : "",
    cancel_link: patientLoginLink,
    reschedule_link: patientLoginLink,
    amount_paid: amountPaid,
  };
  const customerBody = [
    `<p>Hello ${escapeHtml(customerName || "Patient")},</p>`,
    `<p>Your consultation booking has been created with ${escapeHtml(doctorName)}.</p>`,
    `<p><strong>Date:</strong> ${escapeHtml(dateLabel)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(timeLabel)}<br/>`,
    `<strong>Duration:</strong> ${escapeHtml(String(durationMinutes))} minutes<br/>`,
    `<strong>Reason:</strong> ${escapeHtml(appointment?.reason || "Consultation booking")}<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(appointmentReference || "Pending")}<br/>`,
    `<strong>Status:</strong> ${escapeHtml(statusLabel || "pending")}</p>`,
    meetMarkup,
    paymentMarkup
  ].join("");
  const doctorBody = [
    `<p>Hello ${escapeHtml(doctorName)},</p>`,
    `<p>A new consultation booking has been created.</p>`,
    `<p><strong>Patient:</strong> ${escapeHtml(customerName || "Patient")}<br/>`,
    `<strong>Email:</strong> ${escapeHtml(customerEmail || "Not provided")}<br/>`,
    `<strong>Date:</strong> ${escapeHtml(dateLabel)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(timeLabel)}<br/>`,
    `<strong>Duration:</strong> ${escapeHtml(String(durationMinutes))} minutes<br/>`,
    `<strong>Reason:</strong> ${escapeHtml(appointment?.reason || "Consultation booking")}<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(appointmentReference || "Pending")}</p>`,
    meetMarkup
  ].join("");
  const adminBody = [
    "<p>A new patient appointment has been booked.</p>",
    `<p><strong>Patient:</strong> ${escapeHtml(customerName || "Patient")}<br/>`,
    `<strong>Doctor:</strong> ${escapeHtml(doctorName)}<br/>`,
    `<strong>Date:</strong> ${escapeHtml(dateLabel)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(timeLabel)}<br/>`,
    `<strong>Reason:</strong> ${escapeHtml(appointment?.reason || "Consultation booking")}<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(appointmentReference || "Pending")}<br/>`,
    `<strong>Status:</strong> ${escapeHtml(statusLabel || "pending")}</p>`,
    meetMarkup,
    paymentMarkup
  ].join("");

  const customerDispatch = customerEmail
    ? await sendUpstreamEmail(baseUrl, accessToken, {
      template_key: "appointment_requested",
      recipient_email: customerEmail,
      send_now: true,
      subject: `Your appointment with ${doctorName} is pending payment`,
      variables: appointmentVariables,
      body_html: customerBody,
      body_text: `Hello ${customerName || "Patient"}, your appointment with ${doctorName} has been created for ${dateLabel} at ${timeLabel}. Pay now: ${paymentUrl}`.trim()
    })
    : { sent: false, reason: "missing_customer_email" };
  const doctorDispatchReason = !doctorId ? "missing_doctor_id" : !doctorEmail ? "missing_doctor_email" : "";
  const doctorDispatch = doctorEmail
    ? await sendUpstreamEmail(baseUrl, accessToken, {
      template_key: "appointment_doctor_notification",
      recipient_email: doctorEmail,
      send_now: true,
      subject: `New appointment with ${customerName || "customer"}`,
      variables: {
        ...appointmentVariables,
        dashboard_link: doctorDashboardLink,
      },
      body_html: doctorBody,
      body_text: `Hello ${doctorName}, a new consultation booking has been created for ${customerName || "Patient"} on ${dateLabel} at ${timeLabel}. Reference: ${appointmentReference || "Pending"}.`
    })
    : { sent: false, reason: doctorDispatchReason || "missing_doctor_email" };
  const adminDispatch = adminEmail
    ? await sendUpstreamEmail(baseUrl, accessToken, {
      template_key: "admin_notification",
      recipient_email: adminEmail,
      send_now: true,
      subject: `New appointment booked: ${customerName || "Patient"}`,
      body_html: adminBody
    })
    : { sent: false, reason: "missing_admin_email" };

  return {
    customer: customerDispatch,
    doctor: doctorDispatch,
    admin: adminDispatch,
    meeting_url: meetLink
  };
}

export async function POST(request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "invalid_payload" } });
    return invalid("Invalid request payload.", "payload");
  }

  const unknownFieldError = rejectUnknownFields(body, [
    "doctorId",
    "doctorName",
    "doctorSpecialty",
    "date",
    "time",
    "durationMinutes",
    "reason",
    "selectedEpochMs",
    "clientNowMs",
    "customerEmail",
    "customerName",
    "baseUrl",
    "accessToken",
    "adminEmail",
    "appOrigin",
    "quotaCovered",
    "consultationQuotaRemaining"
  ]);
  if (unknownFieldError) {
    Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "unknown_fields" } });
    return invalid(unknownFieldError, "payload");
  }

  const date = asText(body.date);
  const time = asText(body.time);
  const doctorId = asText(body.doctorId);
  const durationMinutes = Math.max(5, Number.parseInt(body.durationMinutes, 10) || 30);
  const reason = sanitizeText(body.reason, { max: 500 });
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const customerName = sanitizeText(body.customerName, { max: 120 });
  const baseUrl = asText(body.baseUrl);
  const bodyAccessToken = asText(body.accessToken);
  const adminEmail = sanitizeText(body.adminEmail || DEFAULT_ADMIN_EMAIL, { max: 254 });
    const selectedEpochMs = Number(body.selectedEpochMs);
    const clientNowMs = Number(body.clientNowMs);
  const { baseUrl: resolvedBaseUrl, accessToken } = resolveCustomerSession(request, {
    baseUrl,
    accessToken: bodyAccessToken,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid("Date is invalid.", "date");
  if (!isValidTimeKey(time)) return invalid("Time is invalid.", "time");
  if (reason.length < 3 || reason.length > 500) return invalid("Reason must be 3 to 500 characters.", "reason");
  if (customerEmail && !isValidEmail(customerEmail)) return invalid("Patient email is invalid.", "customerEmail");
  if (!accessToken) {
    Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "missing_session" } });
    return NextResponse.json(customerSessionError().data, { status: 401 });
  }
  if (!isAllowedUrl(resolvedBaseUrl)) return invalid("Backend URL is invalid.", "baseUrl");
  if (adminEmail && !isValidEmail(adminEmail)) return invalid("Admin email is invalid.", "adminEmail");

  const startAt = buildIso(date, time);
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) {
    Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "invalid_datetime" } });
    return invalid("Date/time is invalid.", "time");
  }

  const hasClientTimestamps = Number.isFinite(selectedEpochMs) && Number.isFinite(clientNowMs);
  if (hasClientTimestamps) {
    if (selectedEpochMs < (clientNowMs - 60_000)) {
      Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "past_time" } });
      return invalid("Past date/time is not allowed.", "time");
    }
  } else if (!isFutureDateTime(date, time)) {
    Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "past_time" } });
    return invalid("Past date/time is not allowed.", "time");
  }

  const endDate = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));
  const endAt = `${date}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;

  const bookingBody = {
    start_at: startAt,
    end_at: endAt,
    duration_minutes: durationMinutes,
    reason,
    type: "video",
    timezone: "Africa/Lagos"
  };
  if (doctorId) {
    bookingBody.doctor_user_id = Number(doctorId) || doctorId;
    bookingBody.doctor_id = Number(doctorId) || doctorId;
  }

  return Sentry.startSpan(
    {
      name: "appointment.booking.create",
      op: "http.server",
      attributes: {
        "app.flow": "consultation_booking",
        "appointment.has_doctor": Boolean(doctorId),
        "appointment.quota_candidate": Boolean(body.quotaCovered),
      },
    },
    async () => {
      let createResponse = await requestUpstreamJson(resolvedBaseUrl, accessToken, "/appointments", {
        method: "POST",
        body: bookingBody
      });

      if (!createResponse.ok) {
        const fallbackBody = {
          start_at: startAt,
          end_at: endAt,
          duration_minutes: durationMinutes,
          reason,
          type: "video"
        };
        if (doctorId) {
          fallbackBody.doctor_user_id = Number(doctorId) || doctorId;
          fallbackBody.doctor_id = Number(doctorId) || doctorId;
        }
        createResponse = await requestUpstreamJson(resolvedBaseUrl, accessToken, "/appointments", {
          method: "POST",
          body: fallbackBody
        });
      }

      if (!createResponse.ok) {
        if (isUpstreamAuthFailure(createResponse)) {
          Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "upstream_auth_failure" } });
          await Sentry.flush(2000);
          return NextResponse.json(customerSessionError().data, { status: 401 });
        }
        if (createResponse.status >= 500) {
          Sentry.metrics.count("appointment_booking_requests", 1, { attributes: { outcome: "degraded_local_fallback" } });
          Sentry.metrics.distribution("appointment_booking_latency", Date.now() - startedAt, { unit: "millisecond" });
          Sentry.logger.warn("Appointment booking fell back to local pending sync state.", {
            status_code: createResponse.status,
            has_doctor: Boolean(doctorId),
          });
          await Sentry.flush(2000);
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

        Sentry.metrics.count("appointment_booking_requests", 1, {
          attributes: { outcome: "upstream_error", status_code: Number(createResponse.status || 0) || 0 }
        });
        await Sentry.flush(2000);
        return NextResponse.json({
          ok: false,
          error: { message: upstreamErrorMessage(createResponse) || "Unable to create appointment." },
          upstream: createResponse.data,
          upstream_status: createResponse.status,
          upstream_raw: createResponse.raw?.slice(0, 1200) || null
        }, { status: createResponse.status >= 400 && createResponse.status < 500 ? createResponse.status : 502 });
      }

      const created = createResponse.data?.appointment || createResponse.data?.data || createResponse.data;
      const appointmentId = created?.id;

      let checkoutData = null;
      if (appointmentId) {
        const checkout = await requestUpstreamJson(resolvedBaseUrl, accessToken, `/appointments/${appointmentId}/checkout`);
        if (checkout.ok) {
          checkoutData = checkout.data?.data || checkout.data;
        }
      }
      let confirmationData = null;
      if (appointmentId) {
        const confirmation = await requestUpstreamJson(resolvedBaseUrl, accessToken, `/appointments/${appointmentId}/confirmation`);
        if (confirmation.ok) {
          confirmationData = confirmation.data?.data || confirmation.data;
        }
      }
      const normalizedCheckoutData = checkoutData
        ? {
          ...checkoutData,
          baseUrl: checkoutData.baseUrl || checkoutData.base_url || resolvedBaseUrl,
          base_url: checkoutData.base_url || checkoutData.baseUrl || resolvedBaseUrl
        }
        : null;
      const resolvedAppointment = {
        ...created,
        checkout_url: buildBrandedAppointmentPaymentUrl(body.appOrigin || new URL(request.url).origin, normalizedCheckoutData, created, "patient"),
        payment_status: confirmationData?.appointment?.payment_status || normalizedCheckoutData?.payment_status || created?.payment_status || "pending",
        status: confirmationData?.appointment?.status || (String(confirmationData?.appointment?.payment_status || normalizedCheckoutData?.payment_status || created?.payment_status || "").toLowerCase() === "paid" ? "confirmed" : (created?.status || "awaiting_payment"))
      };
      const quotaCovered = String(resolvedAppointment.payment_status || "").toLowerCase() === "paid";
      const isConfirmed = Boolean(
        confirmationData?.is_confirmed
        || String(confirmationData?.appointment?.status || resolvedAppointment?.status || "").toLowerCase() === "confirmed"
        || String(resolvedAppointment.payment_status || "").toLowerCase() === "paid"
      );
      const meetingUrl = findMeetLink(confirmationData?.appointment, confirmationData, checkoutData?.appointment, checkoutData, resolvedAppointment);
      const confirmationEmailResult = isConfirmed
        ? await sendConfirmationEmails({
          baseUrl: resolvedBaseUrl,
          appOrigin: body.appOrigin || new URL(request.url).origin,
          accessToken,
          appointmentId: appointmentId || resolvedAppointment?.id,
          customerEmail,
          customerName,
          adminEmail
        })
        : null;
      const emailDispatch = confirmationEmailResult?.ok
        ? confirmationEmailResult.emailDispatch
        : await sendBookingEmails({
          baseUrl: resolvedBaseUrl,
          appOrigin: body.appOrigin || new URL(request.url).origin,
          accessToken,
          adminEmail,
          customerEmail,
          customerName,
          appointment: resolvedAppointment,
          checkout: normalizedCheckoutData,
          confirmation: confirmationData,
          quotaCovered
        });

      Sentry.metrics.count("appointment_booking_requests", 1, {
        attributes: {
          outcome: "success",
          payment_status: String(resolvedAppointment.payment_status || "pending").toLowerCase(),
          status: String(resolvedAppointment.status || "unknown").toLowerCase(),
        },
      });
      Sentry.metrics.distribution("appointment_booking_latency", Date.now() - startedAt, { unit: "millisecond" });
      Sentry.logger.info("Appointment booking completed.", {
        appointment_status: resolvedAppointment.status,
        payment_status: resolvedAppointment.payment_status,
        quota_covered: quotaCovered,
        confirmed: isConfirmed,
      });
      await Sentry.flush(2000);

      return NextResponse.json({
        ok: true,
        appointment: resolvedAppointment,
        checkout: normalizedCheckoutData,
        confirmation: confirmationData,
        quotaCovered,
        meeting: { url: meetingUrl || "" },
        emailDispatch
      });
    }
  );
}
