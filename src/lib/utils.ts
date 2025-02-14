import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Address, formatUnits } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBalance(balance: bigint, decimals: number) {
  const balanceNumber = Number(formatUnits(balance, decimals));

  const suffixes = ["", "k", "M", "B", "T", "P", "E"]; // Supports up to Exa (1e18)
  const magnitude = balanceNumber === 0 ? 0 : Math.floor(Math.log10(Math.abs(balanceNumber)) / 3);

  if (magnitude >= suffixes.length || magnitude < -3) return balanceNumber.toExponential(4); // Use scientific notation for very large numbers
  if (magnitude < 0) return balanceNumber.toPrecision(3);

  const scaled = balanceNumber / Math.pow(10, magnitude * 3);
  return scaled.toPrecision(4) + suffixes[magnitude];
}

export type Token = { address: Address; symbol?: string; decimals?: number; imageSrc: string };
