import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";

/**
 * Leverage-line lifetime basis (SPEC §4 v1.10 gap ②), published by
 * `points_v2.py basis` to `${BASE_URL}data/farm-basis-4663.json`. Entry prices come from
 * Chainlink ETH/USD round history (RH has no free archive node) — round-granularity
 * precision, disclosed in the feed meta. Feed missing → undefined (totals stay Auto-only).
 */
export type FarmBasis = { lifetimeInUsd: number; lifetimeOutUsd: number };

type Feed = { meta: { vault: string; chain_id: number }; byOwner: Record<string, FarmBasis> };

export function useFarmBasis(user: Address | undefined): FarmBasis | undefined {
  const { data } = useQuery<Feed | null>({
    queryKey: ["farm-basis", 4663],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/farm-basis-4663.json`, { cache: "no-store" });
        if (!res.ok) return null;
        const j = (await res.json()) as Feed;
        return j && typeof j.byOwner === "object" ? j : null;
      } catch {
        return null;
      }
    },
    staleTime: 300_000,
    refetchInterval: 600_000,
    retry: 1,
  });
  if (!user || !data) return undefined;
  return data.byOwner[user.toLowerCase()];
}
