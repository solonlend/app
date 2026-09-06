const BPS = 10_000n;
const Q96 = 1n << 96n;
const Q192 = Q96 * Q96;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

function checkedBps(value: number): bigint {
  if (!Number.isInteger(value) || value < 10 || value > 500) throw new Error("Slippage must be between 0.1% and 5%.");
  return BigInt(value);
}

export function slippageBps(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter slippage with at most two decimal places.");
  const bps = Math.round(Number(value) * 100);
  checkedBps(bps);
  return bps;
}

// TickMath constants and Q96 rounding mirror leverage/src/libraries/TickMath.sol
// (Uniswap V3, GPL-2.0-or-later); no floating point price/liquidity arithmetic.
const TICK_FACTORS = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
] as const;
function sqrtAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887272) throw new Error("Invalid pool tick.");
  const abs = Math.abs(tick);
  let ratio = 1n << 128n;
  TICK_FACTORS.forEach((factor, bit) => {
    if ((abs & (1 << bit)) !== 0) ratio = (ratio * factor) >> 128n;
  });
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return ceilDiv(ratio, 1n << 32n);
}

export const poolStateAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

export function mintMinimums(input: {
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  riskAmount: bigint;
  loanAmount: bigint;
  loanIsC0: boolean;
  slippageBps: number;
}) {
  const keep = BPS - checkedBps(input.slippageBps);
  const a = sqrtAtTick(input.tickLower);
  const b = sqrtAtTick(input.tickUpper);
  const p = input.sqrtPriceX96;
  if (a >= b || p <= a || p >= b) throw new Error("Current pool price must be inside the selected range.");
  const amount0 = input.loanIsC0 ? input.loanAmount : input.riskAmount;
  const amount1 = input.loanIsC0 ? input.riskAmount : input.loanAmount;
  if (amount0 <= 0n || amount1 <= 0n) throw new Error("Both token amounts must be positive.");
  // Match LiquidityAmounts.getLiquidityForAmounts, including intermediate flooring.
  const l0 = (amount0 * ((p * b) / Q96)) / (b - p);
  const l1 = (amount1 * Q96) / (p - a);
  const liquidity = l0 < l1 ? l0 : l1;
  if (liquidity > (1n << 128n) - 1n) throw new Error("Liquidity exceeds the pool limit.");
  const used0 = ((liquidity << 96n) * (b - p)) / b / p;
  const used1 = (liquidity * (p - a)) / Q96;
  const amount0Min = (used0 * keep) / BPS;
  const amount1Min = (used1 * keep) / BPS;
  const minLiquidity = (liquidity * keep) / BPS;
  if (amount0Min <= 0n || amount1Min <= 0n || minLiquidity <= 0n)
    throw new Error("Amounts are too small for protected liquidity minting.");
  return { amount0Min, amount1Min, minLiquidity };
}

export function closeMinimums(input: {
  preview: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  sqrtPriceX96: bigint;
  loanIsC0: boolean;
  slippageBps: number;
  useTopUp: boolean;
}) {
  const bps = checkedBps(input.slippageBps);
  const keep = BPS - bps;
  if (input.sqrtPriceX96 <= 0n || input.preview.some((value) => value < 0n))
    throw new Error("Invalid close preview or pool price.");
  const [gotRisk, gotLoan, dueRisk, dueLoan, shortRisk, shortLoan] = input.preview;
  const gapRisk = dueRisk > gotRisk ? dueRisk - gotRisk : 0n;
  const gapLoan = dueLoan > gotLoan ? dueLoan - gotLoan : 0n;
  if (shortRisk !== gapRisk || shortLoan !== gapLoan)
    throw new Error("Inconsistent close preview. Refresh before submitting.");
  let netRisk = gotRisk > dueRisk ? gotRisk - dueRisk : 0n;
  let netLoan = gotLoan > dueLoan ? gotLoan - dueLoan : 0n;
  let maxSwapIn = 0n;
  const topUpRisk = input.useTopUp ? ceilDiv(gapRisk * (BPS + bps), BPS) : 0n;
  const topUpLoan = input.useTopUp ? ceilDiv(gapLoan * (BPS + bps), BPS) : 0n;
  if (!input.useTopUp && (gapRisk > 0n || gapLoan > 0n)) {
    if (gapRisk > 0n && gapLoan > 0n) throw new Error("Insufficient proceeds to repay both debts. Enable top-up.");
    const priceSquared = input.sqrtPriceX96 * input.sqrtPriceX96;
    // token1/token0 raw-unit price: decimals are already encoded in sqrtPriceX96.
    // Both configured V3 farms use fee=100 (0.01%); include exact-output input fee.
    const outputIsToken0 = gapRisk > 0n ? !input.loanIsC0 : input.loanIsC0;
    const gap = gapRisk > 0n ? gapRisk : gapLoan;
    const numerator = outputIsToken0 ? priceSquared : Q192;
    const denominator = outputIsToken0 ? Q192 : priceSquared;
    const expectedInput = ceilDiv(gap * numerator * 1_000_000n, denominator * 999_900n);
    maxSwapIn = ceilDiv(expectedInput * (BPS + bps), BPS);
    const availableInput = gapRisk > 0n ? netLoan : netRisk;
    // Staying strictly below all remaining proceeds also prevents the contract's
    // underwater exact-input fallback from silently spending the whole leg.
    if (maxSwapIn >= availableInput) throw new Error("Insufficient proceeds for a protected debt swap. Enable top-up.");
    if (gapRisk > 0n) netLoan -= expectedInput;
    else netRisk -= expectedInput;
  }
  return { topUpRisk, topUpLoan, maxSwapIn, minOutRisk: (netRisk * keep) / BPS, minOutLoan: (netLoan * keep) / BPS };
}
