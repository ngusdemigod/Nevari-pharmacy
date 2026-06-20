"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setDocumentMetadata } from "./page-metadata";
import { buildTwoStepVerificationRequest, loadAuthSecuritySettings } from "./auth-security-settings";
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

const RESEND_CODE_COOLDOWN_SECONDS = 60;
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let googleIdentityScriptPromise = null;

function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is available only in the browser."));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }
  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google sign-in script failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in script failed to load."));
    document.head.appendChild(script);
  });
  return googleIdentityScriptPromise;
}

function GoogleAuthPanel({ buttonRef, loading }) {
  return (
    <div className="auth-google-panel" aria-busy={loading ? "true" : "false"}>
      <div className="auth-google-button-slot" ref={buttonRef} />
      {loading ? <span className="auth-google-loading"><span className="auth-button-spinner" aria-hidden="true" /> Signing in with Google...</span> : null}
    </div>
  );
}

function resolveGoogleAuthConfig(payload, responseOk = false) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const clientId = String(
    data?.client_id
    || data?.clientId
    || data?.google_client_id
    || data?.googleClientId
    || ""
  ).trim();
  const enabledValue = data?.enabled;
  const enabled = typeof enabledValue === "boolean"
    ? enabledValue
    : Boolean(responseOk && clientId);

  return {
    clientId,
    enabled: Boolean(enabled && clientId),
  };
}

function authScreenTitle(view) {
  if (view === "register") {
    return "Sign up";
  }
  if (view === "reset") {
    return "Reset password";
  }
  if (view === "verify") {
    return "Verify code";
  }
  return "Log in";
}

function authDashboardName(config) {
  return config?.authDashboardName || String(config?.label || "").replace(/^Nevari\s+/i, "").trim() || "Dashboard";
}

function noticeTone(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("failed") || text.includes("error") || text.includes("unable") || text.includes("invalid") || text.includes("required")) {
    return "error";
  }
  if (text.includes("sent") || text.includes("success") || text.includes("created") || text.includes("updated") || text.includes("verified")) {
    return "success";
  }
  return "warning";
}

export default function RoleLoginPage({ config }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState(() => defaultSession(config));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [registration, setRegistration] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [verification, setVerification] = useState({ challengeId: "", maskedEmail: "", code: "", ssoTransactionId: "", returnPath: "" });
  const verificationInputRef = useRef(null);
  const [view, setView] = useState("login");
  const [notice, setNotice] = useState({ message: config.loginPrompt || `Sign in to ${config.label}.`, tone: "warning" });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [registrationPasswordVisible, setRegistrationPasswordVisible] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loadingAction, setLoadingAction] = useState("");
  const [googleAuth, setGoogleAuth] = useState({ checked: false, enabled: false, clientId: "" });
  const googleButtonRef = useRef(null);
  const [authSecuritySettings, setAuthSecuritySettings] = useState(() => loadAuthSecuritySettings());
  const dashboardName = authDashboardName(config);
  const screenTitle = authScreenTitle(view);
  const globalTwoStepVerificationEnabled = Boolean(authSecuritySettings.globalTwoStepVerification);
  const showNotice = (message, tone = noticeTone(message)) => {
    if (!message) {
      return;
    }
    setNotice({ message, tone });
  };
  const clearNotice = () => setNotice(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const syncAuthSecuritySettings = () => setAuthSecuritySettings(loadAuthSecuritySettings());
    window.addEventListener("storage", syncAuthSecuritySettings);
    return () => window.removeEventListener("storage", syncAuthSecuritySettings);
  }, []);

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
    if (view !== "verify" || resendCooldown <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown, view]);

  useEffect(() => {
    let active = true;
    async function initializeSession() {
      const next = loadSession(config);
      router.prefetch(config.dashboardPath);
      if (!active) return;
      setSession(next);
      if (isSessionUsable(next)) {
        router.replace(config.dashboardPath);
      }
    }
    initializeSession();
    return () => {
      active = false;
    };
  }, [config, router]);

  useEffect(() => {
    const challengeId = String(searchParams.get("challenge_id") || "").trim();
    if (!challengeId) {
      return;
    }

    const maskedEmail = String(searchParams.get("masked_email") || "").trim();
    const ssoTransactionId = String(searchParams.get("sso_transaction_id") || "").trim();
    const returnPath = String(searchParams.get("next") || "").trim();
    setVerification({
      challengeId,
      maskedEmail,
      code: "",
      ssoTransactionId,
      returnPath
    });
    setView("verify");
    setResendCooldown(RESEND_CODE_COOLDOWN_SECONDS);
    showNotice(`Enter the code sent to ${maskedEmail || "your email"}.`, "warning");
  }, [searchParams]);

  useEffect(() => {
    const viewLabel = view === "verify" ? "Verify Login" : view === "reset" ? "Reset Password" : view === "register" ? "Create Account" : "Sign In";
    setDocumentMetadata(`${config.label} | ${viewLabel}`, `${viewLabel} for ${config.label}.`);
  }, [config.label, view]);

  useEffect(() => {
    let active = true;
    async function loadGoogleConfig() {
      if (!session.baseUrl) {
        setGoogleAuth({ checked: true, enabled: false, clientId: "" });
        return;
      }
      try {
        const response = await fetch(buildUrl(session, "/auth/google-config"), {
          headers: {
            Accept: "application/json",
            "X-Nevari-Frontend-Type": session.frontendType,
            "X-Nevari-Frontend-Origin": window.location.origin
          }
        });
        const payload = await response.json().catch(() => null);
        if (!active) {
          return;
        }
        const googleConfig = resolveGoogleAuthConfig(payload, response.ok);
        setGoogleAuth({ checked: true, enabled: googleConfig.enabled, clientId: googleConfig.clientId });
      } catch {
        if (active) {
          setGoogleAuth({ checked: true, enabled: false, clientId: "" });
        }
      }
    }
    loadGoogleConfig();
    return () => {
      active = false;
    };
  }, [session.baseUrl, session.frontendType]);

  useEffect(() => {
    if (!googleAuth.enabled || !googleAuth.clientId || !googleButtonRef.current || !["login", "register"].includes(view)) {
      return undefined;
    }
    let cancelled = false;
    async function renderGoogleButton() {
      try {
        await loadGoogleIdentityScript();
      } catch {
        if (!cancelled) {
          showNotice("Google sign-in could not be loaded. Use email and password instead.", "error");
        }
        return;
      }
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleAuth.clientId,
        callback: (response) => {
          if (response?.credential) {
            signInWithGoogle(response.credential);
          }
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: view === "register" ? "signup_with" : "signin_with",
        width: 320
      });
    }
    renderGoogleButton();
    return () => {
      cancelled = true;
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
      }
    };
  }, [googleAuth.enabled, googleAuth.clientId, view]);

  async function signIn(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      showNotice("Base API URL is not configured. Set NEXT_PUBLIC_NEVARI_BASE_URL and try again.", "error");
      return;
    }
    setLoadingAction("signin");
    try {
      const response = await fetch(buildUrl(session, "/auth/login"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
        },
        body: JSON.stringify({
          username,
          password,
          ...frontendContext(session),
          ...buildTwoStepVerificationRequest(authSecuritySettings)
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        if (isPairingRequiredPayload(payload)) {
          resetToPairingState();
          return;
        }
        showNotice(payload?.error?.message || "Sign in failed.", "error");
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
        setResendCooldown(Number(payload.data.resend_cooldown || RESEND_CODE_COOLDOWN_SECONDS));
        showNotice(`Enter the code sent to ${payload.data.masked_email || "your email"}.`, "warning");
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

  async function signInWithGoogle(credential) {
    if (!session.baseUrl) {
      showNotice("Base API URL is not configured. Set NEXT_PUBLIC_NEVARI_BASE_URL and try again.", "error");
      return;
    }
    setLoadingAction("google");
    try {
      const response = await fetch(buildUrl(session, "/auth/google-login"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": window.location.origin
        },
        body: JSON.stringify({
          credential,
          ...frontendContext(session),
          ...buildTwoStepVerificationRequest(authSecuritySettings)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        if (isPairingRequiredPayload(payload)) {
          resetToPairingState();
          return;
        }
        showNotice(payload?.error?.message || "Google sign-in failed.", "error");
        return;
      }
      if (payload.data?.verification_required) {
        setVerification({
          challengeId: payload.data.challenge_id,
          maskedEmail: payload.data.masked_email || "",
          code: ""
        });
        setView("verify");
        setResendCooldown(Number(payload.data.resend_cooldown || RESEND_CODE_COOLDOWN_SECONDS));
        showNotice(`Enter the code sent to ${payload.data.masked_email || "your email"}.`, "warning");
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
          sso_transaction_id: verification.ssoTransactionId,
          ...frontendContext(session)
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        if (isPairingRequiredPayload(payload)) {
          resetToPairingState();
          return;
        }
        showNotice(payload?.error?.message || "Verification failed.", "error");
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
      const destination = verification.returnPath || config.dashboardPath;
      router.prefetch(destination);
      router.replace(destination);
    } finally {
      setLoadingAction("");
    }
  }

  async function resendCode() {
    if (!verification.challengeId) {
      showNotice("No verification challenge is available. Sign in again.", "error");
      return;
    }
    setResendLoading(true);
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
        const retryAfter = Number(payload?.error?.details?.retry_after || 0);
        if (retryAfter > 0) {
          setResendCooldown(retryAfter);
        }
        showNotice(payload?.error?.message || "Failed to resend the verification code.", "error");
        return;
      }
      setVerification((prev) => ({
        ...prev,
        challengeId: payload.data.challenge_id || prev.challengeId,
        maskedEmail: payload.data.masked_email || prev.maskedEmail,
        code: ""
      }));
      setResendCooldown(Number(payload.data.resend_cooldown || RESEND_CODE_COOLDOWN_SECONDS));
      showNotice(`A new code was sent to ${payload.data.masked_email || verification.maskedEmail || "your email"}.`, "success");
    } finally {
      setResendLoading(false);
    }
  }

  async function requestReset(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      showNotice("Base API URL is not configured. Set NEXT_PUBLIC_NEVARI_BASE_URL and try again.", "error");
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
        showNotice(payload?.error?.message || "Reset request failed.", "error");
        return;
      }
      showNotice("If that account exists, password reset instructions have been sent.", "success");
    } finally {
      setLoadingAction("");
    }
    setView("login");
  }

  async function registerCustomer(event) {
    event.preventDefault();
    if (!session.baseUrl) {
      showNotice("Base API URL is not configured. Set NEXT_PUBLIC_NEVARI_BASE_URL and try again.", "error");
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
        showNotice(payload?.error?.message || "Account creation failed.", "error");
        return;
      }
      showNotice(config.loginPrompt || "Sign in to continue.", "success");
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
        <div className="auth-intro">
          <img className="auth-logo" src="/ne.webp" alt="Nevari logo" />
          <p className="auth-dashboard-name">{dashboardName}</p>
        </div>
        <section className={`auth-card auth-screen-card ${view === "verify" ? "auth-verify-screen-card" : ""}`}>
          <div className={`auth-card-body ${view === "verify" ? "auth-verify-card-body" : ""}`}>
            {view !== "verify" ? <h1 className="auth-title">{screenTitle}</h1> : null}
            {view === "login" ? (
              <form className="auth-form auth-reference-form" onSubmit={signIn}>
                {globalTwoStepVerificationEnabled ? <p className="auth-subtitle">Two-step verification is enabled for this dashboard. After password sign-in, a one-time code will be sent to the account email.</p> : null}
                <label className="form-group"><span>Email</span><div className="input-wrap"><input value={username} onChange={(event) => setUsername(event.target.value)} required /></div></label>
                <label className="form-group"><span>Password</span><div className="input-wrap"><input type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="input-suffix auth-toggle-button" type="button" onClick={() => setPasswordVisible((value) => !value)}>{passwordVisible ? "Hide" : "Show"}</button></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={loadingAction === "signin"}><AuthButtonContent loading={loadingAction === "signin"} loadingText="Signing in..." idleText="Sign In" /></button></div>
                <div className="auth-inline-links">
                  <button className="auth-text-link" type="button" onClick={() => setView("reset")}>Reset password</button>
                  {config.allowRegistration ? <button className="auth-text-link" type="button" onClick={() => setView("register")}>Create account</button> : null}
                </div>
                {googleAuth.enabled ? <GoogleAuthPanel buttonRef={googleButtonRef} loading={loadingAction === "google"} /> : null}
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
              <form className="auth-form auth-reference-form auth-otp-form" onSubmit={verifyCode}>
                <div className="auth-otp-card">
                  <h2 className="auth-otp-title">{screenTitle}</h2>
                  <p className="auth-otp-recipient">Recipient: {verification.maskedEmail || "Waiting for OTP"}</p>
                  <input
                    ref={verificationInputRef}
                    className="auth-otp-hidden-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={verification.code}
                    onChange={(event) => setVerification((prev) => ({ ...prev, code: event.target.value.replace(/\D+/g, "").slice(0, 6) }))}
                    aria-label="Verification code"
                  />
                  <div className="auth-otp-boxes" role="group" aria-label="Verification code digits">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <button
                        className={`auth-otp-box ${verification.code[index] ? "filled" : ""}`}
                        key={`auth-otp-box-${index}`}
                        type="button"
                        onClick={() => verificationInputRef.current?.focus()}
                        aria-label={`Digit ${index + 1}`}
                      >
                        {verification.code[index] || ""}
                      </button>
                    ))}
                  </div>
                  <div className="auth-actions auth-otp-actions">
                    <button className="auth-primary-button auth-otp-submit" type="submit" disabled={loadingAction === "verify" || verification.code.length !== 6}>
                      <AuthButtonContent loading={loadingAction === "verify"} loadingText="Verifying..." idleText="Verify Code" />
                    </button>
                  </div>
                </div>
                <div className="auth-inline-links">
                  <button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button>
                  <button className="auth-text-link" type="button" onClick={resendCode} disabled={resendLoading || resendCooldown > 0}>
                    {resendLoading ? "Sending..." : resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                  </button>
                </div>
              </form>
            ) : null}
            {view === "register" && config.allowRegistration ? (
              <form className="auth-form auth-reference-form" onSubmit={registerCustomer}>
                {globalTwoStepVerificationEnabled ? <p className="auth-subtitle">Two-step verification is enabled. New sign-ins will require a one-time verification code.</p> : null}
                <label className="form-group"><span>First name</span><div className="input-wrap"><input value={registration.firstName} onChange={(event) => setRegistration((prev) => ({ ...prev, firstName: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Last name</span><div className="input-wrap"><input value={registration.lastName} onChange={(event) => setRegistration((prev) => ({ ...prev, lastName: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Email</span><div className="input-wrap"><input type="email" value={registration.email} onChange={(event) => setRegistration((prev) => ({ ...prev, email: event.target.value }))} required /></div></label>
                <label className="form-group"><span>Password</span><div className="input-wrap"><input type={registrationPasswordVisible ? "text" : "password"} minLength={8} value={registration.password} onChange={(event) => setRegistration((prev) => ({ ...prev, password: event.target.value }))} required /><button className="input-suffix auth-toggle-button" type="button" onClick={() => setRegistrationPasswordVisible((value) => !value)}>{registrationPasswordVisible ? "Hide" : "Show"}</button></div></label>
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={loadingAction === "register"}><AuthButtonContent loading={loadingAction === "register"} loadingText="Creating..." idleText="Create Account" /></button></div>
                <div className="auth-inline-links"><button className="auth-text-link" type="button" onClick={() => setView("login")}>Back to login</button></div>
                {googleAuth.enabled ? <GoogleAuthPanel buttonRef={googleButtonRef} loading={loadingAction === "google"} /> : null}
              </form>
            ) : null}
            {notice?.message ? (
              <div className={`snackbar auth-snackbar ${notice.tone}`}>
                <span className="snackbar-title">{notice.tone === "error" ? "Error" : notice.tone === "success" ? "Success" : "Notice"}</span>
                <span className="snackbar-message">{notice.message}</span>
                <button className="auth-snackbar-close" type="button" onClick={clearNotice} aria-label="Dismiss notice">×</button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
