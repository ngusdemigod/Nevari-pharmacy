"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BrandedSpinner } from "../../../components/BrandedSpinner";

const BRAND = {
  shell: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "#ffffff",
  },
  stack: {
    width: "min(320px, 100%)",
    display: "grid",
    justifyItems: "center",
    gap: "14px",
    textAlign: "center",
  },
  logo: {
    width: "56px",
    height: "56px",
    margin: "0 auto",
    display: "grid",
    placeItems: "center",
  },
  body: {
    margin: 0,
    color: "#8a8f98",
    fontSize: "14px",
    lineHeight: 1.35,
    maxWidth: "220px",
  },
  actions: {
    display: "grid",
    gap: "10px",
    width: "min(320px, 100%)",
    marginTop: "4px",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "48px",
    padding: "0 22px",
    borderRadius: "999px",
    background: "#0E2955",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 600,
    border: "1px solid #0E2955",
    cursor: "pointer",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "48px",
    padding: "0 22px",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#0E2955",
    border: "1px solid #0E2955",
    textDecoration: "none",
    fontWeight: 600,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
};

export default function AppointmentJoinPage({ params }) {
  const resolvedParams = use(params);
  const token = String(resolvedParams?.token || "").trim();
  const [state, setState] = useState({
    loading: true,
    view: "loading",
    message: "Checking appointment access...",
    redirectUrl: "",
    bookUrl: "/dashboard",
    notifyDisabled: false,
    notifyCooldownSeconds: 0,
  });
  const [actionBusy, setActionBusy] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [joinCountdown, setJoinCountdown] = useState(10);
  const autoJoinAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/appointment/join/${encodeURIComponent(token)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) {
          return;
        }
        const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
        if (!response.ok) {
          setState({
            loading: false,
            view: response.status === 410 ? "ended" : "unavailable",
            message: data?.error?.message || payload?.error?.message || "Kindly check back on your appointment time",
            redirectUrl: "",
            bookUrl: data?.book_url || "/dashboard",
          });
          return;
        }
        if (data?.state === "active") {
          setState({
            loading: false,
            view: "active",
            message: data?.message || "Your appointment is ready.",
            redirectUrl: data?.redirect_url || "",
            bookUrl: data?.book_url || "/dashboard",
            notifyDisabled: Boolean(data?.notify?.disabled),
            notifyCooldownSeconds: Number(data?.notify?.cooldown_seconds || 0),
          });
          return;
        }
        setState({
          loading: false,
          view: data?.state === "ended" ? "ended" : "unavailable",
          message: data?.message || (data?.state === "ended" ? "Meeting has ended" : "Kindly check back on your appointment time"),
          redirectUrl: "",
          bookUrl: data?.book_url || "/dashboard",
          notifyDisabled: Boolean(data?.notify?.disabled),
          notifyCooldownSeconds: Number(data?.notify?.cooldown_seconds || 0),
        });
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            view: "unavailable",
            message: "Kindly check back on your appointment time",
            redirectUrl: "",
            bookUrl: "/dashboard",
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    setCooldown(Math.max(0, Number(state.notifyCooldownSeconds || 0)));
  }, [state.notifyCooldownSeconds]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function goToMeeting({ automatic = false } = {}) {
    if (!state.redirectUrl || actionBusy) return;
    const preparedWindow = automatic ? null : window.open("about:blank", "_blank", "noopener,noreferrer");
    setActionBusy("join");
    try {
      const response = await fetch(`/api/appointment/join/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
      if (response.ok && data?.redirect_url) {
        const meetingWindow = preparedWindow || window.open(data.redirect_url, "_blank", "noopener,noreferrer");
        if (preparedWindow) {
          preparedWindow.location.replace(data.redirect_url);
        }
        setState((current) => ({
          ...current,
          message: meetingWindow ? "The appointment opened in a new tab." : "Your browser blocked the new tab. Select Open meeting to continue.",
          redirectUrl: data.redirect_url,
        }));
        return;
      }
      preparedWindow?.close();
      setState((current) => ({
        ...current,
        view: response.status === 410 ? "ended" : "unavailable",
        message: data?.error?.message || payload?.error?.message || "Kindly check back on your appointment time",
        redirectUrl: "",
      }));
    } finally {
      setActionBusy("");
    }
  }

  useEffect(() => {
    if (state.view !== "active" || !state.redirectUrl || autoJoinAttemptedRef.current) return undefined;
    if (joinCountdown <= 0) {
      autoJoinAttemptedRef.current = true;
      void goToMeeting({ automatic: true });
      return undefined;
    }
    const timer = window.setTimeout(() => setJoinCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [joinCountdown, state.redirectUrl, state.view]);

  async function notifyOthers() {
    if (state.notifyDisabled || cooldown > 0 || actionBusy) return;
    setActionBusy("notify");
    try {
      const response = await fetch(`/api/appointment/join/${encodeURIComponent(token)}/notify`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
      const details = payload?.error?.details || data?.error?.details || {};
      const nextCooldown = Number(data?.cooldown_seconds || data?.notify?.cooldown_seconds || details.cooldown_seconds || 60);
      setCooldown(Math.max(0, nextCooldown));
      setState((current) => ({
        ...current,
        notifyDisabled: Boolean(data?.disabled || data?.notify?.disabled || details.disabled),
        message: response.ok ? "Reminder sent." : (data?.error?.message || payload?.error?.message || current.message),
      }));
    } finally {
      setActionBusy("");
    }
  }

  const showBusyState = state.loading;
  const message = state.view === "ended"
    ? "Meeting has ended"
    : state.message;
  const notifyLocked = state.notifyDisabled || cooldown > 0 || actionBusy === "notify";

  return (
    <main style={BRAND.shell}>
      <section style={BRAND.stack}>
        <div style={BRAND.logo}>
          <Image src="/ne.webp" alt="Nevari Health" width={56} height={56} priority />
        </div>
        {showBusyState ? (
          <>
            <BrandedSpinner label={state.message} />
          </>
        ) : (
          <p style={BRAND.body}>{message}</p>
        )}
        {state.view === "active" && !showBusyState ? (
          <div style={BRAND.actions}>
            <p style={BRAND.body} role="status" aria-live="polite">
              {joinCountdown > 0 ? `Opening your appointment in a new tab in ${joinCountdown}s` : "Opening your appointment..."}
            </p>
            <button type="button" style={BRAND.button} onClick={() => goToMeeting()} disabled={actionBusy === "join" || !state.redirectUrl}>
              {actionBusy === "join" ? "Opening..." : joinCountdown > 0 ? "Join now" : "Open meeting"}
            </button>
            <button
              type="button"
              style={{ ...BRAND.secondaryButton, ...(notifyLocked ? BRAND.disabledButton : {}) }}
              onClick={notifyOthers}
              disabled={notifyLocked}
            >
              {cooldown > 0 ? `${cooldown}s` : actionBusy === "notify" ? "Sending..." : "Notify others"}
            </button>
          </div>
        ) : null}
        {state.view === "ended" ? <Link href={state.bookUrl || "/dashboard"} style={BRAND.button}>Book appointment</Link> : null}
      </section>
    </main>
  );
}
