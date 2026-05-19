Act as a senior Next.js + SWR engineer.

I have a dashboard with multiple popups:
1. Order creation (depends on Products and Customers endpoints)
2. Product creation (depends on Categories, Tags, Brands endpoints)
3. Doctor creation (depends on Categories, Pricing tiers endpoints)
4. Consultation creation (depends on Patients, Doctors, Booking availability endpoints)

Requirements:

1. Lazy-load all dependent lists only when the popup is opened.
2. Use SWR null keys for inactive popups.
3. Centralize commonly shared lists in SWR to avoid duplicate fetches.
4. Mutate cache after create/update/delete operations with optimistic UI and rollback.
5. Use dynamic imports for heavy popup components.
6. Use fallbackData or placeholders to avoid empty lists during fetch.
7. Handle pagination and filters correctly for large lists.
8. Output sample code for each popup showing SWR usage, mutate calls, loading, and error states.
9. Solution must be production-ready for a Next.js + SWR WooCommerce dashboard with multiple dependent popups.