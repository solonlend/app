import { test } from "node:test";
import assert from "node:assert/strict";
const load = () => import("./farm-risk.ts");

const LLTV = 770000000000000000n; // 77% in 1e18

test("rows are ranked most-dangerous first with usage = debt/(value*lltv)", async () => {
  const { rankRiskRows } = await load();
  const rows = rankRiskRows(
    [
      { id: 1n, value: 100, debt: 10 }, // usage ~0.13
      { id: 2n, value: 100, debt: 70 }, // usage ~0.909
      { id: 3n, value: 100, debt: 60 }, // usage ~0.779
    ],
    LLTV,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [2n, 3n, 1n],
  );
  assert.ok(Math.abs(rows[0].usage - 70 / 77) < 1e-9);
});

test("risk tiers: >=0.9 danger, >=0.75 warn, else ok; unknown lltv gives undefined usage", async () => {
  const { rankRiskRows, riskTier } = await load();
  assert.equal(riskTier(0.95), "danger");
  assert.equal(riskTier(0.8), "warn");
  assert.equal(riskTier(0.2), "ok");
  assert.equal(riskTier(undefined), "unknown");
  const rows = rankRiskRows([{ id: 1n, value: 100, debt: 50 }], undefined);
  assert.equal(rows[0].usage, undefined);
});

test("zero-value positions rank last and never divide by zero", async () => {
  const { rankRiskRows } = await load();
  const rows = rankRiskRows(
    [
      { id: 1n, value: 0, debt: 5 },
      { id: 2n, value: 100, debt: 50 },
    ],
    LLTV,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [2n, 1n],
  );
  assert.equal(rows[1].usage, 0);
});

test("mergeRiskRows ranks lev+borrow together, unknown usage last", async () => {
  const { mergeRiskRows } = await load();
  const rows = mergeRiskRows([
    { key: "lev-1", label: "#1", kind: "LEV", usage: 0.42, value: 1000, debt: 300 },
    { key: "b-AAPL", label: "AAPL", kind: "BORROW", usage: 0.91, value: 500, debt: 280 },
    { key: "b-TSLA", label: "TSLA", kind: "BORROW", usage: undefined, value: 100, debt: 10 },
    { key: "lev-2", label: "#2", kind: "LEV", usage: 0.05, value: 50, debt: 1 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.key),
    ["b-AAPL", "lev-1", "lev-2", "b-TSLA"],
  );
});
