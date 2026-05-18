FULL UNIFIED AI PROMPT — WOOCOMMERCE PHARMACY APPOINTMENT + DASHBOARDS + GOOGLE MEET SYSTEM

You are building a WordPress + WooCommerce pharmacy appointment booking system using a custom plugin called Nevari-pharmacy-core. WooCommerce handles payments and orders. WordPress handles users and authentication. The Nevari plugin handles all appointment orchestration, dashboards, scheduling logic, notifications, and integrations.

Google Meet is generated via an external backend service and is NOT directly managed inside the plugin. The plugin only stores, distributes, and enforces access control to meeting links.

The system has three dashboards:

Customer Dashboard
Doctor Dashboard
Admin Dashboard (Storefront owner)

You must implement a fully unified appointment system with settings, automation, reminders, and strict security rules.

⚙️ CORE BOOKING FLOW (WOOCOMMERCE TRIGGER)
Trigger Event:
woocommerce_payment_complete
OR
woocommerce_order_status_processing

When triggered:

Validate order is an appointment product
Extract:
customer ID + email
doctor ID + email
appointment date/time
consultation duration
consultation type


🔗 GOOGLE MEET FLOW (EXTERNAL SERVICE ONLY)

Nevari plugin must call:
POST /api/create-meeting

Payload:

{
  "appointment_id": "123",
  "start_time": "...",
  "end_time": "...",
  "customer_email": "...",
  "doctor_email": "..."
}

Response:

{
  "meet_link": "https://meet.google.com/xxx-xxxx-xxx",
  "calendar_event_id": "abc123"
}

Store in WooCommerce order meta:

_nevari_meet_link
_nevari_calendar_event_id
Consultation duration


📩 EMAIL DISTRIBUTION SYSTEM (AUTO SEND)

Immediately after booking:

Send to:

- Customer:
Appointment confirmation
Meet link
Doctor details
Join button

- Doctor
New appointment notification
Meet link
Patient summary
“Start Consultation” link

- Admin
Full appointment data
Meet link
Audit record


⏰ REMINDER SYSTEM (CRON JOBS)

WordPress scheduled events:

15 minutes before appointment
5 minutes before appointment

Emails sent to:

Customer
Doctor
Admin


🧑‍⚕️ DOCTOR DASHBOARD — FULL SETTINGS MODULE

Doctors must have a settings panel inside Nevari dashboard.

1. Profile Settings
Edit name
Upload profile photo
Specialization
Bio
License number (optional verification field)

2. Consultations:
- View upcoming appointments
- Past appointments
- Prescription builder
- SETTINGS
Working days selector
Working hours (start/end)
Break time configuration
Offline/online toggle
Emergency availability toggle

** Consultation Settings (READ-ONLY PRICING CONTROL)
Consultation fees are controlled by ADMIN ONLY
Doctor can only view assigned pricing tier:
Junior / Senior / Specialist
Cannot modify pricing

** Booking Settings
Auto-accept appointments (toggle),
Manual approval mode (toggle),
Buffer time between sessions (e.g. 10–15 min),
Max daily appointments,

3. Notification Settings
Email notifications ON/OFF,
Instant appointment alerts,
Reminder notifications ON/OFF

4. Payments
Earnings overview


🧑‍🤝‍🧑 CUSTOMER DASHBOARD — FULL SETTINGS MODULE
1. My-Profile Settings
Edit name
Email update (with verification)
Phone number
Address (for pharmacy deliveries)
Reminder preferences: Email ON/OFF
Notifications Settings: Appointment reminders, Prescription alerts, payment receipts, Marketing opt-in/out
Payment Settings: View invoices Refund tracking Saved payment methods (WooCommerce integration)
Security Settings: Logout all devices, Two-factor authentication (optional future feature)
LOGOUT

2. Appointment Settings
Preferred doctors list
Appointment history
Upcoming appointments
- “Join Meeting” button 

3. orders
Pharmacy Orders


🏢 ADMIN DASHBOARD — FULL CONTROL SYSTEM

This is the master control panel of the entire ecosystem.

1. Doctor Management
- set minimum consultation time (min/hr)
- Assign consultation tiers (BY PRICING TIERS and BY PRODUCT CATEGORY) (so direct appointment booking bills the customer by the pricing tier but if an order is placed and it needs prescription they are charged by the product category consultation pricing):
* Set pricing per tier:Junior → ₦X per min consultation time | Senior → ₦Y/per min consultation | Specialist → ₦Z per min consultation
* Product category: set a consultation fee based on if a product is in a category 
Suspend/activate doctors

2. Consultations
- View all Consultations
- Filter by doctor, customer, status
- Reschedule consultation
- Cancel Consultation
- Force regenerate meeting links (for upcoming consultations, this triggers an email to affected parties)

3. Settings
- Enable/disable Google Meet integration
- Notification System Settings: 
    Enable/disable email notifications globally
    Configure SMTP settings
    Edit email templates:
    booking confirmation
    reminders settings
    Set reminder timing:  default: 15 min + 5 min (editable)

4. Products
manage products
manage Product categories and pricings 

Enable idempotency protection (prevent duplicate meetings)

6. Overview 

- Overview stats cards
    Product sales (amount)
    Total bookings  (number of bookings so far)
    Consultation Revenue (Amount)
    Prescriptions (total number)


- Pharmacy Management
Prescription monitoring
Most prescribed drugs
Order conversion tracking


Other system implementations: 
- System Security Settings
    Role permissions manager
    API key rotation (for external meeting service)
    Audit logs viewer
    IP restriction (optional advanced feature)

- Logging & Monitoring
    Appointment logs
    Email logs
    Meeting creation logs
    Failed webhook retries

🔒 SECURITY REQUIREMENTS (NON-NEGOTIABLE)
1. Role-Based Access Control
Customer → own data only
Doctor → assigned patients only
Admin → full access
2. Order Ownership Validation
Never expose meeting links unless:
user owns order OR
user is assigned doctor OR
user is admin
3. Secure External API Communication
Use API key or JWT
Never expose credentials in frontend
4. No Public Meeting Links
Must not appear in public endpoints
Must be retrieved only via authenticated requests
5. Email Security
Sanitize all inputs
Prevent header injection
Force HTTPS links only
6. Idempotency
Prevent duplicate meeting creation on repeated WooCommerce hooks

🧠 FINAL SYSTEM BEHAVIOR SUMMARY
Customer books appointment 
Payment triggers WooCommerce hook
Nevari plugin calls external API → generates Google Meet link
Link stored in WooCommerce order meta
Emails sent to customer, doctor, admin
Reminders sent at 15 min + 5 min before appointment with appointment details

Admin controls everything from pricing to scheduling to logs
Plugin and dashboards NEVER hosts video calls — only orchestrates data + access