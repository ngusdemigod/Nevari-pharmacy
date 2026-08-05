CODEX REDESIGN PROMPT — FOUR CREATION MODALS

Redesign the creation modals from the supplied reference images:

1. New appointment
2. Create order
3. New user account
4. Create product

The redesign must feel simple, calm, modern, flat, and self-explanatory. Do not copy the current layouts blindly. Reorganise each modal so that the most important actions are easy to understand and complete without confusion.

IMPORTANT UPDATE

The Create product modal has now been refined further based on the latest approved screens. Update the implementation so the Create product flow matches those latest screens exactly in structure, spacing, and hierarchy.

GLOBAL DESIGN DIRECTION

Use a maximum modal width of 1000 px for the large modals. The appointment, order, and create-product modals may use most of this width. The user-account modal may be narrower because it contains fewer fields. Keep all four modals visually related so they feel like parts of the same product family.

Use a plain white modal surface over a very light neutral page overlay. Use only flat colours. Do not use gradients, glass effects, drop shadows, floating cards, glossy effects, heavy borders, or decorative backgrounds.

Use a calm navy blue as the main action colour, soft blue for selected and focused states, pale grey for dividers and input borders, dark navy-grey for primary text, and muted grey-blue for secondary text. Keep colour usage controlled and purposeful.

Do not use bold text. Create hierarchy through font size, spacing, position, and colour instead. Modal titles should be the largest text. Section titles should be smaller. Field labels and supporting text should be quieter. Avoid unnecessary uppercase text.

Use one clean sans-serif typeface throughout. Keep the layout spacious but not wasteful. Use consistent spacing, consistent field heights, consistent corner rounding, and thin borders. Inputs should feel modern and light, with clear focus states.

All large modals should visually follow the same language shown in the uploaded design reference:
- Large white modal with rounded corners
- Clean header with title on the left and circular close button on the right
- Thin divider below the header
- Clear internal spacing
- Minimal supporting text
- Flat outlined inputs
- Nevari pill-shaped CTA buttons
- No clutter and no visual noise

Every modal must have:
- A clear title at the top left
- A simple circular close button at the top right
- A thin divider below the header
- A content area that only grows as much as needed
- A footer area aligned cleanly to the right
- A secondary Cancel or Go back action where appropriate
- A primary Nevari-style pill-shaped call-to-action button
- No long explanatory paragraph inside the modal
- Clear validation messages shown close to the affected field
- Keyboard-friendly behaviour and visible focus states
- A confirmation warning when the user tries to close a form that contains unsaved information

HEIGHT AND LAYOUT BEHAVIOUR

The modal height should fit the content. Do not force unnecessary vertical height. Do not leave large empty blank space below the content. Each modal should feel naturally sized to its content while still maintaining good padding and balance.

NEVARI PRIMARY BUTTON STYLE

The main action button must use the Nevari pill-shaped style:
- Fully rounded pill shape
- Solid navy blue fill
- White regular-weight text
- No gradient and no shadow
- Comfortable horizontal padding
- Smooth hover state using a slightly darker flat navy
- Pressed state should feel gently compressed without looking playful
- Disabled state should use a pale muted colour and should not look clickable
- During submission, keep the button width unchanged, temporarily replace the leading or trailing icon with the Nevari spinner, and disable repeated clicks
- The button label may remain visible beside the spinner so the user knows what action is in progress

SECONDARY BUTTON STYLE

Use a simple pill-shaped outlined button for secondary actions:
- White background
- Thin navy or grey-blue border
- Navy text
- No shadow
- Slight hover tint only
- Used for actions such as Cancel, Go back, Save draft, or other supportive steps

SNACKBAR FEEDBACK

After an action completes, show a compact snackbar near the bottom centre of the screen:
- Use a flat background
- Use a small status icon and a short sentence
- Success examples: “Appointment booked”, “Order created”, “User account created”, and “Product published”
- Error examples should explain what failed in one short sentence and offer a simple retry action where appropriate
- The snackbar should enter with a subtle upward movement and fade, remain long enough to read, and then disappear gently
- Do not use large celebratory popups

MOTION AND INTERACTION LANGUAGE

Animations must be subtle, quick, and purposeful:
- Modal opening: gentle fade with a very small upward movement
- Modal closing: quick fade out
- Dropdowns and search suggestions: short fade and slight downward reveal
- Selected options: soft background-colour change, not a dramatic movement
- Buttons: gentle hover and pressed feedback
- Validation messages: fade into place without moving the whole layout abruptly
- Snackbar: short slide upward and fade
- Respect reduced-motion settings by removing non-essential movement

PART 1 — NEW APPOINTMENT MODAL

MAIN PROBLEMS IN THE CURRENT DESIGN

The current appointment modal feels crowded and vertically cut off. The left and right areas do not feel balanced, the “Reason for visit” field is pushed below the visible area, and the footer competes with the content. The current date and time selection area contains too many boxes at once, which makes the choice feel heavier than necessary. The consultation-type field is unnecessary and must be removed completely. Selection states are too weak, and the user does not receive enough guidance about what must be chosen before booking.

REDESIGN GOAL

Make appointment booking feel like one short, natural flow:
Choose the patient, choose the doctor, add an optional reason, then choose a date, duration, and available time.

LAYOUT

Use a two-column layout inside the modal on large screens.

Left column:
- Patient search
- Doctor search
- Optional reason for visit

Right column:
- Date selection
- Session duration
- Available time slots

Keep both columns aligned from the top. Use one thin vertical divider only if it improves clarity; otherwise use spacing alone. Do not place each section inside separate floating cards.

On smaller screens, stack the content in the same order:
Patient, doctor, reason, date, duration, time.

The footer should remain fixed and contain:
- Cancel button
- “Book appointment” Nevari pill button

Do not include “Consultation type” anywhere.

PATIENT SEARCH

Use the label “Patient”.
Use a search field with the placeholder:
“Search by name, email, or phone”.

When the user types:
- Show a small suggestion panel below the field
- Each result should show the patient’s name as the main text and one secondary identifier such as email or phone
- Highlight the row softly on hover or keyboard focus
- When selected, replace the search text with a compact selected-patient state
- Include a small clear control so the user can change the patient

If there are no matching patients, show one short empty state:
“No matching patient found”.

DOCTOR SEARCH

Use the label “Doctor”.
Use the placeholder:
“Search by name or specialty”.

Search results should show:
- Doctor name
- Specialty
- Optional small availability indicator

After selection, show the chosen doctor clearly and allow the user to clear or replace the selection.

REASON FOR VISIT

Use one optional multiline field.
Label:
“Reason for visit”
Placeholder:
“Add a short note for the doctor”.

Do not make this field very tall. Allow it to grow slightly as the user types. Show a quiet character limit only when the user approaches the limit.

DATE SELECTION

Use a compact calendar area rather than a large full-month calendar.

Show:
- Current month and year
- Previous and next controls
- A “Today” control
- A clean row or compact grid of available dates
- Dates with availability should have a small, quiet indicator
- Unavailable dates should appear muted and should not be selectable
- The selected date should use a flat blue filled circle or rounded shape with white text

When a new date is selected:
- Refresh the available time slots
- Keep the transition subtle
- Preserve the chosen duration where possible
- If the selected time becomes unavailable, clear it and explain the change briefly

SESSION DURATION

Show duration choices as compact segmented pills:
- 30 min
- 45 min
- 1 hr
- 1.5 hr
- 2 hr

Only one duration can be selected.
The selected duration should use a soft blue fill and a clear blue border.
Unselected choices should remain white with a light grey border.

AVAILABLE TIME SLOTS

Display time slots in a clean responsive grid.
Use readable labels such as:
“8:00 AM”, “8:30 AM”, “9:00 AM”.

Available times should look clickable.
Unavailable times should appear muted and must not react like active buttons.
The selected time should use the same flat selected style as the chosen duration.
Do not show too many times without structure. Keep spacing even and allow the list to scroll inside its area when needed.

FORM RULES AND USER FLOW

The user flow must be:
1. Search and select a patient
2. Search and select a doctor
3. Add an optional reason
4. Choose an available date
5. Choose a duration
6. Choose an available time
7. Select “Book appointment”

Keep the Book appointment button disabled until the required choices are complete.

On submission:
- Show the Nevari spinner inside the Book appointment button
- Prevent repeated clicks
- Keep the modal open while the booking is being processed
- On success, close the modal and show the snackbar “Appointment booked”
- On failure, keep all entered information, stop the spinner, show the relevant error, and provide a retry path

PART 2 — CREATE ORDER MODAL

MAIN PROBLEMS IN THE CURRENT DESIGN

The current order modal has inconsistent wording, including “Patient name” inside a customer section. The left side contains too much empty space while the order-items side feels unfinished. The empty-product area is oversized, the payment and delivery fields are separated awkwardly, and the prescription note is partly hidden by the footer. The layout does not clearly communicate the order-building sequence or the order summary.

REDESIGN GOAL

Make the order process feel direct:
Choose a customer, add products, set payment and delivery, add an optional fulfilment note, review the order, and create it.

LAYOUT

Use a balanced two-column layout on large screens.

Left column:
- Customer selection and contact details
- Payment status
- Delivery method

Right column:
- Product search
- Added products list
- Optional fulfilment note
- Compact order summary

On smaller screens, stack in this order:
Customer, products, payment, delivery, note, summary.

Use section headings only where they help scanning:
- Customer
- Order items
- Payment and delivery
- Order summary

Do not use multiple bordered cards. Use spacing and thin dividers.

CUSTOMER DETAILS

Use the label “Customer”, not “Patient name”.

Start with one search field:
“Search customer by name, email, or phone”.

When a customer is selected:
- Show the customer’s name
- Show email and phone beneath it
- Allow the user to clear or change the selection

When no existing customer is found:
- Offer a quiet “Enter customer details manually” action
- Reveal name, email, and phone fields only after that action is chosen
- Do not show unnecessary fields before they are needed

PRODUCT SEARCH AND ORDER ITEMS

Place product search at the top of the Order items section.
Placeholder:
“Search by product name, SKU, or brand”.

Search results should show:
- Product name
- SKU or brand
- Stock state
- Price when available

When a product is added:
- Add a clean product row to the order
- Show product name, unit price, quantity, and row total
- Provide clear minus and plus controls for quantity
- Provide a simple remove action
- Update the item count and order total immediately

Do not keep a large empty box once products are added.

When the list is empty, show a compact empty state:
“No products added”
with one quiet action:
“Browse products”.

When a product is out of stock, do not allow it to be added and explain the reason briefly.

PAYMENT STATUS

Use one clear dropdown labelled:
“Payment status”.

Options may include:
- Unpaid
- Partially paid
- Paid
- Pay on delivery

When “Partially paid” is selected, reveal only the additional amount field needed for that state.

DELIVERY METHOD

Use one dropdown labelled:
“Delivery method”.

Options may include:
- Pickup
- Local delivery
- Shipping

Reveal extra delivery information only when required. For example, show an address field only when a delivery method needs an address. Keep conditional fields close to the choice that created them.

FULFILMENT NOTE

Use the label:
“Fulfilment note”
and mark it as optional.

Placeholder:
“Add an optional prescription or fulfilment note”.

Keep the field compact. Do not let it dominate the modal.

ORDER SUMMARY

Include a small order summary near the bottom of the right column or inside the fixed footer.

Show only essential information:
- Number of items
- Subtotal
- Delivery charge when applicable
- Total

Use font size and spacing for hierarchy, not bold text.

FOOTER

The footer should contain:
- Cancel button
- Compact total summary where space allows
- “Create order” Nevari pill button

Do not include the sentence “You can review the order before fulfilment” because the interface itself should make that clear.

FORM RULES AND USER FLOW

The user flow must be:
1. Select an existing customer or enter customer details manually
2. Search for products
3. Add one or more products
4. Adjust quantities where needed
5. Choose payment status
6. Choose delivery method
7. Add an optional fulfilment note
8. Review the order summary
9. Select “Create order”

Keep Create order disabled until:
- A customer is present
- At least one valid product is added
- Payment status is selected
- Delivery method is selected

On submission:
- Show the Nevari spinner inside the Create order button
- Prevent duplicate orders from repeated clicks
- Preserve the entered order if an error occurs
- On success, close the modal and show the snackbar “Order created”
- On failure, keep the modal open and show one clear message explaining what needs attention

INTERACTIONS AND SUBTLE ANIMATIONS

- Customer and product search panels should reveal smoothly beneath their fields
- Added product rows should fade into place without bouncing
- Removed product rows should collapse gently
- Quantity changes should update totals immediately with a subtle number transition
- Conditional payment or delivery fields should reveal softly
- Do not animate the whole modal when one field changes

PART 3 — NEW USER ACCOUNT MODAL

MAIN PROBLEMS IN THE CURRENT DESIGN

The current user-account modal is much wider than the form requires, leaving large empty areas. The avatar and role controls do not align naturally, the password field is partially cut off, and the footer appears before all content is comfortably visible. Some instructions are repeated even though the fields are already understandable. The overall form feels unfinished and unbalanced.

REDESIGN GOAL

Create a compact, confident account-creation form that can be completed quickly without visual noise.

MODAL WIDTH AND LAYOUT

Use a narrower modal than the other large modals, while keeping it below the 1000 px maximum. A comfortable width around 760–820 px is appropriate.

Use this structure:

Top profile row:
- Avatar upload on the left
- Role selection on the right

Main form:
- First name and last name on one row
- Email address and optional phone number on one row
- Password on a full-width row

On smaller screens, stack every field vertically.

Do not use a large separate eyebrow above the title. Use only:
“New user account”
with a short optional subtitle:
“Add account details and assign a role”.

Keep the subtitle quiet and brief.

AVATAR UPLOAD

Show a compact square or rounded avatar preview with initials as the default.
Beside it, place a simple “Upload avatar” button and one quiet line:
“JPG, PNG, or WebP · Max 2 MB”.

When an image is selected:
- Update the preview immediately
- Offer small Change and Remove actions
- Show an inline error if the file type or size is invalid
- Do not open a large secondary dialog unless cropping is genuinely needed

ROLE SELECTION

Use one dropdown labelled:
“Role”.

Placeholder:
“Select role”.

Do not preselect a role unless the product rules require a default.

When the menu opens:
- Show roles in a clean list
- Include a one-line explanation only for roles that may be unclear
- Close the menu after a role is chosen

NAME FIELDS

Use:
- First name
- Last name

Use clear placeholders:
“Enter first name”
“Enter last name”.

Validate only after the user leaves the field or attempts to submit. Do not show errors before the user has interacted.

EMAIL AND PHONE

Use:
- Email address
- Phone number (optional)

Check the email format and show a short inline message only when needed.
Keep phone optional unless the chosen role requires it.

PASSWORD

Use one full-width password field labelled:
“Password”.

Include a show/hide control.
Provide quiet password guidance below the field only when the user focuses it or enters an invalid password.
Do not display a large permanent block of password rules.

If the product requires confirmation, add “Confirm password” directly below the password field. Otherwise, do not add extra fields.

FOOTER

The footer should contain:
- Cancel button
- “Create user” Nevari pill button

Remove the permanent footer sentence about required fields. The disabled state of the button and targeted inline validation should communicate this more clearly.

FORM RULES AND USER FLOW

The user flow must be:
1. Upload an avatar or skip it
2. Choose a role
3. Enter first name
4. Enter last name
5. Enter email address
6. Enter optional phone number
7. Create a password
8. Select “Create user”

Keep Create user disabled until all required fields are valid.

On submission:
- Show the Nevari spinner inside the Create user button
- Prevent repeated clicks
- Keep all fields visible and unchanged while processing
- On success, close the modal and show the snackbar “User account created”
- On failure, stop the spinner, keep the entered information, and place the error beside the affected field or show one concise form-level message when the issue is not field-specific

INTERACTIONS AND SUBTLE ANIMATIONS

- The avatar preview should update with a quick fade
- The role menu should open with a subtle reveal
- Password visibility should change instantly without moving the layout
- Focused fields should receive a clear flat blue outline
- Validation messages should fade in below the affected field
- The submit spinner and snackbar should follow the same behaviour used in the other modals

PART 4 — CREATE PRODUCT MODAL

MAIN REQUIREMENT

Redesign the Create product modal so it follows the latest approved screens exactly. It must use the same design language as the New appointment, Create order, and New user account modals. The modal should feel like part of the same calm and polished design system.

The Create product flow remains a 3-step flow:
1. Product details
2. Stock & shipping
3. Prescription

However, do not show step indicators. Do not use a wizard stepper or numbered progress display at the top. Each screen stands on its own with the same header, then the step-specific content beneath it.

The full modal width must stay within a maximum of 1000 px.

HEIGHT BEHAVIOUR FOR CREATE PRODUCT

The modal height should fit the content of each screen. Do not stretch it to an unnecessarily tall height. Each of the three screens should be compact and naturally sized.

LATEST APPROVED STRUCTURE — STEP 1 PRODUCT DETAILS

Follow this order exactly:

1. Header area
2. Product name on its own line
3. Product images gallery underneath product name
4. One row beneath that containing:
   - Unit price
   - Sales price
   - Short description

This order is important and must be preserved.

HEADER

Use:
- Title: “Create product”
- Quiet subtitle:
“Add a medicine or pharmacy product with image, stock, pricing and catalogue details.”
- Circular close button on the top right
- Thin divider below the header

STEP 1 CONTENT

Section 1 — Product name
- Label: “Product name”
- Use a full-width input on its own line
- Placeholder:
“Enter product name”

Section 2 — Product images
- Label: “Product images”
- Quiet helper text:
“Add up to 6 images. The first image will be used as the cover.”
- Show uploaded image thumbnails in a neat horizontal layout
- Show one uploaded image marked as “Cover”
- Each uploaded image should have a small remove control
- Include one clear upload tile labelled “Add images”
- Helper text below:
“PNG or JPG, up to 10MB each.”

Section 3 — One row with pricing and short description
Use a single horizontal row with three fields:
- Unit price
- Sales price
- Short description

Unit price:
- Label: “Unit price”
- Compact input
- Placeholder:
“Enter unit price”
- Currency suffix or prefix may appear as shown in the approved screen

Sales price:
- Label: “Sales price”
- Compact input
- Placeholder:
“Enter sales price”

Short description:
- Label: “Short description”
- Medium-height textarea aligned in the same row
- Placeholder:
“Add a short customer friendly description”
- Character count:
“0/160”

FOOTER FOR STEP 1
- Right-aligned buttons
- “Save draft” as outlined secondary button
- “Next” as primary Nevari button

LATEST APPROVED STRUCTURE — STEP 2 STOCK & SHIPPING

Follow the approved screen structure closely.

HEADER
Use the same Create product header and divider.

BODY CONTENT
Use a clean content section with:
- Left-aligned section title:
“Stock & shipping”
- Quiet right-aligned helper sentence:
“Set stock, shipping, category, and tags.”

FIELDS

Top row:
- Stock quantity on the left
- Shipping on the right

Second row:
- Categories on the left
- Tags on the right

Stock quantity:
- Placeholder:
“Enter stock quantity”

Shipping:
- Dropdown
- Example selected value:
“Standard pharmacy item”

Categories:
- Search-style input
- Placeholder:
“Type to search categories”
- Small “Add” button beside the field

Tags:
- Search-style input
- Placeholder:
“Type to search tags”
- Small “Add” button beside the field

Do not overcomplicate the layout. Keep the content compact so the modal height fits the content.

FOOTER FOR STEP 2
- Right-aligned actions
- “Go back” outlined button
- “Save draft” outlined button
- “Next” primary Nevari button

LATEST APPROVED STRUCTURE — STEP 3 PRESCRIPTION

Use the same Create product header and divider.

BODY CONTENT
Use:
- Left-aligned section title:
“Prescription”
- Quiet right-aligned helper sentence:
“Record the prescription copied into order items and customer emails.”

Below that:
- Label: “Prescription”
- A wide rich-text editor

Editor toolbar should be minimal and flat, matching the approved screen. It may include:
- Bold
- Italic
- Underline
- List controls
- Normal style dropdown
- Link action

Editor placeholder:
“Enter prescription details here...”

Below the editor:
- Checkbox:
“Create multiple”
- Supporting microcopy:
“Publish and start a new product”

Keep this area compact and neatly spaced.

FOOTER FOR STEP 3
- Right-aligned actions
- “Go back” outlined button
- “Save draft” outlined button
- “Publish” primary Nevari button

VALIDATION AND SYSTEM BEHAVIOUR FOR CREATE PRODUCT

- Preserve the user’s progress between screens
- Do not clear information when navigating back
- Show inline errors near the affected fields
- Keep wording short and direct
- If the upload fails, preserve the rest of the form and show a short retry message
- Keep draft-saving lightweight and reassuring
- When draft saves successfully, show a short snackbar such as “Draft saved”
- When publish succeeds, show snackbar:
“Product published”
- When publish fails, stop the spinner, preserve all entered content, and show a concise error message

INTERACTIONS AND SUBTLE ANIMATIONS FOR CREATE PRODUCT

- Upload tiles should show a subtle hover and focus outline
- Uploaded thumbnails should fade in
- Buttons should follow the same hover, press, disabled, and spinner behaviour as the other modals
- Snackbar should slide up gently from the bottom
- Dropdowns and editor controls should open cleanly without dramatic motion

RESPONSIVE AND USABILITY EXPECTATIONS

For all four modals:
- Never allow the modal to exceed the available screen height
- Keep the layout clean and balanced
- Let the modal height fit the content
- On smaller screens, use a near-full-screen modal with comfortable outer spacing
- Ensure every interactive control is easy to tap
- Keep tab order aligned with the visible user flow
- Pressing Escape should close the modal only when there is no unsaved work; otherwise ask for confirmation
- Clicking outside the modal should follow the same unsaved-work rule
- Return keyboard focus to the control that opened the modal after closing
- Use clear empty, loading, success, disabled, and error states
- Keep wording short, direct, and consistent
- Do not add decorative content that does not help the user finish the task

FINAL VISUAL RESULT

The final result should look like a polished modern healthcare and commerce administration product: clean white space, flat navy and soft-blue accents, thin borders, regular-weight typography, calm spacing, direct language, pill-shaped Nevari call-to-action buttons, clear selected states, subtle feedback animations, and concise snackbars.

All four modals must feel consistent, but each one should be sized and organised according to the amount of information it contains. The Create product modal must now follow the latest approved screens exactly, especially:
- no step indicator,
- title first,
- product images underneath product name,
- and pricing, sales price, and short description aligned on one row.