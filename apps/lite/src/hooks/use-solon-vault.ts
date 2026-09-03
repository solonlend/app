import { type MarketId } from "@morpho-org/blue-sdk";
import { useMemo } from "react";
import { type Address, erc20Abi, erc4626Abi, zeroAddress } from "viem";
import { useReadContracts } from "wagmi";

import { useMarkets } from "@/hooks/use-markets";
import { SOLON_CREATED_MARKETS, SOLON_VAULT } from "@/lib/solon-markets";

const WAD = 10n ** 18n;

/** Live reads for the Solon Vault V2 (ERC-4626) + derived supply APY from its funded market. */
export function useSolonVault({ chainId, userAddress }: { chainId?: number; userAddress?: Address }) {
  const vault = SOLON_VAULT.address;
  const { data } = useReadContracts({
    contracts: [
      { chainId, address: vault, abi: erc4626Abi, functionName: "totalAssets" },
      { chainId, address: vault, abi: erc4626Abi, functionName: "totalSupply" },
      { chainId, address: vault, abi: erc20Abi, functionName: "name" },
      { chainId, address: vault, abi: erc20Abi, functionName: "symbol" },
      { chainId, address: vault, abi: erc4626Abi, functionName: "balanceOf", args: [userAddress ?? zeroAddress] },
    ] as const,
    allowFailure: true,
    query: { enabled: chainId !== undefined, staleTime: 60_000 },
  });

  const markets = useMarkets({
    chainId,
    marketIds: SOLON_CREATED_MARKETS as unknown as MarketId[],
    staleTime: 60_000,
  });

  return useMemo(() => {
    const totalAssets = (data?.[0]?.result as bigint | undefined) ?? 0n;
    const totalSupply = (data?.[1]?.result as bigint | undefined) ?? 0n;
    const name = (data?.[2]?.result as string | undefined) ?? "Solon USDG Vault";
    const userShares = (data?.[4]?.result as bigint | undefined) ?? 0n;

    // Supply APY ~= funded market borrowApy x utilization x (1 - fee), 18-dec bigint.
    const market = Object.values(markets)[0];
    let apy = 0n;
    if (market && market.totalSupplyAssets > 0n) {
      const util = (market.totalBorrowAssets * WAD) / market.totalSupplyAssets;
      const gross = (market.borrowApy * util) / WAD;
      apy = (gross * (WAD - SOLON_VAULT.performanceFeeWad)) / WAD;
    }

    const toAssets = (shares: bigint) => (totalSupply > 0n ? (shares * totalAssets) / totalSupply : shares);

    return { vault, totalAssets, totalSupply, name, userShares, apy, toAssets, market };
  }, [data, markets, vault]);
}
