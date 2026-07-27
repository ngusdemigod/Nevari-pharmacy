"use client";

import posthog from "posthog-js";

const EVENTS = new Set([
  "registration_started",
  "registration_completed",
  "login_completed",
  "consultation_started",
  "consultation_submitted",
  "appointment_booking_started",
  "appointment_booked",
  "payment_initialized",
  "payment_completed",
  "subscription_viewed",
  "subscription_started",
  "product_viewed",
  "product_added_to_cart",
]);

const PROPERTY_VALUES: Record<string, Set<string>> = {
  role: new Set(["patient", "doctor", "pharmacist", "nurse", "store_admin", "anonymous", "unknown"]),
  device_type: new Set(["mobile", "desktop", "tablet", "unknown"]),
  outcome: new Set(["started", "completed", "failed", "cancelled"]),
  environment: new Set(["development", "preview", "production", "test", "unknown"]),
  payment_type: new Set(["order", "appointment", "subscription", "therapy", "unknown"]),
  source_area: new Set(["registration", "login", "consultation", "appointment", "payment", "subscription", "product", "unknown"]),
};

export function captureAnalyticsEvent(event: string, properties: Record<string, unknown> = {}) {
  if (!EVENTS.has(event) || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  const safe: Record<string, string> = {};
  Object.entries(properties).forEach(([key, raw]) => {
    const value = String(raw || "").toLowerCase();
    if (PROPERTY_VALUES[key]?.has(value)) safe[key] = value;
  });
  safe.environment = String(process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "unknown").toLowerCase();
  posthog.capture(event, safe);
  return true;
}

export function identifyAnalyticsUser(analyticsUuid: string, role: string) {
  if (!/^[a-f0-9-]{36}$/i.test(String(analyticsUuid || "")) || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.identify(analyticsUuid);
  captureAnalyticsEvent("login_completed", { role, outcome: "completed", source_area: "login" });
}

export function resetAnalyticsIdentity() {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) posthog.reset();
}
