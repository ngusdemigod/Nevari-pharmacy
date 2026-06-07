import { createHmac } from "node:crypto";
import { publishAppointmentEvent } from "../_hub";

const MAX_SKEW_SECONDS = 300;

function webhookSigningSecret() {
  return String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
}

function validateSignature(timestamp, rawBody, signature) {
  const secret = webhookSigningSecret();
  if (!secret || !timestamp || !signature) {
    return false;
  }
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(Date.now() / 1000 - numericTimestamp) > MAX_SKEW_SECONDS) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}\n${rawBody}`).digest("hex");
  return expected === signature;
}

export const dynamic = "force-dynamic";

export async function POST(request) {
  const rawBody = await request.text();
  const timestamp = String(request.headers.get("x-nevari-webhook-timestamp") || "").trim();
  const signature = String(request.headers.get("x-nevari-webhook-signature") || "").trim().toLowerCase();

  if (!validateSignature(timestamp, rawBody, signature)) {
    return Response.json({ success: false, error: { message: "Invalid webhook signature." } }, { status: 401 });
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return Response.json({ success: false, error: { message: "Invalid webhook payload." } }, { status: 400 });
  }

  const event = publishAppointmentEvent({
    ...payload,
    type: String(payload.event || "appointment.updated"),
    source: String(payload.source || "wordpress"),
  });

  return Response.json({ success: true, data: event }, { status: 200 });
}
