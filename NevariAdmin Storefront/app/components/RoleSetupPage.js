"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setDocumentMetadata } from "./page-metadata";
import { buildUrl, defaultSession, frontendContext, loadSession, saveSession } from "./role-session";

const PAIRING_FRONTEND_TYPE = "custom_frontend";

export default function RoleSetupPage({ config }) {
  const router = useRouter();
  const [session, setSession] = useState(() => defaultSession(config));
  const [pairingCode, setPairingCode] = useState("");
  const [feedback, setFeedback] = useState(`Pair ${config.label}.`);
  const [pairingRequired, setPairingRequired] = useState(() => !defaultSession(config).baseUrl);

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
        setPairingRequired(false);
        setFeedback(payload?.error?.message || "Unable to verify the trusted dashboard domain. Try again shortly.");
      } catch {
        setPairingRequired(false);
        setFeedback("Unable to verify the trusted dashboard domain. Try again shortly.");
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
      router.replace(config.loginPath);
    } catch (error) {
      setFeedback(error.message);
    }
  }

  return (
    <div className="auth-gate"><div className="auth-gate-shell"><section className="auth-card auth-screen-card"><div className="auth-card-body">
      <div className="auth-intro"><img className="auth-logo" src="/ne.webp" alt="Nevari logo" /><h1 className="auth-title">{`Pair ${config.label}`}</h1></div>
      {pairingRequired ? (
        <form className="auth-form auth-reference-form" onSubmit={submit}>
          <label className="form-group"><span>Pairing code</span><div className="input-wrap"><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} required /></div></label>
          <div className="auth-actions"><button className="auth-primary-button" type="submit">Verify Pairing</button></div>
        </form>
      ) : null}
      <p className="auth-feedback">{feedback}</p>
    </div></section></div></div>
  );
}
