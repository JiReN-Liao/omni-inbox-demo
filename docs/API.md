# API

Every `/api` route requires an authenticated session (see **Authentication**). Responses include `x-request-id`, and errors include `error`, `code`, and `requestId`.

> The legacy `x-demo-user` / `?demoUser=` shortcut is honoured **only** under the automated test runner (`NODE_TEST_CONTEXT`). In any other environment it is ignored and a real session is required.

## Authentication

- `POST /api/auth/login`: body `{ username, password }`. On success sets an `HttpOnly`, `SameSite=Lax` session cookie (`Secure` over HTTPS), returns `{ user, csrfToken }`, and mints a fresh session id (prevents fixation). Wrong password and unknown user both return `401 INVALID_CREDENTIALS` with an identical message. Too many failures return `429 ACCOUNT_LOCKED`.
- `POST /api/auth/logout`: destroys the current session and clears the cookie.
- `GET /api/auth/me`: returns `{ user, csrfToken }` for the active session, or `{ user: null }` when signed out. Never errors.

Unauthenticated `/api` requests receive `401 NOT_AUTHENTICATED`. State-changing requests (`POST`/`PUT`/`PATCH`/`DELETE`) authenticated by a cookie session must send the session's `x-csrf-token`; a missing or wrong token returns `403 INVALID_CSRF_TOKEN`. `GET /` redirects unauthenticated visitors to `/login`.

## Accounts and Connectors

- `GET /api/accounts`: list accounts visible to the current user.
- `POST /api/accounts`: create or update an account. Admin only.
- `POST /api/line/connect`: verify LINE credentials, import the bot identity, and return its webhook URL.
- `POST /api/platforms/messenger/connect`: verify a Facebook Page connector and return callback settings.
- `POST /api/platforms/instagram/connect`: verify an Instagram professional account connector and return callback settings.

Meta connector requests accept `appSecret`, `pageAccessToken`, `externalAccountId`, and an optional `name`. LINE accepts `channelSecret`, `channelAccessToken`, and an optional `name`. Stored credentials are masked from API responses.

## Conversations

- `GET /api/conversations`: permission-filtered, searchable, paginated conversations across platforms.
- `GET /api/conversations/:conversationId`: conversation, normalized messages, and notes.
- `GET /api/conversations/:conversationId/handoff`: structured handoff brief.
- `PATCH /api/conversations/:conversationId`: status, assignee, priority, and tags.
- `POST /api/conversations/:conversationId/notes`: internal note.
- `POST /api/conversations/:conversationId/send`: route a text reply through the conversation account's connector.

Send responses include a generic `delivery` result. The legacy `line` alias remains temporarily for compatibility.

## Webhooks

- `POST /webhooks/line/:accountId`: validates `x-line-signature` and ingests LINE events.
- `GET /webhooks/meta/:accountId`: completes Meta callback verification using `hub.verify_token`.
- `POST /webhooks/meta/:accountId`: validates `x-hub-signature-256` and ingests Messenger or Instagram events.

Provider message IDs are retained in a bounded deduplication window so webhook retries do not create duplicate messages.

## Operations

- `GET /api/stats`: visible workload counters.
- `GET /api/insights`: platform/account distribution, status totals, unassigned work, priority, and waiting conversations.
- `GET /api/audit`: permission-filtered operational events.
- `GET /api/stream`: Server-Sent Events channel for realtime refresh. Authenticates with the session cookie (EventSource sends it automatically); identity is never passed in the URL.
- `GET /api/me`: current identity and the team list (for assignment).
- `PUT /api/users/:userId/access`: update an agent's account access. Admin only.
- `POST /api/simulate`: create a demo inbound event on any visible account.

## Limits

- Message: 5,000 characters.
- Internal note: 2,000 characters.
- Tag: 40 characters, up to eight unique tags.
- Webhook batch: 100 events.
