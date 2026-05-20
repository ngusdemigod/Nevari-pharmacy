# Nevari Pharmacy Core

Installable WordPress plugin that adds a REST API and admin audit console for a WooCommerce-powered pharmacy consultation and prescription workflow.

## What this plugin includes

- Custom roles: `patient`, `doctor`, `store_admin`
- Doctor profile custom post type and doctor taxonomies
- Custom database tables for:
  - appointments
  - prescriptions
  - prescription items
  - prescription history
  - patient-doctor links
  - email templates
  - email logs
  - audit logs
  - refresh tokens
- JWT login/refresh/logout endpoints for a Next.js dashboard
- WooCommerce product pharmacy flags:
  - `_nevari_rx_required`
  - `_nevari_consultation_required`
  - `_nevari_otc`
  - `_nevari_restricted_visibility`
- WooCommerce cart/checkout validation for prescription-required products
- Email template rendering and email logging
- REST endpoints under `/wp-json/nevari/v1`
- WordPress admin audit page: **Nevari store** with tabs:
  - ORDERS
  - PAYMENTS
  - SECURITY
  - CONSULTATION
  - EMAILS

## Installation

1. Upload the `nevari-pharmacy-core` folder to `wp-content/plugins/` or upload the ZIP in WordPress Admin → Plugins → Add New → Upload Plugin.
2. Activate **Nevari Pharmacy Core**.
3. Ensure WooCommerce is active for product, order, and checkout integration.
4. Assign users to `patient`, `doctor`, or `store_admin` roles.

## Authentication

Login:

```http
POST /wp-json/nevari/v1/auth/login
Content-Type: application/json

{
  "username": "admin@example.com",
  "password": "password"
}
```

Use the returned access token:

```http
Authorization: Bearer <access_token>
```

Refresh:

```http
POST /wp-json/nevari/v1/auth/refresh

{
  "refresh_token": "..."
}
```

## Core endpoints

### Auth

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

### Orders

- `GET /orders`
- `GET /orders/{id}`
- `PATCH /orders/{id}`
- `POST /orders/{id}/notes`
- `POST /orders/{id}/rx-hold`
- `POST /orders/{id}/release-rx-hold`
- `POST /orders/{id}/link-prescription`
- `GET /orders/{id}/prescriptions`

### Products

- `GET /products`
- `POST /products`
- `GET /products/{id}`
- `PATCH /products/{id}`
- `DELETE /products/{id}`
- `PATCH /products/{id}/pharmacy-rules`
- `GET /products/categories`
- `POST /products/categories`
- `PATCH /products/categories/{id}`
- `DELETE /products/categories/{id}`
- `GET /products/tags`
- `POST /products/tags`
- `PATCH /products/tags/{id}`
- `DELETE /products/tags/{id}`
- `GET /products/badges`

### Doctors

- `GET /doctors`
- `POST /doctors`
- `GET /doctors/{id}`
- `PATCH /doctors/{id}`
- `DELETE /doctors/{id}`
- `GET /doctors/{id}/availability`
- `PATCH /doctors/{id}/availability`
- `GET /doctors/{id}/patients`

### Appointments

- `GET /appointments`
- `POST /appointments`
- `GET /appointments/{id}`
- `PATCH /appointments/{id}`
- `DELETE /appointments/{id}`
- `POST /appointments/{id}/cancel`
- `POST /appointments/{id}/confirm`
- `POST /appointments/{id}/complete`
- `POST /appointments/{id}/reschedule`
- `POST /appointments/{id}/notes`

### Prescriptions

- `GET /prescriptions`
- `POST /prescriptions`
- `GET /prescriptions/{id}`
- `PATCH /prescriptions/{id}`
- `DELETE /prescriptions/{id}`
- `POST /prescriptions/{id}/issue`
- `POST /prescriptions/{id}/assign`
- `POST /prescriptions/{id}/cancel`
- `POST /prescriptions/{id}/link-order`
- `POST /prescriptions/{id}/fulfill`
- `GET /prescriptions/{id}/history`
- `POST /prescriptions/validate-cart`

### Emails

- `GET /emails/logs`
- `GET /emails/logs/{id}`
- `POST /emails/send`
- `GET /emails/templates`
- `POST /emails/templates`
- `GET /emails/templates/{id}`
- `PATCH /emails/templates/{id}`
- `DELETE /emails/templates/{id}`
- `POST /emails/templates/{id}/preview`
- `POST /emails/templates/{id}/test`

### Dashboards

- `GET /dashboard/patient`
- `GET /dashboard/doctor`
- `GET /dashboard/store-admin`
- `GET /dashboard/store-admin/sales`
- `GET /dashboard/store-admin/audit-summary`

### Audit logs

- `GET /audit-logs`
- `GET /audit-logs/{id}`

## Example appointment request

```json
{
  "doctor_user_id": 45,
  "type": "video",
  "start_at": "2026-01-20T14:00:00Z",
  "end_at": "2026-01-20T14:30:00Z",
  "timezone": "America/New_York",
  "reason": "Follow-up consultation",
  "symptoms": {
    "duration": "3 days",
    "description": "Headache and nausea"
  }
}
```

## Example prescription request

```json
{
  "patient_user_id": 123,
  "appointment_id": 3001,
  "diagnosis": "Example diagnosis",
  "instructions": "Take as directed.",
  "valid_from": "2026-01-20T00:00:00Z",
  "valid_until": "2026-02-20T00:00:00Z",
  "items": [
    {
      "product_id": 901,
      "dosage": "500mg",
      "quantity": 30,
      "unit": "tablets",
      "frequency": "Twice daily",
      "duration_days": 15
    }
  ]
}
```

## Production hardening notes

This is a working development plugin scaffold. Before medical/pharmacy production use, complete:

- full PHPCS WordPress Coding Standards pass
- HIPAA/GDPR/regional privacy review
- provider-grade email delivery integration
- encryption strategy for sensitive notes if legally required
- rate limiting for auth endpoints
- external audit log export or immutable storage if required
- deeper WooCommerce payment gateway webhook logging
- unit/integration tests against your exact WordPress/WooCommerce versions
