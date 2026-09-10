import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { type RangeVaultCfg } from "@/lib/solon-range";

/*
  Net contribution for a user's Auto LP position, reconstructed from the vault's own
  Deposit/Withdraw events (scanned from cfg.deployBlock). Combined with the position's
  current claim this yields an exact vs-holding PnL at today's price — no historical
  price feed needed:

    pnl(token1) = (claim0_now − net0) × price_now + (claim1_now − net1)

  which is fees compounded in, minus divergence drift, both marked at the current price.
*/

const DEPOSIT_EVT = parseAbiItem(
  "event Deposit(address indexed user, uint256 shares, uint256 amount0, uint256 amount1, uint256 fee0, uint256 fee1)",
);
const WITHDRAW_EVT = parseAbiItem(
  "event Withdraw(address indexed user, uint256 shares, uint256 amount0, uint256 amount1)",
);

export type NetContribution = { net0: bigint; net1: bigint; deposits: number; withdrawals: number };

export function useAutoNetContribution(cfg: RangeVaultCfg, user: Address | undefined) {
  const client = usePublicClient({ chainId: cfg.chainId });
  return useQuery<NetContribution | null>({
    queryKey: ["auto-net-contribution", cfg.chainId, cfg.vault, user],
    enabled: !!client && !!user && !!cfg.vault && cfg.deployBlock !== undefined,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
    queryFn: async () => {
      if (!client || !user || !cfg.vault || cfg.deployBlock === undefined) return null;
      const fromBlock = BigInt(cfg.deployBlock);
      const [deps, wds] = await Promise.all([
        client.getLogs({ address: cfg.vault, event: DEPOSIT_EVT, args: { user }, fromBlock, toBlock: "latest" }),
        client.getLogs({ address: cfg.vault, event: WITHDRAW_EVT, args: { user }, fromBlock, toBlock: "latest" }),
      ]);
      let net0 = 0n;
      let net1 = 0n;
      for (const d of deps) {
        net0 += d.args.amount0 ?? 0n;
        net1 += d.args.amount1 ?? 0n;
      }
      for (const w of wds) {
        net0 -= w.args.amount0 ?? 0n;
        net1 -= w.args.amount1 ?? 0n;
      }
      return { net0, net1, deposits: deps.length, withdrawals: wds.length };
    },
  });
}
