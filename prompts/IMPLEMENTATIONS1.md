Act as a senior Next.js + SWR dashboard engineer with expertise in WooCommerce integration and complex popup forms. Refactor and fix the dashboard popups according to the following specifications:


2. **Error Handling**
   - Implement robust error handling on all popups.
   - For the order creation popup, handle all possible server errors, including “user already exists” scenarios.
   - Provide clear error messages to the user for server errors or validation failures.

3. **Sticky Footer Actions**
   - On all popups, ensure the footer containing action buttons (Save, Update, Cancel, etc.) is **sticky**, so only the middle content scrolls while the footer remains visible.

- when removing a product from its only category there should be a toadt message  "Product must belong to atleast 1 category"

4. **Orders**
   - the print icon on the orders details should generate a custom invoice from the data in the order details, let this not be a screen shot but a proper invoice
   - the contact customer on the order details on the page should automatically send a custom generated order email to the customer in question
    

5. **Doctor Actions**
   - Ensure the reset password button on the doctor details page has a working REST endpoint.
      {
    "code": "rest_no_route",
    "message": "No route was found matching the URL and request method.",
    "data": {
        "status": 404
    }
}
   - Make the suspend doctor action button functional by connecting it to the correct endpoint.
   {
    "code": "rest_no_route",
    "message": "No route was found matching the URL and request method.",
    "data": {
        "status": 404
    }
}

   - Make the delete doctor action button functional by connecting it to the correct endpoint.
         {
    "success": false,
    "error": {
        "code": "upstream_unreachable",
        "message": "Oops.. Connection error, Check your internet connection",
        "details": {
            "status": 502,
            "path": "/wp-json/nevari/v1/doctors/10",
            "upstream": "https://demo.nevarihealth.com/wp-json/nevari/v1/doctors/10"
        }
    }
}
   - Assigning a pricing tier to a doctor should **automatically update the doctor’s consultation price** according to the tier.

6. **Consultation Creation Popup**
   - let the new consultation form be structured thus:
      - a calendar widget on the left column showing the avalability days of the selected doctor. let this widget be the source of truth for booking day,time the widget name is @booking-calendar.html
      - on the right column the booking form that has the 
            doctor name search assignment component
            patient name search assignment
            consultation type:( video, audio) and  status (a dropdown) --- on one line
            reason (text field)
   - this is then used to trigger the google meet creation api and a consulatation email with details is sent to the customer and the doctor and an email notification is sent to the admin
   make sure the design matches the attached design system '@design_system1.md'


7. **General Requirements**
   - Use SWR for lazy-loading all dependent lists when the popup opens.
   - Implement optimistic updates for create/update/delete operations with rollback on error.
   - Ensure all popups have proper loading states, error states, and smooth UX for dynamic data.
   - Centralize shared lists like doctors, patients, products, categories, brands, and tiers to avoid duplicate fetches.

8. **Emails**
Create a full Email Templates Management section inside the Emails navigation of the Next.js app.

The system should support fully customizable HTML email templates that are used globally across the platform for all outgoing emails.

FEATURE REQUIREMENTS:

* Add a dedicated “Email Templates” page under the Emails navigation.
* Every system email must use a template from this module before being sent to recipients.
* Allow admins to create, edit, duplicate, preview, and manage templates.
* Templates should support dynamic hooks/placeholders such as:

  * {content}
  * {customer_firstname}
  * {customer_lastname}
  * {order_id}
  * {appointment_date}
  * {site_name}
  * {support_email}
  * and other system variables.
* Make hooks reusable and dynamically injected during email generation.
* Include a searchable list of all available hooks with descriptions.

LAYOUT STRUCTURE:

LEFT COLUMN:

* Display a scrollable list of all email templates required by the system.
* Examples:

  * Welcome Email
  * Password Reset
  * Order Confirmation
  * Appointment Approved
  * Appointment Cancelled
  * Invoice Email
  * Subscription Renewal
  * Admin Notification
  * Vendor Notification
* Show template status (active/draft).
* Include search and category filtering.
* Clicking a template loads it into the editor.

RIGHT COLUMN:

* Full email template editing interface.
* Rich HTML email editor with responsive email support.
* Support drag-and-drop blocks or code editing mode.
* Display all available hooks/placeholders in a side panel for quick insertion.
* Live preview button to render the email exactly as recipients would see it.
* Desktop and mobile preview modes.
* Save, Save as Draft, Duplicate, and Send Test Email actions.
* Real-time validation for unsupported hooks or broken HTML.

TECHNICAL REQUIREMENTS:

* Build using Next.js App Router architecture.
* Use responsive split-pane layout.
* Prevent hydration flicker.
* Lazy load heavy email editor dependencies.
* Store templates in database with versioning/history support.
* Support dark/light mode consistent with the app design system.
* Templates should render safely on major email clients (Gmail, Outlook, Apple Mail, Yahoo).
* Use reusable server-side rendering logic for parsing hooks before sending emails.
* Add API routes/actions for fetching, updating, previewing, and sending test emails.

UX DETAILS: use the design system attached @design_system1.html


**Deliverable:**  
Provide refactored Next.js components or hooks implementing these corrections, including SWR usage, REST endpoint integration, sticky footers, error handling, and dependent list management. Ensure the solution is production-ready, maintainable, and scalable.


