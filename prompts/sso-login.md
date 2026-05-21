I am building a production-ready Next.js custom dashboard for a WooCommerce/WordPress website.

Architecture:

Main website:
https://example.com
- WordPress
- WooCommerce
- Handles customers, orders, products, payments, checkout, My Account
- Has a custom helper plugin installed called nevari-pharmacy-core

Dashboard:
https://dashboard.example.com
- Next.js app
- Custom user dashboard
- Users should be able to log in here and also be authenticated on the WordPress/WooCommerce website
- Users who are already logged into WordPress should also be recognized by the Next.js dashboard

Goal:
Build a secure, scalable SSO-style authentication architecture between WordPress/WooCommerce and the Next.js dashboard.

Important:
Do not use iframe login.
Do not manually create WordPress cookies inside Next.js.
Do not store auth tokens in localStorage.
Use WordPress as the source of truth for users.
Use the WordPress plugin as the secure authentication bridge.
Use secure HttpOnly cookies and short-lived one-time SSO tokens.

Required architecture:

1. WordPress/WooCommerce remains the source of truth
- WordPress stores users
- WooCommerce customer accounts are WordPress users
- WordPress handles password validation
- WordPress creates its own auth cookies using wp_set_auth_cookie()
- Next.js should never fake or manually generate WordPress auth cookies

2. Next.js has its own dashboard session
- After login succeeds through WordPress, Next.js creates its own secure session
- The dashboard session should use HttpOnly, Secure, SameSite=Lax cookies
- Do not use localStorage for authentication
- Dashboard pages should check the Next.js session first
- Avoid calling WordPress on every single page load

3. WordPress plugin endpoints needed

Create these REST API endpoints inside nevari-pharmacy-core:

POST /wp-json/nevari/v1/login
Purpose:
- Accept email/username and password from Next.js
- Verify the user with wp_authenticate()
- If valid, call wp_set_current_user()
- Call wp_set_auth_cookie()
- Return safe user data to Next.js
- Do not return password or sensitive info

GET /wp-json/nevari/v1/me
Purpose:
- Check if the current request is authenticated in WordPress
- Return the current WordPress user data
- Return WooCommerce customer data if needed
- Return roles and permissions safely

POST /wp-json/nevari/v1/logout
Purpose:
- Log the user out of WordPress
- Clear WordPress session/cookies
- Return success so Next.js can also clear its own session

POST /wp-json/nevari/v1/sso-token
Purpose:
- Accept a valid Next.js-authenticated user request
- Verify that the user exists in WordPress
- Generate a short-lived one-time SSO token
- Token should expire in 30–60 seconds
- Token should be single-use
- Store token securely using a hashed value, not plain text
- Link token to user ID and expiry time

GET /wp-json/nevari/v1/sso-login?token=TOKEN&redirect=/my-account
Purpose:
- Validate the one-time token
- Check expiry
- Check it has not been used
- Mark token as used
- Call wp_set_current_user()
- Call wp_set_auth_cookie()
- Redirect user to the requested WordPress/WooCommerce page

4. Login flow from Next.js dashboard

Flow:
- User enters email and password on dashboard.example.com/login
- Next.js sends credentials to https://example.com/wp-json/nevari/v1/login
- WordPress plugin validates the credentials
- WordPress creates its own login session
- Next.js receives safe user data
- Next.js creates its own secure dashboard session
- User is redirected to /dashboard

5. Login flow from WordPress to Next.js

Flow:
- User logs in on example.com
- User visits dashboard.example.com
- Next.js calls https://example.com/wp-json/nevari/v1/me with credentials included
- If WordPress session is valid, return user data
- Next.js creates or refreshes its own dashboard session
- User enters dashboard without logging in again

6. Login flow from Next.js to WooCommerce

Flow:
- User is logged into dashboard.example.com
- User clicks “Go to checkout”, “My Account”, “Pay Invoice”, or any WordPress/WooCommerce link
- Next.js requests an SSO token from WordPress plugin
- Next.js redirects user to:
  https://example.com/wp-json/nevari/v1/sso-login?token=TOKEN&redirect=/checkout
- WordPress plugin validates token
- WordPress logs user in with wp_set_auth_cookie()
- User lands on WooCommerce already logged in

7. Cookie requirements

Use:
- HttpOnly
- Secure
- SameSite=Lax
- Path=/
- HTTPS only

Be careful with Domain=.example.com cookies.
Only use shared parent-domain cookies if all subdomains are trusted.
If not, keep WordPress cookies scoped to example.com and Next.js cookies scoped to dashboard.example.com.

8. Security requirements

Implement:
- HTTPS only
- CSRF protection for cookie-authenticated requests
- Rate limiting on login and SSO endpoints
- Brute-force protection
- One-time SSO tokens
- Short token expiry, 30–60 seconds
- Hashed SSO token storage
- Token replay protection
- Role/capability checks on every protected endpoint
- Input validation and sanitization
- Output escaping
- CORS restricted to dashboard.example.com only
- No wildcard CORS
- No localStorage tokens
- No iframe login
- No exposing WordPress auth cookies to JavaScript

9. Scalability requirements for 100k+ users

Design for:
- 100k+ registered users
- High traffic dashboard
- Avoid checking WordPress auth on every dashboard page request
- Use Next.js session after successful login
- Only call WordPress when fetching WooCommerce/customer data
- Use Redis/object cache on WordPress
- Cache non-sensitive data where possible
- Add database indexes if custom auth/session tables are used
- Use background queues for heavy jobs
- Use CDN/WAF such as Cloudflare
- Rate-limit REST API endpoints
- Make WooCommerce queries efficient
- Avoid expensive user meta queries on every request

10. Next.js implementation requirements

Build:
- /login page
- /dashboard protected page
- Server-side auth utilities
- Middleware for protected routes
- API route or server action for login
- API route or server action for logout
- Function to request WordPress SSO token
- Function to redirect user to WordPress/WooCommerce authenticated pages

Use:
- Secure HttpOnly cookies
- Server-side session handling
- fetch with credentials where needed
- Proper error states
- Loading states
- Unauthorized redirects

11. WordPress plugin implementation requirements

Inside nevari-pharmacy-core, create:
- REST route registration
- Login controller
- Current user controller
- Logout controller
- SSO token generator
- SSO login validator
- Token storage system
- Token cleanup system
- CORS restrictions
- Rate limiting helper
- Security validation helpers

Use WordPress functions:
- wp_authenticate()
- wp_set_current_user()
- wp_set_auth_cookie()
- wp_get_current_user()
- is_user_logged_in()
- wp_logout()
- wp_safe_redirect()
- current_user_can()
- wp_create_nonce() where needed
- sanitize_text_field()
- sanitize_email()
- esc_url_raw()

12. Expected deliverables

Please provide:

A. Full architecture explanation
B. Recommended folder structure for Next.js
C. Recommended folder structure for the WordPress plugin
D. WordPress REST API endpoint code
E. Next.js login implementation
F. Next.js session handling implementation
G. SSO token generation and validation code
H. Logout flow
I. CORS setup
J. CSRF protection approach
K. Rate limiting approach
L. Production checklist
M. Common mistakes to avoid

13. Important constraints

Do not suggest iframe login.
Do not suggest storing JWT in localStorage.
Do not suggest manually generating WordPress cookies from Next.js.
Do not make WordPress validate every dashboard page if Next.js already has a valid session.
Use secure SSO-style flow suitable for production and scalable to 100k+ users.

Build the solution as if this is for a real WooCommerce production platform.