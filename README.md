# Omni Inbox

Omnichannel customer support workspace for LINE, Facebook Messenger, and Instagram messages.

This portfolio project demonstrates connector architecture, signed webhooks, third-party API delivery, account-level permissions, realtime UI updates, bilingual product design, and engineering handoff quality.

## Capabilities

- One inbox for LINE, Messenger, and Instagram conversations.
- Platform-aware account cards, conversation filters, and message delivery.
- LINE `x-line-signature` and Meta `x-hub-signature-256` verification.
- Credential-based connector setup with account profile import.
- Agent access control by connected account.
- Assignment, status, priority, tags, notes, handoff summaries, and operational insights.
- Traditional Chinese and English interfaces with saved preference.
- Server-Sent Events for realtime refresh.
- Username/password sign-in with server-side sessions, scrypt-hashed passwords, CSRF protection, and login rate limiting.
- Durable SQLite storage with WAL, full synchronous commits, checksums, version snapshots, and automatic backup recovery.

## Run

```bash
npm install

# First launch only: create the initial administrator. The password is hashed
# on startup and the plaintext is never stored or logged.
BOOTSTRAP_ADMIN_USERNAME=admin BOOTSTRAP_ADMIN_PASSWORD='a-long-random-password' npm run dev
```

Open `http://localhost:4317`. You are redirected to `/login`; sign in with the
administrator credentials above to reach the console. Use the platform tabs
under **Accounts** to try each connector.

## Authentication

The console is gated by a real login. Unauthenticated requests to `/` are
redirected to `/login`, and every `/api` route requires a valid session.

- **First administrator** — set `BOOTSTRAP_ADMIN_USERNAME` and
  `BOOTSTRAP_ADMIN_PASSWORD` (see `.env.example`). On startup, if no admin
  exists, the credential is created and the password is hashed with
  `crypto.scrypt`. If an admin already exists, the variables are ignored and
  never overwrite a stored password. Unset them after first launch.
- **Sign in / out** — `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`. Login mints a fresh session id (preventing fixation) and
  sets an `HttpOnly`, `SameSite=Lax` cookie (`Secure` is added automatically
  over HTTPS). The top-right account menu shows the signed-in operator, role,
  account settings, and sign-out.
- **Sessions** — stored in a dedicated `omni-auth.sqlite` database, isolated
  from conversation data so session churn and expiry never touch conversations,
  accounts, messages, snapshots, or backups. Expired sessions are swept
  automatically.
- **CSRF** — state-changing requests on a cookie session must send the
  `x-csrf-token` issued at login (the frontend does this automatically).
- **Rate limiting** — repeated failed logins per username/IP trigger a
  temporary lockout. Wrong password and unknown user return one identical error.
- **Roles** — Admin and Agent permissions and per-account access are unchanged;
  the live console no longer allows arbitrary identity switching.

### Changing a password / adding members

Password changes and new members are managed server-side. With the server
stopped, rotate the admin password by clearing the admin credential and
re-bootstrapping, or use the exported `setPassword(userId, password)` /
`upsertCredential(...)` helpers in `src/auth.js` from a small Node script. See
[Deployment](docs/DEPLOYMENT.md) for production guidance.

## Test

```bash
npm run check
npm test
```

## Connector Setup

LINE uses a channel secret and channel access token. Messenger and Instagram use a Meta app secret, page access token, and Page or Instagram professional account ID. Successful verification returns the callback URL and, for Meta, a callback verification token.

Production callbacks require a public HTTPS deployment. Meta self-service onboarding should use Facebook Login for Business and requires the relevant permissions, App Review, and Business Verification before connecting customer-owned assets.

## Roles

Each operator signs in with their own credential. Roles and per-account access:

- `Admin`: all three platforms and permission management.
- `Amy` (agent): LINE and Instagram.
- `Kai` (agent): Messenger.

The bootstrap step creates the `Admin` credential. Agent credentials are
provisioned by an administrator (via `upsertCredential` in `src/auth.js`); the
seed only defines their roles and account access, not passwords.

## Documentation

- [Product brief](docs/PRODUCT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Engineering handoff](docs/HANDOFF.md)
- [Pitch](docs/PITCH.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)

Application state is stored in `omni-inbox.sqlite`; credentials and sessions live in a separate `omni-auth.sqlite`; verified recovery copies are retained under `backups/`. An existing `data.json` is imported automatically on first launch. Secrets, credentials, hashes, tokens, and cookies are never committed (`.env`, `*.sqlite*`, `data.json`, and `backups/` are git-ignored). Production hardening should additionally provide off-device encrypted backups, encrypted secrets at rest, queue-backed delivery retries, and centralized observability.
