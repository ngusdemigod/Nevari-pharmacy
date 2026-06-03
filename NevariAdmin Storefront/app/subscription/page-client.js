"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Paywall from "../components/subscription/Paywall";
import SubscriptionSuccess from "../components/subscription/SubscriptionSuccess";
import { hydrateStoredSession } from "../components/role-dashboard-utils";
import { useSubscription } from "../hooks/use-subscription";

function resolveCustomerSession() {
  const session = hydrateStoredSession("patient");
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const directRole = typeof session?.user?.role === "string" ? [session.user.role] : [];
  const normalizedRoles = [...roles, ...directRole].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  if (!session?.paired || !session?.accessToken || !normalizedRoles.some((role) => ["customer", "patient"].includes(role))) {
    return null;
  }
  return session;
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

  useEffect(() => {
    const hydratedSession = resolveCustomerSession();
    setSession(hydratedSession);
    setResolved(true);
    if (!hydratedSession) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!paymentReference || !session || verifying || subscriptionState.showSuccess || verifiedReference === paymentReference) {
      return undefined;
    }
    let mounted = true;
    async function verify() {
      setVerifiedReference(paymentReference);
      setVerifying(true);
      try {
        await subscriptionState.verifyCheckout(paymentReference);
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
    return (
      <section className="subscription-shell subscription-shell-loading">
        <div className="subscription-loading-card">Loading your Nevari Access Pro subscription...</div>
      </section>
    );
  }

  if (paymentReference && (verifying || subscriptionState.isActionBusy)) {
    return (
      <section className="subscription-shell subscription-shell-loading">
        <div className="subscription-loading-card">Verifying your subscription...</div>
      </section>
    );
  }

  if (subscriptionState.showSuccess) {
    return (
      <SubscriptionSuccess
        busy={subscriptionState.isActionBusy}
        onContinue={async () => {
          await subscriptionState.refresh();
          subscriptionState.dismissSuccess();
          router.replace("/dashboard");
        }}
      />
    );
  }

  return (
    <Paywall
      busy={subscriptionState.isActionBusy}
      error={subscriptionState.actionError}
      onOpenMenu={() => router.push("/dashboard")}
      onSubscribe={() => subscriptionState.launchCheckout()}
    />
  );
}
