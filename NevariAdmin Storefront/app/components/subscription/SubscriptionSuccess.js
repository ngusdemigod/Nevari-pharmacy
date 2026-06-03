"use client";

function Seal() {
  return (
    <div className="subscription-seal subscription-seal-success" aria-hidden="true">
      <div className="subscription-seal-inner">
        <span className="subscription-seal-check">✓</span>
      </div>
    </div>
  );
}

export default function SubscriptionSuccess({ onContinue, busy = false }) {
  return (
    <section className="subscription-shell subscription-shell-success">
      <div className="subscription-copy-block subscription-copy-block-success">
        <h1 className="subscription-title">
          Congratulations, you&apos;re now on Nevari Access <span className="subscription-pro-badge">Pro</span>
        </h1>
        <div className="subscription-seal-wrap">
          <Seal />
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
