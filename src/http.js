/**
 * HTTP layer helpers: middleware, guards, and response/error utilities shared
 * by the Express routes in server.js. Keeping these out of server.js lets that
 * file read as a flat list of routes.
 */

import crypto from "node:crypto";

const ERROR_MESSAGES_ZH = {
  UNKNOWN_DEMO_USER: "找不到指定的示範使用者。",
  NOT_AUTHENTICATED: "請先登入後再繼續操作。",
  INVALID_CREDENTIALS: "帳號或密碼不正確。",
  ACCOUNT_LOCKED: "嘗試次數過多，請稍後再試。",
  INVALID_CSRF_TOKEN: "安全驗證失敗，請重新整理頁面後再試一次。",
  LOGIN_FIELDS_REQUIRED: "請輸入帳號與密碼。",
  ADMIN_ONLY: "此操作僅限管理員使用。",
  INVALID_ACCOUNT: "帳號資料不完整或格式不正確。",
  INVALID_LINE_CREDENTIALS: "LINE 憑證無效，請確認頻道密鑰與存取權杖。",
  INVALID_META_CREDENTIALS: "Meta 憑證無效，請確認應用程式密鑰、存取權杖與帳號識別碼。",
  UNSUPPORTED_PLATFORM: "目前不支援此訊息平台。",
  INVALID_META_SIGNATURE: "Meta 簽章驗證失敗。",
  INVALID_ACCOUNT_IDS: "帳號權限清單格式不正確。",
  USER_NOT_FOUND: "找不到指定的使用者。",
  CONVERSATION_NOT_FOUND: "找不到指定的對話，或您沒有檢視權限。",
  INVALID_CONVERSATION_PATCH: "對話更新內容不正確。",
  NOTE_REQUIRED: "請輸入內部備註內容。",
  NOTE_TOO_LONG: "內部備註內容過長。",
  FORBIDDEN: "您沒有執行此操作的權限。",
  MESSAGE_REQUIRED: "請輸入要發送的訊息。",
  MESSAGE_TOO_LONG: "訊息內容過長。",
  ACCOUNT_NOT_FOUND: "找不到指定的官方帳號，或您沒有檢視權限。",
  INVALID_LINE_SIGNATURE: "LINE 簽章驗證失敗。",
  INVALID_JSON: "送出的資料格式不正確。",
  INVALID_LINE_PAYLOAD: "LINE 事件資料格式不正確。",
  TOO_MANY_EVENTS: "一次送入的 LINE 事件數量過多。",
  API_NOT_FOUND: "找不到指定的服務端點。",
  INTERNAL_ERROR: "伺服器發生未預期的錯誤。"
};

const DETAIL_MESSAGES_ZH = {
  name: "名稱為必填欄位。",
  channelSecret: "頻道密鑰為必填欄位。",
  channelAccessToken: "頻道存取權杖為必填欄位。",
  body: "未提供可更新的欄位。",
  status: "不支援此對話狀態。",
  priority: "不支援此優先度。",
  assigneeId: "指定的負責人無權存取此帳號。",
  tags: "標籤格式或長度不正確。"
};

/**
 * Attach a request id and conservative security headers to every response.
 * The request id is echoed back and reused by error responses for tracing.
 */
export function securityHeaders(req, res, next) {
  req.requestId = req.header("x-request-id") || crypto.randomUUID();
  res.set({
    "x-request-id": req.requestId,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()"
  });
  next();
}

/** Parse the request Cookie header into a plain object (no cookie-parser dep). */
export function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

/** True when the request reached us over HTTPS (directly or via a proxy). */
export function isSecureRequest(req) {
  if (req.secure) return true;
  return String(req.header?.("x-forwarded-proto") || "").split(",")[0].trim() === "https";
}

/**
 * Set the session cookie: HttpOnly + SameSite=Lax always, Secure when the
 * request is HTTPS (so it still works on http://localhost during development).
 */
export function setSessionCookie(req, res, name, value, maxAgeMs) {
  const segments = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (isSecureRequest(req)) segments.push("Secure");
  appendCookie(res, segments.join("; "));
}

export function clearSessionCookie(req, res, name) {
  const segments = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isSecureRequest(req)) segments.push("Secure");
  appendCookie(res, segments.join("; "));
}

function appendCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) res.setHeader("Set-Cookie", cookie);
  else res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
}

/** Route guard: only allow admin demo users through. */
export function requireAdmin(req, res, next) {
  if (req.currentUser?.role !== "admin") return sendError(res, 403, "ADMIN_ONLY", "Admin only");
  next();
}

/** Send a structured JSON error: `{ error, code, requestId, details? }`. */
export function sendError(res, status, code, message, details) {
  const useChinese = String(res.req?.header("accept-language") || "").toLowerCase().startsWith("zh");
  const localizedDetails = useChinese && Array.isArray(details)
    ? details.map((detail) => ({ ...detail, message: DETAIL_MESSAGES_ZH[detail.field] || "欄位內容不正確。" }))
    : details;
  return res.status(status).json({
    error: useChinese ? ERROR_MESSAGES_ZH[code] || "請求處理失敗。" : message,
    code,
    requestId: res.getHeader("x-request-id"),
    ...(localizedDetails ? { details: localizedDetails } : {})
  });
}

/** Wrap an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Parse an integer query value, clamp it to [min, max], or fall back. */
export function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
