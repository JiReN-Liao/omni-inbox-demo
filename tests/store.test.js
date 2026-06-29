import test from "node:test";
import assert from "node:assert/strict";
import {
  getAccount,
  getConversationForUser,
  getStatsForUser,
  getUser,
  ingestLineEvent,
  listConversationsForUser,
  resetDataForDemo,
  saveAccount,
  updateConversationForUser
} from "../src/store.js";

test("agents only see conversations from authorized accounts", () => {
  resetDataForDemo();
  const amy = getUser("amy");
  const kai = getUser("kai");

  assert.deepEqual(listConversationsForUser(amy).map((item) => item.accountId).sort(), ["ig_acme", "oa_acme"]);
  assert.deepEqual(listConversationsForUser(kai).map((item) => item.accountId), ["msg_acme"]);
});

test("conversation metadata can be updated by an authorized user", () => {
  resetDataForDemo();
  const admin = getUser("admin");
  const conversation = updateConversationForUser(admin, "oa_acme:Ujohn-smith", {
    status: "pending",
    tags: ["order", "vip", "order"]
  });

  assert.equal(conversation.status, "pending");
  assert.deepEqual(conversation.tags, ["order", "vip"]);
  assert.equal(getStatsForUser(admin).pending, 2);
});

test("new inbound messages reopen resolved conversations", () => {
  resetDataForDemo();
  const admin = getUser("admin");
  updateConversationForUser(admin, "oa_acme:Ujohn-smith", { status: "resolved" });
  ingestLineEvent("oa_acme", {
    type: "message",
    replyToken: "reply-token",
    source: { type: "user", userId: "Ujohn-smith" },
    message: { type: "text", text: "Still need help" }
  });

  const conversation = getConversationForUser(admin, "oa_acme:Ujohn-smith");
  assert.equal(conversation.status, "open");
  assert.equal(conversation.messages.at(-1).text, "Still need help");
});

test("unknown users do not fall back to the administrator", () => {
  resetDataForDemo();
  assert.equal(getUser("missing-user"), null);
});

test("partial account updates preserve stored LINE credentials", () => {
  resetDataForDemo();
  const before = getAccount("oa_acme");
  saveAccount({ id: "oa_acme", name: "Acme Priority Support", actorId: "admin" });
  const after = getAccount("oa_acme");

  assert.equal(after.name, "Acme Priority Support");
  assert.equal(after.channelSecret, before.channelSecret);
  assert.equal(after.channelAccessToken, before.channelAccessToken);
});
