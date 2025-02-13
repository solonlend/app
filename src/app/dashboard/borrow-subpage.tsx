import { morphoAbi } from "@/assets/abis/morpho";
import { getContractDeploymentInfo } from "@/components/constants";
import useContractEvents from "@/hooks/use-contract-events";
import { useMemo } from "react";
import { useAccount, useBlockNumber, useReadContracts } from "wagmi";
import { Address, erc20Abi } from "viem";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { blo } from "blo";
import { formatBalance } from "@/components/utils";

function TokenTableCell({ address, symbol }: { address: Address; symbol?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-4 w-4 rounded-sm">
        <AvatarImage src={blo(address)} alt="Avatar" />
      </Avatar>
      {symbol ?? ""}
      <span className="text-primary/30 font-mono">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
    </div>
  );
}

export function BorrowSubPage() {
  const { chainId, address: userAddress } = useAccount();
  const { data: blockNumber } = useBlockNumber({
    watch: false,
    query: { staleTime: Infinity, gcTime: Infinity, refetchOnMount: "always" },
  });

  const morpho = useMemo(() => getContractDeploymentInfo(chainId, "Morpho"), [chainId]);

  const { data: createMarketEvents, isFetching: isFetchingCreateMarketEvents } = useContractEvents({
    abi: morphoAbi,
    address: morpho.address,
    fromBlock: morpho.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    eventName: "CreateMarket",
    strict: true,
    query: { enabled: chainId !== undefined && blockNumber !== undefined },
  });

  const { data: supplyCollateralEvents, isFetching: isFetchingSupplyCollateralEvents } = useContractEvents({
    abi: morphoAbi,
    address: morpho.address,
    fromBlock: morpho.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    eventName: "SupplyCollateral",
    args: {
      onBehalf: userAddress,
    },
    strict: true,
    query: {
      enabled:
        chainId !== undefined &&
        blockNumber !== undefined &&
        userAddress !== undefined &&
        !isFetchingCreateMarketEvents, // We could fetch despite this, but we may get rate-limited.
    },
  });

  const { marketIds, marketParams } = useMemo(() => {
    const filtered = createMarketEvents.filter((createMarketEvent) =>
      supplyCollateralEvents.some((ev) => ev.args.id === createMarketEvent.args.id),
    );

    return {
      marketIds: filtered.map((ev) => ev.args.id),
      marketParams: filtered.map((ev) => ev.args.marketParams),
    };
  }, [createMarketEvents, supplyCollateralEvents]);

  const { data: erc20Symbols, isFetching: isFetchingErc20Symbols } = useReadContracts({
    contracts: marketParams
      .map((x) => [
        { address: x.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
        { address: x.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: erc20Decimals, isFetching: isFetchingErc20Decimals } = useReadContracts({
    contracts: marketParams
      .map((x) => [
        { address: x.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
        { address: x.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: markets, isFetching: isFetchingMarkets } = useReadContracts({
    contracts: marketIds.map(
      (marketId) =>
        ({
          address: morpho.address,
          abi: morphoAbi,
          functionName: "market",
          args: [marketId],
        }) as const,
    ),
    allowFailure: false,
  });

  console.log(isFetchingSupplyCollateralEvents, isFetchingErc20Symbols, isFetchingErc20Decimals, isFetchingMarkets);

  return (
    <div className="flex min-h-screen flex-col px-2.5">
      <div className="h-[380px] px-8 py-18 md:p-32 dark:bg-neutral-900"></div>
      <div className="dark:bg-background/70 grow rounded-t-xl">
        <div className="text-primary w-full max-w-7xl px-8 pt-8 pb-32 md:px-32">
          <Table className="border-separate border-spacing-y-3">
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
                <TableHead className="text-primary text-xs font-light">Loan</TableHead>
                <TableHead className="text-primary text-xs font-light">LLTV</TableHead>
                <TableHead className="text-primary rounded-r-lg text-xs font-light">Liquidity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketIds.map((marketId, idx) => (
                <TableRow key={marketId} className="bg-secondary">
                  <TableCell className="rounded-l-lg p-5">
                    <TokenTableCell
                      address={marketParams[idx].collateralToken}
                      symbol={erc20Symbols?.[Math.floor(idx / 2)].result}
                    />
                  </TableCell>
                  <TableCell>
                    <TokenTableCell
                      address={marketParams[idx].loanToken}
                      symbol={erc20Symbols?.[Math.floor(idx / 2) + 1].result}
                    />
                  </TableCell>
                  <TableCell>{(Number(marketParams[idx].lltv / 1_000_000_000n) / 1e7).toFixed(2)}%</TableCell>
                  <TableCell className="rounded-r-lg">
                    {markets && erc20Decimals?.[Math.floor(idx / 2)].result
                      ? formatBalance(markets[idx][0] - markets[idx][2], erc20Decimals[Math.floor(idx / 2)].result ?? 1)
                      : "－"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
