import { useQuery } from "@tanstack/react-query";

import { type RangeVaultCfg } from "@/lib/solon-range";

/**
 * Vault activity feed (SPEC §2.5.5 v1.9): harvest + rebalance history, published by
 * points/auto_history.py to `${BASE_URL}data/auto-history-<chainId>.json`. Amount fields
 * are raw-unit strings; ticks are plain numbers. Feed missing → undefined → panel hidden.
 */
export type HistoryEntry = {
  tx: string;
  block: number;
  ts: number;
  kind: "harvest" | "rebalance";
  fee0?: string;
  fee1?: string;
  treasury0?: string;
  treasury1?: string;
  bal0?: string;
  bal1?: string;
  tickLower?: number;
  tickUpper?: number;
};

type Feed = { chainId: number; vault: string; computedAt: number; entries: HistoryEntry[] };

export function useAutoHistory(cfg: RangeVaultCfg): HistoryEntry[] | undefined {
  const { data } = useQuery<Feed | null>({
    queryKey: ["auto-history", cfg.chainId],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/auto-history-${cfg.chainId}.json`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const j = (await res.json()) as Feed;
        return j && Array.isArray(j.entries) ? j : null;
      } catch {
        return null;
      }
    },
    staleTime: 300_000,
    refetchInterval: 600_000,
    retry: 1,
  });
  if (!data || data.vault !== cfg.vault?.toLowerCase()) return undefined;
  return data.entries;
}
