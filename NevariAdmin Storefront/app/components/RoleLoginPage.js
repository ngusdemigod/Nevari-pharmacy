"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "./frontend-config";
import { setDocumentMetadata } from "./page-metadata";
import { buildUrl, defaultSession, frontendContext, isPairingRequiredPayload, loadSession, resetToPairingState, saveSession } from "./role-session";

function isSessionUsable(session) {
  const hasAccessToken = Boolean(String(session?.accessToken || "").trim());
  const expiresAt = Number(session?.expiresAt || 0);
  return hasAccessToken && Number.isFinite(expiresAt) && Date.now() < (expiresAt - 30_000);
}

function AuthButtonContent({ loading, loadingText, idleText }) {
  if (!loading) {
    return idleText;
  }

  return (
    <>
      <span className="auth-button-spinner" aria-hidden="true" />
      {loadingText}
    </>
  );
}

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
  const [resendLoading, setResendLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");

  useEffect(() => {
    let active = true;
    async function initializeSession() {
      let next = loadSession(config);
      router.prefetch(config.dashboardPath);
      if (next.baseUrl) {
        try {
          const response = await fetch(buildUrl(next, `/connections/status?frontend_type=${encodeURIComponent(config.type)}&probe=${Date.now()}`), {
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "X-Nevari-Frontend-Type": config.type,
              "X-Nevari-Frontend-Origin": window.location.origin
            }
          });
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.success && payload.data?.paired) {
            next = {
              ...next,
              paired: true,
              siteName: payload.data.site_name || "",
              siteLogo: payload.data.site_logo || "",
              frontendOrigin: window.location.origin,
              frontendUrl: window.location.href
            };
            saveSession(config, next);
          } else if (response.ok && payload?.success && payload.data?.paired === false) {
            next = { ...next, paired: false, accessToken: "", refreshToken: "", expiresAt: 0, user: null };
            saveSession(config, next);
          } else {
            setFeedback(payload?.error?.message || "Unable to verify the trusted dashboard domain. Try again shortly.");
            setSession(next);
            return;
          }
        } catch {
          setFeedback("Unable to verify the trusted dashboard domain. Try again shortly.");
          setSession(next);
          return;
        }
      }
      if (!active) return;
      setSession(next);
      if (!next.paired) {
        router.replace(config.setupPath || FRONTENDS.admin.setupPath);
      } else if (isSessionUsable(next)) {
        router.replace(config.dashboardPath);
      }
    }
    initializeSession();
    return () => {
      active = false;
    };
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
    setLoadingAction("signin");
    setFeedback("Signing in...");
    try {
      const response = await fetch(buildUrl(session, "/auth/login"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
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
    } finally {
      setLoadingAction("");
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setLoadingAction("verify");
    setFeedback("Verifying code...");
    try {
      const response = await fetch(buildUrl(session, "/auth/verify-code"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
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
    } finally {
      setLoadingAction("");
    }
  }

  async function resendCode() {
    if (!verification.challengeId) {
      setFeedback("No verification challenge is available. Sign in again.");
      return;
    }
    setResendLoading(true);
    setFeedback("Sending a new verification code...");
    try {
      const response = await fetch(buildUrl(session, "/auth/resend-code"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
        },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          ...frontendContext(session)
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        if (isPairingRequiredPayload(payload)) {
          resetToPairingState();
          return;
        }
        setFeedback(payload?.error?.message || "Failed to resend the verification code.");
        return;
      }
      setVerification((prev) => ({
        ...prev,
        challengeId: payload.data.challenge_id || prev.challengeId,
        maskedEmail: payload.data.masked_email || prev.maskedEmail,
        code: ""
      }));
      setFeedback(`A new code was sent to ${payload.data.masked_email || verification.maskedEmail || "your email"}.`);
    } finally {
      setResendLoading(false);
    }
  }

  async function requestReset(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      setFeedback("Admin storefront setup is required before this login can be used.");
      return;
    }
    setLoadingAction("reset");
    try {
      const response = await fetch(buildUrl(session, "/auth/password-reset"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
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
    } finally {
      setLoadingAction("");
    }
    setView("login");
  }

  async function registerCustomer(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      setFeedback("Admin storefront setup is required before this login can be used.");
      return;
    }
    setLoadingAction("register");
    try {
      const response = await fetch(buildUrl(session, "/auth/register-customer"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
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
    } finally {
      setLoadingAction("");
    }
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
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={loadingAction === "signin"}><AuthButtonContent loading={loadingAction === "signin"} loadingText="Signing in..." idleText="Sign In" /></button></div>
                <div className="auth-inline-links">
                  <button className="auth-text-link" type="button" onClick={() => setView("reset")}>Reset password</button>
                  {config.allowRegistration ? <button className="auth-text-link" type="button" onClick={() => setView("register")}>Create account</button> : null}
                </div>
              </form>
            ) : null}
            {view === "reset" ? (
              <form className="auth-form auth-reference-form" onSubmit={requestReset}>
                <label className="form-group"><span>Username or email</span><div className="input-wrap"><input value={resetUsername} onChange={(event) => setResetUsername(event.target.value)} required /></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={loadingAction === "reset"}><AuthButtonContent loading={loadingAction === "reset"} loadingText="Submitting..." idleText="Send Reset Link" /></button></div>
                <div className="auth-inline-links"><button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button></div>
              </form>
            ) : null}
            {view === "verify" ? (
              <form className="auth-form auth-reference-form" onSubmit={verifyCode}>
                <label className="form-group"><span>Verification code</span><div className="input-wrap"><input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={verification.code} onChange={(event) => setVerification((prev) => ({ ...prev, code: event.target.value.replace(/\D+/g, "").slice(0, 6) }))} required /></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={loadingAction === "verify"}><AuthButtonContent loading={loadingAction === "verify"} loadingText="Verifying..." idleText="Verify Code" /></button></div>
                <div className="auth-inline-links">
                  <button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button>
                  <button className="auth-text-link" type="button" onClick={resendCode} disabled={resendLoading}>
                    {resendLoading ? "Sending..." : "Resend code"}
                  </button>
                </div>
              </form>
            ) : null}
            {view === "register" && config.allowRegistration ? (
              <form className="auth-form auth-reference-form" onSubmit={registerCustomer}>
                <label className="form-group"><span>First name</span><div className="input-wrap"><input value={registration.firstName} onChange={(event) => setRegistration((prev) => ({ ...prev, firstName: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Last name</span><div className="input-wrap"><input value={registration.lastName} onChange={(event) => setRegistration((prev) => ({ ...prev, lastName: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Email</span><div className="input-wrap"><input type="email" value={registration.email} onChange={(event) => setRegistration((prev) => ({ ...prev, email: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Password</span><div className="input-wrap"><input type={registrationPasswordVisible ? "text" : "password"} minLength={8} value={registration.password} onChange={(event) => setRegistration((prev) => ({ ...prev, password: event.target.value }))} required /><button className="input-suffix auth-toggle-button" type="button" onClick={() => setRegistrationPasswordVisible((value) => !value)}>{registrationPasswordVisible ? "Hide" : "Show"}</button></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={loadingAction === "register"}><AuthButtonContent loading={loadingAction === "register"} loadingText="Creating..." idleText="Create Account" /></button></div>
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
