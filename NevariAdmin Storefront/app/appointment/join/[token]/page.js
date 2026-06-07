"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

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
  },
  spinner: {
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    border: "2px solid rgba(14, 41, 85, 0.18)",
    borderTopColor: "#F4C542",
    animation: "appointmentJoinSpin 0.72s linear infinite",
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
  const token = String(params?.token || "").trim();
  const [state, setState] = useState({ loading: true, view: "loading", message: "Checking appointment access...", redirectUrl: "", bookUrl: "/dashboard" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/appointment/join/${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setState({
            loading: false,
            view: response.status === 410 ? "ended" : "unavailable",
            message: payload?.error?.message || "Kindly check back on your appointment time",
            redirectUrl: "",
            bookUrl: payload?.book_url || "/dashboard",
          });
          return;
        }
        if (payload?.state === "active" && payload?.redirect_url) {
          setState({
            loading: false,
            view: "redirecting",
            message: "Redirecting you to the appointment...",
            redirectUrl: payload.redirect_url,
            bookUrl: payload?.book_url || "/dashboard",
          });
          window.location.replace(payload.redirect_url);
          return;
        }
        setState({
          loading: false,
          view: payload?.state === "ended" ? "ended" : "unavailable",
          message: payload?.message || (payload?.state === "ended" ? "Meeting has ended" : "Kindly check back on your appointment time"),
          redirectUrl: "",
          bookUrl: payload?.book_url || "/dashboard",
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

  const showBusyState = state.loading || state.view === "redirecting";
  const message = state.view === "ended"
    ? "Meeting has ended"
    : state.message;

  return (
    <main style={BRAND.shell}>
      <section style={BRAND.stack}>
        <div style={BRAND.logo}>
          <Image src="/ne.webp" alt="Nevari Health" width={56} height={56} priority />
        </div>
        {showBusyState ? (
          <>
            <span style={BRAND.spinner} aria-hidden="true" />
            <span style={BRAND.srOnly}>{state.message}</span>
          </>
        ) : (
          <p style={BRAND.body}>{message}</p>
        )}
        {state.view === "ended" ? <Link href={state.bookUrl || "/dashboard"} style={BRAND.button}>Book appointment</Link> : null}
        <style jsx>{`
          @keyframes appointmentJoinSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </section>
    </main>
  );
}
