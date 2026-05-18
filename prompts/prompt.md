YOU ARE BUILDING A PRODUCTION-GRADE HEALTHCARE APPOINTMENT PLATFORM

System Overview:
You are building a custom Next.js dashboard that extends a WordPress backend using a custom plugin called "Nevari Pharmacy Core".

The system includes:
- Doctor directory system
- Appointment booking system
- Secure payment system (Paystack + Stripe ONLY)
- Patient reviews system
- Doctor dashboard
- Admin storefront dashboard

WordPress + Nevari Pharmacy Core is the backend of truth.
Next.js is ONLY a frontend client.

====================================================
CORE ARCHITECTURE RULES
====================================================

The "Nevari Pharmacy Core" plugin is the CENTRAL backend service layer.

All business logic MUST live inside this plugin.

The plugin must handle:
- appointments
- doctors
- pricing
- payments
- reviews
- notifications
- scheduling
- analytics
- authentication enforcement
- webhook processing

Next.js must NOT:
- access WordPress database directly
- calculate pricing
- verify payments
- manage booking state
- trust frontend slot availability
- expose secrets or keys

====================================================
MODULE ARCHITECTURE (WORDPRESS PLUGIN)
====================================================

nevari-pharmacy-core/
│
├── modules/
│   ├── appointments/
│   ├── payments/
│   ├── reviews/
│   ├── doctors/
│   ├── directory/
│   ├── availability/
│   ├── pricing/
│   ├── notifications/
│   ├── calendar/
│   ├── auth/
│   ├── analytics/
│   └── admin/
│
├── api/
│   ├── appointments.php
│   ├── doctors.php
│   ├── reviews.php
│   ├── payments.php
│   ├── directory.php
│   └── auth.php
│
├── services/
│   ├── booking-service.php
│   ├── payment-service.php
│   ├── stripe-service.php
│   ├── paystack-service.php
│   ├── webhook-router.php
│   ├── pricing-service.php
│   ├── doctor-service.php
│   ├── email-service.php
│   └── slot-lock-service.php
│
├── integrations/
│   ├── stripe/
│   ├── paystack/
│   ├── wordpress/
│   └── action-scheduler/
│
├── security/
│   ├── validation.php
│   ├── permissions.php
│   ├── rate-limit.php
│   └── nonce.php
│
└── nevari-pharmacy-core.php

====================================================
PAYMENT SYSTEM (NO WOOCOMMERCE)
====================================================

DO NOT use WooCommerce checkout or WooCommerce payment gateways.

Use ONLY:
- Stripe (Payment Intents)
- Paystack (Transactions API)

====================================================
CRITICAL WEBHOOK ARCHITECTURE
====================================================

Paystack supports ONLY ONE webhook endpoint.

Therefore implement a SINGLE unified webhook router:

/wp-json/nevari/v1/payments/webhook

This endpoint MUST:
- verify Paystack signature
- verify Stripe webhook signature
- prevent replay attacks
- enforce idempotency keys
- log all events
- securely route events internally

ROUTING LOGIC:

IF metadata.source == "nevari":
    route to appointment payment handler

IF metadata.source == "stripe":
    route to stripe handler

IF metadata.source == "paystack":
    route to paystack handler

IF metadata.source == "legacy":
    ignore or log only

NO SECONDARY WEBHOOKS ARE ALLOWED.

====================================================
PAYMENT STATES
====================================================

- pending
- initialized
- processing
- paid
- failed
- cancelled
- expired
- refunded
- partially_refunded

All state transitions must be server-side only.

====================================================
BOOKING SYSTEM
====================================================

Appointment Flow:

1. User selects doctor
2. User selects available slot
3. Backend verifies availability
4. Backend locks slot (temporary lock)
5. Appointment reservation created
6. Payment session initialized
7. User pays via Stripe/Paystack
8. Webhook verifies payment
9. Appointment confirmed
10. Emails + calendar invite generated

Booking States:
- pending
- reserved
- awaiting_payment
- confirmed
- completed
- cancelled
- expired
- no_show

RULES:
- no double booking
- no frontend trust
- slot locking is mandatory
- expired locks auto-release

====================================================
SLOT LOCKING SYSTEM
====================================================

Implement secure slot locking:

- store lock with expiration timestamp
- prevent concurrent reservations
- auto-expire unpaid locks
- use database or Redis locking

====================================================
DOCTOR DIRECTORY SYSTEM
====================================================

Build full doctor directory system.

Doctor profile includes:
- name
- image
- specialties
- qualifications
- experience
- languages
- biography
- availability schedule
- rating summary
- reviews count
- verified badge
- consultation types
- status (active/inactive/suspended)

Features:
- search doctors
- filter by specialty
- filter by availability
- filter by rating
- featured doctors
- recommended doctors
- SEO-friendly doctor profiles
- doctor slugs

Doctor states:
- active
- inactive
- suspended
- pending_verification

====================================================
DOCTOR PRICING SYSTEM (ADMIN CONTROLLED ONLY)
====================================================

Doctors MUST NOT set their own prices.

Pricing is controlled ONLY by Nevari Admin.

MODEL:

1. Doctor Levels:
- Level 1, Level 2, Level 3...
- Each level has fixed per-minute rate

2. Consultation rules:
- Minimum duration: 10 minutes
- Maximum duration: 60 minutes
- Duration increments enforced server-side

3. Pricing formula:
   total_price = consultation_minutes × level_rate_per_minute

4. Optional admin overrides:
- fixed doctor fee override
- specialty pricing
- promotional pricing

ALL pricing calculations are server-side ONLY.

====================================================
PATIENT REVIEWS SYSTEM
====================================================

Rules:
- only users with completed appointments can review
- one review per appointment
- reviews linked to appointment + doctor + user + payment record

Features:
- star ratings
- review text
- moderation system
- reporting system
- rating aggregation
- verified badges

Prevent:
- fake reviews
- duplicates
- spam
- bot submissions

====================================================
EMAIL SYSTEM
====================================================

Email types:
- appointment created (unpaid)
- payment success receipt
- doctor notification
- admin notification
- reminder emails (15 minutes before appointment)

Must include:
- async queue system
- retry logic
- email logs
- Action Scheduler jobs

NO email should block request lifecycle.

====================================================
CALENDAR SYSTEM
====================================================

Generate:
- .ICS files
- Google Calendar links
- Apple Calendar links
- Outlook support

Add "Add to Calendar" button on confirmation page.

====================================================
DOCTOR DASHBOARD (NEVARI-DOCTOR)
====================================================

Doctors can:
- view appointments
- manage availability
- view patients (restricted)
- view reviews
- view earnings summary (read-only)
- update profile (non-financial fields)

Doctors CANNOT:
- set pricing
- modify payments
- change appointment state
- access admin controls

====================================================
ADMIN DASHBOARD (NEVARI ADMIN)
====================================================

Admin can:
- manage doctors
- assign doctor levels
- set pricing rules
- manage appointments
- handle refunds
- configure payment keys
- manage webhook routing
- moderate reviews
- feature doctors
- analytics dashboard

====================================================
SECURITY REQUIREMENTS
====================================================

AUTH:
- JWT/session auth
- WordPress nonces
- capability-based access control
- role separation (admin/doctor/patient)

INPUT SECURITY:
- sanitize all inputs
- validate all payloads
- prevent XSS, SQLi, SSRF
- validate uploads

API SECURITY:
- permission_callback required
- minimal response exposure
- no secret leakage

PAYMENT SECURITY:
- webhook signature verification
- idempotency keys
- replay attack prevention
- server-side verification only
- no frontend payment trust

BOOKING SECURITY:
- slot locking mandatory
- prevent double booking
- transactional booking writes
- automatic lock expiration

====================================================
NEXT.JS INTEGRATION RULES
====================================================

Next.js must:
- only consume APIs
- never write directly to DB
- never verify payments
- never calculate pricing
- never trust frontend state

Use:
- secure API routes
- SSR-safe authentication
- loading/error handling
- retry-safe requests

====================================================
ADMIN SYSTEM RESPONSIBILITIES
====================================================

Admin controls:
- doctor onboarding
- verification
- pricing system
- appointment control
- payment configuration
- refund system
- system analytics
- review moderation
- directory management

====================================================
IMPORTANT IMPLEMENTATION RULES
====================================================

- production-grade only
- no mock implementations
- no insecure shortcuts
- no frontend-only logic
- no hardcoded secrets
- use environment variables
- log all critical actions
- build scalable architecture

====================================================
OUTPUT REQUIRED FROM AI
====================================================

Generate:
- full architecture design
- database schema
- WordPress plugin structure
- REST API design
- payment integration design (Stripe + Paystack)
- webhook router system
- booking lifecycle design
- pricing engine design
- doctor directory system
- review system design
- email + queue system
- admin dashboard system
- doctor dashboard system
- security model
- scalability strategy