import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { app } from "../src/server.js";
import { resetDataForDemo } from "../src/store.js";

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("health endpoint reports ok", async () => {
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/healthz`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.storage.engine, "sqlite");
    assert.equal(body.storage.integrity, "ok");
  } finally {
    server.close();
  }
});

test("destructive demo reset is disabled by default", async () => {
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/demo/reset`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "admin" },
      body: "{}"
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "DEMO_RESET_DISABLED");
  } finally {
    server.close();
  }
});

test("demo send stores outbound messages without calling real LINE", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/conversations/oa_acme%3AUjohn-smith/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "amy" },
      body: JSON.stringify({ text: "Demo reply" })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.delivery.mode, "demo");
    assert.equal(body.message.status, "sent");
  } finally {
    server.close();
  }
});

test("webhook accepts valid signatures and rejects invalid signatures", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const payload = JSON.stringify({
      destination: "demo",
      events: [
        {
          type: "message",
          replyToken: "reply-token",
          source: { type: "user", userId: "Uapi-test" },
          message: { type: "text", text: "hello" }
        }
      ]
    });
    const signature = crypto.createHmac("sha256", "demo-secret-acme").update(Buffer.from(payload)).digest("base64");

    const valid = await fetch(`${baseUrl(server)}/webhooks/line/oa_acme`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: payload
    });
    assert.equal(valid.status, 200);

    const invalid = await fetch(`${baseUrl(server)}/webhooks/line/oa_acme`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": "bad" },
      body: payload
    });
    assert.equal(invalid.status, 401);
  } finally {
    server.close();
  }
});

test("unknown demo users are rejected instead of inheriting admin access", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/me`, {
      headers: { "x-demo-user": "not-a-user", "accept-language": "zh-TW" }
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.code, "UNKNOWN_DEMO_USER");
    assert.equal(body.error, "找不到指定的示範使用者。");
    assert.ok(response.headers.get("x-request-id"));
  } finally {
    server.close();
  }
});

test("conversation updates validate status and account-scoped assignees", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const invalidStatus = await fetch(`${baseUrl(server)}/api/conversations/oa_acme%3AUjohn-smith`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-demo-user": "admin" },
      body: JSON.stringify({ status: "deleted" })
    });
    assert.equal(invalidStatus.status, 400);

    const invalidAssignee = await fetch(`${baseUrl(server)}/api/conversations/oa_acme%3AUjohn-smith`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-demo-user": "admin" },
      body: JSON.stringify({ assigneeId: "kai" })
    });
    const body = await invalidAssignee.json();
    assert.equal(invalidAssignee.status, 400);
    assert.equal(body.code, "INVALID_CONVERSATION_PATCH");
  } finally {
    server.close();
  }
});

test("insights and handoff endpoints expose portfolio-ready operational data", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const headers = { "x-demo-user": "admin", "accept-language": "zh-TW" };
    const insightsResponse = await fetch(`${baseUrl(server)}/api/insights`, { headers });
    const insights = (await insightsResponse.json()).insights;
    assert.equal(insightsResponse.status, 200);
    assert.equal(insights.totals.visibleAccounts, 3);
    assert.ok(Array.isArray(insights.byAccount));

    const handoffResponse = await fetch(`${baseUrl(server)}/api/conversations/oa_acme%3AUjohn-smith/handoff`, { headers });
    const handoff = (await handoffResponse.json()).handoff;
    assert.equal(handoffResponse.status, 200);
    assert.equal(handoff.customer.displayName, "John Smith");
    assert.ok(Array.isArray(handoff.latestMessages));
    assert.equal(handoff.recommendedNextStep, "回覆客戶的最新訊息。");
  } finally {
    server.close();
  }
});

test("LINE webhook event ids make ingestion idempotent", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const payload = JSON.stringify({
      destination: "demo",
      events: [{
        webhookEventId: "evt-idempotent-1",
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "Uidempotent" },
        message: { type: "text", text: "only once" }
      }]
    });
    const signature = crypto.createHmac("sha256", "demo-secret-acme").update(Buffer.from(payload)).digest("base64");
    const request = () => fetch(`${baseUrl(server)}/webhooks/line/oa_acme`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: payload
    });

    assert.equal((await request()).status, 200);
    assert.equal((await request()).status, 200);

    const conversationResponse = await fetch(`${baseUrl(server)}/api/conversations/oa_acme%3AUidempotent`, {
      headers: { "x-demo-user": "admin" }
    });
    const conversation = (await conversationResponse.json()).conversation;
    assert.equal(conversation.messages.length, 1);
  } finally {
    server.close();
  }
});

test("admin can verify and connect a LINE account without exposing credentials", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/line/connect`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "admin", "accept-language": "zh-TW" },
      body: JSON.stringify({
        channelSecret: "demo-secret-connected",
        channelAccessToken: "demo-token-connected"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.connection.verified, true);
    assert.equal(body.connection.mode, "demo");
    assert.equal(body.account.name, "Demo Connected Account");
    assert.equal(body.account.hasSecret, true);
    assert.equal(body.account.hasToken, true);
    assert.match(body.connection.webhookUrl, /\/webhooks\/line\/oa_demo_connected$/);
    assert.doesNotMatch(JSON.stringify(body), /demo-secret-connected|demo-token-connected/);
  } finally {
    server.close();
  }
});

test("LINE connection rejects missing credentials with a localized error", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/line/connect`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "admin", "accept-language": "zh-TW" },
      body: JSON.stringify({ channelAccessToken: "" })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_LINE_CREDENTIALS");
    assert.equal(body.error, "LINE 憑證無效，請確認頻道密鑰與存取權杖。");
  } finally {
    server.close();
  }
});

test("admin can connect Messenger and complete a signed webhook round trip", async () => {
  resetDataForDemo();
  const server = await listen();
  try {
    const connected = await fetch(`${baseUrl(server)}/api/platforms/messenger/connect`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "admin" },
      body: JSON.stringify({
        appSecret: "meta-test-secret",
        pageAccessToken: "demo-meta-token-page",
        externalAccountId: "page-123"
      })
    });
    const connectionBody = await connected.json();
    assert.equal(connected.status, 201);
    assert.equal(connectionBody.account.platform, "messenger");
    assert.equal(connectionBody.connection.mode, "demo");
    assert.match(connectionBody.connection.webhookUrl, /\/webhooks\/meta\/msg_page_123$/);
    assert.doesNotMatch(JSON.stringify(connectionBody.account), /meta-test-secret|demo-meta-token-page/);

    const challenge = await fetch(
      `${connectionBody.connection.webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(connectionBody.connection.webhookVerifyToken)}&hub.challenge=verified`
    );
    assert.equal(challenge.status, 200);
    assert.equal(await challenge.text(), "verified");

    const payload = JSON.stringify({
      object: "page",
      entry: [{ messaging: [{ sender: { id: "PSID-new-customer" }, timestamp: Date.now(), message: { mid: "meta-mid-1", text: "Hello from Messenger" } }] }]
    });
    const signature = `sha256=${crypto.createHmac("sha256", "meta-test-secret").update(Buffer.from(payload)).digest("hex")}`;
    const webhook = await fetch(connectionBody.connection.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body: payload
    });
    assert.equal(webhook.status, 200);
    assert.equal((await webhook.json()).accepted, 1);

    const conversation = await fetch(`${baseUrl(server)}/api/conversations/msg_page_123%3APSID-new-customer`, {
      headers: { "x-demo-user": "admin" }
    });
    const conversationBody = await conversation.json();
    assert.equal(conversation.status, 200);
    assert.equal(conversationBody.conversation.messages[0].text, "Hello from Messenger");

    const reply = await fetch(`${baseUrl(server)}/api/conversations/msg_page_123%3APSID-new-customer/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "admin" },
      body: JSON.stringify({ text: "Hello back" })
    });
    assert.equal(reply.status, 200);
    assert.equal((await reply.json()).delivery.mode, "demo");
  } finally {
    server.close();
  }
});
