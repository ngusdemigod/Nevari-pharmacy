import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { safeFileName, sanitizeText } from "./inputValidation.js";
import {
  FIELD_NAME_VERSION,
  TEMPLATE_VERSION,
  appendMedicationContinuationPages,
  expectedMtmPdfPageCount,
  fillTemplateFields,
  normalizeMtmPdfPayload,
  suppressRepeatedStepFourHeader,
  validateNormalizedPayload,
} from "./mtmPdfShared.js";

const CACHE_ROOT = path.join(os.tmpdir(), "nevari-mtm-pdfs");
const GENERATED_ROOT = path.join(CACHE_ROOT, "generated");
const VERIFIED_ROOT = path.join(CACHE_ROOT, "verified");
const AUDIT_LOG_PATH = path.join(CACHE_ROOT, "audit-log.jsonl");
const PRIVATE_PDF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function mtmTemplateCandidates() {
  const configuredPath = String(process.env.MTM_PDF_TEMPLATE_PATH || "").trim();
  return [
    configuredPath ? path.resolve(configuredPath) : "",
    path.resolve(process.cwd(), "MTM_Patient_Intake_Form.pdf"),
    path.resolve(process.cwd(), "public", "MTM_Patient_Intake_Form.pdf"),
    path.resolve(process.cwd(), "..", "MTM_Patient_Intake_Form.pdf"),
    path.resolve(process.cwd(), "..", "public", "MTM_Patient_Intake_Form.pdf"),
    path.resolve(process.cwd(), "..", "..", "MTM_Patient_Intake_Form.pdf"),
  ].filter(Boolean);
}

function generatedPdfPath(requestId, fingerprint) {
  const safeId = safeFileName(String(requestId || "request"));
  return path.join(GENERATED_ROOT, `${safeId}-${fingerprint}.pdf`);
}

function verifiedPdfPath(requestId, fingerprint) {
  const safeId = safeFileName(String(requestId || "request"));
  return path.join(VERIFIED_ROOT, `${safeId}-${fingerprint}.browser.pdf`);
}

function fileNameForRequest(request) {
  const reference = safeFileName(String(request?.request_reference || request?.id || "request"));
  const normalizedReference = reference.toUpperCase().startsWith("MTM-") ? reference : `MTM-${reference}`;
  return `${normalizedReference}-patient-intake-form.pdf`;
}

async function ensureCacheRoot() {
  await Promise.all([
    fs.mkdir(GENERATED_ROOT, { recursive: true }),
    fs.mkdir(VERIFIED_ROOT, { recursive: true }),
  ]);
}

async function cleanupPrivatePdfCache(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const cutoff = Date.now() - PRIVATE_PDF_TTL_MS;
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const entryPath = path.join(root, entry.name);
      try {
        const stats = await fs.stat(entryPath);
        if (stats.mtimeMs < cutoff) {
          await fs.unlink(entryPath);
        }
      } catch {}
    }));
  } catch {}
}

async function resolveTemplatePath() {
  for (const candidate of mtmTemplateCandidates()) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("MTM PDF template could not be found.");
}

export async function loadMtmTemplateBytes() {
  const templatePath = await resolveTemplatePath();
  return fs.readFile(templatePath);
}

export function buildMtmPdfFingerprint(requestData) {
  const normalized = normalizeMtmPdfPayload(requestData);
  validateNormalizedPayload(normalized);
  return createHash("sha256")
    .update(JSON.stringify({
      templateVersion: TEMPLATE_VERSION,
      fieldMapVersion: FIELD_NAME_VERSION,
      requestId: requestData?.id || null,
      normalized,
    }))
    .digest("hex");
}

async function readStoredPdf(filePath) {
  try {
    const [pdf, stats] = await Promise.all([
      fs.readFile(filePath),
      fs.stat(filePath),
    ]);
    return { pdf, storagePath: filePath, stats };
  } catch {
    return null;
  }
}

export async function readVerifiedBrowserPdf(requestData, fingerprint = "") {
  const nextFingerprint = fingerprint || buildMtmPdfFingerprint(requestData);
  return readStoredPdf(verifiedPdfPath(requestData?.id, nextFingerprint));
}

export async function storeVerifiedBrowserPdf(requestData, pdfBytes, fingerprint = "") {
  const nextFingerprint = fingerprint || buildMtmPdfFingerprint(requestData);
  await ensureCacheRoot();
  await cleanupPrivatePdfCache(VERIFIED_ROOT);
  const destination = verifiedPdfPath(requestData?.id, nextFingerprint);
  await fs.writeFile(destination, pdfBytes);
  return {
    fingerprint: nextFingerprint,
    filename: fileNameForRequest(requestData),
    storagePath: destination,
  };
}

async function readGeneratedPdf(requestData, fingerprint = "") {
  const nextFingerprint = fingerprint || buildMtmPdfFingerprint(requestData);
  return readStoredPdf(generatedPdfPath(requestData?.id, nextFingerprint));
}

async function writeGeneratedPdf(requestData, fingerprint, pdfBytes) {
  await ensureCacheRoot();
  await cleanupPrivatePdfCache(GENERATED_ROOT);
  const destination = generatedPdfPath(requestData?.id, fingerprint);
  await fs.writeFile(destination, pdfBytes);
  return destination;
}

function clientIp(request) {
  const forwarded = String(request?.headers?.get?.("x-forwarded-for") || "");
  return sanitizeText(forwarded.split(",")[0] || request?.headers?.get?.("x-real-ip") || "", { max: 80 });
}

async function appendAuditLog(event) {
  await ensureCacheRoot();
  await fs.appendFile(AUDIT_LOG_PATH, `${JSON.stringify(event)}\n`, "utf8");
}

export function mtmDocumentFilename(data) {
  return fileNameForRequest(data);
}

export function mtmExpectedPdfPageCount(data) {
  const normalized = normalizeMtmPdfPayload(data);
  validateNormalizedPayload(normalized);
  return expectedMtmPdfPageCount(normalized);
}

export async function generateMtmTemplatePdf(requestData, options = {}) {
  const normalized = normalizeMtmPdfPayload(requestData);
  validateNormalizedPayload(normalized);
  const fingerprint = buildMtmPdfFingerprint(requestData);

  if (options.mode !== "fresh") {
    const verified = await readVerifiedBrowserPdf(requestData, fingerprint);
    if (verified) {
      return {
        pdf: verified.pdf,
        filename: fileNameForRequest(requestData),
        fingerprint,
        cacheHit: true,
        storagePath: verified.storagePath,
        source: "verified-browser",
      };
    }

    const cached = await readGeneratedPdf(requestData, fingerprint);
    if (cached) {
      return {
        pdf: cached.pdf,
        filename: fileNameForRequest(requestData),
        fingerprint,
        cacheHit: true,
        storagePath: cached.storagePath,
        source: "generated-cache",
      };
    }
  }

  const templateBytes = await loadMtmTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  fillTemplateFields(form, normalized);
  await appendMedicationContinuationPages(pdfDoc, normalized);
  form.flatten();
  suppressRepeatedStepFourHeader(pdfDoc);
  const pdfBytes = await pdfDoc.save();
  const storagePath = await writeGeneratedPdf(requestData, fingerprint, pdfBytes);
  return {
    pdf: pdfBytes,
    filename: fileNameForRequest(requestData),
    fingerprint,
    cacheHit: false,
    storagePath,
    source: "server-generated",
  };
}

export async function auditMtmPdfEvent(request, payload = {}) {
  await appendAuditLog({
    type: "mtm_pdf",
    templateVersion: TEMPLATE_VERSION,
    fieldMapVersion: FIELD_NAME_VERSION,
    timestamp: new Date().toISOString(),
    ip: clientIp(request),
    ...payload,
  });
}
