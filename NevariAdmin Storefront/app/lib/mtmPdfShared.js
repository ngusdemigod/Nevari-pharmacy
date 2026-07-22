import { StandardFonts, rgb } from "pdf-lib";
import { sanitizeText } from "./inputValidation.js";

export const TEMPLATE_VERSION = "mtm-template-v1";
export const FIELD_NAME_VERSION = "mtm-field-map-v1";
export const DEFAULT_CLINIC_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Nevari Pharmacy";
export const MEDICATION_ROW_LIMIT = 10;
export const BASE_TEMPLATE_PAGE_COUNT = 5;
const CONTINUATION_ROWS_PER_PAGE = 18;

export const HEADER_FIELD_NAMES = [
  "mtm_request_id_1",
  "mtm_request_id_28",
  "mtm_request_id_42",
  "mtm_request_id_117",
  "mtm_request_id_126",
];

export const HEADER_DATE_FIELD_NAMES = [
  "form_date_2",
  "form_date_29",
  "form_date_43",
  "form_date_118",
  "form_date_127",
];

export const HEADER_CLINIC_FIELD_NAMES = [
  "clinic_pharmacy_3",
  "clinic_pharmacy_30",
  "clinic_pharmacy_44",
  "clinic_pharmacy_119",
  "clinic_pharmacy_128",
];

export const MEDICATION_FIELD_NAMES = Array.from({ length: MEDICATION_ROW_LIMIT }, (_, index) => {
  const row = index + 1;
  const suffixBase = 47 + (index * 7);
  return {
    medicationName: `med_name_${row}_${suffixBase}`,
    dosage: `med_dosage_${row}_${suffixBase + 1}`,
    frequency: `med_frequency_${row}_${suffixBase + 2}`,
    route: `med_route_${row}_${suffixBase + 3}`,
    indication: `med_indication_${row}_${suffixBase + 4}`,
    prescribingDoctor: `med_doctor_${row}_${suffixBase + 5}`,
    startDate: `med_start_date_${row}_${suffixBase + 6}`,
  };
});

export const ADHERENCE_CHECKBOX_MAP = {
  Forgetfulness: "barrier_forgetfulness_129",
  "Side Effects": "barrier_side_effects_130",
  "Complex Regimen": "barrier_complex_regimen_131",
  "Medication Cost": "barrier_medication_cost_132",
  "Access Issues": "barrier_access_issues_133",
  "Low Understanding": "barrier_low_understanding_134",
  "Cultural Concerns": "barrier_cultural_concerns_135",
  Other: "barrier_other_136",
};

const PAGE_FOUR_HEADER_MASK = {
  x: 28,
  y: 676,
  width: 540,
  height: 68,
};

function cleanText(value, { max = 500 } = {}) {
  return sanitizeText(value ?? "", { max });
}

function formatDateParts(value, timeZone = "UTC", { includeTime = false } = {}) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  });
  return formatter.format(date);
}

function normalizeCheckboxValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "";
}

function toMultiline(value, { max = 1200 } = {}) {
  const source = Array.isArray(value) ? value.join("\\n") : String(value ?? "");
  return source
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => sanitizeText(line, { max }))
    .filter((line, index, list) => line !== "" || (index > 0 && index < list.length - 1))
    .join("\n")
    .trim();
}

function joinValues(values) {
  return values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(", ");
}

function firstDefinedText(values, options) {
  for (const value of values) {
    const normalized = cleanText(value, options);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function firstDefinedValue(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function normalizeMedicationRow(entry = {}) {
  return {
    medicationName: cleanText(entry.medicationName || entry.medicationname || entry.name, { max: 120 }),
    dosage: cleanText(entry.dosage, { max: 80 }),
    frequency: cleanText(entry.frequency, { max: 80 }),
    route: cleanText(entry.route, { max: 80 }),
    indication: cleanText(entry.indication, { max: 120 }),
    prescribingDoctor: cleanText(entry.prescribingDoctor || entry.prescribingdoctor || entry.doctor, { max: 120 }),
    startDate: formatDateParts(entry.startDate || entry.startdate, "UTC"),
  };
}

export function normalizeMtmPdfPayload(request) {
  const patient = request?.patient || {};
  const emergency = request?.emergency_contact || {};
  const medical = request?.medical_history || {};
  const medicationProfile = request?.medication_profile || {};
  const additional = request?.additional_information || {};
  const adherence = request?.adherence_assessment || {};
  const consultationNotes = request?.consultation_notes || {};
  const actionPlan = request?.action_plan || {};
  const timeZone = cleanText(request?.timezone || "UTC", { max: 80 }) || "UTC";
  const medications = Array.isArray(medicationProfile?.medications)
    ? medicationProfile.medications.map(normalizeMedicationRow)
    : [];
  const patientFullName = cleanText(patient?.name, { max: 120 });
  const submittedDate = formatDateParts(request?.created_at, timeZone);
  const attachments = Array.isArray(request?.attachments) ? request.attachments.map((item) => ({
    name: cleanText(item?.name, { max: 180 }),
    type: cleanText(item?.type, { max: 80 }),
    size: Number(item?.size || 0),
    category: cleanText(item?.category, { max: 40 }),
    heading: cleanText(item?.heading, { max: 120 }),
  })) : [];
  const relevantLabResults = joinValues([
    medical?.relevantLabResults,
    ...attachments.filter((item) => item.category === "lab_result").map((item) => item.name),
  ]);

  return {
    requestReference: cleanText(request?.request_reference || request?.id, { max: 60 }),
    clinicName: cleanText(DEFAULT_CLINIC_NAME, { max: 120 }),
    submittedDate,
    reviewDate: formatDateParts(request?.reviewed_at || request?.approved_at || request?.updated_at, timeZone),
    patientFullName,
    patientAge: cleanText(patient?.age, { max: 8 }),
    patientDob: formatDateParts(patient?.dob ? `${patient.dob}T00:00:00` : "", timeZone),
    patientGender: cleanText(patient?.gender, { max: 40 }),
    patientMaritalStatus: cleanText(patient?.maritalStatus || patient?.maritalstatus, { max: 40 }),
    patientPhone: firstDefinedText([
      patient?.phoneNumber,
      patient?.phonenumber,
      patient?.phone_number,
      patient?.phone,
      patient?.contactPhone,
      patient?.contact_phone,
    ], { max: 40 }),
    patientCityState: cleanText(patient?.cityState || patient?.citystate, { max: 120 }),
    patientPreferredContactMethod: cleanText(patient?.preferredContactMethod || patient?.preferredcontactmethod, { max: 40 }),
    patientAddress: cleanText(patient?.address, { max: 240 }),
    patientEmergencyContact: cleanText(patient?.emergencyContact || patient?.emergencycontact, { max: 60 }),
    caregiverName: cleanText(emergency?.caregiverName || emergency?.caregivername, { max: 120 }),
    caregiverRelationship: cleanText(emergency?.relationship, { max: 80 }),
    caregiverPhone: cleanText(emergency?.phoneNumber || emergency?.phonenumber, { max: 40 }),
    caregiverEmail: cleanText(emergency?.emailAddress || emergency?.emailaddress, { max: 120 }),
    caregiverAddress: cleanText(emergency?.address, { max: 240 }),
    caregiverLivesWithPatient: normalizeCheckboxValue(emergency?.livesWithPatient || emergency?.liveswithpatient),
    caregiverConsent: normalizeCheckboxValue(emergency?.consentToDiscussCare || emergency?.consenttodiscusscare),
    caregiverNotes: cleanText(emergency?.notes, { max: 240 }),
    height: cleanText(medical?.height, { max: 40 }),
    weight: cleanText(medical?.weight, { max: 40 }),
    bloodPressure: cleanText(medical?.bloodPressure || medical?.bloodpressure, { max: 40 }),
    bloodGlucoseHbA1c: cleanText(medical?.bloodGlucoseHbA1c || medical?.bloodglucosehba1c, { max: 80 }),
    primaryDiagnosis: firstDefinedText([
      medical?.primaryDiagnosis,
      medical?.primarydiagnosis,
      medical?.primary_diagnosis,
      medical?.diagnosis,
      request?.primaryDiagnosis,
      request?.primary_diagnosis,
    ], { max: 240 }),
    secondaryDiagnosis: cleanText(medical?.secondaryDiagnosis || medical?.secondarydiagnosis, { max: 240 }),
    chronicConditions: toMultiline(medical?.chronicConditions || medical?.chronicconditions),
    pastMedicalHistory: toMultiline(medical?.pastMedicalHistory || medical?.pastmedicalhistory),
    pastSurgicalHistory: toMultiline(medical?.pastSurgicalHistory || medical?.pastsurgicalhistory),
    drugAllergies: toMultiline(medical?.drugAllergies || medical?.drugallergies),
    drugIntolerances: toMultiline(medical?.drugIntolerances || medical?.drugintolerances),
    relevantLabResults,
    clinicalMonitoringParameters: toMultiline(medical?.clinicalMonitoringParameters || medical?.clinicalmonitoringparameters),
    medications,
    attachments,
    attachmentPageCount: attachments.length,
    recentMedicationChanges: toMultiline(additional?.recentMedicationChanges || additional?.recentmedicationchanges),
    previousMedicationsStopped: toMultiline(additional?.previousMedicationsStopped || additional?.previousmedicationsstopped),
    reasonForDiscontinuation: toMultiline(additional?.reasonForDiscontinuation || additional?.reasonfordiscontinuation),
    otcMedications: toMultiline(additional?.otcMedications || additional?.otcmedications),
    herbalProducts: toMultiline(additional?.herbalProducts),
    supplements: toMultiline(additional?.supplements),
    barriers: Array.isArray(adherence?.barriers)
      ? adherence.barriers.map((item) => cleanText(item, { max: 80 })).filter(Boolean)
      : [],
    adherenceOther: cleanText(adherence?.other, { max: 240 }),
    patientConcernsGoals: cleanText(
      firstDefinedValue([
        adherence?.patientConcernsGoals,
        adherence?.patientconcernsgoals,
        additional?.patientConcernsGoals,
        additional?.patientconcernsgoals,
      ]),
      { max: 240 }
    ),
    patientSignatureName: patientFullName,
    patientSignature: patientFullName,
    patientSignatureDate: submittedDate,
    clinicianReviewNotes: toMultiline(consultationNotes?.notes || consultationNotes?.summary),
    recommendedActionPlan: toMultiline(actionPlan?.summary || actionPlan?.notes),
    reviewerName: cleanText(request?.assigned_pharmacist_name, { max: 120 }),
    reviewerSignatureDate: formatDateParts(request?.reviewed_at || request?.approved_at || request?.updated_at, timeZone),
    timeZone,
  };
}

export function validateNormalizedPayload(data) {
  const missing = [];
  if (!data.requestReference) missing.push("request_reference");
  if (!data.patientFullName) missing.push("patient.name");
  if (!data.patientAge) missing.push("patient.age");
  if (!data.patientDob) missing.push("patient.dob");
  if (!data.patientPhone) missing.push("patient.phoneNumber");
  if (!data.patientAddress) missing.push("patient.address");
  if (!data.primaryDiagnosis) missing.push("medical_history.primaryDiagnosis");
  if (!data.medications.length) missing.push("medication_profile.medications");
  if (missing.length) {
    throw new Error(`MTM request is incomplete for PDF generation: ${missing.join(", ")}.`);
  }
}

function setTextField(form, name, value) {
  const field = form.getTextField(name);
  field.setText(cleanText(value, { max: 1500 }));
}

function setCheckboxField(form, name, checked) {
  const field = form.getCheckBox(name);
  if (checked) {
    field.check();
  } else {
    field.uncheck();
  }
}

export function fillTemplateFields(form, normalized) {
  HEADER_FIELD_NAMES.forEach((fieldName) => setTextField(form, fieldName, normalized.requestReference));
  HEADER_DATE_FIELD_NAMES.forEach((fieldName) => setTextField(form, fieldName, normalized.submittedDate));
  HEADER_CLINIC_FIELD_NAMES.forEach((fieldName) => setTextField(form, fieldName, normalized.clinicName));

  setTextField(form, "patient_full_name_4", normalized.patientFullName);
  setTextField(form, "patient_age_5", normalized.patientAge);
  setTextField(form, "patient_dob_6", normalized.patientDob);
  setTextField(form, "patient_gender_7", normalized.patientGender);
  setTextField(form, "patient_marital_status_8", normalized.patientMaritalStatus);
  setTextField(form, "patient_phone_9", normalized.patientPhone);
  setTextField(form, "patient_city_state_10", normalized.patientCityState);
  setTextField(form, "patient_contact_method_11", normalized.patientPreferredContactMethod);
  setTextField(form, "patient_address_12", normalized.patientAddress);
  setTextField(form, "patient_emergency_contact_13", normalized.patientEmergencyContact);

  const preferredContact = normalized.patientPreferredContactMethod.toLowerCase();
  setCheckboxField(form, "contact_phone_14", preferredContact === "phone");
  setCheckboxField(form, "contact_sms_15", preferredContact === "sms");
  setCheckboxField(form, "contact_email_16", preferredContact === "email");
  setCheckboxField(form, "contact_whatsapp_17", preferredContact === "whatsapp");

  setTextField(form, "caregiver_name_18", normalized.caregiverName);
  setTextField(form, "caregiver_relationship_19", normalized.caregiverRelationship);
  setTextField(form, "caregiver_phone_20", normalized.caregiverPhone);
  setTextField(form, "caregiver_email_21", normalized.caregiverEmail);
  setTextField(form, "caregiver_address_22", normalized.caregiverAddress);
  setCheckboxField(form, "lives_yes_23", normalized.caregiverLivesWithPatient === "yes");
  setCheckboxField(form, "lives_no_24", normalized.caregiverLivesWithPatient === "no");
  setCheckboxField(form, "consent_yes_25", normalized.caregiverConsent === "yes");
  setCheckboxField(form, "consent_no_26", normalized.caregiverConsent === "no");
  setTextField(form, "caregiver_notes_27", normalized.caregiverNotes);

  setTextField(form, "height_31", normalized.height);
  setTextField(form, "weight_32", normalized.weight);
  setTextField(form, "blood_pressure_33", normalized.bloodPressure);
  setTextField(form, "blood_glucose_hba1c_34", normalized.bloodGlucoseHbA1c);
  setTextField(form, "primary_diagnosis_35", normalized.primaryDiagnosis);
  setTextField(form, "secondary_diagnosis_36", normalized.secondaryDiagnosis);
  setTextField(form, "chronic_conditions_37", normalized.chronicConditions);
  setTextField(form, "past_medical_history_38", normalized.pastMedicalHistory);
  setTextField(form, "past_surgical_history_39", normalized.pastSurgicalHistory);
  setTextField(form, "drug_allergies_40", normalized.drugAllergies);
  setTextField(form, "drug_intolerances_41", normalized.drugIntolerances);

  setTextField(form, "lab_results_45", normalized.relevantLabResults);
  setTextField(form, "clinical_monitoring_parameters_46", normalized.clinicalMonitoringParameters);
  MEDICATION_FIELD_NAMES.forEach((fieldNames, index) => {
    const medication = normalized.medications[index] || {};
    setTextField(form, fieldNames.medicationName, medication.medicationName || "");
    setTextField(form, fieldNames.dosage, medication.dosage || "");
    setTextField(form, fieldNames.frequency, medication.frequency || "");
    setTextField(form, fieldNames.route, medication.route || "");
    setTextField(form, fieldNames.indication, medication.indication || "");
    setTextField(form, fieldNames.prescribingDoctor, medication.prescribingDoctor || "");
    setTextField(form, fieldNames.startDate, medication.startDate || "");
  });

  setTextField(form, "recent_med_changes_120", normalized.recentMedicationChanges);
  setTextField(form, "previous_medications_stopped_121", normalized.previousMedicationsStopped);
  setTextField(form, "reason_discontinuation_122", normalized.reasonForDiscontinuation);
  setTextField(form, "otc_medications_123", normalized.otcMedications);
  setTextField(form, "herbal_products_124", normalized.herbalProducts);
  setTextField(form, "supplements_125", normalized.supplements);

  const selectedBarriers = new Set(normalized.barriers);
  Object.entries(ADHERENCE_CHECKBOX_MAP).forEach(([label, fieldName]) => {
    setCheckboxField(form, fieldName, selectedBarriers.has(label));
  });
  setTextField(form, "adherence_other_specify_137", normalized.adherenceOther);
  setTextField(form, "patient_concerns_goals_138", normalized.patientConcernsGoals);
  setTextField(form, "signature_name_139", normalized.patientSignatureName);
  setTextField(form, "signature_140", normalized.patientSignature);
  setTextField(form, "signature_date_141", normalized.patientSignatureDate);
  setTextField(form, "clinician_review_notes_142", normalized.clinicianReviewNotes);
  setTextField(form, "recommended_action_plan_143", normalized.recommendedActionPlan);
  setTextField(form, "reviewer_name_144", normalized.reviewerName);
  setTextField(form, "reviewer_signature_date_145", normalized.reviewerSignatureDate);
}

export function expectedMtmPdfPageCount(requestOrNormalized) {
  const normalized = requestOrNormalized?.medications ? requestOrNormalized : normalizeMtmPdfPayload(requestOrNormalized);
  const overflowCount = Math.max(0, normalized.medications.length - MEDICATION_ROW_LIMIT);
  return BASE_TEMPLATE_PAGE_COUNT + Math.ceil(overflowCount / CONTINUATION_ROWS_PER_PAGE) + Number(normalized.attachmentPageCount || 0);
}

export async function appendMedicationContinuationPages(pdfDoc, normalized) {
  const overflow = normalized.medications.slice(MEDICATION_ROW_LIMIT);
  if (!overflow.length) return;

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();

  for (let offset = 0; offset < overflow.length; offset += CONTINUATION_ROWS_PER_PAGE) {
    const page = pdfDoc.addPage([width, height]);
    const rows = overflow.slice(offset, offset + CONTINUATION_ROWS_PER_PAGE);
    const margin = 44;
    let cursorY = height - 56;
    page.drawText("Nevari MTM Medication Continuation", {
      x: margin,
      y: cursorY,
      size: 16,
      font: helveticaBold,
      color: rgb(0.055, 0.161, 0.333),
    });
    cursorY -= 22;
    page.drawText(`Request: ${normalized.requestReference}`, {
      x: margin,
      y: cursorY,
      size: 10,
      font: helvetica,
      color: rgb(0.2, 0.25, 0.35),
    });
    cursorY -= 14;
    page.drawText(`Patient: ${normalized.patientFullName}`, {
      x: margin,
      y: cursorY,
      size: 10,
      font: helvetica,
      color: rgb(0.2, 0.25, 0.35),
    });
    cursorY -= 26;

    const columns = [
      { label: "Medication", width: 120 },
      { label: "Dosage", width: 70 },
      { label: "Frequency", width: 78 },
      { label: "Route", width: 65 },
      { label: "Indication", width: 100 },
      { label: "Prescriber", width: 95 },
      { label: "Start Date", width: 65 },
    ];

    let cursorX = margin;
    columns.forEach((column) => {
      page.drawRectangle({
        x: cursorX,
        y: cursorY - 12,
        width: column.width,
        height: 18,
        color: rgb(0.055, 0.161, 0.333),
      });
      page.drawText(column.label, {
        x: cursorX + 4,
        y: cursorY - 6,
        size: 8,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      cursorX += column.width;
    });

    cursorY -= 22;
    rows.forEach((row, rowIndex) => {
      const rowHeight = 24;
      if (rowIndex % 2 === 0) {
        page.drawRectangle({
          x: margin,
          y: cursorY - rowHeight + 4,
          width: width - (margin * 2),
          height: rowHeight,
          color: rgb(0.933, 0.957, 0.984),
        });
      }
      const values = [
        row.medicationName,
        row.dosage,
        row.frequency,
        row.route,
        row.indication,
        row.prescribingDoctor,
        row.startDate,
      ];
      cursorX = margin;
      values.forEach((value, index) => {
        page.drawText(cleanText(value, { max: 40 }) || " ", {
          x: cursorX + 4,
          y: cursorY - 10,
          size: 8,
          font: helvetica,
          color: rgb(0.1, 0.1, 0.1),
          maxWidth: columns[index].width - 8,
        });
        cursorX += columns[index].width;
      });
      cursorY -= rowHeight;
    });
  }
}

export function suppressRepeatedStepFourHeader(pdfDoc) {
  const page = pdfDoc.getPage(3);
  if (!page) return;
  page.drawRectangle({
    ...PAGE_FOUR_HEADER_MASK,
    color: rgb(1, 1, 1),
    borderColor: rgb(1, 1, 1),
    borderWidth: 0,
  });
}
