import { AvatarImage, AvatarFallback, Avatar } from "@morpho-org/uikit/components/shadcn/avatar";
import { Sheet, SheetTrigger } from "@morpho-org/uikit/components/shadcn/sheet";
import {
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Table,
} from "@morpho-org/uikit/components/shadcn/table";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { abbreviateAddress } from "@morpho-org/uikit/lib/utils";
import { ExternalLink } from "lucide-react";
import { Chain, erc20Abi, formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import { FarmSheetContent } from "@/components/farm-sheet-content";
import { PtsBadge } from "@/components/pts-badge";
import { useReserveRates } from "@/hooks/use-reserve-rates";
import { farmSignedColor } from "@/lib/farm-semantic-colors";
import { monogramURI } from "@/lib/monogram";
import {
  SOLON_FARMS,
  CANDIDATE_POOLS,
  WETH_RH,
  USDG_RH,
  ETH_USD_FEED_RH,
  estimateNetApy,
  type FarmPool,
} from "@/lib/solon-farms";
import { getTokenURI } from "@/lib/tokens";

const chainlinkAggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

function formatPct(frac: number): string {
  return `${(frac * 100).toFixed(2)}%`;
}

function formatUsdCompact(v: number): string {
  if (!Number.isFinite(v)) return "－";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function PairCell({ farm, chain }: { farm: FarmPool; chain: Chain | undefined }) {
  const chainId = chain?.id;
  const explorer = chain?.blockExplorers?.default.url;
  const ethLogo = `${import.meta.env.BASE_URL}eth-logo.svg`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-min items-center gap-2 p-2">
            <div className="flex -space-x-2">
              <Avatar className="z-10 h-6 w-6">
                <AvatarImage src={ethLogo} alt="ETH" />
                <AvatarFallback delayMs={500}>
                  <img src={monogramURI("ETH")} />
                </AvatarFallback>
              </Avatar>
              <Avatar className="h-6 w-6">
                <AvatarImage src={getTokenURI({ symbol: "USDG", address: USDG_RH, chainId })} alt="USDG" />
                <AvatarFallback delayMs={500}>
                  <img src={monogramURI("USDG")} />
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="whitespace-nowrap">{farm.pair}</span>
            <span className="text-secondary-foreground whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
              {farm.dex.replace("Uniswap ", "")} · {farm.feeLabel ?? `${(farm.feeTierBps / 10000).toFixed(2)}%`}
            </span>
            {farm.flagship && (
              <span className="text-morpho-brand whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                Flagship
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          className="text-primary-foreground max-w-96 rounded-3xl p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="underline">Properties</p>
          <p>DEX: {farm.dex} (official deployment)</p>
          {farm.poolAddress ? (
            <div className="flex items-center gap-1">
              <p>
                Pool: <code>{abbreviateAddress(farm.poolAddress)}</code>
              </p>
              {explorer && (
                <a href={`${explorer}/address/${farm.poolAddress}`} rel="noopener noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ) : (
            <p>
              Pool ID: <code>{farm.v4PoolId ? `${farm.v4PoolId.slice(0, 10)}…` : "－"}</code> (inside the v4 PoolManager
              singleton)
            </p>
          )}
          <br />
          <p className="underline">Tokens (canonical, verified on-chain)</p>
          <div className="flex items-center gap-1">
            <p>
              WETH: <code>{abbreviateAddress(WETH_RH)}</code>
            </p>
            {explorer && (
              <a href={`${explorer}/address/${WETH_RH}`} rel="noopener noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1">
            <p>
              USDG: <code>{abbreviateAddress(USDG_RH)}</code>
            </p>
            {explorer && (
              <a href={`${explorer}/address/${USDG_RH}`} rel="noopener noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          <p className="text-secondary-foreground pt-1 italic">
            Cross-checked against the router&apos;s WETH9() binding — impostor tokens cannot pass this.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FarmTable({ chain }: { chain: Chain | undefined }) {
  const chainId = chain?.id;

  const rates = useReserveRates();
  const riskApr = rates.riskBorrowApr;
  const loanApr = rates.loanBorrowApr;
  const ratesLive = riskApr !== undefined && loanApr !== undefined;
  const tableBorrowApr = ratesLive ? (riskApr + loanApr) / 2 : undefined;

  // Live TVL for V3 pools: token balances held by the pool × Chainlink ETH price.
  const { data: tvlData } = useReadContracts({
    contracts: [
      { chainId, address: WETH_RH, abi: erc20Abi, functionName: "balanceOf", args: [SOLON_FARMS[0].poolAddress!] },
      { chainId, address: USDG_RH, abi: erc20Abi, functionName: "balanceOf", args: [SOLON_FARMS[0].poolAddress!] },
      { chainId, address: ETH_USD_FEED_RH, abi: chainlinkAggregatorAbi, functionName: "latestRoundData" },
    ] as const,
    allowFailure: true,
    query: { enabled: chainId !== undefined, staleTime: 5 * 60 * 1000 },
  });

  const v3TvlUsd = (() => {
    const weth = tvlData?.[0]?.result as bigint | undefined;
    const usdg = tvlData?.[1]?.result as bigint | undefined;
    const round = tvlData?.[2]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
    if (weth === undefined || usdg === undefined || round === undefined) return undefined;
    const ethPx = Number(formatUnits(round[1], 8));
    return Number(formatUnits(weth, 18)) * ethPx + Number(formatUnits(usdg, 6));
  })();

  return (
    <div className="text-primary-foreground w-full max-w-7xl px-2 lg:px-8">
      <div className="flex flex-col gap-1 px-2 pb-1 pt-8 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-sm font-light tracking-wide">Farm · Leveraged LP</h2>
        <span className="text-secondary-foreground text-xs font-light">
          Borrow both legs, LP concentrated, zero-swap entry
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table className="border-separate border-spacing-y-3">
          <TableHeader className="bg-primary">
            <TableRow>
              <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">Pool</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">TVL</TableHead>
              <TableHead className="text-secondary-foreground hidden text-xs font-light md:table-cell">
                Fee APR (24h)
              </TableHead>
              <TableHead className="text-secondary-foreground hidden text-xs font-light md:table-cell">
                Max leverage
              </TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Net APY (est.)</TableHead>
              <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light">&nbsp;</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SOLON_FARMS.map((farm) => {
              // 表格里没有保证金构成,按"两腿各借一半"的均衡口径取两个储备利率的均值;
              // 具体到一笔仓位的真实成本由开仓面板按实际构成逐腿算。
              // 利率没读到就不显示净 APY,不再用 8% 常数凑一个像模像样的数
              const netApy =
                tableBorrowApr !== undefined
                  ? estimateNetApy(farm.feeAprSnapshot, farm.maxLeverage, tableBorrowApr)
                  : undefined;
              const tvl = farm.dex === "Uniswap V3" ? v3TvlUsd : undefined;
              return (
                <Sheet key={farm.id}>
                  <SheetTrigger asChild>
                    <TableRow className="bg-primary hover:bg-secondary">
                      <TableCell className="rounded-l-lg py-3">
                        <PairCell farm={farm} chain={chain} />
                      </TableCell>
                      <TableCell>{tvl !== undefined ? formatUsdCompact(tvl) : "－"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="underline decoration-dotted underline-offset-2">
                                {farm.feeAprSnapshot > 0 ? formatPct(farm.feeAprSnapshot) : "－"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-primary-foreground max-w-96 rounded-3xl p-4 shadow-2xl">
                              {farm.note ? (
                                <p>{farm.note}</p>
                              ) : (
                                <>
                                  <p>24h fee APR snapshot ({farm.snapshotDate}) from the DEX interface.</p>
                                  <p>Live indexer lands with the mainnet vault launch.</p>
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="underline decoration-dotted underline-offset-2">
                                {farm.maxLeverage}x
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-primary-foreground rounded-3xl p-4 shadow-2xl">
                              <p>Liquidation LTV {farm.lltvPercent}% — both legs borrowed in LP ratio,</p>
                              <p>so entry needs no swap and price drift is largely self-hedged.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`${farmSignedColor(farm.feeAprSnapshot > 0 ? netApy : undefined)} underline decoration-dotted underline-offset-2`}
                              >
                                {netApy !== undefined && farm.feeAprSnapshot > 0 ? formatPct(netApy) : "－"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-primary-foreground rounded-3xl p-4 shadow-2xl">
                              {tableBorrowApr !== undefined ? (
                                <>
                                  <p>
                                    Estimate at {farm.maxLeverage}x with margin split evenly across both legs: fee APR ×{" "}
                                    {farm.maxLeverage} − {(tableBorrowApr * 100).toFixed(2)}% × {farm.maxLeverage - 1}.
                                  </p>
                                  <p>
                                    That rate is the average of the two live reserve rates — WETH{" "}
                                    {(riskApr! * 100).toFixed(2)}%, USDG {(loanApr! * 100).toFixed(2)}%. Each leg
                                    accrues at its own, so posting a single asset as margin shifts the whole cost onto
                                    one side.
                                  </p>
                                </>
                              ) : (
                                <p>Borrow rates are unavailable, so no net APY estimate or formula is shown.</p>
                              )}
                              <p>Actual APY depends on range width, rebalances and live borrow rates.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <PtsBadge side="farm" />
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        <div className="flex flex-col items-start gap-1">
                          <button className="bg-primary-foreground text-primary px-4 py-1.5 text-xs font-medium hover:opacity-80">
                            Farm
                          </button>
                          <span className="text-secondary-foreground text-[10px]">testnet live · mainnet soon</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </SheetTrigger>
                  <FarmSheetContent farm={farm} chainId={chainId} />
                </Sheet>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-1 pt-6 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-secondary-foreground text-xs font-light tracking-wide">New assets · under evaluation</h3>
        <span className="text-secondary-foreground text-[11px] font-light">
          No price feed yet — needs TWAP oracle + conservative LLTV + its own red-team round
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table className="border-separate border-spacing-y-2 opacity-60">
          <TableBody>
            {CANDIDATE_POOLS.map((c, i) => (
              <TableRow key={i} className="bg-primary">
                <TableCell className="rounded-l-lg py-2 pl-4">
                  <span className="whitespace-nowrap">{c.pair}</span>
                  <span className="text-secondary-foreground ml-2 whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                    {c.dexLabel}
                  </span>
                </TableCell>
                <TableCell>{c.tvlSnapshot}</TableCell>
                <TableCell className="hidden md:table-cell">{c.feeAprSnapshot}</TableCell>
                <TableCell className="rounded-r-lg">
                  <span className="text-secondary-foreground whitespace-nowrap rounded-sm bg-white/[0.06] px-2 py-0.5 text-[10px]">
                    {c.blocker}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-secondary-foreground px-2 pt-1 text-[11px] font-light">
        TVL / APR are manual snapshots (2026-09-04) from the DEX interface, for evaluation only.
      </p>
    </div>
  );
}
