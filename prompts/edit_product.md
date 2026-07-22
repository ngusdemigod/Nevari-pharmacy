You are working inside my existing Next.js application.

Your task is to implement the Product Editor modal shown in the attached reference screenshot with extremely high visual fidelity. This is not a redesign. Reproduce the screenshot as closely as possible, including dimensions, spacing, typography, borders, colors, blur, scrollbar, field heights, sticky regions, and responsive behavior.

Do not stop at a rough approximation.

==================================================
1. FIRST INSPECT THE EXISTING PROJECT
==================================================

Before editing:

1. Inspect package.json and determine:
   - App Router or Pages Router
   - TypeScript or JavaScript
   - Existing styling approach
   - Existing icon package
   - Existing modal/dialog primitives
   - Existing product or inventory page
   - Existing design tokens and font setup

2. Follow the project’s established file structure and conventions.

3. Do not install another UI framework unless absolutely necessary.

4. Do not use the default visual styling of shadcn, Material UI, Bootstrap, Headless UI, Radix, or another component library. A library may provide accessibility behavior, but every visible pixel must be overridden to match this specification.

5. Prefer a CSS Module or the project’s existing CSS system with exact pixel values. Do not rely on approximate Tailwind presets such as rounded-xl, p-6, shadow-lg, or text-sm when their computed values differ from the specification.

6. Reuse the existing application page behind the modal. Do not replace the background with a solid page. The open modal must darken and blur the real underlying dashboard.

==================================================
2. COMPONENT DELIVERABLE
==================================================

Create a reusable component equivalent to:

ProductEditorModal

Suggested API:

type ProductEditorModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductEditorData;
  onSave?: (product: ProductEditorData) => void | Promise<void>;
  onDelete?: (product: ProductEditorData) => void | Promise<void>;
};

The component must:

- Render through a portal to document.body when appropriate.
- Be fully client-side when using the Next.js App Router.
- Avoid hydration errors.
- Lock body scrolling while open.
- Restore body scrolling when closed.
- Close with:
  - The top-right X button
  - The Cancel button
  - Escape
  - Clicking directly on the backdrop
- Do not close when clicking inside the dialog.
- Trap focus inside the modal.
- Focus the close button when opened.
- Restore focus to the trigger when closed.
- Use role="dialog" and aria-modal="true".
- Use correctly connected aria-labelledby and aria-describedby attributes.
- Support the three functional tabs.
- Keep the header and footer visible while only the center body scrolls.

Integrate it into the existing product edit action. If the project does not yet have a product page, create a minimal preview route for testing while keeping the modal reusable.

==================================================
3. REFERENCE VIEWPORT AND GEOMETRY
==================================================

The baseline screenshot viewport is:

- Width: 1896px
- Height: 952px

At this viewport, the modal should resolve to approximately:

- Left: 364px
- Top: 96px
- Width: 1168px
- Height: 760px
- Border radius: 30px

Use:

width: min(1168px, calc(100vw - 32px));
height: min(760px, calc(100dvh - 40px));
max-height: min(760px, calc(100dvh - 40px));

The modal must be mathematically centered horizontally and vertically.

Use border-box sizing everywhere.

==================================================
4. DESIGN TOKENS
==================================================

Use these exact design tokens for this component:

--primary: #0A2A5E;
--primary-900: #061B3F;
--primary-800: #082651;
--primary-700: #11396F;
--primary-100: #E8EEF7;
--primary-50: #F4F7FB;

--accent: #E3D7C6;
--accent-900: #4B3D2B;
--accent-700: #8E7656;
--accent-500: #CBB89E;
--accent-100: #F4EEE6;
--accent-50: #FBF8F3;

--danger: #B23B3B;
--danger-bg: #FCE3E3;

--info: #2C6EB7;
--info-bg: #E2EFFC;

--ink: #102039;
--muted: #667085;
--subtle: #98A2B3;

--line: rgba(10, 42, 94, 0.12);
--line-strong: rgba(10, 42, 94, 0.22);

--modal-surface: #FBFAF7;
--white: #FFFFFF;

--inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.72);
--shadow-sm: 0 12px 28px rgba(10, 42, 94, 0.10);

Font stack:

Inter, Manrope, "Product Sans", ui-sans-serif, system-ui,
-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

Use the project’s existing Inter setup when available. Do not substitute a visibly different font.

Apply:

-webkit-font-smoothing: antialiased;
text-rendering: optimizeLegibility;

==================================================
5. BACKDROP
==================================================

The full-screen overlay must use:

position: fixed;
inset: 0;
z-index: 90;
display: grid;
place-items: center;
padding: 20px;

background: rgba(6, 27, 63, 0.38);
backdrop-filter: blur(6px);
-webkit-backdrop-filter: blur(6px);

The dashboard behind the overlay must remain visible but appear muted, cool gray-blue, and blurred as in the screenshot.

Open/close transition:

- Opacity: 200ms ease
- Dialog translateY from 12px to 0
- Respect prefers-reduced-motion

Do not leave the dialog partially transparent once the animation has completed.

==================================================
6. OUTER MODAL FRAME
==================================================

Modal frame:

display: flex;
flex-direction: column;
overflow: hidden;
padding: 0;

width: min(1168px, calc(100vw - 32px));
height: min(760px, calc(100dvh - 40px));
max-height: min(760px, calc(100dvh - 40px));

border-radius: 30px;
background: #FBFAF7;
border: 1px solid rgba(255, 255, 255, 0.78);

box-shadow:
  0 12px 28px rgba(10, 42, 94, 0.10),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

The frame must not have an extra wrapper margin or padding.

==================================================
7. HEADER
==================================================

The header occupies the full width and stays fixed while the body scrolls.

Styles:

position: relative;
flex: 0 0 auto;
padding: 22px 26px 18px;
border-bottom: 1px solid rgba(10, 42, 94, 0.10);
background: rgba(251, 250, 247, 0.96);
backdrop-filter: blur(12px);
border-radius: 30px 30px 0 0;

Layout:

display: flex;
align-items: flex-start;
justify-content: space-between;
gap: 16px;

Header copy must be exactly:

Title:
Loratadine 10mg

Eyebrow:
PRODUCT EDITOR

Description:
Edit product media, details, pricing, tags, inventory and publishing state without leaving the pharmacy dashboard.

Copy order is visually:

1. Main title
2. Uppercase eyebrow
3. Description

Title styling:

- Color: #0A2A5E
- Font size: 19px
- Line height: 1.2
- Font weight: 600
- Letter spacing: -0.035em
- Margin: 0

Eyebrow styling:

- Display: block
- Margin-top: 3px
- Margin-bottom: 2px
- Color: #667085
- Font size: 10px
- Line height: approximately 1.25
- Font weight: 680
- Letter spacing: 0.04em
- Text transform: uppercase

Description styling:

- Margin: 0
- Color: #667085
- Font size: 11px
- Line height: 1.45
- Font weight: 400

Close button:

- Width: 39px
- Height: 39px
- Flex: 0 0 39px
- Circular: border-radius 999px
- Background: rgba(255, 255, 255, 0.48)
- Border: 1px solid rgba(10, 42, 94, 0.12)
- Color: #0A2A5E
- Box shadow: inset 0 1px 0 rgba(255,255,255,0.72)
- Icon: simple X
- Icon dimensions: 18px × 18px
- Icon stroke width: approximately 1.85
- Center the icon exactly
- Do not use a filled X icon
- Right edge must align 26px from the frame’s inner edge

==================================================
8. SCROLLABLE MODAL BODY
==================================================

Body:

flex: 1 1 auto;
min-height: 0;
overflow-y: auto;
overflow-x: hidden;
overscroll-behavior: contain;
padding: 0;
background: linear-gradient(180deg, #FFFFFF, #FBF8F3);

The body, not the whole modal, must own the scrollbar.

Scrollbar:

scrollbar-width: thin;
scrollbar-color: rgba(10, 42, 94, 0.22) transparent;

For WebKit:

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(10, 42, 94, 0.18);
  border-radius: 999px;
  border: 2px solid rgba(251, 248, 243, 0.95);
}

==================================================
9. BODY INNER SHELL
==================================================

Inside the scroll area create one inner shell:

padding: 20px;
display: grid;
gap: 16px;

Main desktop grid:

display: grid;
grid-template-columns: 380px minmax(0, 1fr);
gap: 16px;
align-items: start;

At the 1896px reference viewport:

- Left media card width: exactly 380px
- Gap between cards: exactly 16px
- Right form card fills all remaining width

Both visible cards should visually end at approximately the same vertical position.

==================================================
10. SHARED PANEL STYLING
==================================================

Both cards use:

border: 1px solid rgba(10, 42, 94, 0.10);
border-radius: 24px;
background: rgba(255, 255, 255, 0.82);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
overflow: hidden;

Do not add a strong drop shadow to the inner cards.

The cards should look almost white with a very subtle blue-gray outline.

==================================================
11. LEFT MEDIA GALLERY CARD
==================================================

Card:

min-height: 560px;
display: grid;
grid-template-rows: auto 1fr auto;

Panel header:

padding: 14px 16px;
display: flex;
justify-content: space-between;
align-items: center;
gap: 12px;
border-bottom: 1px solid rgba(10, 42, 94, 0.08);
background: rgba(255, 255, 255, 0.76);

Header label:

MEDIA GALLERY

Styles:

- Margin: 0
- Font size: 12px
- Font weight: 640
- Text transform: uppercase
- Letter spacing: 0.015em
- Color: #667085

Image-count chip:

Text:
1 image

Styles:

display: inline-flex;
align-items: center;
gap: 7px;
min-height: 26px;
padding: 0 10px;
border-radius: 999px;

font-size: 11px;
font-weight: 550;
color: #2C6EB7;
background: #E2EFFC;
border: 1px solid rgba(44, 110, 183, 0.22);

Add a circular dot before the text:

width: 7px;
height: 7px;
border-radius: 50%;
background: currentColor;

Product image area:

margin: 0 12px;
min-height: 360px;
border-radius: 16px;
border: 1px solid #0A2A5E;
position: relative;
overflow: hidden;

The screenshot does not show a clear product photograph. Match the screenshot using layered CSS gradients rather than inserting a random medicine image:

background:
  radial-gradient(
    circle at 38% 22%,
    rgba(255, 255, 255, 0.85) 0 16%,
    transparent 17%
  ),
  linear-gradient(
    145deg,
    rgba(10, 42, 94, 0.08),
    rgba(227, 215, 198, 0.48)
  );

background-size: cover;
background-position: center;

Do not add text inside the photo.

Number badge in top-left:

- Text: 1
- Position: absolute
- Left: 10px
- Top: 10px
- Width: 22px
- Height: 22px
- Border radius: 999px
- Background: #0A2A5E
- Color: white
- Font size: 11px
- Font weight: 650
- Centered horizontally and vertically

Upload dropzone:

Use a button wrapping a hidden file input or trigger one through a ref.

Styles:

margin: 16px 12px 12px;
border: 1px dashed rgba(10, 42, 94, 0.28);
border-radius: 16px;
padding: 14px;
display: flex;
align-items: center;
justify-content: center;
gap: 12px;
color: #0A2A5E;
background: rgba(255, 255, 255, 0.65);
cursor: pointer;

Copy:

Upload images
PNG, JPG up to 10MB each

The plus circle:

- 20px × 20px
- border-radius: 50%
- background: #F4F7FB
- color: #0A2A5E
- plus icon around 14px
- no heavy border

Upload title:

- Font size: 12px
- Font weight: 600
- Color: #0A2A5E

Upload helper:

- Font size: 10px
- Color: #667085
- Margin-top: 2px

File input:

accept="image/png,image/jpeg"
multiple

Validate that each file is no larger than 10MB.

==================================================
12. RIGHT PRODUCT DETAILS CARD
==================================================

The right card should have a desktop minimum height of approximately 560px.

There is no card heading above the tabs.

----------------------------------------------
TABS
----------------------------------------------

Tabs container:

display: flex;
min-height: 42px;
background: rgba(255, 255, 255, 0.72);
border-bottom: 1px solid rgba(10, 42, 94, 0.10);
overflow-x: auto;
scrollbar-width: none;

Hide the visible scrollbar for the tabs.

Tabs, in this exact order:

1. Details
2. Tags & Organization
3. Inventory & Shipping

Every tab:

flex: 1 0 auto;
min-width: 132px;
height: 42px;
padding: 0 14px;

display: inline-flex;
align-items: center;
justify-content: center;

background: transparent;
color: #667085;
border: 0;
border-bottom: 2px solid transparent;

font-size: 11px;
font-weight: 620;

Active tab:

color: #0A2A5E;
border-bottom-color: #0A2A5E;
background: rgba(10, 42, 94, 0.025);

Do not use a rounded pill treatment for the tabs.

Tab content:

padding: 18px;

Only the currently selected panel should be visible.

==================================================
13. DETAILS TAB CONTENT
==================================================

Use controlled form values.

The field order and copy must exactly match:

1. PRODUCT TITLE *
   Value: Loratadine 10mg

2. SHORT DESCRIPTION
   Placeholder: Add a short customer friendly description

3. LONG DESCRIPTION
   Value:
   Non drowsy antihistamine used to relieve allergy symptoms such as sneezing, runny nose and itchy eyes. Confirm dosage guidance before checkout where needed.

4. REGULAR PRICE *
   Currency: NGN
   Value: 6.80

5. SALE PRICE
   Currency: NGN
   Placeholder: Leave empty

The first three fields form a single-column grid:

display: grid;
grid-template-columns: 1fr;
gap: 14px;

Price fields:

display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 14px;
margin-top: 14px;

----------------------------------------------
FIELD LABELS
----------------------------------------------

All labels:

display: block;
margin-bottom: 8px;
color: #667085;
font-size: 10px;
font-weight: 680;
line-height: 1.25;
text-transform: uppercase;
letter-spacing: 0.015em;

Do not use title case labels.

----------------------------------------------
TEXT INPUTS AND TEXTAREAS
----------------------------------------------

Inputs, selects, and textareas:

width: 100%;
min-height: 42px;
border: 1px solid rgba(10, 42, 94, 0.13);
border-radius: 14px;
background: rgba(255, 255, 255, 0.86);
color: #0A2A5E;
outline: none;
padding: 0 13px;
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
font-size: 12px;
font-weight: 430;

Textarea:

min-height: 94px;
padding: 12px 13px;
resize: vertical;
line-height: 1.55;

Placeholder:

color: #7B8492;
opacity: 1;

Focus state must be subtle:

border-color: rgba(10, 42, 94, 0.38);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.72),
  0 0 0 3px rgba(44,110,183,0.12);

Do not change the field background to blue on focus.

==================================================
14. LONG DESCRIPTION EDITOR
==================================================

Create a lightweight visual rich-text editor shell. It does not need a full third-party editor unless the project already has one.

Outer editor:

border: 1px solid rgba(10, 42, 94, 0.13);
border-radius: 14px;
overflow: hidden;
background: #FFFFFF;
box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);

Toolbar:

height: 38px;
display: flex;
align-items: center;
gap: 13px;
padding: 0 14px;
border-bottom: 1px solid rgba(10, 42, 94, 0.08);
color: #0A2A5E;
font-size: 11px;
font-weight: 620;
white-space: nowrap;

Toolbar content in exact order:

Paragraph
B
I
U
Quote
Link
Image
• List

The B, I and U controls should visually use bold, italic and underline respectively.

Editor area:

min-height: 122px;
padding: 12px 14px;
color: #667085;
font-size: 12px;
line-height: 1.55;
outline: none;

Use either contentEditable with appropriate warning suppression or a textarea styled to look like the reference. The visible result matters more than toolbar functionality.

==================================================
15. CURRENCY INPUTS
==================================================

Currency wrapper:

display: grid;
grid-template-columns: 64px minmax(0, 1fr);
border: 1px solid rgba(10, 42, 94, 0.13);
border-radius: 14px;
overflow: hidden;
background: rgba(255, 255, 255, 0.86);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);

Currency prefix:

display: grid;
place-items: center;
border-right: 1px solid rgba(10, 42, 94, 0.09);
color: #0A2A5E;
font-size: 12px;
background: rgba(10, 42, 94, 0.025);

Currency input:

min-height: 42px;
width: 100%;
border: 0;
outline: 0;
background: transparent;
padding: 0 13px;
color: #0A2A5E;
font-size: 12px;

==================================================
16. TAGS & ORGANIZATION TAB
==================================================

Build the hidden second tab so it becomes functional when selected.

Use a two-column field grid with a 14px gap.

Fields:

Category:
- Allergy & Cold
- Pain Relief
- Vitamins
- Prescription

Brand:
- Nevari Pharmacy

Product tags:
- allergy, antihistamine, loratadine

Prescription rule:
- No prescription needed
- Prescription required
- Pharmacist review needed

Below the fields, add a note with 14px top margin:

Use organization fields to make storefront search cleaner and to reduce order errors when staff create manual orders.

Note styling:

padding: 12px 14px;
border-radius: 16px;
background: #F4EEE6;
color: #4B3D2B;
border: 1px solid rgba(75, 61, 43, 0.08);
font-size: 11px;
line-height: 1.55;

==================================================
17. INVENTORY & SHIPPING TAB
==================================================

Build the third tab with a two-column grid and 14px gap.

Fields and values:

SKU:
NEV-LOR-10

Stock quantity:
184

Low stock alert:
20

Expiry date:
2027-09-18

Weight:
0.08 kg

Shipping class:
- Standard pharmacy item
- Cold chain
- Fragile

==================================================
18. FOOTER
==================================================

The footer stays visible while the modal body scrolls.

Styles:

flex: 0 0 auto;
display: flex;
align-items: center;
justify-content: flex-end;
gap: 10px;
padding: 14px 18px;

border-top: 1px solid rgba(10, 42, 94, 0.10);
border-radius: 0 0 30px 30px;
background: rgba(251, 250, 247, 0.97);
backdrop-filter: blur(14px);

Order:

[Delete Product] [flexible empty space] [Cancel] [Save Changes]

Use margin-left: auto on Cancel, or insert a flex: 1 spacer after Delete Product.

All footer buttons:

min-height: 39px;
padding: 0 16px;
border-radius: 999px;
font-size: 12px;
font-weight: 550;
letter-spacing: 0;
display: inline-flex;
align-items: center;
justify-content: center;
white-space: nowrap;

Delete Product:

background: #FCE3E3;
color: #B23B3B;
border: 0;

Cancel:

background: rgba(255, 255, 255, 0.48);
color: #0A2A5E;
border: 1px solid rgba(10, 42, 94, 0.12);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);

Save Changes:

background: #0A2A5E;
color: #FFFFFF;
border: 0;
box-shadow: 0 12px 24px rgba(10, 42, 94, 0.18);

Hover:

- Buttons may move upward by no more than 1px.
- Primary button background becomes #11396F.
- Do not introduce scale animations.

Disabled/save-loading state:

- Preserve the button’s dimensions.
- Do not replace the button with a differently sized spinner.
- Use an inline 14px spinner if needed.

==================================================
19. RESPONSIVE BEHAVIOR
==================================================

At viewport widths at or below 1100px:

- Change the inner two-column grid to one column.
- Media card min-height becomes auto.
- Product image min-height becomes 260px.
- Preserve the 16px gap.

At viewport widths at or below 720px:

Modal:

width: calc(100vw - 16px);
height: calc(100dvh - 22px);
max-height: calc(100dvh - 22px);
border-radius: 24px;

Header:

padding: 18px;
border-radius: 24px 24px 0 0;

Body inner shell:

padding: 14px;

Footer:

padding: 14px 18px 18px;
border-radius: 0 0 24px 24px;

Field and price grids:

grid-template-columns: 1fr;

Tabs:

min-width: 112px;
height: 38px;
font-size: 10px;

Keep the tabs horizontally scrollable.

On narrow phones:

- Keep Delete, Cancel and Save usable without horizontal overflow.
- The footer may wrap or use a compact grid.
- Preserve Delete as the visually separate destructive action.
- Do not shrink text below 10px.

==================================================
20. INTERACTION DETAILS
==================================================

Tabs:

- Details is initially active.
- Clicking a tab updates active styling and visible content.
- Preserve form values while changing tabs.

Upload:

- Clicking opens a hidden file input.
- Show local image previews after selection while retaining the same gallery dimensions.
- The initial state must match the gradient placeholder in the screenshot.
- Enforce PNG/JPEG and 10MB-per-file validation.

Save:

- Validate required product title and regular price.
- Call onSave.
- Close after a successful save unless the existing app expects otherwise.

Delete:

- Call onDelete.
- Do not display a confirmation dialog in the initial screenshot state.
- A confirmation may appear only after the user clicks Delete Product.

Cancel and close:

- Discard unsaved local changes or restore the initial data.
- Follow the existing application’s form conventions.

==================================================
21. PIXEL-PERFECT RESTRICTIONS
==================================================

Do not:

- Make the modal narrower than 1168px at the reference viewport.
- Center the header copy vertically.
- Use black body text.
- Use a pure-white modal frame.
- Use a large dark shadow around inner panels.
- Use pill-shaped form inputs.
- Round the tabs.
- Add icons to the three tabs.
- Add an image that is not visible in the reference.
- Increase the input height beyond 42px.
- Use default browser textarea styling.
- Let the page behind the dialog scroll.
- Let the entire dialog scroll as one block.
- Add extra explanatory text.
- Change any visible wording.
- Replace “NGN” with a currency symbol.
- Replace the text editor toolbar with a different toolbar.
- use uppercase for the main title.
- place the Delete Product button on the right.

==================================================
22. VISUAL VERIFICATION
==================================================

After implementation:

1. Run the project’s formatter, linter, typecheck, tests and production build.

2. Start the app and render the modal open.

3. Use Playwright or the project’s browser testing setup to capture a screenshot at exactly:

viewport: 1896 × 952

4. Verify that:

- Modal dimensions are 1168 × 760.
- Modal top-left is approximately 364 × 96.
- Header and footer remain fixed.
- The body scrollbar appears inside the modal on the far right.
- The media panel is exactly 380px wide.
- The two main cards have a 16px gap.
- The image placeholder, tab underline, input borders, text baselines and button placements align with the reference.
- Delete Product is left-aligned.
- Cancel and Save Changes are right-aligned.
- The dashboard behind the modal remains visible through a blurred blue-gray overlay.
- There are no console errors or React hydration warnings.

5. Compare the implementation screenshot against the supplied reference and make at least one visual refinement pass. Do not declare the work complete after the first render.

6. In your final response, report:
- Files created
- Files modified
- Where the modal is integrated
- Commands run
- Build/lint/test result
- Any remaining visual difference that could not be eliminated