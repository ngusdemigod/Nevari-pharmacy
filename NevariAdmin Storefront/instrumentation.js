import * as Sentry from "@sentry/nextjs";

const sentryEnabled = Boolean(
  process.env.SENTRY_DSN
  || process.env.NEXT_PUBLIC_SENTRY_DSN
);

export async function register() {
  if (sentryEnabled && process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = sentryEnabled ? Sentry.captureRequestError : undefined;
