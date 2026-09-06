/** Only directional Farm metrics (Net APY / PnL) use signed colors. */
export function farmSignedColor(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "text-farm-safe" : "text-farm-danger";
}
