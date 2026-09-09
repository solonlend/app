/*
  Deposit percentage fill (DESIGN-farm-tabs-v1 §G): 25/50/75/100 on the deposit side fill both
  token inputs in the vault's current holding ratio, sized by whichever wallet side runs out
  first. The on-chain previewDeposit remains the source of truth for what the vault actually
  takes — this only pre-fills the inputs the way a balanced depositor would.
*/

export function depositPctAmounts(
  pct: number,
  wallet0: bigint,
  wallet1: bigint,
  vaultBal0: bigint,
  vaultBal1: bigint,
): { amt0: bigint; amt1: bigint } {
  const p = BigInt(Math.max(0, Math.min(100, Math.floor(pct))));
  // One-sided or empty vault: no meaningful ratio — fill only the side(s) the vault holds.
  if (vaultBal0 === 0n && vaultBal1 === 0n) return { amt0: (wallet0 * p) / 100n, amt1: (wallet1 * p) / 100n };
  if (vaultBal0 === 0n) return { amt0: 0n, amt1: (wallet1 * p) / 100n };
  if (vaultBal1 === 0n) return { amt0: (wallet0 * p) / 100n, amt1: 0n };
  // Balanced fill: the max token0 a fully-balanced deposit could place, then take pct of it.
  const maxA0 = wallet0 < (wallet1 * vaultBal0) / vaultBal1 ? wallet0 : (wallet1 * vaultBal0) / vaultBal1;
  const amt0 = (maxA0 * p) / 100n;
  return { amt0, amt1: (amt0 * vaultBal1) / vaultBal0 };
}
