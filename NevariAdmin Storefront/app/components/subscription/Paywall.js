"use client";

const BENEFITS = [
  {
    icon: "◔",
    tone: "lavender",
    title: "5x more Doctor Consultations.",
    description: "Access more doctor and care specialist consultations, giving you faster medical attention, consistent follow-ups, and better continuity of care whenever you need support.",
  },
  {
    icon: "⌁",
    tone: "amber",
    title: "Medical Therapy Management",
    description: "Get professional medication reviews and guidance to help you understand your prescriptions, manage side effects, and stay on track with your treatment plan.",
  },
  {
    icon: "⊞",
    tone: "mint",
    title: "Free Prescription Refills and Deliveries",
    description: "Enjoy convenient prescription refill processing and doorstep medication delivery, helping you stay consistent with treatment.",
  },
];

function Seal({ variant = "brand" }) {
  return (
    <div className={`subscription-seal subscription-seal-${variant}`} aria-hidden="true">
      <div className="subscription-seal-inner">
        {variant === "success" ? <span className="subscription-seal-check">✓</span> : <span className="subscription-seal-brand">ne</span>}
      </div>
    </div>
  );
}

export default function Paywall({
  onOpenMenu,
  onSubscribe,
  busy = false,
  error = "",
  heading = "Access more on Nevari Access Pro",
}) {
  return (
    <section className="subscription-shell">
      <button className="subscription-menu-button" type="button" aria-label="Open menu" onClick={onOpenMenu}>
        <span />
        <span />
        <span />
      </button>

      <div className="subscription-copy-block">
        <h1 className="subscription-title">
          {heading} <span className="subscription-pro-badge">Pro</span>
        </h1>
        <div className="subscription-seal-wrap">
          <Seal variant="brand" />
        </div>
        <p className="subscription-subtitle">
          Upgrade to Nevari Access Pro to enjoy smarter schedules and smarter schedules
        </p>
      </div>

      <div className="subscription-benefits">
        {BENEFITS.map((benefit) => (
          <article key={benefit.title} className="subscription-benefit">
            <div className={`subscription-benefit-icon is-${benefit.tone}`} aria-hidden="true">
              {benefit.icon}
            </div>
            <div className="subscription-benefit-copy">
              <strong>{benefit.title}</strong>
              <p>{benefit.description}</p>
            </div>
          </article>
        ))}
      </div>

      {error ? <p className="subscription-feedback error">{error}</p> : null}

      <div className="subscription-cta-bar">
        <button className="subscription-cta-button" type="button" disabled={busy} onClick={onSubscribe}>
          {busy ? "Redirecting..." : "Subscribe for NGN10.00/month"}
        </button>
      </div>
    </section>
  );
}
