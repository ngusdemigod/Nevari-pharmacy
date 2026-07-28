"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { SWRConfig } from "swr";
import { requireRecaptchaToken } from "../lib/recaptcha-client";
import { FRONTENDS } from "./frontend-config";
import SessionReauthModal from "./SessionReauthModal";

function PostHogPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !pathname) return;
    const appArea = pathname.startsWith("/admin/pharmacist")
      ? "pharmacist"
      : pathname.startsWith("/admin/doctor")
        ? "doctor"
        : pathname.startsWith("/admin")
          ? "store_admin"
          : "patient";
    const routeGroup = pathname.split("/").filter(Boolean).slice(0, 2).join("/") || "home";
    const viewportCategory = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";
    posthog.register({
      environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "unknown",
      app_area: appArea,
      authenticated_role: appArea,
      route_group: routeGroup,
      viewport_category: viewportCategory,
      release: process.env.NEXT_PUBLIC_APP_RELEASE || "unknown",
    });
    posthog.capture("$pageview", {
      $pathname: pathname,
      $current_url: `${window.location.origin}${pathname}`,
    });
  }, [pathname]);

  return null;
}

export default function AppProviders({ children }) {
  const activeModalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const reauthPromiseRef = useRef(null);
  const reauthResolveRef = useRef(null);
  const [reauthConfig, setReauthConfig] = useState(null);

  function frontendForPath(pathname) {
    if (pathname.startsWith("/admin/doctor")) return FRONTENDS.doctor;
    if (pathname.startsWith("/admin/pharmacist")) return FRONTENDS.pharmacist;
    if (pathname.startsWith("/admin")) return FRONTENDS.admin;
    return FRONTENDS.patient;
  }

  function requestReauthentication() {
    if (reauthPromiseRef.current) return reauthPromiseRef.current;
    setReauthConfig(frontendForPath(window.location.pathname));
    reauthPromiseRef.current = new Promise((resolve) => {
      reauthResolveRef.current = resolve;
    });
    return reauthPromiseRef.current;
  }

  function completeReauthentication(session) {
    window.dispatchEvent(new CustomEvent("nevari:session-restored", { detail: { session, frontendType: reauthConfig?.type || "" } }));
    reauthResolveRef.current?.(session);
    reauthResolveRef.current = null;
    reauthPromiseRef.current = null;
    setReauthConfig(null);
  }

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
      const inputUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url || "";
      const requestUrl = new URL(inputUrl, window.location.origin);
      const method = String(init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
      const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
      const isSameOriginApi = requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api/");

      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined) || {});
      if (isMutating && isSameOriginApi) {
        const csrf = readCookie("nevari_csrf");
        if (csrf && !headers.has("x-nevari-csrf")) {
          headers.set("x-nevari-csrf", csrf);
        }
        if (!csrf && !headers.has("x-nevari-recaptcha-token")) {
          headers.set("x-nevari-recaptcha-token", await requireRecaptchaToken("public_submit"));
        }
      }

      const response = await originalFetch(input, { ...init, headers });
      const isAuthRoute = requestUrl.pathname.startsWith("/api/auth/")
        || requestUrl.pathname === "/api/nevari-proxy" && /\/auth\//.test(requestUrl.search);
      const isLoginPage = /\/login\/?$/.test(window.location.pathname);
      if (isSameOriginApi && response.status === 401 && !isAuthRoute && !isLoginPage) {
        const reauthenticated = requestReauthentication();
        if (!isMutating) {
          await reauthenticated;
          const retryHeaders = new Headers(headers);
          const refreshedCsrf = readCookie("nevari_csrf");
          if (refreshedCsrf) retryHeaders.set("x-nevari-csrf", refreshedCsrf);
          return originalFetch(input, { ...init, headers: retryHeaders });
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const modalSelectors = [
      ".app-modal-layer.is-open [role='dialog'][aria-modal='true']",
      ".subscription-modal-backdrop.open [role='dialog'][aria-modal='true']",
      ".customer-confirmation-modal [role='dialog'][aria-modal='true']",
      ".customer-appointment-modal [role='dialog'][aria-modal='true']",
      ".customer-mobile-drawer-layer.open .customer-mobile-drawer",
      ".dashboard-side-nav.is-open",
      ".rx-live-modal.visible [role='dialog'][aria-modal='true']"
    ];
    const focusableSelectors = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    function isVisible(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    }

    function getModalRoots() {
      return modalSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter((element) => element instanceof HTMLElement && isVisible(element));
    }

    function getTopModalRoot() {
      const roots = getModalRoots();
      return roots[roots.length - 1] || null;
    }

    function getFocusableElements(root) {
      if (!(root instanceof HTMLElement)) {
        return [];
      }
      return Array.from(root.querySelectorAll(focusableSelectors)).filter((element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && !element.hasAttribute("disabled");
      });
    }

    function focusModal(root) {
      const focusables = getFocusableElements(root);
      const target = focusables[0] || root;
      if (target instanceof HTMLElement) {
        if (!target.hasAttribute("tabindex") && target === root) {
          root.setAttribute("tabindex", "-1");
        }
        target.focus({ preventScroll: true });
      }
    }

    function closeModal(root) {
      if (!(root instanceof HTMLElement)) {
        return false;
      }
      const drawerBackdrop = root.closest(".customer-mobile-drawer-layer")?.querySelector(".customer-mobile-drawer-backdrop");
      const dashboardBackdrop = root.classList.contains("dashboard-side-nav")
        ? document.querySelector(".dashboard-side-nav-backdrop")
        : null;
      const customerBackdrop = root.classList.contains("customer-appointment-modal")
        ? root.querySelector(".customer-appointment-modal-backdrop")
        : null;
      const fallbackClose = root.querySelector("[data-close-live-modal], [data-popup-close], [aria-label^='Close']");
      const layerBackdrop = root.closest(".app-modal-layer")?.querySelector(".app-modal-backdrop");
      const subscriptionClose = root.closest(".subscription-modal-backdrop")?.querySelector("[aria-label^='Close']");
      const closeTarget = drawerBackdrop || dashboardBackdrop || customerBackdrop || fallbackClose || layerBackdrop || subscriptionClose;
      if (closeTarget instanceof HTMLElement) {
        closeTarget.click();
        return true;
      }
      return false;
    }

    function syncModalState() {
      const nextRoot = getTopModalRoot();
      if (nextRoot === activeModalRef.current) {
        return;
      }

      if (nextRoot) {
        if (!activeModalRef.current && document.activeElement instanceof HTMLElement) {
          previousFocusRef.current = document.activeElement;
        }
        activeModalRef.current = nextRoot;
        window.requestAnimationFrame(() => {
          if (activeModalRef.current === nextRoot) {
            focusModal(nextRoot);
          }
        });
        return;
      }

      activeModalRef.current = null;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      window.requestAnimationFrame(() => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    }

    function handleKeyDown(event) {
      const root = activeModalRef.current;
      if (!root) {
        return;
      }

      if (event.key === "Escape") {
        if (closeModal(root)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusables = getFocusableElements(root);
      if (!focusables.length) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function handleFocusIn(event) {
      const root = activeModalRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) {
        return;
      }

      const focusables = getFocusableElements(root);
      if (focusables.length) {
        focusables[0].focus({ preventScroll: true });
      } else if (root instanceof HTMLElement) {
        root.focus({ preventScroll: true });
      }
    }

    const observer = new MutationObserver(syncModalState);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "style"]
    });
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    syncModalState();

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      activeModalRef.current = null;
      previousFocusRef.current = null;
    };
  }, []);

  return <PostHogProvider client={posthog}>
    <PostHogPageView />
    <SWRConfig value={{
    revalidateOnMount: true,
    revalidateIfStale: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
    shouldRetryOnError: false,
    keepPreviousData: true,
    dedupingInterval: 0,
    focusThrottleInterval: 60_000
    }}>
      {children}
      <SessionReauthModal open={Boolean(reauthConfig)} config={reauthConfig} onAuthenticated={completeReauthentication} />
    </SWRConfig>
  </PostHogProvider>;
}
