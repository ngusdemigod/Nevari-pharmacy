"use client";

import { useState } from "react";
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

export function useSubscription(session) {
  const [actionError, setActionError] = useState("");
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const shouldFetch = Boolean(session?.user?.id && session?.accessToken);
  const swr = useSWR(
    shouldFetch ? ["nevari-subscription", session.user.id] : null,
    () => fetchCurrentSubscription(session),
    {
      fallbackData: defaultSubscriptionState(),
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );

  const subscription = swr.data || defaultSubscriptionState();
  const active = hasActiveSubscription(subscription);
  const canAccessTherapyManagement = active && hasEntitlement(subscription, "therapy_management");

  async function refresh() {
    setActionError("");
    return swr.mutate();
  }

  async function launchCheckout({ callbackUrl = "" } = {}) {
    setActionError("");
    setIsActionBusy(true);
    try {
      const checkout = await initializeSubscription(session, {
        plan: "pro",
        frequency: subscription?.frequency || "monthly",
        callbackUrl: callbackUrl || (typeof window !== "undefined" ? `${window.location.origin}/subscription` : ""),
      });
      const authorizationUrl = String(checkout?.authorization_url || checkout?.authorizationUrl || "").trim();
      if (!authorizationUrl) {
        throw new Error("The subscription checkout URL could not be created.");
      }
      window.location.assign(authorizationUrl);
      return checkout;
    } catch (error) {
      const message = String(error?.message || "The subscription could not be completed.");
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
      await swr.mutate(nextSubscription, { revalidate: false });
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
      await swr.mutate(verified, { revalidate: false });
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
    refresh,
    launchCheckout,
    verifyCheckout,
    cancelCurrentSubscription,
    dismissSuccess,
  };
}
