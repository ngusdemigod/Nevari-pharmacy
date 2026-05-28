"use client";

import { useEffect } from "react";
import { SWRConfig } from "swr";

export default function AppProviders({ children }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    function readCookie(name) {
      const needle = `${name}=`;
      const parts = String(document.cookie || "").split(";").map((part) => part.trim());
      for (const part of parts) {
        if (part.startsWith(needle)) {
          return decodeURIComponent(part.slice(needle.length));
        }
      }
      return "";
    }

    window.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === "string" ? new URL(input, window.location.origin) : new URL(input.url);
      const method = String(init.method || (typeof input === "object" ? input.method : "GET") || "GET").toUpperCase();
      const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
      const isSameOriginApi = requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api/");

      if (!isMutating || !isSameOriginApi) {
        return originalFetch(input, init);
      }

      const csrf = readCookie("nevari_csrf");
      const headers = new Headers(init.headers || (typeof input === "object" ? input.headers : undefined) || {});
      if (csrf && !headers.has("x-nevari-csrf")) {
        headers.set("x-nevari-csrf", csrf);
      }

      return originalFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <SWRConfig value={{
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
    shouldRetryOnError: false,
    keepPreviousData: true,
    dedupingInterval: 30_000,
    focusThrottleInterval: 60_000
  }}>
    {children}
  </SWRConfig>;
}
