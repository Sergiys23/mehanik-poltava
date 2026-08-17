# Fix package for Sergiys23/mehanik-poltava

The GitHub connector currently allows reading this repository but rejects write operations with HTTP 403, so these replacement files must be copied into the repository manually.

1. Replace `worker.js`, `app.js`, `index.html`, `admin.js` with the files here.
2. Add `migrations/0002_duration.sql`.
3. Delete the public `Passwordd` file from GitHub and change the exposed admin password.
4. Configure Cloudflare secrets:
   - ADMIN_PASSWORD
   - ADMIN_SESSION_SECRET
5. Apply the migration to an existing D1 database.
