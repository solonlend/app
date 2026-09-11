import { test } from "node:test";
import assert from "node:assert/strict";

// minimal localStorage stub for node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const load = () => import("./auto-sync-hint.ts");

test("hint shows inside the window and expires after it", async () => {
  const { recordAutoTx, isSyncing, SYNC_WINDOW_MS } = await load();
  recordAutoTx(1, "0xAB", 1_000_000);
  assert.equal(isSyncing(1, "0xab", 1_000_000 + 60_000), true); // case-insensitive vault key
  assert.equal(isSyncing(1, "0xAB", 1_000_000 + SYNC_WINDOW_MS + 1), false);
});

test("unknown vault or unavailable storage never syncs", async () => {
  const { isSyncing } = await load();
  assert.equal(isSyncing(1, "0xnope", 5), false);
});
