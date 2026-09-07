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
import { Address, Chain, erc20Abi, formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import { FarmSheetContent } from "@/components/farm-sheet-content";
import { PtsBadge } from "@/components/pts-badge";
import { fullCapacityLabel, useFarmProtocol } from "@/hooks/use-farm-protocol";
import { useLiveFeeApr, effectiveFeeApr } from "@/hooks/use-live-fee-apr";
import { useObservationPools } from "@/hooks/use-observation-pools";
import { useReserveRates } from "@/hooks/use-reserve-rates";
import { farmAssets } from "@/lib/farm-protocol";
import { farmSignedColor } from "@/lib/farm-semantic-colors";
import { monogramURI } from "@/lib/monogram";
import { SOLON_FARMS, WETH_RH, USDG_RH, ETH_USD_FEED_RH, estimateNetApy, type FarmPool } from "@/lib/solon-farms";
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
  const assets = farmAssets(farm.token0Symbol, farm.token1Symbol, farm.loanIsC0)!;
  const iconSrc = (symbol: string, address?: Address) =>
    symbol === "WETH" || symbol === "ETH"
      ? `${import.meta.env.BASE_URL}eth-logo.svg`
      : address
        ? getTokenURI({ symbol, address, chainId })
        : undefined;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-min items-center gap-2 p-2">
            <div className="flex -space-x-2">
              {[
                { symbol: farm.token0Symbol, address: farm.token0Address },
                { symbol: farm.token1Symbol, address: farm.token1Address },
              ].map(({ symbol, address }, i) => (
                <Avatar key={i} className="h-6 w-6">
                  <AvatarImage src={iconSrc(symbol, address)} alt={symbol} />
                  <AvatarFallback delayMs={500}>
                    <img src={monogramURI(symbol)} alt={symbol} />
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <div className="whitespace-nowrap">
              <span>{farm.pair}</span>
              <p className="text-secondary-foreground text-[10px]">
                Risk {assets.risk} / quote {assets.quote}
              </p>
            </div>
            <span className="text-secondary-foreground whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
              {farm.dex.replace("Uniswap ", "")} · {farm.feeLabel ?? `${(farm.feeTierBps / 10000).toFixed(2)}%`}
            </span>
            <span className="text-secondary-foreground whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
              {farm.borrowMode === "dual" ? "Dual-borrow" : "Single-borrow"}
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
          {[
            { symbol: farm.token0Symbol, address: farm.token0Address },
            { symbol: farm.token1Symbol, address: farm.token1Address },
          ].map(({ symbol, address }, i) => (
            <div key={i} className="flex items-center gap-1">
              <p>
                {symbol}: <code>{address ? abbreviateAddress(address) : "—"}</code>
              </p>
              {explorer && address && (
                <a href={`${explorer}/address/${address}`} rel="noopener noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FarmTable({ chain }: { chain: Chain | undefined }) {
  const chainId = chain?.id;

  const protocol = useFarmProtocol();
  const capacityLabel = fullCapacityLabel(protocol.fullReserve);
  const capacityBlocked = !!protocol.fullReserve || protocol.capacityUnknown;
  const rates = useReserveRates();
  const { data: liveFeeApr } = useLiveFeeApr();
  const { data: observationData } = useObservationPools();
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
            {SOLON_FARMS.filter((farm) => farm.status === "live" && farm.listed !== false).map((farm) => {
              // The table has no margin breakdown, so average both reserve rates assuming equal borrowing across the legs.
              // The opening panel calculates each position's cost per leg using its actual borrowing mix.
              // Hide net APY when rates are unavailable; do not use a fixed 8% rate to produce a plausible-looking number.
              // Fee APR: live from the on-chain indexer once warmed up (>=2h window), else the dated snapshot.
              const { value: feeApr, live: feeAprLive } =
                farm.feeAprSnapshot > 0 ? effectiveFeeApr(liveFeeApr, farm.feeAprSnapshot) : { value: 0, live: false };
              const netApy =
                tableBorrowApr !== undefined ? estimateNetApy(feeApr, farm.maxLeverage, tableBorrowApr) : undefined;
              const tvl = farm.dex === "Uniswap V3" ? v3TvlUsd : undefined;
              return (
                <Sheet key={farm.id}>
                  <SheetTrigger asChild disabled={capacityBlocked}>
                    <TableRow
                      aria-disabled={capacityBlocked}
                      onClick={(event) => {
                        if (capacityBlocked) event.preventDefault();
                      }}
                      className="bg-primary hover:bg-secondary"
                    >
                      <TableCell className="rounded-l-lg py-3">
                        <PairCell farm={farm} chain={chain} />
                      </TableCell>
                      <TableCell>{tvl !== undefined ? formatUsdCompact(tvl) : "－"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="underline decoration-dotted underline-offset-2">
                                {farm.feeAprSnapshot > 0 ? formatPct(feeApr) : "－"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-primary-foreground max-w-96 rounded-3xl p-4 shadow-2xl">
                              {feeAprLive ? (
                                <p>Live 24h fee APR, computed on-chain (pool feeGrowth over the trailing 24h ÷ TVL).</p>
                              ) : (
                                <p>
                                  24h fee APR snapshot ({farm.snapshotDate}); the on-chain live indexer is warming up.
                                </p>
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
                          <button
                            disabled={capacityBlocked}
                            className="bg-primary-foreground text-primary px-4 py-1.5 text-xs font-medium hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Farm
                          </button>
                          <span className="text-secondary-foreground text-[10px]">
                            {capacityLabel ??
                              (protocol.capacityUnknown ? "Capacity loading / unavailable" : "soft launch")}
                          </span>
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
        <h3 className="text-secondary-foreground text-xs font-light tracking-wide">
          Observation pools · top 10 by TVL
        </h3>
        <span className="text-secondary-foreground text-[11px] font-light">
          Feed-backed pools can become leverage farms; the rest need a TWAP oracle + red-team round first
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table className="border-separate border-spacing-y-2 opacity-80">
          <TableHeader>
            <TableRow>
              <TableHead className="text-secondary-foreground pl-4 text-[10px] font-light">Pool</TableHead>
              <TableHead className="text-secondary-foreground text-[10px] font-light">TVL</TableHead>
              <TableHead className="text-secondary-foreground hidden text-[10px] font-light md:table-cell">
                Fee APR
              </TableHead>
              <TableHead className="text-secondary-foreground text-[10px] font-light">Feed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(observationData?.pools ?? []).map((c) => (
              <TableRow key={`${c.dex}-${c.label}-${c.fee_tier_label}`} className="bg-primary">
                <TableCell className="rounded-l-lg py-2 pl-4">
                  <span className="whitespace-nowrap">{c.label}</span>
                  <span className="text-secondary-foreground ml-2 whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                    {c.dex} · {c.fee_tier_label}
                  </span>
                </TableCell>
                <TableCell>{formatUsdCompact(c.tvl_usd)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {c.fee_apr !== null ? formatPct(c.fee_apr) : "—"}
                </TableCell>
                <TableCell className="rounded-r-lg">
                  {c.has_feed ? (
                    <span className="text-farm-safe bg-farm-safe-subtle whitespace-nowrap rounded-sm px-2 py-0.5 text-[10px]">
                      feed · eligible
                    </span>
                  ) : (
                    <span className="text-secondary-foreground whitespace-nowrap rounded-sm bg-white/[0.06] px-2 py-0.5 text-[10px]">
                      no feed
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-secondary-foreground px-2 pt-1 text-[11px] font-light">
        {observationData
          ? `Live top-10 by TVL from the Uniswap interface (as of ${new Date(observationData.generated_at * 1000)
              .toISOString()
              .slice(0, 16)
              .replace(
                "T",
                " ",
              )} UTC). Fee APR = annualized 24h volume × fee ÷ TVL; unavailable (—) where the source omits v4 volume.`
          : "Loading live top-10 pools by TVL…"}
      </p>
    </div>
  );
}
