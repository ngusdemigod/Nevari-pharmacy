"use client";

export function BrandedSpinner({ className = "", label = "Loading" }) {
  return (
    <span
      className={`nevari-branded-spinner ${className}`.trim()}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function BrandedLoadingScreen({
  className = "",
  label = "Loading",
  children = null,
}) {
  return (
    <section className={`nevari-loading-screen ${className}`.trim()}>
      <BrandedSpinner label={label} />
      {children}
    </section>
  );
}
