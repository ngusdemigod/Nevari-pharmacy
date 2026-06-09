"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setDocumentMetadata } from "./page-metadata";
import { buildUrl, defaultSession, frontendContext, loadSession, saveSession } from "./role-session";

const PAIRING_FRONTEND_TYPE = "custom_frontend";

function isRecoverablePairingProbeFailure(payload) {
  const code = String(payload?.code || payload?.error?.code || "");
  const message = String(payload?.message || payload?.error?.message || "");
  return code === "invalid_request_origin"
    || code === "validation_error"
    || /verified frontend request origin/i.test(message)
    || /valid request origin/i.test(message);
}

export default function RoleSetupPage({ config }) {
  const router = useRouter();
  const [session, setSession] = useState(() => defaultSession(config));
  const [pairingCode, setPairingCode] = useState("");
  const [notice, setNotice] = useState({ message: `Pair ${config.label}.`, tone: "warning" });
  const [pairingRequired, setPairingRequired] = useState(() => !defaultSession(config).baseUrl);

  function showNotice(message, tone = "warning") {
    if (!message) {
      return;
    }
    setNotice({ message, tone });
  }

  function clearNotice() {
    setNotice(null);
  }

  useEffect(() => {
    if (!notice?.message) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.message === notice.message ? null : current));
    }, notice.tone === "error" ? 5200 : 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setDocumentMetadata(`${config.label} | Pairing Setup`, `Initial pairing for ${config.label}.`);
  }, [config.label]);

  useEffect(() => {
    let active = true;

    async function checkCurrentOrigin() {
      const current = loadSession(config);
      setSession(current);
      if (!current.baseUrl) {
        setPairingRequired(true);
        return;
      }

      try {
        const response = await fetch(buildUrl(current, `/connections/status?frontend_type=${encodeURIComponent(config.type)}&probe=${Date.now()}`), {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "X-Nevari-Frontend-Type": config.type,
            "X-Nevari-Frontend-Origin": window.location.origin
          }
        });
        const payload = await response.json().catch(() => null);
        if (!active) return;
        if (response.ok && payload?.success && payload.data?.paired) {
          const next = {
            ...current,
            paired: true,
            siteName: payload.data.site_name || "",
            siteLogo: payload.data.site_logo || "",
            frontendOrigin: window.location.origin,
            frontendUrl: window.location.href
          };
          saveSession(config, next);
          router.replace(config.loginPath);
          return;
        }
        if (response.ok && payload?.success && payload.data?.paired === false) {
          setPairingRequired(true);
          return;
        }
        if (isRecoverablePairingProbeFailure(payload)) {
          setPairingRequired(true);
          showNotice(payload?.error?.message || "A verified frontend request origin is required. Enter a fresh pairing code to connect this dashboard.", "error");
          return;
        }
        setPairingRequired(false);
        showNotice(payload?.error?.message || "Unable to verify the trusted dashboard domain. Try again shortly.", "error");
      } catch {
        setPairingRequired(true);
        showNotice("Unable to verify the trusted dashboard domain. Try again shortly.", "error");
      }
    }

    checkCurrentOrigin();
    return () => {
      active = false;
    };
  }, [config, router]);

  function pairingBaseUrl(code) {
    const [, encoded] = code.trim().split(".");
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return atob(`${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`).replace(/\/+$/, "");
  }

  async function submit(event) {
    event.preventDefault();
    try {
      const working = { ...session, baseUrl: pairingBaseUrl(pairingCode) };
      const pairingContext = {
        ...frontendContext(working),
        frontend_type: PAIRING_FRONTEND_TYPE
      };
      const verifyResponse = await fetch(buildUrl(working, "/connections/verify"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Nevari-Frontend-Type": PAIRING_FRONTEND_TYPE, "X-Nevari-Frontend-Origin": window.location.origin },
        body: JSON.stringify({ pairing_code: pairingCode, ...pairingContext })
      });
      const verify = await verifyResponse.json();
      if (!verifyResponse.ok || !verify?.success) throw new Error(verify?.error?.message || "Pairing failed.");
      const registerResponse = await fetch(buildUrl(working, "/connections/register"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Nevari-Frontend-Type": PAIRING_FRONTEND_TYPE, "X-Nevari-Frontend-Origin": window.location.origin },
        body: JSON.stringify({ pairing_session_id: verify.data.pairing_session_id, ...pairingContext })
      });
      const registered = await registerResponse.json();
      if (!registerResponse.ok || !registered?.success) throw new Error(registered?.error?.message || "Pairing failed.");
      const next = { ...working, paired: true, siteName: registered.data.site_name || "", siteLogo: registered.data.site_logo || "" };
      saveSession(config, next);
      setSession(next);
      showNotice("Dashboard paired.", "success");
      router.replace(config.loginPath);
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  return (
    <div className="auth-gate"><div className="auth-gate-shell"><div className="auth-intro"><img className="auth-logo" src="/ne.webp" alt="Nevari logo" /><p className="auth-dashboard-name">{config?.authDashboardName || "Admin"}</p></div><section className="auth-card auth-screen-card"><div className="auth-card-body">
      <h1 className="auth-title">Pair dashboard</h1>
      {pairingRequired ? (
        <form className="auth-form auth-reference-form" onSubmit={submit}>
          <label className="form-group"><span>Pairing code</span><div className="input-wrap"><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} required /></div></label>
          <div className="auth-actions"><button className="auth-primary-button" type="submit">Verify Pairing</button></div>
        </form>
      ) : null}
      {notice?.message ? (
        <div className={`snackbar auth-snackbar ${notice.tone}`}>
          <span className="snackbar-title">{notice.tone === "error" ? "Error" : notice.tone === "success" ? "Success" : "Notice"}</span>
          <span className="snackbar-message">{notice.message}</span>
          <button className="auth-snackbar-close" type="button" onClick={clearNotice} aria-label="Dismiss notice">×</button>
        </div>
      ) : null}
    </div></section></div></div>
  );
}
