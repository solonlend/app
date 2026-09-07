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
  RH_MAINNET,
  SEPOLIA_PLAYGROUND,
  type FarmPool,
} from "@/lib/solon-farms";

// Preview uses the vault's own oracle (riskValueInLoan = USDG per 1 WETH, 6dp) — the same price
// basis the open() flow uses at execution — so the previewed position size matches what executes.
const farmOracleAbi = [
  {
    type: "function",
    name: "riskValueInLoan",
    stateMutability: "view",
    inputs: [{ name: "riskAmount", type: "uint256" }],
    outputs: [{ name: "valueInLoan", type: "uint256" }],
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

  // Match the open panel's config so the preview reads the same oracle the execution uses.
  const cfg = chainId === SEPOLIA_PLAYGROUND.chainId ? SEPOLIA_PLAYGROUND : RH_MAINNET;

  const { data } = useReadContracts({
    contracts: [
      { chainId, address: cfg.oracle, abi: farmOracleAbi, functionName: "riskValueInLoan", args: [10n ** 18n] },
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
    const px = data?.[0]?.result as bigint | undefined; // USDG (6dp) per 1 WETH, from the vault oracle
    return px !== undefined ? Number(formatUnits(px, 6)) : undefined;
  }, [data]);

  const mUsdg = marginMode === "eth" ? 0 : Number(margin) || 0;
  const mEthAmt = marginMode === "usdg" ? 0 : Number(marginEth) || 0;
  // Do not treat ETH margin as zero before the price loads: equity, debt mix, interest and net APY would omit the ETH leg
  // while still looking valid. Treat all derived values as unloaded until the price is available.
  const pxLoaded = ethPx !== undefined;
  const derivedLoaded = pxLoaded;
  const mEthValue = pxLoaded ? mEthAmt * ethPx : 0;
  const m = mUsdg + mEthValue; // equity in USDG terms (same basis as investLoan+investRisk in the contract's open function)
  const positionValue = m * leverage;
  // A symmetric range requires equal leg values: each needs positionValue/2. Borrowing per leg = required value minus user margin in that leg.
  // (Earlier versions split total borrowing in half, underborrowing WETH with single-asset margin and opening only half the previewed position.)
  const perLeg = positionValue / 2;
  const borrowWethValue = Math.max(0, perLeg - mEthValue);
  const borrowUsdg = Math.max(0, perLeg - mUsdg);
  const unusedMargin = Math.max(0, mUsdg - perLeg) + Math.max(0, mEthValue - perLeg);
  const borrowWethAmount = ethPx ? borrowWethValue / ethPx : undefined;
  // Each leg accrues at its reserve's live rate: USDG-only margin mainly borrows WETH; ETH-only margin mainly borrows USDG.
  // Borrowing costs can differ by an order of magnitude, so a single fixed rate is unsuitable.
  const rates = useReserveRates(cfg);
  const riskApr = rates.riskBorrowApr;
  const loanApr = rates.loanBorrowApr;
  const ratesLive = riskApr !== undefined && loanApr !== undefined;
  const borrowCost =
    ratesLive && derivedLoaded ? borrowCostDual(borrowWethValue, riskApr, borrowUsdg, loanApr) : undefined;
  const blendedApr =
    ratesLive && derivedLoaded ? blendedBorrowApr(borrowWethValue, riskApr, borrowUsdg, loanApr) : undefined;
  // Do not show a number when rates are unavailable: the previous 8% fallback could show a precise-looking but incorrect yield
  // when the actual USDG rate could be 149%. Show a placeholder instead.
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
            <span>Margin asset</span>
            <span>which asset(s) you post — the vault borrows the rest, no swap</span>
          </div>
          <p className="text-secondary-foreground px-1 text-[10px] font-light">
            One-sided margin is fine: at 2x it borrows only the other asset (zero-swap single-sided exposure); higher
            leverage tops up both legs, still zero-swap.
          </p>
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
                        ? "Borrow rates are read live from the on-chain lending pool."
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

        {farm.flagship &&
          farm.borrowMode === "dual" &&
          (chainId === 11155111 ? (
            <FarmTestnetPlayground
              cfg={SEPOLIA_PLAYGROUND}
              marginUsdg={mUsdg}
              marginEth={mEthAmt}
              leverage={leverage}
              rangePct={RANGE_PRESETS[rangeIdx].pct}
            />
          ) : (
            <FarmTestnetPlayground
              cfg={RH_MAINNET}
              marginUsdg={mUsdg}
              marginEth={mEthAmt}
              leverage={leverage}
              rangePct={RANGE_PRESETS[rangeIdx].pct}
            />
          ))}
        <p className="text-secondary-foreground text-center text-[11px] font-light">
          Live on Robinhood Chain (2026-09-07): V3 dual-borrow + V3 single-borrow vaults, on-chain verified. A scaled
          soft launch — small reserve caps, single operator key, external audit still pending. Size accordingly and
          verify on-chain.
        </p>
      </div>
    </SheetContent>
  );
}
