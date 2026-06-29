import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { resetDataForDemo } from "../src/store.js";

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("SSE stream sends a ready event and a refresh when data changes", async () => {
  resetDataForDemo();
  const server = await listen();
  const controller = new AbortController();
  try {
    const response = await fetch(`${baseUrl(server)}/api/stream?demoUser=admin`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const pump = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      } catch {
        /* aborted */
      }
    })();

    const waitFor = async (token, ms) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (buffer.includes(token)) return true;
        await new Promise((r) => setTimeout(r, 40));
      }
      return false;
    };

    assert.ok(await waitFor("event: ready", 2_000), "should receive the ready event");

    // Any data mutation should produce a refresh signal.
    await fetch(`${baseUrl(server)}/api/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "admin" },
      body: JSON.stringify({ accountId: "oa_acme", text: "live ping" })
    });

    assert.ok(await waitFor("event: refresh", 4_000), "should receive a refresh after data changes");

    controller.abort();
    await pump;
  } finally {
    controller.abort();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("SSE stream rejects unknown demo users", async () => {
  const server = await listen();
  try {
    const response = await fetch(`${baseUrl(server)}/api/stream?demoUser=not-a-user`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "UNKNOWN_DEMO_USER");
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
