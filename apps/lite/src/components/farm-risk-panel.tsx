import { LABEL, PANEL, fmtQuote } from "@/components/auto-vault-common";
import { type FarmPos } from "@/hooks/use-farm-positions";
import { rankRiskRows, riskTier, type RiskTier } from "@/lib/farm-risk";

/*
  Portfolio Risk section (SPEC §4 Risk 区): every position with a liquidation line, most
  dangerous first. usage = debt / (value × LLTV); 1.0 = liquidation. Presentational — data
  comes from useFarmPositions so it can never disagree with the leveraged table below.
*/

const TIER_BAR: Record<RiskTier, string> = {
  danger: "bg-red-400",
  warn: "bg-yellow-300",
  ok: "bg-emerald-300",
  unknown: "bg-white/20",
};
const TIER_TEXT: Record<RiskTier, string> = {
  danger: "text-red-400",
  warn: "text-yellow-300",
  ok: "text-emerald-300",
  unknown: "text-secondary-foreground",
};

export function FarmRiskPanel({ positions, lltv }: { positions: FarmPos[]; lltv: bigint | undefined }) {
  const rows = rankRiskRows(positions, lltv);
  if (rows.length === 0) return null;
  return (
    <div className={PANEL}>
      <div className="flex items-baseline justify-between">
        <span className={LABEL}>Risk · liquidation exposure</span>
        <span className="text-secondary-foreground text-[10px] font-light">1.00 = liquidation line</span>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((r) => {
          const tier = riskTier(r.usage);
          const pos = positions.find((p) => p.id === r.id)!;
          return (
            <div
              key={r.id.toString()}
              className="grid grid-cols-2 items-center gap-x-6 gap-y-1 rounded-xl bg-white/[0.04] p-3 md:grid-cols-[64px_minmax(0,1fr)_90px_1fr]"
            >
              <span className="text-primary-foreground text-sm font-medium tabular-nums">#{r.id.toString()}</span>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${TIER_BAR[tier]}`}
                  style={{ width: `${Math.min(100, Math.max(2, (r.usage ?? 0) * 100))}%` }}
                />
              </div>
              <span className={`${TIER_TEXT[tier]} text-sm font-medium tabular-nums`}>
                {r.usage !== undefined ? r.usage.toFixed(2) : "－"}
              </span>
              <span className="text-secondary-foreground text-xs font-light tabular-nums">
                {fmtQuote(pos.value, "USD")} value · {fmtQuote(pos.debt, "USD")} debt
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
