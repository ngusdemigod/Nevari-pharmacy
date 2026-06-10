"use client";

import { SubscriptionProBadge, SubscriptionSealArt } from "./SubscriptionVisuals";

export default function SubscriptionSuccess({ onContinue, busy = false }) {
  return (
    <section className="subscription-shell subscription-shell-success">
      <div className="subscription-copy-block subscription-copy-block-success">
        <h1 className="subscription-title">
          Congratulations, you&apos;re now on Nevari Access <SubscriptionProBadge />
        </h1>
        <p className="subscription-subtitle subscription-success-subtitle">Your subscription is active and ready to use across the dashboard.</p>
        <div className="subscription-success-seal-wrap">
          <SubscriptionSealArt variant="success" />
        </div>
      </div>

      <div className="subscription-success-footer">
        <p>You can now enjoy all our services on Nevari Access</p>
        <button className="subscription-cta-button" type="button" disabled={busy} onClick={onContinue}>
          Continue
        </button>
      </div>
    </section>
  );
}
