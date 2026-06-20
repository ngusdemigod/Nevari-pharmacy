import { NextResponse } from "next/server";
import {
  invalidNextJson,
  isAllowedUrl,
  isValidEmail,
  isValidPhone,
  rejectUnknownFields,
  safeFileName,
  sanitizeText
} from "../../../lib/inputValidation";
import {
  assertFrontendRequest,
  buildFrontendSession,
  proxyRequest,
  validateFrontendSession
} from "../../mtm/_server.js";

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

function isValidAppOrigin(value, request) {
  const text = sanitizeText(value, { max: 300 });
  if (!text) return true;
  try {
    const url = new URL(text);
    const requestOrigin = new URL(request.url).origin;
    return ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password
      && url.origin === requestOrigin;
  } catch {
    return false;
  }
}

function dateKeyInTimeZone(date, timeZone = "Africa/Lagos") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function timeKeyInTimeZone(date, timeZone = "Africa/Lagos") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

async function validateAndBuildPayload(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return { error: invalid("Invalid request payload.", "payload") };
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
    "appOrigin",
    "adminEmail",
    "frontendType"
  ]);
  if (unknownFieldError) return { error: invalid(unknownFieldError, "payload") };

  const patient = body.patient || {};
  const patientFieldError = rejectUnknownFields(patient, ["name", "age", "gender", "address", "emergencyContact", "mobilityStatus", "conditions", "allergies", "currentMedication"], "patient");
  if (patientFieldError) return { error: invalid(patientFieldError, "patient") };
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
  if (careFieldError) return { error: invalid(careFieldError, "careDetails") };
  const clinicalRequirements = Array.isArray(body.clinicalRequirements) ? body.clinicalRequirements : [];
  const uploadedMedicalFiles = body.uploadedMedicalFiles && typeof body.uploadedMedicalFiles === "object" ? body.uploadedMedicalFiles : {};
  const uploadFieldError = rejectUnknownFields(uploadedMedicalFiles, [...UPLOAD_LABELS], "uploadedMedicalFiles");
  if (uploadFieldError) return { error: invalid(uploadFieldError, "uploadedMedicalFiles") };
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const customerName = sanitizeText(body.customerName || patient.name || "Customer", { max: 120 });
  const customerPhone = sanitizeText(body.customerPhone || patient.emergencyContact, { max: 24 });
  const baseUrl = String(body.baseUrl || "").trim();
  const appOrigin = sanitizeText(body.appOrigin, { max: 300 });
  const adminEmail = sanitizeText(body.adminEmail || process.env.NEVARI_CARE_TEAM_EMAIL, { max: 254 });
  const frontendType = sanitizeText(body.frontendType || "patient", { max: 40 }) || "patient";

  if (!CARE_TYPES.has(careType)) return { error: invalid("Select a valid care type.", "careType") };
  const patientName = sanitizeText(patient.name, { max: 120 });
  if (!requiredText(patientName, 2, 120) || !/^[a-zA-Z\s'.-]{2,120}$/.test(patientName)) return { error: invalid("Enter a valid name.", "name") };

  const ageRaw = String(patient.age || "").trim();
  if (!/^\d{1,3}$/.test(ageRaw)) return { error: invalid("Age must be a number with max 3 digits.", "age") };

  const gender = String(patient.gender || "").trim();
  if (!["Male", "Female"].includes(gender)) return { error: invalid("Gender must be Male or Female.", "gender") };

  const address = sanitizeText(patient.address, { max: 200 });
  if (!requiredText(address, 5, 200)) return { error: invalid("Address is required.", "address") };

  const emergencyContact = sanitizeText(patient.emergencyContact, { max: 24 });
  if (!isValidPhone(emergencyContact)) {
    return { error: invalid("Emergency contact must be a valid phone number.", "emergencyContact") };
  }

  const mobilityStatus = sanitizeText(patient.mobilityStatus, { max: 120 });
  if (!requiredText(mobilityStatus, 2, 120) || !/^[a-zA-Z\s'.-]{2,120}$/.test(mobilityStatus)) return { error: invalid("Mobility status is required.", "mobilityStatus") };
  if (customerEmail && !isValidEmail(customerEmail)) return { error: invalid("Customer email is invalid.", "customerEmail") };
  if (adminEmail && !isValidEmail(adminEmail)) return { error: invalid("Admin email is invalid.", "adminEmail") };
  if (customerPhone && !isValidPhone(customerPhone)) return { error: invalid("Customer phone is invalid.", "customerPhone") };
  if (baseUrl && !isAllowedUrl(baseUrl)) return { error: invalid("Backend URL is invalid.", "baseUrl") };
  if (!isValidAppOrigin(appOrigin, request)) return { error: invalid("Application origin is invalid.", "appOrigin") };
  if (clinicalRequirements.some((item) => !CLINICAL_REQUIREMENTS.has(sanitizeText(item, { max: 80 })))) {
    return { error: invalid("Clinical requirements contain an invalid option.", "clinicalRequirements") };
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
      return { error: invalid(`${field} is required.`, field) };
    }
  }
  if (!VISIT_TYPES.has(sanitizeText(careDetails.visitType, { max: 40 }))) return { error: invalid("Visit type is invalid.", "visitType") };
  if (!DURATIONS.has(sanitizeText(careDetails.duration, { max: 40 }))) return { error: invalid("Duration is invalid.", "duration") };
  if (!CARE_SHIFTS.has(sanitizeText(careDetails.careShift, { max: 40 }))) return { error: invalid("Care shift is invalid.", "careShift") };
  for (const field of ["liveInCareRequired", "wheelchairAssistanceNeeded", "medicalEquipmentPresent", "requiresLiftingAssistance", "infectiousDisease"]) {
    if (!YES_NO.has(sanitizeText(careDetails[field], { max: 10 }))) return { error: invalid(`${field} is invalid.`, field) };
  }

  const preferredDate = String(careDetails.preferredDate || "").trim();
  const preferredTime = String(careDetails.preferredTime || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    return { error: invalid("Preferred date is invalid.", "preferredDate") };
  }
  if (!/^\d{2}:\d{2}$/.test(preferredTime)) {
    return { error: invalid("Preferred time is invalid.", "preferredTime") };
  }
  const now = new Date();
  const todayKey = dateKeyInTimeZone(now, "Africa/Lagos");
  if (preferredDate < todayKey) {
    return { error: invalid("Past dates are not allowed.", "preferredDate") };
  }
  if (preferredDate === todayKey) {
    const currentTime = timeKeyInTimeZone(now, "Africa/Lagos");
    if (preferredTime <= currentTime) {
      return { error: invalid("Past time is not allowed.", "preferredTime") };
    }
  }

  return {
    payload: {
      patient,
      careType,
      careDetails,
      clinicalRequirements: clinicalRequirements.map((item) => sanitizeText(item, { max: 80 })),
      uploadedMedicalFiles: sanitizedUploads,
      customerEmail,
      customerName,
      customerPhone,
      appOrigin,
      adminEmail,
      baseUrl,
      frontendType,
    },
  };
}

function buildSessionFromRequest(request, url, baseUrl, frontendType = "patient") {
  return buildFrontendSession(request, url, frontendType, baseUrl);
}

export async function GET(request) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const frontendType = url.searchParams.get("frontendType") || "patient";
    const baseUrl = url.searchParams.get("baseUrl") || "";
    const session = buildSessionFromRequest(request, url, baseUrl, frontendType);
    const sessionError = validateFrontendSession(session);
    if (sessionError) return sessionError;

    const data = await proxyRequest(url.origin, session, "/nurse-requests");
    return NextResponse.json({
      success: true,
      data: {
        items: Array.isArray(data?.items) ? data.items : [],
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error?.message || "Unable to load nurse requests." } }, { status: Number(error?.status || 500) });
  }
}

export async function POST(request) {
  try {
    assertFrontendRequest(request);
    const validation = await validateAndBuildPayload(request);
    if (validation?.error) {
      return validation.error;
    }

    const payload = validation.payload;
    const url = new URL(request.url);
    const session = buildSessionFromRequest(request, url, payload.baseUrl, payload.frontendType);
    const sessionError = validateFrontendSession(session);
    if (sessionError) return sessionError;

    const data = await proxyRequest(url.origin, session, "/nurse-requests", {
      method: "POST",
      body: {
        careType: payload.careType,
        patient: payload.patient,
        careDetails: payload.careDetails,
        clinicalRequirements: payload.clinicalRequirements,
        uploadedMedicalFiles: payload.uploadedMedicalFiles,
        customerEmail: payload.customerEmail,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        appOrigin: payload.appOrigin,
        adminEmail: payload.adminEmail,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        request: data?.request || null,
        notifications: data?.notifications || "",
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error?.message || "Unable to submit nurse request." } }, { status: Number(error?.status || 500) });
  }
}
