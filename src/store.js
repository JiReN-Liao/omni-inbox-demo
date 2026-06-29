/**
 * Data store and domain logic.
 *
 * A small file-backed prototype store. Every mutation reads the current data,
 * applies a change, appends an audit event, and atomically writes it back.
 * Reads return decorated/masked copies so callers never mutate persisted state.
 */

import path from "node:path";
import crypto from "node:crypto";
import { createDurableStore } from "./database.js";
import {
  CONVERSATION_STATUSES,
  CONVERSATION_PRIORITIES,
  CONVERSATION_PATCH_FIELDS,
  DEFAULT_STATUS,
  DEFAULT_PRIORITY,
  LIMITS
} from "./constants.js";

const dataPath = path.resolve(process.cwd(), "data.json");

const seed = {
  users: [
    { id: "admin", name: "Admin", role: "admin", accountIds: ["oa_acme", "msg_acme", "ig_acme"] },
    { id: "amy", name: "Amy", role: "agent", accountIds: ["oa_acme", "ig_acme"] },
    { id: "kai", name: "Kai", role: "agent", accountIds: ["msg_acme"] }
  ],
  accounts: [
    {
      id: "oa_acme",
      name: "Acme Support",
      platform: "line",
      channelSecret: "demo-secret-acme",
      channelAccessToken: "demo-token-acme",
      enabled: true
    },
    {
      id: "msg_acme",
      name: "Acme Messenger",
      platform: "messenger",
      externalAccountId: "page_acme_demo",
      appSecret: "demo-meta-secret-messenger",
      pageAccessToken: "demo-meta-token-messenger",
      enabled: true
    },
    {
      id: "ig_acme",
      name: "Acme Instagram",
      platform: "instagram",
      externalAccountId: "ig_acme_demo",
      appSecret: "demo-meta-secret-instagram",
      pageAccessToken: "demo-meta-token-instagram",
      enabled: true
    }
  ],
  conversations: [
    {
      id: "oa_acme:Ujohn-smith",
      accountId: "oa_acme",
      sourceId: "Ujohn-smith",
      sourceType: "user",
      displayName: "John Smith",
      status: "open",
      priority: "normal",
      assigneeId: "amy",
      tags: ["訂單查詢"],
      internalNotes: [
        {
          id: "note_seed_1",
          authorId: "admin",
          text: "請先確認訂單狀態，再回覆客戶。",
          createdAt: new Date().toISOString()
        }
      ],
      updatedAt: new Date().toISOString(),
      lastReplyToken: null,
      lastReplyTokenAt: null
    },
    {
      id: "msg_acme:PSID-emily-chen",
      accountId: "msg_acme",
      sourceId: "PSID-emily-chen",
      sourceType: "user",
      displayName: "Emily Chen",
      status: "pending",
      priority: "normal",
      assigneeId: "kai",
      tags: ["退款申請"],
      internalNotes: [],
      updatedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      lastReplyToken: null,
      lastReplyTokenAt: null
    },
    {
      id: "ig_acme:IGSID-alex-wong",
      accountId: "ig_acme",
      sourceId: "IGSID-alex-wong",
      sourceType: "user",
      displayName: "Alex Wong",
      status: "open",
      priority: "high",
      assigneeId: "amy",
      tags: ["商品詢問", "高意願"],
      internalNotes: [],
      updatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      lastReplyToken: null,
      lastReplyTokenAt: null
    }
  ],
  messages: [
    {
      id: "msg_seed_1",
      accountId: "oa_acme",
      conversationId: "oa_acme:Ujohn-smith",
      direction: "inbound",
      type: "text",
      text: "您好，我想查詢我目前的訂單狀態，謝謝。",
      status: "received",
      raw: {},
      createdAt: new Date().toISOString()
    },
    {
      id: "msg_seed_2",
      accountId: "msg_acme",
      conversationId: "msg_acme:PSID-emily-chen",
      direction: "inbound",
      type: "text",
      text: "您好，我想詢問退款大約需要幾個工作天？",
      status: "received",
      raw: {},
      createdAt: new Date(Date.now() - 6 * 60_000).toISOString()
    },
    {
      id: "msg_seed_3",
      accountId: "ig_acme",
      conversationId: "ig_acme:IGSID-alex-wong",
      direction: "inbound",
      type: "text",
      text: "請問限時動態裡的黑色款還有現貨嗎？",
      status: "received",
      raw: {},
      createdAt: new Date(Date.now() - 2 * 60_000).toISOString()
    }
  ]
};

const isTest = Boolean(process.env.NODE_TEST_CONTEXT);
const storage = createDurableStore({
  databasePath: path.resolve(process.env.OMNI_DB_PATH || (isTest ? ".test-data.sqlite" : "omni-inbox.sqlite")),
  legacyPath: dataPath,
  backupDir: path.resolve(isTest ? ".test-backups" : "backups"),
  changePath: path.resolve(isTest ? ".test-data.change" : ".omni-inbox.change"),
  seed,
  normalize: normalizeData
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readData() {
  return normalizeData(storage.read());
}

export function writeData(data) {
  storage.write(normalizeData(data));
}

export function resetDataForDemo() {
  writeData(seed);
}

export function getStorageStatus() {
  return storage.status();
}

export function listUsers() {
  return readData().users;
}

export function getUser(userId) {
  const data = readData();
  return data.users.find((user) => user.id === userId) ?? null;
}

export function canAccessAccount(user, accountId) {
  return user.role === "admin" || user.accountIds.includes(accountId);
}

export function listAccountsForUser(user) {
  const data = readData();
  if (user.role === "admin") return data.accounts.map(maskAccount);
  return data.accounts.filter((account) => user.accountIds.includes(account.id)).map(maskAccount);
}

export function getAccount(accountId) {
  return readData().accounts.find((account) => account.id === accountId);
}

export function saveAccount(input) {
  const data = readData();
  const id = normalizeId(input.id) || `oa_${crypto.randomUUID().slice(0, 8)}`;
  const existing = data.accounts.find((account) => account.id === id);
  const account = {
    id,
    name: String(input.name || existing?.name || "").trim() || "Untitled channel",
    platform: input.platform || existing?.platform || "line",
    channelSecret: String(input.channelSecret || existing?.channelSecret || "").trim(),
    channelAccessToken: String(input.channelAccessToken || existing?.channelAccessToken || "").trim(),
    lineBotUserId: input.lineBotUserId || existing?.lineBotUserId || null,
    basicId: input.basicId || existing?.basicId || null,
    pictureUrl: input.pictureUrl || existing?.pictureUrl || null,
    verifiedAt: input.verifiedAt || existing?.verifiedAt || null,
    externalAccountId: input.externalAccountId || existing?.externalAccountId || null,
    appSecret: String(input.appSecret || existing?.appSecret || "").trim(),
    pageAccessToken: String(input.pageAccessToken || existing?.pageAccessToken || "").trim(),
    webhookVerifyToken: input.webhookVerifyToken || existing?.webhookVerifyToken || null,
    enabled: input.enabled ?? existing?.enabled ?? true
  };

  if (existing) Object.assign(existing, account);
  else data.accounts.push(account);

  appendAuditEvent(data, {
    action: existing ? "account.updated" : "account.created",
    actorId: input.actorId || "system",
    accountId: id,
    metadata: { name: account.name, enabled: account.enabled }
  });
  writeData(data);
  return maskAccount(account);
}

export function updateUserAccess(userId, accountIds, actorId = "admin") {
  const data = readData();
  const validAccountIds = new Set(data.accounts.map((account) => account.id));
  const user = data.users.find((item) => item.id === userId);
  if (!user || user.role === "admin") return user;
  user.accountIds = [...new Set(accountIds)].filter((id) => validAccountIds.has(id));
  appendAuditEvent(data, {
    action: "user.access_updated",
    actorId,
    metadata: { userId, accountIds: user.accountIds }
  });
  writeData(data);
  return clone(user);
}

export function listConversationsForUser(user, filters = {}) {
  const data = readData();
  const query = String(filters.query || "").trim().toLowerCase();
  const status = String(filters.status || "all");
  const accountId = String(filters.accountId || "all");

  let conversations = data.conversations.filter((conversation) => canAccessAccount(user, conversation.accountId));
  if (status !== "all") conversations = conversations.filter((conversation) => conversation.status === status);
  if (accountId !== "all") conversations = conversations.filter((conversation) => conversation.accountId === accountId);
  if (query) {
    conversations = conversations.filter((conversation) => {
      const lastMessage = findLastMessage(data, conversation.id);
      return [conversation.displayName, conversation.sourceId, lastMessage?.text, conversation.tags?.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  return conversations
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((conversation) => decorateConversation(data, conversation));
}

export function getConversationForUser(user, conversationId) {
  const data = readData();
  const conversation = data.conversations.find((item) => item.id === conversationId);
  if (!conversation || !canAccessAccount(user, conversation.accountId)) return null;
  return {
    ...decorateConversation(data, conversation),
    messages: data.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  };
}

export function updateConversationForUser(user, conversationId, patch) {
  const data = readData();
  const conversation = data.conversations.find((item) => item.id === conversationId);
  if (!conversation || !canAccessAccount(user, conversation.accountId)) return null;

  if (patch.status && CONVERSATION_STATUSES.includes(patch.status)) {
    conversation.status = patch.status;
  }
  if (patch.priority && CONVERSATION_PRIORITIES.includes(patch.priority)) {
    conversation.priority = patch.priority;
  }
  if (typeof patch.assigneeId === "string") {
    const assignee = data.users.find((candidate) => candidate.id === patch.assigneeId);
    const canAssign = assignee && canAccessAccount(assignee, conversation.accountId);
    conversation.assigneeId = canAssign ? assignee.id : null;
  }
  if (Array.isArray(patch.tags)) {
    conversation.tags = [...new Set(patch.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, LIMITS.maxTags);
  }

  conversation.updatedAt = new Date().toISOString();
  appendAuditEvent(data, {
    action: "conversation.updated",
    actorId: user.id,
    accountId: conversation.accountId,
    conversationId,
    metadata: sanitizeAuditMetadata(patch)
  });
  writeData(data);
  return getConversationForUser(user, conversationId);
}

export function addInternalNote(user, conversationId, text) {
  const data = readData();
  const conversation = data.conversations.find((item) => item.id === conversationId);
  if (!conversation || !canAccessAccount(user, conversation.accountId)) return null;

  conversation.internalNotes ??= [];
  conversation.internalNotes.push({
    id: crypto.randomUUID(),
    authorId: user.id,
    text: String(text || "").trim(),
    createdAt: new Date().toISOString()
  });
  conversation.updatedAt = new Date().toISOString();
  appendAuditEvent(data, {
    action: "conversation.note_added",
    actorId: user.id,
    accountId: conversation.accountId,
    conversationId,
    metadata: { length: String(text).length }
  });
  writeData(data);
  return getConversationForUser(user, conversationId);
}

export function ingestLineEvent(accountId, event) {
  const data = readData();
  const webhookEventId = String(event.webhookEventId || "").trim();
  if (webhookEventId && data.webhookEventIds.includes(webhookEventId)) {
    const duplicateSourceId = getSourceId(event);
    return clone(data.conversations.find((item) => item.id === `${accountId}:${duplicateSourceId}`) || null);
  }
  const sourceId = getSourceId(event);
  const conversationId = `${accountId}:${sourceId}`;
  const now = new Date().toISOString();
  let conversation = data.conversations.find((item) => item.id === conversationId);

  if (!conversation) {
    conversation = {
      id: conversationId,
      accountId,
      sourceId,
      sourceType: event.source?.type || "unknown",
      displayName: event.source?.userId || sourceId,
      status: DEFAULT_STATUS,
      priority: DEFAULT_PRIORITY,
      assigneeId: null,
      tags: [],
      internalNotes: [],
      updatedAt: now,
      lastReplyToken: null,
      lastReplyTokenAt: null
    };
    data.conversations.push(conversation);
  }

  conversation.status = conversation.status === "resolved" ? DEFAULT_STATUS : conversation.status;
  conversation.updatedAt = now;
  if (event.replyToken) {
    conversation.lastReplyToken = event.replyToken;
    conversation.lastReplyTokenAt = now;
  }

  data.messages.push({
    id: crypto.randomUUID(),
    accountId,
    conversationId,
    direction: "inbound",
    type: event.message?.type || event.type,
    text: event.message?.text || `[${event.type}]`,
    status: "received",
    raw: event,
    createdAt: now
  });

  if (webhookEventId) {
    data.webhookEventIds.push(webhookEventId);
    data.webhookEventIds = data.webhookEventIds.slice(-LIMITS.webhookEventIds);
  }
  appendAuditEvent(data, {
    action: "platform.event_received",
    actorId: "line",
    accountId,
    conversationId,
    metadata: { eventType: event.type, messageType: event.message?.type || null, webhookEventId: webhookEventId || null }
  });

  writeData(data);
  return clone(conversation);
}

export function addOutboundMessage(accountId, conversationId, text, status, rawResponse, actorId = "system") {
  const data = readData();
  const now = new Date().toISOString();
  const conversation = data.conversations.find((item) => item.id === conversationId);
  if (conversation) conversation.updatedAt = now;
  const message = {
    id: crypto.randomUUID(),
    accountId,
    conversationId,
    direction: "outbound",
    type: "text",
    text,
    status,
    rawResponse,
    createdAt: now
  };
  data.messages.push(message);
  appendAuditEvent(data, {
    action: status === "sent" ? "message.sent" : "message.failed",
    actorId,
    accountId,
    conversationId,
    metadata: { mode: rawResponse?.mode || null, status: rawResponse?.status || null }
  });
  writeData(data);
  return message;
}

export function getStatsForUser(user) {
  const conversations = listConversationsForUser(user);
  const accounts = listAccountsForUser(user);
  return {
    visibleAccounts: accounts.length,
    totalConversations: conversations.length,
    open: conversations.filter((item) => item.status === "open").length,
    pending: conversations.filter((item) => item.status === "pending").length,
    resolved: conversations.filter((item) => item.status === "resolved").length
  };
}

export function getOperationalInsightsForUser(user) {
  const conversations = listConversationsForUser(user);
  const accounts = listAccountsForUser(user);
  const byAccount = accounts.map((account) => {
    const items = conversations.filter((conversation) => conversation.accountId === account.id);
    return {
      accountId: account.id,
      accountName: account.name,
      total: items.length,
      open: items.filter((item) => item.status === "open").length,
      pending: items.filter((item) => item.status === "pending").length,
      resolved: items.filter((item) => item.status === "resolved").length
    };
  });
  const awaitingReply = conversations.filter((item) => item.status !== "resolved" && item.lastMessage?.direction === "inbound").length;
  const unassigned = conversations.filter((item) => item.status !== "resolved" && !item.assigneeId).length;
  const highPriority = conversations.filter((item) => item.status !== "resolved" && item.priority === "high").length;

  return {
    generatedAt: new Date().toISOString(),
    totals: { ...getStatsForUser(user), awaitingReply, unassigned, highPriority },
    byAccount
  };
}

export function getHandoffForUser(user, conversationId, language = "en") {
  const conversation = getConversationForUser(user, conversationId);
  if (!conversation) return null;
  const latestMessages = conversation.messages.slice(-5).map(({ direction, text, createdAt, status }) => ({
    direction,
    text,
    createdAt,
    status
  }));
  return {
    generatedAt: new Date().toISOString(),
    conversationId: conversation.id,
    customer: { displayName: conversation.displayName, sourceId: conversation.sourceId },
    account: conversation.account,
    status: conversation.status,
    priority: conversation.priority,
    assignee: conversation.assignee,
    tags: conversation.tags || [],
    internalNotes: conversation.internalNotes || [],
    latestMessages,
    recommendedNextStep: recommendNextStep(conversation, language)
  };
}

export function listAuditEventsForUser(user, filters = {}) {
  const data = readData();
  const limit = Math.min(Math.max(Number(filters.limit) || LIMITS.auditLimit.default, LIMITS.auditLimit.min), LIMITS.auditLimit.max);
  const conversationId = String(filters.conversationId || "").trim();
  return data.auditEvents
    .filter((event) => event.accountId ? canAccessAccount(user, event.accountId) : user.role === "admin" || event.actorId === user.id)
    .filter((event) => !conversationId || event.conversationId === conversationId)
    .slice(-limit)
    .reverse()
    .map(clone);
}

function decorateConversation(data, conversation) {
  return {
    ...clone(conversation),
    account: maskAccount(data.accounts.find((account) => account.id === conversation.accountId)),
    assignee: maskUser(data.users.find((user) => user.id === conversation.assigneeId)),
    lastMessage: findLastMessage(data, conversation.id)
  };
}

function findLastMessage(data, conversationId) {
  return data.messages
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function maskAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    name: account.name,
    platform: account.platform || "line",
    enabled: account.enabled,
    hasSecret: Boolean(account.channelSecret || account.appSecret),
    hasToken: Boolean(account.channelAccessToken || account.pageAccessToken),
    webhookPath: account.platform === "line" ? `/webhooks/line/${account.id}` : `/webhooks/meta/${account.id}`,
    lineBotUserId: account.lineBotUserId || null,
    basicId: account.basicId || null,
    pictureUrl: account.pictureUrl || null,
    verifiedAt: account.verifiedAt || null,
    externalAccountId: account.externalAccountId || null
  };
}

function maskUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, role: user.role };
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "_");
}

function normalizeData(data) {
  return {
    users: Array.isArray(data.users) ? data.users : [],
    accounts: Array.isArray(data.accounts) ? data.accounts.map((account) => ({ ...account, platform: account.platform || "line" })) : [],
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    auditEvents: Array.isArray(data.auditEvents) ? data.auditEvents : [],
    webhookEventIds: Array.isArray(data.webhookEventIds) ? data.webhookEventIds : []
  };
}

function appendAuditEvent(data, event) {
  data.auditEvents ??= [];
  data.auditEvents.push({
    id: crypto.randomUUID(),
    action: event.action,
    actorId: event.actorId,
    accountId: event.accountId || null,
    conversationId: event.conversationId || null,
    metadata: event.metadata || {},
    createdAt: new Date().toISOString()
  });
  data.auditEvents = data.auditEvents.slice(-LIMITS.auditEvents);
}

function sanitizeAuditMetadata(patch) {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([key]) => CONVERSATION_PATCH_FIELDS.includes(key))
      .map(([key, value]) => [key, clone(value)])
  );
}

function getSourceId(event) {
  return event.source?.userId || event.source?.groupId || event.source?.roomId || "unknown";
}

function recommendNextStep(conversation, language) {
  const isChinese = language === "zh";
  if (conversation.status === "resolved") return isChinese ? "持續留意客戶是否再次來訊。" : "Monitor for a follow-up message.";
  if (!conversation.assigneeId) return isChinese ? "先指派負責人，再進行回覆。" : "Assign an owner before replying.";
  if (conversation.lastMessage?.direction === "inbound") return isChinese ? "回覆客戶的最新訊息。" : "Reply to the latest customer message.";
  if (conversation.status === "pending") return isChinese ? "待客戶回覆後繼續追蹤。" : "Follow up when the customer responds.";
  return isChinese ? "檢視最新動態並繼續處理對話。" : "Review the latest activity and continue the conversation.";
}
