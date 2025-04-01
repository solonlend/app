import { adaptiveCurveIrmAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/adaptive-curve-irm";
import { morphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/morpho";
import { restructure } from "@morpho-blue-offchain-public/uikit/lib/restructure";
import { Market, MarketParams } from "@morpho-org/blue-sdk";
import { useMemo } from "react";
import { Hex } from "viem";
import { useReadContracts } from "wagmi";

import { getContractDeploymentInfo } from "@/lib/constants";

export function useMarkets({
  chainId,
  marketIds,
  staleTime = 5 * 60 * 1000,
}: {
  chainId: number | undefined;
  marketIds: Hex[];
  staleTime?: number;
}) {
  const morpho = useMemo(() => getContractDeploymentInfo(chainId, "Morpho"), [chainId]);

  const { data: marketParamsData } = useReadContracts({
    contracts: marketIds.map(
      (marketId) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [marketId],
        }) as const,
    ),
    allowFailure: false,
    query: {
      enabled: chainId !== undefined && !!morpho,
      staleTime: Infinity,
      gcTime: Infinity,
      select(data) {
        return data.map((x) => restructure(x, { abi: morphoAbi, name: "idToMarketParams", args: ["0x"] }));
      },
    },
  });

  const { data: marketsData } = useReadContracts({
    contracts: marketIds.map(
      (marketId) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "market",
          args: [marketId],
        }) as const,
    ),
    allowFailure: false,
    query: {
      enabled: chainId !== undefined && !!morpho,
      staleTime,
      gcTime: Infinity,
      select(data) {
        return data.map((x) => restructure(x, { abi: morphoAbi, name: "market", args: ["0x"] }));
      },
    },
  });

  const { data: rateAtTargets } = useReadContracts({
    contracts: marketIds.map(
      (marketId, idx) =>
        ({
          chainId,
          address: marketParamsData?.at(idx)?.irm ?? "0x",
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId],
        }) as const,
    ),
    allowFailure: true,
    query: {
      enabled: chainId !== undefined && marketParamsData !== undefined,
      staleTime,
      gcTime: Infinity,
    },
  });

  const markets = useMemo(() => {
    const markets: Record<Hex, Market> = {};
    for (let i = 0; i < marketIds.length; i += 1) {
      const marketParams = marketParamsData?.at(i);
      const market = marketsData?.at(i);
      const rateAtTarget = rateAtTargets?.at(i);
      if (marketParams === undefined || market === undefined) continue;

      markets[marketIds[i]] = new Market({
        ...market,
        params: new MarketParams(marketParams),
        // NOTE: undefined here implies it's still fetching, NOT that it's a different IRM
        rateAtTarget: rateAtTarget?.result,
      });
    }
    return markets;
  }, [marketIds, marketParamsData, marketsData, rateAtTargets]);

  return markets;
}
