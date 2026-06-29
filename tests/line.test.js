import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getLineBotInfo, verifyLineSignature } from "../src/line.js";

test("verifies a valid LINE webhook signature", () => {
  const body = Buffer.from(JSON.stringify({ events: [] }));
  const signature = crypto.createHmac("sha256", "secret").update(body).digest("base64");
  assert.equal(verifyLineSignature("secret", body, signature), true);
});

test("rejects malformed signatures without throwing", () => {
  const body = Buffer.from(JSON.stringify({ events: [] }));
  assert.equal(verifyLineSignature("secret", body, "bad"), false);
});

test("reads LINE bot identity with a verified access token", async () => {
  let authorization;
  const result = await getLineBotInfo("live-token", {
    fetchImpl: async (url, options) => {
      authorization = options.headers.Authorization;
      assert.equal(url, "https://api.line.me/v2/bot/info");
      return new Response(JSON.stringify({
        userId: "U123",
        basicId: "@sample",
        displayName: "Sample Support"
      }), { status: 200, headers: { "x-line-request-id": "request-1" } });
    }
  });

  assert.equal(authorization, "Bearer live-token");
  assert.equal(result.ok, true);
  assert.equal(result.bot.displayName, "Sample Support");
  assert.equal(result.bot.basicId, "@sample");
});

test("demo tokens support the local account connection flow", async () => {
  const result = await getLineBotInfo("demo-token-connect");
  assert.equal(result.ok, true);
  assert.equal(result.mode, "demo");
  assert.equal(result.bot.displayName, "Demo Connected Account");
});
