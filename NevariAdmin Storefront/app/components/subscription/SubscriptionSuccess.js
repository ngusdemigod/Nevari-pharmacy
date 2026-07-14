"use client";

import { SubscriptionProBadge, SubscriptionSealArt } from "./SubscriptionVisuals";

export default function SubscriptionSuccess({
  onContinue,
  busy = false,
  title = "Congratulations, you're now on Nevari Access",
  subtitle = "Your subscription is active and ready to use across the dashboard.",
  footerCopy = "You can now enjoy all our services on Nevari Access",
  ctaLabel = "Continue",
  showBadge = true,
}) {
  return (
    <section className="subscription-shell subscription-shell-success">
      <div className="subscription-copy-block subscription-copy-block-success">
        <h1 className="subscription-title">
          {title} {showBadge ? <SubscriptionProBadge /> : null}
        </h1>
        <p className="subscription-subtitle subscription-success-subtitle">{subtitle}</p>
        <div className="subscription-success-seal-wrap">
          <SubscriptionSealArt variant="success" />
        </div>
      </div>

      <div className="subscription-success-footer">
        <p>{footerCopy}</p>
        <button className="subscription-cta-button" type="button" disabled={busy} onClick={onContinue}>
          {ctaLabel}
        </button>
      </div>
    </section>
  );
}
