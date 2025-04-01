import { metaMorphoFactoryAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho-factory";
import { morphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/morpho";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-blue-offchain-public/uikit/components/shadcn/avatar";
import { Sheet, SheetTrigger } from "@morpho-blue-offchain-public/uikit/components/shadcn/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/tooltip";
import useContractEvents from "@morpho-blue-offchain-public/uikit/hooks/use-contract-events/use-contract-events";
import { readAccrualVaults, readAccrualVaultsStateOverride } from "@morpho-blue-offchain-public/uikit/lens/read-vaults";
import {
  formatBalanceWithSymbol,
  formatApy,
  formatLtv,
  getTokenSymbolURI,
  Token,
} from "@morpho-blue-offchain-public/uikit/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { blo } from "blo";
import { Eye, Info } from "lucide-react";
import { useMemo } from "react";
import { useOutletContext } from "react-router";
import { Address, erc20Abi, Chain } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { BorrowSheetContent } from "@/components/borrow-sheet-content";
import { CtaCard } from "@/components/cta-card";
import { useMarkets } from "@/hooks/use-markets";
import { useTopNCurators } from "@/hooks/use-top-n-curators";
import { CORE_DEPLOYMENTS, getContractDeploymentInfo } from "@/lib/constants";

function TokenTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-4 w-4 rounded-sm">
        <AvatarImage src={imageSrc} alt="Avatar" />
        <AvatarFallback delayMs={500}>
          <img src={blo(address)} />
        </AvatarFallback>
      </Avatar>
      {symbol ?? "－"}
      <span className="text-primary/30 font-mono">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
    </div>
  );
}

const STALE_TIME = 5 * 60 * 1000;

export function BorrowSubPage() {
  const { status, address: userAddress } = useAccount();
  const { chain } = useOutletContext() as { chain?: Chain };
  const chainId = chain?.id;

  const [morpho, factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "Morpho"),
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  // MARK: Index `MetaMorphoFactory.CreateMetaMorpho` on all factory versions to get a list of all vault addresses
  const {
    logs: { all: createMetaMorphoEvents },
    isFetching: isFetchingCreateMetaMorphoEvents,
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factoryV1_1 ? [factoryV1_1.address].concat(factory ? [factory.address] : []) : [],
    fromBlock: factory?.fromBlock ?? factoryV1_1?.fromBlock,
    reverseChronologicalOrder: true,
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined },
  });

  // MARK: Fetch additional data for vaults owned by the top 5 curators from core deployments
  const top5Curators = useTopNCurators({ n: 5, verifiedOnly: true, chainIds: [...CORE_DEPLOYMENTS] });
  const { data: vaultsData } = useReadContract({
    chainId,
    ...readAccrualVaults(
      morpho?.address ?? "0x",
      createMetaMorphoEvents.map((ev) => ev.args.metaMorpho),
      // NOTE: This assumes that if a curator controls an address on one chain, they control it across all chains.
      top5Curators.flatMap((curator) => curator.addresses?.map((entry) => entry.address as Address) ?? []),
    ),
    stateOverride: [readAccrualVaultsStateOverride()],
    query: { enabled: chainId !== undefined && !isFetchingCreateMetaMorphoEvents && !!morpho?.address },
  });

  const marketIds = useMemo(() => [...new Set(vaultsData?.flatMap((d) => d.vault.withdrawQueue) ?? [])], [vaultsData]);
  const markets = useMarkets({ chainId, marketIds, staleTime: STALE_TIME });
  const marketsArr = useMemo(() => {
    const marketsArr = Object.values(markets);
    marketsArr.sort((a, b) => (a.borrowApy > b.borrowApy ? -1 : 1));
    return marketsArr;
  }, [markets]);

  const { data: erc20Symbols } = useReadContracts({
    contracts: marketsArr
      .map((market) => [
        { chainId, address: market.params.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
        { chainId, address: market.params.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: erc20Decimals } = useReadContracts({
    contracts: marketsArr
      .map((market) => [
        { chainId, address: market.params.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
        { chainId, address: market.params.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: positionsRaw, refetch: refetchPositionsRaw } = useReadContracts({
    contracts: marketsArr.map(
      (market) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "position",
          args: userAddress ? [market.id, userAddress] : undefined,
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: 1 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData, enabled: !!morpho },
  });

  const tokens = useMemo(() => {
    const map = new Map<Address, Token>();
    marketsArr.forEach((market, idx) => {
      const collateralTokenSymbol = erc20Symbols?.[idx * 2].result;
      const loanTokenSymbol = erc20Symbols?.[idx * 2 + 1].result;
      map.set(market.params.collateralToken, {
        address: market.params.collateralToken,
        symbol: collateralTokenSymbol,
        decimals: erc20Decimals?.[idx * 2].result,
        imageSrc: getTokenSymbolURI(collateralTokenSymbol),
      });
      map.set(market.params.loanToken, {
        address: market.params.loanToken,
        symbol: loanTokenSymbol,
        decimals: erc20Decimals?.[idx * 2 + 1].result,
        imageSrc: getTokenSymbolURI(loanTokenSymbol),
      });
    });
    return map;
  }, [marketsArr, erc20Symbols, erc20Decimals]);

  if (status === "connecting") return undefined;

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      {status === "disconnected" ? (
        <CtaCard
          className="flex w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-8 md:m-auto md:grid md:grid-cols-[50%_50%] md:px-0 dark:bg-neutral-900"
          bigText="Provide collateral to borrow any asset"
          littleText="Connect wallet to get started"
          videoSrc={{
            mov: "https://cdn.morpho.org/v2/assets/videos/borrow-animation.mov",
            webm: "https://cdn.morpho.org/v2/assets/videos/borrow-animation.webm",
          }}
        />
      ) : (
        <div className="flex h-fit w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-8 md:m-auto md:px-0 dark:bg-neutral-900"></div>
      )}
      <div className="bg-background dark:bg-background/30 flex grow justify-center rounded-t-xl pb-32">
        <div className="text-primary w-full max-w-5xl px-8 pb-32 pt-8">
          <Table className="border-separate border-spacing-y-3">
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
                <TableHead className="text-primary text-xs font-light">Loan</TableHead>
                <TableHead className="text-primary text-xs font-light">LLTV</TableHead>
                <TableHead className="text-primary text-xs font-light">Position</TableHead>
                <TableHead className="text-primary text-xs font-light">
                  <div className="flex items-center gap-1">
                    Liquidity
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 font-mono shadow-2xl">
                          This value will be smaller than that of the full app. It doesn't include shared market
                          liquidity which could be reallocated upon borrow.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="text-primary rounded-r-lg text-xs font-light">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketsArr.map((market, idx) => (
                <Sheet
                  key={market.id}
                  onOpenChange={(isOpen) => {
                    // Refetch positions on sidesheet close, since user may have sent txns to modify one
                    if (!isOpen) void refetchPositionsRaw();
                  }}
                >
                  <SheetTrigger asChild>
                    <TableRow className="bg-secondary">
                      <TableCell className="rounded-l-lg p-5">
                        <TokenTableCell {...tokens.get(market.params.collateralToken)!} />
                      </TableCell>
                      <TableCell>
                        <TokenTableCell {...tokens.get(market.params.loanToken)!} />
                      </TableCell>
                      <TableCell>{formatLtv(market.params.lltv)}</TableCell>
                      <TableCell>
                        {
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Eye className="h-4 w-4" />
                              </TooltipTrigger>
                              <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 font-mono shadow-2xl">
                                <h3>Collateral</h3>
                                <p>
                                  {positionsRaw && tokens.get(market.params.collateralToken)?.decimals !== undefined
                                    ? formatBalanceWithSymbol(
                                        positionsRaw[idx][2],
                                        tokens.get(market.params.collateralToken)!.decimals!,
                                        tokens.get(market.params.collateralToken)!.symbol,
                                        5,
                                        true,
                                      )
                                    : "－"}
                                </p>
                                <h3 className="pt-3">Borrows</h3>
                                <p>
                                  {markets &&
                                  positionsRaw &&
                                  tokens.get(market.params.loanToken)?.decimals !== undefined
                                    ? formatBalanceWithSymbol(
                                        market.toBorrowAssets(positionsRaw[idx][1]),
                                        tokens.get(market.params.loanToken)!.decimals!,
                                        tokens.get(market.params.loanToken)!.symbol,
                                        5,
                                        true,
                                      )
                                    : "－"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        }
                      </TableCell>
                      <TableCell>
                        {markets && tokens.get(market.params.loanToken)?.decimals !== undefined
                          ? formatBalanceWithSymbol(
                              market.liquidity,
                              tokens.get(market.params.loanToken)!.decimals!,
                              tokens.get(market.params.loanToken)!.symbol,
                              5,
                              true,
                            )
                          : "－"}
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        {market.borrowApy ? `${formatApy(market.borrowApy)}` : "－"}
                      </TableCell>
                    </TableRow>
                  </SheetTrigger>
                  <BorrowSheetContent
                    marketId={market.id}
                    marketParams={market.params}
                    imarket={market}
                    tokens={tokens}
                  />
                </Sheet>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
