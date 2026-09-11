import { test } from "node:test";
import assert from "node:assert/strict";
import { URL } from "node:url";
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

test("shortfall is the per-side gap between what the vault will take and the wallet balance", async () => {
  const { depositShortfalls } = await load();
  // take0 exceeds wallet0 by 3 units; token1 side fully covered.
  const r = depositShortfalls(10n * 10n ** 18n, 500n * 10n ** 6n, 7n * 10n ** 18n, 500n * 10n ** 6n);
  assert.equal(r.short0, 3n * 10n ** 18n);
  assert.equal(r.short1, 0n);
  // Exact equality is not a shortfall.
  const eq = depositShortfalls(5n, 5n, 5n, 5n);
  assert.equal(eq.short0, 0n);
  assert.equal(eq.short1, 0n);
  // Both sides short.
  const both = depositShortfalls(6n, 6n, 1n, 2n);
  assert.equal(both.short0, 5n);
  assert.equal(both.short1, 4n);
});

test("swap link exists only for Robinhood chain and pre-fills the token address", async () => {
  const { swapLinkFor } = await load();
  const addr = "0x00000000000000000000000000000000000000AB";
  const rh = swapLinkFor(4663, addr);
  assert.ok(rh, "RH gets a Uniswap link");
  const u = new URL(rh);
  assert.equal(u.protocol, "https:");
  assert.equal(u.host, "app.uniswap.org");
  assert.equal(u.pathname, "/swap");
  assert.equal(u.searchParams.get("chain"), "robinhood");
  assert.equal(u.searchParams.get("outputCurrency"), addr);
  assert.equal(swapLinkFor(11155111, addr), undefined, "Sepolia testnet gets no link");
  assert.equal(swapLinkFor(1, addr), undefined, "unmapped chains get no link");
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
