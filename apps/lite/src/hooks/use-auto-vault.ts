import { formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { useAutoPoolStats } from "@/hooks/use-auto-pool-stats";
import { useLiveFeeApr } from "@/hooks/use-live-fee-apr";
import { rangePriceToHuman, rangeStrategyAbi, rangeVaultAbi, type RangeVaultCfg } from "@/lib/solon-range";

/** Net-of-fees APR shown to depositors: live gross fee APR × (1 − 10% performance fee). */
export const PERFORMANCE_FEE = 0.1;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Single data source for one Auto LP vault — the list row and the detail page both read from
 * here, so the two can never disagree (DESIGN-farm-tabs-v1 §G). Safe to call for an undeployed
 * config: reads stay disabled and everything comes back undefined.
 */
export function useAutoVault(cfg: RangeVaultCfg) {
  const { address: user } = useAccount();
  const deployed = cfg.vault !== undefined && cfg.strategy !== undefined;
  const d0 = cfg.token0.decimals;
  const d1 = cfg.token1.decimals;

  const { data: vaultData, refetch: refetchVault } = useReadContracts({
    contracts: [
      { chainId: cfg.chainId, address: cfg.vault ?? ZERO, abi: rangeVaultAbi, functionName: "balances" },
      { chainId: cfg.chainId, address: cfg.vault ?? ZERO, abi: rangeVaultAbi, functionName: "totalSupply" },
      { chainId: cfg.chainId, address: cfg.vault ?? ZERO, abi: rangeVaultAbi, functionName: "isCalm" },
      {
        chainId: cfg.chainId,
        address: cfg.vault ?? ZERO,
        abi: rangeVaultAbi,
        functionName: "balanceOf",
        args: [user ?? ZERO],
      },
    ],
    query: { refetchInterval: 30_000, enabled: deployed },
  });
  const { data: stratData, refetch: refetchStrat } = useReadContracts({
    contracts: [
      { chainId: cfg.chainId, address: cfg.strategy ?? ZERO, abi: rangeStrategyAbi, functionName: "price" },
      { chainId: cfg.chainId, address: cfg.strategy ?? ZERO, abi: rangeStrategyAbi, functionName: "range" },
    ],
    query: { refetchInterval: 30_000, enabled: deployed },
  });

  const balances = vaultData?.[0]?.result as readonly [bigint, bigint] | undefined;
  const totalSupply = vaultData?.[1]?.result as bigint | undefined;
  const isCalm = vaultData?.[2]?.result as boolean | undefined;
  const myShares = (user ? (vaultData?.[3]?.result as bigint | undefined) : 0n) ?? 0n;
  const priceRaw = stratData?.[0]?.result as bigint | undefined;
  const range = stratData?.[1]?.result as readonly [bigint, bigint] | undefined;

  const price = priceRaw !== undefined ? rangePriceToHuman(priceRaw, d0, d1) : undefined;
  const lower = range ? rangePriceToHuman(range[0], d0, d1) : undefined;
  const upper = range ? rangePriceToHuman(range[1], d0, d1) : undefined;
  const inRange = price !== undefined && lower !== undefined && upper !== undefined && price >= lower && price <= upper;

  const bal0 = balances ? Number(formatUnits(balances[0], d0)) : undefined;
  const bal1 = balances ? Number(formatUnits(balances[1], d1)) : undefined;
  // TVL is quoted in token1. Comparing it across vaults (list sorting) assumes every vault's
  // token1 is the same stable quote asset — enforced in solon-farms config until a USD source lands.
  const tvl1 = bal0 !== undefined && bal1 !== undefined && price !== undefined ? bal0 * price + bal1 : undefined;
  const myFrac = totalSupply && totalSupply > 0n ? Number(myShares) / Number(totalSupply) : 0;
  const myValue1 = tvl1 !== undefined ? tvl1 * myFrac : undefined;
  const val0 = bal0 !== undefined && price !== undefined ? bal0 * price : undefined;
  const share0 = val0 !== undefined && tvl1 ? (val0 / tvl1) * 100 : undefined;

  // Live fee APR — pool-keyed: a vault on a pool the indexer doesn't cover shows "—", never a
  // borrowed number. Testnet has no feed at all.
  const { data: liveApr } = useLiveFeeApr(cfg.pool);
  const grossApr = cfg.testnet ? undefined : liveApr?.feeApr;
  let netApr = grossApr !== undefined ? grossApr * (1 - PERFORMANCE_FEE) : undefined;

  // Undeployed mainnet vaults: fall back to pool-level stats (auto-pools.json) so the directory
  // shows the real market instead of dashes. Marked pool-level in the UI (`poolLevel`).
  const poolStats = useAutoPoolStats(cfg.testnet ? undefined : cfg.pool);
  const poolLevel = !deployed && !cfg.testnet && poolStats !== undefined;
  let poolTvlUsd: number | undefined;
  if (poolLevel) {
    poolTvlUsd = poolStats.tvlUsd;
    if (netApr === undefined) netApr = poolStats.feeAprGross * (1 - PERFORMANCE_FEE);
  }

  const refetch = () => {
    void refetchVault();
    void refetchStrat();
  };

  return {
    user,
    deployed,
    d0,
    d1,
    balances,
    totalSupply,
    isCalm,
    myShares,
    price,
    lower,
    upper,
    inRange,
    bal0,
    bal1,
    tvl1,
    myFrac,
    myValue1,
    val0,
    share0,
    netApr,
    poolLevel,
    poolTvlUsd,
    poolStats,
    refetch,
  };
}
