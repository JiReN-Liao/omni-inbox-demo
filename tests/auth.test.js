import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "../src/server.js";
import { resetDataForDemo } from "../src/store.js";
import { __resetAuthForTest, upsertCredential } from "../src/auth.js";

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function sessionCookie(response) {
  const cookies = response.headers.getSetCookie?.() || [];
  const session = cookies.find((c) => c.startsWith("omni_session="));
  return session ? session.split(";")[0] : null;
}

async function login(server, username, password) {
  const response = await fetch(`${baseUrl(server)}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json().catch(() => ({}));
  return { response, body, cookie: sessionCookie(response), csrf: body.csrfToken };
}

function seedCredentials() {
  __resetAuthForTest();
  resetDataForDemo();
  upsertCredential({ userId: "admin", username: "admin", password: "Sup3r-Admin-Pass", role: "admin" });
  upsertCredential({ userId: "kai", username: "kai", password: "Agent-Kai-Pass-9", role: "agent" });
}

test("valid credentials sign in and return the user and a CSRF token", async () => {
  seedCredentials();
  const server = await listen();
  try {
    const { response, body, cookie } = await login(server, "admin", "Sup3r-Admin-Pass");
    assert.equal(response.status, 200);
    assert.equal(body.user.id, "admin");
    assert.equal(body.user.role, "admin");
    assert.ok(body.csrfToken, "should return a CSRF token");
    assert.ok(cookie, "should set a session cookie");
    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith("omni_session="));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
  } finally {
    server.close();
  }
});

test("wrong password and unknown user return the same indistinguishable error", async () => {
  seedCredentials();
  const server = await listen();
  try {
    const wrongPassword = await login(server, "admin", "definitely-wrong");
    const unknownUser = await login(server, "ghost", "definitely-wrong");
    assert.equal(wrongPassword.response.status, 401);
    assert.equal(unknownUser.response.status, 401);
    assert.equal(wrongPassword.body.code, "INVALID_CREDENTIALS");
    assert.equal(unknownUser.body.code, "INVALID_CREDENTIALS");
    assert.equal(wrongPassword.body.error, unknownUser.body.error);
  } finally {
    server.close();
  }
});

test("API rejects unauthenticated requests", async () => {
  seedCredentials();
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/conversations`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "NOT_AUTHENTICATED");
  } finally {
    server.close();
  }
});

test("an agent cannot read a conversation on an account they do not own", async () => {
  seedCredentials();
  const server = await listen();
  try {
    const { cookie } = await login(server, "kai", "Agent-Kai-Pass-9");
    // kai owns only msg_acme; oa_acme must be invisible.
    const response = await fetch(`${baseUrl(server)}/api/conversations/oa_acme%3AUjohn-smith`, {
      headers: { cookie }
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "CONVERSATION_NOT_FOUND");
  } finally {
    server.close();
  }
});

test("logging out immediately invalidates the session", async () => {
  seedCredentials();
  const server = await listen();
  try {
    const { cookie, csrf } = await login(server, "admin", "Sup3r-Admin-Pass");
    const before = await fetch(`${baseUrl(server)}/api/auth/me`, { headers: { cookie } });
    assert.equal((await before.json()).user.id, "admin");

    const logout = await fetch(`${baseUrl(server)}/api/auth/logout`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf }
    });
    assert.equal(logout.status, 200);

    const after = await fetch(`${baseUrl(server)}/api/auth/me`, { headers: { cookie } });
    assert.equal((await after.json()).user, null);

    const guarded = await fetch(`${baseUrl(server)}/api/conversations`, { headers: { cookie } });
    assert.equal(guarded.status, 401);
  } finally {
    server.close();
  }
});

test("repeated failed logins trigger a temporary lockout", async () => {
  seedCredentials();
  const server = await listen();
  try {
    for (let i = 0; i < 5; i += 1) {
      const attempt = await login(server, "admin", "wrong-password");
      // Early attempts are rejected as invalid; the final one trips the lockout.
      assert.ok([401, 429].includes(attempt.response.status));
    }
    // Even the correct password is refused while the lockout is active.
    const locked = await login(server, "admin", "Sup3r-Admin-Pass");
    assert.equal(locked.response.status, 429);
    assert.equal(locked.body.code, "ACCOUNT_LOCKED");
  } finally {
    server.close();
  }
});

test("state-changing requests require a valid CSRF token", async () => {
  seedCredentials();
  const server = await listen();
  try {
    const { cookie, csrf } = await login(server, "admin", "Sup3r-Admin-Pass");
    const target = `${baseUrl(server)}/api/conversations/oa_acme%3AUjohn-smith`;

    const missing = await fetch(target, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "pending" })
    });
    assert.equal(missing.status, 403);
    assert.equal((await missing.json()).code, "INVALID_CSRF_TOKEN");

    const accepted = await fetch(target, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ status: "pending" })
    });
    assert.equal(accepted.status, 200);
  } finally {
    server.close();
  }
});

test("SSE stream authenticates with the session cookie", async () => {
  seedCredentials();
  const server = await listen();
  const controller = new AbortController();
  try {
    const unauth = await fetch(`${baseUrl(server)}/api/stream`, { signal: controller.signal });
    assert.equal(unauth.status, 401);
    controller.abort();

    const { cookie } = await login(server, "admin", "Sup3r-Admin-Pass");
    const authController = new AbortController();
    const response = await fetch(`${baseUrl(server)}/api/stream`, {
      headers: { cookie },
      signal: authController.signal
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    authController.abort();
  } finally {
    controller.abort();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("credentials persist in SQLite across a fresh database connection", async () => {
  seedCredentials();
  // Open an independent connection to the same on-disk auth database to prove
  // the user survives a process restart without relying on the module's handle.
  const reopened = new DatabaseSync(path.resolve(".test-auth.sqlite"));
  try {
    const row = reopened.prepare("SELECT user_id, role FROM auth_users WHERE username_lower = ?").get("admin");
    assert.equal(row.user_id, "admin");
    assert.equal(row.role, "admin");
  } finally {
    reopened.close();
  }
});
