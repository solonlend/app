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

/** The V3 pool the indexer feed describes (RH ETH/USDG 0.01%). Other pools have no feed yet. */
export const LIVE_FEE_APR_POOL = "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca";

/**
 * @param pool When given, the feed is only returned if it describes this pool — a second vault on
 * a different pool must show "no feed" rather than borrowing the wrong APR. No-arg callers (the
 * leveraged farm, which IS the feed's pool) keep the original behavior.
 */
export function useLiveFeeApr(pool?: string) {
  const poolMatches = pool === undefined || pool.toLowerCase() === LIVE_FEE_APR_POOL.toLowerCase();
  return useQuery<LiveFeeApr | null>({
    queryKey: ["farm-live-fee-apr", poolMatches],
    queryFn: async () => {
      if (!poolMatches) return null;
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

/**
 * Effective fee APR: always the live indexer value when one is available (even before the trailing
 * window has warmed up to a full 24h — a real short-window number beats a dated snapshot). The
 * snapshot is only a fallback for when the feed itself is unreachable.
 */
export function effectiveFeeApr(
  live: LiveFeeApr | null | undefined,
  snapshot: number,
): { value: number; live: boolean } {
  if (live) return { value: live.feeApr, live: true };
  return { value: snapshot, live: false };
}
