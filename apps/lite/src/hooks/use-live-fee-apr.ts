import { useQuery } from "@tanstack/react-query";

/**
 * Live farm fee-APR, published by the off-chain indexer (points/farm_fee_apr.py) to
 * `${BASE_URL}data/farm-fee-apr.json` — same origin, no CORS. RH mines ~10 blocks/s (~855k
 * blocks/day), so a client can't aggregate 24h of Swap events; the indexer samples the pool's
 * feeGrowthGlobal over a trailing 24h window instead. Until it has warmed up (a full 24h window),
 * `warmedUp` is false and callers should fall back to the dated manual snapshot.
 */
export type LiveFeeApr = {
  feeApr: number;
  warmedUp: boolean;
  windowSeconds: number;
  computedAt: number;
  poolTvlUsd: number;
};

export function useLiveFeeApr() {
  return useQuery<LiveFeeApr | null>({
    queryKey: ["farm-live-fee-apr"],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/farm-fee-apr.json`, { cache: "no-store" });
        if (!res.ok) return null;
        const j = (await res.json()) as LiveFeeApr;
        return typeof j?.feeApr === "number" && isFinite(j.feeApr) ? j : null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
  });
}

/** Effective fee APR: the live value once the indexer has a >=2h window, else the dated snapshot. */
export function effectiveFeeApr(
  live: LiveFeeApr | null | undefined,
  snapshot: number,
): { value: number; live: boolean } {
  if (live && (live.warmedUp || live.windowSeconds >= 7200)) return { value: live.feeApr, live: true };
  return { value: snapshot, live: false };
}
