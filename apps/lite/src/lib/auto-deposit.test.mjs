import { test } from "node:test";
import assert from "node:assert/strict";
const load = () => import("./auto-deposit.ts");

test("pct fills both sides in the vault's current ratio, limited by the scarcer wallet side", async () => {
  const { depositPctAmounts } = await load();
  // Vault holds 1:2500 (0 vs 1). Wallet has plenty of token1, little token0 → token0 limits.
  const r = depositPctAmounts(100, 10n * 10n ** 18n, 100_000n * 10n ** 6n, 1n * 10n ** 18n, 2_500n * 10n ** 6n);
  assert.equal(r.amt0, 10n * 10n ** 18n);
  assert.equal(r.amt1, 25_000n * 10n ** 6n);
  // Token1 limits: wallet1 only covers 4 units of token0 at the vault ratio.
  const r2 = depositPctAmounts(100, 10n * 10n ** 18n, 10_000n * 10n ** 6n, 1n * 10n ** 18n, 2_500n * 10n ** 6n);
  assert.equal(r2.amt0, 4n * 10n ** 18n);
  assert.equal(r2.amt1, 10_000n * 10n ** 6n);
});

test("pct scales linearly and never exceeds wallet balances", async () => {
  const { depositPctAmounts } = await load();
  const w0 = 10n * 10n ** 18n;
  const w1 = 100_000n * 10n ** 6n;
  const full = depositPctAmounts(100, w0, w1, 3n, 7n);
  const half = depositPctAmounts(50, w0, w1, 3n, 7n);
  assert.ok(half.amt0 <= full.amt0 / 2n + 1n && half.amt1 <= full.amt1 / 2n + 1n);
  assert.ok(full.amt0 <= w0 && full.amt1 <= w1);
});

test("one-sided vault fills only the held side; empty vault falls back to pct of each balance", async () => {
  const { depositPctAmounts } = await load();
  const oneSided = depositPctAmounts(50, 8n * 10n ** 18n, 6_000n * 10n ** 6n, 0n, 2_500n * 10n ** 6n);
  assert.equal(oneSided.amt0, 0n);
  assert.equal(oneSided.amt1, 3_000n * 10n ** 6n);
  const otherSide = depositPctAmounts(50, 8n * 10n ** 18n, 6_000n * 10n ** 6n, 1n * 10n ** 18n, 0n);
  assert.equal(otherSide.amt0, 4n * 10n ** 18n);
  assert.equal(otherSide.amt1, 0n);
  const empty = depositPctAmounts(25, 8n * 10n ** 18n, 6_000n * 10n ** 6n, 0n, 0n);
  assert.equal(empty.amt0, 2n * 10n ** 18n);
  assert.equal(empty.amt1, 1_500n * 10n ** 6n);
});
