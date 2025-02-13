import { formatUnits } from "viem";

export function formatBalance(balance: bigint, decimals: number) {
  const balanceNumber = Number(formatUnits(balance, decimals));

  const suffixes = ["", "k", "M", "B", "T", "P", "E"]; // Supports up to Exa (1e18)
  const magnitude = balanceNumber === 0 ? 0 : Math.floor(Math.log10(Math.abs(balanceNumber)) / 3);

  if (magnitude >= suffixes.length) return balanceNumber.toExponential(4); // Use scientific notation for very large numbers

  const scaled = balanceNumber / Math.pow(10, magnitude * 3);
  return scaled.toPrecision(4) + suffixes[magnitude];
}
