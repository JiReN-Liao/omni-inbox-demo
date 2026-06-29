import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableStore } from "../src/database.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-inbox-storage-"));
  const options = {
    databasePath: path.join(root, "data.sqlite"),
    legacyPath: path.join(root, "data.json"),
    backupDir: path.join(root, "backups"),
    changePath: path.join(root, ".change"),
    seed: { messages: [] }
  };
  return { root, options };
}

test("durable store survives process-style reopen and keeps snapshots", () => {
  const { root, options } = fixture();
  try {
    const first = new DurableStore(options);
    first.write({ messages: [{ id: "message-1", text: "persist me" }] });
    assert.equal(first.status().integrity, "ok");
    assert.ok(first.status().snapshots >= 1);
    first.close();

    const reopened = new DurableStore(options);
    assert.equal(reopened.read().messages[0].text, "persist me");
    assert.ok(reopened.status().backups >= 1);
    reopened.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("durable store recovers a corrupted database from verified external backup", () => {
  const { root, options } = fixture();
  try {
    const first = new DurableStore(options);
    first.write({ messages: [{ id: "message-2", text: "recover me" }] });
    first.close();
    fs.writeFileSync(options.databasePath, "not a sqlite database", "utf8");

    const recovered = new DurableStore(options);
    assert.equal(recovered.read().messages[0].text, "recover me");
    assert.equal(recovered.status().recoveredAtStartup, true);
    assert.equal(recovered.status().version, 2);
    recovered.write({ messages: [{ id: "message-3", text: "after recovery" }] });
    assert.equal(recovered.status().version, 3);
    assert.ok(fs.readdirSync(root).some((name) => name.includes(".corrupt-")));
    recovered.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("durable store migrates legacy JSON without losing records", () => {
  const { root, options } = fixture();
  try {
    fs.writeFileSync(options.legacyPath, JSON.stringify({ messages: [{ id: "legacy-1" }] }), "utf8");
    const store = new DurableStore(options);
    assert.equal(store.read().messages[0].id, "legacy-1");
    assert.equal(store.status().integrity, "ok");
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
