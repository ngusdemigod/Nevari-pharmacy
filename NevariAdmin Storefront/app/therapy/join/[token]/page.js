"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BrandedSpinner } from "../../../components/BrandedSpinner";
import { DEFAULT_NEVARI_BASE_URL } from "../../../components/frontend-config";

function resolveApiBase(baseUrl) {
  const cleaned = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.includes("/wp-json/nevari/v1")) return cleaned;
  if (cleaned.includes("/wp-json/")) return `${cleaned}/nevari/v1`;
  return `${cleaned}/wp-json/nevari/v1`;
}

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
    maxWidth: "240px",
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

export default function MtmJoinPage({ params }) {
  const resolvedParams = use(params);
  const token = String(resolvedParams?.token || "").trim();
  const [state, setState] = useState({ loading: true, view: "loading", message: "Checking meeting access...", redirectUrl: "", bookUrl: "/dashboard" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const apiBase = resolveApiBase(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL);
      if (!apiBase) {
        if (!cancelled) {
          setState({ loading: false, view: "unavailable", message: "Meeting service is not configured.", redirectUrl: "", bookUrl: "/dashboard" });
        }
        return;
      }
      try {
        const response = await fetch(`${apiBase}/mtm-requests/join/${encodeURIComponent(token)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
        if (cancelled) return;
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
        if (data?.state === "active" && data?.redirect_url) {
          setState({ loading: false, view: "redirecting", message: "Redirecting you to the meeting...", redirectUrl: data.redirect_url, bookUrl: data?.book_url || "/dashboard" });
          window.location.replace(data.redirect_url);
          return;
        }
        setState({
          loading: false,
          view: data?.state === "ended" ? "ended" : "unavailable",
          message: data?.message || (data?.state === "ended" ? "Meeting has ended" : "Kindly check back on your appointment time"),
          redirectUrl: "",
          bookUrl: data?.book_url || "/dashboard",
        });
      } catch {
        if (!cancelled) {
          setState({ loading: false, view: "unavailable", message: "Kindly check back on your appointment time", redirectUrl: "", bookUrl: "/dashboard" });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const busy = state.loading || state.view === "redirecting";
  const message = state.view === "ended" ? "Meeting has ended" : state.message;

  return (
    <main style={BRAND.shell}>
      <section style={BRAND.stack}>
        <div style={BRAND.logo}>
          <Image src="/ne.webp" alt="Nevari Health" width={56} height={56} priority />
        </div>
        {busy ? (
          <>
            <BrandedSpinner label={state.message} />
          </>
        ) : (
          <p style={BRAND.body}>{message}</p>
        )}
        {!busy ? <Link href={state.bookUrl || "/dashboard"} style={BRAND.button}>Open MTM request</Link> : null}
      </section>
    </main>
  );
}
