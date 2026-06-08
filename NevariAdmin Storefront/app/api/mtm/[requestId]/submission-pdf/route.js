import { Buffer } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import { buildMtmPdfFingerprint, mtmDocumentFilename, mtmExpectedPdfPageCount, storeVerifiedBrowserPdf } from "../../../../lib/mtmPdf.js";
import { verifyMtmPdfSnapshotToken } from "../../../../lib/mtmPdfTokens.js";
import { sanitizeText } from "../../../../lib/inputValidation.js";
import { assertFrontendRequest, buildFrontendSession, proxyRequest, validateFrontendSession, validateRequestId } from "../../_server.js";

const MAX_BROWSER_PDF_BYTES = 8 * 1024 * 1024;

function decodeBase64Pdf(value) {
  const normalized = String(value || "").trim().replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "");
  if (!normalized) {
    throw new Error("PDF content is required.");
  }
  return Buffer.from(normalized, "base64");
}

export async function POST(request, { params }) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const frontendType = url.searchParams.get("frontendType") || "patient";
    const baseUrl = url.searchParams.get("baseUrl") || "";
    const resolvedParams = await params;
    const requestId = sanitizeText(resolvedParams.requestId || "", { max: 80 });
    if (!validateRequestId(requestId)) {
      return Response.json({ success: false, error: { message: "Invalid MTM request id." } }, { status: 422 });
    }

    const session = buildFrontendSession(request, url, frontendType, baseUrl);
    const sessionError = validateFrontendSession(session);
    if (sessionError) return sessionError;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ success: false, error: { message: "PDF upload payload must be an object." } }, { status: 400 });
    }

    const snapshotToken = sanitizeText(body.snapshotToken || body.snapshot_token || "", { max: 4000 });
    const claimedFingerprint = sanitizeText(body.fingerprint || body.snapshot_fingerprint || "", { max: 128 });
    if (!snapshotToken || !claimedFingerprint) {
      return Response.json({ success: false, error: { message: "Snapshot token and fingerprint are required." } }, { status: 422 });
    }

    const mtmPayload = await proxyRequest(url.origin, session, `/mtm-requests/${encodeURIComponent(requestId)}`);
    const mtmRequest = mtmPayload?.request || null;
    if (!mtmRequest?.id) {
      return Response.json({ success: false, error: { message: "MTM request could not be loaded." } }, { status: 404 });
    }

    const snapshot = verifyMtmPdfSnapshotToken(snapshotToken);
    if (String(snapshot.requestId || "") !== String(requestId)) {
      return Response.json({ success: false, error: { message: "Snapshot token does not match this MTM request." } }, { status: 403 });
    }
    if (String(snapshot.customerUserId || "") !== String(mtmRequest.customer_user_id || "")) {
      return Response.json({ success: false, error: { message: "Snapshot token is not valid for this customer." } }, { status: 403 });
    }
    if (String(snapshot.requestReference || "") !== String(mtmRequest.request_reference || mtmRequest.id || "")) {
      return Response.json({ success: false, error: { message: "Snapshot token does not match the current MTM request reference." } }, { status: 409 });
    }

    const currentFingerprint = buildMtmPdfFingerprint(mtmRequest);
    if (claimedFingerprint !== currentFingerprint || String(snapshot.fingerprint || "") !== currentFingerprint) {
      return Response.json({ success: false, error: { message: "MTM request data changed before PDF upload completed. Please try again." } }, { status: 409 });
    }

    const pdfBytes = decodeBase64Pdf(body.base64 || body.content || "");
    if (!pdfBytes.length || pdfBytes.length > MAX_BROWSER_PDF_BYTES) {
      return Response.json({ success: false, error: { message: "Uploaded PDF is missing or exceeds the size limit." } }, { status: 422 });
    }

    let parsedPdf;
    try {
      parsedPdf = await PDFDocument.load(pdfBytes);
    } catch {
      return Response.json({ success: false, error: { message: "Uploaded MTM PDF is malformed." } }, { status: 422 });
    }
    if (parsedPdf.isEncrypted) {
      return Response.json({ success: false, error: { message: "Encrypted PDFs are not allowed." } }, { status: 422 });
    }
    const expectedPages = mtmExpectedPdfPageCount(mtmRequest);
    if (parsedPdf.getPageCount() !== expectedPages) {
      return Response.json({ success: false, error: { message: "Uploaded MTM PDF does not match the expected page count." } }, { status: 422 });
    }

    await storeVerifiedBrowserPdf(mtmRequest, pdfBytes, currentFingerprint);
    const attachmentBase64 = Buffer.from(pdfBytes).toString("base64");
    const dispatchPayload = await proxyRequest(url.origin, session, `/mtm-requests/${encodeURIComponent(requestId)}/submission-pdf`, {
      method: "POST",
      body: {
        snapshot_token: snapshotToken,
        snapshot_fingerprint: currentFingerprint,
        submission_email_attachments: [{
          filename: mtmDocumentFilename(mtmRequest),
          mime_type: "application/pdf",
          content_type: "application/pdf",
          base64: attachmentBase64,
        }],
      },
    });

    return Response.json({
      success: true,
      data: {
        request: dispatchPayload?.request || mtmRequest,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "Unable to verify the MTM PDF upload." } }, { status: Number(error?.status || 500) });
  }
}
