You are a senior full-stack engineer. I am building a custom Next.js dashboard connected to a WordPress + WooCommerce site.

IMPORTANT NAMING RULE:

The brand name is “Nevari”, not “Nevaria”.
Use “Nevari” everywhere:

Nevari Access
Nevari Access Pro
Nevari Pharmacy Core
Nevari Payments
Nevari Subscriptions

Never use “Nevaria”.

PROJECT CONTEXT:

I have a WordPress plugin named “Nevari Pharmacy Core”.
This plugin exposes custom REST API endpoints used by a custom Next.js dashboard.
I want this plugin to become the source of truth for:

User subscriptions
Paystack payments
Paystack subscription billing
WooCommerce checkout gateway
Dashboard feature entitlements
Consultation booking payments
Profile subscription management
TECH STACK:
WordPress plugin: PHP
WooCommerce
Next.js App Router
TypeScript
Tailwind CSS
Paystack InlineJS payment modal on the frontend
Paystack Secret Key only on the WordPress plugin/server side
Paystack Public Key only on the Next.js frontend
GOAL:

Implement Nevari Access Pro subscriptions.

Users can subscribe monthly for NGN10.00/month.
If a user does not have an active subscription, protected dashboard pages should show a premium paywall screen.

Paywall visual design:

White background
Deep navy text and button
Gold “Pro” badge
Large gold wax-seal style illustration placeholder
iPhone/mobile-first layout
Top-left hamburger menu
Heading: “Access more on Nevari Access Pro”
Subtitle: “Upgrade to Nevari Access Pro to enjoy smarter schedules and smarter schedules”
Benefits:
Medical Therapy Management
Description: “Get professional medication reviews and guidance to help you understand your prescriptions, manage side effects, and stay on track with your treatment plan.”
CTA button: “Subscribe for NGN10.00/month”

After successful payment/subscription activation, show success screen:

Heading: “Congratulations, you’re now on Nevari Access Pro”
Large gold wax-seal check illustration placeholder
Message near bottom: “You can now enjoy all our services on Nevari Access”
Button: “Continue”
REQUIRED NEXT.JS FEATURES:
Add subscription state fetching.
Add a reusable protected-page wrapper.
Protected pages should render a paywall if the user is not subscribed.
Paywall CTA should open the Paystack payment modal.
The Paystack modal should be opened using Paystack InlineJS.
The frontend must never expose Paystack secret key.
The frontend should request a Paystack transaction/subscription initialization from Nevari Pharmacy Core.
After Paystack success callback, call the Nevari Pharmacy Core verify endpoint.
Only after backend verification should the UI show the success screen.
Store subscription state in React Query or SWR if the project already uses one. Otherwise use a small custom hook.
Add subscription management section to the profile page.
REQUIRED PROFILE PAGE FEATURE:

Add a “Manage Subscription” section on the profile page.

The section should show:

Current plan: Free or Nevari Access Pro
Subscription status: active, trialing, past_due, expired, cancelled, none
Renewal date if active
Amount: NGN10.00/month
Paystack subscription code if available, masked or hidden from regular UI
Buttons:
“Upgrade to Pro” if user has no active subscription
“Renew Subscription” if expired or past_due
“Cancel Subscription” if active
“Manage Billing” if supported
Show a warning banner if the subscription is past_due:
“Your Nevari Access Pro subscription payment failed. Please renew to keep access to premium features.”
Show an expired banner if expired:
“Your subscription has expired. Premium features are currently locked.”
PROTECTED DASHBOARD FEATURE RULES:

The only restricted premium page is Medical Therapy Management.

All other dashboard pages remain accessible to free users.

Protect only:

Medical Therapy Management page

Do not place subscription gates, paywalls, or entitlement checks on:

Consultation booking pages
Prescription refill pages
Delivery pages
Priority booking pages
Any other dashboard page unless explicitly specified in the future

The paywall should only appear when a user attempts to access the Medical Therapy Management page.

Entitlement required:

therapy_management

SubscriptionGate and ProtectedFeature should only be applied to the Medical Therapy Management route and its related API actions.

Premium features should include:

therapy_management

therapy_management is currently the only entitlement that requires an active Nevari Access Pro subscription. All other features remain available to free users.

NEXT.JS FILES TO CREATE OR UPDATE:
lib/nevari-api.ts — API client for Nevari Pharmacy Core.
lib/paystack.ts — Paystack InlineJS loader/helper.
hooks/use-subscription.ts — Fetch current subscription and entitlements.
components/subscription/Paywall.tsx — Paywall screen matching design.
components/subscription/SubscriptionSuccess.tsx — Success screen.
components/subscription/ProtectedFeature.tsx — Component to wrap premium features.
components/subscription/SubscriptionGate.tsx — Wrapper for protected pages.
components/profile/ManageSubscription.tsx — Profile page card for subscription management.
app/dashboard/profile/page.tsx — Add ManageSubscription section.
Protect only the Medical Therapy Management page with SubscriptionGate or ProtectedFeature.
PAYSTACK PAYMENT FLOW:
User clicks “Subscribe for NGN10.00/month”.
Call WordPress endpoint: POST /wp-json/nevari/v1/subscriptions/initialize
Backend creates/gets Paystack plan for NGN10.00 monthly.
Backend initializes Paystack transaction/subscription and returns access_code, reference, amount, currency, plan_code.
Frontend opens Paystack modal using InlineJS.
On Paystack success, frontend calls POST /wp-json/nevari/v1/subscriptions/verify with { reference }.
Backend verifies transaction, amount, currency, and user ownership.
Backend stores subscription as active.
Frontend shows SubscriptionSuccess screen.
Refresh subscription state.
WORDPRESS PLUGIN REQUIREMENTS:
Update the Nevari Pharmacy Core plugin.
Create or update PHP classes for Paystack service, subscriptions service, entitlements, REST controllers, and WooCommerce gateway.
Add custom tables for subscriptions, payments, and plans.
Implement REST endpoints under nevari/v1.
Ensure proper entitlement logic for therapy_management.
SECURITY REQUIREMENTS:
Sanitize inputs and escape outputs.
Use nonces or JWT/session auth depending on existing dashboard auth.
REST endpoints must have permission_callback.
Paystack secret key must never be sent to Next.js.
Verify webhooks using x-paystack-signature HMAC SHA512.
Verify payment amount, currency, status, and reference ownership before granting subscription.
Idempotent webhook handling to avoid duplicate subscriptions/payments.
PAYWALL UX DETAILS:
Mobile-first, white background, deep navy text (#06265f), gold “Pro” badge (#d9a72f).
Hamburger menu top-left, heading centered.
Large gold seal placeholder.
Bottom sticky CTA button: “Subscribe for NGN10.00/month”
SUCCESS SCREEN UX:
White background, centered heading, gold Pro badge, large gold seal/check.
Bottom CTA button: “Continue”
Continue should refresh subscription state and navigate back to the original protected page or dashboard home.
MANAGE SUBSCRIPTION UX:
Profile page card titled “Manage Subscription”.
Show current plan and status with colored badges.
Show renewal date, amount.
Upgrade/Renew opens Paystack subscription modal.
Cancel asks for confirmation.
ENVIRONMENT VARIABLES:

Next.js:

NEXT_PUBLIC_WP_API_URL
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY

WordPress options/admin settings:

nevari_paystack_public_key
nevari_paystack_secret_key
nevari_paystack_environment
nevari_force_wc_gateway_only
ACCEPTANCE CRITERIA:
Correct use of “Nevari” everywhere.
No occurrence of “Nevaria”.
Only the Medical Therapy Management page shows the paywall to unsubscribed users.
Subscribed users can access the restricted page.
Paywall CTA opens Paystack modal.
Successful Paystack payment verified by WordPress backend.
Subscription stored locally.
Entitlements update after payment.
Profile page shows Manage Subscription section.
WooCommerce checkout uses Nevari Payments gateway if enabled.
Webhooks are signature-verified.
Payment verification checks amount, currency, status, and reference ownership.
No Paystack secret key exposed in frontend code.
Code is production-ready, typed where applicable, and follows project conventions.
IMPLEMENTATION ORDER:
Search repo and understand Next.js dashboard auth/API patterns.
Search plugin and understand current REST endpoint structure.
Add database migrations/activation updates.
Add Paystack service.
Add subscription and entitlement services.
Add REST endpoints.
Add WooCommerce gateway.
Add webhook handler.
Add Next.js API client methods.
Add Paystack frontend helper.
Add Paywall and Success components.
Add SubscriptionGate and ProtectedFeature only to Medical Therapy Management page.
Add ManageSubscription to profile page.
Test end-to-end with Paystack test keys.
Run lint/typecheck/build.
Fix all errors.
Provide summary of changed files and Paystack key configuration.