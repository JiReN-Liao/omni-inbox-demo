# Pitch

## One-liner

Omni Inbox brings LINE, Facebook Messenger, and Instagram customer conversations into one permission-aware support workspace.

## Why This Demonstrates Vibe Coding Ability

- It turns an ambiguous idea into a coherent product, not just a styled screen.
- It integrates two provider ecosystems with different credentials, signatures, payloads, and delivery APIs.
- It normalizes platform events into one reusable conversation model.
- It combines security boundaries, realtime behavior, operational workflows, bilingual UX, tests, and documentation.
- It includes a demo mode that proves the end-to-end flow without leaking or requiring real credentials.

## Five-Minute Demo

1. Start in the unified inbox and compare LINE, Messenger, and Instagram conversations.
2. Filter by platform, priority, or waiting time and open a customer thread.
3. Switch from Admin to Amy or Kai to demonstrate account-level data isolation.
4. Add an internal note, assign ownership, send a reply, and inspect the handoff summary.
5. Open Platform Connections, switch connector tabs, and connect a demo Messenger account.
6. Show the realtime counters, bilingual language switch, and passing test suite.

## Engineering Story

The inbox domain does not know provider payload formats. LINE and Meta connectors verify, normalize, and deliver at the system edge; the shared store and UI own permissions, workflow, and analytics. This makes WhatsApp, Telegram, or another channel an additive connector rather than a product rewrite.
