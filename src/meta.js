import crypto from "node:crypto";
import { META_DEMO_TOKEN_PREFIX, META_GRAPH_BASE, META_REQUEST_TIMEOUT_MS } from "./constants.js";

export function verifyMetaSignature(appSecret, bodyBuffer, signature) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", appSecret).update(bodyBuffer).digest("hex")}`);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function getMetaAccountInfo(platform, accessToken, externalAccountId, { fetchImpl = fetch } = {}) {
  if (!["messenger", "instagram"].includes(platform) || !accessToken || !externalAccountId) {
    return { ok: false, status: 400, error: "Missing Meta connector credentials" };
  }

  if (String(accessToken).startsWith(META_DEMO_TOKEN_PREFIX)) {
    return {
      ok: true,
      mode: "demo",
      status: 200,
      account: platform === "instagram"
        ? { id: externalAccountId, name: "Demo Instagram", username: "demo.instagram", pictureUrl: null }
        : { id: externalAccountId, name: "Demo Messenger Page", username: null, pictureUrl: null }
    };
  }

  const fields = platform === "instagram" ? "id,username,name,profile_picture_url" : "id,name,picture";
  let response;
  try {
    response = await fetchImpl(`${META_GRAPH_BASE}/${encodeURIComponent(externalAccountId)}?fields=${encodeURIComponent(fields)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    return { ok: false, status: null, error: error?.name === "TimeoutError" ? "Meta request timed out" : "Meta request failed" };
  }

  const body = safeJson(await response.text());
  if (!response.ok) return { ok: false, status: response.status, error: body?.error?.message || "Invalid Meta credentials" };
  return {
    ok: true,
    mode: "live",
    status: response.status,
    account: {
      id: body.id,
      name: body.name || body.username || `${platform} account`,
      username: body.username || null,
      pictureUrl: body.profile_picture_url || body.picture?.data?.url || null
    }
  };
}

export async function sendMetaMessage(account, conversation, text, { fetchImpl = fetch } = {}) {
  if (!account?.pageAccessToken || !account?.externalAccountId) {
    return { ok: false, mode: "none", error: "Missing Meta account credentials" };
  }
  if (String(account.pageAccessToken).startsWith(META_DEMO_TOKEN_PREFIX)) {
    return { ok: true, mode: "demo", status: 202, body: { to: conversation.sourceId, text } };
  }

  try {
    const response = await fetchImpl(`${META_GRAPH_BASE}/${encodeURIComponent(account.externalAccountId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.pageAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: conversation.sourceId }, message: { text } }),
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS)
    });
    const body = safeJson(await response.text());
    return { ok: response.ok, mode: account.platform, status: response.status, body };
  } catch (error) {
    return { ok: false, mode: account.platform, status: null, error: error?.name === "TimeoutError" ? "Meta request timed out" : "Meta request failed" };
  }
}

function safeJson(text) {
  try { return text ? JSON.parse(text) : null; }
  catch { return text; }
}
