/* eslint-disable no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const output = ts.transpileModule(
  fs.existsSync(__dirname + "/farm-slippage.ts") ? fs.readFileSync(__dirname + "/farm-slippage.ts", "utf8") : "",
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject });
const { slippageBps } = exportsObject;
test("slippage percentage is converted exactly and bounded", () => {
  assert.equal(slippageBps("1"), 100);
  assert.equal(slippageBps("0.1"), 10);
  assert.equal(slippageBps("5"), 500);
  for (const value of ["", "NaN", "0", "5.01", "0.101"]) assert.throws(() => slippageBps(value));
});

const { mintMinimums } = exportsObject;
const Q96 = 1n << 96n;
test("mint uses actual balanced amounts and exact V3 liquidity", () => {
  const result = mintMinimums({
    sqrtPriceX96: Q96,
    tickLower: -60,
    tickUpper: 60,
    riskAmount: 1000000n,
    loanAmount: 2000000n,
    loanIsC0: true,
    slippageBps: 100,
  });
  assert.equal(result.amount0Min, 989999n);
  assert.equal(result.amount1Min, 989999n);
  assert.equal(result.minLiquidity, 330511746n);
  const reversed = mintMinimums({
    sqrtPriceX96: Q96,
    tickLower: -60,
    tickUpper: 60,
    riskAmount: 2000000n,
    loanAmount: 1000000n,
    loanIsC0: false,
    slippageBps: 100,
  });
  assert.equal(result.minLiquidity, reversed.minLiquidity);
});
test("mint rejects zero liquidity, invalid ticks and one-sided ranges", () => {
  const base = {
    sqrtPriceX96: Q96,
    tickLower: -60,
    tickUpper: 60,
    riskAmount: 1000000n,
    loanAmount: 1000000n,
    loanIsC0: true,
    slippageBps: 100,
  };
  for (const change of [
    { riskAmount: 0n },
    { tickLower: 60 },
    { tickUpper: 887273 },
    { sqrtPriceX96: 0n },
    { riskAmount: 1n },
    { slippageBps: 0 },
  ])
    assert.throws(() => mintMinimums({ ...base, ...change }));
});

const { closeMinimums } = exportsObject;
test("close protects net proceeds after debts, not gross LP withdrawal", () => {
  const result = closeMinimums({
    preview: [10000n, 20000n, 4000n, 5000n, 0n, 0n],
    sqrtPriceX96: Q96,
    loanIsC0: true,
    slippageBps: 100,
    useTopUp: false,
  });
  assert.equal(result.minOutRisk, 5940n);
  assert.equal(result.minOutLoan, 14850n);
  assert.equal(result.maxSwapIn, 0n);
});
test("close converts a risk gap into loan input units for either ordering and includes fee", () => {
  const base = {
    preview: [0n, 100000n, 10000n, 20000n, 10000n, 0n],
    sqrtPriceX96: Q96 * 2n,
    slippageBps: 100,
    useTopUp: false,
  };
  const loan0 = closeMinimums({ ...base, loanIsC0: true });
  assert.equal(loan0.maxSwapIn, 2527n); // 10000 / 4 / .9999 * 1.01, rounded upward
  assert.equal(loan0.minOutLoan, 76724n); // (80000 - 2501) * .99
  const loan1 = closeMinimums({ ...base, loanIsC0: false });
  assert.equal(loan1.maxSwapIn, 40406n);
  assert.equal(loan1.minOutLoan, 39595n);
});
test("close converts a loan gap into risk input raw units", () => {
  const result = closeMinimums({
    preview: [100000n, 0n, 20000n, 10000n, 0n, 10000n],
    sqrtPriceX96: Q96 * 2n,
    loanIsC0: true,
    slippageBps: 100,
    useTopUp: false,
  });
  assert.equal(result.maxSwapIn, 40406n);
  assert.equal(result.minOutRisk, 39595n);
});
test("top up caps approvals with upward rounding and disables swaps", () => {
  const result = closeMinimums({
    preview: [0n, 10000n, 10001n, 5000n, 10001n, 0n],
    sqrtPriceX96: Q96,
    loanIsC0: true,
    slippageBps: 100,
    useTopUp: true,
  });
  assert.equal(result.topUpRisk, 10102n);
  assert.equal(result.topUpLoan, 0n);
  assert.equal(result.maxSwapIn, 0n);
  assert.equal(result.minOutLoan, 4950n);
});
test("close rejects unrepayable gaps and invalid quotes", () => {
  const base = {
    preview: [0n, 0n, 100n, 100n, 100n, 100n],
    sqrtPriceX96: Q96,
    loanIsC0: true,
    slippageBps: 100,
    useTopUp: false,
  };
  assert.throws(() => closeMinimums(base), /top.up/i);
  assert.throws(() => closeMinimums({ ...base, sqrtPriceX96: 0n }));
  assert.throws(() => closeMinimums({ ...base, preview: [0n, 100n, 100n, 0n, 100n, 0n] }), /top.up/i);
});
