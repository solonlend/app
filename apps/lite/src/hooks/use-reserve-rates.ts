import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import { RH_MAINNET as P } from "@/lib/solon-farms";

/**
 * 双借金库的两条腿各挂各的储备,各按自己的 borrow APR 计息。
 * 任何"借款成本"的展示都必须读这两个实时利率再按借款构成加权 —— 单一常数利率会算错一个数量级。
 * reserveId 1 = USDG(LOAN 腿),2 = WETH(RISK 腿)。
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
  /** USDG 储备(LOAN 腿)年化借款利率,小数;未加载为 undefined */
  loanBorrowApr: number | undefined;
  /** WETH 储备(RISK 腿)年化借款利率,小数 */
  riskBorrowApr: number | undefined;
  loanUtil: number | undefined;
  riskUtil: number | undefined;
  loaded: boolean;
};

export function useReserveRates(): ReserveRates {
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
