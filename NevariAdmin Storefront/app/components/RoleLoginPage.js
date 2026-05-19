"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "./frontend-config";
import { setDocumentMetadata } from "./page-metadata";
import { buildUrl, defaultSession, frontendContext, isPairingRequiredPayload, loadSession, resetToPairingState, saveSession } from "./role-session";

export default function RoleLoginPage({ config }) {
  const router = useRouter();
  const [session, setSession] = useState(() => defaultSession(config));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [registration, setRegistration] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [verification, setVerification] = useState({ challengeId: "", maskedEmail: "", code: "" });
  const [view, setView] = useState("login");
  const [feedback, setFeedback] = useState(config.loginPrompt || `Sign in to ${config.label}.`);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [registrationPasswordVisible, setRegistrationPasswordVisible] = useState(false);

  useEffect(() => {
    const next = loadSession(config);
    setSession(next);
    router.prefetch(config.dashboardPath);
    if (!next.paired) {
      router.replace(config.setupPath || FRONTENDS.admin.setupPath);
    } else if (next.refreshToken) {
      router.replace(config.dashboardPath);
    }
  }, [config, router]);

  useEffect(() => {
    const viewLabel = view === "verify" ? "Verify Login" : view === "reset" ? "Reset Password" : view === "register" ? "Create Account" : "Sign In";
    setDocumentMetadata(`${config.label} | ${viewLabel}`, `${viewLabel} for ${config.label}.`);
  }, [config.label, view]);

  async function signIn(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      setFeedback("Admin storefront setup is required before this login can be used.");
      return;
    }
    setFeedback("Signing in...");
    const response = await fetch(buildUrl(session, "/auth/login"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Nevari-Frontend-Type": session.frontendType,
        "X-Nevari-Frontend-Origin": session.frontendOrigin
      },
      body: JSON.stringify({ username, password, ...frontendContext(session) })
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      if (isPairingRequiredPayload(payload)) {
        resetToPairingState();
        return;
      }
      setFeedback(payload?.error?.message || "Sign in failed.");
      return;
    }
    if (payload.data.verification_required) {
      setVerification({
        challengeId: payload.data.challenge_id,
        maskedEmail: payload.data.masked_email || "",
        code: ""
      });
      setPassword("");
      setView("verify");
      setFeedback(`Enter the code sent to ${payload.data.masked_email || "your email"}.`);
      return;
    }
    const next = {
      ...session,
      accessToken: payload.data.access_token,
      refreshToken: payload.data.refresh_token,
      expiresAt: Date.now() + (Number(payload.data.expires_in || 0) * 1000),
      user: payload.data.user
    };
    saveSession(config, next);
    router.prefetch(config.dashboardPath);
    router.replace(config.dashboardPath);
  }

  async function verifyCode(event) {
    event.preventDefault();
    setFeedback("Verifying code...");
    const response = await fetch(buildUrl(session, "/auth/verify-code"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Nevari-Frontend-Type": session.frontendType,
        "X-Nevari-Frontend-Origin": session.frontendOrigin
      },
      body: JSON.stringify({
        challenge_id: verification.challengeId,
        code: verification.code,
        ...frontendContext(session)
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      if (isPairingRequiredPayload(payload)) {
        resetToPairingState();
        return;
      }
      setFeedback(payload?.error?.message || "Verification failed.");
      return;
    }
    const next = {
      ...session,
      accessToken: payload.data.access_token,
      refreshToken: payload.data.refresh_token,
      expiresAt: Date.now() + (Number(payload.data.expires_in || 0) * 1000),
      user: payload.data.user
    };
    saveSession(config, next);
    router.prefetch(config.dashboardPath);
    router.replace(config.dashboardPath);
  }

  async function requestReset(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      setFeedback("Admin storefront setup is required before this login can be used.");
      return;
    }
    const response = await fetch(buildUrl(session, "/auth/password-reset"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Nevari-Frontend-Type": session.frontendType,
        "X-Nevari-Frontend-Origin": session.frontendOrigin
      },
      body: JSON.stringify({ username: resetUsername, ...frontendContext(session) })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (isPairingRequiredPayload(payload)) {
        resetToPairingState();
        return;
      }
      setFeedback(payload?.error?.message || "Reset request failed.");
      return;
    }
    setFeedback("If that account exists, password reset instructions have been sent.");
    setView("login");
  }

  async function registerCustomer(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      setFeedback("Admin storefront setup is required before this login can be used.");
      return;
    }
    const response = await fetch(buildUrl(session, "/auth/register-customer"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Nevari-Frontend-Type": session.frontendType,
        "X-Nevari-Frontend-Origin": session.frontendOrigin
      },
      body: JSON.stringify({
        first_name: registration.firstName,
        last_name: registration.lastName,
        email: registration.email,
        password: registration.password,
        ...frontendContext(session)
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      if (isPairingRequiredPayload(payload)) {
        resetToPairingState();
        return;
      }
      setFeedback(payload?.error?.message || "Account creation failed.");
      return;
    }
    setFeedback(config.loginPrompt || "Sign in to continue.");
    setUsername(registration.email);
    setPassword("");
    setView("login");
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate-shell">
        <section className="auth-card auth-screen-card">
          <div className="auth-card-body">
            <div className="auth-intro">
              <img className="auth-logo" src="/ne.webp" alt="Nevari logo" />
              <h1 className="auth-title">{config.label}</h1>
            </div>
            {view === "login" ? (
              <form className="auth-form auth-reference-form" onSubmit={signIn}>
                <label className="form-group"><span>Username or email</span><div className="input-wrap"><input value={username} onChange={(event) => setUsername(event.target.value)} required /></div></label>
                <label className="form-group"><span>Password</span><div className="input-wrap"><input type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="input-suffix auth-toggle-button" type="button" onClick={() => setPasswordVisible((value) => !value)}>{passwordVisible ? "Hide" : "Show"}</button></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit">Sign In</button></div>
                <div className="auth-inline-links">
                  <button className="auth-text-link" type="button" onClick={() => setView("reset")}>Reset password</button>
                  {config.allowRegistration ? <button className="auth-text-link" type="button" onClick={() => setView("register")}>Create account</button> : null}
                </div>
              </form>
            ) : null}
            {view === "reset" ? (
              <form className="auth-form auth-reference-form" onSubmit={requestReset}>
                <label className="form-group"><span>Username or email</span><div className="input-wrap"><input value={resetUsername} onChange={(event) => setResetUsername(event.target.value)} required /></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit">Send Reset Link</button></div>
                <div className="auth-inline-links"><button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button></div>
              </form>
            ) : null}
            {view === "verify" ? (
              <form className="auth-form auth-reference-form" onSubmit={verifyCode}>
                <label className="form-group"><span>Verification code</span><div className="input-wrap"><input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={verification.code} onChange={(event) => setVerification((prev) => ({ ...prev, code: event.target.value.replace(/\D+/g, "").slice(0, 6) }))} required /></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit">Verify Code</button></div>
                <div className="auth-inline-links"><button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button></div>
              </form>
            ) : null}
            {view === "register" && config.allowRegistration ? (
              <form className="auth-form auth-reference-form" onSubmit={registerCustomer}>
                <label className="form-group"><span>First name</span><div className="input-wrap"><input value={registration.firstName} onChange={(event) => setRegistration((prev) => ({ ...prev, firstName: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Last name</span><div className="input-wrap"><input value={registration.lastName} onChange={(event) => setRegistration((prev) => ({ ...prev, lastName: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Email</span><div className="input-wrap"><input type="email" value={registration.email} onChange={(event) => setRegistration((prev) => ({ ...prev, email: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Password</span><div className="input-wrap"><input type={registrationPasswordVisible ? "text" : "password"} minLength={8} value={registration.password} onChange={(event) => setRegistration((prev) => ({ ...prev, password: event.target.value }))} required /><button className="input-suffix auth-toggle-button" type="button" onClick={() => setRegistrationPasswordVisible((value) => !value)}>{registrationPasswordVisible ? "Hide" : "Show"}</button></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit">Create Account</button></div>
                <div className="auth-inline-links"><button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button></div>
              </form>
            ) : null}
            <p className="auth-feedback">{feedback}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
