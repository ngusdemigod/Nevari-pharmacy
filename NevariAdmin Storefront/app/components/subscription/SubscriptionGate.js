"use client";

import { BrandedLoadingScreen } from "../BrandedSpinner";
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
  priceLabel,
  children,
}) {
  if (loading) {
    return <BrandedLoadingScreen className="subscription-shell subscription-shell-loading" label="Loading subscription access" />;
  }

  if (showSuccess) {
    return <SubscriptionSuccess busy={busy} onContinue={onContinue} />;
  }

  if (!allowed) {
    return <Paywall busy={busy} error={error} onOpenMenu={onOpenMenu} onSubscribe={onSubscribe} priceLabel={priceLabel} />;
  }

  return children;
}
