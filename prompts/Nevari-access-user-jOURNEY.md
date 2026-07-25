# NevariHealth — Patient Care Journey

**Services covered:** Medication Therapy Management (MTM) · IV Therapy · Request a Nurse

---

## 1. Medication Therapy Management (MTM)

### Patient Journey

| Step | Stage | Description | Channel |
|------|-------|-------------|---------|
| 1 | Bio-data form submission | Patient completes the bio-data form and receives an automatic thank-you message. Information enters the NevariHealth database / patient file for review. A pharmacist reviews the submission and determines the patient's needs. | Website |
| 2 | Appointment scheduling | Patient is taken to the booking page to schedule a 30-minute appointment with a pharmacist, followed by confirmation. | Website |
| 3 | Appointment confirmation | Confirmation message sent to the patient. | Email + WhatsApp |
| 4 | MTM consultation *(paid)* | Pharmacist carries out a comprehensive medication review. | Consultation |
| 5 | Documentation | Medication Action Plan generated and sent to the patient. | Email |
| 6 | Follow-up appointment | Arranged with the patient's primary care physician, where required. Handled by email — **not** on the Nevari website. | Email |
| 7 | Patient follow-up | Action tracking, carried out 2 weeks after the MTM consultation. | Email |

### Step 3 — Confirmation Message Template

> Thank you for completing the MTM Patient Assessment Form. Your information has been received. A NevariHealth pharmacist will review your submission and contact you within 24 hours to schedule your MTM consultation.

### Dashboard Statuses

`Submitted` → `Under Review` → `Approved` → `Scheduled` → `Treatment Completed` → `Follow-Up` → `Completed`

---

## 2. IV Therapy Service

### Step 1 — Patient Fills Form

The form collects:

- Name
- Address
- Phone number
- Preferred date / time
- Symptoms
- Medical conditions
- Current medications
- Preferred IV package
- Doctor's referral (if applicable)

### Step 2 — Clinical Review *(backend — Nevari team)*

The request enters a queue for clinical review. A pharmacist reviews:

- Eligibility
- Contraindications
- Need for physician approval
- Availability of staff

### Dashboard Status Progression

**Immediately after submission**

| Field | Value |
|-------|-------|
| Service | IV Therapy Request |
| Reference | #IV-00125 |
| Status | **Submitted** |

**After review** — the pharmacist receives a backend notification

- **Under Clinical Review** — *"Your therapy request is being reviewed by our clinical team."*
- **Approved — Scheduling Required** — *"Your IV Therapy request has been approved. Please select an available appointment time."*

**After booking**

| Field | Value |
|-------|-------|
| Status | **Appointment Confirmed** |
| Service | IV Hydration Therapy |
| Date | 15 June 2026 |
| Time | 1:00 pm |
| Provider | Nurse Sophie |

**After completion**

| Field | Value |
|-------|-------|
| Status | **IV Therapy Completed Successfully** |
| Date completed | 15 June 2026 |

### Dashboard Statuses

`Submitted` → `Under Review` → `Approved` → `Scheduled` → `Treatment Completed` → `Follow-Up` → `Completed`

---

## 3. Request a Nurse Service

### Patient Journey Workflow

| Step | Stage | Description | Status |
|------|-------|-------------|--------|
| 1 | Select service | Patient selects "Request a Nurse" on the NevariHealth platform. | — |
| 2 | Quick request form | Patient enters name, phone number, location, required nursing service, and preferred date / time. | — |
| 3 | Request submitted | System creates a service ticket and displays confirmation. | Submitted |
| 4 | Clinical review | Coordinator reviews request, service type, location, urgency, and availability. | Under Review |
| 5 | Nurse assignment | Suitable nurse assigned based on service requirements and location. | Nurse Assigned |
| 6 | Appointment scheduling | Patient receives visit details and confirms the appointment. | Scheduled |
| 7 | Service delivery | Nurse conducts the home visit and provides the requested care. | In Progress |
| 8 | Documentation | Nurse completes visit notes, care summary, and recommendations. | In Progress |
| 9 | Follow-up | NevariHealth follows up where appropriate to assess outcomes and satisfaction. | In Progress |
| 10 | Case closure | Service request marked complete; documents remain available on the patient dashboard. | Completed |

### Workflow Map

`Request Submitted` → `Under Review` → `Nurse Assigned` → `Scheduled` → `Service Delivery` → `Follow-Up` → `Completed`

### Dashboard Statuses

`Submitted` → `Under Review` → `Nurse Assigned` → `Scheduled` → `In Progress` → `Completed`

---

## Appendix — Dashboard Status Summary

| MTM | Request a Nurse | IV Therapy |
|-----|-----------------|------------|
| Submitted | Submitted | Submitted |
| Under Review | Under Review | Under Review |
| Approved | Nurse Assigned | Approved |
| Scheduled | Scheduled | Scheduled |
| Treatment Completed | In Progress | Treatment Completed |
| Follow-Up | Completed | Follow-Up |
| Completed | — | Completed |