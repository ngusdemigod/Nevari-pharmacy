import { withSentryConfig } from "@sentry/nextjs";

const hasSentryUploadCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN
  && process.env.SENTRY_ORG
  && process.env.SENTRY_PROJECT
);

const nextConfig = {
  productionBrowserSourceMaps: true,
};

export default withSentryConfig(
  nextConfig,
  {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: {
      name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    },
    silent: true,
    sourcemaps: {
      disable: !hasSentryUploadCredentials,
    },
    telemetry: false,
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  }
);
