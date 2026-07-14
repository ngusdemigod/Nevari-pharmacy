"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandedSpinner } from "../components/BrandedSpinner";
import { FRONTENDS } from "../components/frontend-config";
import { buildUrl, defaultSession, frontendContext, loadSession } from "../components/role-session";

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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [notice, setNotice] = useState({ message: "Set a new password to continue.", tone: "warning" });
  const session = useMemo(() => {
    const config = FRONTENDS.patient;
    const stored = loadSession(config);
    return {
      ...defaultSession(config),
      ...stored,
      frontendType: config.type,
      frontendOrigin: typeof window !== "undefined" ? window.location.origin : stored.frontendOrigin || "",
      frontendUrl: typeof window !== "undefined" ? window.location.href : stored.frontendUrl || "",
      paired: true,
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!login || !key || submitting) {
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
      const response = await fetch(buildUrl(session, "/auth/password-reset/confirm"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": FRONTENDS.patient.type,
          "X-Nevari-Frontend-Origin": typeof window !== "undefined" ? window.location.origin : "",
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
      const nextMessage = String(error?.message || "Unable to reset password.");
      setFieldError(nextMessage);
      setNotice({ message: nextMessage, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-badge">Nevari Health</div>
          <h1>Reset password</h1>
          <p>Finish resetting your dashboard password here.</p>
        </div>

        <div className={`auth-notice ${notice.tone}`}>{notice.message}</div>

        {!login || !key ? (
          <div className="auth-form">
            <div className="auth-helper-copy">This password reset link is invalid or incomplete.</div>
            <button className="auth-primary-button" type="button" onClick={() => router.push("/login")}>
              Back to login
            </button>
          </div>
        ) : completed ? (
          <div className="auth-form">
            <div className="auth-helper-copy">Your password has been updated successfully.</div>
            <button className="auth-primary-button" type="button" onClick={() => router.push("/login")}>
              Go to login
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="form-group">
              <span>New password</span>
              <div className="input-wrap">
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
              </div>
            </label>
            <label className="form-group">
              <span>Confirm password</span>
              <div className="input-wrap">
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
              </div>
            </label>
            {fieldError ? <small className="customer-mobile-field-error">{fieldError}</small> : null}
            <button className="auth-primary-button" type="submit" disabled={submitting}>
              {submitting ? <BrandedSpinner label="Resetting password" /> : "Reset password"}
            </button>
            <div className="auth-footer-links">
              <Link href="/login" className="auth-text-link">Back to login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
