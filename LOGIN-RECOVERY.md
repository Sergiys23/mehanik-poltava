# Login recovery — 2026-08-27

The production Worker uses `security-worker.js` as its entrypoint.

Fixes:
- `/api/auth/login` and logout are handled before the full D1 schema bootstrap.
- Security rate-limit database errors no longer turn the login page into HTTP 500.
- Admin and superadmin roles are exposed to the role UI consistently.
- Cache-busting query strings updated.

Deploy the Worker using the existing secrets/bindings. Do not change passwords or D1/R2 IDs.
