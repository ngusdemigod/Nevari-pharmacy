"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandedLoadingScreen } from "../components/BrandedSpinner";
import Paywall from "../components/subscription/Paywall";
import SubscriptionSuccess from "../components/subscription/SubscriptionSuccess";
import { hydrateStoredSession } from "../components/role-dashboard-utils";
import { useSubscription } from "../hooks/use-subscription";

function sanitizeReturnPath(value) {
  const path = String(value || "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard";
  }
  return path;
}

function resolveCustomerSession() {
  const session = hydrateStoredSession("patient");
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const directRole = typeof session?.user?.role === "string" ? [session.user.role] : [];
  const normalizedRoles = [...roles, ...directRole].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  if (!session?.baseUrl || !session?.accessToken || !normalizedRoles.some((role) => ["customer", "patient"].includes(role))) {
    return null;
  }
  return session;
}

function formatSubscriptionPrice(subscription) {
  const amount = Number(subscription?.monthlyEquivalent ?? subscription?.amount ?? 0);
  const currency = String(subscription?.currency || "NGN").trim().toUpperCase();
  const frequency = String(subscription?.frequency || subscription?.interval || "monthly").trim().toLowerCase();
  const recurringLabel = frequency === "yearly" ? "/year" : frequency === "weekly" ? "/week" : "/month";
  if (!Number.isFinite(amount) || amount <= 0) {
    return `${currency}1,000${recurringLabel}`;
  }
  try {
    return `${new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)}${recurringLabel}`;
  } catch {
    return `${currency}${amount}${recurringLabel}`;
  }
}

export default function SubscriptionPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedReference, setVerifiedReference] = useState("");
  const subscriptionState = useSubscription(session);

  const paymentReference = useMemo(() => searchParams.get("reference")
    || searchParams.get("trxref")
    || searchParams.get("transaction_ref")
    || searchParams.get("transaction")
    || "", [searchParams]);
  const continuePath = useMemo(() => sanitizeReturnPath(searchParams.get("returnTo")), [searchParams]);
  const priceLabel = useMemo(() => formatSubscriptionPrice(subscriptionState.subscription), [subscriptionState.subscription]);

  useEffect(() => {
    const hydratedSession = resolveCustomerSession();
    setSession(hydratedSession);
    setResolved(true);
    if (!hydratedSession) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!paymentReference || !session || verifying || verifiedReference === paymentReference || subscriptionState.active) {
      return undefined;
    }
    let mounted = true;
    async function verify() {
      setVerifiedReference(paymentReference);
      setVerifying(true);
      try {
        await subscriptionState.verifyCheckout(paymentReference);
        await subscriptionState.refresh();
      } catch {
        // verifyCheckout stores the user-facing error; keep this reference marked so a bad callback does not loop.
      } finally {
        if (mounted) {
          setVerifying(false);
        }
      }
    }
    verify();
    return () => {
      mounted = false;
    };
  }, [paymentReference, session, subscriptionState, verifiedReference, verifying]);

  if (!resolved || (!session && !subscriptionState.actionError)) {
    return <BrandedLoadingScreen className="subscription-shell subscription-shell-loading" label="Loading your Nevari Access Pro subscription" />;
  }

  if (paymentReference && !subscriptionState.active && (verifying || subscriptionState.isActionBusy)) {
    return <BrandedLoadingScreen className="subscription-shell subscription-shell-loading" label="Verifying your subscription" />;
  }

  if (subscriptionState.showSuccess || subscriptionState.active) {
    return (
      <SubscriptionSuccess
        busy={subscriptionState.isActionBusy}
        onContinue={async () => {
          await subscriptionState.refresh();
          subscriptionState.dismissSuccess();
          router.replace(continuePath);
        }}
      />
    );
  }

  return (
    <Paywall
      busy={subscriptionState.isActionBusy}
      error={subscriptionState.actionError}
      onOpenMenu={() => router.push(continuePath)}
      onSubscribe={() => subscriptionState.launchCheckout()}
      priceLabel={priceLabel}
    />
  );
}
