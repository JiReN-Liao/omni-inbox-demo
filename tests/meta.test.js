import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getMetaAccountInfo, sendMetaMessage, verifyMetaSignature } from "../src/meta.js";

test("verifies Meta webhook signatures", () => {
  const body = Buffer.from('{"object":"page"}');
  const signature = `sha256=${crypto.createHmac("sha256", "secret").update(body).digest("hex")}`;

  assert.equal(verifyMetaSignature("secret", body, signature), true);
  assert.equal(verifyMetaSignature("secret", body, "sha256=bad"), false);
});

test("demo Meta credentials import platform account profiles", async () => {
  const messenger = await getMetaAccountInfo("messenger", "demo-meta-token-page", "page-123");
  const instagram = await getMetaAccountInfo("instagram", "demo-meta-token-ig", "ig-456");

  assert.equal(messenger.account.name, "Demo Messenger Page");
  assert.equal(instagram.account.username, "demo.instagram");
  assert.equal(messenger.mode, "demo");
});

test("demo Meta delivery avoids external network calls", async () => {
  const result = await sendMetaMessage(
    { platform: "messenger", externalAccountId: "page-123", pageAccessToken: "demo-meta-token-page" },
    { sourceId: "customer-123" },
    "Hello"
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, "demo");
  assert.equal(result.body.to, "customer-123");
});
