import { createMtmPdfSnapshotToken } from "../../../lib/mtmPdfTokens.js";
import { assertFrontendRequest, buildFrontendSession, proxyRequest, validateFrontendSession } from "../_server.js";

export async function POST(request) {
  try {
    assertFrontendRequest(request);
    const url = new URL(request.url);
    const frontendType = url.searchParams.get("frontendType") || "patient";
    const baseUrl = url.searchParams.get("baseUrl") || "";
    const session = buildFrontendSession(request, url, frontendType, baseUrl);
    const sessionError = validateFrontendSession(session);
    if (sessionError) return sessionError;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ success: false, error: { message: "MTM submission payload must be an object." } }, { status: 400 });
    }

    const createPayload = await proxyRequest(url.origin, session, "/mtm-requests", {
      method: "POST",
      body: {
        ...body,
        defer_submission_notifications: true,
      },
    });
    const createdRequest = createPayload?.request || null;
    if (!createdRequest?.id) {
      return Response.json({ success: false, error: { message: "MTM request could not be created." } }, { status: 502 });
    }

    const snapshot = createMtmPdfSnapshotToken(createdRequest, {
      userId: createdRequest.customer_user_id,
    });

    return Response.json({
      success: true,
      data: {
        request: createdRequest,
        payment_decision: createPayload?.payment_decision || null,
        pdf_snapshot: {
          fingerprint: snapshot.fingerprint,
          token: snapshot.token,
          issued_at: snapshot.issuedAt,
          expires_at: snapshot.expiresAt,
        },
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: { message: error?.message || "Unable to submit the MTM request." } }, { status: Number(error?.status || 500) });
  }
}
