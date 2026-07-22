import { createHmac } from "node:crypto";
import { isAllowedUrl, sanitizeText } from "../../../../../lib/inputValidation";

function normalize(value) { return String(value || "").trim().replace(/\/+$/, ""); }
function allowedOrigins() { return String(process.env.NEVARI_PROXY_ALLOWED_ORIGINS || "").split(",").map(normalize).filter(Boolean); }
function cookieName(type) { return `nevari_access_${String(type || "unknown").replace(/[^a-z0-9_-]/gi, "_")}`; }

export async function PATCH(request, context) {
  try {
    const origin = new URL(request.url).origin;
    if (normalize(request.headers.get("origin")) !== origin || normalize(request.headers.get("x-nevari-frontend-origin")) !== origin) return Response.json({ success:false,error:{message:"Same-origin request required."}},{status:403});
    const { service, requestId } = await context.params;
    if (!new Set(["nurse", "iv-therapy"]).has(service) || !/^\d+$/.test(String(requestId))) return Response.json({success:false,error:{message:"Invalid care request."}},{status:422});
    const body = await request.json().catch(() => ({}));
    const baseUrl = normalize(body.baseUrl);
    if (!baseUrl || !isAllowedUrl(baseUrl, allowedOrigins())) return Response.json({success:false,error:{message:"Backend URL is not allowed."}},{status:400});
    const frontendType = sanitizeText(request.headers.get("x-nevari-frontend-type"), { max: 40 });
    const token = request.cookies.get(cookieName(frontendType))?.value || "";
    const secret = String(process.env.NEVARI_PROXY_SIGNING_SECRET || "").trim();
    if (!token || !secret) return Response.json({success:false,error:{message:"Authenticated session required."}},{status:401});
    const timestamp = String(Math.floor(Date.now()/1000));
    const signature = createHmac("sha256", secret).update(`${timestamp}\n${frontendType}\n${origin}`).digest("hex");
    const allowed = ["status","urgency","eligible","physician_approval_required","nurse_user_id","clinician_user_id","scheduled_at","patient_safe_message","clinical","completion"];
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    const response = await fetch(`${baseUrl}/wp-json/nevari/v1/staff/care-requests/${service}/${requestId}`, {
      method:"PATCH", headers:{ authorization:`Bearer ${token}`,"content-type":"application/json","x-nevari-frontend-type":frontendType,"x-nevari-frontend-origin":origin,"x-nevari-proxy-timestamp":timestamp,"x-nevari-proxy-signature":signature }, body:JSON.stringify(payload), signal:AbortSignal.timeout(20000)
    });
    return new Response(response.body,{status:response.status,headers:{"content-type":response.headers.get("content-type")||"application/json","cache-control":"no-store"}});
  } catch { return Response.json({success:false,error:{message:"Unable to update the care request."}},{status:400}); }
}
