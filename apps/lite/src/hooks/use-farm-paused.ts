import { useConfig, useReadContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { RH_MAINNET as P } from "@/lib/solon-farms";

const pausedContract = {
  chainId: P.chainId,
  address: P.lending,
  abi: [{ type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }],
  functionName: "paused",
} as const;

/** LendingPool gates deposit, borrow, redeem and unstake; risk-reducing vault operations remain available. */
export function useFarmPaused() {
  const config = useConfig();
  const { data, isError } = useReadContract({
    ...pausedContract,
    query: { refetchInterval: 10_000, staleTime: 0 },
  });
  const paused = isError ? undefined : data;
  const assertActive = async () => {
    let current: boolean;
    try {
      current = await readContract(config, pausedContract);
    } catch {
      throw new Error("Unable to verify LendingPool pause status. Please retry before submitting.");
    }
    if (current !== false)
      throw new Error("LendingPool is paused: deposits, opens, increases and withdrawals are unavailable.");
  };
  return { paused, blocked: paused !== false, assertActive };
}
