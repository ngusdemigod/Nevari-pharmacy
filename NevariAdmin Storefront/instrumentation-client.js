"use client";

import * as Sentry from "@sentry/nextjs";
import sentryShared from "./sentry.shared";

const { sharedSentryConfig } = sentryShared;
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

if (dsn) {
  Sentry.init({
    dsn,
    ...sharedSentryConfig("client"),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
