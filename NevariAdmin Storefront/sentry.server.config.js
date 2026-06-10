const Sentry = require("@sentry/nextjs");
const { sharedSentryConfig } = require("./sentry.shared");

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";

if (dsn) {
  Sentry.init({
    dsn,
    ...sharedSentryConfig("server"),
  });
}
