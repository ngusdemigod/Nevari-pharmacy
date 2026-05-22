I have a Next.js app and I want a true device specific design architecture.

Do not solve this with normal responsive CSS, @media queries, or scattered conditional rendering inside components.

I want the mobile version and desktop version to have different layouts, different component structures, and possibly different UX flows, while keeping the same public URLs.

Use a clean Next.js App Router architecture where:

1. Mobile and desktop have separate component trees.
2. Shared business logic, API calls, types, constants, hooks, and utilities are extracted into shared folders.
3. The UI layer is separated into:
   - mobile specific components
   - desktop specific components
   - shared reusable components only where appropriate
4. Routing should decide whether the user receives the mobile or desktop experience before the page renders.
5. The public URL should remain the same where possible.
6. Avoid duplicating backend logic or data fetching unnecessarily.
7. The solution must be scalable for a large app with dashboards, tables, forms, modals, product lists, order details, invoices, receipts, and booking flows.
8. Desktop can use wide layouts, tables, sidebars, split panels, and dense dashboard views.
9. Mobile should use bottom navigation, stacked layouts, cards, simplified flows, mobile optimized modals or sheets, and touch friendly spacing.
10. Do not just hide and show the same components with CSS. Build separate experiences.

Recommend and implement the best architecture for this.

Preferred structure should look similar to this:

src/
  app/
    mobile/
      dashboard/
      products/
      orders/
      appointments/
    desktop/
      dashboard/
      products/
      orders/
      appointments/
  features/
    products/
      shared/
      mobile/
      desktop/
    orders/
      shared/
      mobile/
      desktop/
    appointments/
      shared/
      mobile/
      desktop/
  lib/
  hooks/
  types/
  services/

Use Next.js middleware or proxy style request handling to detect the device from the request user agent and rewrite users internally to the correct mobile or desktop route, while preserving the visible public URL.

Also explain:
- how the routing/rewrite works
- how to avoid hydration mismatch
- how to avoid loading both mobile and desktop bundles
- how to share data fetching without duplicating code
- how to handle edge cases like tablets, bots, resizing browser windows, and users requesting desktop site on mobile
- how to keep SEO clean
- how to structure layouts, navigation, modals, and tables separately for mobile and desktop

After explaining the architecture, generate the actual folder structure, sample middleware/proxy code, sample page implementation, shared data service example, and one sample feature implemented in both mobile and desktop versions.