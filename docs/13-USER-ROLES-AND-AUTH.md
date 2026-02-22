# 13 -- User Roles and Authentication

## Who Uses the System?

The Reporting Module defines three user roles, each representing a different level of access and responsibility:

- **Admin** -- The system configurator. Admins set up PLC connections, define tags, build report layouts, manage user accounts, configure shifts, and maintain all system settings. They have unrestricted access to every feature.

- **Manager** -- The production overseer. Managers can view live monitors, access reports, and reach the Engineering/Settings section (tags, groups, formulas, mappings, shifts, email, export/import, system settings). They cannot create or delete users (the Users tab is visible but user management actions like add/edit/delete require admin role on the backend).

- **Operator** -- The plant floor user. Operators can view the Live Monitor, browse and interact with Reports, and use the Report Builder. They have no access to the Engineering/Settings section.

---

## Roles and Permissions

The permission model is enforced at two levels: **frontend route guards** (via `ProtectedRoute` and the navigation sidebar) and **backend decorators** (`@login_required` and `@require_role`).

### Permission Matrix

| Feature | Admin | Manager | Operator |
|---------|:-----:|:-------:|:--------:|
| Live Monitor (view) | Yes | Yes | Yes |
| Reports / Report Viewer | Yes | Yes | Yes |
| Report Builder | Yes | Yes | Yes |
| Engineering / Settings | Yes | Yes | No |
| Tags Management | Yes | Yes | No |
| Tag Groups | Yes | Yes | No |
| Formulas | Yes | Yes | No |
| Mappings | Yes | Yes | No |
| Shift Configuration | Yes | Yes | No |
| Email / SMTP Settings | Yes | Yes | No |
| Export / Import | Yes | Yes | No |
| System Settings (PLC, mode) | Yes | Yes | No |
| User Management (view list) | Yes | Yes | No |
| User Management (add/edit/delete) | Yes | No | No |
| Change Own Password | Yes | Yes | Yes |

### How this is enforced

**Frontend (route-level):**

In `AppRoutes.jsx`, routes are wrapped with `<ProtectedRoute roles={[...]}>`. The key distinctions:

- Live Monitor, Reports, and Report Builder routes accept all three roles: `[Roles.Admin, Roles.Manager, Roles.Operator]`.
- The `/settings` parent route (Engineering) is restricted to `[Roles.Admin, Roles.Manager]`.
- The Login page uses `ProtectedCredentials`, which redirects already-authenticated users away from the login page.

**Frontend (navigation-level):**

In `Navbar.js`, menu items define their allowed `roles` array:

- Report Builder: `[admin, manager, operator]`
- Reporting: `[admin, manager, operator]`
- Engineering: `[admin, manager]`

The `SideNav` component checks `auth.role` against each item's `roles` array and only renders items the current user is authorized to see.

**Backend (endpoint-level):**

- `@login_required` -- Flask-Login decorator. Any unauthenticated request returns `401 Unauthorized`.
- `@require_role('admin')` -- Custom decorator. Returns `403 Insufficient permissions` if the authenticated user's role is not in the allowed list.

The following backend routes use `@require_role('admin')`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/add-user` | POST | Create a new user |
| `/delete-user/<id>` | DELETE | Delete a user |
| `/update-user/<id>` | PUT | Edit username/role |
| `/change-password/<id>` | POST | Reset another user's password |

The `@require_role` decorator (defined in `app.py`) works as follows:

```python
def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Not authenticated'}), 401
            if current_user.role not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator
```

---

## User Management

User management is available through **Engineering > Users**. Only admins can perform user CRUD operations (add, edit, delete, reset passwords). Managers can view the user list but not modify it. Operators cannot access the Settings section at all.

### Creating a user (Admin only)

1. Navigate to **Engineering > Users**.
2. In the "Add New User" section, enter:
   - **Username** -- must be unique.
   - **Password** -- minimum 2 characters.
   - **Role** -- select `admin`, `manager`, or `operator` from the dropdown.
3. Click **Add User**.

The backend hashes the password using Werkzeug's `generate_password_hash()` before storing it in the `users` table. Duplicate usernames are rejected with an error.

### Editing a user (Admin only)

1. In the user table, click the **Edit** icon next to the target user.
2. Modify the **username** or **role** inline.
3. Click the checkmark to save, or the X to cancel.

The backend prevents demoting the **last remaining admin** -- if there is only one admin user, their role cannot be changed to manager or operator.

### Resetting a password (Admin only)

1. Click the **Key** icon next to the target user.
2. Enter the new password in the inline field.
3. Click the checkmark to confirm.

### Deleting a user (Admin only)

1. Click the **Trash** icon next to the target user.
2. A confirmation prompt appears inline ("Delete?").
3. Click the checkmark to confirm deletion.

> **Note:** User deletion is a hard delete (the row is removed from the database). There is no soft-delete or deactivation mechanism in the current version.

### Changing your own password (All roles)

Any authenticated user can change their own password:

1. In the "Change My Password" section (visible to all roles), enter:
   - **Current Password** -- verified against the stored hash.
   - **New Password** -- minimum 2 characters.
   - **Confirm Password** -- must match the new password.
2. Click **Change Password**.

---

## Authentication Flow

The system uses **session-based authentication** with Flask-Login, supplemented by **bearer tokens** for cross-origin API requests.

### Login sequence

```
1. User visits /login
2. Enters username + password
3. Frontend POSTs to /login with JSON: { username, password }
4. Backend:
   a. Queries: SELECT id, username, password_hash, role FROM users WHERE username = ?
   b. Verifies password using check_password_hash()
   c. On success: calls login_user() to create a Flask session
   d. Generates a bearer token using itsdangerous.URLSafeTimedSerializer
   e. Returns JSON response with user_data (id, username, role, auth_token)
5. Frontend:
   a. Stores auth_token in localStorage (key: 'auth_token')
   b. Sets auth state in AuthContext (user object with id, username, role)
   c. Navigates to the home page
```

### Token generation

Tokens are generated using the `itsdangerous` library:

```python
from itsdangerous import URLSafeTimedSerializer

def _auth_token_serializer():
    return URLSafeTimedSerializer(app.secret_key, salt='auth-token')

# On login:
auth_token = _auth_token_serializer().dumps({'user_id': user['id']})
```

The token encodes the `user_id` and is signed with the application's `secret_key`. It expires after **7 days** (86400 * 7 seconds).

### Token usage on subsequent requests

The Axios instance (`Frontend/src/API/axios.js`) is configured with a request interceptor that attaches the token to every outgoing request:

```javascript
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

On the backend, Flask-Login's `request_loader` extracts and validates the token from the `Authorization` header:

```python
@login_manager.request_loader
def load_user_from_request(request):
    auth = request.headers.get('Authorization')
    if auth and auth.startswith('Bearer '):
        token = auth[7:].strip()
        data = _auth_token_serializer().loads(token, max_age=86400 * 7)
        user_id = data.get('user_id')
        if user_id:
            return load_user(int(user_id))
    return None
```

This dual approach (session cookies + bearer tokens) ensures authentication works both in same-origin deployments (cookies) and cross-origin setups (bearer tokens via the `Authorization` header).

### Token expiry and session handling

- If a token expires (older than 7 days) or is invalid, the `request_loader` returns `None`, and the request is treated as unauthenticated.
- The Axios response interceptor detects `401` responses: it removes the stored token from `localStorage` and logs a warning. The user must log in again.
- The `AuthProvider` component calls `/check-auth` on mount to verify the current session. If the session is invalid, `auth` is set to `null`, and `ProtectedRoute` redirects the user to `/login`.

### Logout

1. Frontend calls `POST /logout`.
2. Backend calls `logout_user()` to clear the Flask session.
3. Frontend removes the token from `localStorage` and clears the auth state.

---

## DEV_MODE -- Development Bypass

The system includes a development mode that bypasses authentication for local testing.

### Frontend DEV_MODE

In `AuthProvider.jsx`, a constant `DEV_MODE` can be set to `true`:

```javascript
const DEV_MODE = true;
```

When enabled:

- The auth state is initialized immediately with a mock admin user: `{ id: 0, username: 'dev_admin', role: 'admin' }`.
- The `validateUser()` function (which calls `/check-auth`) is skipped entirely.
- Logout simply clears the auth state without calling the backend.

### Backend Demo Mode

On the backend, when demo mode is active (`FLASK_ENV=development` or `DEV_MODE=1`), a `before_request` hook (`demo_auto_login`) automatically authenticates requests:

1. If no user is currently authenticated, the hook queries the database for an admin user (or any user).
2. It calls `login_user()` with that user object, effectively auto-authenticating every request.
3. This means `@login_required` decorators pass without the client needing to log in.

> **WARNING:** Never enable DEV_MODE or demo mode in production. It bypasses all authentication, giving every request full admin access.

---

## Route Protection

### Frontend: ProtectedRoute component

The `ProtectedRoute` component (`Frontend/src/Routes/ProtectedRoute.jsx`) wraps protected pages:

```jsx
export function ProtectedRoute({ children, roles = [Roles.Admin, Roles.Manager, Roles.Operator] }) {
  const { auth } = useContext(AuthContext);
  if (auth && roles.includes(auth.role)) {
    return children ? children : <Outlet />;
  } else {
    return <Navigate to="/login" />;
  }
}
```

- If the user is authenticated and their role is in the allowed list, the child content renders.
- Otherwise, the user is redirected to `/login`.
- The default `roles` prop allows all three roles, so wrapping a route with `<ProtectedRoute>` without specifying roles requires only authentication (any role).

A companion component, `ProtectedCredentials`, is used on the login page to redirect already-authenticated users away from the login form.

### Backend: Unauthorized handler

Flask-Login's unauthorized handler distinguishes between API and page requests:

- **API requests** (paths starting with `/api/`, JSON requests, etc.) receive a JSON `401` response: `{ "error": "Unauthorized", "message": "Authentication required", "authenticated": false }`.
- **Non-API requests** (HTML pages) are redirected to the login page via `redirect(url_for('login'))`.

---

## For Developers

### Key source files

| File | Purpose |
|------|---------|
| `Frontend/src/Context/AuthProvider.jsx` | AuthContext provider -- manages auth state, token storage, login/logout, DEV_MODE bypass |
| `Frontend/src/Routes/ProtectedRoute.jsx` | Route guard component -- checks auth state and role before rendering |
| `Frontend/src/Routes/AppRoutes.jsx` | Route definitions -- maps paths to components with role-based guards |
| `Frontend/src/Data/Roles.js` | Role constants: `admin`, `manager`, `operator` |
| `Frontend/src/Data/Navbar.js` | Sidebar navigation items with per-item role arrays |
| `Frontend/src/API/axios.js` | Axios instance with bearer token interceptor and 401 handling |
| `Frontend/src/API/endpoints.js` | API endpoint URL definitions (auth, users) |
| `Frontend/src/Pages/Login.jsx` | Login page -- form, validation, token storage |
| `Frontend/src/Pages/Settings/Users/UserManagement.jsx` | User CRUD UI (admin-only actions) |
| `backend/app.py` | Backend auth: Flask-Login setup, login/logout routes, user CRUD, `require_role` decorator, token generation/validation |

### User database schema

Users are stored in a `users` table with this structure:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Auto-incrementing user ID |
| `username` | VARCHAR | Unique username |
| `password_hash` | VARCHAR | Werkzeug-hashed password |
| `role` | VARCHAR | One of: `admin`, `manager`, `operator` |

### Backend API endpoints

| Method | Route | Auth | Role Guard | Purpose |
|--------|-------|------|------------|---------|
| POST | `/login` | None | None | Authenticate user, return token |
| POST | `/logout` | `@login_required` | None | End session |
| GET | `/check-auth` | None | None | Check if current session is valid |
| GET | `/users` | `@login_required` | None | List all users (id, username, role) |
| POST | `/add-user` | `@login_required` | `@require_role('admin')` | Create a new user |
| PUT | `/update-user/<id>` | `@login_required` | `@require_role('admin')` | Update username and role |
| DELETE | `/delete-user/<id>` | `@login_required` | `@require_role('admin')` | Delete a user |
| POST | `/change-password/<id>` | `@login_required` | `@require_role('admin')` | Reset another user's password |
| POST | `/change-own-password` | `@login_required` | None | Change your own password (verifies current password) |

### Role validation

When updating a user's role, the backend validates that:

1. The `role` value is one of `admin`, `manager`, or `operator`. Any other value returns a `400` error.
2. If the user being edited is the last admin, their role cannot be changed. This prevents a state where no admin exists.

### Token internals

- **Library:** `itsdangerous.URLSafeTimedSerializer`
- **Secret:** `app.secret_key` (defaults to `'hercules-dev-secret-key-2026'` in development; should be overridden via `FLASK_SECRET_KEY` environment variable in production)
- **Salt:** `'auth-token'`
- **Max age:** 604,800 seconds (7 days)
- **Payload:** `{ 'user_id': <int> }`
- **Transport:** `Authorization: Bearer <token>` header on every API request

### CORS and credentials

The backend maintains an explicit allowlist of origins (`ALLOWED_ORIGINS` in `app.py`). Cross-origin requests must come from an allowed origin and include `credentials: true`. The `Authorization` header is included in `Access-Control-Allow-Headers`. This ensures that bearer tokens are accepted from cross-origin frontend deployments (e.g., Vite dev server on port 5174, Netlify deployments, or Cloudflare tunnels).

---

Previous: [12-SHIFTS-AND-ORDERS](12-SHIFTS-AND-ORDERS.md) | Next: [14-DEPLOYMENT](14-DEPLOYMENT.md)
