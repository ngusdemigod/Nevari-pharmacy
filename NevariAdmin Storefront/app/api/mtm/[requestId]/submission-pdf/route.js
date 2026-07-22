import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { buildMtmPdfFingerprint, mtmExpectedPdfPageCount, storeVerifiedBrowserPdf } from "../../../../lib/mtmPdf.js";
import { verifyMtmPdfSnapshotToken } from "../../../../lib/mtmPdfTokens.js";
import { sanitizeText } from "../../../../lib/inputValidation.js";
import { assertCsrfRequest, assertFrontendRequest, buildFrontendSession, proxyRawRequest, proxyRequest, validateFrontendSession, validateRequestId } from "../../_server.js";

const MAX_BROWSER_PDF_BYTES = 40 * 1024 * 1024;

export async function POST(request, { params }) {
  try {
    assertFrontendRequest(request);
    assertCsrfRequest(request);
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

    if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/pdf")) {
      return Response.json({ success: false, error: { message: "PDF content is required." } }, { status: 415 });
    }
    const snapshotToken = sanitizeText(request.headers.get("x-nevari-mtm-snapshot-token") || "", { max: 4000 });
    const claimedFingerprint = sanitizeText(request.headers.get("x-nevari-mtm-snapshot-fingerprint") || "", { max: 128 });
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
      return Response.json({ success: false, error: { message: "Snapshot token is not valid for this patient." } }, { status: 403 });
    }
    if (String(snapshot.requestReference || "") !== String(mtmRequest.request_reference || mtmRequest.id || "")) {
      return Response.json({ success: false, error: { message: "Snapshot token does not match the current MTM request reference." } }, { status: 409 });
    }

    const currentFingerprint = buildMtmPdfFingerprint(mtmRequest);
    if (claimedFingerprint !== currentFingerprint || String(snapshot.fingerprint || "") !== currentFingerprint) {
      return Response.json({ success: false, error: { message: "MTM request data changed before PDF upload completed. Please try again." } }, { status: 409 });
    }

    const pdfBytes = new Uint8Array(await request.arrayBuffer());
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
    const checksum = createHash("sha256").update(pdfBytes).digest("hex");
    const upstream = await proxyRawRequest(url.origin, session, `/mtm-requests/${encodeURIComponent(requestId)}/submission-pdf`, {
      method: "POST",
      body: pdfBytes,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/pdf",
        "X-Nevari-MTM-Snapshot-Token": snapshotToken,
        "X-Nevari-MTM-Snapshot-Fingerprint": currentFingerprint,
        "X-Nevari-Content-SHA256": checksum,
      },
    });
    const dispatchResponse = await upstream.json().catch(() => null);
    if (!upstream.ok || !dispatchResponse?.success) {
      const error = new Error(dispatchResponse?.error?.message || "Unable to finalize the MTM document.");
      error.status = upstream.status;
      throw error;
    }
    const dispatchPayload = dispatchResponse.data || {};

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
