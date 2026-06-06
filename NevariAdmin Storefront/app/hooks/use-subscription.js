"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  cancelSubscription as cancelSubscriptionRequest,
  defaultSubscriptionState,
  fetchCurrentSubscription,
  hasActiveSubscription,
  hasEntitlement,
  initializeSubscription,
  verifySubscription,
} from "../lib/nevari-api";

function buildDefaultCallbackUrl() {
  if (typeof window === "undefined") {
    return "";
  }
  const url = new URL("/subscription", window.location.origin);
  const returnTo = `${window.location.pathname}${window.location.search}`.trim();
  if (returnTo && returnTo !== "/subscription" && returnTo !== "/subscription/") {
    url.searchParams.set("returnTo", returnTo);
  }
  return url.toString();
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

    const eventSource = new EventSource("/api/subscriptions/events");
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
  }, [mutateSubscription, shouldFetch]);

  async function refresh() {
    setActionError("");
    return mutateSubscription();
  }

  async function launchCheckout({ callbackUrl = "" } = {}) {
    if (checkoutRequestRef.current) {
      return checkoutRequestRef.current;
    }

    const checkoutPromise = (async () => {
      setActionError("");
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

      if (existingCheckoutUrl && checkoutIsUsable) {
        window.location.assign(existingCheckoutUrl);
        return subscription;
      }

      const checkout = await initializeSubscription(session, {
        plan: "pro",
        frequency: subscription?.frequency || "monthly",
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

  async function cancelCurrentSubscription() {
    setActionError("");
    setIsActionBusy(true);
    try {
      const nextSubscription = await cancelSubscriptionRequest(session);
      await mutateSubscription(nextSubscription, { revalidate: false });
      return nextSubscription;
    } catch (error) {
      const message = String(error?.message || "The subscription could not be cancelled.");
      setActionError(message);
      throw error;
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
    refresh,
    launchCheckout,
    verifyCheckout,
    cancelCurrentSubscription,
    dismissSuccess,
  };
}
