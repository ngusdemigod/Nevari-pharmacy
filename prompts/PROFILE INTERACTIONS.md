You are working on an already-built Next.js health web app profile page. Do not redesign the full page or change the existing visual identity. Keep the current layout, colors, spacing, typography, and component structure. Only improve the user interactions, animations, popups, editable states, profile data behavior, and health-record behavior.

This is a Next.js app. Use React state properly. Use client components where needed with "use client". Use TypeScript if the project already uses TypeScript. Use Tailwind CSS if Tailwind is already used in the project.

IMPORTANT:
- Do not rebuild the page from scratch.
- Do not redesign the page.
- Do not add a new navbar.
- Do not add sidebar navigation links.
- Do not add dashboard links, appointment links, prescription links, billing links, support links, or logout links.
- Leave the existing navbar/menu structure exactly as it is.
- Keep the same visual style, but make the interactions feel polished and production-ready.

GENERAL INTERACTION STYLE

Make the page feel smooth, clean, modern, and suitable for a health web app.

Use subtle animations only:
- Profile sections should fade in softly on page load.
- Tab content should fade or slide slightly when switching.
- Popups should fade in with a slight scale animation.
- Bottom sheets should slide up smoothly on mobile.
- Buttons should have hover, active, disabled, and loading states.
- Inputs should transition smoothly on focus.

Animation duration should stay between 150ms and 300ms.

Do not use heavy, distracting, or playful animations.

PROFILE IMAGE INTERACTION

The circular profile image should be clickable. The camera icon on the avatar should also trigger the same interaction.

When the user clicks the profile image or camera icon, open a small action popup with only these options:

1. View Image
2. Upload Image
3. Cancel / Close

Do not add unnecessary options such as Remove Photo unless it already exists in the app.

VIEW IMAGE INTERACTION

When “View Image” is clicked:
- Open the profile image in a centered modal.
- Show the image larger inside a clean rounded preview container.
- Add a visible close button.
- Allow closing by pressing Escape.
- Allow closing by clicking outside the modal.
- Add a subtle fade-in and scale animation.
- Do not show upload controls inside the view image modal.

UPLOAD IMAGE INTERACTION

When “Upload Image” is clicked:
- Open an upload modal titled “Upload Profile Image”.
- Show the current avatar preview.
- Provide an upload/select image button.
- Accept only image files.
- Validate file type.
- Validate file size.
- After selecting an image, preview it in a circular frame.

The upload modal should include:
- Cancel button
- Save Image button

When Save Image is clicked:
- Show a loading state on the button.
- Update the avatar preview after success.
- Close the modal.
- Show toast: “Profile image updated successfully.”

If upload fails, show:
“Unable to upload image. Please try again.”

If the user cancels, close the modal and keep the old image.

USER / NOTIFICATION SETTINGS TABS

Keep the existing User and Notification Settings tabs.

When User is active:
- Show profile details.
- Active tab should remain navy with white text.
- Content should fade in smoothly.

When Notification Settings is clicked:
- Switch the active tab without reloading the page.
- Hide user profile content.
- Show notification preferences.
- Use a soft fade/slide transition.

Notification settings should include simple toggles for:
- Appointment reminders
- Medication reminders
- Lab result updates
- Payment updates
- Health tips

Toggle interaction:
- Enabled state should use navy blue.
- Disabled state should use gray.
- Toggle changes should update immediately in the UI.
- Show small toast: “Notification preference updated.”
- If autosave is used, debounce the save slightly.
- If autosave is not used, show a “Save Settings” button.

PROFILE FORM INTERACTIONS

The existing profile fields should feel editable and polished.

Fields:
- Display Name
- Email
- Phone Number
- Address

Default state:
- Fields should appear readable but not actively editable, unless the current app already allows editing.
- Add or keep an “Edit Profile” button.

When Edit Profile is clicked:
- Enable the fields.
- Show Save Changes and Cancel buttons.
- Add a subtle fade-in animation for these buttons.
- Focus the first editable field.

Validation:
- Display Name cannot be empty.
- Email must be a valid email format.
- Phone Number should support Nigerian phone format such as +234.
- Address cannot be empty.

Input interaction:
- Input border should turn navy blue on focus.
- Invalid fields should show small red error text below the input.
- Error messages should be connected to the relevant input for accessibility.

On Save Changes:
- Validate fields.
- Show loading state on the button.
- Disable the button while submitting.
- If successful, disable fields again.
- Show toast: “Profile updated successfully.”

On Cancel:
- Restore previous saved values.
- Exit edit mode.

KEY HEALTH RECORDS SECTION

Add or improve a compact health records section, but do not overload the profile page with too many medical fields.

The section title should be:
“Key Health Records”

Only highlight the most important health records a healthcare provider may need quickly.

Recommended fields only:
- Blood Group
- Genotype
- Allergies
- Current Medications
- Existing Conditions
- Emergency Contact

Do not include too many fields such as:
- Smoking status
- Alcohol use
- Dietary preference
- Family history
- Past surgeries
- Exercise frequency
- Detailed lifestyle information

Structure:
- Display the records in a clean card below the personal details.
- Use label/value rows or small compact cards.
- Keep the section easy to scan.
- If a field has no value, show “Not added”.
- Add a short privacy note:
“Your health information is private and used only to support your care experience.”

HEALTH RECORDS INTERACTION

Add an “Edit Health Records” button.

When clicked:
- Open a modal or expandable form.
- Keep the form short and focused.
- Allow editing only these fields:
  - Blood Group
  - Genotype
  - Allergies
  - Current Medications
  - Existing Conditions
  - Emergency Contact Name
  - Emergency Contact Phone Number

Use dropdowns for:
- Blood Group
- Genotype

Use chip/tag inputs for:
- Allergies
- Current Medications
- Existing Conditions

Chip behavior:
- User types an item and presses Enter or clicks Add.
- The item appears as a rounded chip.
- Each chip has an X button to remove it.
- If no item exists, show “None added.”
- If the user enters “None”, show a neutral chip labeled “None”.

Emergency contact validation:
- Emergency Contact Name is optional.
- Emergency Contact Phone Number is optional.
- If Emergency Contact Name is added, Emergency Contact Phone Number should be required.
- Emergency Contact Phone Number should support Nigerian phone format.

On Save:
- Show loading state.
- Save the health records.
- Close the modal or collapse the form.
- Show toast: “Health records saved securely.”

On Cancel:
- Restore previous values.
- Close the form or modal.

SUBSCRIPTION MANAGE BUTTON

Keep the existing subscription card and Manage button.

When Manage is clicked:
- Open a clean modal or bottom sheet.
- On mobile, use a bottom sheet.
- On desktop/tablet, use a centered modal.

Show:
- Current Plan: Nevari Access Pro
- Price: NGN 1,000/month
- Renewal Date: 9 Jul 2026
- Payment Method
- Change Payment Method button
- Cancel Subscription button
- Close button

Interaction:
- Change Payment Method opens a payment method form or placeholder modal if payment integration is not complete.
- Cancel Subscription must open a confirmation popup before proceeding.
- The confirmation popup should clearly warn the user.
- Use red/destructive styling only for the final cancellation action.
- On successful action, show toast feedback.

SEARCH BAR INTERACTION

Improve only the interaction of the existing search bar. Do not redesign it.

When focused:
- Add navy border or subtle shadow.
- Show a small dropdown with relevant quick options:
  - Appointments
  - Prescriptions
  - Lab Results
  - Orders

Search behavior:
- User can type to filter results.
- Show “No results found” when there is no match.
- Add a clear X icon when text exists.
- Pressing Escape should close the dropdown.
- Clicking outside should close the dropdown.
- Clearing text should restore the quick options.

PROFILE DATA PREFILL ACROSS THE APP

Make the saved profile and key health record information reusable across the entire app.

Anywhere these user details are required in any form on the app, automatically prefill the matching fields using the saved profile data.

Personal details to prefill:
- Display Name
- Email
- Phone Number
- Address

Key health records to prefill:
- Blood Group
- Genotype
- Allergies
- Current Medications
- Existing Conditions
- Emergency Contact Name
- Emergency Contact Phone Number

Prefill behavior:
- When a form loads, check if the user has saved profile data.
- If matching fields exist on that form, prefill them automatically.
- Do not overwrite a field if the user has already typed into it.
- Allow users to edit the prefilled values inside the form.
- If the user changes the value inside a specific form, do not automatically update the main profile unless the form clearly includes a “Save to Profile” option.
- If a field has no saved value, leave it empty and show the normal placeholder.
- Use a shared user profile state, context, hook, store, or API response so the data stays consistent across the app.

Suggested implementation:
- Create or improve a reusable hook such as useUserProfile().
- Use it to fetch and expose profile data globally.
- Use the profile data to prefill forms wherever matching fields exist.
- Keep loading and error states handled properly.
- Avoid duplicate profile-fetching logic across multiple pages.
- Ensure profile data is refreshed after profile updates.

COMPLETE PROFILE MODAL FOR FIRST-TIME OR INCOMPLETE USERS

Add a dismissible “Complete Your Profile” modal for first-time users or users whose important profile fields are empty.

This modal should be triggered anytime the user visits the Overview page.

Trigger conditions:
- User is visiting the Overview page.
- User is a first-time user, OR
- Any important required profile field is empty.

Important fields to check:
- Display Name
- Email
- Phone Number
- Address
- Blood Group
- Genotype
- Emergency Contact Name
- Emergency Contact Phone Number

Modal behavior:
- The modal should appear after the Overview page loads, not before the page content renders.
- Add a subtle fade-in and scale animation.
- The modal should be dismissible.
- The modal should not permanently block users from using the Overview page.

Modal content:
Title:
“Complete Your Profile”

Message:
“Add your key details so forms can be filled faster and your care experience can be more personalized.”

Buttons:
- Primary button: “Complete Profile”
- Secondary button: “Maybe Later”
- Close icon

Button behavior:
- “Complete Profile” should take the user to the Profile page or open the profile completion form if available.
- “Maybe Later” should close the modal.
- Close icon should also dismiss the modal.

Dismissal logic:
- If the user dismisses the modal, do not show it again during the same session.
- It can appear again in a later session if the important fields are still incomplete.
- If all important fields are completed, do not show the modal anymore.
- Store temporary dismissal state in sessionStorage.
- Use backend/profile completion status if already available.
- Do not show the modal repeatedly after every route change in the same session.

Profile completion indicator:
- Optionally show a small profile completion progress indicator on the Profile page.
- Example:
  “Profile 70% complete”
- This should update based on the required fields filled.

POPUPS, MODALS, AND TOASTS

Add toast notifications for:
- Profile updated successfully.
- Profile image updated successfully.
- Health records saved securely.
- Notification preference updated.
- Subscription updated successfully.
- Something went wrong. Please try again.

Modals should:
- Have subtle fade/scale animation.
- Trap focus while open.
- Close on Escape.
- Close when clicking outside, except destructive confirmation modals.
- Have a clear close button.
- Use proper aria labels.
- Return focus to the triggering button after closing.

Bottom sheets should:
- Be used on mobile where appropriate.
- Slide up smoothly.
- Not overflow the screen.
- Have a visible drag handle or close button.

LOADING AND ERROR STATES

Add clean loading and error states:
- Skeleton loader for profile image, subscription card, and form fields while profile data loads.
- Button-level loading spinners for save actions.
- Disabled button state while submitting.
- Error message if profile fails to load:
  “We could not load your profile. Please try again.”
- Add a Retry button for failed profile loading.
- Show field-level errors where validation fails.
- Do not leave the user without feedback after an action.

MOBILE-FIRST REQUIREMENTS

Make sure the interactions work perfectly on mobile:
- Buttons should be at least 44px tall.
- Popups should not overflow the screen.
- Bottom sheets should fit smaller screens.
- Form inputs should be easy to tap.
- Keep spacing clean.
- Avoid overcrowding the page.
- Ensure the avatar action popup is easy to tap on mobile.
- Keep health records compact and scannable.

ACCESSIBILITY REQUIREMENTS

Ensure:
- All inputs have labels.
- All buttons have accessible names.
- Modals manage focus correctly.
- Keyboard navigation works.
- Escape closes popups and modals where appropriate.
- Errors are connected to inputs.
- Toggle switches are accessible.
- Color contrast remains readable.
- Icons have aria-labels where needed.
- The profile image action button has a clear accessible label such as “Open profile image options”.

DO NOT DO THIS

Do not rebuild the page from scratch.
Do not redesign the profile page.
Do not add nav links.
Do not add a sidebar navigation menu.
Do not modify the main navbar.
Do not overload the profile page with too many health fields.
Do not add lifestyle fields to the profile page.
Do not add heavy animations.
Do not remove existing working functionality.
Do not expose sensitive health information unnecessarily.
Do not force users to complete their profile before using the app.
Do not show the complete profile modal repeatedly after it has been dismissed in the same session.
Do not overwrite user-entered form values with prefilled profile data.
Do not update main profile records from other forms unless the user clearly confirms it.

FINAL EXPECTED RESULT

The final result should be the same existing profile page visually, but with polished Next.js interactions, smooth subtle animations, clean popups, ideal profile image actions, editable profile details, compact key health records, notification toggles, reusable profile data for form prefilling across the app, and a dismissible complete profile modal for first-time or incomplete users on the Overview page.