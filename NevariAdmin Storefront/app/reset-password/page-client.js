"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandedSpinner } from "../components/BrandedSpinner";
import { FRONTEND_BY_TYPE, FRONTENDS } from "../components/frontend-config";
import { buildUrl, defaultSession, frontendContext, loadSession } from "../components/role-session";
import { recaptchaErrorMessage, requireRecaptchaToken } from "../lib/recaptcha-client";
import RecaptchaDisclosure from "../components/RecaptchaDisclosure";

function passwordError(value) {
  const password = String(value || "");
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
}

function noticeTone(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("success")) return "success";
  if (text.includes("invalid") || text.includes("expired") || text.includes("error") || text.includes("unable")) return "error";
  return "warning";
}

export default function ResetPasswordPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = String(searchParams.get("login") || "").trim();
  const key = String(searchParams.get("key") || "").trim();
  const requestedFrontendType = String(searchParams.get("frontend_type") || FRONTENDS.patient.type).trim();
  const config = FRONTEND_BY_TYPE[requestedFrontendType] || null;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [notice, setNotice] = useState({ message: "Set a new password to continue.", tone: "warning" });
  const session = useMemo(() => {
    const resolvedConfig = config || FRONTENDS.patient;
    const stored = loadSession(resolvedConfig);
    return {
      ...defaultSession(resolvedConfig),
      ...stored,
      frontendType: resolvedConfig.type,
      frontendOrigin: typeof window !== "undefined" ? window.location.origin : stored.frontendOrigin || "",
      frontendUrl: typeof window !== "undefined" ? window.location.href : stored.frontendUrl || "",
      paired: true,
    };
  }, [config]);
  const dashboardName = String(config?.label || "Nevari Dashboard").replace(/^Nevari\s+/i, "").trim();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!login || !key || !config || submitting) {
      return;
    }

    const message = passwordError(password) || (password !== confirmPassword ? "Passwords do not match." : "");
    setFieldError(message);
    if (message) {
      setNotice({ message, tone: "error" });
      return;
    }

    setSubmitting(true);
    setNotice({ message: "Updating password...", tone: "warning" });
    try {
      const captchaToken = await requireRecaptchaToken("public_submit");
      const response = await fetch(buildUrl(session, "/auth/password-reset/confirm"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": config.type,
          "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
          "X-Nevari-Recaptcha-Token": captchaToken,
        },
        body: JSON.stringify({
          login,
          key,
          password,
          ...frontendContext(session),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const nextMessage = String(payload?.error?.message || "Unable to reset password.");
        setFieldError(nextMessage);
        setNotice({ message: nextMessage, tone: noticeTone(nextMessage) });
        return;
      }

      setCompleted(true);
      setFieldError("");
      setPassword("");
      setConfirmPassword("");
      setNotice({ message: "Password reset successful. You can now log in.", tone: "success" });
    } catch (error) {
      const nextMessage = error?.code?.startsWith("captcha_")
        ? recaptchaErrorMessage(error)
        : String(error?.message || "Unable to reset password.");
      setFieldError(nextMessage);
      setNotice({ message: nextMessage, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate-shell">
        <div className="auth-intro">
          <img className="auth-logo" src="/ne.webp" alt="Nevari logo" />
          <p className="auth-dashboard-name">{dashboardName}</p>
        </div>
        <section className="auth-card auth-screen-card">
          <div className="auth-card-body">
            <h1 className="auth-title">Reset password</h1>
            {!login || !key || !config ? (
              <div className="auth-form auth-reference-form">
                <p className="auth-subtitle">This password reset link is invalid or incomplete.</p>
                <div className="auth-actions"><button className="auth-primary-button" type="button" onClick={() => router.push(config?.loginPath || FRONTENDS.patient.loginPath)}>Back to login</button></div>
              </div>
            ) : completed ? (
              <div className="auth-form auth-reference-form">
                <p className="auth-subtitle">Your password has been updated successfully.</p>
                <div className="auth-actions"><button className="auth-primary-button" type="button" onClick={() => router.push(config.loginPath)}>Go to login</button></div>
              </div>
            ) : (
              <form className="auth-form auth-reference-form" onSubmit={handleSubmit}>
                <p className="auth-subtitle">Set a new password to continue to your dashboard.</p>
                <label className="form-group">
                  <span>New password</span>
                  <div className="input-wrap">
                    <input type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
                    <button className="input-suffix auth-toggle-button" type="button" onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? "Hide" : "Show"}</button>
                  </div>
                </label>
                <label className="form-group">
                  <span>Confirm password</span>
                  <div className="input-wrap">
                    <input type={confirmPasswordVisible ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
                    <button className="input-suffix auth-toggle-button" type="button" onClick={() => setConfirmPasswordVisible((visible) => !visible)}>{confirmPasswordVisible ? "Hide" : "Show"}</button>
                  </div>
                </label>
                {fieldError ? <small className="customer-mobile-field-error">{fieldError}</small> : null}
                <div className="auth-actions"><button className="auth-primary-button" type="submit" disabled={submitting}>
                  {submitting ? <BrandedSpinner label="Resetting password" /> : "Reset password"}
                </button></div>
                <div className="auth-inline-links">
                  <Link href={config.loginPath} className="auth-text-link">Back to login</Link>
                </div>
              </form>
            )}
            <RecaptchaDisclosure />
            {notice?.message ? (
              <div className={`snackbar auth-snackbar ${notice.tone}`} role="status">
                <span className="snackbar-title">{notice.tone === "error" ? "Error" : notice.tone === "success" ? "Success" : "Notice"}</span>
                <span className="snackbar-message">{notice.message}</span>
                <button className="auth-snackbar-close" type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
