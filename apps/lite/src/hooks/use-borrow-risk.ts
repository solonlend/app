import { morphoAbi } from "@morpho-org/uikit/assets/abis/morpho";
import { getContractDeploymentInfo } from "@morpho-org/uikit/lib/deployments";
import { useMemo } from "react";
import { erc20Abi, formatUnits, type Address, type Hex } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";

import { type GenericRiskRow } from "@/lib/farm-risk";
import { SOLON_MARKET_IDS } from "@/lib/solon-markets";

/*
  Borrow-side liquidation risk for the Portfolio Risk section (SPEC §4 v1.10).
  For every curated market where the connected account has a position:
    debt      = borrowShares × totalBorrowAssets / totalBorrowShares   (USDG ≈ USD)
    collValue = collateral × oracle.price() / 1e36                     (loan units)
    usage     = debt / (collValue × lltv / 1e18)                       (1.0 = liquidation)
  An unreadable oracle leaves usage undefined (shown as "－", never guessed).
*/

const LLTV_SCALE = 1e18;

export function useBorrowRisk(): GenericRiskRow[] {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const morpho = getContractDeploymentInfo(chainId, "Morpho")?.address as Address | undefined;
  const ids = SOLON_MARKET_IDS;
  const enabled = !!user && !!morpho;

  const { data: base } = useReadContracts({
    contracts: enabled
      ? ids.flatMap((id) => [
          { chainId, address: morpho, abi: morphoAbi, functionName: "position", args: [id, user] } as const,
          { chainId, address: morpho, abi: morphoAbi, functionName: "market", args: [id] } as const,
          { chainId, address: morpho, abi: morphoAbi, functionName: "idToMarketParams", args: [id] } as const,
        ])
      : [],
    query: { enabled, refetchInterval: 60_000 },
  });

  // viem shape-normalizers: multi-output fns decode as arrays, named-struct outputs as objects.
  const asParams = (r: unknown) => {
    if (!r) return undefined;
    if (Array.isArray(r))
      return { loanToken: r[0], collateralToken: r[1], oracle: r[2], irm: r[3], lltv: r[4] } as {
        loanToken: Address;
        collateralToken: Address;
        oracle: Address;
        irm: Address;
        lltv: bigint;
      };
    return r as { loanToken: Address; collateralToken: Address; oracle: Address; irm: Address; lltv: bigint };
  };
  const asMarket = (r: unknown) => {
    if (!r) return undefined;
    if (Array.isArray(r)) return { totalBorrowAssets: r[2] as bigint, totalBorrowShares: r[3] as bigint };
    const o = r as { totalBorrowAssets: bigint; totalBorrowShares: bigint };
    return { totalBorrowAssets: o.totalBorrowAssets, totalBorrowShares: o.totalBorrowShares };
  };

  // Oracle prices + collateral symbols for markets the user actually touches.
  const active = useMemo(() => {
    if (!base) return [];
    const out: { id: Hex; idx: number; oracle: Address; collateral: Address }[] = [];
    ids.forEach((id, i) => {
      const pos = base[i * 3]?.result as readonly [bigint, bigint, bigint] | undefined;
      const params = asParams(base[i * 3 + 2]?.result);
      if (pos && params && (pos[1] > 0n || pos[2] > 0n)) {
        out.push({ id, idx: i, oracle: params.oracle, collateral: params.collateralToken });
      }
    });
    return out;
  }, [base, ids]);

  const { data: extra } = useReadContracts({
    contracts: active.flatMap((a) => [
      {
        chainId,
        address: a.oracle,
        abi: [
          { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        ] as const,
        functionName: "price",
      } as const,
      { chainId, address: a.collateral, abi: erc20Abi, functionName: "symbol" } as const,
    ]),
    query: { enabled: active.length > 0, refetchInterval: 60_000 },
  });

  return useMemo(() => {
    if (!base || active.length === 0) return [];
    return active.map((a, j) => {
      const pos = base[a.idx * 3]!.result as readonly [bigint, bigint, bigint];
      const mkt = asMarket(base[a.idx * 3 + 1]?.result);
      const params = asParams(base[a.idx * 3 + 2]!.result)!;
      const price = extra?.[j * 2]?.result as bigint | undefined;
      const symbol = (extra?.[j * 2 + 1]?.result as string | undefined) ?? "?";

      const borrowShares = pos[1];
      const collateral = pos[2];
      const debt =
        mkt && mkt.totalBorrowShares > 0n
          ? Number(formatUnits((borrowShares * mkt.totalBorrowAssets) / mkt.totalBorrowShares, 6))
          : borrowShares === 0n
            ? 0
            : NaN;
      const lltv = Number(params.lltv) / LLTV_SCALE;
      let usage: number | undefined;
      let collValue = NaN;
      if (price !== undefined) {
        // Morpho convention: quote = collateralRaw × price / 1e36, denominated in loan raw
        // units (USDG 6dp ≈ USD). The 1e36 scale already absorbs both tokens' decimals.
        collValue = Number(formatUnits((collateral * price) / 10n ** 36n, 6));
        usage = collValue > 0 && Number.isFinite(debt) && lltv > 0 ? debt / (collValue * lltv) : debt > 0 ? 1 : 0;
      }
      return {
        key: `borrow-${a.id}`,
        label: symbol,
        kind: "BORROW" as const,
        usage,
        value: Number.isFinite(collValue) ? collValue : 0,
        debt: Number.isFinite(debt) ? debt : 0,
      };
    });
  }, [base, extra, active]);
}
