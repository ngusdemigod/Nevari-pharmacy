import { NextResponse } from "next/server";
import { DEFAULT_NEVARI_BASE_URL } from "../../../components/frontend-config";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function configuredBaseUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL);
}

function configuredClientId() {
  return String(process.env.SSO_CLIENT_ID || "").trim();
}

function configuredClientSecret() {
  return String(process.env.SSO_CLIENT_SECRET || "").trim();
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const clientId = String(body.client_id || "").trim();
  const clientSecret = String(body.client_secret || "").trim();
  const code = String(body.code || "").trim();
  const redirectUri = String(body.redirect_uri || "").trim();

  if (!clientId || !clientSecret || !code || !redirectUri) {
    return NextResponse.json({
      success: false,
      error: {
        code: "validation_error",
        message: "client_id, client_secret, code, and redirect_uri are required."
      }
    }, { status: 422 });
  }

  if (!configuredClientId() || !configuredClientSecret()) {
    return NextResponse.json({
      success: false,
      error: {
        code: "sso_not_configured",
        message: "SSO client credentials are not configured on the dashboard."
      }
    }, { status: 500 });
  }

  if (clientId !== configuredClientId() || clientSecret !== configuredClientSecret()) {
    return NextResponse.json({
      success: false,
      error: {
        code: "invalid_client",
        message: "The SSO client credentials are invalid."
      }
    }, { status: 401 });
  }

  const response = await fetch(`${configuredBaseUrl()}/wp-json/nevari/v1/sso/verify-code`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  }).catch(() => null);

  if (!response) {
    return NextResponse.json({
      success: false,
      error: {
        code: "upstream_unavailable",
        message: "The SSO verification service is unavailable."
      }
    }, { status: 502 });
  }

  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload || {
    success: false,
    error: {
      code: "invalid_upstream_response",
      message: "The SSO verification response was invalid."
    }
  }, {
    status: response.status || 502,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
