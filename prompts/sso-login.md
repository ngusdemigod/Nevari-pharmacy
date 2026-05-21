You are a senior full-stack engineer. I need you to implement secure SSO-style authentication between my Next.js dashboard and my WordPress/WooCommerce website.

Project setup:

Main website:
https://example.com
- WordPress
- WooCommerce
- User accounts and customer accounts live here
- WordPress should remain the source of truth for authentication
- A custom WordPress plugin already exists: nevari-pharmacy-core

Dashboard:
https://dashboard.example.com
- Next.js app
- Custom customer dashboard
- Users should be able to log in from the Next.js dashboard
- When logged in on Next.js, they should also be logged in on WordPress/WooCommerce
- When already logged in on WordPress, they should be recognized on the Next.js dashboard

Important rules:
- Do not use iframe login.
- Do not store auth tokens in localStorage.
- Do not manually generate WordPress cookies from Next.js.
- WordPress must create its own auth cookies using WordPress functions.
- Next.js must have its own secure HttpOnly session.
- Use the WordPress plugin as the auth bridge.
- Use HTTPS-only secure cookies.
- Build this for production and scalability.

I want you to implement the feature using this architecture:

1. WordPress is the auth source of truth

WordPress handles:
- User lookup
- Password validation
- WooCommerce customer identity
- WordPress auth cookies
- WordPress logout

Use these WordPress functions:
- wp_authenticate()
- wp_set_current_user()
- wp_set_auth_cookie()
- wp_get_current_user()
- is_user_logged_in()
- wp_logout()
- wp_safe_redirect()
- current_user_can()
- sanitize_text_field()
- sanitize_email()
- esc_url_raw()

2. Next.js has its own session

After WordPress login succeeds, Next.js should create its own dashboard session.

Session cookie settings:
- HttpOnly
- Secure
- SameSite=Lax
- Path=/
- Scoped to dashboard.example.com
- Do not expose the session token to JavaScript

Dashboard pages should check the Next.js session first.

Do not call WordPress /me on every single page load unless the Next.js session is missing, expired, or needs refreshing.

3. Create these WordPress plugin REST endpoints inside nevari-pharmacy-core

Endpoint 1:

POST /wp-json/nevari/v1/login

Purpose:
- Accept email/username and password from Next.js
- Sanitize input
- Validate user using wp_authenticate()
- If invalid, return 401
- If valid:
  - call wp_set_current_user($user_id)
  - call wp_set_auth_cookie($user_id, true, is_ssl())
  - return safe user data to Next.js

Returned user data should include:
- id
- email
- display_name
- roles
- WooCommerce customer id if available

Do not return:
- password
- password hash
- raw auth cookie
- sensitive user meta

Endpoint 2:

GET /wp-json/nevari/v1/me

Purpose:
- Check if the user is logged into WordPress
- If logged in, return safe user data
- If not logged in, return 401

Endpoint 3:

POST /wp-json/nevari/v1/logout

Purpose:
- Log user out of WordPress using wp_logout()
- Return success
- Next.js will also clear its own dashboard session

Endpoint 4:

POST /wp-json/nevari/v1/sso-token

Purpose:
- Allow a valid dashboard-authenticated user to request a WordPress login token
- Accept user_id from a trusted server-side Next.js request
- Verify the user exists in WordPress
- Generate a random secure one-time token
- Hash the token before storing it
- Store:
  - hashed token
  - user_id
  - expires_at
  - used_at
  - created_at
- Token should expire in 60 seconds
- Token must be single-use

Endpoint 5:

GET /wp-json/nevari/v1/sso-login?token=TOKEN&redirect=/checkout

Purpose:
- Validate the SSO token
- Check token exists
- Check token is not expired
- Check token has not been used
- Mark token as used
- Log user into WordPress:
  - wp_set_current_user($user_id)
  - wp_set_auth_cookie($user_id, true, is_ssl())
- Redirect user safely using wp_safe_redirect()
- Only allow internal redirects like:
  - /my-account
  - /checkout
  - /cart
  - /orders
  - /pay-for-order
- Do not allow open redirects to external domains

4. Login flow from Next.js dashboard

Implement this flow:

User visits:
dashboard.example.com/login

User submits email and password.

Next.js server action or API route sends:

POST https://example.com/wp-json/nevari/v1/login

If WordPress responds successfully:
- Create a Next.js dashboard session
- Store user id, email, display name, roles in the session
- Redirect user to /dashboard

If WordPress returns error:
- Show a clean login error
- Do not expose technical errors to the user

5. WordPress to Next.js login recognition

When user visits dashboard.example.com and does not have a Next.js session:

Next.js should call:

GET https://example.com/wp-json/nevari/v1/me

Use credentials/include if needed.

If WordPress session is valid:
- Create a Next.js session
- Redirect user to /dashboard

If not valid:
- Redirect user to /login

6. Next.js to WooCommerce authenticated redirect

When a logged-in dashboard user clicks:
- Go to checkout
- My Account
- Pay invoice
- View order
- Make payment

Next.js should:
- Request SSO token server-side from WordPress
- Receive token
- Redirect user to:

https://example.com/wp-json/nevari/v1/sso-login?token=TOKEN&redirect=/checkout

WordPress validates token, logs user in, and redirects them to WooCommerce page already authenticated.

7. Security requirements

Implement:
- HTTPS only
- HttpOnly cookies
- Secure cookies
- SameSite=Lax
- No localStorage auth tokens
- No iframe login
- No wildcard CORS
- CORS should only allow https://dashboard.example.com
- Rate limit login endpoint
- Rate limit SSO token endpoint
- One-time SSO tokens
- 60-second SSO token expiry
- Hashed SSO token storage
- Replay protection
- CSRF protection for cookie-authenticated state-changing requests
- Input sanitization
- Output escaping
- Role and capability checks
- Safe redirects only
- Proper error responses

8. CORS requirements

In the WordPress plugin:
- Allow requests only from localhost and dash.nevarihealth.com/wp-admin
- Allow credentials
- Allow needed methods: GET, POST, OPTIONS
- Allow needed headers: Content-Type, Authorization, X-WP-Nonce if needed
- Do not use Access-Control-Allow-Origin: *

9. Rate limiting

Add basic rate limiting for:
- Login attempts
- SSO token creation
- SSO login validation

Use transient-based rate limiting or a dedicated table.

Example limits:
- Login: 5 failed attempts per email/IP per 10 minutes
- SSO token: 20 requests per user per 10 minutes
- SSO login: 20 attempts per IP per 10 minutes

10. Token storage

Create a custom database table:

wp_nevari_sso_tokens

Fields:
- id BIGINT primary key
- user_id BIGINT not null
- token_hash VARCHAR(255) not null
- expires_at DATETIME not null
- used_at DATETIME nullable
- created_at DATETIME not null
- ip_address VARCHAR(100) nullable
- user_agent TEXT nullable

Add indexes:
- token_hash
- user_id
- expires_at

Token rules:
- Generate using random_bytes()
- Convert to URL-safe string
- Store only hash using hash_hmac() or password_hash()
- Never store plain token
- Token expires after 60 seconds
- Token can only be used once

11. Next.js implementation requirements

Implement the following files or equivalent structure:

/app/login/page.tsx
- Login form
- Shows errors
- Submits to server action

/app/dashboard/page.tsx
- Protected dashboard page

/app/api/auth/login/route.ts
- Accepts login form data
- Calls WordPress login endpoint
- Creates secure dashboard session

/app/api/auth/logout/route.ts
- Clears Next.js session
- Calls WordPress logout endpoint

/app/api/auth/sso/route.ts
- Requires valid dashboard session
- Requests one-time SSO token from WordPress
- Redirects user to WordPress sso-login URL

/lib/auth/session.ts
- Create session
- Read session
- Destroy session
- Protect routes

/lib/auth/wordpress.ts
- WordPress API client
- loginToWordPress()
- getWordPressMe()
- logoutWordPress()
- requestSsoToken()

/middleware.ts
- Protect /dashboard routes
- Redirect unauthenticated users to /login

Use either:
- iron-session
or
- jose with signed encrypted cookies
or
- NextAuth custom credentials provider

Choose one secure session strategy and implement it cleanly.

12. WordPress plugin structure

Inside nevari-pharmacy-core, use a clean structure like:

nevari-pharmacy-core/
  nevari-pharmacy-core.php
  includes/
    class-rest-auth-controller.php
    class-sso-token-service.php
    class-rate-limiter.php
    class-cors.php
    class-security.php
    class-activator.php
    class-deactivator.php

Implement:
- Plugin activation table creation
- REST route registration
- Auth controller
- SSO token service
- Token cleanup
- Rate limiter
- CORS handler
- Safe redirect validator

13. Logout flow

When user logs out from Next.js:
- Call WordPress logout endpoint
- Clear Next.js session cookie
- Redirect to /login

When user logs out from WordPress:
- WordPress clears its own session
- Next.js should detect expired/missing WordPress session only when session refresh/check happens
- Optional: create a shared logout redirect to dashboard logout

14. Production checklist

At the end, provide a checklist covering:
- HTTPS
- Cookie settings
- CORS
- Rate limiting
- CSRF
- Token expiry
- Token replay prevention
- Safe redirects
- Error logging
- WooCommerce customer data permissions
- Redis/object cache
- Database indexing
- Monitoring
- Brute-force protection

15. Expected output

Please generate:

A. The full implementation plan
B. WordPress plugin PHP code
C. Database table creation code
D. REST API endpoint code
E. SSO token generation code
F. SSO token validation code
G. CORS code
H. Rate limiting code
I. Next.js session code
J. Next.js login route/server action
K. Next.js logout route
L. Next.js SSO redirect route
M. Middleware for protected dashboard routes
N. Example login page
O. Example dashboard page
P. Environment variables needed
Q. Final testing steps

Use clean, production-ready code.

Do not give me only theory. Implement the feature.