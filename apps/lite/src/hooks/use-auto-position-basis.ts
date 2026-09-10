import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";

import { type RangeVaultCfg } from "@/lib/solon-range";

/**
 * Per-user USD cost basis for an Auto LP position ("At deposit" value, Beefy-dashboard style),
 * published by points/auto_positions.py to `${BASE_URL}data/auto-positions-<chainId>.json`.
 * Each deposit is priced at its own entry block; withdrawals reduce the basis proportionally.
 */
export type PositionBasis = { costBasisUsd: number; deposits: number; withdrawals: number };

type Feed = {
  chainId: number;
  vault: string;
  computedAt: number;
  positions: Record<string, PositionBasis>;
};

export function useAutoPositionBasis(cfg: RangeVaultCfg, user: Address | undefined): PositionBasis | undefined {
  const { data } = useQuery<Feed | null>({
    queryKey: ["auto-position-basis", cfg.chainId],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/auto-positions-${cfg.chainId}.json`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const j = (await res.json()) as Feed;
        return j && typeof j.positions === "object" ? j : null;
      } catch {
        return null;
      }
    },
    staleTime: 300_000,
    refetchInterval: 600_000,
    retry: 1,
  });
  if (!user || !data || data.vault !== cfg.vault?.toLowerCase()) return undefined;
  return data.positions[user.toLowerCase()];
}
