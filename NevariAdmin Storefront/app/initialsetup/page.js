"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "nevari_admin_storefront_session";
const API_NAMESPACE = "nevari/v1";
const FRONTEND_TYPE = "storefront";

function defaultSession() {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  const href = hasWindow ? window.location.href : "";

  return {
    baseUrl: "",
    frontendType: FRONTEND_TYPE,
    frontendOrigin: origin === "null" ? "null" : origin,
    frontendUrl: origin === "null" ? "null" : href,
    paired: false,
    siteName: "",
    siteLogo: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePairingCode(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/NV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9]+/i);
  return match ? match[0] : raw;
}

function decodePairingBaseUrl(pairingCode) {
  const normalizedCode = normalizePairingCode(pairingCode);
  const parts = normalizedCode.split(".");
  if (parts.length < 3) {
    throw new Error("Pairing code is incomplete. Paste the full code from WordPress.");
  }

  const [version, encodedBaseUrl, secret] = parts;
  if (version.toUpperCase() !== "NV1" || !encodedBaseUrl || !secret) {
    throw new Error("Pairing code format is invalid.");
  }

  const base64 = encodedBaseUrl.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  let decoded = "";

  try {
    decoded = atob(padded);
  } catch {
    throw new Error("Pairing code format is invalid. Generate a new code and paste it exactly as shown in WordPress.");
  }

  const baseUrl = normalizeBaseUrl(decoded);
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("Pairing code did not contain a valid pharmacy URL.");
  }

  return baseUrl;
}

function buildUrl(session, path) {
  const url = new URL("/api/nevari-proxy", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", normalizeBaseUrl(session.baseUrl));
  url.searchParams.set("path", path);
  return url.toString();
}

function frontendContext(session) {
  return {
    frontend_type: session.frontendType,
    frontend_origin: session.frontendOrigin,
    frontend_url: session.frontendUrl
  };
}

function extractApiErrorMessage(payload) {
  if (payload?.error?.message) {
    return String(payload.error.message);
  }
  if (payload?.message) {
    return String(payload.message);
  }
  return "";
}

function InlineIcon({ id }) {
  return (
    <svg aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="i-link" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3Z" />
        <path d="m9.5 12 1.7 1.7 3.8-4.2" />
      </symbol>
    </svg>
  );
}

export default function InitialSetupPage() {
  const router = useRouter();
  const [session, setSession] = useState(defaultSession);
  const [pairingCode, setPairingCode] = useState("");
  const [feedback, setFeedback] = useState("Enter the pairing code to trust this storefront.");
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState("overview");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      setSession((prev) => ({ ...prev, ...parsed }));
      setCurrentPage(parsed.currentPage || "overview");
    } catch (error) {
      console.error("Could not load stored session", error);
    }
  }, []);

  async function apiRequest(activeSession, path, body) {
    let response;
    try {
      response = await fetch(buildUrl(activeSession, path), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": activeSession.frontendType,
          "X-Nevari-Frontend-Origin": activeSession.frontendOrigin
        },
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error("Network request failed. Verify the pharmacy URL is reachable and allows this frontend origin.");
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(extractApiErrorMessage(payload) || `Request failed with status ${response.status}.`);
    }

    return payload;
  }

  async function handlePairingSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("Verifying pairing code...");

    try {
      const baseUrl = decodePairingBaseUrl(pairingCode);
      const workingSession = { ...session, baseUrl: normalizeBaseUrl(baseUrl) };

      const verifyPayload = await apiRequest(workingSession, "/connections/verify", {
        pairing_code: pairingCode,
        ...frontendContext(workingSession)
      });

      const registerPayload = await apiRequest(workingSession, "/connections/register", {
        pairing_session_id: verifyPayload.data.pairing_session_id,
        ...frontendContext(workingSession),
        connection_status: "trusted"
      });

      const nextSession = {
        ...workingSession,
        paired: true,
        siteName: registerPayload.data.site_name || verifyPayload.data.site_name || "",
        siteLogo: registerPayload.data.site_logo || verifyPayload.data.site_logo || ""
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextSession, currentPage }));
      setSession(nextSession);
      setFeedback("Pairing verified. Redirecting to sign in...");
      router.replace("/dashboard");
    } catch (error) {
      console.error(error);
      setFeedback(error.message || "Pairing failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <IconSprite />
      <div className="auth-gate">
        <div className="auth-gate-shell">
          <section className="auth-card auth-screen-card">
            <div className="auth-card-body">
              <div className="auth-intro">
                <img className="auth-logo" src="/ne.webp" alt="Storefront logo" />
                <h1 className="auth-title">Pair your storefront</h1>
              </div>
              <form className="auth-form auth-reference-form" onSubmit={handlePairingSubmit}>
                <label className="form-group">
                  <span>Frontend type</span>
                  <div className="input-wrap">
                    <span className="input-icon"><InlineIcon id="i-link" /></span>
                    <input name="frontendType" type="text" value={session.frontendType} readOnly />
                  </div>
                </label>
                <label className="form-group">
                  <span>Pairing code</span>
                  <div className="input-wrap">
                    <span className="input-icon"><InlineIcon id="i-shield" /></span>
                    <input
                      name="pairingCode"
                      type="text"
                      placeholder="NV1.xxxxx.yyyyy"
                      required
                      value={pairingCode}
                      onChange={(event) => setPairingCode(event.target.value)}
                    />
                  </div>
                </label>
                <div className="auth-actions">
                  <button className="auth-primary-button" type="submit" disabled={submitting}>
                    {submitting ? "Verifying..." : "Verify Pairing"}
                  </button>
                </div>
              </form>
              <p className="auth-feedback">{feedback}</p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
