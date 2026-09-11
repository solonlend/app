/*
  Unified USD quoting for Auto LP vaults (SPEC §5 单位约束 v1.7): every quote value folds
  into the vault's STABLE leg (cfg.stableLeg), so list sorting and $-prefixed displays stay
  comparable across pools regardless of on-chain token order. `price` is always the human
  pool price in token1-per-token0 (rangePriceToHuman output).
*/

/** Total value in stable-leg units (≈ USD). stableLeg 1: bal0·price + bal1; stableLeg 0:
 * bal0 + bal1/price. Undefined inputs (or a zero price divisor) stay undefined. */
export function quoteUsd(
  bal0: number | undefined,
  bal1: number | undefined,
  price: number | undefined,
  stableLeg: 0 | 1,
): number | undefined {
  if (bal0 === undefined || bal1 === undefined || price === undefined) return undefined;
  if (stableLeg === 1) return bal0 * price + bal1;
  if (price === 0) return undefined;
  return bal0 + bal1 / price;
}

/** USD value of the NON-stable leg alone (the side that needs a conversion annotation). */
export function nonStableValueUsd(
  nonStableAmount: number | undefined,
  price: number | undefined,
  stableLeg: 0 | 1,
): number | undefined {
  if (nonStableAmount === undefined || price === undefined) return undefined;
  if (stableLeg === 1) return nonStableAmount * price; // non-stable = token0
  if (price === 0) return undefined;
  return nonStableAmount / price; // non-stable = token1
}
