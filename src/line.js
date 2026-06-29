/**
 * LINE Messaging API integration.
 *
 * Verifies inbound webhook signatures and sends outbound text messages. Demo
 * tokens (prefixed `demo-token-`) short-circuit to a local stub so the showcase
 * never calls the real LINE API. Outbound calls are time-bounded.
 */

import crypto from "node:crypto";
import { DEMO_TOKEN_PREFIX, LINE_API_BASE, LINE_REQUEST_TIMEOUT_MS, REPLY_WINDOW_MS } from "./constants.js";

/** Constant-time verification of the `x-line-signature` header (HMAC-SHA256). */
export function verifyLineSignature(channelSecret, bodyBuffer, signature) {
  if (!channelSecret || !signature) return false;
  const digest = crypto.createHmac("sha256", channelSecret).update(bodyBuffer).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/**
 * Send a text message to a conversation. Uses the reply token while it is still
 * inside the validity window, otherwise falls back to a push message.
 */
export async function sendLineMessage(account, conversation, text) {
  if (!account?.channelAccessToken) {
    return { ok: false, mode: "none", error: "Missing channel access token" };
  }

  if (isDemoToken(account.channelAccessToken)) {
    return {
      ok: true,
      mode: "demo",
      status: 202,
      body: {
        message: "Demo token detected. Message was stored locally and not sent to LINE.",
        to: conversation.sourceId,
        text
      }
    };
  }

  const message = { type: "text", text };
  const canReply = conversation.lastReplyToken && Date.now() - new Date(conversation.lastReplyTokenAt).getTime() < REPLY_WINDOW_MS;

  if (canReply) {
    const reply = await requestLine(account.channelAccessToken, "/v2/bot/message/reply", {
      replyToken: conversation.lastReplyToken,
      messages: [message]
    });
    if (reply.ok) return { ...reply, mode: "reply" };
  }

  const push = await requestLine(account.channelAccessToken, "/v2/bot/message/push", {
    to: conversation.sourceId,
    messages: [message]
  });
  return { ...push, mode: "push" };
}

/** Verify a channel access token and read the connected Official Account. */
export async function getLineBotInfo(channelAccessToken, { fetchImpl = fetch } = {}) {
  if (!channelAccessToken) return { ok: false, status: 400, error: "Missing channel access token" };

  if (isDemoToken(channelAccessToken)) {
    return {
      ok: true,
      mode: "demo",
      status: 200,
      bot: {
        userId: "Udemo-connected-account",
        basicId: "@demo-connected",
        displayName: "Demo Connected Account",
        pictureUrl: null
      }
    };
  }

  let response;
  try {
    response = await fetchImpl(`${LINE_API_BASE}/v2/bot/info`, {
      method: "GET",
      headers: { Authorization: `Bearer ${channelAccessToken}` },
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error?.name === "TimeoutError" ? "LINE request timed out" : "LINE request failed"
    };
  }

  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      requestId: response.headers.get("x-line-request-id"),
      error: typeof body === "object" && body?.message ? body.message : "Invalid LINE credentials"
    };
  }

  return {
    ok: true,
    mode: "live",
    status: response.status,
    requestId: response.headers.get("x-line-request-id"),
    bot: {
      userId: body.userId,
      basicId: body.basicId,
      premiumId: body.premiumId || null,
      displayName: body.displayName,
      pictureUrl: body.pictureUrl || null,
      chatMode: body.chatMode || null,
      markAsReadMode: body.markAsReadMode || null
    }
  };
}

function isDemoToken(token) {
  return String(token).startsWith(DEMO_TOKEN_PREFIX);
}

async function requestLine(token, path, body) {
  let response;
  try {
    response = await fetch(`${LINE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error?.name === "TimeoutError" ? "LINE request timed out" : "LINE request failed"
    };
  }

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    requestId: response.headers.get("x-line-request-id"),
    body: text ? safeJson(text) : null
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
