const SENSITIVE_KEY_PATTERN = /(authorization|cookie|csrf|password|token|secret|session|email|phone|patient|customer|prescription|billing|shipping)/i;

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const clone = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      clone[key] = "[Filtered]";
      continue;
    }
    clone[key] = sanitizeValue(entry);
  }
  return clone;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return headers;
  }

  const clone = {};
  for (const [key, value] of Object.entries(headers)) {
    clone[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[Filtered]" : value;
  }
  return clone;
}

function beforeSend(event) {
  const nextEvent = { ...event };
  nextEvent.user = undefined;

  if (nextEvent.request) {
    nextEvent.request = {
      ...nextEvent.request,
      data: undefined,
      cookies: undefined,
      headers: sanitizeHeaders(nextEvent.request.headers),
    };
  }

  if (nextEvent.extra) {
    nextEvent.extra = sanitizeValue(nextEvent.extra);
  }

  if (nextEvent.contexts) {
    nextEvent.contexts = sanitizeValue(nextEvent.contexts);
  }

  nextEvent.tags = {
    ...nextEvent.tags,
    app_area: "storefront",
    app_runtime: nextEvent.tags?.app_runtime || "unknown",
  };

  return nextEvent;
}

function sharedSentryConfig(runtime) {
  const isProduction = process.env.NODE_ENV === "production";
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const release =
    process.env.SENTRY_RELEASE
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_URL
    || undefined;

  return {
    enabled: true,
    environment,
    release,
    sendDefaultPii: false,
    tracesSampleRate: isProduction ? 0.1 : 0.02,
    beforeSend,
    initialScope: {
      tags: {
        app: "nevariadmin-storefront",
        app_area: "storefront",
        app_runtime: runtime,
      },
      level: "error",
    },
  };
}

module.exports = {
  beforeSend,
  sharedSentryConfig,
};
