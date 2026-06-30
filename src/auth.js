/**
 * Authentication: credentials, sessions, and brute-force protection.
 *
 * Auth state lives in its OWN SQLite database (auth_users, auth_sessions),
 * deliberately separate from the conversation store in store.js/database.js.
 * Keeping it apart means login/logout churn never creates app_state snapshots
 * or external backups, so sessions can expire and be swept without ever
 * touching conversations, accounts, messages, snapshots, or backups.
 *
 * Passwords are stored as scrypt hashes (never plaintext) and verified with a
 * timing-safe comparison. Login failures are rate limited per username+IP with
 * a short lockout to slow credential-stuffing.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const isTest = Boolean(process.env.NODE_TEST_CONTEXT);

/* ------------------------------- Tunables ----------------------------------- */
const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 64 };
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000); // 12h
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 15 * 60 * 1000); // 15m
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000);

// A fixed hash used to equalise verify timing when a username does not exist,
// so responses do not reveal whether an account is present.
const DUMMY_HASH = hashPassword("omni-inbox-timing-equalizer");

/* ------------------------------- Database ----------------------------------- */
const authDbPath = path.resolve(
  process.env.OMNI_AUTH_DB_PATH || (isTest ? ".test-auth.sqlite" : "omni-auth.sqlite")
);
fs.mkdirSync(path.dirname(authDbPath), { recursive: true });

const db = new DatabaseSync(authDbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
`);

/* ------------------------------- Passwords ---------------------------------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p)
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ------------------------------- Credentials -------------------------------- */
/**
 * Create or update a credential for an existing app user. `overwrite: false`
 * (the default) preserves any existing password — used by env bootstrap so a
 * restart never silently resets an admin password.
 */
export function upsertCredential({ userId, username, password, role }, { overwrite = false } = {}) {
  const now = new Date().toISOString();
  const lower = String(username).trim().toLowerCase();
  const existing = db.prepare("SELECT user_id FROM auth_users WHERE user_id = ? OR username_lower = ?").get(userId, lower);
  if (existing && !overwrite) return { created: false, user: getCredential(existing.user_id) };

  const password_hash = hashPassword(password);
  db.prepare(`
    INSERT INTO auth_users (user_id, username, username_lower, role, password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username, username_lower = excluded.username_lower,
      role = excluded.role, password = excluded.password, updated_at = excluded.updated_at
  `).run(userId, String(username).trim(), lower, role, password_hash, existing ? now : now, now);
  return { created: !existing, user: getCredential(userId) };
}

export function setPassword(userId, password) {
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE auth_users SET password = ?, updated_at = ? WHERE user_id = ?")
    .run(hashPassword(password), now, userId);
  return result.changes > 0;
}

export function getCredential(userId) {
  const row = db.prepare("SELECT user_id, username, role FROM auth_users WHERE user_id = ?").get(userId);
  return row ? { userId: row.user_id, username: row.username, role: row.role } : null;
}

export function hasAnyAdmin() {
  return Boolean(db.prepare("SELECT 1 FROM auth_users WHERE role = 'admin' LIMIT 1").get());
}

/**
 * Provision the first administrator from environment variables. Skips silently
 * when the variables are absent or an admin already exists, and never logs the
 * plaintext password. `adminUserId` ties the credential to the app user that
 * owns roles and account access in store.js.
 */
export function bootstrapAdminFromEnv({ adminUserId = "admin" } = {}) {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || "").trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
  if (!username || !password) return { applied: false, reason: "missing-env" };
  if (db.prepare("SELECT 1 FROM auth_users WHERE user_id = ? OR role = 'admin' LIMIT 1").get(adminUserId)) {
    return { applied: false, reason: "admin-exists" };
  }
  upsertCredential({ userId: adminUserId, username, password, role: "admin" }, { overwrite: false });
  return { applied: true, username };
}

/* ------------------------------- Rate limiting ------------------------------ */
const attempts = new Map(); // key -> { count, firstAt, lockedUntil }

function rateKey(username, ip) {
  return `${String(username).toLowerCase()}|${ip || "?"}`;
}

export function isLocked(username, ip, now = Date.now()) {
  const record = attempts.get(rateKey(username, ip));
  return Boolean(record?.lockedUntil && record.lockedUntil > now);
}

function registerFailure(username, ip, now = Date.now()) {
  const key = rateKey(username, ip);
  const record = attempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - record.firstAt > LOGIN_WINDOW_MS) {
    record.count = 0;
    record.firstAt = now;
    record.lockedUntil = 0;
  }
  record.count += 1;
  if (record.count >= LOGIN_MAX_ATTEMPTS) record.lockedUntil = now + LOGIN_LOCK_MS;
  attempts.set(key, record);
}

function clearFailures(username, ip) {
  attempts.delete(rateKey(username, ip));
}

/* ------------------------------- Authentication ----------------------------- */
/**
 * Verify a username/password. Returns a uniform `{ ok, code }` so callers can
 * surface one indistinguishable error for both "no such user" and "wrong
 * password". `code: "locked"` signals an active lockout.
 */
export function authenticate(username, password, { ip } = {}) {
  const cleaned = String(username || "").trim();
  const now = Date.now();
  if (isLocked(cleaned, ip, now)) return { ok: false, code: "locked" };

  const row = db.prepare("SELECT user_id, username, role, password FROM auth_users WHERE username_lower = ?")
    .get(cleaned.toLowerCase());

  // Always run a scrypt verification (real or dummy) to keep timing uniform.
  const matches = row ? verifyPassword(password, row.password) : (verifyPassword(password, DUMMY_HASH) && false);
  if (!row || !matches) {
    registerFailure(cleaned, ip, now);
    if (isLocked(cleaned, ip, now)) return { ok: false, code: "locked" };
    return { ok: false, code: "invalid" };
  }

  clearFailures(cleaned, ip);
  return { ok: true, user: { userId: row.user_id, username: row.username, role: row.role } };
}

/* ------------------------------- Sessions ----------------------------------- */
/**
 * Issue a brand-new session. Because every successful login mints a fresh,
 * unguessable id (rather than trusting any client-supplied value), session
 * fixation is structurally impossible.
 */
export function createSession(userId, now = Date.now()) {
  sweepExpiredSessions(now);
  const id = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  db.prepare(`INSERT INTO auth_sessions (id, user_id, csrf_token, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, userId, csrfToken, createdAt, expiresAt, createdAt);
  return { id, csrfToken, userId, expiresAt };
}

export function getSession(sessionId, now = Date.now()) {
  if (!sessionId) return null;
  const row = db.prepare("SELECT id, user_id, csrf_token, expires_at FROM auth_sessions WHERE id = ?").get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= now) {
    destroySession(sessionId);
    return null;
  }
  db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(new Date(now).toISOString(), sessionId);
  return { id: row.id, userId: row.user_id, csrfToken: row.csrf_token, expiresAt: row.expires_at };
}

export function destroySession(sessionId) {
  if (!sessionId) return;
  db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(sessionId);
}

/** Remove expired sessions only. Never touches the conversation store. */
export function sweepExpiredSessions(now = Date.now()) {
  const result = db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
  return result.changes;
}

export const SESSION_COOKIE = "omni_session";
export const sessionTtlMs = SESSION_TTL_MS;

/* ------------------------------- Test helpers ------------------------------- */
export function __resetAuthForTest() {
  db.exec("DELETE FROM auth_sessions; DELETE FROM auth_users;");
  attempts.clear();
}
