"use client";

import { PDFDocument } from "pdf-lib";
import {
  appendMedicationContinuationPages,
  fillTemplateFields,
  normalizeMtmPdfPayload,
  suppressRepeatedStepFourHeader,
  validateNormalizedPayload,
} from "./mtmPdfShared.js";

let templateBytesPromise = null;

async function loadTemplateBytes() {
  if (!templateBytesPromise) {
    templateBytesPromise = fetch("/api/mtm/template", {
      method: "GET",
      headers: { Accept: "application/pdf" },
      cache: "force-cache",
      credentials: "same-origin",
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("MTM PDF template could not be loaded.");
      }
      return new Uint8Array(await response.arrayBuffer());
    });
  }
  return templateBytesPromise;
}

export async function generateBrowserMtmPdf(requestData) {
  const normalized = normalizeMtmPdfPayload(requestData);
  validateNormalizedPayload(normalized);
  const templateBytes = await loadTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  fillTemplateFields(form, normalized);
  await appendMedicationContinuationPages(pdfDoc, normalized);
  form.flatten();
  suppressRepeatedStepFourHeader(pdfDoc);
  return pdfDoc.save();
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return window.btoa(binary);
}
