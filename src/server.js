/**
 * Omni Inbox - HTTP server.
 *
 * Composition root: wires global middleware, the demo-auth layer, and the REST
 * routes onto a single Express app. Domain logic lives in store.js, LINE calls
 * in line.js, request validation in validation.js, and HTTP helpers in http.js.
 */

import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addInternalNote,
  addOutboundMessage,
  canAccessAccount,
  getAccount,
  getConversationForUser,
  getHandoffForUser,
  getOperationalInsightsForUser,
  getStatsForUser,
  getStorageStatus,
  getUser,
  ingestLineEvent,
  listAccountsForUser,
  listAuditEventsForUser,
  listConversationsForUser,
  listUsers,
  resetDataForDemo,
  saveAccount,
  updateConversationForUser,
  updateUserAccess
} from "./store.js";
import { getLineBotInfo, sendLineMessage, verifyLineSignature } from "./line.js";
import { getMetaAccountInfo, sendMetaMessage, verifyMetaSignature } from "./meta.js";
import { validateAccount, validateConversationPatch } from "./validation.js";
import { asyncHandler, clampInteger, requireAdmin, securityHeaders, sendError } from "./http.js";
import { subscribeToData } from "./events.js";
import { DEFAULT_PORT, LIMITS, SERVICE_NAME, SERVICE_VERSION } from "./constants.js";

export const app = express();
const port = Number(process.env.PORT || DEFAULT_PORT);
const serverFile = fileURLToPath(import.meta.url);
const __dirname = path.dirname(serverFile);

/* ------------------------------- Global setup ------------------------------- */
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api", express.json({ limit: LIMITS.jsonBody }));

/* ------------------------------- Realtime (SSE) ----------------------------- */
// Registered before the demo-auth middleware so EventSource — which cannot send
// custom headers — can authenticate with a `demoUser` query parameter. Pushes a
// lightweight `refresh` signal whenever the data file changes; clients refetch.
app.get("/api/stream", (req, res) => {
  const user = getUser(req.query.demoUser || req.header("x-demo-user") || "admin");
  if (!user) return sendError(res, 401, "UNKNOWN_DEMO_USER", "Unknown demo user");

  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  res.write("retry: 3000\n\n");
  res.write('event: ready\ndata: {"ok":true}\n\n');

  const push = () => res.write(`event: refresh\ndata: {"at":"${new Date().toISOString()}"}\n\n`);
  const unsubscribe = subscribeToData(push);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
  heartbeat.unref?.();

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

app.get("/healthz", (req, res) => {
  const storage = getStorageStatus();
  res.json({
    ok: storage.integrity === "ok" && !storage.lastBackupError,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
    storage
  });
});

/* ------------------------------- Demo auth ---------------------------------- */
// A missing header intentionally defaults to `admin` for the local showcase;
// an unknown user is rejected rather than silently inheriting admin access.
app.use("/api", (req, res, next) => {
  req.currentUser = getUser(req.header("x-demo-user") || "admin");
  if (!req.currentUser) return sendError(res, 401, "UNKNOWN_DEMO_USER", "Unknown demo user");
  next();
});

/* ------------------------------- Identity ----------------------------------- */
app.get("/api/me", (req, res) => {
  res.json({ user: req.currentUser, users: listUsers() });
});

/* ------------------------------- Operations --------------------------------- */
app.get("/api/stats", (req, res) => {
  res.json({ stats: getStatsForUser(req.currentUser) });
});

app.get("/api/insights", (req, res) => {
  res.json({ insights: getOperationalInsightsForUser(req.currentUser) });
});

app.get("/api/audit", (req, res) => {
  res.json({ events: listAuditEventsForUser(req.currentUser, req.query) });
});

app.get("/api/storage/status", requireAdmin, (req, res) => {
  res.json({ storage: getStorageStatus() });
});

app.post("/api/demo/reset", requireAdmin, (req, res) => {
  if (process.env.ALLOW_DEMO_RESET !== "true") {
    return sendError(res, 403, "DEMO_RESET_DISABLED", "Demo reset is disabled to protect stored data");
  }
  resetDataForDemo();
  res.json({ ok: true });
});

/* ------------------------------- Accounts ----------------------------------- */
app.get("/api/accounts", (req, res) => {
  res.json({ accounts: listAccountsForUser(req.currentUser) });
});

app.post("/api/accounts", requireAdmin, (req, res) => {
  const errors = validateAccount(req.body);
  if (errors.length) return sendError(res, 400, "INVALID_ACCOUNT", "Invalid account", errors);
  res.json({ account: saveAccount({ ...req.body, actorId: req.currentUser.id }) });
});

app.post("/api/line/connect", requireAdmin, asyncHandler(async (req, res) => {
  const channelSecret = String(req.body.channelSecret || "").trim();
  const channelAccessToken = String(req.body.channelAccessToken || "").trim();
  if (!channelSecret || !channelAccessToken) {
    return sendError(res, 400, "INVALID_LINE_CREDENTIALS", "Channel secret and channel access token are required");
  }

  const verification = await getLineBotInfo(channelAccessToken);
  if (!verification.ok) {
    return sendError(res, 401, "INVALID_LINE_CREDENTIALS", "LINE credentials could not be verified");
  }

  const bot = verification.bot;
  const account = saveAccount({
    id: createLineAccountId(bot),
    name: String(req.body.name || bot.displayName || "LINE Official Account").trim(),
    channelSecret,
    channelAccessToken,
    lineBotUserId: bot.userId,
    basicId: bot.basicId,
    pictureUrl: bot.pictureUrl,
    verifiedAt: new Date().toISOString(),
    actorId: req.currentUser.id
  });
  const forwardedProtocol = String(req.header("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  const requestBaseUrl = `${protocol}://${req.get("host")}`;
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || requestBaseUrl).replace(/\/$/, "");
  const webhookUrl = `${publicBaseUrl}${account.webhookPath}`;

  res.status(201).json({
    account,
    connection: {
      verified: true,
      mode: verification.mode,
      bot,
      webhookUrl,
      webhookReady: publicBaseUrl.startsWith("https://")
    }
  });
}));

app.post("/api/platforms/:platform/connect", requireAdmin, asyncHandler(async (req, res) => {
  const platform = String(req.params.platform || "").toLowerCase();
  if (platform === "line") {
    return sendError(res, 400, "UNSUPPORTED_PLATFORM", "Use the LINE connection endpoint for LINE accounts");
  }
  if (!["messenger", "instagram"].includes(platform)) {
    return sendError(res, 400, "UNSUPPORTED_PLATFORM", "Unsupported messaging platform");
  }

  const appSecret = String(req.body.appSecret || "").trim();
  const pageAccessToken = String(req.body.pageAccessToken || "").trim();
  const externalAccountId = String(req.body.externalAccountId || "").trim();
  if (!appSecret || !pageAccessToken || !externalAccountId) {
    return sendError(res, 400, "INVALID_META_CREDENTIALS", "Meta App Secret, access token, and account ID are required");
  }

  const verification = await getMetaAccountInfo(platform, pageAccessToken, externalAccountId);
  if (!verification.ok) return sendError(res, 401, "INVALID_META_CREDENTIALS", "Meta credentials could not be verified");

  const profile = verification.account;
  const webhookVerifyToken = crypto.randomBytes(24).toString("base64url");
  const account = saveAccount({
    id: createPlatformAccountId(platform, profile.id),
    name: String(req.body.name || profile.name).trim(),
    platform,
    externalAccountId: profile.id,
    appSecret,
    pageAccessToken,
    pictureUrl: profile.pictureUrl,
    verifiedAt: new Date().toISOString(),
    webhookVerifyToken,
    actorId: req.currentUser.id
  });
  const webhook = buildWebhookConnection(req, account);
  res.status(201).json({
    account,
    connection: {
      verified: true,
      mode: verification.mode,
      platform,
      profile,
      webhookUrl: webhook.url,
      webhookReady: webhook.ready,
      webhookVerifyToken
    }
  });
}));

/* ------------------------------- Permissions -------------------------------- */
app.put("/api/users/:userId/access", requireAdmin, (req, res) => {
  if (!Array.isArray(req.body.accountIds)) return sendError(res, 400, "INVALID_ACCOUNT_IDS", "accountIds must be an array");
  const user = updateUserAccess(req.params.userId, req.body.accountIds, req.currentUser.id);
  if (!user) return sendError(res, 404, "USER_NOT_FOUND", "User not found");
  res.json({ user });
});

/* ------------------------------- Conversations ------------------------------ */
app.get("/api/conversations", (req, res) => {
  const conversations = listConversationsForUser(req.currentUser, req.query);
  const page = clampInteger(req.query.page, LIMITS.page.min, LIMITS.page.max, LIMITS.page.default);
  const limit = clampInteger(req.query.limit, LIMITS.pageSize.min, LIMITS.pageSize.max, LIMITS.pageSize.default);
  const start = (page - 1) * limit;
  res.json({
    conversations: conversations.slice(start, start + limit),
    meta: { page, limit, total: conversations.length, pages: Math.ceil(conversations.length / limit) }
  });
});

app.get("/api/conversations/:conversationId", (req, res) => {
  const conversation = getConversationForUser(req.currentUser, req.params.conversationId);
  if (!conversation) return sendError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  res.json({ conversation });
});

app.get("/api/conversations/:conversationId/handoff", (req, res) => {
  const language = String(req.header("accept-language") || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  const handoff = getHandoffForUser(req.currentUser, req.params.conversationId, language);
  if (!handoff) return sendError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  res.json({ handoff });
});

app.patch("/api/conversations/:conversationId", (req, res) => {
  const existing = getConversationForUser(req.currentUser, req.params.conversationId);
  if (!existing) return sendError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  const errors = validateConversationPatch(req.body, existing.accountId);
  if (errors.length) return sendError(res, 400, "INVALID_CONVERSATION_PATCH", "Invalid conversation update", errors);
  res.json({ conversation: updateConversationForUser(req.currentUser, req.params.conversationId, req.body) });
});

app.post("/api/conversations/:conversationId/notes", (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return sendError(res, 400, "NOTE_REQUIRED", "Note text is required");
  if (text.length > LIMITS.noteText) return sendError(res, 400, "NOTE_TOO_LONG", `Note text must be ${LIMITS.noteText.toLocaleString("en-US")} characters or fewer`);
  const conversation = addInternalNote(req.currentUser, req.params.conversationId, text);
  if (!conversation) return sendError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  res.json({ conversation });
});

app.post("/api/conversations/:conversationId/send", asyncHandler(async (req, res) => {
  const conversation = getConversationForUser(req.currentUser, req.params.conversationId);
  if (!conversation) return sendError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  const account = getAccount(conversation.accountId);
  if (!account || !canAccessAccount(req.currentUser, account.id)) return sendError(res, 403, "FORBIDDEN", "Forbidden");

  const text = String(req.body.text || "").trim();
  if (!text) return sendError(res, 400, "MESSAGE_REQUIRED", "Message text is required");
  if (text.length > LIMITS.messageText) return sendError(res, 400, "MESSAGE_TOO_LONG", `Message text must be ${LIMITS.messageText.toLocaleString("en-US")} characters or fewer`);

  const result = account.platform === "line"
    ? await sendLineMessage(account, conversation, text)
    : await sendMetaMessage(account, conversation, text);
  const message = addOutboundMessage(account.id, conversation.id, text, result.ok ? "sent" : "failed", result, req.currentUser.id);
  res.status(result.ok ? 200 : 502).json({ message, delivery: result, line: result });
}));

/* ------------------------------- Demo helpers ------------------------------- */
app.post("/api/simulate", (req, res) => {
  const accountId = req.body.accountId;
  const account = getAccount(accountId);
  if (!account || !canAccessAccount(req.currentUser, accountId)) return sendError(res, 404, "ACCOUNT_NOT_FOUND", "Account not found");
  const text = String(req.body.text || "").trim();
  if (text.length > LIMITS.messageText) return sendError(res, 400, "MESSAGE_TOO_LONG", `Message text must be ${LIMITS.messageText.toLocaleString("en-US")} characters or fewer`);

  const event = {
    type: "message",
    replyToken: `demo-reply-${Date.now()}`,
    source: { type: "user", userId: req.body.sourceId || "Udemo-user" },
    message: { type: "text", text: text || "示範測試訊息" },
    timestamp: Date.now()
  };
  res.json({ conversation: ingestLineEvent(accountId, event) });
});

/* ------------------------------- Webhooks ----------------------------------- */
app.post("/webhooks/line/:accountId", express.raw({ type: "*/*", limit: LIMITS.jsonBody }), (req, res) => {
  const account = getAccount(req.params.accountId);
  if (!account || !account.enabled) return sendError(res, 404, "ACCOUNT_NOT_FOUND", "Account not found");

  if (!verifyLineSignature(account.channelSecret, req.body, req.header("x-line-signature"))) {
    return sendError(res, 401, "INVALID_LINE_SIGNATURE", "Invalid LINE signature");
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return sendError(res, 400, "INVALID_JSON", "Invalid JSON payload");
  }

  if (!Array.isArray(payload.events)) return sendError(res, 400, "INVALID_LINE_PAYLOAD", "LINE payload events must be an array");
  if (payload.events.length > LIMITS.webhookEvents) return sendError(res, 413, "TOO_MANY_EVENTS", "LINE payload contains too many events");

  for (const event of payload.events) ingestLineEvent(account.id, event);
  res.status(200).json({ ok: true, accepted: payload.events.length });
});

app.get("/webhooks/meta/:accountId", (req, res) => {
  const account = getAccount(req.params.accountId);
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (account?.enabled && mode === "subscribe" && token === account.webhookVerifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post("/webhooks/meta/:accountId", express.raw({ type: "*/*", limit: LIMITS.jsonBody }), (req, res) => {
  const account = getAccount(req.params.accountId);
  if (!account || !account.enabled || !["messenger", "instagram"].includes(account.platform)) {
    return sendError(res, 404, "ACCOUNT_NOT_FOUND", "Account not found");
  }
  if (!verifyMetaSignature(account.appSecret, req.body, req.header("x-hub-signature-256"))) {
    return sendError(res, 401, "INVALID_META_SIGNATURE", "Invalid Meta signature");
  }

  let payload;
  try { payload = JSON.parse(req.body.toString("utf8")); }
  catch { return sendError(res, 400, "INVALID_JSON", "Invalid JSON payload"); }

  let accepted = 0;
  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.sender?.id || !event.message) continue;
      ingestLineEvent(account.id, {
        webhookEventId: event.message.mid,
        type: "message",
        source: { type: "user", userId: event.sender.id },
        message: { type: event.message.attachments ? "attachment" : "text", text: event.message.text || "[attachment]" },
        timestamp: event.timestamp
      });
      accepted += 1;
    }
  }
  res.status(200).json({ ok: true, accepted });
});

/* ------------------------------- Fallbacks ---------------------------------- */
app.use("/api", (req, res) => sendError(res, 404, "API_NOT_FOUND", "API endpoint not found"));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.parse.failed") return sendError(res, 400, "INVALID_JSON", "Invalid JSON payload");
  console.error(`[${req.requestId}]`, error);
  return sendError(res, 500, "INTERNAL_ERROR", "Unexpected server error");
});

function createLineAccountId(bot) {
  const identity = String(bot.basicId || bot.userId || Date.now())
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(-40);
  return `oa_${identity || Date.now()}`;
}

function createPlatformAccountId(platform, externalId) {
  const prefix = platform === "messenger" ? "msg" : "ig";
  const identity = String(externalId || Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(-40);
  return `${prefix}_${identity || Date.now()}`;
}

function buildWebhookConnection(req, account) {
  const forwardedProtocol = String(req.header("x-forwarded-proto") || "").split(",")[0].trim();
  const requestBaseUrl = `${forwardedProtocol || req.protocol}://${req.get("host")}`;
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || requestBaseUrl).replace(/\/$/, "");
  return { url: `${publicBaseUrl}${account.webhookPath}`, ready: publicBaseUrl.startsWith("https://") };
}

/* ------------------------------- Bootstrap ---------------------------------- */
if (process.argv[1] && path.resolve(process.argv[1]) === serverFile) {
  app.listen(port, () => {
    console.log(`Omni Inbox running at http://localhost:${port}`);
  });
}
