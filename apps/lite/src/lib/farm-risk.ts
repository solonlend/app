/*
  Liquidation-risk ranking for the Portfolio Risk section (SPEC §4 Risk 区).
  usage = debt / (value × LLTV); 1.0 = the liquidation line. Most dangerous first.
*/

export type RiskInput = { id: bigint; value: number; debt: number };
export type RiskRow = RiskInput & { usage: number | undefined };
export type RiskTier = "danger" | "warn" | "ok" | "unknown";

const LLTV_SCALE = 1e18;

export function rankRiskRows(positions: RiskInput[], lltv: bigint | undefined): RiskRow[] {
  const rows: RiskRow[] = positions.map((p) => ({
    ...p,
    usage:
      lltv === undefined || lltv <= 0n ? undefined : p.value > 0 ? p.debt / (p.value * (Number(lltv) / LLTV_SCALE)) : 0,
  }));
  return rows.sort((a, b) => (b.usage ?? -1) - (a.usage ?? -1));
}

export function riskTier(usage: number | undefined): RiskTier {
  if (usage === undefined) return "unknown";
  if (usage >= 0.9) return "danger";
  if (usage >= 0.75) return "warn";
  return "ok";
}
