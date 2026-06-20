"use server";

import { NextResponse } from "next/server";
import { escapeHtml, invalidNextJson, isAllowedUrl, isValidEmail, rejectUnknownFields, sanitizeText } from "../../../../lib/inputValidation";
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
  sendUpstreamEmail
} from "../_shared";

const DEFAULT_ADMIN_EMAIL = "careteam@nevarihealth.com";

function invalid(message, field) {
  return invalidNextJson(NextResponse, message, field);
}

export async function sendConfirmationEmails({
  baseUrl,
  appOrigin,
  accessToken,
  appointmentId,
  customerEmail,
  customerName,
  adminEmail
}) {
  const confirmationResponse = await requestUpstreamJson(baseUrl, accessToken, `/appointments/${appointmentId}/confirmation`);
  if (!confirmationResponse.ok) {
    return { ok: false, confirmation: null, emailDispatch: null, upstream: confirmationResponse };
  }
  const confirmation = confirmationResponse.data?.data || confirmationResponse.data;
  const appointment = confirmation?.appointment || {};
  const doctorId = appointment?.doctor_user_id || appointment?.doctor?.id || "";
  const doctorResponse = doctorId ? await requestUpstreamJson(baseUrl, accessToken, `/doctors/${doctorId}`) : null;
  const doctor = doctorResponse?.ok ? (doctorResponse.data?.data || doctorResponse.data || {}) : {};
  const doctorName = appointment?.doctor?.display_name || appointment?.doctor_name || doctor.display_name || "Assigned doctor";
  const doctorEmail = appointment?.doctor?.email || doctor.email || "";
  const customerSentAt = String(appointment?.customer_confirmation_sent_at || "").trim();
  const doctorSentAt = String(appointment?.doctor_confirmation_sent_at || "").trim();
  const meetLink = findMeetLink(confirmation?.appointment, confirmation);
  const dateLabel = formatAppointmentDateLabel(appointment?.start_at, "Africa/Lagos");
  const timeLabel = formatAppointmentTimeLabel(appointment?.start_at, "Africa/Lagos");
  const durationMinutes = Number(appointment?.duration_minutes || 30) || 30;
  const reference = String(appointment?.reference || appointment?.appointment_reference || appointment?.booking_reference || appointment?.id || "").trim();
  const paymentUrl = buildBrandedAppointmentPaymentUrl(appOrigin, confirmation?.checkout || confirmation, appointment, "patient");
  const paymentStatus = String(appointment?.payment_status || confirmation?.payment_status || "").trim().toLowerCase();
  const patientLoginLink = absoluteFrontendUrl(appOrigin, "/login");
  const doctorDashboardLink = appOrigin ? `${appOrigin.replace(/\/+$/, "")}/admin/doctor` : "";
  const orderId = String(
    confirmation?.order_id
    || confirmation?.appointment?.order_id
    || appointment?.order_id
    || confirmation?.checkout?.order_id
    || confirmation?.checkout?.order?.id
    || ""
  ).trim();
  const amountPaid = formatCurrencyAmount(
    confirmation?.amount
    ?? confirmation?.checkout?.total
    ?? confirmation?.checkout?.amount
    ?? appointment?.amount_paid
    ?? "",
    confirmation?.currency || confirmation?.checkout?.currency || "NGN"
  );
  const meetMarkup = meetLink ? `<p><strong>Join appointment:</strong> <a href="${escapeHtml(meetLink)}">${escapeHtml(meetLink)}</a></p>` : "";
  const paymentMarkup = paymentUrl && paymentStatus !== "paid"
    ? `${buildPaymentButtonHtml(paymentUrl, "Pay Now")}<p><strong>Payment link:</strong> <a href="${escapeHtml(paymentUrl)}">${escapeHtml(paymentUrl)}</a></p>`
    : "";
  const appointmentVariables = {
    patient_name: customerName || appointment?.patient?.display_name || "Customer",
    customer_name: customerName || appointment?.patient?.display_name || "Customer",
    doctor_name: doctorName,
    customer_email: customerEmail || appointment?.patient?.email || "",
    customer_phone: "",
    consultation_type: appointment?.type ? String(appointment.type).replace(/_/g, " ") : "Video Consultation",
    appointment_start: `${dateLabel} at ${timeLabel}`,
    appointment_date: dateLabel,
    appointment_time: timeLabel,
    appointment_duration: `${durationMinutes} minutes`,
    appointment_reference: reference || "Pending",
    booking_id: String(appointment?.id || appointmentId || ""),
    order_id: orderId,
    patient_note: appointment?.reason || "",
    reason: appointment?.reason || "",
    appointment_status: String(appointment?.status || "confirmed"),
    payment_link: paymentUrl,
    payment_link_html: paymentUrl && paymentStatus !== "paid"
      ? buildEmailLinkVariable(paymentUrl, "Pay Now", { button: true })
      : "",
    google_meet_link: meetLink,
    google_meet_link_html: meetLink ? buildEmailLinkVariable(meetLink, "Join Appointment", { button: true }) : "",
    join_link: meetLink,
    join_link_html: meetLink ? buildEmailLinkVariable(meetLink, "Join Appointment", { button: true }) : "",
    patient_join_link: meetLink,
    patient_join_link_html: meetLink ? buildEmailLinkVariable(meetLink, "Join Appointment", { button: true }) : "",
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
    `<p>Hello ${escapeHtml(customerName || "Customer")},</p>`,
    `<p>Your appointment is confirmed with ${escapeHtml(doctorName)}.</p>`,
    `<p><strong>Date:</strong> ${escapeHtml(dateLabel)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(timeLabel)}<br/>`,
    `<strong>Duration:</strong> ${escapeHtml(String(durationMinutes))} minutes<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(reference || "Pending")}</p>`,
    meetMarkup,
    paymentMarkup
  ].join("");
  const doctorBody = [
    `<p>Hello ${escapeHtml(doctorName)},</p>`,
    `<p>The appointment with ${escapeHtml(customerName || "Customer")} is confirmed.</p>`,
    `<p><strong>Date:</strong> ${escapeHtml(dateLabel)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(timeLabel)}<br/>`,
    `<strong>Duration:</strong> ${escapeHtml(String(durationMinutes))} minutes<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(reference || "Pending")}</p>`,
    meetMarkup,
    paymentMarkup
  ].join("");
  const adminBody = [
    "<p>An appointment has been confirmed.</p>",
    `<p><strong>Customer:</strong> ${escapeHtml(customerName || "Customer")}<br/>`,
    `<strong>Doctor:</strong> ${escapeHtml(doctorName)}<br/>`,
    `<strong>Date:</strong> ${escapeHtml(dateLabel)}<br/>`,
    `<strong>Time:</strong> ${escapeHtml(timeLabel)}<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(reference || "Pending")}</p>`,
    meetMarkup,
    paymentMarkup
  ].join("");

  const customerDispatch = !customerEmail
    ? { sent: false, reason: "missing_customer_email" }
    : customerSentAt
      ? { sent: false, skipped: true, reason: "already_sent", sent_at: customerSentAt }
      : await sendUpstreamEmail(baseUrl, accessToken, {
        template_key: "appointment_customer_confirmation",
        recipient_email: customerEmail,
        send_now: true,
        related_object_type: "appointment",
        related_object_id: Number(appointmentId || appointment?.id || 0),
        appointment_sent_column: "customer_confirmation_sent_at",
        subject: `Appointment confirmed with ${doctorName}`,
        variables: appointmentVariables,
        body_html: customerBody,
        body_text: `Hello ${customerName || "Customer"}, your appointment is confirmed with ${doctorName} on ${dateLabel} at ${timeLabel}.`
      });
  const doctorDispatchReason = !doctorId ? "missing_doctor_id" : !doctorEmail ? "missing_doctor_email" : "";
  const doctorDispatch = !doctorEmail
    ? { sent: false, reason: doctorDispatchReason || "missing_doctor_email" }
    : doctorSentAt
      ? { sent: false, skipped: true, reason: "already_sent", sent_at: doctorSentAt }
      : await sendUpstreamEmail(baseUrl, accessToken, {
        template_key: "appointment_doctor_notification",
        recipient_email: doctorEmail,
        send_now: true,
        related_object_type: "appointment",
        related_object_id: Number(appointmentId || appointment?.id || 0),
        appointment_sent_column: "doctor_confirmation_sent_at",
        subject: `Appointment confirmed with ${customerName || "customer"}`,
        variables: {
          ...appointmentVariables,
          dashboard_link: doctorDashboardLink,
        },
        body_html: doctorBody,
        body_text: `Hello ${doctorName}, the appointment with ${customerName || "Customer"} is confirmed for ${dateLabel} at ${timeLabel}.`
      });
  const adminDispatch = adminEmail
    ? await sendUpstreamEmail(baseUrl, accessToken, {
      template_key: "admin_notification",
      recipient_email: adminEmail,
      send_now: true,
      subject: `Appointment confirmed: ${customerName || "Customer"}`,
      body_html: adminBody
    })
    : { sent: false, reason: "missing_admin_email" };

  return {
    ok: true,
    confirmation,
    emailDispatch: {
      customer: customerDispatch,
      doctor: doctorDispatch,
      admin: adminDispatch,
      meeting_url: meetLink
    },
    upstream: confirmationResponse
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return invalid("Invalid request payload.", "payload");
  }
  const unknownFieldError = rejectUnknownFields(body, [
    "appointmentId",
    "baseUrl",
    "accessToken",
    "customerEmail",
    "customerName",
    "adminEmail"
  ]);
  if (unknownFieldError) {
    return invalid(unknownFieldError, "payload");
  }

  const appointmentId = sanitizeText(body.appointmentId, { max: 80 });
  const baseUrl = String(body.baseUrl || "").trim();
  const bodyAccessToken = String(body.accessToken || "").trim();
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const customerName = sanitizeText(body.customerName, { max: 120 });
  const adminEmail = sanitizeText(body.adminEmail || DEFAULT_ADMIN_EMAIL, { max: 254 });
  const { baseUrl: resolvedBaseUrl, accessToken } = resolveCustomerSession(request, {
    baseUrl,
    accessToken: bodyAccessToken,
  });

  if (!appointmentId) return invalid("Appointment is required.", "appointmentId");
  if (!resolvedBaseUrl || !isAllowedUrl(resolvedBaseUrl)) return invalid("Backend URL is invalid.", "baseUrl");
  if (!accessToken) return NextResponse.json(customerSessionError().data, { status: 401 });
  if (customerEmail && !isValidEmail(customerEmail)) return invalid("Customer email is invalid.", "customerEmail");
  if (adminEmail && !isValidEmail(adminEmail)) return invalid("Admin email is invalid.", "adminEmail");

  const result = await sendConfirmationEmails({
    baseUrl: resolvedBaseUrl,
    appOrigin: new URL(request.url).origin,
    accessToken,
    appointmentId,
    customerEmail,
    customerName,
    adminEmail
  });
  if (!result.ok) {
    if (isUpstreamAuthFailure(result.upstream)) {
      return NextResponse.json(customerSessionError().data, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: { message: "Unable to send confirmation emails." } }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    confirmation: result.confirmation,
    emailDispatch: result.emailDispatch
  });
}
