You are working inside my existing Next.js pharmacy dashboard.

Redesign and implement the “Create profile” modal shown in the attached reference screenshot.

The result must closely reproduce the screenshot’s dimensions, layout, spacing, typography, borders, colors, blur, shadows, input styling, avatar preview, fixed footer, and responsive behavior.

This is an implementation task, not a conceptual redesign.

Important scope changes from the screenshot:

- Completely remove the Permissions section.
- Completely remove the Store branch field.
- Do not show a Branch row in the preview panel.
- Do not send permissions or branch data in the form submission.
- Update any copy that refers to branch access or permissions.

The modal should collect only:

- First name
- Last name
- Email address
- Phone number
- Role
- Optional profile image

==================================================
1. INSPECT THE EXISTING PROJECT FIRST
==================================================

Before making changes:

1. Inspect package.json.
2. Determine whether the app uses:
   - Next.js App Router or Pages Router
   - TypeScript or JavaScript
   - CSS Modules, Tailwind, styled-components, or another styling system
   - React Hook Form or another form library
   - Zod, Yup, or another validation library
   - An existing dialog or modal primitive
   - An existing toast system
   - An existing file-upload utility
3. Locate:
   - The staff or user-management page
   - The existing “Create profile” or “Add user” action
   - The API used to create dashboard users
   - Existing user and role types
   - The project’s design tokens and fonts
4. Reuse existing project conventions and API utilities.
5. Do not install a new UI framework unless absolutely necessary.
6. Do not use default shadcn, Material UI, Bootstrap, or browser styling.
7. If an existing dialog primitive is used for accessibility, override all visible styles to match this specification.

==================================================
2. COMPONENT DELIVERABLE
==================================================

Create a reusable component similar to:

type CreateProfileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: (
    values: CreateProfileValues
  ) => Promise<void> | void;
};

type CreateProfileValues = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  profileImage: File | null;
};

Do not include:

- branch
- branchId
- storeBranch
- permissions
- permissionIds
- access modules

Adapt the type to the existing backend schema when necessary, but the UI must not expose branch or permission controls.

Suggested component split:

- CreateProfileModal
- CreateProfileForm
- ProfileImageUpload
- ProfilePreviewCard

Avoid unnecessary fragmentation.

==================================================
3. REFERENCE VIEWPORT AND DIMENSIONS
==================================================

The supplied reference screenshot is approximately:

- Viewport width: 1052px
- Viewport height: 786px

At this viewport, the modal should be approximately:

- Left: 47px
- Top: 25px
- Width: 880px
- Height: 720px
- Border radius: 30px

Use:

width: min(880px, calc(100vw - 32px));
height: min(720px, calc(100dvh - 32px));
max-height: min(720px, calc(100dvh - 32px));

At larger desktop widths, allow a maximum width of approximately 980px if required by the application, but preserve the same proportions.

The modal must be centered horizontally and vertically.

Use border-box sizing throughout.

==================================================
4. DESIGN TOKENS
==================================================

Use the project’s existing tokens when they match. Otherwise scope these variables to the modal:

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
--inset-highlight:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Font stack:

Inter, Manrope, "Product Sans", ui-sans-serif, system-ui,
-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

Apply:

-webkit-font-smoothing: antialiased;
text-rendering: optimizeLegibility;

Use navy rather than black for primary text.

==================================================
5. MODAL OVERLAY
==================================================

Render the modal through a portal to document.body when appropriate.

Overlay:

position: fixed;
inset: 0;
z-index: 90;

display: grid;
place-items: center;

padding: 16px;

background: rgba(6, 27, 63, 0.38);
backdrop-filter: blur(6px);
-webkit-backdrop-filter: blur(6px);

The dashboard behind the modal must remain visible, blurred, and muted.

Opening transition:

- Backdrop opacity: 0 to 1
- Modal translateY: 12px to 0
- Duration: 180–200ms
- Timing function: ease
- Respect prefers-reduced-motion

While open:

- Lock document scrolling.
- Trap keyboard focus.
- Close on Escape.
- Close through the X button.
- Close when clicking directly on the backdrop.
- Do not close when clicking inside the modal.
- Restore focus to the trigger after closing.

==================================================
6. OUTER MODAL FRAME
==================================================

Modal frame:

display: flex;
flex-direction: column;

width: min(880px, calc(100vw - 32px));
height: min(720px, calc(100dvh - 32px));
max-height: min(720px, calc(100dvh - 32px));

padding: 0;
overflow: hidden;

border-radius: 30px;
border: 1px solid rgba(255, 255, 255, 0.80);

background:
  linear-gradient(
    180deg,
    rgba(251, 250, 247, 0.99),
    rgba(251, 248, 243, 0.98)
  );

box-shadow:
  0 26px 70px rgba(6, 27, 63, 0.24),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Do not allow the entire modal to scroll. Only the body may scroll when needed.

==================================================
7. MODAL HEADER
==================================================

Header:

flex: 0 0 auto;

display: flex;
align-items: flex-start;
justify-content: space-between;
gap: 18px;

padding: 24px 24px 20px;

border-bottom:
  1px solid rgba(10, 42, 94, 0.10);

background:
  rgba(251, 250, 247, 0.97);

backdrop-filter: blur(14px);

Header title:

Create profile

Title styles:

margin: 0;
color: #102039;
font-size: 19px;
line-height: 1.2;
font-weight: 650;
letter-spacing: -0.04em;

Header subtitle:

Add a new pharmacy dashboard user with their role and contact details.

Do not mention:

- branch access
- operational permissions
- store assignment
- permission configuration

Subtitle styles:

margin: 5px 0 0;
color: #667085;
font-size: 12px;
line-height: 1.45;
font-weight: 400;

Close button:

width: 40px;
height: 40px;
flex: 0 0 40px;

display: grid;
place-items: center;

border: 1px solid rgba(10, 42, 94, 0.12);
border-radius: 999px;

background: rgba(255, 255, 255, 0.56);
color: #0A2A5E;

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Use an outlined X icon:

- Width: 18px
- Height: 18px
- Stroke width: 1.8px

Hover:

background: #FFFFFF;
border-color: rgba(10, 42, 94, 0.22);
transform: translateY(-1px);

Focus:

outline: none;

box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.72),
  0 0 0 3px rgba(44,110,183,0.12);

==================================================
8. MODAL BODY
==================================================

Body:

flex: 1 1 auto;
min-height: 0;

padding: 18px 24px;

overflow-y: auto;
overflow-x: hidden;
overscroll-behavior: contain;

background:
  linear-gradient(
    180deg,
    #FFFFFF,
    #FBF8F3
  );

Desktop body grid:

display: grid;
grid-template-columns:
  minmax(0, 1fr) 260px;
gap: 18px;
align-items: start;

At the reference viewport:

- Left form panel: approximately 553px wide
- Right preview panel: approximately 260px wide
- Gap: 18px

Scrollbar:

scrollbar-width: thin;
scrollbar-color:
  rgba(10, 42, 94, 0.22) transparent;

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
  border: 2px solid rgba(251, 248, 243, 0.95);
}

==================================================
9. SHARED PANEL STYLING
==================================================

Both the form panel and preview panel use:

border:
  1px solid rgba(10, 42, 94, 0.10);

border-radius: 24px;

background:
  rgba(255, 255, 255, 0.82);

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Do not add a strong drop shadow to the inner panels.

==================================================
10. LEFT FORM PANEL
==================================================

Form panel:

padding: 18px 16px 16px;
min-width: 0;

The layout must not contain:

- Store branch field
- Branch selector
- Permission buttons
- Permission chips
- Permission heading
- Permission helper text

The panel should finish after the profile-image upload area.

==================================================
11. FORM SECTION HEADING
==================================================

Heading row:

display: flex;
align-items: center;
gap: 9px;

margin-bottom: 15px;

Use a small outlined users icon.

Icon:

width: 17px;
height: 17px;
color: #0A2A5E;
stroke-width: 1.8;

Heading text:

Staff identity

Styles:

margin: 0;
color: #0A2A5E;
font-size: 12px;
line-height: 1.25;
font-weight: 650;
letter-spacing: -0.015em;

==================================================
12. FORM GRID
==================================================

Use a two-column grid:

display: grid;
grid-template-columns:
  repeat(2, minmax(0, 1fr));
column-gap: 12px;
row-gap: 14px;

Field layout:

Row 1:

- First name
- Last name

Row 2:

- Email address
- Phone number

Row 3:

- Role spanning both columns

Row 4:

- Profile image spanning both columns

Do not leave an empty placeholder column where Store branch previously existed.

Role must use the full panel width.

Use:

grid-column: 1 / -1;

for the Role field.

Profile image must also span the complete width.

==================================================
13. LABEL STYLING
==================================================

All labels:

display: block;

margin-bottom: 7px;

color: #0A2A5E;

font-size: 10px;
line-height: 1.2;
font-weight: 650;
letter-spacing: -0.01em;

Do not uppercase these labels.

Visible labels:

First name
Last name
Email address
Phone number
Role
Profile image

==================================================
14. INPUT STYLING
==================================================

Text inputs and select:

width: 100%;
height: 42px;
min-height: 42px;

padding: 0 13px;

border:
  1px solid rgba(10, 42, 94, 0.13);

border-radius: 14px;

background:
  rgba(255, 255, 255, 0.88);

color: #0A2A5E;

outline: none;

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

font-family: inherit;
font-size: 12px;
font-weight: 430;

Placeholder:

color: #7B8492;
opacity: 1;

Focus state:

border-color:
  rgba(10, 42, 94, 0.38);

background: #FFFFFF;

box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.72),
  0 0 0 3px rgba(44,110,183,0.10);

Error state:

border-color:
  rgba(178, 59, 59, 0.55);

box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.72),
  0 0 0 3px rgba(178,59,59,0.08);

Error message:

margin: 5px 0 0;
color: #B23B3B;
font-size: 10px;
line-height: 1.4;

==================================================
15. INITIAL FORM VALUES
==================================================

Use the screenshot values as the visual demonstration state:

First name:
Amara

Last name:
Okafor

Email address:
amara@nevarihealth.com

Phone number:
0803 000 1188

Role:
Pharmacist

For production behavior, initial values should be empty unless supplied through props or the existing application state.

The screenshot values may be used in a demo or Storybook example.

==================================================
16. ROLE SELECT
==================================================

Role field spans both columns.

Options should use the real roles provided by the application.

Fallback options:

- Pharmacist
- Pharmacy assistant
- Doctor
- Operations manager
- Administrator
- Customer support

Initial placeholder:

Select role

Do not include branch-specific roles unless they already exist in the backend.

The native select arrow may be replaced with the project’s chevron-down icon.

Chevron:

position: absolute;
right: 13px;
top: 50%;
transform: translateY(-50%);

width: 16px;
height: 16px;
color: #0A2A5E;
pointer-events: none;

==================================================
17. PROFILE IMAGE UPLOAD
==================================================

Profile-image field spans both form columns.

Upload zone:

width: 100%;
min-height: 118px;

display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 7px;

padding: 16px;

border:
  1px dashed rgba(10, 42, 94, 0.28);

border-radius: 18px;

background:
  linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.70),
    rgba(244, 238, 230, 0.45)
  );

color: #0A2A5E;
cursor: pointer;

Upload icon:

width: 24px;
height: 24px;
stroke-width: 1.8;
color: #0A2A5E;

Upload title:

Upload profile photo

Styles:

margin-top: 2px;
font-size: 11px;
line-height: 1.3;
font-weight: 620;
color: #0A2A5E;

Upload helper:

PNG or JPG. This preview uses an initials avatar until an image is added.

Styles:

margin: 2px 0 0;
font-size: 10px;
line-height: 1.4;
font-weight: 400;
color: #667085;
text-align: center;

Hidden input:

type="file"
accept="image/png,image/jpeg"

Validation:

- PNG or JPEG only
- Maximum size: 5MB
- Reject unsupported files
- Show an inline error or toast
- Do not clear other form fields after an upload error

Hover:

background:
  linear-gradient(
    145deg,
    #FFFFFF,
    rgba(244, 238, 230, 0.58)
  );

border-color:
  rgba(10, 42, 94, 0.38);

Selected-image state:

- Show a centered circular or rounded preview
- Preview dimensions: 72px by 72px
- Use object-fit: cover
- Show the filename below
- Provide a small “Change photo” control
- Revoke old object URLs when replaced or unmounted

==================================================
18. RIGHT PREVIEW PANEL
==================================================

Preview panel:

padding: 16px;
min-width: 0;

display: flex;
flex-direction: column;

The preview should update live as the user types.

Do not show:

- Branch row
- Storefront name
- Permission chips
- Permissions summary

==================================================
19. PREVIEW AVATAR
==================================================

Avatar:

width: 86px;
height: 86px;

display: grid;
place-items: center;

border-radius: 50%;

background:
  linear-gradient(
    145deg,
    #E9DED0,
    #FBF8F3
  );

border:
  1px solid rgba(10, 42, 94, 0.12);

box-shadow:
  0 8px 18px rgba(10, 42, 94, 0.10),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

color: #0A2A5E;

font-size: 26px;
line-height: 1;
font-weight: 600;
letter-spacing: -0.035em;

Initials logic:

- Use the first character of firstName
- Use the first character of lastName
- Convert to uppercase
- “Amara Okafor” becomes “AO”
- When one field is empty, show one initial
- When both fields are empty, show a users/profile icon

When an uploaded image exists:

- Replace the initials with the image
- width: 100%
- height: 100%
- object-fit: cover
- border-radius: inherit

==================================================
20. PREVIEW NAME AND ROLE
==================================================

Name:

Use:

[firstName] [lastName]

Empty fallback:

New team member

Styles:

margin: 14px 0 0;
color: #0A2A5E;
font-size: 13px;
line-height: 1.3;
font-weight: 650;
letter-spacing: -0.02em;
overflow-wrap: anywhere;

Role:

Initial fallback:

Choose a role

Styles:

margin: 5px 0 15px;
color: #667085;
font-size: 11px;
line-height: 1.4;
font-weight: 400;

Add a divider after the role:

height: 1px;
background: rgba(10, 42, 94, 0.09);
margin-bottom: 0;

==================================================
21. PREVIEW SUMMARY ROWS
==================================================

Show only these rows:

1. Status
2. Access level

Do not show a Branch row.

Rows:

min-height: 37px;

display: flex;
align-items: center;
justify-content: space-between;
gap: 12px;

border-bottom:
  1px solid rgba(10, 42, 94, 0.09);

Label:

color: #667085;
font-size: 10.5px;
line-height: 1.3;
font-weight: 400;

Value:

color: #0A2A5E;
font-size: 10.5px;
line-height: 1.3;
font-weight: 650;
text-align: right;

Status value:

Invite ready

Access-level value:

Role based

“Role based” describes backend access derived from the selected role. Do not provide permission controls in this modal.

==================================================
22. PREVIEW INFORMATION CARD
==================================================

Place the note below the two summary rows.

Card:

margin-top: 10px;
padding: 13px;

border-radius: 17px;

background:
  rgba(16, 32, 57, 0.06);

color: #667085;

font-size: 10.5px;
line-height: 1.55;
font-weight: 400;

Use this exact copy:

Use this popup when adding internal pharmacy users who need access to the dashboard. Access is assigned automatically from the selected role.

Do not mention:

- managing a branch
- managing permissions
- choosing operational modules
- store access

==================================================
23. FOOTER
==================================================

Footer:

flex: 0 0 auto;
min-height: 81px;

display: flex;
align-items: center;
justify-content: flex-end;
gap: 10px;

padding: 17px 24px 23px;

border-top:
  1px solid rgba(10, 42, 94, 0.10);

background:
  rgba(251, 250, 247, 0.97);

backdrop-filter: blur(14px);

Footer actions:

1. Cancel
2. Create profile

Cancel button:

height: 40px;
min-height: 40px;
padding: 0 17px;

display: inline-flex;
align-items: center;
justify-content: center;

border:
  1px solid rgba(10, 42, 94, 0.12);

border-radius: 999px;

background:
  rgba(255, 255, 255, 0.58);

color: #0A2A5E;

font-size: 11px;
font-weight: 550;

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

Create profile button:

height: 40px;
min-height: 40px;
min-width: 170px;

padding: 0 22px;

display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;

border: 0;
border-radius: 999px;

background: #0A2A5E;
color: #FFFFFF;

font-size: 11px;
font-weight: 620;

box-shadow:
  0 12px 24px rgba(10, 42, 94, 0.18);

Hover:

background: #11396F;
transform: translateY(-1px);

Loading:

- Preserve exact button width and height
- Prevent duplicate submission
- Add a 14px inline spinner
- Change text to “Creating profile”
- Do not close the modal while the request is pending

==================================================
24. USER FLOW
==================================================

Opening:

1. User clicks the application’s “Create profile” or “Add user” action.
2. The modal opens.
3. Body scrolling is locked.
4. Focus moves to the First name input.
5. Preview shows:
   - Placeholder avatar
   - “New team member”
   - “Choose a role”
   - “Invite ready”
   - “Role based”

Data entry:

1. As the user enters first and last name, the preview name updates.
2. Avatar initials update immediately.
3. Selecting a role updates the preview role.
4. Selecting a profile image replaces the initials avatar.
5. Email and phone do not need to appear in the preview.
6. No branch or permission configuration is presented.

Cancel:

1. Clicking Cancel requests closure.
2. Clicking the X requests closure.
3. Pressing Escape requests closure.
4. Clicking directly on the backdrop requests closure.
5. If the form is pristine, close immediately.
6. If the form is dirty, use the project’s existing unsaved-change confirmation pattern.
7. Do not use browser alert() or confirm() unless the existing project already uses them.

Create profile:

1. Validate required fields.
2. Focus the first invalid field.
3. Display inline validation errors.
4. Submit through the existing user-creation API.
5. Exclude branch and permission fields from the payload.
6. Disable Create profile while submitting.
7. On success:
   - Show a success toast
   - Refresh or invalidate the staff list
   - Close the modal
   - Reset the form after the request succeeds
8. On failure:
   - Keep the modal open
   - Preserve all entered values
   - Display the backend error
   - Re-enable the submit button

Suggested success toast:

Title:
Profile created

Message:
The dashboard invitation is ready to be sent.

==================================================
25. VALIDATION
==================================================

Use the project’s existing validation library.

At minimum:

First name:

- Required
- Trim leading and trailing whitespace
- Minimum 2 characters
- Maximum 50 characters

Last name:

- Required
- Trim whitespace
- Minimum 2 characters
- Maximum 50 characters

Email address:

- Required
- Valid email format
- Convert to lowercase when appropriate
- Maximum 254 characters

Phone number:

- Required
- Accept spaces and common Nigerian phone formats
- Normalize before submission if the backend requires it
- Do not force a specific international format unless the existing API does

Role:

- Required
- Must match an allowed role value

Profile image:

- Optional
- PNG or JPEG
- Maximum 5MB

Validation messages should be concise:

- Enter a first name.
- Enter a last name.
- Enter a valid email address.
- Enter a phone number.
- Select a role.
- Use a PNG or JPG image no larger than 5MB.

Do not clear valid fields when another field fails validation.

==================================================
26. ACCESSIBILITY
==================================================

Modal:

role="dialog"
aria-modal="true"
aria-labelledby="create-profile-title"
aria-describedby="create-profile-description"

Also implement:

- Focus trap
- Escape-to-close
- Trigger focus restoration
- Visible focus styles
- Correct input labels
- aria-invalid on invalid fields
- aria-describedby for errors
- aria-label="Close create profile modal" on the X button
- Accessible upload label
- Keyboard activation for the upload zone
- aria-live="polite" for success and error status
- Do not rely on color alone for errors

==================================================
27. RESPONSIVE BEHAVIOR
==================================================

At widths below 760px:

Overlay:

padding: 10px;
align-items: start;

Modal:

width: calc(100vw - 20px);
height: calc(100dvh - 20px);
max-height: calc(100dvh - 20px);
border-radius: 24px;

Header:

padding: 18px;
border-radius: 24px 24px 0 0;

Body:

padding: 14px;
display: block;

The preview moves below the form panel.

Form panel:

padding: 16px 14px;

Form grid:

grid-template-columns: 1fr;

Every field spans one column.

Preview:

margin-top: 14px;
padding: 16px;

Footer:

padding: 14px 18px 18px;
border-radius: 0 0 24px 24px;
flex-wrap: wrap;

Create profile button:

flex: 1 1 170px;

At widths below 480px:

- Cancel and Create profile may each use full width.
- Create profile should appear first visually only if required for usability; otherwise preserve Cancel then Create profile.
- Modal title becomes 18px.
- Header subtitle remains readable and wraps naturally.
- Input height remains 42px.
- Do not reduce labels below 10px.
- Do not introduce horizontal scrolling.

==================================================
28. IMPLEMENTATION RESTRICTIONS
==================================================

Do not:

- Include the Permissions section
- Include permission chips
- Include permission toggles
- Include permission checkboxes
- Include the Store branch field
- Include a branch selector
- Include a Branch preview row
- Send branch data
- Send permission data
- Mention branch access in the subtitle
- Mention permission configuration in the helper copy
- Use a full-page form instead of a modal
- Let the entire modal frame scroll
- Use black primary text
- Use pill-shaped inputs
- Use sharp panel corners
- Add an oversized heading
- Add a stepper
- Add tabs
- Add decorative illustrations
- Add random colors outside the Nevari palette
- Use browser alert()
- Close the modal after a failed request
- Reset the form after a failed request
- Make the avatar square
- Hide the preview on desktop

==================================================
29. API PAYLOAD
==================================================

The submitted payload must only contain fields supported by the existing user API.

Conceptually:

{
  firstName,
  lastName,
  email,
  phoneNumber,
  role,
  profileImage
}

Explicitly exclude:

{
  branch,
  branchId,
  storeBranch,
  permissions,
  permissionIds,
  modules,
  accessAreas
}

When the API expects multipart form data:

- Append the profile image only when selected.
- Do not append empty branch or permission values.
- Preserve the backend’s expected field names.

==================================================
30. VISUAL VERIFICATION
==================================================

After implementation:

1. Run formatting.
2. Run linting.
3. Run TypeScript checking.
4. Run tests.
5. Run the production build.
6. Open the modal in the browser.
7. Capture a screenshot at 1052 × 786.
8. Compare it against the supplied reference.

Verify:

- Modal is approximately 880px wide.
- Modal top is approximately 25px.
- Modal radius is 30px.
- Header and footer remain fixed.
- Left and right panels have 24px radii.
- Body grid uses an 18px gap.
- Preview width is approximately 260px.
- Inputs are 42px high.
- Role spans the full form width.
- Upload zone spans the full form width.
- There is no Store branch field.
- There is no Permissions section.
- There is no Branch preview row.
- The preview avatar is circular.
- The Create profile button is approximately 170px wide.
- The blurred dashboard remains visible.
- There is no horizontal overflow.
- There are no React hydration warnings.
- There are no console errors.

Also verify responsive layouts at:

- 1440 × 900
- 1052 × 786
- 768 × 900
- 390 × 844

Perform at least one visual refinement pass after the first screenshot comparison.

==================================================
31. FINAL RESPONSE
==================================================

When complete, report:

- Files created
- Files modified
- Existing components reused
- Existing API reused
- Validation implemented
- Upload behavior implemented
- Fields removed
- Payload fields excluded
- Commands run
- Lint result
- Typecheck result
- Test result
- Production build result
- Any remaining visual differences