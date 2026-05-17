"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "nevari_admin_storefront_session";
const API_NAMESPACE = "nevari/v1";
const FRONTEND_TYPE = "storefront";

function defaultSession() {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  const href = hasWindow ? window.location.href : "";

  return {
    baseUrl: "",
    frontendType: FRONTEND_TYPE,
    frontendOrigin: origin === "null" ? "null" : origin,
    frontendUrl: origin === "null" ? "null" : href,
    paired: false,
    siteName: "",
    siteLogo: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function frontendContext(session) {
  return {
    frontend_type: session.frontendType,
    frontend_origin: session.frontendOrigin,
    frontend_url: session.frontendUrl
  };
}

function buildUrl(session, path) {
  const url = new URL("/api/nevari-proxy", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("baseUrl", normalizeBaseUrl(session.baseUrl));
  url.searchParams.set("path", path);
  return url.toString();
}

function hydrateAuthSession(session, data) {
  return {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || session.refreshToken || "",
    expiresAt: Date.now() + (Number(data.expires_in || 0) * 1000),
    user: data.user || null
  };
}

function extractApiErrorMessage(payload) {
  if (payload?.error?.message) {
    return String(payload.error.message);
  }
  if (payload?.message) {
    return String(payload.message);
  }
  return "";
}

function isFileProtocol() {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

function describeRequestError(error) {
  const message = String(error?.message || "");
  if (!message || message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.") {
    if (isFileProtocol()) {
      return "Network request failed. Serve this storefront over http://localhost instead of file:// and verify the pharmacy CORS settings.";
    }
    return "Network request failed. Verify the pharmacy URL is reachable and allows this frontend origin.";
  }
  return message;
}

function htmlToTextMessage(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function InlineIcon({ id }) {
  return (
    <svg aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="i-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </symbol>
      <symbol id="i-lock" viewBox="0 0 24 24">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      </symbol>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [session, setSession] = useState(defaultSession);
  const [currentPage, setCurrentPage] = useState("overview");
  const [hydrated, setHydrated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [authView, setAuthView] = useState("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("Sign in to open the admin dashboard.");

  useEffect(() => {
    document.body.classList.add("auth-locked");
    return () => document.body.classList.remove("auth-locked");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSession((prev) => ({ ...prev, ...parsed }));
        setCurrentPage(parsed.currentPage || "overview");
      }
    } catch (error) {
      console.error("Could not load stored session", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!session.paired) {
      router.replace("/initialsetup");
      return;
    }
    if (session.refreshToken) {
      router.replace("/dashboard");
    }
  }, [hydrated, router, session.paired, session.refreshToken]);

  async function apiRequest(path, body) {
    let response;
    try {
      response = await fetch(buildUrl(session, path), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": session.frontendType,
          "X-Nevari-Frontend-Origin": session.frontendOrigin
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(describeRequestError(error));
    }

    const rawResponse = await response.text();
    let payload = null;
    if (rawResponse) {
      try {
        payload = JSON.parse(rawResponse);
      } catch {
        payload = null;
      }
    }

    if (!response.ok || !payload?.success) {
      throw new Error(extractApiErrorMessage(payload) || htmlToTextMessage(rawResponse) || `Request failed with status ${response.status}.`);
    }

    return payload;
  }

  function persistSession(nextSession) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextSession, currentPage }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setFeedback("Signing in...");

    try {
      const payload = await apiRequest("/auth/login", {
        username,
        password,
        ...frontendContext(session)
      });
      const nextSession = hydrateAuthSession(session, payload.data);
      setSession(nextSession);
      persistSession(nextSession);
      setPassword("");
      setPasswordVisible(false);
      setFeedback("Signed in. Opening dashboard...");
      router.replace("/dashboard");
    } catch (error) {
      console.error(error);
      setFeedback(error.message || "Login failed.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    setResetSubmitting(true);
    setFeedback("Sending reset instructions...");

    try {
      await apiRequest("/auth/password-reset", {
        username: resetUsername,
        ...frontendContext(session)
      });

      setFeedback("If that account exists, password reset instructions have been sent.");
      setAuthView("login");
    } catch (error) {
      console.error(error);
      setFeedback("Could not submit the reset request. Try again.");
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <>
      <IconSprite />
      <div className="auth-gate">
        <div className="auth-gate-shell">
          <section className="auth-card auth-screen-card">
            <div className="auth-card-body">
              <div className="auth-intro">
                <img className="auth-logo" src="/ne.webp" alt="Storefront logo" />
                <h1 className="auth-title">
                  {authView === "reset" ? "Reset your password" : "Signin to your storefront"}
                </h1>
              </div>
              {authView === "login" ? (
                <form className="auth-form auth-reference-form" onSubmit={handleLoginSubmit}>
                  <label className="form-group">
                    <span>Username or email</span>
                    <div className="input-wrap">
                      <span className="input-icon"><InlineIcon id="i-user" /></span>
                      <input
                        name="loginIdentifier"
                        type="text"
                        autoComplete="username"
                        required
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                      />
                    </div>
                  </label>
                  <label className="form-group">
                    <span>Password</span>
                    <div className="input-wrap">
                      <span className="input-icon"><InlineIcon id="i-lock" /></span>
                      <input
                        name="password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button className="input-suffix" type="button" onClick={() => setPasswordVisible((prev) => !prev)}>
                        {passwordVisible ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>
                  <div className="auth-actions">
                    <button className="auth-primary-button" type="submit" disabled={authSubmitting}>
                      {authSubmitting ? "Signing in..." : "Sign In"}
                    </button>
                  </div>
                  <div className="auth-inline-links">
                    <button className="auth-text-link" type="button" onClick={() => setAuthView("reset")}>
                      Reset password
                    </button>
                  </div>
                </form>
              ) : (
                <form className="auth-form auth-reference-form" onSubmit={handleResetSubmit}>
                  <label className="form-group">
                    <span>Username or email</span>
                    <div className="input-wrap">
                      <span className="input-icon"><InlineIcon id="i-user" /></span>
                      <input
                        name="resetUsername"
                        type="text"
                        autoComplete="username email"
                        required
                        value={resetUsername}
                        onChange={(event) => setResetUsername(event.target.value)}
                      />
                    </div>
                  </label>
                  <div className="auth-actions">
                    <button className="auth-primary-button" type="submit" disabled={resetSubmitting}>
                      {resetSubmitting ? "Submitting..." : "Send Reset Link"}
                    </button>
                  </div>
                  <div className="auth-inline-links">
                    <button className="auth-text-link" type="button" onClick={() => setAuthView("login")}>
                      Back to login
                    </button>
                  </div>
                </form>
              )}
              <p className="auth-feedback">{feedback}</p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
