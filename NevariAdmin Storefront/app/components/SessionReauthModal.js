"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_NEVARI_BASE_URL } from "./frontend-config";
import { defaultSession, saveSession } from "./role-session";
import { recaptchaErrorMessage, requireRecaptchaToken } from "../lib/recaptcha-client";
import RecaptchaDisclosure from "./RecaptchaDisclosure";

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
  const emailRef = useRef(null);
  const [stage, setStage] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState({ id: "", code: "", maskedEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStage("login");
    setPassword("");
    setChallenge({ id: "", code: "", maskedEmail: "" });
    setError("");
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }, [open]);

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

  return (
    <div className="session-reauth-layer" role="presentation">
      <section ref={dialogRef} className="session-reauth-dialog" role="dialog" aria-modal="true" aria-labelledby="session-reauth-title">
        <img className="session-reauth-logo" src="/ne.webp" alt="" aria-hidden="true" />
        <p className="section-kicker">Session paused</p>
        <h1 id="session-reauth-title">{stage === "verify" ? "Enter verification code" : "Sign in to continue"}</h1>
        <p className="session-reauth-copy">
          {stage === "verify"
            ? `Enter the code sent to ${challenge.maskedEmail || "your email"}.`
            : "Your work is still here. Sign in again to continue without leaving this page."}
        </p>
        {stage === "login" ? (
          <form className="session-reauth-form" onSubmit={submitLogin}>
            <label><span>Email</span><input ref={emailRef} type="email" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in and continue"}</button>
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
