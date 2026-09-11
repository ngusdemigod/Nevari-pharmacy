"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { SWRConfig } from "swr";
import { requireRecaptchaToken } from "../lib/recaptcha-client";
import { ensureIdempotencyKey, isRecoverableClinicalMutation, shouldRecoverMutation } from "../lib/session-recovery.mjs";
import { DEFAULT_NEVARI_BASE_URL, FRONTENDS } from "./frontend-config";
import { clearStoredSessions, saveSession } from "./role-session";
import SessionReauthModal from "./SessionReauthModal";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

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
  const lastActivityRef = useRef(Date.now());
  const [reauthConfig, setReauthConfig] = useState(null);
  const [pendingAccountSwitch, setPendingAccountSwitch] = useState(null);

  function frontendForPath(pathname) {
    if (pathname.startsWith("/admin/doctor")) return FRONTENDS.doctor;
    if (pathname.startsWith("/admin/pharmacist")) return FRONTENDS.pharmacist;
    if (pathname.startsWith("/admin")) return FRONTENDS.admin;
    return FRONTENDS.patient;
  }

  function storedUserId(config) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(config.storageKey) || "{}");
      return String(stored?.user?.id || "");
    } catch {
      return "";
    }
  }

  function isPatientDashboardPath(pathname) {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }

  function requestReauthentication(config, options = {}) {
    if (reauthPromiseRef.current) return reauthPromiseRef.current;
    setReauthConfig({ config, expectedUserId: storedUserId(config), ...options });
    reauthPromiseRef.current = new Promise((resolve) => {
      reauthResolveRef.current = resolve;
    });
    return reauthPromiseRef.current;
  }

  useEffect(() => {
    function handleReauthenticationRequest(event) {
      const detail = event.detail || {};
      detail.handled = true;
      const config = frontendForPath(window.location.pathname);
      void requestReauthentication(config, {
        initialUsername: String(detail.username || "").trim(),
        title: String(detail.title || "").trim(),
      }).then((session) => detail.onAuthenticated?.(session));
    }

    window.addEventListener("nevari:request-reauthentication", handleReauthenticationRequest);
    return () => window.removeEventListener("nevari:request-reauthentication", handleReauthenticationRequest);
  }, []);

  function completeReauthentication(session) {
    const authenticatedUserId = String(session?.user?.id || "");
    if (reauthConfig?.expectedUserId && authenticatedUserId !== reauthConfig.expectedUserId) {
      if (reauthConfig.config?.type !== FRONTENDS.patient.type) {
        return { accepted: false, message: "Sign in with the same account to continue." };
      }
      setPendingAccountSwitch({ config: reauthConfig.config, session });
      setReauthConfig(null);
      return { accepted: false, pending: true };
    }
    window.dispatchEvent(new CustomEvent("nevari:session-restored", { detail: { session, frontendType: reauthConfig?.config?.type || "" } }));
    reauthResolveRef.current?.(session);
    reauthResolveRef.current = null;
    reauthPromiseRef.current = null;
    lastActivityRef.current = Date.now();
    setReauthConfig(null);
  }

  function continueWithDifferentAccount() {
    if (!pendingAccountSwitch) return;
    clearStoredSessions();
    saveSession(pendingAccountSwitch.config, pendingAccountSwitch.session);
    reauthResolveRef.current?.(pendingAccountSwitch.session);
    reauthResolveRef.current = null;
    reauthPromiseRef.current = null;
    window.location.reload();
  }

  async function logoutDifferentAccount() {
    const config = pendingAccountSwitch?.config;
    if (!config) return;
    try {
      const csrf = String(document.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("nevari_csrf="))?.slice("nevari_csrf=".length) || "";
      const params = new URLSearchParams({
        baseUrl: process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL,
        path: "/auth/logout",
      });
      await fetch(`/api/nevari-proxy?${params.toString()}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nevari-Frontend-Type": config.type,
          "X-Nevari-Frontend-Origin": window.location.origin,
          ...(csrf ? { "X-Nevari-Csrf": decodeURIComponent(csrf) } : {}),
        },
        body: JSON.stringify({ frontend_type: config.type, frontend_origin: window.location.origin, frontend_url: window.location.href }),
      });
    } catch {}
    clearStoredSessions();
    window.location.replace(config.loginPath);
  }

  useEffect(() => {
    const markActivity = () => {
      if (!reauthPromiseRef.current && !pendingAccountSwitch) lastActivityRef.current = Date.now();
    };
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    const intervalId = window.setInterval(() => {
      if (reauthPromiseRef.current || !isPatientDashboardPath(window.location.pathname)) return;
      if (Date.now() - lastActivityRef.current <= SESSION_IDLE_TIMEOUT_MS) return;
      const config = frontendForPath(window.location.pathname);
      if (storedUserId(config)) void requestReauthentication(config);
    }, 30_000);
    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.clearInterval(intervalId);
    };
  }, [pendingAccountSwitch]);

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
      const proxyPath = requestUrl.pathname === "/api/nevari-proxy"
        ? String(requestUrl.searchParams.get("path") || "")
        : "";
      const isAuthRoute = requestUrl.pathname.startsWith("/api/auth/")
        || requestUrl.pathname.startsWith("/api/sso/")
        || proxyPath.startsWith("/auth/")
        || proxyPath.startsWith("/sso/");
      const isLoginPage = /\/login\/?$/.test(window.location.pathname);
      if (isSameOriginApi && response.status === 401 && !isAuthRoute && !isLoginPage) {
        const config = frontendForPath(window.location.pathname);
        const hasBeenIdle = Date.now() - lastActivityRef.current > SESSION_IDLE_TIMEOUT_MS;
        if (isPatientDashboardPath(window.location.pathname) && !hasBeenIdle) {
          const refreshParams = new URLSearchParams({
            baseUrl: process.env.NEXT_PUBLIC_NEVARI_BASE_URL || DEFAULT_NEVARI_BASE_URL,
            path: "/auth/refresh",
          });
          const refreshHeaders = new Headers({
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Nevari-Frontend-Type": config.type,
            "X-Nevari-Frontend-Origin": window.location.origin,
          });
          const refreshCsrf = readCookie("nevari_csrf");
          if (refreshCsrf) refreshHeaders.set("x-nevari-csrf", refreshCsrf);
          let refreshResponse;
          try {
            refreshHeaders.set("x-nevari-recaptcha-token", await requireRecaptchaToken("public_submit"));
            refreshResponse = await originalFetch(`/api/nevari-proxy?${refreshParams.toString()}`, {
              method: "POST",
              headers: refreshHeaders,
              body: JSON.stringify({ frontend_type: config.type, frontend_origin: window.location.origin, frontend_url: window.location.href }),
            });
          } catch {
            return response;
          }
          if (refreshResponse.ok) {
            const retryHeaders = new Headers(headers);
            const refreshedCsrf = readCookie("nevari_csrf");
            if (refreshedCsrf) retryHeaders.set("x-nevari-csrf", refreshedCsrf);
            return originalFetch(input, { ...init, headers: retryHeaders });
          }
          return response;
        }
        const reauthenticated = requestReauthentication(config);
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
      <SessionReauthModal
        open={Boolean(reauthConfig)}
        config={reauthConfig?.config || null}
        initialUsername={reauthConfig?.initialUsername || ""}
        title={reauthConfig?.title || ""}
        onAuthenticated={completeReauthentication}
      />
      {pendingAccountSwitch ? <div className="account-switch-layer" role="presentation">
        <section className="account-switch-dialog" role="alertdialog" aria-modal="true" aria-labelledby="account-switch-title">
          <h2 id="account-switch-title">You have logged in with another account.</h2>
          <p>Continuing will discard any in-progress drafts and refresh the dashboard for this account.</p>
          <div className="account-switch-actions">
            <button className="auth-primary-button" type="button" onClick={continueWithDifferentAccount}>Continue</button>
            <button className="auth-text-link" type="button" onClick={logoutDifferentAccount}>Log out</button>
          </div>
        </section>
      </div> : null}
    </SWRConfig>
  </PostHogProvider>;
}
