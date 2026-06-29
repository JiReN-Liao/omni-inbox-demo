# Engineering Handoff

## Demo Script

1. Run `npm install`.
2. Run `npm run dev`.
3. Open `http://localhost:4317`.
4. Click `測試收訊` in the Accounts page.
5. Return to Inbox, assign the conversation, add tags, and create an internal note.
6. Switch user from Admin to Amy or Kai and confirm each agent only sees authorized accounts.

## LINE Setup

1. Create a LINE Messaging API channel.
2. Copy the channel secret and long-lived channel access token.
3. Add them in the Accounts page.
4. Set the LINE webhook URL to `https://your-domain/webhooks/line/{accountId}`.
5. Enable webhook usage in LINE Developers.

## Risks

- SQLite protects local persistence; production still needs encrypted off-device backups for total disk or host loss.
- Demo auth is only a header and must be replaced.
- Access tokens are plain text in the prototype.
- Reply tokens expire quickly; push messaging requires LINE account plan support.

## Suggested Next Sprint

- Add database migrations.
- Add login and organization membership.
- Add delivery retry logs.
- Add message templates and quick replies.
- Add Playwright end-to-end tests.
