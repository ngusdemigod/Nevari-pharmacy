"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_NEVARI_BASE_URL } from "./frontend-config";
import { defaultSession, saveSession } from "./role-session";
import { recaptchaErrorMessage, requireRecaptchaToken } from "../lib/recaptcha-client";
import RecaptchaDisclosure from "./RecaptchaDisclosure";

const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let googleIdentityScriptPromise = null;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google sign-in could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google sign-in could not be loaded."));
    document.head.appendChild(script);
  });
  return googleIdentityScriptPromise;
}

function resolveGoogleConfig(payload, responseOk) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const clientId = String(data?.client_id || data?.clientId || data?.google_client_id || data?.googleClientId || "").trim();
  const enabled = typeof data?.enabled === "boolean" ? data.enabled : responseOk;
  return { clientId, enabled: Boolean(enabled && clientId) };
}

function proxyUrl(path) {
  const params = new URLSearchParams({
    baseUrl: process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL,
    path,
  });
  return `/api/nevari-proxy?${params.toString()}`;
}

async function authHeaders(config) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Nevari-Frontend-Type": config.type,
    "X-Nevari-Frontend-Origin": window.location.origin,
    "X-Nevari-Recaptcha-Token": await requireRecaptchaToken("public_submit"),
  };
}

export default function SessionReauthModal({ open, config, onAuthenticated }) {
  const dialogRef = useRef(null);
  const identifierRef = useRef(null);
  const googleButtonRef = useRef(null);
  const [stage, setStage] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [challenge, setChallenge] = useState({ id: "", code: "", maskedEmail: "" });
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleAuth, setGoogleAuth] = useState({ enabled: false, clientId: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStage("login");
    setPassword("");
    setPasswordVisible(false);
    setChallenge({ id: "", code: "", maskedEmail: "" });
    setError("");
    window.setTimeout(() => identifierRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || !config) return undefined;
    let active = true;

    async function loadGoogleConfig() {
      try {
        const response = await fetch(proxyUrl("/auth/google-config"), {
          headers: {
            Accept: "application/json",
            "X-Nevari-Frontend-Type": config.type,
            "X-Nevari-Frontend-Origin": window.location.origin,
          },
        });
        const payload = await response.json().catch(() => null);
        if (active) setGoogleAuth(resolveGoogleConfig(payload, response.ok));
      } catch {
        if (active) setGoogleAuth({ enabled: false, clientId: "" });
      }
    }

    loadGoogleConfig();
    return () => {
      active = false;
    };
  }, [open, config]);

  useEffect(() => {
    if (!open || stage !== "login" || !googleAuth.enabled || !googleButtonRef.current) return undefined;
    let cancelled = false;

    async function renderGoogleButton() {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return;
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: googleAuth.clientId,
          callback: ({ credential }) => {
            if (credential) signInWithGoogle(credential);
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "signin_with",
          width: Math.min(400, googleButtonRef.current.clientWidth || 320),
        });
      } catch (caught) {
        if (!cancelled) setError(String(caught?.message || "Google sign-in could not be loaded."));
      }
    }

    renderGoogleButton();
    return () => {
      cancelled = true;
      if (googleButtonRef.current) googleButtonRef.current.innerHTML = "";
    };
  }, [open, stage, googleAuth]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keepFocus(event) {
      if (event.key === "Escape") event.preventDefault();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("input, button:not([disabled]), a[href]")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keepFocus, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocus, true);
    };
  }, [open]);

  if (!open || !config) return null;

  async function finishAuthentication(data) {
    const session = {
      ...defaultSession(config),
      accessToken: data.access_token || "server-session",
      refreshToken: data.refresh_token || "server-session",
      expiresAt: Date.now() + (Number(data.expires_in || 900) * 1000),
      user: data.user || null,
    };
    saveSession(config, session);
    onAuthenticated(session);
  }

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(proxyUrl("/auth/login"), {
        method: "POST",
        headers: await authHeaders(config),
        body: JSON.stringify({
          username: username.trim(),
          password,
          frontend_type: config.type,
          frontend_origin: window.location.origin,
          frontend_url: window.location.href,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Sign in failed.");
      if (payload.data?.verification_required) {
        setChallenge({
          id: payload.data.challenge_id || "",
          code: "",
          maskedEmail: payload.data.masked_email || "",
        });
        setPassword("");
        setStage("verify");
        return;
      }
      await finishAuthentication(payload.data || {});
    } catch (caught) {
      setError(caught?.code?.startsWith("captcha_") ? recaptchaErrorMessage(caught) : String(caught?.message || "Sign in failed."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(proxyUrl("/auth/verify-code"), {
        method: "POST",
        headers: await authHeaders(config),
        body: JSON.stringify({
          challenge_id: challenge.id,
          code: challenge.code,
          frontend_type: config.type,
          frontend_origin: window.location.origin,
          frontend_url: window.location.href,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Verification failed.");
      await finishAuthentication(payload.data || {});
    } catch (caught) {
      setError(caught?.code?.startsWith("captcha_") ? recaptchaErrorMessage(caught) : String(caught?.message || "Verification failed."));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle(credential) {
    setGoogleBusy(true);
    setError("");
    try {
      const response = await fetch(proxyUrl("/auth/google-login"), {
        method: "POST",
        headers: await authHeaders(config),
        body: JSON.stringify({
          credential,
          frontend_type: config.type,
          frontend_origin: window.location.origin,
          frontend_url: window.location.href,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Google sign-in failed.");
      if (payload.data?.verification_required) {
        setChallenge({
          id: payload.data.challenge_id || "",
          code: "",
          maskedEmail: payload.data.masked_email || "",
        });
        setStage("verify");
        return;
      }
      await finishAuthentication(payload.data || {});
    } catch (caught) {
      setError(caught?.code?.startsWith("captcha_") ? recaptchaErrorMessage(caught) : String(caught?.message || "Google sign-in failed."));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="session-reauth-layer" role="presentation">
      <section ref={dialogRef} className="session-reauth-dialog" role="dialog" aria-modal="true" aria-labelledby="session-reauth-title">
        <h1 id="session-reauth-title">{stage === "verify" ? "Verify code" : "Log in"}</h1>
        {stage === "verify" ? <p className="session-reauth-copy">Enter the code sent to {challenge.maskedEmail || "your email"}.</p> : null}
        {stage === "login" ? (
          <form className="session-reauth-form" onSubmit={submitLogin}>
            <label><span>Email</span><input ref={identifierRef} type="text" inputMode="email" autoCapitalize="none" spellCheck="false" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label><span>Password</span><span className="session-reauth-password-field"><input type={passwordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? "Hide" : "Show"}</button></span></label>
            <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</button>
            <div className="session-reauth-links">
              <a href={config.loginPath}>Reset password</a>
              {config.allowRegistration ? <a href={config.loginPath}>Create account</a> : null}
            </div>
            {googleAuth.enabled ? (
              <div className="auth-google-panel" aria-busy={googleBusy ? "true" : "false"}>
                <div className="auth-google-button-slot" ref={googleButtonRef} />
                {googleBusy ? <span className="auth-google-loading"><span className="auth-button-spinner" aria-hidden="true" /> Signing in with Google...</span> : null}
              </div>
            ) : null}
          </form>
        ) : (
          <form className="session-reauth-form" onSubmit={submitCode}>
            <label><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={challenge.code} onChange={(event) => setChallenge((current) => ({ ...current, code: event.target.value.replace(/\D/g, "").slice(0, 6) }))} required /></label>
            <button className="auth-primary-button" type="submit" disabled={busy || challenge.code.length !== 6}>{busy ? "Verifying…" : "Verify and continue"}</button>
            <button className="auth-text-link" type="button" onClick={() => setStage("login")} disabled={busy}>Use a different account</button>
          </form>
        )}
        {error ? <p className="session-reauth-error" role="alert">{error}</p> : null}
        <RecaptchaDisclosure />
      </section>
    </div>
  );
}
