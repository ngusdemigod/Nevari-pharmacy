Here is a **precise, developer-ready prompt** to fix the sidebar styling mismatch and align it with the Admin dashboard design system:

---

## **Prompt: Fix Sidebar Design Inconsistency (Pharmacist vs Admin Dashboard)**

The current Pharmacist dashboard sidebar does not visually match the Admin dashboard sidebar. The layout structure is acceptable, but the **design system (icons, typography, spacing, and visual hierarchy)** is inconsistent and must be aligned with the Admin storefront styling.

---

## **Objective**

Refactor the Pharmacist workspace sidebar so it **visually and behaviorally matches the Admin dashboard navigation system**, ensuring a unified design language across both dashboards.

---

## **Key Issues Observed**

* Icons differ in style, weight, and visual consistency compared to Admin sidebar.
* Typography (font size, weight, and color) does not match Admin dashboard standards.
* Active state styling is inconsistent (highlight pill/background differs).
* Spacing between icon and label is uneven.
* Sidebar sections (workspace header, nav groups) lack consistent hierarchy styling.
* Logout button styling is visually disconnected from Admin design language.

---

## **Required Fixes**

### 1. Icon System Consistency

* Replace or standardize all sidebar icons to match Admin dashboard icon set.
* Ensure:

  * Same stroke width / fill style
  * Same size (typically 18–20px or consistent system size)
  * Same vertical alignment with text

---

### 2. Typography Alignment

* Match Admin dashboard typography exactly:

  * Font family must be identical
  * Font size and weight must follow Admin nav rules
  * Ensure consistent letter spacing and capitalization style

---

### 3. Active State Styling

* The active navigation item must match Admin UI exactly:

  * Same background highlight style (pill / full row / accent bar)
  * Same border radius
  * Same color tokens (do not introduce new blues/greys)
  * Same hover and selected states

---

### 4. Layout & Spacing Consistency

* Align spacing between:

  * icon ↔ label
  * nav items vertical spacing
  * section headers and groups
* Ensure spacing matches Admin dashboard scale system (8px / 12px / 16px rhythm)

---

### 5. Sidebar Section Hierarchy

* “Pharmacist Workspace” header styling must match Admin section headers:

  * Same font size
  * Same opacity/weight hierarchy
  * Same uppercase or label casing rules

---

### 6. Logout Button Styling

* Replace current styling with Admin equivalent:

  * Same background treatment
  * Same icon style
  * Same padding and radius system
  * Ensure consistent placement and spacing from nav items

---

### 7. Design System Rule

* Do NOT create new visual styles for the Pharmacist dashboard.
* Everything must be derived from or match the Admin storefront design tokens and components.
* If needed, reuse Admin sidebar components instead of recreating them.

---

## **Expected Result**

After refactor:

* Pharmacist sidebar should be visually indistinguishable from Admin sidebar
* Only difference should be **navigation routes and labels**, not styling
* UI should feel like one unified product system

---

If you want, I can also convert this into a **Tailwind theme token spec or component refactor plan (Sidebar.tsx reusable component architecture)** so you don’t repeat this issue again.



1. Search Bar Fix (All Dashboards)
The search input field is currently too small and visually inconsistent.
Fix by:
Increasing input height and width for better usability
Ensuring consistent padding and font size
Aligning icon and placeholder properly
Ensure there is ONLY ONE outer border for the search component (remove duplicate nested borders/shadows).
The search bar should match the Admin dashboard design exactly.

2. Metrics / Summary Grids (Admin + Pharmacist)
Remove all outer padding containers and outer borders wrapping metric grids.
Only individual metric cards should have:
Their own border
Internal padding
Rounded corners (if applicable)
Do NOT wrap metric sections in additional bordered containers.
Maintain clean grid spacing using layout gap only (not padding wrappers).

3. Table Layout Standardization (Products / Orders / Payments / MTM Pages)
Applies to:
Pharmacist Dashboard
Admin Dashboard (where applicable)

Required Fix:
Remove outer borders and padding around:
Store Payments container
Table wrapper sections
ONLY the table itself should define:
Border
Grid lines
Row separators
Ensure tables are visually self-contained components, not nested inside multiple bordered containers.

4. “Plus” Floating Action Menu (Pharmacist Dashboard)
Restrict dropdown options strictly to:
Products
Orders
Remove:
New Consultation
New Doctor
New Customer
Ensure menu remains clean, minimal, and role-specific.

5. Sidebar + Dashboard Responsiveness (All Dashboards)
Ensure full responsiveness across Admin, Pharmacist dashboards.
Required behavior:
Sidebar becomes a hamburger menu on smaller screens
Content should adapt without breaking layout
Tables must support:
Horizontal scrolling (overflow-x-auto)
No layout shrinking or squashing columns
Ensure dashboards remain usable on tablet and mobile devices

6. Design System Enforcement (Critical)
Ensure single source of truth for borders and spacing:
No duplicate wrappers with borders
No unnecessary padding containers around components
Maintain consistent spacing scale across all dashboards
Avoid conflicting UI layers (nested cards inside cards)
Expected Outcome

After implementation:

Search bar is properly sized and unified
No double borders anywhere in UI
Metrics and tables feel clean and structured
Tables are self-contained with proper scrolling
Role-based dashboards (Admin, Pharmacist, Doctor) share one design system
Mobile responsiveness is fully functional with hamburger navigation