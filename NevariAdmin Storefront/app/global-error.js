"use client";

import React from "react";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#f6f8fc", color: "#102039" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ maxWidth: 560, width: "100%", background: "#fff", border: "1px solid #d8e0ec", borderRadius: 20, padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>Application error</h1>
            <p style={{ marginTop: 10, color: "#5d6f8f", lineHeight: 1.5 }}>
              A critical runtime error occurred. Use retry to attempt recovery.
            </p>
            {error?.message ? (
              <pre style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#f2f5fb", overflow: "auto", fontSize: 12 }}>
                {error.message}
              </pre>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                marginTop: 14,
                border: "1px solid #d1d8e5",
                borderRadius: 999,
                padding: "10px 14px",
                background: "#ffffff",
                color: "#0a2a5e",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Retry
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
