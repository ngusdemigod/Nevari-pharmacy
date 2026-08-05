Implement a production-ready redesign of the three existing creation modals in this Next.js application:

1. New consultation
2. New user account
3. New order

The existing modals must be replaced entirely by the redesigned versions. This is a visual and interaction redesign only.

NON-NEGOTIABLE SCOPE

Do not introduce any new product feature, field, workflow, route, API, state, permission, calculation, or business rule unless it is explicitly approved.

Preserve all existing:

- API requests
- Form submission logic
- Validation schemas
- Form libraries
- Authentication and authorization
- Permissions
- Customer, patient, doctor, product, and role lookups
- Existing loading and error behavior
- Pricing and subtotal calculations
- Upload logic
- Password generation logic
- Routes
- Server actions
- Query hooks
- Mutation hooks
- Analytics
- Accessibility behavior
- Business terminology

Do not replace real application data with static mock data.

Do not add a modal selector, page switcher, preview navigation, heading switcher, keyboard shortcuts for switching screens, demo shell, or prototype-only controls.

The supplied `all-modals.html` file is the visual reference. Copy its styling and proportions into the existing application while connecting the new interface to the application’s existing functionality.

FIRST INSPECT THE PROJECT

Before changing code, inspect:

- Next.js version and whether the project uses the App Router or Pages Router
- Existing modal/dialog implementation
- Existing accessible dialog primitive
- Existing component library
- Existing icon library
- Existing styling system
- Existing design tokens
- Existing form library
- Existing schema-validation library
- Existing data-fetching and mutation patterns
- Existing loading, error, and toast patterns
- Existing implementations of the three creation modals
- Existing responsive conventions
- Existing font-loading setup

Reuse the existing architecture and primitives. Do not install a new UI library, form library, validation library, animation library, or icon package.

Make the smallest safe set of changes.

VISUAL SOURCE OF TRUTH

Use `all-modals.html` as the styling source of truth, excluding:

- The heading/page switcher
- Prototype navigation
- Hash-based screen switching
- Prototype-only JavaScript
- The page background
- Any static mock behavior

Recreate only the three screen contents as actual modal dialogs.

Do not copy embedded base64 images into the application. Continue using real doctor avatars, uploaded user avatars, product thumbnails, and application assets.

SHARED COMPONENT SYSTEM

The three modals must use one shared design system rather than three independent sets of markup.

Reuse existing shared components where possible. Otherwise, extract small reusable components such as:

- CreationModal
- CreationModalHeader
- CreationModalBody
- CreationModalFooter
- ModalSection
- FormField
- CompactInput
- CompactSearchInput
- CompactSelect
- CompactTextarea
- ModalButton
- SelectionChip
- DateCard
- EntityCard
- SummaryStrip
- QuantityStepper

Adapt names and locations to the existing repository structure.

Keep business logic in the existing feature-level components or hooks. Low-level shared components must remain presentational.

Do not use `any`.

MODAL SHELL

Each modal must be rendered through the project’s existing accessible dialog primitive.

Dialog panel:

- Maximum width: 1200px
- Desktop minimum width: 1000px
- Width: min(1200px, calc(100vw - 32px))
- Apply the 1000px minimum only when the viewport is large enough
- Below the desktop breakpoint, remove the minimum width and use the available viewport width
- Maximum height: calc(100dvh - 32px)
- White background
- Border: 1px solid #DFE6EF
- Border radius: exactly 32px
- The 32px radius belongs to the dialog panel only
- Do not round the overlay
- Use a subtle, soft shadow
- No heavy elevation
- No gradient
- No glassmorphism
- No beige panel
- No nested oversized cards
- No horizontal overflow

Overlay:

- Covers the complete viewport
- Square corners
- Dim the existing application without replacing it
- Use a neutral dark translucent color
- Do not blur the application heavily
- Do not apply a border radius to the overlay

The modal should remain centered.

Use a fixed header and footer only when necessary. Prefer a body that fits without internal scrolling on normal desktop screens. When scrolling is required, only the modal body should scroll. Never create nested scroll containers.

Retain or reuse the existing accessible close control. Do not add any prototype screen-switching controls.

TYPOGRAPHY

Use Product Sans.

Use the project’s existing font-loading mechanism. If Product Sans is already stored locally, load it through the existing font system or `next/font/local`.

Do not download, embed, or add a new font file without approval.

Use this fallback stack when required:

font-family: "Product Sans", "Google Sans", Arial, sans-serif;

Typography values:

- Standard interface text: 14px
- Input text: 14px
- Button labels: 14px
- Helper text: 12px
- Field labels: 11px
- Field labels are uppercase with subtle letter spacing
- Modal title: approximately 22px
- Modal subtitle: 14px
- Section title: approximately 17px
- Entity names: 14–15px
- Regular font weight throughout
- Use semibold only for primary and secondary action labels where needed
- Avoid bold headings

COLORS

Use shared tokens rather than scattering color values throughout the components.

Match these prototype values:

- Surface: #FFFFFF
- Secondary surface: #FAFBFC
- Muted surface: #F4F6F8
- Main text: #273142
- Navy heading text: #0B2D68
- Secondary text: #667085
- Muted text: #8A94A3
- Border: #DFE6EF
- Divider: #EDF1F5
- Selected background: #E9EDF3
- Selected border: #AEB9C6
- Primary button: #073F91
- Primary hover: #06377F
- Focus ring: rgba(18, 58, 117, 0.20)
- Availability indicator: #65AE89

Integrate these with the existing theme or token system.

FIELDS

All standard inputs, search fields, select triggers, password fields, and textareas must have:

- 14px border radius
- 1px solid #DFE6EF border
- White background
- 14px text
- Main text color #273142
- Placeholder color #8A94A3
- Compact proportions matching the prototype
- Standard input height: approximately 44px
- Horizontal padding: approximately 15px
- Icon size: approximately 18px
- Smooth 150–180ms interaction transitions

The fields must not be fully pill-shaped.

Textarea:

- Border radius: 14px
- Minimum height: approximately 88px
- Internal padding: approximately 13px 15px
- Resize behavior should match the existing application

Hover:

- Slightly strengthen the border
- Do not change the background significantly
- Do not add a heavy shadow

Focus:

- Use the primary border color
- Use a subtle 3px focus ring
- Preserve keyboard focus visibility

Error:

- Preserve existing validation
- Show the existing error message below the field
- Use `aria-describedby`
- Do not communicate errors through color alone

Disabled:

- Preserve readable contrast
- Use the project’s existing disabled semantics
- Use a not-allowed cursor where appropriate

BUTTONS

Action buttons may remain pill-shaped even though fields use a 14px radius.

Primary action:

- Height: approximately 44px
- Fully rounded pill shape
- Background: #073F91
- Hover: #06377F
- White text
- 14px label
- Semibold label
- Compact horizontal padding
- No gradient
- No heavy shadow

Secondary action:

- Height: approximately 44px
- Fully rounded pill shape
- White background
- Thin neutral border
- Navy or charcoal text
- Subtle near-white hover background

Icon-only buttons:

- Minimum 44px interaction area
- Accessible name
- Visible focus state
- Reuse the current icon package

LAYOUT

Desktop modal content should use the proportions from the prototype.

New consultation:

- Left column: approximately 42%
- Divider: 1px
- Right column: approximately 58%
- Column spacing: approximately 30px

New order:

- Left column: approximately 39%
- Divider: 1px
- Right column: approximately 61%
- Column spacing: approximately 28px

New user account:

- Use the compact two-column form layout from the prototype
- Keep the profile/avatar row above the form
- Use equal-width field columns where applicable

Use compact spacing:

- Modal header padding: approximately 17px 24px
- Modal body padding: approximately 20px 24px 22px
- Modal footer padding: approximately 13px 24px
- Field-group spacing: approximately 15px
- Section spacing: approximately 20–24px
- Label-to-control spacing: approximately 7px

Do not enlarge the components beyond the proportions in the supplied HTML.

SUBTLE ANIMATIONS

Add restrained modal and control animations without changing the workflow.

Opening animation:

- Overlay fades from opacity 0 to 1
- Duration: approximately 150ms
- Dialog starts at opacity 0, translateY(8px), and scale(0.985)
- Dialog ends at opacity 1, translateY(0), and scale(1)
- Duration: approximately 180–220ms
- Use a smooth ease-out curve

Closing animation:

- Reverse the opening animation
- Keep the duration approximately 140–180ms
- Do not remove the dialog from the DOM before the exit animation completes if the existing dialog primitive supports exit presence

Interactive controls:

- Border, background, opacity, and transform transitions: 150–180ms
- Selected date cards and time slots should transition gently between states
- Buttons may move down by no more than 1px on active press
- Quantity changes may use a subtle 100–150ms opacity or scale transition
- Loading indicators should fade in without shifting the layout

Do not add:

- Bouncy springs
- Large zoom effects
- Staggered field animations
- Parallax
- Decorative motion
- Continuous animation

Respect `prefers-reduced-motion`. Disable transforms and reduce transition durations when reduced motion is requested.

ACCESSIBILITY AND DIALOG BEHAVIOR

Preserve or implement:

- `role="dialog"`
- `aria-modal="true"`
- `aria-labelledby`
- `aria-describedby`
- Focus trap
- Escape-key dismissal where safe
- Focus restoration to the trigger
- Initial focus on the first useful control
- Logical keyboard order
- Accessible close-button label
- Visible keyboard focus
- Proper labels
- Accessible validation messages
- Keyboard-operable selection controls
- `aria-pressed` or `aria-selected` for date and time choices
- Announced loading and submission state
- Prevent accidental duplicate submissions

Do not close a modal while a critical submission is in progress unless that matches the current behavior.

MODAL 1: NEW CONSULTATION

Replace the existing New consultation creation modal.

Use the appointment screen from `all-modals.html` as the visual layout, while preserving the application’s existing terminology and business logic.

Header:

- Existing New consultation title
- Existing subtitle or the prototype subtitle where already approved
- Accessible close button

Left section:

Section title:

- Appointment details, or the existing equivalent wording

Fields:

1. Patient selector
   - Preserve real patient search
   - Search by the application’s existing supported fields
   - Search icon
   - Placeholder based on the prototype:
     “Search by email, username, or name”

2. Consultation type
   - Preserve real available consultation types
   - Compact select
   - Chevron icon

3. Doctor selector
   - Preserve real doctor search
   - Placeholder:
     “Search doctor by name or specialty”

4. Selected doctor card
   - Show the real avatar
   - Doctor name
   - Specialty
   - Availability status
   - Muted green availability dot
   - Existing Change action
   - Compact white card
   - Thin border
   - Approximately 17px card radius

5. Reason for visit
   - Compact textarea
   - Placeholder:
     “Add the patient’s reason for this consultation.”
   - Existing helper text

Right section:

- Section title for choosing appointment time
- Existing helper text

Calendar requirements:

- Display exactly seven compact day cards in the visible date strip
- Use one seven-column row on desktop
- Each card shows weekday, day number, and availability indicator
- Preserve existing date-navigation and availability logic
- Previous and next navigation must continue to work
- Preserve Today behavior
- Selected date uses the neutral selected state
- Disabled or unavailable dates must remain understandable

Do not include session duration.

Remove session duration entirely from:

- UI
- Summary
- Local form state added only for rendering
- Validation added only for the old UI
- Layout spacing

Do not remove or alter a required backend duration value if the application already requires one. Preserve the existing underlying default or business rule without exposing a new duration selector.

Available slots:

- Use a five-column grid on desktop
- Each time is a compact pill control
- Preserve real availability data
- Preserve disabled, past, unavailable, and loading states
- Selected time uses the neutral selected style
- Maintain keyboard selection

Appointment summary:

- Show the selected date and selected time
- Show the consultation type when it is already part of the existing flow
- Do not display session duration
- Use a compact bordered summary row

Footer:

- Cancel
- Existing consultation creation CTA
- Preserve real enabled, disabled, loading, success, and error states

USER FLOW:

1. The user opens the existing New consultation modal.
2. Focus moves into the dialog.
3. The user selects or searches for a patient.
4. The user selects a consultation type.
5. The user searches for or changes the doctor.
6. The user optionally enters a reason.
7. The user navigates the seven-day date strip.
8. The user selects one available time from the five-column slot grid.
9. The summary updates from real form state.
10. The CTA uses existing validation.
11. Submission uses the existing request and success behavior.
12. The modal closes only according to existing successful-submission behavior.

MODAL 2: NEW USER ACCOUNT

Replace the existing New user account creation modal.

Header:

- Small “CREATE RECORD” eyebrow only if already present or approved in the prototype
- New user account title
- Existing subtitle
- Accessible close control

Top row:

Left side:

- 72px circular avatar placeholder
- Real initials when no image is uploaded
- “User avatar”
- File-format and size helper
- Existing avatar upload action
- Upload icon
- Preserve existing file validation and upload behavior

Right side:

- Role field
- Preserve real role options
- Compact select with chevron

Form:

Two-column desktop grid.

Fields:

- First name
- Last name
- Email address with mail icon
- Optional phone number with phone icon

Password section:

- Full-width password field
- Lock icon
- Existing show/hide behavior
- Existing Generate password action
- Generate password stays aligned to the right on desktop
- Preserve actual password-generation logic
- Preserve existing password validation
- Preserve helper text
- Preserve actual password-strength calculation
- Use the compact segmented strength display from the prototype
- Include a readable strength label
- Do not rely on color alone

Address:

- Full-width compact textarea
- 14px radius
- Preserve existing form value and validation

Footer:

- Existing required-fields helper
- Cancel
- Create user
- Preserve real disabled, loading, error, and success behavior

USER FLOW:

1. The user opens the existing New user account modal.
2. The user may upload an avatar.
3. The user selects a real role.
4. The user completes identity and contact fields.
5. The user enters or generates a password.
6. Password visibility and strength update from the real password value.
7. The user enters an address when required by the current schema.
8. Existing validation controls the CTA.
9. The existing account-creation request is submitted.
10. Existing success, error, and modal-close behavior is preserved.

MODAL 3: NEW ORDER

Replace the existing New order creation modal.

Header:

- Existing New order or Create order title
- Existing subtitle
- Accessible close control

Left column:

Customer details section:

- Preserve real customer or patient lookup
- Search by the fields already supported by the application
- Email address
- Phone number

Payment section:

- Preserve the existing payment-status options
- Compact select
- Do not add a new payment status

Right column:

Order items section:

- Existing product search
- Search icon
- Preserve keyboard selection
- Preserve loading and empty results behavior
- Do not use static products

Selected product row:

- Real product thumbnail
- Product name
- SKU or existing metadata
- Existing quantity
- Minus button
- Quantity value
- Plus button
- Existing item price
- Accessible remove action
- Compact white row
- Thin border
- Approximately 16px card radius

Quantity stepper:

- Preserve existing minimum and maximum quantity rules
- Preserve inventory restrictions
- Preserve price recalculation
- Buttons must have accessible labels

Order summary strip:

- Real number of items
- Real subtotal
- Muted near-white background
- Compact height and spacing
- Preserve currency formatting already used by the application

Additional fields:

- Existing delivery-method select
- Existing delivery-method options
- Prescription or fulfilment note textarea
- Do not add new delivery methods

Footer:

- Cancel
- Existing review helper
- Create order
- Preserve real validation, loading, error, and success behavior

USER FLOW:

1. The user opens the existing New order modal.
2. The user searches for or selects a customer.
3. Existing customer details populate according to current behavior.
4. The user selects a payment status.
5. The user searches for real products.
6. The user adds or removes products using existing behavior.
7. The user changes quantities within existing constraints.
8. Prices and subtotal recalculate using existing logic.
9. The user selects a delivery method.
10. The user optionally adds a note.
11. Existing validation controls the Create order CTA.
12. Submission uses the existing order-creation request and success behavior.

RESPONSIVE BEHAVIOR

Desktop:

- Modal width between 1000px and 1200px
- Two-column layouts
- Seven date cards in one row
- Five available-slot columns
- Footer actions remain visible
- Avoid unnecessary internal scrolling

Tablet and smaller screens:

- Override the 1000px minimum width
- Use width calc(100vw - 24px) or the project equivalent
- Stack columns when necessary
- Allow the modal body to scroll
- Keep header and footer visible where practical
- Preserve 44px minimum touch targets
- Do not create horizontal overflow
- Date cards may scroll horizontally only when they cannot fit accessibly
- Available slots may reduce to fewer columns at smaller breakpoints
- Footer actions may become full width

Do not preserve the prototype’s forced page-level minimum width on small screens.

IMPLEMENTATION RULES

- Use TypeScript
- Avoid `any`
- Preserve client/server boundaries
- Add `"use client"` only where required
- Reuse the existing dialog primitive
- Reuse the existing form components where practical
- Reuse the existing icon library
- Reuse the existing utility for class merging or variants
- Do not add unnecessary dependencies
- Do not duplicate large class strings
- Do not rewrite business logic as component-local state
- Do not rename API fields
- Do not alter backend code
- Do not create new routes
- Do not create a prototype page
- Do not include the heading switcher from `all-modals.html`
- Do not include hardcoded doctors, patients, users, roles, products, or prices
- Do not replace working controls with visual placeholders

VERIFICATION

After implementation, run the project’s existing:

- Formatter
- ESLint command
- TypeScript type-check command
- Relevant tests
- Production build

Manually verify:

- All existing triggers open the correct redesigned modal
- Opening and closing animations work
- Reduced-motion behavior works
- Escape dismissal works where safe
- Focus is trapped
- Focus returns to the trigger
- Keyboard navigation works
- All real search controls still work
- Existing validation messages still appear
- Existing loading states still work
- Existing submissions still call the same APIs
- No duplicate submissions occur
- No modal has horizontal overflow
- The modal panel has exactly 32px corner radius
- The overlay has no rounded corners
- Fields have exactly 14px corner radius
- Standard text is 14px
- Product Sans is applied where available
- New consultation has seven date cards
- New consultation uses five columns for time slots on desktop
- Session duration is not displayed
- No heading or page switcher was introduced
- No unapproved feature was introduced
- Browser console has no new errors or warnings

DELIVERABLE

Complete the implementation rather than only describing it.

At the end, report:

- Files changed
- Existing components reused
- Shared components created
- Styling tokens added or updated
- Existing behavior preserved
- Commands run
- Lint result
- Type-check result
- Test result
- Build result
- Assumptions
- Remaining limitations

Do not make unrelated code changes.