"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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

async function webpToPngBytes(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("WebP image could not be decoded."));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("WebP image could not be converted for the PDF.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function appendImagePages(pdfDoc, requestData, imageFiles) {
  const attachments = Array.isArray(requestData?.attachments) ? requestData.attachments : [];
  if (imageFiles.length !== attachments.length) throw new Error("MTM attachment metadata does not match the selected images.");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const templatePage = pdfDoc.getPage(0);
  const { width, height } = templatePage.getSize();
  for (let index = 0; index < imageFiles.length; index += 1) {
    const item = imageFiles[index];
    const file = item?.file;
    const type = String(file?.type || "").toLowerCase();
    if (!file || file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("An MTM image is invalid or exceeds 5MB.");
    const bytes = type === "image/webp" ? await webpToPngBytes(file) : new Uint8Array(await file.arrayBuffer());
    const embedded = type === "image/jpeg" ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
    const page = pdfDoc.addPage([width, height]);
    const heading = String(item.heading || attachments[index]?.heading || `Attachment ${index + 1}`).slice(0, 120);
    page.drawText("Nevari MTM Supporting Document", { x: 44, y: height - 54, size: 16, font: bold, color: rgb(0.055, 0.161, 0.333) });
    page.drawText(heading, { x: 44, y: height - 80, size: 13, font: bold, color: rgb(0.08, 0.2, 0.42) });
    page.drawText(`Request: ${String(requestData?.request_reference || requestData?.id || "").slice(0, 60)}`, { x: 44, y: height - 100, size: 9, font });
    page.drawText(`Patient: ${String(requestData?.patient?.name || "").slice(0, 120)}`, { x: 44, y: height - 115, size: 9, font });
    page.drawText(`File: ${String(file.name || "image").slice(0, 120)}`, { x: 44, y: height - 130, size: 8, font, color: rgb(0.3, 0.35, 0.42) });
    const maxWidth = width - 88;
    const maxHeight = height - 200;
    const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height, 1);
    const imageWidth = embedded.width * scale;
    const imageHeight = embedded.height * scale;
    page.drawImage(embedded, { x: (width - imageWidth) / 2, y: Math.max(40, height - 160 - imageHeight), width: imageWidth, height: imageHeight });
  }
}

export async function generateBrowserMtmPdf(requestData, imageFiles = []) {
  const normalized = normalizeMtmPdfPayload(requestData);
  validateNormalizedPayload(normalized);
  const templateBytes = await loadTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  fillTemplateFields(form, normalized);
  await appendMedicationContinuationPages(pdfDoc, normalized);
  await appendImagePages(pdfDoc, requestData, imageFiles);
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
