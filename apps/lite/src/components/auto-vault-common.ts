import { formatUnits } from "viem";

// Shared Auto LP styling + formatting — one source so list rows and the detail page render alike.
export const BADGE = "rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-wide";
export const PANEL = "bg-primary rounded-2xl p-4";
export const LABEL = "text-secondary-foreground font-mono text-[10px] uppercase tracking-wider";
export const INPUT =
  "bg-background text-primary-foreground w-full rounded-xl p-3 text-sm tabular-nums outline-none ring-1 ring-white/[0.06] focus:ring-white/20";

export function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}

/**
 * Quote-value display (SPEC §5 金额显示): USDG/USD quotes get a $ prefix and compact notation
 * from $1M up (3 significant digits); a future non-stable quote keeps "{number} {symbol}".
 */
export function fmtQuote(v: number, symbol: string): string {
  const usd = symbol === "USDG" || symbol === "USD";
  const abs = Math.abs(v);
  const body =
    abs >= 1_000_000
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 }).format(abs)
      : fmt(abs);
  const sign = v < 0 ? "-" : "";
  return usd ? `${sign}$${body}` : `${sign}${body} ${symbol}`;
}

export function fmtAmt(raw: bigint, decimals: number): string {
  const n = Number(formatUnits(raw, decimals));
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return fmt(n, n < 1 ? 4 : 2);
}
