import { BADGE, LABEL, PANEL, fmtQuote } from "@/components/auto-vault-common";
import { type FarmPos } from "@/hooks/use-farm-positions";
import { mergeRiskRows, rankRiskRows, riskTier, type GenericRiskRow, type RiskTier } from "@/lib/farm-risk";

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

export function FarmRiskPanel({
  positions,
  lltv,
  borrowRows = [],
}: {
  positions: FarmPos[];
  lltv: bigint | undefined;
  borrowRows?: GenericRiskRow[];
}) {
  const lev: GenericRiskRow[] = rankRiskRows(positions, lltv).map((r) => {
    const pos = positions.find((p) => p.id === r.id)!;
    return { key: `lev-${r.id}`, label: `#${r.id}`, kind: "LEV", usage: r.usage, value: pos.value, debt: pos.debt };
  });
  const rows = mergeRiskRows([...lev, ...borrowRows]);
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
          return (
            <div
              key={r.key}
              className="grid grid-cols-2 items-center gap-x-6 gap-y-1 rounded-xl bg-white/[0.04] p-3 md:grid-cols-[110px_minmax(0,1fr)_90px_1fr]"
            >
              <span className="flex items-center gap-2">
                <span className="text-primary-foreground text-sm font-medium tabular-nums">{r.label}</span>
                <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>
                  {r.kind === "LEV" ? "LEV" : "BORROW"}
                </span>
              </span>
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
                {fmtQuote(r.value, "USD")} value · {fmtQuote(r.debt, "USD")} debt
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
