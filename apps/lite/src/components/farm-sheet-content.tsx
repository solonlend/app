import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@morpho-org/uikit/components/shadcn/sheet";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { useMemo, useState } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import { FarmTestnetPlayground } from "@/components/farm-testnet-playground";
import { useReserveRates } from "@/hooks/use-reserve-rates";
import { farmSignedColor } from "@/lib/farm-semantic-colors";
import {
  netApyDual,
  blendedBorrowApr,
  borrowCostDual,
  WETH_RH,
  USDG_RH,
  ETH_USD_FEED_RH,
  type FarmPool,
} from "@/lib/solon-farms";

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

type MarginMode = "usdg" | "eth" | "dual";
const MARGIN_MODES: { key: MarginMode; label: string }[] = [
  { key: "usdg", label: "USDG" },
  { key: "eth", label: "ETH" },
  { key: "dual", label: "USDG + ETH" },
];

const LEVERAGE_PRESETS = [1.5, 2, 3, 4];
const RANGE_PRESETS = [
  { label: "Narrow", pct: 2, note: "±2% — max fees, frequent rebalances" },
  { label: "Balanced", pct: 5, note: "±5% — the battle-tested default" },
  { label: "Wide", pct: 10, note: "±10% — fewer rebalances, diluted fees" },
];

const ROW = "text-secondary-foreground flex items-center justify-between text-xs font-light";
const CARD =
  "bg-primary hover:bg-secondary flex flex-col gap-3 rounded-2xl p-4 transition-colors duration-200 ease-in-out";

function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}

export function FarmSheetContent({ farm, chainId }: { farm: FarmPool; chainId: number | undefined }) {
  const [marginMode, setMarginMode] = useState<MarginMode>("usdg");
  const [margin, setMargin] = useState("1000");
  const [marginEth, setMarginEth] = useState("0.5");
  const [leverage, setLeverage] = useState(2);
  const [rangeIdx, setRangeIdx] = useState(1);

  const { data } = useReadContracts({
    contracts: [
      { chainId, address: ETH_USD_FEED_RH, abi: chainlinkAggregatorAbi, functionName: "latestRoundData" },
      ...(farm.poolAddress
        ? ([
            { chainId, address: WETH_RH, abi: erc20Abi, functionName: "balanceOf", args: [farm.poolAddress] },
            { chainId, address: USDG_RH, abi: erc20Abi, functionName: "balanceOf", args: [farm.poolAddress] },
          ] as const)
        : []),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    allowFailure: true,
    query: { enabled: chainId !== undefined, staleTime: 60_000 },
  });

  const ethPx = useMemo(() => {
    const round = data?.[0]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
    return round ? Number(formatUnits(round[1], 8)) : undefined;
  }, [data]);

  const mUsdg = marginMode === "eth" ? 0 : Number(margin) || 0;
  const mEthAmt = marginMode === "usdg" ? 0 : Number(marginEth) || 0;
  // 价格没加载时不能把 ETH 保证金当 0:那会让权益/债务构成/利息/净 APY 全部漏掉 ETH 腿,
  // 却仍然显示成一组看起来有效的数字。没价格就整块按"未加载"处理。
  const pxLoaded = ethPx !== undefined;
  const derivedLoaded = pxLoaded;
  const mEthValue = pxLoaded ? mEthAmt * ethPx : 0;
  const m = mUsdg + mEthValue; // equity in USDG terms (合约 open 的 investLoan+investRisk 同一口径)
  const positionValue = m * leverage;
  // 对称区间要求两腿等值:每腿需要 positionValue/2。各腿的借款 = 该腿所需 − 用户自带的这一腿。
  // (早期版本把总借款简单对半分,导致单侧保证金时 WETH 腿借少了、仓位实际只有预览的一半)
  const perLeg = positionValue / 2;
  const borrowWethValue = Math.max(0, perLeg - mEthValue);
  const borrowUsdg = Math.max(0, perLeg - mUsdg);
  const unusedMargin = Math.max(0, mUsdg - perLeg) + Math.max(0, mEthValue - perLeg);
  const borrowWethAmount = ethPx ? borrowWethValue / ethPx : undefined;
  // 两条腿各按各自储备的实时利率计息:USDG 单币保证金几乎只借 WETH 腿,ETH 单币保证金几乎只借 USDG 腿,
  // 两者的借款成本可以差一个数量级,所以不能用一个常数利率。
  const rates = useReserveRates();
  const riskApr = rates.riskBorrowApr;
  const loanApr = rates.loanBorrowApr;
  const ratesLive = riskApr !== undefined && loanApr !== undefined;
  const borrowCost =
    ratesLive && derivedLoaded ? borrowCostDual(borrowWethValue, riskApr, borrowUsdg, loanApr) : undefined;
  const blendedApr =
    ratesLive && derivedLoaded ? blendedBorrowApr(borrowWethValue, riskApr, borrowUsdg, loanApr) : undefined;
  // 利率读不到就不给数:此前回退到 8% 常数,在真实 USDG 利率可能是 149% 的情况下
  // 会显示一个看似精确、实则完全错误的收益率。宁可显示占位符。
  const netApy =
    ratesLive && derivedLoaded
      ? netApyDual({
          feeApr: farm.feeAprSnapshot,
          positionValue,
          equity: m,
          riskValue: borrowWethValue,
          riskApr,
          loanValue: borrowUsdg,
          loanApr,
        })
      : undefined;
  // HF at open: value·LLTV / debt = L·lltv/(L−1)
  const hf = leverage > 1 ? (leverage * (farm.lltvPercent / 100)) / (leverage - 1) : Infinity;
  const liqValueDrop = leverage > 1 ? 1 - (leverage - 1) / (farm.lltvPercent / 100) / leverage : 1;

  return (
    <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-scroll sm:w-[480px] sm:max-w-[480px]">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {farm.pair}
          <span className="text-secondary-foreground rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
            {farm.dex.replace("Uniswap ", "")} · {farm.feeLabel ?? `${(farm.feeTierBps / 10000).toFixed(2)}%`}
          </span>
          {farm.flagship && (
            <span className="text-morpho-brand rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">Flagship</span>
          )}
        </SheetTitle>
        <SheetDescription>
          Leveraged concentrated LP: both legs are borrowed in LP ratio, so opening needs no swap and price drift is
          largely self-hedged.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3 px-4 pb-6">
        <div className={CARD}>
          <div className={ROW}>
            <span>Margin</span>
            <span>single- or dual-sided, your choice</span>
          </div>
          <div className="flex gap-2">
            {MARGIN_MODES.map((mm) => (
              <Button
                key={mm.key}
                variant={mm.key === marginMode ? "blue" : "secondary"}
                className="h-7 grow rounded-full text-xs"
                onClick={() => setMarginMode(mm.key)}
              >
                {mm.label}
              </Button>
            ))}
          </div>
          {marginMode !== "eth" && (
            <div className="flex items-baseline gap-2">
              <input
                className="text-primary-foreground grow bg-transparent text-2xl font-light outline-none"
                inputMode="decimal"
                value={margin}
                onChange={(e) => setMargin(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
              />
              <span className="text-secondary-foreground text-xs">USDG</span>
            </div>
          )}
          {marginMode !== "usdg" && (
            <div className="flex items-baseline gap-2">
              <input
                className="text-primary-foreground grow bg-transparent text-2xl font-light outline-none"
                inputMode="decimal"
                value={marginEth}
                onChange={(e) => setMarginEth(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
              />
              <span className="text-secondary-foreground text-xs">ETH</span>
            </div>
          )}
          {marginMode !== "usdg" && (
            <p className="text-secondary-foreground text-[11px] font-light">
              {ethPx && mEthAmt > 0 ? `≈ ${fmt(mEthValue)} USDG · ` : ""}ETH margin joins the WETH leg directly — less
              to borrow on that side, same zero-swap entry.
            </p>
          )}
        </div>

        <div className={CARD}>
          <div className={ROW}>
            <span>Leverage</span>
            <span>{leverage.toFixed(1)}x</span>
          </div>
          <div className="flex gap-2">
            {LEVERAGE_PRESETS.map((l) => (
              <Button
                key={l}
                variant={l === leverage ? "blue" : "secondary"}
                className="h-8 grow rounded-full text-xs"
                onClick={() => setLeverage(l)}
              >
                {l}x
              </Button>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <div className={ROW}>
            <span>Range width</span>
            <span>{RANGE_PRESETS[rangeIdx].note}</span>
          </div>
          <div className="flex gap-2">
            {RANGE_PRESETS.map((r, i) => (
              <Button
                key={r.label}
                variant={i === rangeIdx ? "blue" : "secondary"}
                className="h-8 grow rounded-full text-xs"
                onClick={() => setRangeIdx(i)}
              >
                {r.label} ±{r.pct}%
              </Button>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <div className={ROW}>
            <span>Position preview</span>
            <span>{ethPx ? `mainnet oracle ETH $${fmt(ethPx)}` : "loading price…"}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className={ROW}>
              <span>Equity (margin total)</span>
              <span className="text-primary-foreground">{derivedLoaded ? `${fmt(m)} USDG` : "－"}</span>
            </div>
            <div className={ROW}>
              <span>LP position value</span>
              <span className="text-primary-foreground">{derivedLoaded ? `${fmt(positionValue)} USDG` : "－"}</span>
            </div>
            <div className={ROW}>
              <span className="shrink-0">
                Borrow · WETH leg
                {riskApr !== undefined && (
                  <span className="text-secondary-foreground"> @ {(riskApr * 100).toFixed(2)}% APR</span>
                )}
              </span>
              <span className="text-primary-foreground text-right">
                {derivedLoaded && borrowWethAmount !== undefined ? `${fmt(borrowWethAmount, 4)} WETH` : "－"}
                {derivedLoaded && <span className="text-secondary-foreground"> ≈ {fmt(borrowWethValue)} USDG</span>}
              </span>
            </div>
            <div className={ROW}>
              <span>
                Borrow · USDG leg
                {loanApr !== undefined && (
                  <span className="text-secondary-foreground"> @ {(loanApr * 100).toFixed(2)}% APR</span>
                )}
              </span>
              <span className="text-primary-foreground">{derivedLoaded ? `${fmt(borrowUsdg)} USDG` : "－"}</span>
            </div>
            {derivedLoaded && unusedMargin > 0.01 && (
              <div className={ROW}>
                <span>Margin returned unused</span>
                <span className="text-primary-foreground">{fmt(unusedMargin)} USDG</span>
              </div>
            )}
            <div className={ROW}>
              <span>Borrow interest (annual)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-primary-foreground underline decoration-dotted underline-offset-2">
                      {borrowCost !== undefined ? `${fmt(borrowCost)} USDG` : "－"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-primary-foreground max-w-80 rounded-3xl p-4 shadow-2xl">
                    <p>
                      Each leg accrues at its own reserve&apos;s live borrow rate:{" "}
                      {riskApr !== undefined && derivedLoaded
                        ? `${fmt(borrowWethValue)} USDG at ${(riskApr * 100).toFixed(2)}%`
                        : "－"}{" "}
                      on the WETH leg,{" "}
                      {loanApr !== undefined && derivedLoaded
                        ? `${fmt(borrowUsdg)} USDG at ${(loanApr * 100).toFixed(2)}%`
                        : "－"}{" "}
                      on the USDG leg. Which asset you post as margin decides the mix, so it decides the cost.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={ROW}>
              <span>Blended borrow rate</span>
              <span className="text-primary-foreground">
                {blendedApr !== undefined ? `${(blendedApr * 100).toFixed(2)}%` : "－"}
              </span>
            </div>
            <div className={ROW}>
              <span>Est. net APY</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`${farmSignedColor(farm.feeAprSnapshot > 0 ? netApy : undefined)} underline decoration-dotted underline-offset-2`}
                    >
                      {netApy !== undefined && farm.feeAprSnapshot > 0 ? `${(netApy * 100).toFixed(1)}%` : "－"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-primary-foreground max-w-80 rounded-3xl p-4 shadow-2xl">
                    <p>
                      (fee APR {(farm.feeAprSnapshot * 100).toFixed(1)}% × {derivedLoaded ? fmt(positionValue) : "－"}{" "}
                      USDG position − {borrowCost !== undefined ? `${fmt(borrowCost)}` : "－"} USDG interest) ÷{" "}
                      {derivedLoaded ? fmt(m) : "－"} USDG equity. Interest is the sum of the two legs at their own live
                      reserve rates, not one blended rate.
                    </p>
                    <p>
                      Fee APR is a 24h snapshot.{" "}
                      {ratesLive
                        ? "Borrow rates are read live from the Sepolia lending pool."
                        : "Borrow rates are unavailable, so no net APY estimate is shown."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={ROW}>
              <span>Health factor at open</span>
              <span className="text-primary-foreground">{Number.isFinite(hf) ? hf.toFixed(2) : "∞"}</span>
            </div>
            <div className={ROW}>
              <span>Liquidation buffer</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-primary-foreground underline decoration-dotted underline-offset-2">
                      −{(liqValueDrop * 100).toFixed(1)}% position value
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-primary-foreground max-w-80 rounded-3xl p-4 shadow-2xl">
                    <p>
                      Liquidation triggers when position value falls this far relative to debt (LLTV {farm.lltvPercent}
                      %). Because both legs are borrowed, moderate price moves are largely self-hedged — the main risks
                      are drifting far out of range and fee droughts.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        <Button className="h-11 w-full rounded-full text-sm" variant="secondary" disabled>
          Open position · Mainnet soon
        </Button>

        {farm.flagship && (
          <FarmTestnetPlayground
            marginUsdg={mUsdg}
            marginEth={mEthAmt}
            leverage={leverage}
            rangePct={RANGE_PRESETS[rangeIdx].pct}
          />
        )}
        <p className="text-secondary-foreground text-center text-[11px] font-light">
          Vaults are live and battle-tested on Sepolia (350+ txs: dual-direction liquidations, bad-debt drills,
          adversarial paths). Mainnet launch is gated on the deploy checklist + external audit.
        </p>
      </div>
    </SheetContent>
  );
}
