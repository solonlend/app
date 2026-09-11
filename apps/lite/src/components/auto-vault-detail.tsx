import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@morpho-org/uikit/components/shadcn/sheet";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { useModal } from "connectkit";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useConfig, useReadContracts, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { BADGE, INPUT, LABEL, PANEL, fmt, fmtAmt, fmtQuote } from "@/components/auto-vault-common";
import { AutoPairInfo } from "@/components/auto-vault-info";
import { useAutoHistory } from "@/hooks/use-auto-history";
import { useAutoNetContribution } from "@/hooks/use-auto-pnl";
import { useAutoPositionBasis } from "@/hooks/use-auto-position-basis";
import { useAutoVault } from "@/hooks/use-auto-vault";
import { useBusy } from "@/hooks/use-busy";
import { depositPctAmounts, depositShortfalls, swapLinkFor } from "@/lib/auto-deposit";
import { isSyncing, recordAutoTx } from "@/lib/auto-sync-hint";
import { farmSignedColor } from "@/lib/farm-semantic-colors";
import { rangeVaultAbi, type RangeVaultCfg } from "@/lib/solon-range";
import { runTx } from "@/lib/tx-toast";

/*
  Auto LP vault detail — /farm/auto/:vault (DESIGN-farm-tabs-v1 §E, v1.3): price-range visual +
  LP breakdown + strategy full-width; Deposit/Withdraw open a right-hand sheet with the full fee
  disclosure — same interaction grammar as the leveraged side. `← All vaults` goes back.
  The subtree is remounted per vault/chain/account, and sheet content mounts fresh per open, so
  no input, preview or tx state can leak across identities (preview race lesson, structural fix).
*/

export function AutoVaultDetail({ cfg, onBack }: { cfg: RangeVaultCfg; onBack: () => void }) {
  const { address: user } = useAccount();
  return (
    <div className="flex w-full max-w-7xl flex-col gap-4 px-2 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-secondary-foreground hover:text-primary-foreground text-xs"
        >
          ← All vaults
        </button>
        <AutoPairInfo cfg={cfg}>
          <span className="ml-2 flex items-center gap-2">
            <span className="text-primary-foreground text-base font-medium">{cfg.pair}</span>
            <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · {cfg.feeLabel}</span>
          </span>
        </AutoPairInfo>
        {cfg.testnet && <span className={`${BADGE} bg-yellow-500/15 text-yellow-300`}>TESTNET</span>}
      </div>
      <DetailInner key={`${cfg.chainId}:${cfg.slug}:${user ?? "-"}`} cfg={cfg} />
    </div>
  );
}

/** Relative "x ago" for on-chain timestamps. */
function ago(ts: bigint | undefined): string {
  if (ts === undefined || ts === 0n) return "－";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const FEE_ROW = "text-secondary-foreground flex items-center justify-between text-xs font-light";

function AddressLine({ label, address, explorer }: { label: string; address?: string; explorer: string }) {
  return (
    <div className={FEE_ROW}>
      <span>{label}</span>
      {address ? (
        <a
          className="text-primary-foreground flex items-center gap-1 underline decoration-dotted underline-offset-2"
          href={`${explorer}/address/${address}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          <code className="text-xs">{`${address.slice(0, 6)}…${address.slice(-4)}`}</code>
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span>pending deployment</span>
      )}
    </div>
  );
}

function FeesPanel({ title = "Fees" }: { title?: string }) {
  return (
    <div className={PANEL}>
      <span className={LABEL}>{title}</span>
      <div className="mt-2 flex flex-col gap-1">
        <div className={FEE_ROW}>
          <span>Deposit fee</span>
          <span>0%</span>
        </div>
        <div className={FEE_ROW}>
          <span>Withdrawal fee</span>
          <span>0%</span>
        </div>
        <div className={FEE_ROW}>
          <span>Performance fee</span>
          <span>10% of yield</span>
        </div>
        <p className="text-secondary-foreground mt-1 text-[11px] font-light">
          The performance fee is taken at harvest, never from principal. Withdrawals are available in any market
          condition.
        </p>
      </div>
    </div>
  );
}

function VaultDetailsPanel({ cfg, lastAdjustment }: { cfg: RangeVaultCfg; lastAdjustment?: bigint }) {
  return (
    <div className={PANEL}>
      <span className={LABEL}>Vault details</span>
      <div className="mt-2 flex flex-col gap-1">
        <div className={FEE_ROW}>
          <span>Platform</span>
          <span>Uniswap V3 · {cfg.feeLabel} fee tier</span>
        </div>
        {cfg.vault && (
          <div className={FEE_ROW}>
            <span>Last range adjustment</span>
            <span className="tabular-nums">{ago(lastAdjustment)}</span>
          </div>
        )}
        <AddressLine label="Vault" address={cfg.vault} explorer={cfg.explorer} />
        <AddressLine label="Strategy" address={cfg.strategy} explorer={cfg.explorer} />
        <AddressLine label="Pool" address={cfg.pool} explorer={cfg.explorer} />
        <AddressLine label={cfg.token0.symbol} address={cfg.token0.address} explorer={cfg.explorer} />
        <AddressLine label={cfg.token1.symbol} address={cfg.token1.address} explorer={cfg.explorer} />
      </div>
    </div>
  );
}

function DetailInner({ cfg }: { cfg: RangeVaultCfg }) {
  const v = useAutoVault(cfg);
  const stableSym = cfg.stableLeg === 1 ? cfg.token1.symbol : cfg.token0.symbol;
  const history = useAutoHistory(cfg);
  const { data: contribution } = useAutoNetContribution(cfg, v.user);
  const basis = useAutoPositionBasis(cfg, v.user);
  const [depOpen, setDepOpen] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const { setOpen: openConnect } = useModal();

  // Cost-basis yield (Beefy dashboard's At Deposit / Yield): current value minus entry-priced basis.
  const atDeposit = v.myShares > 0n ? basis?.costBasisUsd : undefined;
  const yieldUsd = atDeposit !== undefined && v.myValue1 !== undefined ? v.myValue1 - atDeposit : undefined;

  // Vs-holding PnL at today's price: current claim minus net contributed, both marked now.
  let pnl1: number | undefined;
  let pnlDelta0: number | undefined;
  let pnlDelta1: number | undefined;
  if (contribution && v.myShares > 0n && v.bal0 !== undefined && v.bal1 !== undefined && v.price !== undefined) {
    const claim0 = v.bal0 * v.myFrac;
    const claim1 = v.bal1 * v.myFrac;
    pnlDelta0 = claim0 - Number(formatUnits(contribution.net0, cfg.token0.decimals));
    pnlDelta1 = claim1 - Number(formatUnits(contribution.net1, cfg.token1.decimals));
    // Fold into the stable leg (SPEC §5 v1.7) — same USD semantics as every other quote.
    pnl1 = cfg.stableLeg === 1 ? pnlDelta0 * v.price + pnlDelta1 : pnlDelta0 + pnlDelta1 / v.price;
  }

  const stat = (label: string, value: string, sub?: string, colorClass?: string) => (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <span className={LABEL}>{label}</span>
      {v.loading ? (
        <div className="mt-1 h-6 w-20 animate-pulse rounded bg-white/[0.08]" />
      ) : (
        <div className={`${colorClass || "text-primary-foreground"} mt-1 break-all text-base font-medium tabular-nums`}>
          {value}
        </div>
      )}
      {sub && !v.loading && <span className="text-secondary-foreground text-[10px]">{sub}</span>}
    </div>
  );

  if (!v.deployed) {
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className={`${PANEL} flex flex-col gap-3`}>
            <span className={`${BADGE} text-morpho-brand self-start bg-white/[0.06]`}>COMING SOON</span>
            <p className="text-secondary-foreground text-xs font-light leading-relaxed">
              This vault is not live on this chain yet. Deposits open when the mainnet deployment lands. The numbers
              below are today&apos;s underlying pool — what the vault will farm once it goes live.
            </p>
            {v.poolStats && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {stat("Pool TVL", `$${fmt(v.poolStats.tvlUsd)}`, "pool-level, pre-launch")}
                {stat("24h volume", `$${fmt(v.poolStats.volume24hUsd)}`)}
                {stat(
                  "LP fee APR (gross)",
                  `${(v.poolStats.feeAprGross * 100).toFixed(1)}%`,
                  "before the 10% performance fee",
                )}
              </div>
            )}
          </div>
          <div className={PANEL}>
            <span className={LABEL}>Strategy</span>
            <p className="text-secondary-foreground mt-2 max-w-3xl text-xs font-light leading-relaxed">
              Deposit both tokens and walk away: the vault sets the range, resets it as price moves, and compounds
              trading fees back into the position. Your principal is never swapped. Contracts are complete and verified
              end-to-end on a live testnet — mainnet deployment is in final review.
              {cfg.marketHours &&
                " One more: this pair carries a tokenized equity/ETF leg — its underlying market closes overnight and on weekends while the pool keeps trading, so expect wider drift and a re-center after gaps."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <FeesPanel title="Fees at launch" />
          <VaultDetailsPanel cfg={cfg} />
        </div>
      </div>
    );
  }

  const { d0, d1 } = v;
  const balances = v.balances;

  const sheetProps = {
    cfg,
    isCalm: v.isCalm,
    refetch: v.refetch,
    myShares: v.myShares,
    totalSupply: v.totalSupply,
    vaultBal0: balances?.[0],
    vaultBal1: balances?.[1],
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Headline stats — the list row's numbers, so the detail stands on its own */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat(
          "Net APR",
          v.netApr !== undefined ? `${(v.netApr * 100).toFixed(2)}%` : "－",
          cfg.testnet && v.netApr === undefined
            ? "no APR feed on testnet"
            : v.aprWarming
              ? "after the 10% performance fee · 24h window warming"
              : "after the 10% performance fee",
          farmSignedColor(v.netApr),
        )}
        {stat("Daily", v.netApr !== undefined ? `${((v.netApr / 365) * 100).toFixed(4)}%` : "－")}
        {stat("TVL", v.tvl1 !== undefined ? fmtQuote(v.tvl1, cfg.token1.symbol) : "－")}
        {stat(
          "My deposit",
          !v.user ? "－" : v.myShares > 0n && v.myValue1 !== undefined ? fmtQuote(v.myValue1, cfg.token1.symbol) : "$0",
          v.user ? undefined : "connect wallet",
        )}
      </div>

      {/* Beefy-style split: main content left, actions + facts right (where the old action panel
          sat). DOM order actions → content → facts keeps the buttons right under the stats on
          mobile; on lg the left column spans both right-side rows. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex gap-2 lg:col-start-2 lg:row-start-1">
          {/* Disconnected: both buttons summon the wallet modal (SPEC §3 触发按钮). Connected:
              controlled + conditionally mounted sheets so state really resets per open; Withdraw
              is disabled while the account holds no shares. */}
          {!v.user ? (
            <>
              <Button
                size="lg"
                className="grow rounded-full font-light"
                variant="blue"
                onClick={() => openConnect(true)}
              >
                Deposit
              </Button>
              <Button
                size="lg"
                className="grow rounded-full font-light"
                variant="secondary"
                onClick={() => openConnect(true)}
              >
                Withdraw
              </Button>
            </>
          ) : (
            <>
              <Sheet open={depOpen} onOpenChange={setDepOpen}>
                <SheetTrigger asChild>
                  <Button size="lg" className="grow rounded-full font-light" variant="blue">
                    Deposit
                  </Button>
                </SheetTrigger>
                {depOpen && <ActionSheetContent {...sheetProps} initialMode="deposit" />}
              </Sheet>
              <Sheet open={wdOpen} onOpenChange={setWdOpen}>
                <SheetTrigger asChild>
                  <Button
                    size="lg"
                    className="grow rounded-full font-light"
                    variant="secondary"
                    disabled={v.myShares === 0n}
                  >
                    Withdraw
                  </Button>
                </SheetTrigger>
                {wdOpen && <ActionSheetContent {...sheetProps} initialMode="withdraw" />}
              </Sheet>
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {/* Price & managed range */}
          <div className={PANEL}>
            <div className="mb-3 flex items-center justify-between">
              <span className={LABEL}>Price & managed range</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      hidden={v.isCalm === undefined}
                      className={`${BADGE} ${v.isCalm === false ? "bg-yellow-500/20 text-yellow-300" : "bg-emerald-500/15 text-emerald-300"}`}
                    >
                      {v.isCalm === false ? "VOLATILE" : "CALM"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                    Deposits and compounding run only while spot sits near the pool&apos;s 2-minute average — this
                    blocks price-manipulation entries. Withdrawals are never gated.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/[0.04] p-3">
                <span className={LABEL}>Min price</span>
                <div className="text-primary-foreground mt-1 text-base font-medium tabular-nums">
                  {v.lower !== undefined ? fmt(v.lower) : "－"}
                </div>
                <span className="text-secondary-foreground text-[10px]">
                  {cfg.token1.symbol}/{cfg.token0.symbol}
                </span>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-3">
                <span className={LABEL}>
                  Current{" "}
                  {v.price !== undefined && v.lower !== undefined && (
                    <span className={v.inRange ? "text-emerald-300" : "text-yellow-300"}>
                      {v.inRange ? "(in range)" : "(out)"}
                    </span>
                  )}
                </span>
                <div className="text-primary-foreground mt-1 text-base font-medium tabular-nums">
                  {v.price !== undefined ? fmt(v.price) : "－"}
                </div>
                <span className="text-secondary-foreground text-[10px]">
                  {cfg.token1.symbol}/{cfg.token0.symbol}
                </span>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-3">
                <span className={LABEL}>Max price</span>
                <div className="text-primary-foreground mt-1 text-base font-medium tabular-nums">
                  {v.upper !== undefined ? fmt(v.upper) : "－"}
                </div>
                <span className="text-secondary-foreground text-[10px]">
                  {cfg.token1.symbol}/{cfg.token0.symbol}
                </span>
              </div>
            </div>
            {/* Range bar with current-price marker */}
            {v.lower !== undefined && v.upper !== undefined && v.price !== undefined && v.upper > v.lower && (
              <div className="mt-3">
                <div className="relative h-2 rounded-full bg-white/[0.06]">
                  <div className="absolute inset-y-0 left-[10%] right-[10%] rounded-full bg-emerald-500/25" />
                  <div
                    className={`absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded ${v.inRange ? "bg-emerald-300" : "bg-yellow-300"}`}
                    style={{
                      left: `${Math.min(98, Math.max(2, 10 + ((v.price - v.lower) / (v.upper - v.lower)) * 80))}%`,
                    }}
                  />
                </div>
                <div className="text-secondary-foreground mt-1 flex justify-between text-[10px] tabular-nums">
                  <span>{fmt(v.lower)}</span>
                  <span>
                    ±{(((v.upper - v.lower) / 2 / v.price) * 100).toFixed(1)}% range · auto re-centered by the keeper
                  </span>
                  <span>{fmt(v.upper)}</span>
                </div>
              </div>
            )}
            {/* Out-of-range explainer (SPEC §2.2, wording mirrors the Strategy panel).
                inRange is a plain boolean that reads false while data loads — the price/lower
                guards make it meaningful here, and === false keeps that explicit. */}
            {v.price !== undefined && v.lower !== undefined && v.inRange === false && (
              <p className="mt-3 rounded-xl bg-yellow-500/10 p-3 text-[11px] font-light leading-relaxed text-yellow-300">
                Price is outside the managed range: the position earns no fees and leans toward one token until the
                keeper re-centers the range during a calm market. Nothing is force-sold.
              </p>
            )}
          </div>

          {/* LP breakdown */}
          <div className={PANEL}>
            <span className={LABEL}>LP breakdown</span>
            <div className="mt-3 flex flex-col gap-2">
              {[
                [cfg.token0, balances?.[0], d0, cfg.stableLeg === 1 ? v.val0 : undefined, v.share0] as const,
                [
                  cfg.token1,
                  balances?.[1],
                  d1,
                  cfg.stableLeg === 0 && v.tvl1 !== undefined && v.bal0 !== undefined ? v.tvl1 - v.bal0 : v.bal1,
                  v.share0 !== undefined ? 100 - v.share0 : undefined,
                ] as const,
              ].map(([t, raw, dec, val, share]) => (
                <div key={t.symbol} className="flex items-center gap-3">
                  <span className="text-primary-foreground w-14 text-sm font-medium">{t.symbol}</span>
                  <div className="h-1.5 grow rounded-full bg-white/[0.06]">
                    <div
                      className="bg-morpho-brand/60 h-full rounded-full"
                      style={{ width: `${share !== undefined ? Math.max(2, share) : 0}%` }}
                    />
                  </div>
                  <span className="text-secondary-foreground w-40 text-right text-xs tabular-nums">
                    {raw !== undefined ? fmtAmt(raw, dec) : "－"}{" "}
                    {t.symbol !== stableSym && val !== undefined ? `· ${fmt(val)} ${stableSym}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-secondary-foreground mt-2 text-[11px] font-light">
              The mix drifts with price and is never force-rebalanced by selling — that is the point.
            </p>
          </div>

          {/* Strategy */}
          <div className={PANEL}>
            <span className={LABEL}>Strategy</span>
            <p className="text-secondary-foreground mt-2 text-xs font-light leading-relaxed">
              Your two tokens are placed as concentrated liquidity around the current price on Uniswap V3. The vault
              collects trading fees and compounds them back into the position; a keeper re-centers the range during a
              calm market when price drifts out of it, and every sensitive action is gated behind a 2-minute TWAP calm
              check. Your principal is never swapped. Risk to understand: while price sits outside the range the
              position earns no fees and holds mostly one token until the next re-center — no losses are forced, but the
              mix follows the market.
              {cfg.marketHours &&
                " One more: this pair carries a tokenized equity/ETF leg — its underlying market closes overnight and on weekends while the pool keeps trading, so expect wider drift and a re-center after gaps."}
            </p>
          </div>

          {/* Activity — harvest/rebalance history (SPEC §2.5.5 v1.9); hidden when the feed is absent */}
          {history !== undefined && (
            <div className={PANEL}>
              <span className={LABEL}>Activity</span>
              {history.length === 0 ? (
                <p className="text-secondary-foreground mt-2 text-xs font-light">No activity yet.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {history.slice(0, 8).map((e) => (
                    <a
                      key={e.tx}
                      href={`${cfg.explorer}/tx/${e.tx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/[0.07]"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`${BADGE} ${e.kind === "harvest" ? "bg-emerald-500/15 text-emerald-300" : "bg-cyan-500/15 text-cyan-300"}`}
                        >
                          {e.kind === "harvest" ? "HARVEST" : "RANGE"}
                        </span>
                        <span className="text-secondary-foreground text-xs tabular-nums">{ago(BigInt(e.ts))}</span>
                      </span>
                      <span className="text-secondary-foreground text-right text-xs tabular-nums">
                        {e.kind === "harvest"
                          ? `+${fmtAmt(BigInt(e.fee0 ?? "0"), d0)} ${cfg.token0.symbol} · +${fmtAmt(BigInt(e.fee1 ?? "0"), d1)} ${cfg.token1.symbol}`
                          : e.tickLower !== undefined
                            ? `re-centered · ticks ${e.tickLower} → ${e.tickUpper}`
                            : "range re-centered"}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* My position — placeholder when connected without a position (SPEC §2.4) */}
          {v.user && v.myShares === 0n && (
            <div className={PANEL}>
              <span className={LABEL}>My position</span>
              <p className="text-secondary-foreground mt-2 text-xs font-light">
                No position yet — your value, cost basis and yield will appear here after your first deposit.
              </p>
            </div>
          )}
          {v.user && v.myShares > 0n && cfg.vault && isSyncing(cfg.chainId, cfg.vault) && (
            <p className="rounded-xl bg-yellow-500/10 p-3 text-[11px] font-light leading-relaxed text-yellow-300">
              Syncing your last transaction — cost basis and vs-HODL can lag a few minutes.
            </p>
          )}
          {v.user && v.myShares > 0n && (
            <div className={PANEL}>
              <span className={LABEL}>My position</span>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`${LABEL} underline decoration-dotted underline-offset-2`}>At deposit</span>
                      </TooltipTrigger>
                      <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                        What your current position cost when you entered: each deposit priced at its own entry block,
                        withdrawals reduce the basis proportionally. Computed by the position indexer from vault events.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="text-primary-foreground mt-0.5 break-all text-base font-medium tabular-nums">
                    {atDeposit !== undefined ? fmtQuote(atDeposit, cfg.token1.symbol) : "－"}
                  </div>
                </div>
                <div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`${LABEL} underline decoration-dotted underline-offset-2`}>Yield</span>
                      </TooltipTrigger>
                      <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                        Value now minus value at deposit — everything the position gained or lost since entry: trading
                        fees compounded in, plus price moves of the tokens themselves.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div
                    className={`${farmSignedColor(yieldUsd) || "text-primary-foreground"} mt-0.5 break-all text-base font-medium tabular-nums`}
                  >
                    {yieldUsd !== undefined
                      ? `${yieldUsd >= 0 ? "+" : ""}${fmtQuote(yieldUsd, cfg.token1.symbol)}`
                      : "－"}
                  </div>
                </div>
                <div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`${LABEL} underline decoration-dotted underline-offset-2`}>vs HODL</span>
                      </TooltipTrigger>
                      <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                        Your current claim minus what you net deposited, both priced at today&apos;s price — compounded
                        fees minus divergence drift, versus simply holding the tokens.
                        {pnlDelta0 !== undefined && pnlDelta1 !== undefined && (
                          <>
                            <br />
                            {cfg.token0.symbol}: {pnlDelta0 >= 0 ? "+" : ""}
                            {fmt(pnlDelta0, 4)} · {cfg.token1.symbol}: {pnlDelta1 >= 0 ? "+" : ""}
                            {fmt(pnlDelta1, 4)}
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div
                    className={`${farmSignedColor(pnl1) || "text-primary-foreground"} mt-0.5 break-all text-base font-medium tabular-nums`}
                  >
                    {pnl1 !== undefined ? `${pnl1 >= 0 ? "+" : ""}${fmtQuote(pnl1, cfg.token1.symbol)}` : "－"}
                  </div>
                </div>
                <div>
                  <span className={LABEL}>Vault share</span>
                  <div className="text-primary-foreground mt-0.5 break-all text-base font-medium tabular-nums">
                    {(v.myFrac * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <span className={LABEL}>Shares</span>
                  <div className="text-primary-foreground mt-0.5 break-all text-base font-medium tabular-nums">
                    {fmtAmt(v.myShares, d1)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Facts sidebar */}
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
          <FeesPanel />
          <VaultDetailsPanel cfg={cfg} lastAdjustment={v.lastAdjustment} />
        </div>
      </div>
    </div>
  );
}

type DepositPreview = { shares: bigint; take0: bigint; take1: bigint; fee0: bigint; fee1: bigint };
type WithdrawPreview = { out0: bigint; out1: bigint; shares: bigint };

const mockMintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [],
  },
] as const;

function ActionSheetContent({
  cfg,
  isCalm,
  refetch,
  myShares,
  totalSupply,
  vaultBal0,
  vaultBal1,
  initialMode,
}: {
  cfg: RangeVaultCfg;
  isCalm: boolean | undefined;
  refetch: () => void;
  myShares: bigint;
  totalSupply: bigint | undefined;
  vaultBal0: bigint | undefined;
  vaultBal1: bigint | undefined;
  initialMode: "deposit" | "withdraw";
}) {
  const { address: user } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [busy, guard] = useBusy();
  const vault = cfg.vault!;
  const d0 = cfg.token0.decimals;
  const d1 = cfg.token1.decimals;

  // Sheet content mounts fresh on every open, so state (inputs, previews, tx status) resets per open.
  const [mode, setMode] = useState<"deposit" | "withdraw">(initialMode);
  const [amt0, setAmt0] = useState("");
  const [amt1, setAmt1] = useState("");
  const [depPct, setDepPct] = useState<number | undefined>();
  const [pct, setPct] = useState<number | undefined>();
  const [depPreview, setDepPreview] = useState<DepositPreview | undefined>();
  const [wdPreview, setWdPreview] = useState<WithdrawPreview | undefined>();
  const [previewing, setPreviewing] = useState(false);
  const [txError, setTxError] = useState<string | undefined>();
  const [lastTx, setLastTx] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewSeq = useRef(0);

  const { data: walletData, refetch: refetchWallet } = useReadContracts({
    contracts: [
      {
        chainId: cfg.chainId,
        address: cfg.token0.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user ?? "0x0000000000000000000000000000000000000000"],
      },
      {
        chainId: cfg.chainId,
        address: cfg.token1.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user ?? "0x0000000000000000000000000000000000000000"],
      },
    ],
    query: { enabled: !!user },
  });
  const wallet0 = (walletData?.[0]?.result as bigint | undefined) ?? 0n;
  const wallet1 = (walletData?.[1]?.result as bigint | undefined) ?? 0n;
  // Shortfall hints only render once balances have actually loaded — never a false alarm on undefined.
  const walletLoaded = walletData?.[0]?.result !== undefined && walletData?.[1]?.result !== undefined;

  const parseAmt = (v: string, dec: number): bigint => {
    try {
      return parseUnits((v || "0").replace(/,/g, ""), dec);
    } catch {
      return 0n;
    }
  };

  // Monotonic sequence: only the latest preview request may write state (race guard).
  const schedulePreview = (a0: string, a1: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const seq = ++previewSeq.current;
    setDepPreview(undefined);
    setPreviewing(true);
    debounceRef.current = setTimeout(() => {
      // Refresh balances alongside the preview so the shortfall gate never judges fresh takes
      // against a stale wallet snapshot (external transfers between opens).
      void refetchWallet();
      void (async () => {
        try {
          const r = (await readContract(config, {
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "previewDeposit",
            args: [parseAmt(a0, d0), parseAmt(a1, d1)],
          })) as readonly [bigint, bigint, bigint, bigint, bigint];
          if (seq !== previewSeq.current) return;
          setDepPreview({ shares: r[0], take0: r[1], take1: r[2], fee0: r[3], fee1: r[4] });
        } catch {
          if (seq === previewSeq.current) setDepPreview(undefined);
        } finally {
          if (seq === previewSeq.current) setPreviewing(false);
        }
      })();
    }, 400);
  };

  // Deposit percentage: fill both inputs in the vault's current ratio, sized by the scarcer side.
  // Fill values are floored to 8 decimals — readable, and never above the computed amount.
  const trimDp = (s: string) => (s.includes(".") ? s.replace(/(\.\d{1,8})\d*$/, "$1").replace(/\.$/, "") : s);
  const applyDepositPct = (p: number) => {
    setDepPct(p);
    const { amt0: a0, amt1: a1 } = depositPctAmounts(p, wallet0, wallet1, vaultBal0 ?? 0n, vaultBal1 ?? 0n);
    const v0 = a0 > 0n ? trimDp(formatUnits(a0, d0)) : "";
    const v1 = a1 > 0n ? trimDp(formatUnits(a1, d1)) : "";
    setAmt0(v0);
    setAmt1(v1);
    schedulePreview(v0, v1);
  };

  const previewWithdrawPct = (p: number) => {
    setPct(p);
    const seq = ++previewSeq.current;
    setWdPreview(undefined);
    const shares = (myShares * BigInt(p)) / 100n;
    if (shares === 0n) return;
    setPreviewing(true);
    void (async () => {
      try {
        const r = (await readContract(config, {
          chainId: cfg.chainId,
          address: vault,
          abi: rangeVaultAbi,
          functionName: "previewWithdraw",
          args: [shares],
        })) as readonly [bigint, bigint];
        if (seq !== previewSeq.current) return;
        setWdPreview({ out0: r[0], out1: r[1], shares });
      } catch {
        if (seq === previewSeq.current) setWdPreview(undefined);
      } finally {
        if (seq === previewSeq.current) setPreviewing(false);
      }
    })();
  };

  useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), []);

  const approveIfNeeded = async (token: Address, need: bigint, label: string) => {
    if (need === 0n || !user) return true;
    const read = () =>
      readContract(config, {
        chainId: cfg.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user, vault],
      }).catch(() => 0n) as Promise<bigint>;
    if ((await read()) >= need) return true;
    const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: `Approve ${label}` }, () =>
      writeContractAsync({
        chainId: cfg.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, need],
      }),
    );
    if (!h) return false;
    for (let i = 0; i < 12; i++) {
      if ((await read()) >= need) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    setTxError("Approval not visible on the RPC yet — try again in a moment.");
    return false;
  };

  const doDeposit = () =>
    guard(async () => {
      if (!user || !depPreview) return;
      setTxError(undefined);
      try {
        if (!(await approveIfNeeded(cfg.token0.address, depPreview.take0, cfg.token0.symbol))) return;
        if (!(await approveIfNeeded(cfg.token1.address, depPreview.take1, cfg.token1.symbol))) return;
        const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: "Deposit" }, () =>
          writeContractAsync({
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "deposit",
            args: [depPreview.take0, depPreview.take1, (depPreview.shares * 99n) / 100n],
          }),
        );
        if (!h) return;
        recordAutoTx(cfg.chainId, vault);
        setLastTx(h);
        setAmt0("");
        setAmt1("");
        setDepPct(undefined);
        setDepPreview(undefined);
        refetch();
        void refetchWallet();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const doWithdraw = () =>
    guard(async () => {
      if (!user || !wdPreview || wdPreview.shares === 0n) return;
      setTxError(undefined);
      try {
        const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: "Withdraw" }, () =>
          writeContractAsync({
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "withdraw",
            args: [wdPreview.shares, (wdPreview.out0 * 99n) / 100n, (wdPreview.out1 * 99n) / 100n],
          }),
        );
        if (!h) return;
        recordAutoTx(cfg.chainId, vault);
        setLastTx(h);
        setPct(undefined);
        setWdPreview(undefined);
        refetch();
        void refetchWallet();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const doMintTest = () =>
    guard(async () => {
      if (!user) return;
      setTxError(undefined);
      try {
        for (const [t, amt, label] of [
          [cfg.token0.address, parseUnits("1", d0), cfg.token0.symbol],
          [cfg.token1.address, parseUnits("2500", d1), cfg.token1.symbol],
        ] as const) {
          const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: `Mint ${label}` }, () =>
            writeContractAsync({
              chainId: cfg.chainId,
              address: t,
              abi: mockMintAbi,
              functionName: "mint",
              args: [user, amt],
            }),
          );
          if (!h) return;
        }
        void refetchWallet();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const depositBlocked = mode === "deposit" && isCalm === false;
  // Per-side gap between what the vault will take and the wallet balance (SPEC §3.1 shortfall row).
  const shortfall =
    depPreview && walletLoaded ? depositShortfalls(depPreview.take0, depPreview.take1, wallet0, wallet1) : undefined;
  const hasShortfall = !!shortfall && (shortfall.short0 > 0n || shortfall.short1 > 0n);
  const takeSummary =
    depPreview && (depPreview.take0 > 0n || depPreview.take1 > 0n)
      ? [
          depPreview.take0 > 0n ? `${fmtAmt(depPreview.take0, d0)} ${cfg.token0.symbol}` : undefined,
          depPreview.take1 > 0n ? `${fmtAmt(depPreview.take1, d1)} ${cfg.token1.symbol}` : undefined,
        ]
          .filter(Boolean)
          .join(" + ")
      : undefined;
  const balancingFee = depPreview
    ? depPreview.fee0 > 0n
      ? `${fmtAmt(depPreview.fee0, d0)} ${cfg.token0.symbol}`
      : depPreview.fee1 > 0n
        ? `${fmtAmt(depPreview.fee1, d1)} ${cfg.token1.symbol}`
        : undefined
    : undefined;
  // Post-deposit total vault share: existing holdings + the new shares, over the new supply.
  const shareFrac =
    depPreview && totalSupply !== undefined && totalSupply + depPreview.shares > 0n
      ? (Number(myShares + depPreview.shares) / Number(totalSupply + depPreview.shares)) * 100
      : undefined;

  const ROW = "text-secondary-foreground flex items-center justify-between text-xs font-light";

  return (
    <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-scroll sm:w-[480px] sm:max-w-[480px]">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {cfg.pair}
          <span className="text-secondary-foreground rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
            V3 · {cfg.feeLabel}
          </span>
          <span className="text-morpho-brand rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">Auto LP</span>
        </SheetTitle>
        <SheetDescription>
          Deposit both tokens; the vault manages the range and compounds fees. Withdraw any time.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        {/* Mode tabs */}
        <div className="flex rounded-xl bg-white/[0.04] p-1">
          {(["deposit", "withdraw"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`grow rounded-lg py-2 text-sm capitalize transition-colors ${
                mode === m
                  ? "text-primary-foreground bg-white/[0.1]"
                  : "text-secondary-foreground hover:text-primary-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {!user ? (
          <p className="text-secondary-foreground rounded-xl bg-white/[0.04] p-4 text-xs">
            Connect a wallet to {mode === "deposit" ? "deposit" : "withdraw"}.
          </p>
        ) : mode === "deposit" ? (
          <>
            {depositBlocked && (
              <p className="rounded-xl bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-300">
                Spot price is away from the pool&apos;s 2-minute average right now. Deposits reopen automatically once
                it returns; withdrawals stay open.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-secondary-foreground text-xs">Fill in the vault&apos;s current ratio</span>
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={depPct === p ? "blue" : "secondary"}
                    className="grow rounded-full font-light tabular-nums"
                    disabled={busy || (wallet0 === 0n && wallet1 === 0n)}
                    onClick={() => applyDepositPct(p)}
                  >
                    {p === 100 ? "Max" : `${p}%`}
                  </Button>
                ))}
              </div>
            </div>
            {[
              ["0", cfg.token0, wallet0, amt0, setAmt0] as const,
              ["1", cfg.token1, wallet1, amt1, setAmt1] as const,
            ].map(([i, t, walletBal, val, setVal]) => (
              <label key={i} className="flex flex-col gap-1.5">
                <span className="text-secondary-foreground flex items-baseline justify-between text-xs">
                  <span className="font-medium">{t.symbol}</span>
                  <span className="font-light tabular-nums">
                    Balance: {fmtAmt(walletBal, t.decimals)}
                    <button
                      type="button"
                      className="text-morpho-brand ml-2 uppercase"
                      onClick={() => {
                        const v = formatUnits(walletBal, t.decimals);
                        setDepPct(undefined);
                        setVal(v);
                        schedulePreview(i === "0" ? v : amt0, i === "1" ? v : amt1);
                      }}
                    >
                      max
                    </button>
                  </span>
                </span>
                <input
                  className={INPUT}
                  placeholder="0.0"
                  inputMode="decimal"
                  value={val}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDepPct(undefined);
                    setVal(v);
                    schedulePreview(i === "0" ? v : amt0, i === "1" ? v : amt1);
                  }}
                />
              </label>
            ))}

            <div className="flex min-h-[64px] flex-col justify-center gap-1.5 rounded-xl bg-white/[0.04] p-3">
              {previewing ? (
                <span className="text-secondary-foreground flex items-center gap-2 text-xs">
                  <LoaderCircle className="size-3 animate-spin" /> calculating…
                </span>
              ) : takeSummary ? (
                <>
                  <div className={ROW}>
                    <span>Vault will take</span>
                    <span className="text-primary-foreground tabular-nums">{takeSummary}</span>
                  </div>
                  <div className={ROW}>
                    <span>You receive (est.)</span>
                    <span className="text-primary-foreground tabular-nums">
                      {fmtAmt(depPreview!.shares, d1)} shares
                      {shareFrac !== undefined ? ` · ${shareFrac.toFixed(2)}%` : ""}
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-secondary-foreground text-xs">Enter an amount to see the exact terms.</span>
              )}
            </div>

            {/* Shortfall hint: the vault would take more than the wallet holds (never blocks smaller deposits) */}
            {hasShortfall && !previewing && (
              <div className="flex flex-col gap-1 rounded-xl bg-yellow-500/10 p-3">
                {([[shortfall!.short0, cfg.token0, d0] as const, [shortfall!.short1, cfg.token1, d1] as const] as const)
                  .filter(([s]) => s > 0n)
                  .map(([s, t, dec]) => {
                    const link = cfg.testnet ? undefined : swapLinkFor(cfg.chainId, t.address);
                    return (
                      <span key={t.symbol} className="flex items-center justify-between text-xs text-yellow-300">
                        <span className="tabular-nums">
                          Need ~{fmtAmt(s, dec)} more {t.symbol}
                        </span>
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                            Get {t.symbol} ↗
                          </a>
                        )}
                      </span>
                    );
                  })}
                <span className="text-secondary-foreground text-[11px] font-light">
                  Or lower the amount — the % buttons fit your balance automatically.
                </span>
              </div>
            )}

            <Button
              className="rounded-full font-light"
              variant="blue"
              disabled={busy || depositBlocked || previewing || !depPreview || depPreview.shares === 0n || hasShortfall}
              onClick={() => void doDeposit()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : "Deposit"}
            </Button>
            {cfg.testnet && (
              <Button
                className="rounded-full font-light"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void doMintTest()}
              >
                Mint test tokens · 1 {cfg.token0.symbol} + 2,500 {cfg.token1.symbol}
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-secondary-foreground text-xs">
                Amount to withdraw · you hold {fmtAmt(myShares, d1)} shares
              </span>
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={pct === p ? "blue" : "secondary"}
                    className="grow rounded-full font-light tabular-nums"
                    disabled={busy || myShares === 0n}
                    onClick={() => previewWithdrawPct(p)}
                  >
                    {p === 100 ? "Max" : `${p}%`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex min-h-[52px] flex-col justify-center gap-1.5 rounded-xl bg-white/[0.04] p-3">
              {previewing ? (
                <span className="text-secondary-foreground flex items-center gap-2 text-xs">
                  <LoaderCircle className="size-3 animate-spin" /> calculating…
                </span>
              ) : wdPreview ? (
                <>
                  <div className={ROW}>
                    <span>You receive (est.)</span>
                    <span className="text-primary-foreground tabular-nums">
                      {fmtAmt(wdPreview.out0, d0)} {cfg.token0.symbol} + {fmtAmt(wdPreview.out1, d1)}{" "}
                      {cfg.token1.symbol}
                    </span>
                  </div>
                  <div className={ROW}>
                    <span>Burning</span>
                    <span className="tabular-nums">
                      {fmtAmt(wdPreview.shares, d1)} of {fmtAmt(myShares, d1)} shares
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-secondary-foreground text-xs">Pick a percentage of your position.</span>
              )}
            </div>

            <Button
              className="rounded-full font-light"
              variant="blue"
              disabled={busy || previewing || !wdPreview || wdPreview.shares === 0n || myShares === 0n}
              onClick={() => void doWithdraw()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : "Withdraw"}
            </Button>
          </>
        )}

        {/* Fee disclosure — mirrors the contract exactly */}
        <div className="flex flex-col gap-1 border-t border-white/[0.06] pt-3">
          <div className={ROW}>
            <span>Deposit fee</span>
            <span>0%</span>
          </div>
          <div className={ROW}>
            <span>Withdrawal fee</span>
            <span>0%</span>
          </div>
          <div className={ROW}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="underline decoration-dotted underline-offset-2">Performance fee</span>
                </TooltipTrigger>
                <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                  10% of earned trading fees, taken at harvest — never from principal. The Net APR shown already
                  accounts for it.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span>10% of yield</span>
          </div>
          {mode === "deposit" && balancingFee && (
            <div className={ROW}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="underline decoration-dotted underline-offset-2">Balancing fee (this deposit)</span>
                  </TooltipTrigger>
                  <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                    A one-sided deposit shifts the vault&apos;s token balance, so the filling side pays the pool&apos;s
                    swap fee — the same cost as trading into position yourself. Balanced deposits pay nothing.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="tabular-nums">{balancingFee}</span>
            </div>
          )}
          <p className="text-secondary-foreground text-[11px] font-light">
            Withdrawals are available in any market condition.
          </p>
        </div>

        {txError && <p className="text-xs text-red-400">{txError}</p>}
        {lastTx && (
          <a
            className="text-secondary-foreground text-xs underline"
            href={`${cfg.explorer}/tx/${lastTx}`}
            target="_blank"
            rel="noreferrer"
          >
            View last transaction ↗
          </a>
        )}
      </div>
    </SheetContent>
  );
}
