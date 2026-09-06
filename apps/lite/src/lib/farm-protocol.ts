/** Bigint comparisons avoid rounding a nearly-full reserve into a full one. */
export function capacityState(supplied: bigint | undefined, capacity: bigint | undefined) {
  // Raw reserve-capacity sentinel; check before decimal conversion or ratio math.
  if (capacity !== undefined && capacity >= 2n ** 120n)
    return { unlimited: true, full: false, near: false, percent: undefined, remaining: undefined };
  if (supplied === undefined || capacity === undefined)
    return { unlimited: false, full: undefined, near: false, percent: undefined, remaining: undefined };
  return {
    unlimited: false,
    full: supplied >= capacity,
    near: supplied * 100n > capacity * 90n,
    percent: capacity === 0n ? 100 : Math.min(100, Number((supplied * 10000n) / capacity) / 100),
    remaining: supplied >= capacity ? 0n : capacity - supplied,
  };
}

export function farmAssets(token0: string, token1: string, loanIsC0: boolean | undefined) {
  if (loanIsC0 === undefined) return undefined;
  return { risk: loanIsC0 ? token1 : token0, quote: loanIsC0 ? token0 : token1 };
}

export function riskPriceAtTick(tick: number, loanIsC0: boolean, decimals0: number, decimals1: number) {
  const token1PerToken0 = Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);
  return loanIsC0 ? 1 / token1PerToken0 : token1PerToken0;
}
