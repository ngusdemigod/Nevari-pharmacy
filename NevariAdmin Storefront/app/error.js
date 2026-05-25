"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    if (error) {
      console.error(error);
    }
  }, [error]);

  return (
    <main style={{ padding: 24, fontFamily: "inherit" }}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Something went wrong.</h2>
      <p style={{ marginTop: 8, color: "#5d6f8f" }}>
        The page hit an unexpected error. Try reloading this section.
      </p>
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
    </main>
  );
}
