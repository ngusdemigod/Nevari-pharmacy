# Nevari Growth Analytics Architecture and Implementation Plan

## 1. Purpose

Build a simple, non-technical **Growth Analytics** page inside the existing storefront admin dashboard. The page will help authorized business users understand whether the Nevari platform is growing, where customers leave important journeys, and which areas need attention.

The client will not need a PostHog login. PostHog will operate as a private analytics data service behind Nevari's authenticated dashboard.

This document is the implementation plan. The standalone visual prototype is available at:

- `prototypes/storefront-analytics-overview.html`
- `prototypes/storefront-analytics-overview.js`

## 2. Product Decision

### Keep the current Overview page

The existing storefront Overview is operational. It answers questions such as:

- What needs attention today?
- Which orders are waiting?
- Are payments pending?
- Which appointments are upcoming?
- Which products have inventory problems?

Replacing it with growth analytics would remove useful daily operating information.

### Add a separate Growth Analytics page

The new page answers a different set of questions:

- Is the storefront attracting more people?
- Are people completing registration?
- Are consultations and appointments converting?
- Are payments and subscriptions completing?
- Are customers returning?
- Where are people leaving the customer journey?

Recommended navigation:

```text
Nevari Pharmacy
├── Overview
├── Growth Analytics
├── Products
├── Orders
├── Payments
└── Patients
```

The interface should use **Growth Analytics** as its user-facing name. It should not expose the PostHog product name to ordinary client users.

## 3. Goals

1. Show business-friendly totals, percentages, trends, and recommendations.
2. Require no knowledge of PostHog, analytics terminology, SQL, or funnels.
3. Protect patient, prescription, authentication, and payment information.
4. Reuse the existing Nevari roles and storefront permission assignment system.
5. Keep the PostHog personal API key server-only.
6. Load aggregate analytics without slowing the operational Overview page.
7. Work on desktop, tablet, and mobile.
8. Fail safely when PostHog is unavailable.

## 4. Non-Goals

The first version will not:

- Replace the operational Overview page.
- Embed the PostHog website.
- Give clients direct PostHog credentials.
- Show individual visitors or event-level activity.
- Show patient names, emails, phone numbers, addresses, WordPress IDs, prescription IDs, appointment IDs, invoice references, or medical information.
- Enable PostHog session replay, autocapture, heatmaps, surveys, or form capture.
- Build a general-purpose report designer.
- Add a new charting, state-management, authentication, or CSS library.
- Query PostHog directly from browser code.

## 5. High-Level Architecture

```text
Customer and staff browsers
        │
        │ privacy-safe events
        ▼
PostHog ingestion endpoint
        │
        │ aggregate query
        ▼
Next.js server-only analytics route
        │
        ├── verifies Nevari session and CSRF rules
        ├── confirms WordPress analytics capability
        ├── reads server-only PostHog credentials
        ├── applies fixed query allowlist and date limits
        ├── caches aggregate results
        └── returns a fixed, sanitized response
        │
        ▼
Storefront Growth Analytics page
        │
        ├── KPI cards
        ├── customer journey
        ├── retention
        ├── device and role breakdowns
        └── plain-language recommendations
```

## 6. Component Ownership

### WordPress plugin: authorization source of truth

Component:

```text
nevari-pharmacy-core/
```

Responsibilities:

- Add the `analytics` permission key.
- Map it to a WordPress capability.
- Include it in permission assignment and session claims.
- Define safe default role access.
- Provide an explicit authorization check that the Next.js server route can verify through the signed proxy.
- Audit permission changes without recording PostHog credentials or query payloads.

### Next.js dashboard: event capture, query adapter, and UI

Component:

```text
NevariAdmin Storefront/
```

Responsibilities:

- Capture the approved custom events.
- Keep automatic sensitive capture disabled.
- Query PostHog from a server-only route.
- Validate the requested date range and reject unexpected fields.
- Return only the fixed aggregate response contract.
- Fetch remote analytics through SWR.
- Render the Growth Analytics page in the existing storefront dashboard.
- Hide navigation when the user lacks permission, while relying on server authorization as the actual security control.

### PostHog: analytics storage and aggregation

Responsibilities:

- Receive privacy-safe events.
- Store anonymous or pseudonymous analytics identifiers.
- Aggregate counts, conversion, retention, and breakdowns.
- Never act as Nevari's authorization source.

## 7. Authorization and Permission Model

### New permission

Add the following permission to `Nevari_User_Governance::PERMISSIONS`:

```text
analytics → nevari_storefront_analytics
```

Add the dashboard mapping:

```text
growth-analytics → analytics
```

### Default role access

| Role | Default access | Reason |
|---|---:|---|
| `administrator` | Yes | Full platform administration |
| `store_admin` | Yes | Owns business and storefront performance |
| `shop_manager` | Optional | Grant only when commercial reporting is part of the role |
| `pharmacist` | No | Clinical/dispensing role does not require platform-wide analytics |
| `doctor` | No | Clinical role does not require platform-wide analytics |
| `nurse` | No | Care-delivery role does not require platform-wide analytics |
| Patient/customer roles | Never | Staff-only business analytics |

### Enforcement rules

1. The navigation item is visible only to users with the `analytics` permission or the `administrator` role.
2. `switchPage()` must reject unauthorized page changes.
3. The Next.js analytics API route must independently verify the authenticated session.
4. WordPress must remain the authorization source of truth.
5. The route must return `401` for missing/invalid sessions and `403` for authenticated users without permission.
6. Role alone must not silently override permission assignment, except the existing explicit `administrator` behavior.
7. Permission assignment changes must remain protected by the current governance rules and audit logging.

## 8. Security and Privacy Requirements

This application handles healthcare-adjacent, patient, prescription, and payment data. Analytics must be treated as a data-exposure boundary.

### Prohibited analytics data

Never send any of the following to PostHog:

- Patient, customer, doctor, nurse, or pharmacist names.
- Email addresses or phone numbers.
- Postal or billing addresses.
- Passwords, verification codes, access tokens, refresh tokens, session values, cookies, nonces, or CSRF tokens.
- WordPress user IDs or WooCommerce customer IDs.
- Prescription numbers, prescription IDs, medication names, diagnosis, allergies, or clinical notes.
- Appointment IDs, appointment references, patient notes, meeting URLs, or consultation contents.
- Order IDs, invoice references, Paystack references, transaction references, or payment tokens.
- File names, uploaded document names, MIME payloads, or document contents.
- Search text, free-text inputs, query strings, URL fragments, or form contents.
- Raw API request or response bodies.

### Allowed event properties

The first version may send only allowlisted values:

| Property | Allowed values |
|---|---|
| `role` | `patient`, `doctor`, `pharmacist`, `nurse`, `store_admin`, `anonymous`, `unknown` |
| `device_type` | `mobile`, `desktop`, `tablet`, `unknown` |
| `service_type` | Fixed non-clinical workflow categories |
| `outcome` | `started`, `completed`, `failed`, `cancelled` |
| `environment` | `development`, `preview`, `production` |
| `payment_type` | `order`, `appointment`, `subscription`, `therapy`, `unknown` |
| `subscription_interval` | Fixed billing interval only |
| `source_area` | Fixed page/workflow identifier |

All event names and properties must be created through a central helper that rejects non-allowlisted keys and values.

### Analytics identity

Retention requires a stable identifier, but it must not reveal a Nevari account identifier.

Recommended design:

1. Generate a dedicated random analytics UUID after a successful authenticated session.
2. Store the mapping server-side or derive a one-way opaque identifier using a separate analytics secret and a stable internal identifier.
3. Never use email, phone number, WordPress user ID, customer ID, or another reversible identifier as the PostHog `distinct_id`.
4. Rotate or delete analytics identity where policy, account deletion, or consent requirements demand it.
5. Call `posthog.reset()` on logout to prevent identity mixing on shared devices.

The final identity design must be reviewed before retention tracking is enabled.

### Current privacy controls to preserve

The existing PostHog initialization already disables:

- Autocapture.
- Automatic page views.
- Page-leave capture.
- Session recording.
- Surveys.
- Automatic feature flags.
- Performance capture.
- Heatmaps.
- Text and element attribute capture.

The implementation must not weaken these settings.

## 9. Event Tracking Plan

### Event naming

- Use lowercase snake case.
- Use past tense for successful completion events.
- Use a fixed vocabulary.
- Do not place identifiers or values in event names.

### Phase 1 events

Start with the smallest useful set:

| Event | Trigger |
|---|---|
| `$pageview` | Sanitized pathname-only navigation; already implemented |
| `registration_started` | First meaningful registration interaction |
| `registration_completed` | Server confirms successful registration |
| `login_completed` | Server confirms successful login/session creation |
| `consultation_started` | User begins the consultation journey |
| `consultation_submitted` | Server accepts a consultation request |
| `appointment_booking_started` | User enters appointment scheduling |
| `appointment_booked` | Server confirms the appointment |
| `payment_initialized` | Server creates a valid payment transaction |
| `payment_completed` | Server verifies successful payment |
| `subscription_viewed` | User views available subscription options |
| `subscription_started` | Server confirms an active subscription |

### Optional later events

Add only after the first dashboard is useful and verified:

- `prescription_upload_started`
- `prescription_upload_completed`
- `appointment_cancelled`
- `appointment_rescheduled`
- `subscription_cancelled`
- `subscription_renewed`

### Event source of truth

Completion events must be emitted only after server-confirmed success. A button click is not proof of:

- Registration completion.
- Appointment creation.
- Payment verification.
- Subscription activation.

This prevents inflated conversion metrics and ensures payment analytics never trusts a client-declared outcome.

## 10. Metric Definitions

Every displayed percentage must have a documented numerator, denominator, time range, and empty-data behavior.

### Unique visitors

```text
Distinct privacy-safe analytics identities that generated an allowed pageview
within the selected period.
```

Anonymous and authenticated identities must not be double-counted after identity stitching.

### Registration completion rate

```text
Distinct identities with registration_completed
÷
Distinct identities with registration_started
× 100
```

### Consultation submission rate

```text
Distinct identities with consultation_submitted
÷
Distinct identities with consultation_started
× 100
```

### Appointment booking conversion

```text
Distinct identities with appointment_booked
÷
Distinct identities with appointment_booking_started
× 100
```

### Payment completion rate

```text
Distinct identities with payment_completed
÷
Distinct identities with payment_initialized
× 100
```

Payment status must be based on server/provider verification.

### Subscription conversion

```text
Distinct identities with subscription_started
÷
Distinct identities with subscription_viewed
× 100
```

### Seven-day return rate

```text
Percentage of identities that performed the selected activation event
and returned to perform an allowed meaningful event within 7 days.
```

The initial activation event should be `login_completed` or another approved non-sensitive engagement event. The team must choose one definition and keep it stable.

### Thirty-day return rate

```text
Percentage of identities that performed the selected activation event
and returned to perform an allowed meaningful event within 30 days.
```

### Funnel drop-off

Initial patient journey:

```text
Page visit
→ Registration started
→ Registration completed
→ Consultation started
→ Consultation submitted
→ Appointment booked
→ Payment completed
```

The UI should show:

- People reaching each step.
- Percentage of starting visitors.
- Drop-off from the previous step.
- Device and role filters when sample size is sufficient.

### Small sample behavior

- Display `—` rather than `0%` when there is no valid denominator.
- Do not generate recommendations from insufficient samples.
- Consider suppressing breakdown rows with fewer than an agreed minimum number of identities.
- Never expose small groups if they could enable re-identification.

## 11. PostHog Configuration

### Existing public ingestion variables

```text
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
```

These enable browser event ingestion. The project key is public by design.

### Required server-only query variables

```text
POSTHOG_PERSONAL_API_KEY
POSTHOG_PROJECT_ID
POSTHOG_QUERY_HOST
```

Rules:

- `POSTHOG_PERSONAL_API_KEY` must never use the `NEXT_PUBLIC_` prefix.
- Use a dedicated restricted PostHog service account or personal API key with the minimum query/read scope.
- Store secrets only in Vercel environment variables and approved local secret storage.
- Configure Preview and Production separately.
- Do not commit secret values to `.env.example`, logs, fixtures, screenshots, or documentation.
- Fail closed when required server variables are missing.

### Environment isolation

Every event must carry an allowlisted `environment` value. Production dashboards should default to production-only data. Development and preview activity must not inflate production metrics.

## 12. Next.js Server API Design

### Proposed route

```text
GET /api/admin/analytics/summary
```

### Query parameters

```text
range=7d|30d|90d
```

Optional later filters:

```text
device=all|mobile|desktop|tablet
role=all|patient|doctor|pharmacist|nurse|store_admin
```

The first release should support only the date range. Add filters after event quality is verified.

### Input validation

- Reject unknown query parameters.
- Allow only `7d`, `30d`, and `90d`.
- Apply a fixed maximum date range.
- Do not accept arbitrary HogQL, insight IDs, event names, property names, or SQL from the browser.
- Do not accept a PostHog host, project ID, or API key from the request.

### Authentication flow

1. Read the existing server-managed session cookie.
2. Verify the session using the established Nevari server-side route pattern.
3. Confirm the user has the `analytics` storefront permission through WordPress.
4. Reject before querying PostHog when authentication or authorization fails.
5. Never rely only on the hidden navigation item.

### PostHog query adapter

Create a small server-only helper, for example:

```text
app/lib/posthog-analytics-server.js
```

Responsibilities:

- Read server-only environment variables.
- Maintain a fixed allowlist of metric queries.
- Add environment and date filters.
- Apply request timeouts.
- Normalize PostHog results.
- Return aggregate values only.
- Convert provider errors into safe internal error types.

The helper must never be imported by a client component.

### Proposed response contract

```json
{
  "range": "30d",
  "generated_at": "2026-07-27T08:00:00Z",
  "metrics": {
    "unique_visitors": {
      "value": 2486,
      "change_percent": 12
    },
    "registration_completion": {
      "value_percent": 68,
      "change_percent": 4
    },
    "consultation_submission": {
      "value_percent": 54,
      "change_percent": 7
    },
    "appointment_booking": {
      "value_percent": 46,
      "change_percent": 5
    },
    "payment_completion": {
      "value_percent": 85,
      "change_percent": 3
    },
    "subscription_conversion": {
      "value_percent": 18,
      "change_percent": 2
    },
    "return_7_day": {
      "value_percent": 38,
      "change_percent": 5
    },
    "return_30_day": {
      "value_percent": 24,
      "change_percent": 3
    }
  },
  "journey": [
    {
      "key": "visited",
      "label": "Visited the storefront",
      "count": 2486,
      "percent_of_start": 100,
      "drop_off_percent": 0
    }
  ],
  "breakdowns": {
    "device": [
      {
        "key": "mobile",
        "label": "Mobile",
        "percent": 62
      }
    ],
    "role": [
      {
        "key": "patient",
        "label": "Patients",
        "percent": 72
      }
    ]
  },
  "recommendations": [
    {
      "key": "mobile_consultation_dropoff",
      "tone": "attention",
      "title": "Mobile needs attention",
      "message": "Mobile visitors are more likely to leave during consultation."
    }
  ],
  "data_status": "ready"
}
```

Response rules:

- Use fixed keys and labels.
- Do not return raw PostHog query results.
- Do not return event properties, `distinct_id`, person records, or query text.
- Do not expose provider error details.
- Return a generic service-unavailable response when PostHog fails.

## 13. Caching and Reliability

Analytics does not require real-time precision.

Recommended behavior:

- Cache each environment/range response for 5 to 15 minutes.
- Use stale-while-revalidate behavior when practical.
- Apply a short PostHog request timeout.
- Serve the last safe cached aggregate result when PostHog is temporarily unavailable.
- Mark stale data clearly with `generated_at` and `data_status`.
- Do not retry indefinitely.
- Do not allow the Growth Analytics request to block the operational Overview page.

Suggested status values:

```text
ready
stale
insufficient_data
not_configured
unavailable
```

## 14. Frontend Data Flow

### SWR key

Add a consistent key to `lib/swrKeys.js`, for example:

```text
adminGrowthAnalytics(baseUrl, range)
```

### Fetching

- Fetch through the protected Next.js route.
- Use SWR for remote state.
- Keep the selected date range in local React state.
- Do not store analytics responses in browser storage.
- Cancel or ignore stale requests when the date range changes.

### UI states

The page must include:

- Skeleton loading state matching the final layout.
- Empty/insufficient-data state.
- Permission-denied state.
- Not-configured state for missing PostHog query credentials.
- Temporary-unavailable state with a Retry action.
- Stale-data notice showing the last update time.

## 15. User Interface Plan

### Page identifier

```text
growth-analytics
```

### Page heading

```text
How your storefront is growing
```

Supporting copy:

```text
A simple view of how people discover Nevari, complete important steps,
and return for care.
```

### Sections

1. Date range: 7 days, 30 days, 3 months.
2. Key metric cards.
3. Customer journey.
4. Seven-day and thirty-day return rates.
5. Visits by device.
6. Visits by customer type.
7. Plain-language recommendations.
8. Privacy note confirming aggregate data only.

### Design requirements

- Use `main nevari design system.html` as the source of truth.
- Reuse existing sidebar, top bar, page heading, metric, panel, badge, chart, and skeleton patterns.
- Use plain CSS in `app/globals.css`.
- Reuse Recharts for live charts.
- Do not introduce Tailwind or another component library.
- Use SVG or the existing icon system; do not use emoji icons.
- Preserve visible keyboard focus.
- Avoid layout-shifting hover effects.
- Respect `prefers-reduced-motion`.
- Support 375px, 768px, 1024px, and 1440px layouts.
- Ensure no horizontal overflow.
- Use plain language and short explanations.

### Recommended plain-language labels

| Technical concept | Display label |
|---|---|
| Unique users | People who visited |
| Registration conversion | Completed registration |
| Consultation conversion | Sent a consultation request |
| Appointment conversion | Booked an appointment |
| Retention | People coming back |
| Funnel | Customer journey |
| Segmentation | Visits by device/customer type |
| Insight | What to focus on |

## 16. Plain-Language Recommendation Rules

Recommendations must be deterministic and based on aggregate thresholds. Do not use patient-level data.

Examples:

- If mobile consultation conversion is materially lower than desktop:
  - Title: `Mobile needs attention`
  - Message: `Mobile visitors are more likely to leave during consultation.`
- If payment completion improves compared with the previous period:
  - Title: `More visitors are becoming customers`
  - Message: `Payment completion improved compared with the previous period.`
- If there is insufficient data:
  - Title: `More activity is needed`
  - Message: `There is not enough information yet to identify a reliable trend.`

Recommendations should not claim causation. Use language such as “may,” “appears,” or “is more likely,” unless the evidence is definitive.

## 17. File-Level Implementation Plan

Expected files to update or add:

### WordPress

```text
nevari-pharmacy-core/includes/class-nevari-user-governance.php
```

Changes:

- Add `analytics` permission and capability.
- Add safe role defaults.
- Include it in assignment validation.
- Ensure session permission claims include it.

If a dedicated authorization verification route is needed, add it through the existing REST controller pattern with an explicit `permission_callback`.

### Next.js configuration

```text
NevariAdmin Storefront/.env.example
```

Add names only:

```text
POSTHOG_PERSONAL_API_KEY=""
POSTHOG_PROJECT_ID=""
POSTHOG_QUERY_HOST="https://us.posthog.com"
```

Confirm the exact query host for the configured PostHog region during implementation.

### Next.js server

```text
NevariAdmin Storefront/app/api/admin/analytics/summary/route.js
NevariAdmin Storefront/app/lib/posthog-analytics-server.js
```

### Next.js data layer

```text
NevariAdmin Storefront/lib/swrKeys.js
NevariAdmin Storefront/lib/fetcher.js
```

Reuse the existing fetcher when possible.

### Next.js UI

```text
NevariAdmin Storefront/app/admin/storefront/page.js
NevariAdmin Storefront/app/globals.css
```

Keep reusable analytics formatting/query-independent helpers outside the large page component. Create a shared component only if it is genuinely reused or materially reduces the existing page size without unnecessary abstraction.

### Event capture

Likely files include the successful endpoints/components for:

- Registration.
- Login/session completion.
- Consultation submission.
- Appointment booking.
- Payment initialization and verification.
- Subscription activation.

Locate and review each source of truth before implementation. Do not emit completion events only from button click handlers.

## 18. Implementation Phases

### Phase 0: Configuration and decisions

- Confirm PostHog region.
- Create a restricted PostHog query credential.
- Confirm PostHog project/environment ID.
- Decide analytics identity design.
- Confirm default roles for the `analytics` permission.
- Agree on the activation event used for retention.
- Add server-only Vercel variables to Preview first.

Exit criteria:

- No secret is committed.
- Query credentials have minimum required access.
- Metric definitions are approved.

### Phase 1: Permission foundation

- Add `analytics` to WordPress governance.
- Add capability defaults.
- Add dashboard page-to-permission mapping.
- Verify assignment, session claims, sidebar visibility, and direct navigation rejection.

Exit criteria:

- Administrator can access.
- Authorized store admin can access.
- Unauthorized store admin and clinical roles cannot access.
- Authorization is enforced server-side.

### Phase 2: Central analytics capture helper

- Create a privacy-safe event helper.
- Enforce event and property allowlists.
- Add environment.
- Implement logout reset.
- Add test coverage for prohibited keys and values.

Exit criteria:

- Sensitive properties are rejected or removed.
- No form contents or identifiers reach PostHog.

### Phase 3: Core custom events

- Add the initial event set.
- Emit success events from authoritative outcomes.
- Verify events in PostHog Preview/Development live events.
- Validate counts against known test journeys.

Exit criteria:

- Each event appears once per intended action.
- Failed actions do not emit completion events.
- No sensitive properties are present.

### Phase 4: Server-only query API

- Add the PostHog query adapter.
- Add fixed queries for approved metrics.
- Add authentication and analytics permission verification.
- Add date validation, caching, timeouts, and safe errors.
- Return the fixed aggregate contract.

Exit criteria:

- Missing session returns `401`.
- Wrong permission returns `403`.
- Invalid range returns `400`.
- Missing server configuration fails closed.
- PostHog credential never reaches the browser.

### Phase 5: Growth Analytics UI

- Add navigation item.
- Convert the approved prototype into the existing Next.js dashboard.
- Use SWR and Recharts.
- Implement loading, empty, stale, unavailable, and forbidden states.
- Match the admin design system.

Exit criteria:

- UI matches the approved prototype and design system.
- All data comes through the protected API route.
- Desktop and mobile layouts pass visual verification.

### Phase 6: Data-quality validation

- Compare PostHog totals with controlled test journeys.
- Confirm denominators and conversion windows.
- Check duplicate event behavior.
- Check anonymous-to-authenticated identity transitions.
- Confirm development data is excluded from production.
- Review small-sample suppression.

Exit criteria:

- Each displayed metric has a trusted definition.
- Test journey results match expected counts.

### Phase 7: Preview rollout

- Build and lint.
- Deploy to the `dev` branch and Vercel Preview/Development only after explicit target confirmation.
- Run Playwright as authorized and unauthorized roles.
- Confirm PostHog queries and custom events.
- Monitor Sentry for analytics route failures.

### Phase 8: Production rollout

- Obtain explicit production authorization.
- State the production branch and URL before pushing/deploying.
- Add Production server-only variables.
- Deploy.
- Run read-only smoke tests.
- Confirm the production environment filter.
- Monitor errors and query latency.

## 19. Testing Plan

### Unit tests

- Event allowlist accepts approved events.
- Event helper removes or rejects prohibited properties.
- Date range validator allows only `7d`, `30d`, and `90d`.
- Metric normalization handles missing and malformed PostHog results.
- Percentage calculations handle zero denominators.
- Recommendation rules do not run on insufficient samples.

### API tests

- Unauthenticated request: `401`.
- Authenticated without `analytics`: `403`.
- Authenticated with `analytics`: `200`.
- Unknown query parameter: `400`.
- Invalid range: `400`.
- Missing PostHog server variables: safe configuration error.
- PostHog timeout: safe unavailable/stale response.
- Provider error body is not returned to the client.
- Response contains no distinct identities or event properties.

### WordPress permission tests

- `analytics` appears in assignable permissions.
- Administrator receives it.
- Store admin defaults are correct.
- Clinical roles do not receive it by default.
- Removing it revokes navigation and API access.
- Permission changes are audited.

### Event tests

- Successful workflow emits exactly one completion event.
- Failed workflow emits no completion event.
- Repeated submission does not inflate completion when idempotency applies.
- Payment completion requires verified provider/server status.
- Logout resets PostHog identity.
- Query string and sensitive route values are not captured.

### Playwright tests

Run at minimum:

- 1440px desktop.
- 1024px laptop/tablet.
- 768px tablet.
- 375px mobile.

Verify:

- Authorized user sees and opens Growth Analytics.
- Unauthorized user does not see the item.
- Direct unauthorized page selection is rejected.
- Date-range controls update without layout shift.
- Loading, empty, stale, unavailable, and ready states render correctly.
- No horizontal overflow.
- Keyboard focus is visible.
- No browser console or page errors.
- Aggregate numbers render without exposing sensitive values.

### Build validation

```text
npm run build
```

PHP files must pass `php -l`.

## 20. Observability

Use Sentry for the analytics integration itself:

- PostHog query latency.
- Query timeout count.
- Cache hit/miss outcome.
- Safe error category.
- Response status.

Do not log:

- PostHog personal API keys.
- Authorization headers.
- Raw query responses.
- Distinct identities.
- Patient/customer identifiers.
- Request cookies.

Suggested safe tags:

```text
feature=growth_analytics
range=7d|30d|90d
outcome=success|stale|timeout|provider_error|forbidden
environment=development|preview|production
```

## 21. Failure and Empty States

### Not configured

```text
Analytics is not connected yet.
```

Show only to authorized users. Do not reveal which specific secret is missing.

### Insufficient data

```text
There is not enough activity yet to show a reliable trend.
```

### Temporarily unavailable

```text
Growth information is temporarily unavailable. Please try again shortly.
```

### Stale data

```text
Showing the latest available information from [time].
```

### Forbidden

Use the dashboard's existing permission behavior. Do not reveal analytics data or provider details.

## 22. Rollout and Backout

### Rollout

1. Instrument Preview/Development.
2. Collect controlled test data.
3. Validate event quality and privacy.
4. Enable the query API.
5. Enable the page for administrators.
6. Assign access to selected store admins.
7. Observe for at least one normal business cycle.
8. Obtain explicit production authorization.
9. Deploy Production.

### Backout

The feature should be easy to disable without affecting operational pages:

- Remove or withhold the `analytics` permission.
- Disable the navigation item behind a server configuration flag if needed.
- Remove PostHog query credentials to make the route fail closed.
- Preserve existing Overview, order, payment, consultation, and subscription functionality.

Disabling analytics must not break authentication or customer workflows.

## 23. Acceptance Criteria

The feature is complete when:

- A dedicated Growth Analytics page exists.
- The existing Overview remains unchanged.
- Access uses the existing permission assignment system.
- WordPress and the server API independently enforce `analytics`.
- The PostHog query key is server-only.
- The page displays all approved metrics with documented definitions.
- All custom events are privacy-safe and server-confirmed where appropriate.
- Development and production data are isolated.
- No raw event or person data reaches the browser.
- Empty, stale, unavailable, and forbidden states work.
- Build, PHP lint, API tests, and Playwright tests pass.
- Security documentation is updated if implementation changes any tracked finding or decision.
- Preview is verified before Production.
- Production is deployed only with explicit authorization.

## 24. Required Inputs Before Implementation

The following are still needed:

1. Confirmation that the PostHog project is in the US region.
2. PostHog project/environment ID.
3. Restricted PostHog personal API key entered directly into Vercel, not chat.
4. Final approval for default access:
   - Administrator: yes.
   - Store admin: yes.
   - Shop manager: decide.
5. Final retention activation event.
6. Approval of the visual prototype.
7. Deployment target confirmation when implementation reaches rollout.

## 25. Recommended First Release

Keep the first release deliberately small:

- One dedicated Growth Analytics page.
- Three date ranges.
- Eight approved aggregate metrics.
- One customer journey.
- Device and role breakdowns.
- Two or three deterministic recommendations.
- One new `analytics` permission.
- No arbitrary filters.
- No exports.
- No event-level drill-down.
- No session replay.

This is enough to give clients a useful, understandable growth dashboard without exposing PostHog or increasing privacy risk unnecessarily.
