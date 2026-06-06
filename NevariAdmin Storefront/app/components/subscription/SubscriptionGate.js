"use client";

import Paywall from "./Paywall";
import SubscriptionSuccess from "./SubscriptionSuccess";

export default function SubscriptionGate({
  allowed,
  loading = false,
  showSuccess = false,
  error = "",
  busy = false,
  onOpenMenu,
  onSubscribe,
  onContinue,
  children,
}) {
  if (loading) {
    return (
      <section className="subscription-shell subscription-shell-loading">
        <div className="subscription-loading-spinner" aria-label="Loading subscription access" />
      </section>
    );
  }

  if (showSuccess) {
    return <SubscriptionSuccess busy={busy} onContinue={onContinue} />;
  }

  if (!allowed) {
    return <Paywall busy={busy} error={error} onOpenMenu={onOpenMenu} onSubscribe={onSubscribe} />;
  }

  return children;
}
