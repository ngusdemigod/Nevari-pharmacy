import { NextResponse } from "next/server";
import {
  invalidNextJson,
  isAllowedUrl,
  isValidEmail,
  isValidPhone,
  rejectUnknownFields,
  sanitizeText
} from "../../../lib/inputValidation";
import {
  assertFrontendRequest,
  buildFrontendSession,
  proxyRequest,
  validateFrontendSession
} from "../../mtm/_server.js";

const GENDER_OPTIONS = new Set(["Male", "Female"]);
const YES_NO_OPTIONS = new Set(["Yes", "No"]);
const THERAPY_TYPES = new Set([
  "Beauty & Radiance Drips",
  "Anti-Aging & Regenerative Drips",
  "Weight Management Drips Assistance",
  "Hair & Nail Restoration",
  "Vitamin & Hydration Drips",
]);

function invalid(message, field) {
  return invalidNextJson(NextResponse, message, field);
}

function requiredText(value, min = 1, max = 240) {
  const text = String(value || "").trim();
  return text.length >= min && text.length <= max;
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

async function validateAndBuildPayload(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return { error: invalid("Invalid request payload.", "payload") };
  }

  const unknownFieldError = rejectUnknownFields(body, [
    "patient",
    "clinicalHistory",
    "therapyTypes",
    "goals",
    "consent",
    "customerEmail",
    "customerName",
    "customerPhone",
    "baseUrl",
    "appOrigin",
    "frontendType"
  ]);
  if (unknownFieldError) return { error: invalid(unknownFieldError, "payload") };

  const patient = body.patient && typeof body.patient === "object" ? body.patient : {};
  const clinicalHistory = body.clinicalHistory && typeof body.clinicalHistory === "object" ? body.clinicalHistory : {};
  const goals = body.goals && typeof body.goals === "object" ? body.goals : {};
  const therapyTypes = Array.isArray(body.therapyTypes) ? body.therapyTypes : [];
  const consent = sanitizeText(body.consent, { max: 10 });
  const customerEmail = sanitizeText(body.customerEmail, { max: 254 });
  const customerName = sanitizeText(body.customerName || patient.name || "Customer", { max: 120 });
  const customerPhone = sanitizeText(body.customerPhone || patient.phoneNumber, { max: 24 });
  const baseUrl = String(body.baseUrl || "").trim();
  const appOrigin = sanitizeText(body.appOrigin, { max: 300 });
  const frontendType = sanitizeText(body.frontendType || "patient", { max: 40 }) || "patient";

  const patientFieldError = rejectUnknownFields(patient, ["name", "gender", "address", "cityState", "phoneNumber"], "patient");
  if (patientFieldError) return { error: invalid(patientFieldError, "patient") };
  const historyFieldError = rejectUnknownFields(clinicalHistory, [
    "chronicConditions",
    "chronicConditionsDetails",
    "currentMedications",
    "currentMedicationsDetails",
    "allergies",
    "allergiesDetails",
    "priorIvTherapy",
    "priorIvTherapyDetails",
    "bloodClotHistory"
  ], "clinicalHistory");
  if (historyFieldError) return { error: invalid(historyFieldError, "clinicalHistory") };
  const goalsFieldError = rejectUnknownFields(goals, ["primaryReason", "expectedResults"], "goals");
  if (goalsFieldError) return { error: invalid(goalsFieldError, "goals") };

  const patientName = sanitizeText(patient.name, { max: 120 });
  const gender = sanitizeText(patient.gender, { max: 20 });
  const address = sanitizeText(patient.address, { max: 200 });
  const cityState = sanitizeText(patient.cityState, { max: 120 });
  const phoneNumber = sanitizeText(patient.phoneNumber, { max: 24 });
  const primaryReason = sanitizeText(goals.primaryReason, { max: 800 });
  const expectedResults = sanitizeText(goals.expectedResults, { max: 800 });

  if (!requiredText(patientName, 2, 120)) return { error: invalid("Enter a valid patient name.", "name") };
  if (!GENDER_OPTIONS.has(gender)) return { error: invalid("Select a valid gender.", "gender") };
  if (!requiredText(address, 5, 200)) return { error: invalid("Address is required.", "address") };
  if (!requiredText(cityState, 2, 120)) return { error: invalid("City/State is required.", "cityState") };
  if (!isValidPhone(phoneNumber)) return { error: invalid("Phone number is invalid.", "phoneNumber") };
  if (!therapyTypes.length) return { error: invalid("Select at least one IV therapy type.", "therapyTypes") };
  if (therapyTypes.some((item) => !THERAPY_TYPES.has(sanitizeText(item, { max: 80 })))) {
    return { error: invalid("Therapy types contain an invalid option.", "therapyTypes") };
  }

  for (const field of ["chronicConditions", "currentMedications", "allergies", "priorIvTherapy", "bloodClotHistory"]) {
    const value = sanitizeText(clinicalHistory[field], { max: 10 });
    if (!YES_NO_OPTIONS.has(value)) {
      return { error: invalid(`${field} must be Yes or No.`, field) };
    }
  }

  if (sanitizeText(clinicalHistory.chronicConditions, { max: 10 }) === "Yes" && !requiredText(clinicalHistory.chronicConditionsDetails, 3, 800)) {
    return { error: invalid("Provide chronic medical condition details.", "chronicConditionsDetails") };
  }
  if (sanitizeText(clinicalHistory.currentMedications, { max: 10 }) === "Yes" && !requiredText(clinicalHistory.currentMedicationsDetails, 3, 800)) {
    return { error: invalid("Provide current medication details.", "currentMedicationsDetails") };
  }
  if (sanitizeText(clinicalHistory.allergies, { max: 10 }) === "Yes" && !requiredText(clinicalHistory.allergiesDetails, 3, 800)) {
    return { error: invalid("Provide allergy details.", "allergiesDetails") };
  }
  if (sanitizeText(clinicalHistory.priorIvTherapy, { max: 10 }) === "Yes" && !requiredText(clinicalHistory.priorIvTherapyDetails, 3, 800)) {
    return { error: invalid("Provide prior IV therapy details.", "priorIvTherapyDetails") };
  }
  if (!requiredText(primaryReason, 3, 800)) return { error: invalid("Main goal is required.", "primaryReason") };
  if (!requiredText(expectedResults, 3, 800)) return { error: invalid("Expected results are required.", "expectedResults") };
  if (consent !== "Yes") return { error: invalid("Consent is required before submission.", "consent") };
  if (customerEmail && !isValidEmail(customerEmail)) return { error: invalid("Customer email is invalid.", "customerEmail") };
  if (customerPhone && !isValidPhone(customerPhone)) return { error: invalid("Customer phone is invalid.", "customerPhone") };
  if (baseUrl && !isAllowedUrl(baseUrl)) return { error: invalid("Backend URL is invalid.", "baseUrl") };
  if (!isValidAppOrigin(appOrigin, request)) return { error: invalid("Application origin is invalid.", "appOrigin") };

  return {
    payload: {
      patient: {
        name: patientName,
        gender,
        address,
        cityState,
        phoneNumber,
      },
      clinicalHistory: {
        chronicConditions: sanitizeText(clinicalHistory.chronicConditions, { max: 10 }),
        chronicConditionsDetails: sanitizeText(clinicalHistory.chronicConditionsDetails, { max: 800 }),
        currentMedications: sanitizeText(clinicalHistory.currentMedications, { max: 10 }),
        currentMedicationsDetails: sanitizeText(clinicalHistory.currentMedicationsDetails, { max: 800 }),
        allergies: sanitizeText(clinicalHistory.allergies, { max: 10 }),
        allergiesDetails: sanitizeText(clinicalHistory.allergiesDetails, { max: 800 }),
        priorIvTherapy: sanitizeText(clinicalHistory.priorIvTherapy, { max: 10 }),
        priorIvTherapyDetails: sanitizeText(clinicalHistory.priorIvTherapyDetails, { max: 800 }),
        bloodClotHistory: sanitizeText(clinicalHistory.bloodClotHistory, { max: 10 }),
      },
      therapyTypes: therapyTypes.map((item) => sanitizeText(item, { max: 80 })),
      goals: {
        primaryReason,
        expectedResults,
      },
      consent,
      customerEmail,
      customerName,
      customerPhone,
      appOrigin,
      baseUrl,
      frontendType,
    }
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

    const data = await proxyRequest(url.origin, session, "/iv-therapy-requests");
    return NextResponse.json({
      success: true,
      data: {
        items: Array.isArray(data?.items) ? data.items : [],
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error?.message || "Unable to load IV therapy requests." } }, { status: Number(error?.status || 500) });
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

    const data = await proxyRequest(url.origin, session, "/iv-therapy-requests", {
      method: "POST",
      body: {
        patient: payload.patient,
        clinicalHistory: payload.clinicalHistory,
        therapyTypes: payload.therapyTypes,
        goals: payload.goals,
        consent: payload.consent,
        customerEmail: payload.customerEmail,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        appOrigin: payload.appOrigin,
        frontendType: payload.frontendType,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        request: data?.request || null,
        notifications: data?.notifications || "queued",
      }
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error?.message || "Unable to submit IV therapy request." } }, { status: Number(error?.status || 500) });
  }
}
