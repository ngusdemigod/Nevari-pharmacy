# Nevari Dashboard Public Endpoints

This file lists the public URL paths exposed by the dashboard code in this repository.

Use `<dashboard-origin>` for the deployed Next.js app origin, for example `https://dashboard.example.com`.

## Public Browser Routes

These routes are publicly reachable as URL paths. Some of them redirect, and some require a signed-in session after the page loads.

| Route | Purpose | Notes |
| --- | --- | --- |
| `/` | Root entry | Redirects to `/login` |
| `/login` | Customer login | Public login page |
| `/dashboard` | Customer dashboard | Requires customer session |
| `/dashboard/therapy/[requestId]` | Customer therapy request detail | Requires customer session |
| `/consultation` | Guest consultation booking entry | Public page, redirects signed-in users to `/dashboard?page=appointment` |
| `/subscription` | Subscription checkout/status | Public route, behavior depends on session and query state |
| `/pay/[invoiceRef]` | Invoice payment page | Public route using invoice reference |
| `/appointment/join/[token]` | Appointment join page | Public tokenized access link |
| `/therapy/join/[token]` | Therapy/MTM join page | Public tokenized access link |
| `/sso/dashboard` | SSO dashboard handoff | Public entry used for sign-in flow |
| `/admin/storefront/login` | Admin login | Public login page |
| `/admin/storefront` | Admin dashboard | Requires admin session |
| `/admin/storefront/setup` | Admin setup entry | Public route, forwards into admin login flow |
| `/admin/doctor/login` | Doctor login | Public login page |
| `/admin/doctor` | Doctor dashboard | Requires doctor session |
| `/admin/pharmacist/login` | Pharmacist login | Public login page |
| `/admin/pharmacist` | Pharmacist dashboard | Requires pharmacist session |
| `/admin/orders/[orderId]/documents` | Order documents view | Dynamic route, expected to require authenticated access |
| `/initialsetup` | Legacy setup entry | Redirects to `/admin/storefront/login` |
| `/Nevaricustomer` | Legacy customer alias | Redirects to `/login` |
| `/NevariDoctor` | Legacy doctor alias | Redirects to `/admin/doctor/login` |

## Public Dashboard API Endpoints

These dashboard API endpoints are registered by the WordPress plugin under the base namespace:

`<wordpress-origin>/wp-json/nevari/v1`

| Method | Endpoint |
| --- | --- |
| `GET` | `/dashboard/patient` |
| `GET` | `/dashboard/doctor` |
| `GET` | `/dashboard/store-admin` |
| `GET` | `/dashboard/store-admin/sales` |
| `GET` | `/dashboard/store-admin/audit-summary` |

## Example Full URLs

If the dashboard app is deployed at `https://dashboard.example.com`, the browser endpoints would look like:

- `https://dashboard.example.com/login`
- `https://dashboard.example.com/dashboard`
- `https://dashboard.example.com/admin/storefront/login`
- `https://dashboard.example.com/admin/doctor/login`
- `https://dashboard.example.com/admin/pharmacist/login`

If the WordPress backend is deployed at `https://nevarihealth.com`, the dashboard API endpoints would look like:

- `https://nevarihealth.com/wp-json/nevari/v1/dashboard/patient`
- `https://nevarihealth.com/wp-json/nevari/v1/dashboard/doctor`
- `https://nevarihealth.com/wp-json/nevari/v1/dashboard/store-admin`
