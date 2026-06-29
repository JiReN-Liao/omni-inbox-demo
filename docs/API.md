# API

Demo API requests use `x-demo-user`. Unknown identities receive `401 UNKNOWN_DEMO_USER`; a missing header defaults to `admin` for the local showcase. Responses include `x-request-id`, and errors include `error`, `code`, and `requestId`.

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
- `GET /api/stream`: Server-Sent Events channel for realtime refresh.
- `GET /api/me`: current demo identity and available users.
- `PUT /api/users/:userId/access`: update an agent's account access. Admin only.
- `POST /api/simulate`: create a demo inbound event on any visible account.

## Limits

- Message: 5,000 characters.
- Internal note: 2,000 characters.
- Tag: 40 characters, up to eight unique tags.
- Webhook batch: 100 events.
