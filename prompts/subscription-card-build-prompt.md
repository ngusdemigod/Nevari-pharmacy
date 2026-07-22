# Build Prompt — Subscription Card System (Next.js)

Paste this whole document to your coding agent (Claude Code, Cursor, etc.) as the spec. It is self-contained: design tokens, component architecture, data contracts, business logic, and the responsive user flow are all defined below. Follow it exactly — do not invent new colors, spacing, or class names outside what's specified.

---

## 0. Context

- **Frontend**: Next.js (App Router) dashboard for a pharmacy/WooCommerce product.
- **Middleware**: a WordPress core plugin exposes custom authenticated REST endpoints (`/wp-json/dashboard/v1/...`). It is the only thing that talks to the WordPress database and to Paystack. **Next.js never calls Paystack directly.**
- **Billing**: Paystack owns subscription state, plan changes, payment methods, and invoicing. The WP plugin proxies/normalizes Paystack data for the dashboard.
- **Design system**: an existing flat, no-gradient, no-glow design system (navy/amber, pill radii, Product Sans with Inter fallback). Tokens are given verbatim in §1 — reuse them, don't restate them.

Goal: implement a `SubscriptionCard` feature that is **pixel-perfect** against the tokens below, has correct plan-tier/business logic, and has a distinct mobile vs. desktop presentation with zero layout overflow at any width from 320px up.

---

## 1. Design Tokens (source of truth — do not modify)

Create `src/styles/tokens.css` and import it once in the root layout:

```css
:root{
  /* Brand */
  --navy-900:#0A2450;
  --navy-800:#0F2A5C;
  --navy-700:#1B3A6B;

  /* Neutrals */
  --ink:#374151;
  --muted:#6B7280;
  --faint:#9CA3AF;
  --line:#E6E8EE;
  --line-soft:#EEF0F4;

  /* Surfaces */
  --white:#FFFFFF;
  --surface:#F4F5F7;
  --surface-2:#FAFBFC;

  /* Functional accents */
  --amber:#F5A623;
  --amber-soft:#FEF3E0;
  --danger:#D14343;
  --danger-soft:#FBE4E4;
  --success:#2E9E6B;
  --success-soft:#E4F3EC;
  --info:#3B6FD4;
  --info-soft:#E7EEFB;

  /* Radius */
  --r-pill:999px;
  --r-card:16px;
  --r-md:12px;
  --r-sm:8px;

  /* Elevation — neutral, never colored/glowing */
  --shadow-sm:0 1px 2px rgba(16,42,92,.04);
  --shadow-md:0 6px 20px rgba(16,42,92,.06);

  /* Type */
  --font:'Product Sans','Google Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
```

Load Inter (the open fallback) via `next/font/google` in the root layout, and reference it through the same `--font` variable — do not hardcode a second font stack anywhere else.

**Hard rule carried over from the design system: no gradient backgrounds, no glow/colored box-shadows, anywhere in this feature.** Shadows are always neutral navy at low opacity (`--shadow-sm` / `--shadow-md`), used for elevation only, never for a "glow" effect.

---

## 2. Assets — the Pro badge

The attached Pro badge (amber sticker, italic "Pro", slight tilt, soft drop shadow) is a **decorative raster image, not a CSS-drawn badge** — replace the earlier CSS `.pro-badge` sticker with this actual asset wherever a paid/Pro plan indicator is shown.

**Requirement: it must render immediately, with no visible pop-in or layout shift.** For an asset this small (40×24px, ~1.8KB), the correct approach is to **inline it as a base64 data URI shipped inside the component's JS bundle** — this guarantees zero additional network round-trip, so it paints in the same frame as the rest of the card. Do not lazy-load it, do not fetch it from `/public` over the network for this use case, and do not use `next/image` here (its optimizer adds a request-time step you don't want for a badge that must appear instantly).

Create `src/components/subscription/ProBadge.tsx`:

```tsx
// Base64-inlined so the badge paints in the same frame as the card —
// no network request, no layout shift, no flash of missing image.
const PRO_BADGE_SRC =
  "data:image/png;base64,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";

interface ProBadgeProps {
  className?: string;
  size?: number; // renders at native 40x24 ratio, scaled by width
}

export function ProBadge({ className, size = 40 }: ProBadgeProps) {
  const height = Math.round((size * 24) / 40);
  return (
    <img
      src={PRO_BADGE_SRC}
      width={size}
      height={height}
      alt="Pro plan"
      draggable={false}
      className={className}
      style={{ display: "block" }}
    />
  );
}
```

Also drop the original file into `public/badges/pro-badge.png` (included alongside this prompt) purely as a source-of-truth backup / for design handoff — the component itself must use the inlined constant above, not a fetch from `/public`.

Use `<ProBadge size={40} />` wherever the amber sticker previously appeared (next to the plan value on the full card, and in place of the `Pro` text badge anywhere else in the dashboard). It replaces the CSS `.pro-badge` class entirely — remove that class if migrating from the earlier prototype.

---

## 3. Component & file architecture

```
src/
  components/
    subscription/
      ProBadge.tsx
      SubscriptionCardFull.tsx        # full layout (desktop + mobile sheet content)
      SubscriptionCardCompact.tsx     # mobile teaser row
      SubscriptionCardResponsive.tsx  # picks compact vs full by breakpoint, owns the sheet
      SubscriptionSheet.tsx           # bottom-sheet wrapper (mobile only)
      subscription-card.module.css    # 1:1 port of tokens in §4
      cta-logic.ts                    # pure functions, §6
      payment-method.ts               # Paystack channel → label mapping, §7
      types.ts
  hooks/
    useSubscription.ts                # data fetching (SWR/React Query)
  lib/
    api/
      subscription.ts                 # typed client for the Next.js API route (not WP directly)
  app/
    api/
      subscription/
        route.ts                      # GET  → proxies WP plugin, adds auth, strips secrets
        pause/route.ts                # POST → proxy to WP "pause" endpoint
        cancel/route.ts               # POST → proxy to WP "cancel" endpoint
    (dashboard)/
      subscription/
        page.tsx                      # desktop: renders SubscriptionCardFull directly
        upgrade/
          page.tsx                    # ALREADY BUILT — do not recreate, only link to it
```

**Why a Next.js API route sits between the client and the WP plugin:** the browser must never hold the WP plugin's shared secret or call Paystack-adjacent endpoints directly. The `app/api/subscription/*` routes are a thin BFF (backend-for-frontend): they attach the server-side auth header/secret, call the WP REST endpoint, and return a minimal, already-sanitized JSON shape to the client. This also gives you one place to enforce that raw card numbers/PANs from Paystack never leave the server (see §7).

---

## 4. Types & data contract

```ts
// src/components/subscription/types.ts

export type PlanTier = "free" | "starter" | "pro" | "enterprise"; // adjust to real plan slugs

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"     // Paystack charge failed
  | "paused"
  | "cancelled";

export interface Plan {
  id: string;
  tier: PlanTier;
  name: string;          // e.g. "Pharmacy Pro"
  price: number;         // minor-unit-free, e.g. 15000 for NGN 15,000
  currency: string;      // "NGN"
  rank: number;          // ordering for "is this the highest plan" checks
}

export interface PaymentMethodSummary {
  // NEVER the PAN. Derived server-side from Paystack's authorization object.
  channel: "card" | "bank" | "bank_transfer" | "ussd" | "qr" | "mobile_money";
  cardType?: string;      // e.g. "visa" — brand only, no digits, used for an icon
  bank?: string;          // e.g. "GTBank" — present for bank/ussd channels
}

export interface Subscription {
  status: SubscriptionStatus;
  plan: Plan;
  allPlans: Plan[];       // full plan catalogue, so the client can derive "is highest"
  startDate: string;      // ISO
  renewsOn: string | null; // null if cancelled/paused
  paymentMethod: PaymentMethodSummary | null;
  usage?: {
    label: string;        // e.g. "Nurse Visits"
    used: number;
    total: number;
  };
}
```

The WP plugin's `/wp-json/dashboard/v1/subscription` endpoint should return exactly this shape (mapped from its internal Paystack + WooCommerce data) so the Next.js API route can pass it through with minimal transformation.

---

## 5. Data fetching

```ts
// src/hooks/useSubscription.ts
import useSWR from "swr";
import type { Subscription } from "@/components/subscription/types";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error("Failed to load subscription");
  return r.json();
});

export function useSubscription() {
  const { data, error, isLoading, mutate } = useSWR<Subscription>(
    "/api/subscription",
    fetcher,
    { revalidateOnFocus: false }
  );
  return { subscription: data, error, isLoading, mutate };
}
```

Use SWR (or React Query if that's already the project's standard — match whatever's already installed, don't introduce a second data-fetching library). `mutate()` is called after pause/cancel actions for optimistic-then-confirmed UI.

Render states to handle explicitly:
- **Loading** — a skeleton matching the card's exact box model (same padding/height as `.sub-card`) so there's no layout shift when data arrives.
- **Error** — inline message inside the card shell, with a retry button (`btn-secondary btn-sm`).
- **Loaded** — the real card.

---

## 6. Business logic — CTA & footer decision table

The **top-right CTA** on the full card and the **footer action** are computed independently, in priority order. Implement as pure, unit-testable functions:

```ts
// src/components/subscription/cta-logic.ts
import type { Subscription } from "./types";

export type PrimaryCta =
  | { type: "update_payment"; label: "Update Card" }
  | { type: "upgrade_to_pro"; label: "Upgrade to Pro" }
  | { type: "upgrade_plan"; label: "Upgrade Plan" }
  | { type: "pause"; label: "Pause Subscription" };

export function getPrimaryCta(sub: Subscription): PrimaryCta {
  // 1. A failed charge always takes priority over any plan-tier logic.
  if (sub.status === "past_due") {
    return { type: "update_payment", label: "Update Card" };
  }

  const isFreePlan = sub.plan.tier === "free";
  if (isFreePlan) {
    return { type: "upgrade_to_pro", label: "Upgrade to Pro" };
  }

  const isHighestOrOnlyPlan =
    sub.allPlans.length <= 1 ||
    sub.plan.rank === Math.max(...sub.allPlans.map((p) => p.rank));

  if (isHighestOrOnlyPlan) {
    return { type: "pause", label: "Pause Subscription" };
  }

  return { type: "upgrade_plan", label: "Upgrade Plan" };
}

// Footer: only ever "Cancel Subscription", and only when there's something
// to cancel. It is independent of the primary CTA above.
export function showCancelFooter(sub: Subscription): boolean {
  return sub.plan.tier !== "free" && sub.status !== "cancelled";
}
```

Action handlers per CTA type:

| CTA type | Behavior |
|---|---|
| `update_payment` | Navigate to (or open) the existing "update payment method" flow — do **not** build a new one here if it exists; link to it. |
| `upgrade_to_pro` / `upgrade_plan` | `router.push('/dashboard/subscription/upgrade')` — **this screen is already built.** Do not create a new upgrade UI; this button is pure navigation. |
| `pause` | Open a confirm dialog ("Pause your subscription? You'll keep access until \{renewsOn\}.") → on confirm, `POST /api/subscription/pause` → `mutate()` to refresh. |
| Footer `cancel` | Open a confirm dialog with clear consequence copy → on confirm, `POST /api/subscription/cancel` → `mutate()`. |

Both mutating actions (`pause`, `cancel`) go through the Next.js API routes in §3, which forward to the WP plugin, which is the only thing authorized to call Paystack.

---

## 7. Payment method — never show the card number

The full card's meta row shows a **Payment Method** value. This must come from Paystack's `authorization.channel` (and `bank`/`card_type` where relevant), proxied through the WP plugin — **never** a card number, not even masked digits beyond what Paystack itself already redacts.

```ts
// src/components/subscription/payment-method.ts
import type { PaymentMethodSummary } from "./types";

export function formatPaymentMethod(pm: PaymentMethodSummary | null): string {
  if (!pm) return "—";
  switch (pm.channel) {
    case "card":
      return pm.cardType ? `${capitalize(pm.cardType)} Card` : "Debit Card";
    case "bank_transfer":
      return "Bank Transfer";
    case "bank":
      return pm.bank ? `Bank · ${pm.bank}` : "Bank";
    case "ussd":
      return "USSD";
    case "qr":
      return "QR Payment";
    case "mobile_money":
      return "Mobile Money";
    default:
      return "—";
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

On the server side (the WP plugin, or the Next.js API route as a defense-in-depth second check), strip any field resembling `last4`, `bin`, or full PAN from the payload before it ever reaches the client bundle — the client-side type `PaymentMethodSummary` intentionally has no field capable of holding it.

---

## 8. Responsive user flow (the part that must be exact)

**Breakpoint:** `768px`. Below it → mobile behavior. At or above → desktop behavior. Define once:

```ts
// tailwind.config or a shared constant — pick one, don't duplicate the number
export const MOBILE_BREAKPOINT = 768;
```

### Desktop (≥768px)
Render `SubscriptionCardFull` directly, inline on the page. No sheet, no compact variant, ever.

### Mobile (<768px)
Render `SubscriptionCardCompact` inline on the page. Tapping **its** CTA button (whatever it's labeled — "Manage" or "Upgrade") does **not** perform the underlying business action directly. It opens a bottom sheet containing `SubscriptionCardFull`. The real actions (Upgrade Plan / Pause / Cancel / Update Card) live inside that sheet and behave exactly as defined in §6 — including the Upgrade action navigating away, which should close the sheet first (or let the route transition handle it naturally).

```tsx
// src/components/subscription/SubscriptionCardResponsive.tsx
"use client";
import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery"; // implement with matchMedia
import { SubscriptionCardFull } from "./SubscriptionCardFull";
import { SubscriptionCardCompact } from "./SubscriptionCardCompact";
import { SubscriptionSheet } from "./SubscriptionSheet";
import { useSubscription } from "@/hooks/useSubscription";

export function SubscriptionCardResponsive() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { subscription, isLoading } = useSubscription();

  if (isLoading || !subscription) return <SubscriptionCardSkeleton />;

  if (isDesktop) {
    return <SubscriptionCardFull subscription={subscription} />;
  }

  return (
    <>
      <SubscriptionCardCompact
        subscription={subscription}
        onManage={() => setSheetOpen(true)}
      />
      <SubscriptionSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <SubscriptionCardFull subscription={subscription} inSheet />
      </SubscriptionSheet>
    </>
  );
}
```

**Sheet implementation:** use [`vaul`](https://vaul.emilkowal.ski/) (a Radix-based drawer library built for exactly this — mobile bottom sheets with drag-to-dismiss) rather than hand-rolling a modal. It handles focus trapping, `aria-modal`, swipe-to-close, and safe-area insets correctly out of the box. If `vaul` isn't already a dependency, add it; don't reinvent gesture handling.

Sheet requirements:
- `aria-modal="true"`, labelled by the card's own "Current subscription" text.
- Closes on `Escape` and on backdrop tap.
- Respects `prefers-reduced-motion` — no slide animation, instant show/hide, if set.
- Content padding accounts for `env(safe-area-inset-bottom)` on iOS so the footer CTA row isn't obscured by the home indicator.

### Mobile payment-method rule (explicit requirement)
Whether shown via the sheet or (hypothetically) any other mobile surface, the payment method value must always be the **channel label from §7**, never a card number — this is a global rule, not sheet-specific, but call it out because it's easy to accidentally wire up a "last 4 digits" field from a Paystack webhook payload if one exists upstream. It must not reach this component.

---

## 9. Exact styling (port these 1:1 — this is the pixel-perfect part)

`src/components/subscription/subscription-card.module.css` — this is a direct port of the shipped design system's subscription card CSS. Do not alter spacing, radii, font sizes, or colors; only convert selectors to CSS Modules class names.

```css
.card {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: 24px 26px 0;
  max-width: 460px;
  width: 100%;
  box-sizing: border-box;
}
.cardFull { max-width: none; }

.top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 22px;
  flex-wrap: wrap;
  min-width: 0; /* prevents flex-item overflow */
}
.label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
}
.valueRow {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.value {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--navy-800);
}
.value .cur {
  font-size: 16px;
  font-weight: 600;
  color: var(--muted);
  margin-right: 3px;
}
.sub {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
  word-break: break-word;
}
.cta { flex: none; }
.cta :global(.btn) { box-shadow: none; }

.divider {
  border-top: 1px solid var(--line-soft);
  margin: 0 -26px;
}
.meta {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  padding: 18px 0 22px;
}
.metaItem { flex: 1; min-width: 120px; }
.metaLabel {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
  margin-bottom: 6px;
}
.metaValue {
  font-size: 14px;
  font-weight: 600;
  color: var(--navy-800);
  overflow-wrap: anywhere; /* long bank names never clip/overflow */
}
.foot {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0 -26px;
  padding: 16px 26px;
  border-top: 1px solid var(--line-soft);
  background: var(--surface-2);
  border-radius: 0 0 var(--r-card) var(--r-card);
}
.foot :global(.btn) { box-shadow: none; flex: 1; }

.statusInline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--success);
}
.statusInline::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.statusTrial { color: #B9770E; }
.statusPastDue { color: var(--danger); }

/* Compact variant */
.compact {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: 20px 22px;
  width: 100%;
  box-sizing: border-box;
}
.planChip {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  flex: none;
  background: var(--navy-900);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
}
.planChipOutline {
  background: var(--white);
  color: var(--navy-800);
  border: 1.5px dashed var(--faint);
}
.compactInfo { flex: 1; min-width: 0; } /* min-width:0 is required or text can overflow the flex row */
.compactName {
  font-weight: 600;
  color: var(--navy-800);
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.compactMeta {
  font-size: 13px;
  color: var(--muted);
  margin-top: 2px;
  overflow-wrap: anywhere;
}
.compactCta { flex: none; display: flex; gap: 8px; }

/* Mobile: full card inside the sheet, and the compact row itself */
@media (max-width: 480px) {
  .card { max-width: none; padding: 22px 20px 0; }
  .divider, .foot { margin-left: -20px; margin-right: -20px; }
  .foot { padding-left: 20px; padding-right: 20px; }
  .top { flex-direction: column; align-items: stretch; }
  .cta :global(.btn) { width: 100%; justify-content: center; }
  .value { font-size: 28px; }
  .meta { gap: 18px 24px; }
  .compact { flex-direction: column; align-items: stretch; text-align: center; }
  .compactCta { justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

**Overflow-safety checklist baked into the CSS above — verify all of these hold at 320px width:**
- Every flex container that can hold long dynamic text (`compactInfo`, `top`, `valueRow`) has `min-width: 0` so children can shrink instead of pushing the row wider than its parent.
- `overflow-wrap: anywhere` on `metaValue` and `compactMeta` — bank names, long plan names, and currency strings wrap instead of clipping or forcing horizontal scroll.
- `box-sizing: border-box` on both card variants so `padding` is included in `max-width`/`width: 100%`, never added on top of it.
- The negative-margin divider/footer trick (`margin: 0 -26px`) is re-declared at the 480px breakpoint with the smaller `-20px` to match the reduced card padding — if you change one, you must change the other, or the divider will be inset incorrectly.

---

## 10. Accessibility

- All interactive elements are real `<button>` elements (never `<div onClick>`).
- Visible focus ring on every button and the sheet's close affordance — reuse the existing global `:focus-visible` outline, don't remove it with `outline: none`.
- The sheet traps focus while open and returns focus to the compact card's trigger button on close.
- Status dots (`.statusInline`) convey state through both color and text label ("Active", "Payment failed") — never color alone.
- `ProBadge`'s `alt="Pro plan"` is meaningful, not decorative — it's the only visual indicator of plan tier in some layouts.

---

## 11. Definition of done

- [ ] Desktop (≥768px): full card renders inline, no compact variant ever appears.
- [ ] Mobile (<768px): compact row renders; tapping its CTA opens the bottom sheet with the full card inside.
- [ ] Free plan: primary CTA is "Upgrade to Pro"; no footer/cancel row.
- [ ] Paid, not-highest plan: primary CTA "Upgrade Plan" → navigates to `/dashboard/subscription/upgrade`; footer shows "Cancel Subscription".
- [ ] Paid, highest/only plan: primary CTA is "Pause Subscription" instead of "Upgrade Plan"; footer still shows "Cancel Subscription".
- [ ] `past_due` status: primary CTA is "Update Card" regardless of plan tier.
- [ ] Payment method always renders a channel label (Debit Card / Bank Transfer / USSD / …), never a card number or last-4 digits, on both mobile and desktop.
- [ ] Pro badge renders instantly (inlined base64), with zero layout shift, wherever a Pro-tier indicator is needed.
- [ ] No horizontal scroll or clipped text at 320px, 375px, 414px, and 768px widths.
- [ ] All colors/spacing/radii match §1 and §9 exactly — no gradients, no colored/glow shadows anywhere.
- [ ] Pause and Cancel actions go through confirm dialogs, hit the Next.js API routes (never Paystack or the WP plugin directly from the client), and call `mutate()` on success.
