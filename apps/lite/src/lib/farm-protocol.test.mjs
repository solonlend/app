import { test } from "node:test";
import assert from "node:assert/strict";
const load = () => import("./farm-protocol.ts");
test("capacity warns strictly above 90%, blocks at full, and preserves unknown", async () => {
  const { capacityState } = await load();
  assert.equal(capacityState(90n, 100n).near, false);
  assert.equal(capacityState(91n, 100n).near, true);
  assert.equal(capacityState(99n, 100n).full, false);
  assert.equal(capacityState(100n, 100n).full, true);
  assert.equal(capacityState(101n, 100n).remaining, 0n);
  assert.equal(capacityState(0n, 0n).full, true);
  assert.equal(capacityState(undefined, 100n).full, undefined);
});
test("asset direction and tick prices support NVDA and reversed token ordering", async () => {
  const { farmAssets, riskPriceAtTick } = await load();
  assert.deepEqual(farmAssets("NVDA", "USDG", false), { risk: "NVDA", quote: "USDG" });
  assert.deepEqual(farmAssets("USDG", "NVDA", true), { risk: "NVDA", quote: "USDG" });
  assert.equal(farmAssets("NVDA", "USDG", undefined), undefined);
  assert.equal(riskPriceAtTick(0, false, 8, 6), 100);
  assert.equal(riskPriceAtTick(0, true, 6, 8), 100);
});

test("unlimited sentinels have no percentage or remaining amount", async () => {
  const { capacityState } = await load();
  for (const capacity of [2n ** 120n, 2n ** 120n + 1n, 2n ** 256n - 1n]) {
    for (const supplied of [undefined, 500000n, capacity]) {
      const state = capacityState(supplied, capacity);
      assert.equal(state.unlimited, true);
      assert.equal(state.percent, undefined);
      assert.equal(state.remaining, undefined);
      assert.equal(state.full, false);
      assert.equal(state.near, false);
    }
  }
  assert.equal(capacityState(1n, 2n ** 120n - 1n).unlimited, false);
  assert.equal(capacityState(1n, undefined).full, undefined);
});
test("finite Sepolia fixtures retain normal progress and warning", async () => {
  const { capacityState } = await load();
  const usdg = capacityState(500000n * 10n ** 6n, 520000n * 10n ** 6n);
  assert.equal(Math.round(usdg.percent), 96);
  assert.equal(usdg.near, true);
  const weth = capacityState(200n * 10n ** 18n, 300n * 10n ** 18n);
  assert.equal(Math.round(weth.percent), 67);
  assert.equal(weth.near, false);
});
