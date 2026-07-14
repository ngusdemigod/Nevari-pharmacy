"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  cancelSubscription as cancelSubscriptionRequest,
  defaultSubscriptionState,
  fetchCurrentSubscription,
  fetchSubscriptionHistory,
  hasActiveSubscription,
  hasEntitlement,
  initializeSubscription,
  pauseSubscription as pauseSubscriptionRequest,
  verifySubscription,
} from "../lib/nevari-api";

function subscriptionStreamCookieName(frontendType = "patient_dashboard") {
  return `nevari_access_${String(frontendType || "patient_dashboard").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
}

function hasSubscriptionStreamCookie(frontendType = "patient_dashboard") {
  if (typeof document === "undefined") {
    return false;
  }
  const name = subscriptionStreamCookieName(frontendType).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|;\\s*)${name}=`).test(document.cookie || "");
}

function buildDefaultCallbackUrl() {
  if (typeof window === "undefined") {
    return "";
  }
  const url = new URL("/subscription", window.location.origin);
  const currentUrl = new URL(window.location.href);
  const explicitReturnTo = `${currentUrl.searchParams.get("returnTo") || ""}`.trim();
  const currentPath = `${window.location.pathname}${window.location.search}`.trim();
  if (explicitReturnTo && explicitReturnTo.startsWith("/") && !explicitReturnTo.startsWith("//")) {
    url.searchParams.set("returnTo", explicitReturnTo);
  } else if (window.location.pathname !== "/subscription" && window.location.pathname !== "/subscription/") {
    url.searchParams.set("returnTo", currentPath);
  }
  return url.toString();
}

function normalizeSubscriptionPlan(plan) {
  return String(plan || "").trim().toLowerCase() || "nevari_access_pro";
}

function normalizeSubscriptionFrequency(frequency) {
  return String(frequency || "").trim().toLowerCase() || "monthly";
}

function normalizeCancelSubscriptionErrorMessage(error) {
  const message = String(error?.message || "").trim();
  if (message.toLowerCase().includes("paystack cancellation details are missing")) {
    return "This subscription cannot be cancelled automatically because Paystack cancellation details are missing. Please contact support.";
  }
  return message || "The subscription could not be cancelled.";
}

function isPaidSubscription(subscription = {}) {
  const status = String(subscription?.status || "").trim().toLowerCase();
  const planKey = String(subscription?.plan_key || subscription?.plan || "").trim().toLowerCase();
  const tier = String(subscription?.tier || "").trim().toLowerCase();
  return hasActiveSubscription(subscription) && !["free", "none"].includes(status) && planKey !== "free" && tier !== "free";
}

export function useSubscription(session) {
  const [actionError, setActionError] = useState("");
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const checkoutRequestRef = useRef(null);
  const activeRef = useRef(false);

  const shouldFetch = Boolean(session?.user?.id && session?.accessToken);
  const fallbackSubscription = defaultSubscriptionState();
  const swr = useSWR(
    shouldFetch ? ["nevari-subscription", session.user.id] : null,
    () => fetchCurrentSubscription(session),
    {
      fallbackData: fallbackSubscription,
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );

  const subscription = swr.data || defaultSubscriptionState();
  const mutateSubscription = swr.mutate;
  const historySWR = useSWR(
    shouldFetch ? ["nevari-subscription-history", session.user.id] : null,
    () => fetchSubscriptionHistory(session),
    {
      fallbackData: { items: [], page: 1, perPage: 50, total: 0, totalPages: 1 },
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );
  const active = hasActiveSubscription(subscription);
  const canAccessTherapyManagement = Boolean(
    subscription?.can_access_therapy_management
    ?? subscription?.canAccessTherapyManagement
    ?? (active && hasEntitlement(subscription, "therapy_management"))
  );
  const canRefill = Boolean(
    subscription?.can_refill
    ?? subscription?.canRefill
    ?? (active && hasEntitlement(subscription, "refills"))
  );

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!shouldFetch || typeof window === "undefined") {
      return undefined;
    }

    const frontendType = String(session?.frontendType || "patient_dashboard").trim();
    if (!hasSubscriptionStreamCookie(frontendType)) {
      return undefined;
    }

    const eventUrl = new URL("/api/subscriptions/events", window.location.origin);
    eventUrl.searchParams.set("baseUrl", String(session?.baseUrl || "").trim());
    eventUrl.searchParams.set("frontendType", frontendType);
    const eventSource = new EventSource(eventUrl);
    const handleSubscriptionEvent = async () => {
      try {
        const nextSubscription = await mutateSubscription();
        const nextActive = hasActiveSubscription(nextSubscription || defaultSubscriptionState());
        if (!activeRef.current && nextActive) {
          setShowSuccess(true);
        }
        activeRef.current = nextActive;
      } catch {
        // Keep the current state when a background refresh fails.
      }
    };

    eventSource.addEventListener("subscription", handleSubscriptionEvent);
    return () => {
      eventSource.removeEventListener("subscription", handleSubscriptionEvent);
      eventSource.close();
    };
  }, [mutateSubscription, session?.baseUrl, session?.frontendType, shouldFetch]);

  async function refresh() {
    setActionError("");
    const [nextSubscription] = await Promise.all([
      mutateSubscription(undefined, { revalidate: true }),
      historySWR.mutate(undefined, { revalidate: true }),
    ]);
    return nextSubscription;
  }

  async function launchCheckout({ plan = "", frequency = "", callbackUrl = "" } = {}) {
    if (checkoutRequestRef.current) {
      return checkoutRequestRef.current;
    }

    const checkoutPromise = (async () => {
      setActionError("");
      if (isPaidSubscription(subscription)) {
        const error = new Error("You are already a Pro member.");
        setActionError(error.message);
        throw error;
      }
      setIsActionBusy(true);
      const existingCheckoutUrl = String(
        subscription?.checkout_url
        || subscription?.authorization_url
        || subscription?.authorizationUrl
        || subscription?.latest_subscription?.checkout_url
        || subscription?.latest_subscription?.authorization_url
        || ""
      ).trim();
      const checkoutExpiresAt = subscription?.checkout_expires_at
        || subscription?.checkoutExpiresAt
        || subscription?.latest_subscription?.checkout_expires_at
        || subscription?.latest_subscription?.checkoutExpiresAt
        || "";
      const checkoutExpiryDate = checkoutExpiresAt ? new Date(checkoutExpiresAt) : null;
      const checkoutIsUsable = !checkoutExpiryDate
        || Number.isNaN(checkoutExpiryDate.getTime())
        || checkoutExpiryDate.getTime() > Date.now();
      const requestedPlan = normalizeSubscriptionPlan(plan || subscription?.plan_key || subscription?.plan || "nevari_access_pro");
      const requestedFrequency = normalizeSubscriptionFrequency(frequency || subscription?.frequency || subscription?.interval || "monthly");

      const shouldReuseExistingCheckout = !plan && !frequency;
      if (shouldReuseExistingCheckout && existingCheckoutUrl && checkoutIsUsable) {
        window.location.assign(existingCheckoutUrl);
        return subscription;
      }

      const checkout = await initializeSubscription(session, {
        plan: requestedPlan,
        frequency: requestedFrequency,
        callbackUrl: callbackUrl || buildDefaultCallbackUrl(),
      });
      if (checkout?.free_checkout || checkout?.checkout_completed) {
        await mutateSubscription(checkout, { revalidate: false });
        setShowSuccess(true);
        return checkout;
      }
      const authorizationUrl = String(checkout?.checkout_url || checkout?.authorization_url || checkout?.authorizationUrl || "").trim();
      if (!authorizationUrl) {
        throw new Error("Checkout is unavailable for this subscription. Please refresh or contact support.");
      }
      window.location.assign(authorizationUrl);
      return checkout;
    })();

    checkoutRequestRef.current = checkoutPromise;
    try {
      return await checkoutPromise;
    } catch (error) {
      const message = String(error?.message || "The subscription could not be completed.");
      setActionError(message);
      throw error;
    } finally {
      checkoutRequestRef.current = null;
      setIsActionBusy(false);
    }
  }

  async function pauseCurrentSubscription() {
    setActionError("");
    setIsActionBusy(true);
    try {
      const nextSubscription = await pauseSubscriptionRequest(session);
      await mutateSubscription(nextSubscription, { revalidate: false });
      return nextSubscription;
    } catch (error) {
      const message = String(error?.message || "The subscription could not be paused.");
      setActionError(message);
      throw error;
    } finally {
      setIsActionBusy(false);
    }
  }

  async function cancelCurrentSubscription() {
    setActionError("");
    setIsActionBusy(true);
    try {
      const nextSubscription = await cancelSubscriptionRequest(session);
      await mutateSubscription(nextSubscription, { revalidate: false });
      if (typeof window !== "undefined") {
        window.location.reload();
      }
      return nextSubscription;
    } catch (error) {
      const message = normalizeCancelSubscriptionErrorMessage(error);
      const nextError = error instanceof Error ? error : new Error(message);
      nextError.message = message;
      setActionError(message);
      throw nextError;
    } finally {
      setIsActionBusy(false);
    }
  }

  async function verifyCheckout(reference) {
    setActionError("");
    setIsActionBusy(true);
    try {
      const verified = await verifySubscription(session, reference);
      await mutateSubscription(verified, { revalidate: false });
      setShowSuccess(true);
      return verified;
    } catch (error) {
      const message = String(error?.message || "The subscription could not be verified.");
      setActionError(message);
      throw error;
    } finally {
      setIsActionBusy(false);
    }
  }

  function dismissSuccess() {
    setShowSuccess(false);
  }

  return {
    subscription,
    entitlements: subscription.entitlements || [],
    isLoading: shouldFetch && swr.isLoading,
    isRefreshing: swr.isValidating,
    isActionBusy,
    actionError,
    showSuccess,
    active,
    canAccessTherapyManagement,
    canRefill,
    history: historySWR.data?.items || [],
    historyTotal: Number(historySWR.data?.total || 0),
    isHistoryLoading: shouldFetch && historySWR.isLoading,
    historyError: historySWR.error ? "Subscription history could not be loaded." : "",
    refreshHistory: () => historySWR.mutate(undefined, { revalidate: true }),
    refresh,
    launchCheckout,
    pauseCurrentSubscription,
    verifyCheckout,
    cancelCurrentSubscription,
    dismissSuccess,
  };
}

