import { useQuery } from "@tanstack/react-query";

/**
 * Pool-level stats for Auto LP candidate pools, published by points/auto_pools.py to
 * `${BASE_URL}data/auto-pools.json` (same-origin, same publishing pattern as farm-fee-apr.json).
 * Used only for vaults that are not deployed yet — the list would otherwise be all dashes and
 * impossible to design against. Deployed vaults read their own on-chain state instead.
 */
export type AutoPoolStats = {
  tvlUsd: number;
  volume24hUsd: number;
  feeTier: number;
  feeAprGross: number;
};

type Feed = { pools: Record<string, AutoPoolStats>; computedAt: number };

export function useAutoPoolStats(pool: string | undefined): AutoPoolStats | undefined {
  const { data } = useQuery<Feed | null>({
    queryKey: ["auto-pool-stats"],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/auto-pools.json`, { cache: "no-store" });
        if (!res.ok) return null;
        const j = (await res.json()) as Feed;
        return j && typeof j.pools === "object" ? j : null;
      } catch {
        return null;
      }
    },
    staleTime: 300_000,
    refetchInterval: 900_000,
    retry: 1,
  });
  return pool ? data?.pools?.[pool.toLowerCase()] : undefined;
}
