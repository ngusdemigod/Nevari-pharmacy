Build a production-ready analytics dashboard inside my existing Next.js application.

The page must be named “Analytics” and added to the existing project rather than created as a separate application.

IMPORTANT NAVIGATION REQUIREMENTS

DO NOT BUILD, RENDER, OR ADD A SIDEBAR FOR THIS PAGE.

Do not recreate the sidebar shown in the visual reference. The dashboard must use the existing application layout and existing navigation components.

Add a new navigation link named “Analytics” directly underneath the existing “Overview” navigation link.

The navigation order must be:

Overview
Analytics

“Overview” and “Analytics” must remain top-level navigation items.

Do not place either “Overview” or “Analytics” inside the “Nevari Pharmacy” grouped navigation items.

Do not move, rename, duplicate, or regroup the existing Overview link.

Before modifying navigation, inspect the existing navigation configuration and follow its current component structure, icon system, routing conventions, active-state styling, and permission handling.

PAGE AND ROUTING

Create the Analytics page using the existing Next.js routing convention in the project.

Use the route:

/analytics

Use the existing authenticated application layout, page container, header, breadcrumb conventions, and permission system.

Do not create a new global layout.

Do not replace existing project-level providers, navigation components, authentication logic, or styling configuration.

VISUAL DIRECTION

Use the existing Nevari design system and application components wherever possible.

The dashboard must have:

- A plain white page background
- No gradients
- No drop shadows
- No glassmorphism
- No decorative background effects
- Flat, subtle card colors
- Light borders to separate sections
- Generous spacing
- Clear hierarchy created mainly through font size, spacing, layout, and contrast
- Minimal use of bold text
- Normal or medium font weights for most labels and headings
- Rounded corners consistent with the existing design system
- Accessible text contrast
- Subtle, purposeful animations only
- Responsive behavior on desktop, tablet, and mobile

Do not copy the sidebar from the supplied dashboard reference.

PAGE HEADER

Create a simple page header containing:

- Page title: Analytics
- Supporting text written for non-technical users
- Date-range selector
- Previous-period comparison toggle
- Refresh control
- Last-updated status

Suggested supporting text:

“Understand how people discover, use, and purchase through Nevari.”

Use plain language throughout the dashboard. Avoid analytics jargon where a simpler explanation is possible.

DATE-RANGE CONTROLS

Support these date ranges:

- Last 7 days
- Last 30 days
- Last 90 days
- Custom date range, if the project already has an appropriate date-picker component

The selected date range must update both PostHog and commerce metrics.

The previous-period toggle must compare the selected range against the immediately preceding equivalent period.

Examples:

- Last 7 days compares against the previous 7 days
- Last 30 days compares against the previous 30 days
- A custom 14-day range compares against the preceding 14-day range

Keep the selected date range and comparison state in URL search parameters so the page can be refreshed or shared without losing the selected filters.

POSTHOG DATA

PostHog is already configured in the project.

Use the existing PostHog SDK, configuration, environment variables, and analytics access layer.

Do not install or initialize another PostHog client unless the project architecture explicitly requires it.

Do not expose PostHog personal API keys, project keys intended for server-side querying, or other secrets in client-side code.

All analytical queries that require privileged access must run on the server.

Display the following PostHog metrics:

1. Unique visitors
2. Registration completion percentage
3. Consultation submission percentage
4. Appointment booking conversion
5. Payment completion percentage
6. Subscription conversion
7. Seven-day retention
8. Thirty-day retention
9. Funnel stages and drop-off
10. Device breakdown
11. Role breakdown

Each percentage card must explain its denominator in simple language.

Examples:

- Registration completion:
  “Of people who started registration”
- Appointment booking:
  “Of people who submitted a consultation”
- Payment completion:
  “Of people who reached payment”
- Subscription conversion:
  “Of eligible customers who viewed a subscription option”

Do not guess event names.

Inspect the existing PostHog implementation, event constants, tracking utilities, and property names before creating queries.

Create a clearly typed mapping between dashboard metrics and the actual PostHog events already used by the application.

If an event or property cannot be found, isolate it in a configuration object and leave a clearly documented implementation note rather than silently inventing a production event name.

FUNNEL SECTION

Create a clear funnel visualization showing the relevant customer journey.

Suggested stages:

- Visited
- Started registration
- Completed registration
- Submitted consultation
- Booked appointment
- Completed payment
- Started subscription

Use the actual event sequence available in the project.

For every funnel stage, show:

- Stage name
- Number of people reaching the stage
- Percentage continuing from the previous stage
- Number or percentage dropping off
- Previous-period change when comparison is enabled

Use a simple horizontal or vertical stepped layout.

Do not use overly technical chart labels.

RETENTION SECTION

Display seven-day and thirty-day retention in a clearly separated section.

Include:

- Current-period retention
- Previous-period retention when enabled
- Percentage-point change
- A short explanation of what retention means in this product

Do not present percentage-point changes as ordinary percentage growth.

DEVICE AND ROLE BREAKDOWNS

Add simple breakdown visualizations for:

- Desktop
- Mobile
- Tablet
- Other or unknown

Add a role breakdown using the actual role property available in PostHog.

Examples may include patient, doctor, pharmacist, admin, or other roles, but only display roles that exist in the returned data.

Use accessible horizontal bars or compact lists rather than complex charts.

COMMERCE AND PRODUCT DATA

Add a commerce section using product and order data supplied through Pharmacy Core from the WooCommerce website.

The browser must not call WooCommerce directly.

Do not expose WooCommerce consumer keys, secrets, authentication headers, or privileged Pharmacy Core credentials to client-side code.

Use the existing Pharmacy Core integration or internal server-side service layer.

If Pharmacy Core does not currently expose the required aggregated data, add an internal, authenticated server-side adapter rather than connecting the page directly to WooCommerce.

STORE METRICS

Display these store metrics:

1. Gross sales
2. Completed orders
3. Average order value
4. On-time fulfillment percentage

Use the project’s existing currency and formatting conventions. Where no convention exists, format monetary values using en-US currency formatting and the store’s configured currency.

Definitions should be explicit:

- Gross sales:
  Total sales before refunds or adjustments, based on the existing Pharmacy Core definition
- Completed orders:
  Orders with the project’s recognized completed status
- Average order value:
  Gross or net sales divided by the matching order count, using a consistent definition
- On-time fulfillment:
  Percentage of fulfilled orders completed within the configured fulfillment target

Do not silently mix gross sales, net sales, refunded amounts, or completed-order totals.

PRODUCT METRICS

Display:

1. Product views
2. Add-to-cart rate
3. Purchases
4. Sales by product

Product views and add-to-cart behavior may come from PostHog if those interactions are tracked there.

Purchases, product revenue, order status, and inventory must come from Pharmacy Core or its WooCommerce-backed data source.

Clearly document how PostHog product identifiers are matched to WooCommerce or Pharmacy Core product identifiers.

Prefer a stable identifier such as:

- Product ID
- Variation ID
- SKU

Do not match products only by display name.

Create a product performance table with:

- Product name
- SKU, when available
- Product views
- Add-to-cart rate
- Quantity purchased
- Sales
- Inventory status
- Previous-period change

Support sorting by sales, purchases, product views, and add-to-cart rate.

Use server-side sorting or sorting over an already limited result set. Do not download an unbounded product catalog to the browser.

INVENTORY AVAILABILITY

Add an inventory overview containing:

- In-stock products
- Low-stock products
- Out-of-stock products
- Percentage of catalog currently available

Use the Pharmacy Core or WooCommerce inventory thresholds already configured in the system.

Do not invent a low-stock threshold if one already exists.

Provide a compact breakdown and a list of the most important low-stock or out-of-stock products.

Limit the list to a reasonable number, such as the top 5 or top 10 products, with an option to navigate to the existing product-management area where appropriate.

ORDER-OUTCOME BREAKDOWN

Add an order-outcome section using the actual status mapping from Pharmacy Core.

Possible categories may include:

- Completed
- Processing
- Pending
- Cancelled
- Refunded
- Failed

Use only statuses present in the returned data.

Show:

- Order count
- Percentage of total orders
- Previous-period difference when enabled

PERFORMANCE AND SCALABILITY

Design the implementation for at least 200 concurrent authenticated users without placing unnecessary strain on the application server, Pharmacy Core, WooCommerce, or PostHog.

Do not perform one remote request per dashboard card.

Do not make WooCommerce requests separately for every user viewing the page.

Do not query the complete WooCommerce order or product history during a page request.

Use a server-side analytics service that batches related requests.

Prefer a small number of aggregated operations, for example:

- One PostHog summary operation
- One PostHog funnel and breakdown operation
- One Pharmacy Core commerce summary operation
- One Pharmacy Core product-performance operation

Where supported by the existing architecture, use:

- Next.js server components for the initial page
- Server-only service modules
- Request deduplication
- Shared caching
- Stale-while-revalidate behavior
- Incremental revalidation
- Pharmacy Core aggregated endpoints
- Database-level aggregation
- Indexed date and status fields
- Timeouts and controlled retries
- Pagination for product tables
- Abort signals for remote requests

Cache aggregated analytics by:

- Date range
- Comparison state
- Relevant tenant, store, or pharmacy identifier
- Permission scope, where required

Use a shared cache rather than an isolated per-browser cache.

A suggested cache policy is:

- PostHog summaries: 2 to 5 minutes
- Store summaries: 2 to 5 minutes
- Product performance: 5 minutes
- Inventory summary: 1 to 5 minutes, based on how time-sensitive current stock must be

Use the project’s existing caching infrastructure where available.

Do not add a second caching system unnecessarily.

For WooCommerce-backed data, prefer this order of implementation:

1. Read already aggregated data from Pharmacy Core
2. Read from a Pharmacy Core database or reporting table
3. Maintain cached aggregates through scheduled synchronization or WooCommerce webhooks
4. Use live WooCommerce requests only as a controlled fallback

Avoid sending concurrent live WooCommerce requests when cached or aggregated data can serve the request.

Implement request coalescing so multiple users requesting the same date range do not trigger identical upstream requests simultaneously.

Where the project supports background processing, update commerce aggregates through:

- WooCommerce webhooks
- Scheduled synchronization
- Background jobs
- Queue workers

The dashboard page should primarily read prepared data rather than calculate large reports during each request.

RESILIENCE

A temporary PostHog, Pharmacy Core, or WooCommerce failure must not cause the whole Analytics page to fail.

Handle each data section independently.

Provide:

- Loading skeletons
- Empty states
- Section-level error messages
- Retry actions
- Stale-data fallback
- Last-updated timestamps

If cached data is displayed because the upstream service is unavailable, show a subtle message such as:

“Showing the most recent available data.”

Do not expose internal error messages, credentials, request URLs, SQL errors, or stack traces to the browser.

SECURITY

Keep all privileged analytics and commerce access server-side.

Use the project’s existing authentication and authorization system.

Verify that the current user has permission to view analytics before returning dashboard data.

Apply tenant, pharmacy, or store scoping to every query.

Do not trust a tenant or store identifier supplied only through client-side query parameters.

Derive access scope from the authenticated session whenever possible.

Return aggregated information only.

Do not return unnecessary customer names, email addresses, medical information, consultation content, payment details, addresses, or other personally identifiable information.

Validate and normalize all date-range parameters.

Set maximum allowed custom date ranges to prevent expensive unbounded queries.

Use typed schemas for responses and validate upstream data before rendering it.

IMPLEMENTATION STRUCTURE

Follow the project’s existing folder structure and naming conventions.

A suitable structure may resemble:

app/
  analytics/
    page.tsx
    loading.tsx
    error.tsx

components/
  analytics/
    analytics-header.tsx
    metric-card.tsx
    conversion-funnel.tsx
    retention-panel.tsx
    device-breakdown.tsx
    role-breakdown.tsx
    store-metrics.tsx
    product-performance-table.tsx
    inventory-overview.tsx
    order-outcomes.tsx

lib/
  analytics/
    posthog-analytics.server.ts
    commerce-analytics.server.ts
    analytics-cache.server.ts
    analytics-types.ts
    analytics-schema.ts

Adapt this structure to the application instead of forcing it when equivalent modules already exist.

Use TypeScript throughout.

Avoid large monolithic page components.

Keep data access, transformations, and presentation separated.

Do not place secret-bearing SDK initialization inside React client components.

CLIENT AND SERVER COMPONENTS

Keep the main page and data fetching server-rendered where practical.

Use client components only for interactive controls such as:

- Date-range selection
- Previous-period toggle
- Refresh action
- Sorting
- Mobile disclosure controls
- Small visual animations

Do not move all analytics data fetching into useEffect.

Changing a filter should update URL search parameters and allow the server-rendered dashboard to refresh.

Use React transitions or the project’s existing loading mechanism so filter changes feel responsive.

ANIMATION

Use subtle animations only.

Suitable animation examples:

- A short opacity transition when refreshed data appears
- Smooth progress-bar width changes
- Gentle number transitions
- A small rotation during manual refresh
- Expand and collapse transitions on mobile

Respect prefers-reduced-motion.

Do not use bouncing, glowing, pulsing, parallax, or decorative movement.

RESPONSIVE BEHAVIOR

Desktop:

- Use a multi-column metric-card grid
- Keep controls aligned to the right of the page header where space allows
- Show product data in a table

Tablet:

- Reduce metric grids to two columns
- Allow header controls to wrap
- Preserve readable chart labels

Mobile:

- Use a single-column layout
- Stack header controls
- Make controls full-width where appropriate
- Convert wide product tables into horizontally scrollable tables or accessible cards
- Keep touch targets at least 44 pixels
- Do not introduce a new mobile sidebar or drawer specifically for Analytics

ACCESSIBILITY

Use semantic headings in the correct order.

Every control must have an accessible name.

Ensure keyboard navigation works for:

- Date-range controls
- Comparison toggle
- Refresh button
- Product sorting
- Expandable mobile sections

Do not rely on color alone to communicate positive or negative changes.

Use text and icons together.

Provide accessible chart summaries for screen readers.

TESTING

Add or update tests covering:

- Analytics route rendering
- Navigation placement
- Analytics appearing directly below Overview
- Overview and Analytics remaining outside the Nevari Pharmacy group
- Permission protection
- Date-range parsing
- Previous-period calculations
- PostHog metric transformations
- Pharmacy Core commerce transformations
- Currency formatting
- Empty states
- Partial upstream failure
- Cache-key generation
- Mobile rendering
- Product sorting and pagination

Test the page at common widths, including approximately:

- 1440 pixels
- 1024 pixels
- 768 pixels
- 390 pixels

Verify that the implementation does not create duplicate upstream calls during a single render.

DELIVERABLES

Provide:

1. The completed Analytics page
2. The updated existing navigation configuration
3. Reusable dashboard components
4. Server-only PostHog analytics service
5. Server-only Pharmacy Core commerce service
6. Typed data contracts
7. Cache and revalidation implementation
8. Loading, empty, stale, and error states
9. Responsive styling
10. Tests for navigation, calculations, permissions, and data transformations
11. A brief implementation note documenting:
    - The PostHog events and properties used
    - The Pharmacy Core endpoints or services used
    - Product identifier matching
    - Cache durations
    - Previous-period calculation rules
    - Security and permission boundaries

FINAL NON-NEGOTIABLE CHECK

Before finishing, verify all of the following:

- No sidebar was created
- No sidebar from the reference was copied
- The page is named Analytics
- The route is /analytics
- Analytics is directly below Overview in the existing navigation
- Overview and Analytics are top-level links
- Overview and Analytics are not inside the Nevari Pharmacy grouped navigation
- The page uses the existing application layout
- PostHog secrets are not exposed to the browser
- WooCommerce is not called directly by the browser
- Commerce data is accessed through Pharmacy Core
- Upstream requests are aggregated and cached
- The design can support approximately 200 concurrent users
- The page has a plain white background
- There are no gradients
- There are no drop shadows
- The page is responsive on desktop and mobile