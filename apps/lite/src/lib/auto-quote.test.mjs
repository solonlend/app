import { test } from "node:test";
import assert from "node:assert/strict";
const load = () => import("./auto-quote.ts");

test("stableLeg=1 quotes into token1 (original ETH/USDG behavior)", async () => {
  const { quoteUsd } = await load();
  // 10 ETH @ 3000 USDG/ETH + 5000 USDG = 35,000
  assert.equal(quoteUsd(10, 5000, 3000, 1), 35000);
});

test("stableLeg=0 quotes into token0 (USDG-first equity pools)", async () => {
  const { quoteUsd } = await load();
  // price = token1 per token0 = GLD per USDG = 1/300 → 1 GLD = 300 USDG.
  // 5000 USDG + 10 GLD × 300 = 8,000
  assert.equal(quoteUsd(5000, 10, 1 / 300, 0), 8000);
});

test("undefined inputs propagate as undefined, zero price never divides", async () => {
  const { quoteUsd } = await load();
  assert.equal(quoteUsd(undefined, 1, 1, 1), undefined);
  assert.equal(quoteUsd(1, 1, undefined, 0), undefined);
  assert.equal(quoteUsd(1, 1, 0, 0), undefined);
});

test("nonStableValueUsd converts only the non-stable leg", async () => {
  const { nonStableValueUsd } = await load();
  assert.equal(nonStableValueUsd(10, 3000, 1), 30000); // ETH leg (token0) in USDG
  assert.equal(nonStableValueUsd(10, 1 / 300, 0), 3000); // GLD leg (token1) in USDG
});
