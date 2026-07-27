# Analytics implementation

- Growth events use a fixed allowlist in `app/lib/analytics-events.ts`; free text, account identifiers, order references, clinical data, and payment references are rejected.
- PostHog queries run only after Pharmacy Core authorizes the current session for `analytics`. Query credentials remain server-only.
- Analytics identity is a random WordPress user-meta UUID (`nevari_analytics_uuid`), exposed only as an opaque PostHog identity.
- Supported ranges are 7, 30, and 90 days. A comparison uses the immediately preceding equivalent period.
- Commerce metrics come from the capability-protected Pharmacy Core analytics endpoint and WooCommerce records.
- Product matching uses WooCommerce product/variation IDs and SKU, never display name alone.
- Gross sales use completed-order totals before refunds. Average order value uses the same completed-order population.
- On-time fulfillment means a completed order received its completion timestamp within 48 hours of creation.
- Pharmacy Core commerce/product aggregates cache for five minutes; inventory is returned with the aggregate and refreshed on the same bounded interval.
- Product views, add-to-cart rates, visitor history, breakdowns, and retention display unavailable states until the corresponding privacy-safe events have accumulated.
