import { NextResponse } from "next/server";
import {
  escapeHtml,
  invalidNextJson,
  isAllowedUrl,
  isFutureDateTime,
  isValidEmail,
  isValidPhone,
  rejectUnknownFields,
  safeFileName,
  sanitizeText
} from "../../../lib/inputValidation";

const CARE_TYPES = new Set(["Elderly Care", "Post Surgery Recovery", "Medication Assistance", "Wound Dressing", "Injection Administration", "Chronic Disease Monitoring", "Palliative Care"]);
const VISIT_TYPES = new Set(["Recurring", "One Time"]);
const CARE_SHIFTS = new Set(["Day", "Night"]);
const YES_NO = new Set(["Yes", "No"]);
const DURATIONS = new Set(["30 mins", "1 hour", "2 hours", "4 hours", "8 hours", "12 hours"]);
const CLINICAL_REQUIREMENTS = new Set(["Medication Administration", "Catheter Care", "Blood Pressure Monitoring", "Diabetes Monitoring", "IV Therapy", "Feeding Tube Support"]);
const UPLOAD_LABELS = new Set(["Medical Prescription", "Doctor Notes", "Discharge Summaries", "Lab Reports", "Medication Lists"]);

function requiredText(value, min = 1, max = 140) {
  const text = String(value || "").trim();
  return text.length >= min && text.length <= max;
}

function invalid(message, field) {
  return invalidNextJson(NextResponse, message, field);
}

async function sendEmail(baseUrl, accessToken, payload) {
  if (!baseUrl || !accessToken) return { sent: false, reason: "missing_credentials" };
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/+$/, "")}/emails/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { sent: false, reason: `http_${response.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "network_error" };
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return invalid("Invalid request payload.", "payload");
  }
  const unknownFieldError = rejectUnknownFields(body, [
    "patient",
    "careType",
    "careDetails",
    "clinicalRequirements",
    "uploadedMedicalFiles",
    "customerEmail",
    "customerName",
    "customerPhone",
    "baseUrl",
    "accessToken",
    "appOrigin",
    "adminEmail"
  ]);
  if (unknownFieldError) return invalid(unknownFieldError, "payload");

  const patient = body.patient || {};
  const patientFieldError = rejectUnknownFields(patient, ["name", "age", "gender", "address", "emergencyContact", "mobilityStatus", "conditions", "allergies", "currentMedication"], "patient");
  if (patientFieldError) return invalid(patientFieldError, "patient");
  const careType = sanitizeText(body.careType, { max: 80 });
  const careDetails = body.careDetails || {};
  const careFieldError = rejectUnknownFields(careDetails, [
    "visitType",
    "preferredDate",
    "preferredTime",
    "duration",
    "careShift",
    "liveInCareRequired",
    "wheelchairAssistanceNeeded",
    "medicalEquipmentPresent",
    "requiresLiftingAssistance",
    "infectiousDisease"
  ], "careDetails");
  if (careFieldError) return invalid(careFieldError, "careDetails");
  const clinicalRequirements = Array.isArray(body.clinicalRequirements) ? body.clinicalRequirements : [];
  const uploadedMedicalFiles = body.uploadedMedicalFiles && typeof body.uploadedMedicalFiles === "object" ? body.uploadedMedicalFiles : {};
  const uploadFieldError = rejectUnknownFields(uploadedMedicalFiles, [...UPLOAD_LABELS], "uploadedMedicalFiles");
  if (uploadFieldError) return invalid(uploadFieldError, "uploadedMedicalFiles");
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const customerName = sanitizeText(body.customerName || patient.name || "Customer", { max: 120 });
  const customerPhone = sanitizeText(body.customerPhone || patient.emergencyContact, { max: 24 });
  const baseUrl = String(body.baseUrl || "").trim();
  const accessToken = String(body.accessToken || "").trim();
  const appOrigin = sanitizeText(body.appOrigin, { max: 300 });
  const adminEmail = sanitizeText(body.adminEmail || process.env.NEVARI_CARE_TEAM_EMAIL, { max: 254 });

  if (!CARE_TYPES.has(careType)) return invalid("Select a valid care type.", "careType");
  const patientName = sanitizeText(patient.name, { max: 120 });
  if (!requiredText(patientName, 2, 120) || !/^[a-zA-Z\s'.-]{2,120}$/.test(patientName)) return invalid("Enter a valid name.", "name");

  const ageRaw = String(patient.age || "").trim();
  if (!/^\d{1,3}$/.test(ageRaw)) return invalid("Age must be a number with max 3 digits.", "age");

  const gender = String(patient.gender || "").trim();
  if (!["Male", "Female"].includes(gender)) return invalid("Gender must be Male or Female.", "gender");

  const address = sanitizeText(patient.address, { max: 200 });
  if (!requiredText(address, 5, 200)) return invalid("Address is required.", "address");

  const emergencyContact = sanitizeText(patient.emergencyContact, { max: 24 });
  if (!isValidPhone(emergencyContact)) {
    return invalid("Emergency contact must be a valid phone number.", "emergencyContact");
  }

  const mobilityStatus = sanitizeText(patient.mobilityStatus, { max: 120 });
  if (!requiredText(mobilityStatus, 2, 120) || !/^[a-zA-Z\s'.-]{2,120}$/.test(mobilityStatus)) return invalid("Mobility status is required.", "mobilityStatus");
  if (customerEmail && !isValidEmail(customerEmail)) return invalid("Customer email is invalid.", "customerEmail");
  if (adminEmail && !isValidEmail(adminEmail)) return invalid("Admin email is invalid.", "adminEmail");
  if (customerPhone && !isValidPhone(customerPhone)) return invalid("Customer phone is invalid.", "customerPhone");
  if (baseUrl && !isAllowedUrl(baseUrl)) return invalid("Backend URL is invalid.", "baseUrl");
  if (appOrigin && !isAllowedUrl(appOrigin)) return invalid("Application origin is invalid.", "appOrigin");
  if (clinicalRequirements.some((item) => !CLINICAL_REQUIREMENTS.has(sanitizeText(item, { max: 80 })))) {
    return invalid("Clinical requirements contain an invalid option.", "clinicalRequirements");
  }
  const sanitizedUploads = Object.fromEntries(
    Object.entries(uploadedMedicalFiles).map(([key, value]) => [key, safeFileName(value, { max: 180 })])
  );

  const requiredCareFields = [
    "visitType",
    "preferredDate",
    "preferredTime",
    "duration",
    "careShift",
    "liveInCareRequired",
    "wheelchairAssistanceNeeded",
    "medicalEquipmentPresent",
    "requiresLiftingAssistance",
    "infectiousDisease"
  ];
  for (const field of requiredCareFields) {
    if (!requiredText(sanitizeText(careDetails[field], { max: 120 }), 1, 120)) {
      return invalid(`${field} is required.`, field);
    }
  }
  if (!VISIT_TYPES.has(sanitizeText(careDetails.visitType, { max: 40 }))) return invalid("Visit type is invalid.", "visitType");
  if (!DURATIONS.has(sanitizeText(careDetails.duration, { max: 40 }))) return invalid("Duration is invalid.", "duration");
  if (!CARE_SHIFTS.has(sanitizeText(careDetails.careShift, { max: 40 }))) return invalid("Care shift is invalid.", "careShift");
  for (const field of ["liveInCareRequired", "wheelchairAssistanceNeeded", "medicalEquipmentPresent", "requiresLiftingAssistance", "infectiousDisease"]) {
    if (!YES_NO.has(sanitizeText(careDetails[field], { max: 10 }))) return invalid(`${field} is invalid.`, field);
  }

  const preferredDate = String(careDetails.preferredDate || "").trim();
  const preferredTime = String(careDetails.preferredTime || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    return invalid("Preferred date is invalid.", "preferredDate");
  }
  if (!/^\d{2}:\d{2}$/.test(preferredTime)) {
    return invalid("Preferred time is invalid.", "preferredTime");
  }
  const preferredDateTime = new Date(`${preferredDate}T${preferredTime}:00`);
  if (Number.isNaN(preferredDateTime.getTime()) || !isFutureDateTime(preferredDate, preferredTime)) {
    return invalid("Past date/time is not allowed.", "preferredTime");
  }

  const requestId = `nurse-${Date.now()}`;
  const status = "pending_review";
  const uploadedCount = Object.values(sanitizedUploads).filter(Boolean).length;

  const customerSubject = "Your nurse request has been received";
  const customerBody = [
    `<p>Hello ${escapeHtml(customerName || "Customer")},</p>`,
    "<p>Your nurse request has been received and is currently pending review.</p>",
    `<p><strong>Care Type:</strong> ${escapeHtml(careType)}<br/>`,
    `<strong>Preferred Date:</strong> ${escapeHtml(preferredDate)}<br/>`,
    `<strong>Preferred Time:</strong> ${escapeHtml(preferredTime)}<br/>`,
    `<strong>Visit Type:</strong> ${escapeHtml(String(careDetails.visitType || ""))}<br/>`,
    `<strong>Status:</strong> Pending Review</p>`,
    "<p>You will be notified once a nurse is assigned.</p>"
  ].join("");

  const adminSubject = "New nurse request submitted";
  const adminBody = [
    "<p>A new nurse request has been submitted.</p>",
    `<p><strong>Customer:</strong> ${escapeHtml(customerName)}<br/>`,
    `<strong>Contact:</strong> ${escapeHtml(customerPhone || "n/a")}<br/>`,
    `<strong>Email:</strong> ${escapeHtml(customerEmail || "n/a")}<br/>`,
    `<strong>Care Type:</strong> ${escapeHtml(careType)}<br/>`,
    `<strong>Preferred Date:</strong> ${escapeHtml(preferredDate)}<br/>`,
    `<strong>Preferred Time:</strong> ${escapeHtml(preferredTime)}<br/>`,
    `<strong>Visit Type:</strong> ${escapeHtml(String(careDetails.visitType || ""))}<br/>`,
    `<strong>Clinical Requirements:</strong> ${escapeHtml(clinicalRequirements.map((item) => sanitizeText(item, { max: 80 })).join(", ") || "None")}<br/>`,
    `<strong>Uploaded Documents:</strong> ${uploadedCount}</p>`,
    appOrigin ? `<p><a href="${escapeHtml(appOrigin)}/admin/storefront">Review in admin dashboard</a></p>` : ""
  ].join("");

  const customerEmailDispatch = customerEmail
    ? await sendEmail(baseUrl, accessToken, {
      template_key: "customer_confirmation",
      recipient_email: customerEmail,
      send_now: true,
      subject: customerSubject,
      body_html: customerBody
    })
    : { sent: false, reason: "missing_customer_email" };

  const adminEmailDispatch = adminEmail
    ? await sendEmail(baseUrl, accessToken, {
      template_key: "admin_notification",
      recipient_email: adminEmail,
      send_now: true,
      subject: adminSubject,
      body_html: adminBody
    })
    : { sent: false, reason: "missing_admin_email" };

  return NextResponse.json({
    ok: true,
    request: {
      id: requestId,
      status,
      title: `Nurse Visit Request - ${careType}`,
      careType,
      preferredDate,
      preferredTime,
      visitType: String(careDetails.visitType || ""),
      submittedAt: new Date().toISOString()
    },
    emailDispatch: {
      customer: customerEmailDispatch,
      admin: adminEmailDispatch
    }
  });
}
