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
- Demo-safe credentials and seeded conversations across all three platforms.
- Durable SQLite storage with WAL, full synchronous commits, checksums, version snapshots, and automatic backup recovery.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:4317` and use the platform tabs under **Accounts** to try each connector.

## Test

```bash
npm run check
npm test
```

## Connector Setup

LINE uses a channel secret and channel access token. Messenger and Instagram use a Meta app secret, page access token, and Page or Instagram professional account ID. Successful verification returns the callback URL and, for Meta, a callback verification token.

Production callbacks require a public HTTPS deployment. Meta self-service onboarding should use Facebook Login for Business and requires the relevant permissions, App Review, and Business Verification before connecting customer-owned assets.

## Demo Users

- `Admin`: all three platforms and permission management.
- `Amy`: LINE and Instagram.
- `Kai`: Messenger.

## Documentation

- [Product brief](docs/PRODUCT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Engineering handoff](docs/HANDOFF.md)
- [Pitch](docs/PITCH.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)

Application state is stored in `omni-inbox.sqlite`; verified recovery copies are retained under `backups/`. An existing `data.json` is imported automatically on first launch. Production hardening should additionally provide off-device encrypted backups, real authentication, encrypted secrets, queue-backed delivery retries, and centralized observability.
