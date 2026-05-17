"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setDocumentMetadata } from "./page-metadata";
import { buildUrl, defaultSession, frontendContext, saveSession } from "./role-session";

const PAIRING_FRONTEND_TYPE = "custom_frontend";

export default function RoleSetupPage({ config }) {
  const router = useRouter();
  const [session, setSession] = useState(() => defaultSession(config));
  const [pairingCode, setPairingCode] = useState("");
  const [feedback, setFeedback] = useState(`Pair ${config.label}.`);

  useEffect(() => {
    setDocumentMetadata(`${config.label} | Pairing Setup`, `Initial pairing for ${config.label}.`);
  }, [config.label]);

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
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Nevari-Frontend-Type": PAIRING_FRONTEND_TYPE, "X-Nevari-Frontend-Origin": working.frontendOrigin },
        body: JSON.stringify({ pairing_code: pairingCode, ...pairingContext })
      });
      const verify = await verifyResponse.json();
      if (!verifyResponse.ok || !verify?.success) throw new Error(verify?.error?.message || "Pairing failed.");
      const registerResponse = await fetch(buildUrl(working, "/connections/register"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Nevari-Frontend-Type": PAIRING_FRONTEND_TYPE, "X-Nevari-Frontend-Origin": working.frontendOrigin },
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
      <div className="auth-intro"><img className="auth-logo" src="/ne.webp" alt="Nevari logo" /><h1 className="auth-title">Pair {config.label}</h1></div>
      <form className="auth-form auth-reference-form" onSubmit={submit}>
        <label className="form-group"><span>Pairing code</span><div className="input-wrap"><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} required /></div></label>
        <div className="auth-actions"><button className="auth-primary-button" type="submit">Verify Pairing</button></div>
      </form>
      <p className="auth-feedback">{feedback}</p>
    </div></section></div></div>
  );
}
