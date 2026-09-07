import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import { RH_MAINNET, SEPOLIA_PLAYGROUND } from "@/lib/solon-farms";

/**
 * Each leg of the dual-borrow vault uses its own reserve and accrues interest at that reserve's borrow APR.
 * Every borrowing-cost display must read both live rates and weight them by the borrowing mix; a fixed rate can be off by an order of magnitude.
 * reserveId 1 = USDG (LOAN leg), 2 = WETH (RISK leg).
 */
const rateAbi = [
  {
    type: "function",
    name: "borrowingRateOfReserve",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "utilizationRateOfReserve",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type ReserveRates = {
  /** USDG reserve (LOAN leg) annual borrow rate as a fraction; undefined until loaded */
  loanBorrowApr: number | undefined;
  /** WETH reserve (RISK leg) annual borrow rate as a fraction */
  riskBorrowApr: number | undefined;
  loanUtil: number | undefined;
  riskUtil: number | undefined;
  loaded: boolean;
};

export function useReserveRates(cfg: typeof RH_MAINNET | typeof SEPOLIA_PLAYGROUND = RH_MAINNET): ReserveRates {
  const P = cfg; // default mainnet; the Sepolia playground passes its own config
  const { data } = useReadContracts({
    contracts: [
      { chainId: P.chainId, address: P.lending, abi: rateAbi, functionName: "borrowingRateOfReserve", args: [1n] },
      { chainId: P.chainId, address: P.lending, abi: rateAbi, functionName: "borrowingRateOfReserve", args: [2n] },
      { chainId: P.chainId, address: P.lending, abi: rateAbi, functionName: "utilizationRateOfReserve", args: [1n] },
      { chainId: P.chainId, address: P.lending, abi: rateAbi, functionName: "utilizationRateOfReserve", args: [2n] },
    ],
    allowFailure: true,
    query: { staleTime: 30_000 },
  });
  const num = (i: number) => {
    const v = data?.[i]?.result as bigint | undefined;
    return v === undefined ? undefined : Number(formatUnits(v, 18));
  };
  const loanBorrowApr = num(0);
  const riskBorrowApr = num(1);
  return {
    loanBorrowApr,
    riskBorrowApr,
    loanUtil: num(2),
    riskUtil: num(3),
    loaded: loanBorrowApr !== undefined && riskBorrowApr !== undefined,
  };
}
