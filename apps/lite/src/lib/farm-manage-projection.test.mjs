import { test } from "node:test";
import assert from "node:assert/strict";
const load = () => import("./farm-manage-projection.ts");
test("margin repays each debt only up to its balance, excess never inflates LP value", async () => {
  const { marginDebt } = await load();
  assert.equal(marginDebt(2, 100, 3, 20, 2000), 80);
  assert.equal(marginDebt(2, 100, 0.5, 30, 2000), 3070);
});
test("LP projections respect range boundaries, leftover repayment and both liquidation directions", async () => {
  const { lpAmounts, increaseEstimate, liquidationPrices } = await load();
  assert.equal(lpAmounts(1, 4, 0.5).loan, 0);
  assert.equal(lpAmounts(1, 4, 5).risk, 0);
  const added = increaseEstimate(100, 2, 2, 2, 1, 4, 10, 100);
  assert.ok(added.value > 0 && added.value <= 200);
  assert.ok(added.debt < 220);
  const bounds = liquidationPrices(600, 0.1, 100, 2000, 1500, 2500, 0.8);
  assert.equal(bounds.length, 2);
  assert.ok(bounds[0] < 2000 && bounds[1] > 2000);
  assert.deepEqual(liquidationPrices(600, 0, 0, 2000, 1500, 2500, 0.8), []);
  assert.equal(liquidationPrices(600, 1, 100, 2000, 1500, 2500, 0.8), undefined);
});
