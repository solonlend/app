import { useQuery } from "@tanstack/react-query";

/**
 * Live "observation pools" — the top Robinhood-Chain Uniswap pools by TVL, published by the
 * off-chain indexer (points/observation_pools.py) to `${BASE_URL}data/observation-pools.json`
 * (same origin, no CORS). Source is Uniswap's own interface gateway, so TVL matches the DEX UI.
 * `has_feed` marks the pools whose tokens both carry a Chainlink feed (the only ones eligible to
 * become a Solon leverage farm). `fee_apr` is annualized 24h volume x feeTier / TVL, computed from
 * the gateway's public fields; the gateway does not expose 24h volume for v4 pools, so their
 * `fee_apr` is null and the UI shows it as unavailable.
 */
export type ObservationPool = {
  rank: number;
  label: string;
  token0_sym: string;
  token1_sym: string;
  dex: "v3" | "v4";
  fee_tier_label: string;
  tvl_usd: number;
  vol_24h_usd: number | null;
  fee_apr: number | null;
  has_feed: boolean;
};

export type ObservationPools = {
  generated_at: number;
  pools: ObservationPool[];
};

export function useObservationPools() {
  return useQuery<ObservationPools | null>({
    queryKey: ["observation-pools"],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/observation-pools.json`, { cache: "no-store" });
        if (!res.ok) return null;
        const j = (await res.json()) as ObservationPools;
        return Array.isArray(j?.pools) && j.pools.length ? j : null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
  });
}
