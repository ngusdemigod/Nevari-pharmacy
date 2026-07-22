You are working inside my existing Next.js application.

Redesign and implement the “Create product” modal as a polished three-step product-creation wizard using the existing Nevari pharmacy design system.

This is an implementation task, not a conceptual redesign. Match the supplied redesign screenshots and the reference HTML as closely as possible. Preserve the existing app architecture, APIs, form conventions, and product data model where they already exist.

The finished modal must include:

1. Product identity
2. Prescription and description
3. Media
4. A persistent live product preview
5. Save-draft, back, continue, and publish actions
6. Responsive desktop, tablet, and mobile layouts
7. Accessible keyboard and focus behavior

Do not replace the design with generic shadcn, Material UI, Bootstrap, or Tailwind defaults.

==================================================
1. INSPECT THE PROJECT FIRST
==================================================

Before changing code:

- Inspect package.json.
- Determine whether the project uses the App Router or Pages Router.
- Determine whether the project uses TypeScript.
- Identify the current modal/dialog implementation.
- Locate the current Create Product flow.
- Locate the existing product creation API.
- Locate the product form schema and validation rules.
- Identify the existing icon library.
- Identify the existing design tokens and font configuration.
- Reuse existing form, button, dialog, toast, and file-upload utilities where they can be visually overridden.
- Do not install new dependencies unless the existing project has no suitable equivalent.

Use the project’s existing form and data libraries when available. For example, reuse React Hook Form, Zod, TanStack Query, or the project’s API client if they are already installed.

==================================================
2. PRIMARY OBJECTIVE
==================================================

Replace the current Create Product modal with one cohesive wizard.

The modal should feel like part of the existing Nevari Product Editor design language:

- Soft ivory modal surface
- Deep navy typography and actions
- Fine blue-gray borders
- Large but controlled radii
- Low-contrast shadows
- Blurred dashboard backdrop
- Dense but readable pharmacy administration UI
- Internal scrolling
- Fixed modal header and footer
- Persistent right-side preview

Do not create three independent modals or three separate routes. Use one modal and maintain the form state while the user moves between steps.

==================================================
3. RECOMMENDED COMPONENT API
==================================================

Create a reusable component similar to:

type CreateProductModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<CreateProductValues>;
  onSaveDraft?: (
    values: CreateProductValues
  ) => Promise<void> | void;
  onPublish?: (
    values: CreateProductValues
  ) => Promise<void> | void;
};

Suggested form model:

type CreateProductValues = {
  name: string;
  sku?: string;
  categoryId: string;
  tags: string[];
  shortDescription: string;
  unitPrice: string;
  salePrice: string;
  stockQuantity: number | "";
  expiryDate: string;
  weight: string;
  shippingClass: string;
  longDescription: string;
  prescriptionNote: string;
  prescriptionRule: string;
  featuredImage: File | null;
  galleryImages: File[];
};

Adapt this type to the existing backend schema rather than duplicating server models.

==================================================
4. MODAL OVERLAY
==================================================

Render the dialog through a portal to document.body when appropriate.

Backdrop:

position: fixed;
inset: 0;
z-index: 90;
display: grid;
place-items: center;
padding: 20px;

background: rgba(6, 27, 63, 0.38);
backdrop-filter: blur(6px);
-webkit-backdrop-filter: blur(6px);

The underlying dashboard must remain visible but muted and blurred.

Open animation:

- Backdrop opacity from 0 to 1
- Modal translateY from 12px to 0
- Duration: 180–200ms
- Timing: ease
- Respect prefers-reduced-motion

While open:

- Lock document body scrolling.
- Do not allow the underlying page to receive pointer events.
- Trap focus within the modal.
- Close on Escape.
- Close through the X button.
- Close when clicking directly on the backdrop.
- Do not close when clicking inside the modal.
- Restore focus to the trigger after closing.

==================================================
5. DESIGN TOKENS
==================================================

Use the existing project tokens when their values match. Otherwise scope these variables to the modal:

--primary: #0A2A5E;
--primary-900: #061B3F;
--primary-800: #082651;
--primary-700: #11396F;
--primary-100: #E8EEF7;
--primary-50: #F4F7FB;

--accent: #E3D7C6;
--accent-900: #4B3D2B;
--accent-100: #F4EEE6;
--accent-50: #FBF8F3;

--success: #1F8A5B;
--success-bg: #DDF4E8;

--danger: #B23B3B;
--danger-bg: #FCE3E3;

--ink: #102039;
--muted: #667085;
--subtle: #98A2B3;

--line: rgba(10, 42, 94, 0.12);
--line-strong: rgba(10, 42, 94, 0.22);

--white: #FFFFFF;
--modal-surface: #FBFAF7;
--surface: rgba(255, 255, 255, 0.86);
--surface-soft: rgba(255, 255, 255, 0.68);

--shadow-xs: 0 6px 14px rgba(10, 42, 94, 0.07);
--shadow-sm: 0 12px 28px rgba(10, 42, 94, 0.10);
--shadow-modal: 0 26px 70px rgba(6, 27, 63, 0.24);
--inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.72);

--pill: 999px;

Font stack:

Inter, Manrope, "Product Sans", ui-sans-serif, system-ui,
-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

Apply:

-webkit-font-smoothing: antialiased;
text-rendering: optimizeLegibility;

Use controlled font weights. Avoid excessively bold text.

==================================================
6. OUTER MODAL FRAME
==================================================

Desktop modal:

width: min(1320px, calc(100vw - 40px));
height: min(850px, calc(100dvh - 40px));
max-height: min(850px, calc(100dvh - 40px));

display: flex;
flex-direction: column;
overflow: hidden;

border-radius: 30px;
border: 1px solid rgba(255, 255, 255, 0.80);
background: #FBFAF7;

box-shadow:
  0 26px 70px rgba(6, 27, 63, 0.24),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

The modal must remain centered and must not allow its header or footer to scroll out of view.

==================================================
7. MODAL HEADER
==================================================

Header content:

Title:
Create product

Subtitle:
Add a medicine or pharmacy product with image, stock, pricing and catalogue details.

Header styles:

flex: 0 0 auto;
display: flex;
justify-content: space-between;
align-items: flex-start;
gap: 18px;

padding: 22px 28px 19px;
border-bottom: 1px solid rgba(10, 42, 94, 0.10);
background: rgba(251, 250, 247, 0.97);
backdrop-filter: blur(14px);

Title:

margin: 0;
color: #0A2A5E;
font-size: 21px;
line-height: 1.2;
font-weight: 650;
letter-spacing: -0.045em;

Subtitle:

margin: 5px 0 0;
color: #667085;
font-size: 11.5px;
line-height: 1.45;
font-weight: 400;

Close button:

width: 42px;
height: 42px;
flex: 0 0 42px;

display: grid;
place-items: center;

border: 1px solid rgba(10, 42, 94, 0.12);
border-radius: 50%;
background: rgba(255, 255, 255, 0.56);
color: #0A2A5E;

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Use an outlined X icon approximately 19px square with a 1.8px stroke.

Hover:

- Translate upward by no more than 1px
- Background becomes white
- Border becomes rgba(10, 42, 94, 0.22)

==================================================
8. MODAL BODY
==================================================

The modal body must occupy the remaining height:

flex: 1 1 auto;
min-height: 0;
padding: 20px 28px;
overflow: hidden;

background:
  linear-gradient(180deg, #FFFFFF, #FBF8F3);

Inside it, create the main layout:

height: 100%;
min-height: 0;
display: grid;
grid-template-columns: minmax(0, 1fr) 310px;
gap: 18px;
align-items: stretch;

The left side is the wizard form. The right side is the persistent preview.

Both main panels:

min-width: 0;
min-height: 0;
border: 1px solid rgba(10, 42, 94, 0.10);
border-radius: 24px;
background: rgba(255, 255, 255, 0.82);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
overflow: hidden;

Do not apply strong shadows to these inner panels.

==================================================
9. LEFT WIZARD PANEL
==================================================

The left panel must use:

display: flex;
flex-direction: column;
min-height: 0;

It contains:

1. A fixed step selector at the top
2. A vertically scrollable active-step area below it

Only the active step content scrolls. The step selector must stay visible.

Scrollable step area:

flex: 1 1 auto;
min-height: 0;
overflow-y: auto;
overscroll-behavior: contain;
padding: 6px 20px 22px;

Scrollbar:

scrollbar-width: thin;
scrollbar-color: rgba(10, 42, 94, 0.22) transparent;

WebKit:

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(10, 42, 94, 0.18);
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.90);
}

When changing steps, reset this area’s scrollTop to 0.

==================================================
10. STEP SELECTOR
==================================================

Create three equal-width step cards:

1. Step 1 — Product identity
2. Step 2 — Prescription and description
3. Step 3 — Media

Stepper container:

display: grid;
grid-template-columns: repeat(3, minmax(0, 1fr));
gap: 10px;
padding: 18px 18px 14px;

Each step button:

min-height: 58px;
padding: 10px 13px;

display: grid;
align-content: center;
gap: 2px;
text-align: left;

border: 1px solid transparent;
border-radius: 16px;
background: rgba(16, 32, 57, 0.065);
color: #0A2A5E;

Step number:

font-size: 9.5px;
line-height: 1.15;
font-weight: 560;
color: #667085;

Step title:

font-size: 11.5px;
line-height: 1.25;
font-weight: 640;
letter-spacing: -0.02em;

Active step:

background: #F4F7FB;
border-color: rgba(10, 42, 94, 0.16);

box-shadow:
  inset 0 -2px 0 #0A2A5E,
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Completed step:

background: rgba(31, 138, 91, 0.08);
border-color: rgba(31, 138, 91, 0.13);

Show a small success check beside the completed step number.

Hover may move the card upward by only 1px.

Do not use a conventional numbered circle stepper or a connecting progress line.

==================================================
11. SHARED STEP HEADING
==================================================

Every step begins with:

- Uppercase eyebrow
- Icon and title row
- Supporting description

Eyebrow:

margin: 0 0 9px;
color: #667085;
font-size: 10px;
line-height: 1.2;
font-weight: 700;
letter-spacing: 0.035em;
text-transform: uppercase;

Section title:

display: flex;
align-items: center;
gap: 9px;

margin: 0;
color: #0A2A5E;
font-size: 13px;
line-height: 1.25;
font-weight: 650;
letter-spacing: -0.02em;

Title icon:

width: 18px;
height: 18px;
stroke-width: 1.8;

Supporting copy:

margin: 15px 0 0;
color: #102039;
font-size: 13px;
line-height: 1.5;

==================================================
12. SHARED FORM STYLES
==================================================

Field labels:

display: block;
margin-bottom: 7px;
color: #667085;
font-size: 10px;
line-height: 1.2;
font-weight: 690;
letter-spacing: 0.025em;
text-transform: uppercase;

Text input, select, and textarea:

width: 100%;
min-height: 42px;

border: 1px solid rgba(10, 42, 94, 0.13);
border-radius: 14px;
background: rgba(255, 255, 255, 0.88);
color: #0A2A5E;

padding: 0 13px;
outline: none;

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

font-size: 12px;
font-weight: 430;

Placeholder:

color: #7B8492;
opacity: 1;

Focus state:

border-color: rgba(10, 42, 94, 0.38);

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72),
  0 0 0 3px rgba(44, 110, 183, 0.10);

background: #FFFFFF;

Readonly inputs:

background: rgba(10, 42, 94, 0.025);
color: #0A2A5E;

Textarea:

min-height: 118px;
padding: 12px 13px;
line-height: 1.55;
resize: vertical;

Tall textarea:

min-height: 150px;

Helper text:

margin: 6px 0 0;
color: #667085;
font-size: 10px;
line-height: 1.45;
font-weight: 520;

Form grid:

display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 14px;
margin-top: 6px;

Three-column grid:

grid-template-columns:
  repeat(3, minmax(0, 1fr));

Full-width fields span all columns.

==================================================
13. STEP 1 — PRODUCT IDENTITY
==================================================

Heading:

Eyebrow:
STEP 1

Title:
Product identity

Description:
Define what the product is, where it belongs, and how it is priced.

Fields and order:

Row 1:

Product name
- Editable
- Placeholder: e.g. Loratadine 10mg
- Required

SKU
- Readonly
- Value before server creation:
  Generated securely by the server
- Helper:
  This is generated server-side after save or publish.

Row 2:

Category assignment
- Select
- Initial option: Select category
- Load real categories from the project API when available

Example options:
- Allergy & Cold
- Antibiotics
- Pain Relief
- Vitamins & Supplements
- Respiratory

Tags assignment
- Select plus an Add tag button
- Initial option: Select tag
- Added tags appear as removable chips below the control
- Do not allow duplicates
- Helper when empty:
  Selected tags will appear here.

Example tags:
- Allergy
- Antihistamine
- Non-drowsy
- Tablet
- Prescription

Row 3:

Short description
- Full width
- Maximum 160 characters
- Placeholder:
  Add a short customer friendly description
- Show a live “current/160” character counter below

Below that, use a three-column grid for:

- Unit price
- Sales price
- Stock quantity
- Expiry date
- Weight
- Shipping class

Unit price:

- Currency prefix: NGN
- Placeholder: 0.00

Sales price:

- Currency prefix: NGN
- Placeholder: Leave empty

Stock quantity:

- Number input
- Minimum: 0
- Placeholder: 0

Expiry date:

- Date input

Weight:

- Placeholder: e.g. 0.08 kg

Shipping class options:

- Standard pharmacy item
- Cold chain
- Fragile

Currency control:

display: grid;
grid-template-columns: 56px minmax(0, 1fr);
min-height: 42px;

border: 1px solid rgba(10, 42, 94, 0.13);
border-radius: 14px;
overflow: hidden;
background: rgba(255, 255, 255, 0.88);

The NGN prefix has:

- A right divider
- A subtle tinted background
- Font size 10.5px
- Font weight 580
- Navy text

==================================================
14. STEP 2 — PRESCRIPTION AND DESCRIPTION
==================================================

Heading:

Eyebrow:
STEP 2

Title:
Prescription and description

Description:
Set the patient-facing copy and the prescription note for the product.

Use a single-column layout.

Fields:

Long description

Placeholder:
Add complete product information, dosage context and customer guidance.

Helper:
Optional. Use this for extended product details.

Use the tall textarea style with approximately 150px minimum height.

Prescription note

Placeholder:
Add pharmacy workflow or prescription guidance.

Helper:
These notes are persisted by the server and can be used in downstream pharmacy workflows.

Prescription rule

Options:

- No prescription needed
- Prescription required
- Pharmacist review required

Maintain values entered in Step 1 while this screen is active.

==================================================
15. STEP 3 — MEDIA
==================================================

Heading:

Eyebrow:
STEP 3

Title:
Media

Description:
Upload the featured image and gallery that will follow the product everywhere.

Create two upload cards.

Shared upload card:

padding: 18px;
border: 1px solid rgba(10, 42, 94, 0.10);
border-radius: 22px;
background: rgba(255, 255, 255, 0.70);

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Card title:

font-size: 14px;
font-weight: 650;
letter-spacing: -0.025em;
color: #0A2A5E;

Card description:

margin-top: 5px;
font-size: 11.5px;
line-height: 1.45;
color: #667085;

Featured image card:

Title:
Featured image

Description:
The first image becomes the primary storefront thumbnail.

Upload zone:

min-height: 190px;
margin-top: 14px;
padding: 18px;

display: grid;
place-items: center;

border: 1px dashed rgba(10, 42, 94, 0.28);
border-radius: 20px;

background:
  linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.76),
    rgba(244, 238, 230, 0.64)
  );

Empty-state icon container:

width: 70px;
height: 70px;
border-radius: 22px;
background: rgba(16, 32, 57, 0.065);
color: #0A2A5E;

Below the zone:

- Upload button
- Helper/file name

Initial helper:
PNG or JPG, up to 10MB.

Product gallery card:

Title:
Product gallery

Description:
Upload the additional images patients will see inside the catalogue.

Use a compact upload zone with approximately 130px minimum height.

Action:
Add images

Initial helper:
No gallery images selected.

Uploads must:

- Accept PNG and JPEG
- Limit every image to 10MB
- Support one featured image
- Support multiple gallery images
- Display a local preview after selection
- Replace the featured-image placeholder with the image
- Update the right-side product preview image
- Display the selected filename or gallery image count
- Show a validation toast for unsupported or oversized files
- Revoke temporary object URLs when they are no longer needed

==================================================
16. LIVE PRODUCT PREVIEW
==================================================

The right preview remains visible on every step.

Preview panel:

padding: 20px;
display: flex;
flex-direction: column;
gap: 14px;
overflow-y: auto;

The preview updates live as the form changes.

Preview image/icon:

width: 72px;
height: 72px;
border-radius: 22px;

display: grid;
place-items: center;
overflow: hidden;

background:
  linear-gradient(
    145deg,
    rgba(16, 32, 57, 0.065),
    #FBF8F3
  );

border: 1px solid rgba(10, 42, 94, 0.06);

box-shadow:
  5px 5px 0 rgba(227, 215, 198, 0.34),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Use a simple outlined product icon until a featured image is selected.

Product name:

Initial text:
Product name

Styles:

margin: 1px 0 0;
color: #0A2A5E;
font-size: 22px;
line-height: 1.15;
font-weight: 650;
letter-spacing: -0.045em;
overflow-wrap: anywhere;

Category:

Initial text:
Choose a category

Styles:

margin: 2px 0 4px;
color: #667085;
font-size: 13px;

Summary rows:

- SKU — Server generated
- Price — NGN 0.00
- Sale — No sale price
- Stock — 0

Each row:

min-height: 43px;
padding: 0 12px;

display: flex;
align-items: center;
justify-content: space-between;
gap: 12px;

border: 1px solid rgba(10, 42, 94, 0.10);
border-radius: 16px;
background: rgba(255, 255, 255, 0.68);

Label:

color: #667085;
font-size: 10.5px;

Value:

color: #0A2A5E;
font-size: 10.5px;
font-weight: 650;
text-align: right;

Prescription preview card:

background: #F4F7FB;
border: 1px solid rgba(10, 42, 94, 0.10);
border-radius: 18px;
padding: 14px;

Heading:
Prescription note

Empty text:
Add prescription notes to preview them here.

Description preview:

Heading:
Description preview

Empty text:
Add a short description to preview patient-facing summary copy.

Live updates:

- Product name updates as the user types
- Category updates after selection
- Price is formatted as NGN with two decimal places
- Sale displays “No sale price” while empty
- Stock falls back to 0
- Prescription note updates from Step 2
- Description preview updates from the short description
- Featured image updates after upload

Do not reset the preview when changing steps.

==================================================
17. MODAL FOOTER
==================================================

Footer:

flex: 0 0 auto;
min-height: 76px;

display: flex;
align-items: center;
justify-content: flex-end;
gap: 10px;

padding: 14px 28px 18px;

border-top:
  1px solid rgba(10, 42, 94, 0.10);

background:
  rgba(251, 250, 247, 0.97);

backdrop-filter: blur(14px);

Add a subtle horizontal divider that fills the unused area before the buttons:

flex: 1;
height: 1px;
background: rgba(10, 42, 94, 0.08);
margin-right: 6px;

Button order by step:

Step 1:

- Save draft
- Continue

Step 2:

- Go back
- Save draft
- Continue

Step 3:

- Go back
- Save draft
- Publish

Buttons:

min-height: 39px;
padding: 0 17px;

display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;

border-radius: 999px;
font-size: 11.5px;
font-weight: 620;
white-space: nowrap;

Outline buttons:

border: 1px solid rgba(10, 42, 94, 0.12);
color: #0A2A5E;
background: rgba(255, 255, 255, 0.58);

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Primary button:

min-width: 142px;
border: 0;
background: #0A2A5E;
color: #FFFFFF;

box-shadow:
  0 12px 24px rgba(10, 42, 94, 0.18);

Primary hover:

background: #11396F;

All button hover movement must be no more than translateY(-1px).

Show a same-size loading state while draft or publish requests are running.

==================================================
18. USER FLOW
==================================================

Opening:

1. User clicks “Create product”.
2. Modal opens at Step 1.
3. Focus moves to the Product name field.
4. Product preview displays default placeholder values.

Step 1:

1. User enters product identity, classification, pricing, stock, and shipping data.
2. Preview updates continuously.
3. User may add and remove tags.
4. Short-description counter updates live.
5. Clicking Continue validates the minimum Step 1 requirements.
6. When valid, Step 1 becomes completed and Step 2 opens.
7. The internal form scroll returns to the top.

Step 2:

1. User enters the long description.
2. User enters the internal prescription note.
3. User selects the prescription rule.
4. Preview prescription content updates live.
5. Go back returns to Step 1 without losing data.
6. Continue opens Step 3.

Step 3:

1. User selects a featured image.
2. The image appears in the upload zone and preview panel.
3. User may add multiple gallery images.
4. Invalid files show an error toast and are rejected.
5. Go back returns to Step 2 without losing selected files where browser limitations permit.
6. Publish validates the complete product.

Save draft:

- Available on every step.
- Saves the current form values without changing the active step.
- Use the existing draft API where available.
- Show a non-blocking success toast:
  - Title: Draft saved
  - Message: Your product information is preserved.
- On failure, show an error toast and keep the modal open.

Publish:

- Replace “Continue” with “Publish” on Step 3.
- Validate all required publishing fields.
- Send the form through the existing product creation API.
- Preserve the current button dimensions while loading.
- Prevent duplicate submissions.
- On success:
  - Show a success toast
  - Invalidate or refresh the product list
  - Close the modal
  - Reset the form only after the API succeeds
- On failure:
  - Keep the modal open
  - Preserve all data
  - Display the server error near the relevant field or through a toast

Closing:

- X, Escape, or backdrop click requests closure.
- When the form is pristine, close immediately.
- When the form contains unsaved changes, use the project’s existing unsaved-change confirmation pattern.
- Do not silently discard entered data when the application already has a confirmation convention.

Direct step navigation:

- Completed steps may always be revisited.
- The user may click the current step.
- Do not allow skipping forward past invalid required steps unless the existing product flow intentionally permits it.
- Preserve all field values and uploads while navigating.

==================================================
19. VALIDATION
==================================================

Use the project’s existing validation schema when available.

At minimum:

Before leaving Step 1:

- Product name is required
- Category is required if required by the backend
- Unit price must be a valid non-negative number
- Sale price, when entered, must be a valid non-negative number
- Sale price should not exceed unit price unless the existing business rules allow it
- Stock quantity cannot be negative
- Short description cannot exceed 160 characters

Before publishing:

- Validate all required backend fields
- Validate prescription rule
- Validate featured image if publishing requires one
- Validate every uploaded file:
  - image/png or image/jpeg
  - 10MB maximum per file

Error behavior:

- Focus the first invalid field
- Display concise inline error text below it
- Do not use browser alert()
- Do not clear valid fields
- Preserve the active step containing the error

==================================================
20. TOASTS
==================================================

Toast position:

position: fixed;
right: 24px;
bottom: 24px;
z-index above the modal;

width:
  min(340px, calc(100vw - 48px));

padding: 14px;
border: 1px solid rgba(10, 42, 94, 0.12);
border-radius: 20px;
background: rgba(255, 255, 255, 0.94);

box-shadow:
  0 12px 28px rgba(10, 42, 94, 0.10),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Use a 34px circular status icon.

Success uses:

- Icon background: #1F8A5B
- White check icon

Toast examples:

Draft saved
Your product information is preserved.

Product published
The new catalogue product is ready for review.

Product name required
Add a product name before continuing.

Image not accepted
Use PNG or JPG files no larger than 10MB each.

Use role="status" and aria-live="polite".

==================================================
21. ACCESSIBILITY
==================================================

The modal must include:

role="dialog"
aria-modal="true"
aria-labelledby
aria-describedby

Also implement:

- Focus trap
- Escape-to-close
- Trigger focus restoration
- Visible keyboard focus styles
- Semantic form labels
- Accessible upload labels
- aria-current="step" on the active step
- Status announcements for save and publish results
- Accessible tag removal buttons
- No icon-only button without an aria-label
- No color-only indication for active or completed states

Do not hide actual modal content from screen readers.

==================================================
22. RESPONSIVE BEHAVIOR
==================================================

At widths below 1080px:

- Modal width becomes:
  min(940px, calc(100vw - 28px))
- Preview width becomes approximately 270px
- Three-column form grids become two columns

At widths below 820px:

Overlay:

padding: 10px;
align-items: start;

Modal:

width: calc(100vw - 20px);
height: calc(100dvh - 20px);
max-height: none;
border-radius: 24px;

Header:

padding: 18px;

Body:

padding: 14px;
overflow-y: auto;

Main layout:

grid-template-columns: 1fr;
height: auto;

The preview moves below the form.

Form grids:

grid-template-columns: 1fr;

Stepper:

- Horizontally scrollable
- Three cards remain in one row
- Each card has a minimum width around 190px

Footer:

padding: 14px 18px 18px;
flex-wrap: wrap;

Hide the decorative footer line.

The primary button may expand to fill the remaining width.

At widths below 540px:

- Modal title becomes 19px
- Step content horizontal padding becomes 14px
- Preview padding becomes 16px
- Footer buttons may share available width
- Primary action occupies a full row
- Preserve at least 39px button height
- Do not reduce body text below 10px

==================================================
23. IMPLEMENTATION RESTRICTIONS
==================================================

Do not:

- Create a full-page form instead of a modal
- Create separate modal instances for each step
- Reset values when switching steps
- Allow the entire modal frame to scroll
- Hide the live preview on desktop
- Use a dark or saturated preview card
- Use generic card shadows
- Use black text
- Use sharp corners
- Use pill-shaped form fields
- Use oversized headings
- Use a vertical stepper on desktop
- Add a progress bar not shown in the redesign
- Replace the step cards with circles
- Add unnecessary illustrations
- Add an arbitrary product image to the empty state
- Use random colors outside the Nevari palette
- use browser alerts
- publish before validation succeeds
- discard state after a failed API request

==================================================
24. FILE STRUCTURE
==================================================

Follow the project’s established structure.

A reasonable component split is:

CreateProductModal
CreateProductStepper
ProductIdentityStep
PrescriptionDescriptionStep
ProductMediaStep
ProductLivePreview
ProductUploadField
CreateProductFooter

Avoid excessive component fragmentation. Small visual wrappers do not each need their own file.

Keep state in one parent form context so every step and the preview use the same source of truth.

==================================================
25. TESTING AND VERIFICATION
==================================================

After implementation:

1. Run formatting.
2. Run linting.
3. Run TypeScript checking.
4. Run unit or component tests.
5. Run the production build.
6. Open the modal in the browser.
7. Test every step.
8. Test back and forward navigation.
9. Test direct completed-step navigation.
10. Test draft saving.
11. Test publishing.
12. Test validation failure.
13. Test featured-image preview.
14. Test multiple gallery images.
15. Test invalid file type.
16. Test a file larger than 10MB.
17. Test Escape closing.
18. Test backdrop closing.
19. Test focus trapping.
20. Test the layout at desktop, tablet, and phone widths.

Capture screenshots at:

- 1728 × 920
- 1280 × 800
- 768 × 900
- 390 × 844

At the desktop viewport, verify that:

- The modal is centered.
- Header and footer are fixed.
- The left step content scrolls independently.
- The preview remains visible.
- The step selector remains fixed.
- The form and preview panel heights align.
- Fields use 42px minimum height.
- Inner panels use 24px radii.
- Modal uses a 30px radius.
- The navy, ivory, and blue-gray palette matches the supplied redesign.
- There are no hydration warnings.
- There are no console errors.
- There is no horizontal overflow.

Make at least one visual comparison and refinement pass before considering the implementation complete.

==================================================
26. FINAL RESPONSE
==================================================

When finished, report:

- Files created
- Files modified
- Existing APIs or components reused
- Validation implemented
- User flow implemented
- Commands run
- Lint result
- Typecheck result
- Test result
- Production build result
- Any remaining visual differences