You are optimizing a production-grade Next.js dashboard application that uses WordPress + WooCommerce as backend and a custom plugin called Nevari-pharmacy-core as the backend service layer.

The current issue:
- Dashboard loads slowly
- Navigation feels delayed
- WooCommerce queries overload server
- Dashboard refetches too much data
- Need fresh data on navigation WITHOUT destroying performance

Your task is to fully optimize the architecture for:
- speed
- scalability
- low server load
- instant-feeling navigation
- real-time-ish dashboard updates
- WooCommerce compatibility
- secure authenticated access

IMPORTANT:
Do NOT rewrite the entire application.
Refactor the architecture incrementally and production-safely.

---------------------------------------------------
CORE ARCHITECTURE REQUIREMENTS
---------------------------------------------------

Use Next.js App Router architecture.

The dashboard must use:
- Server Components for layout shells
- Client Components only where interactivity is needed
- Suspense boundaries
- Streaming-friendly rendering
- Route segment layouts

DO NOT fully SSR authenticated dashboard data on every request.

Instead:
- Render a static dashboard shell immediately
- Hydrate live dashboard data separately

---------------------------------------------------
DATA FETCHING STRATEGY
---------------------------------------------------

Replace traditional:
- useEffect fetch patterns

With:
- SWR OR TanStack Query

Requirements:
- stale-while-revalidate
- background refresh
- deduplication
- request caching
- optimistic updates
- instant back-navigation

Dashboard behavior:
1. First visit fetches fresh data
2. Subsequent navigation instantly shows cached data
3. Background silently refreshes data

Implement:
- polling only where necessary
- avoid aggressive refetch intervals

Recommended:
- 30–60 second refresh interval for dashboard widgets
- manual invalidation after mutations

---------------------------------------------------
DASHBOARD API ARCHITECTURE
---------------------------------------------------

DO NOT use raw WooCommerce REST API responses in dashboard UI.

Create optimized lightweight custom REST endpoints inside:
- Nevari-pharmacy-core plugin

Examples:
- /nevari/v1/dashboard/stats
- /nevari/v1/dashboard/orders
- /nevari/v1/dashboard/appointments
- /nevari/v1/dashboard/notifications

Endpoints must:
- return minimal payloads
- avoid full WooCommerce objects
- avoid unnecessary metadata
- be role-filtered
- be permission protected

BAD:
Returning full WooCommerce order objects

GOOD:
Return only dashboard-required fields

Example response:
{
  "total_orders": 12,
  "pending_orders": 2,
  "completed_orders": 10
}

---------------------------------------------------
BACKEND PERFORMANCE OPTIMIZATION
---------------------------------------------------

Inside Nevari-pharmacy-core plugin:

Implement:
- WordPress transients
OR
- Redis object cache support

Cache:
- dashboard stats
- appointment counts
- analytics summaries
- notification counts

Cache duration:
- 30–120 seconds

Prevent repeated expensive WooCommerce queries.

---------------------------------------------------
DATABASE OPTIMIZATION
---------------------------------------------------

Ensure indexed database access.

Add indexes for:
- doctor_id
- customer_id
- order_id
- appointment_date
- appointment_status

Avoid:
- wildcard searches
- unindexed meta queries
- repeated joins on wp_postmeta

Prefer:
- custom optimized appointment tables where necessary

---------------------------------------------------
FRONTEND PERFORMANCE OPTIMIZATION
---------------------------------------------------

Implement:
- route prefetching
- API prefetching
- lazy loading
- dynamic imports

Heavy modules that MUST lazy load:
- analytics charts
- calendars
- reports
- tables
- notification panels

Use:
dynamic(() => import(...))

---------------------------------------------------
HYDRATION & UI PERFORMANCE
---------------------------------------------------

Prevent hydration flicker.

Implement:
- skeleton loaders
- persisted dashboard layout state
- optimistic UI updates
- shared cached stores

Use:
- Zustand OR React Context carefully

Dashboard layout should NEVER fully reset on navigation.

---------------------------------------------------
AUTHENTICATION & SECURITY
---------------------------------------------------

Ensure all endpoints:
- validate WordPress authentication
- validate WooCommerce ownership
- validate role permissions

Roles:
- customer
- doctor
- admin

Never expose:
- raw order data
- protected metadata
- private dashboard statistics publicly

Use:
- nonce validation
- capability checks
- authenticated REST routes

---------------------------------------------------
REALTIME STRATEGY
---------------------------------------------------

Do NOT use aggressive polling.

Use:
- lightweight polling
OR
- websocket only for:
  - live appointment status
  - live notifications

Avoid:
- full dashboard polling

---------------------------------------------------
CACHING STRATEGY
---------------------------------------------------

Implement layered caching:

Frontend:
- SWR/TanStack Query cache

Backend:
- WordPress object cache
- transients
- Redis support

Infrastructure:
- Cloudflare CDN support
- static asset caching

---------------------------------------------------
NEXT.JS STRUCTURE
---------------------------------------------------

Recommended architecture:

app/
  dashboard/
    layout.tsx
    page.tsx
    appointments/
    orders/
    analytics/

Use:
- route groups
- nested layouts
- loading.tsx
- error.tsx

---------------------------------------------------
SERVER LOAD PROTECTION
---------------------------------------------------

Prevent:
- repeated WooCommerce queries
- duplicate requests
- over-fetching
- waterfall API calls

Implement:
- batched requests where appropriate
- parallel fetching
- request deduplication

---------------------------------------------------
GOAL
---------------------------------------------------

Final dashboard should:
- feel instant
- load progressively
- keep data fresh
- reduce backend load dramatically
- scale to many users
- work efficiently with WooCommerce
- maintain secure role-based access

Optimize the existing architecture and generate production-ready implementation improvements, code structure, caching strategy, and API optimization patterns.