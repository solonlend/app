import { useConfig, useReadContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { RH_MAINNET, SEPOLIA_PLAYGROUND } from "@/lib/solon-farms";

const pausedAbi = [
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

/**
 * LendingPool gates deposit, borrow, redeem and unstake; risk-reducing vault operations remain available.
 * `cfg` defaults to RH_MAINNET (every mainnet caller is unchanged); the Sepolia playground passes its own config.
 */
export function useFarmPaused(cfg: typeof RH_MAINNET | typeof SEPOLIA_PLAYGROUND = RH_MAINNET) {
  const pausedContract = {
    chainId: cfg.chainId,
    address: cfg.lending,
    abi: pausedAbi,
    functionName: "paused",
  } as const;
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
