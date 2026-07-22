"use client";

import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import sentryShared from "./sentry.shared";

const { sharedSentryConfig } = sentryShared;
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

if (dsn) {
  Sentry.init({
    dsn,
    ...sharedSentryConfig("client"),
  });
}

const posthogKey = String(process.env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
const posthogHost = String(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").trim();

function withoutQueryOrHash(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function sanitizeAnalyticsEvent(event) {
  if (!event?.properties) return event;
  const properties = { ...event.properties };
  for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
    if (properties[key]) properties[key] = withoutQueryOrHash(properties[key]);
  }
  const sensitiveName = /(patient|prescription|medication|diagnosis|allerg|email|phone|address|name|note|token|secret|password|invoice|payment)/i;
  for (const key of Object.keys(properties)) {
    if (!key.startsWith("$") && sensitiveName.test(key)) delete properties[key];
  }
  return { ...event, properties };
}

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2025-05-24",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    capture_performance: false,
    enable_heatmaps: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: "identified_only",
    before_send: sanitizeAnalyticsEvent,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
