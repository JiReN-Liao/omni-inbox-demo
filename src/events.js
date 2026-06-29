/**
 * Realtime change source.
 *
 * Watches the JSON data file and notifies subscribers whenever it changes.
 * Because every mutation in store.js ends with an atomic write, a single file
 * watcher captures all of them — no matter which route (or process) caused the
 * change — without coupling the store to the HTTP/SSE layer.
 */

import fs from "node:fs";
import path from "node:path";

const isTest = Boolean(process.env.NODE_TEST_CONTEXT);
const dataPath = path.resolve(process.cwd(), isTest ? ".test-data.change" : ".omni-inbox.change");
const dataDir = path.dirname(dataPath);
const dataFile = path.basename(dataPath);

const listeners = new Set();
let watcher = null;
let debounceTimer = null;

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a failing subscriber must not break the others */
    }
  }
}

function ensureWatcher() {
  if (watcher) return;
  try {
    watcher = fs.watch(dataDir, (_eventType, filename) => {
      // Ignore temporary writes and react only after the change signal is replaced.
      if (filename && filename !== dataFile) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(notify, 120);
    });
    watcher.unref?.();
  } catch {
    watcher = null;
  }
}

/**
 * Register a callback fired (debounced) whenever the data file changes.
 * Returns an unsubscribe function; the watcher is released when the last
 * subscriber leaves.
 */
export function subscribeToData(listener) {
  listeners.add(listener);
  ensureWatcher();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && watcher) {
      watcher.close();
      watcher = null;
      clearTimeout(debounceTimer);
    }
  };
}
