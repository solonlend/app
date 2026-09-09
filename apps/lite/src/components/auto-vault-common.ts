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

export function fmtAmt(raw: bigint, decimals: number): string {
  const n = Number(formatUnits(raw, decimals));
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return fmt(n, n < 1 ? 4 : 2);
}
