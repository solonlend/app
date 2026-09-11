import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { useModal } from "connectkit";
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

import { AutoPairIcons } from "@/components/auto-pair-icons";
import { BADGE, LABEL, PANEL, fmtQuote } from "@/components/auto-vault-common";
import { FarmPositions } from "@/components/farm-positions";
import { FarmRiskPanel } from "@/components/farm-risk-panel";
import { useAutoNetContribution } from "@/hooks/use-auto-pnl";
import { useAutoPositionBasis } from "@/hooks/use-auto-position-basis";
import { useAutoVault } from "@/hooks/use-auto-vault";
import { useBorrowRisk } from "@/hooks/use-borrow-risk";
import { useFarmBasis } from "@/hooks/use-farm-basis";
import { useFarmPositions } from "@/hooks/use-farm-positions";
import { isSyncing } from "@/lib/auto-sync-hint";
import { farmSignedColor } from "@/lib/farm-semantic-colors";
import { rangeVaultsForChain, type RangeVaultCfg } from "@/lib/solon-range";

/*
  Farm Portfolio — /farm/portfolio: everything the connected account holds across the two Farm
  products on this chain. Overview card totals the Auto LP side (value / at-deposit cost / yield /
  vs HODL — leverage carries no cost-basis feed yet, so it is listed but not totaled), then the
  Auto positions and the existing leveraged positions table.
*/

type Row = {
  value?: number;
  atDeposit?: number;
  yieldUsd?: number;
  vsHodl?: number;
  mine: boolean;
  /** Fully-exited history (SPEC §4 v1.8): lifetime realized P&L, shown as a CLOSED row. */
  closed?: boolean;
  realized?: number;
};

export function FarmPortfolio({
  chainId,
  onOpenVault,
}: {
  chainId: number | undefined;
  onOpenVault: (slug: string) => void;
}) {
  const { address: user } = useAccount();
  const { setOpen: openConnect } = useModal();
  const farm = useFarmPositions();
  const borrowRisk = useBorrowRisk();
  const levBasis = useFarmBasis(user);
  const cfgs = rangeVaultsForChain(chainId).filter((c) => c.vault !== undefined);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const report = useCallback((slug: string, r: Row) => {
    setRows((prev) => {
      const cur = prev[slug];
      if (
        cur &&
        cur.value === r.value &&
        cur.atDeposit === r.atDeposit &&
        cur.yieldUsd === r.yieldUsd &&
        cur.vsHodl === r.vsHodl &&
        cur.mine === r.mine &&
        cur.closed === r.closed &&
        cur.realized === r.realized
      )
        return prev;
      return { ...prev, [slug]: r };
    });
  }, []);

  const mine = cfgs.filter((c) => rows[c.slug]?.mine);
  const sum = (pick: (r: Row) => number | undefined) =>
    mine.reduce((acc: number | undefined, c) => {
      const x = pick(rows[c.slug]);
      if (x === undefined) return acc;
      return (acc ?? 0) + x;
    }, undefined);
  // Leverage fold (SPEC §4 v1.10 gap ②): equity from live positions, basis from the
  // lifetime feed. Either side missing → that term is left out (never guessed as 0).
  const levEquity = farm.positions.length > 0 ? farm.positions.reduce((a, p) => a + (p.value - p.debt), 0) : undefined;
  const levNet = levBasis !== undefined ? levBasis.lifetimeInUsd - levBasis.lifetimeOutUsd : undefined;
  const add = (a: number | undefined, b: number | undefined) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  const totValue = add(
    sum((r) => r.value),
    levEquity,
  );
  const totBasis = add(
    sum((r) => r.atDeposit),
    levNet,
  );
  const totYield = totValue !== undefined && totBasis !== undefined ? totValue - totBasis : undefined;
  const totHodl = sum((r) => r.vsHodl);

  const overview = (label: string, v: number | undefined, signed = false) => (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <span className={LABEL}>{label}</span>
      <div
        className={`${(signed ? farmSignedColor(v) : "") || "text-primary-foreground"} mt-1 break-all text-base font-medium tabular-nums`}
      >
        {v !== undefined ? `${signed && v >= 0 ? "+" : ""}${fmtQuote(v, "USD")}` : "－"}
      </div>
    </div>
  );

  if (!user) {
    // Disconnected: four dash cards carry zero information — show one guidance card instead
    // (SPEC §4 未连接态). The public Points board below stays visible.
    return (
      <div className="flex w-full max-w-7xl flex-col gap-4 px-2 lg:px-8">
        <div className={`${PANEL} flex flex-col items-start gap-3`}>
          <span className={LABEL}>Portfolio</span>
          <p className="text-secondary-foreground text-sm font-light">
            Connect a wallet to see your Auto LP value, cost basis, yield and leveraged positions on this chain.
          </p>
          <Button variant="blue" className="rounded-full px-6 font-light" onClick={() => openConnect(true)}>
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-7xl flex-col gap-4 px-2 lg:px-8">
      {/* data collectors — invisible, one per vault so hooks stay per-component */}
      {cfgs.map((cfg) => (
        <PortfolioProbe key={`${cfg.chainId}:${cfg.slug}`} cfg={cfg} onRow={report} />
      ))}

      {/* Risk first — the account page's primary duty on a platform with liquidation lines */}
      <FarmRiskPanel positions={farm.positions} lltv={farm.lltv} borrowRows={borrowRisk} />

      {/* Overview (Auto LP totals — leverage positions carry no cost-basis feed yet) */}
      <div className={PANEL}>
        <span className={LABEL}>Positions · overview</span>
        {cfgs.some((c) => c.vault && isSyncing(c.chainId, c.vault)) && (
          <p className="mt-2 rounded-xl bg-yellow-500/10 p-2 text-[11px] font-light text-yellow-300">
            Syncing your last transaction — cost basis and vs-HODL can lag a few minutes.
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {overview("Total value", totValue)}
          {overview("At deposit", totBasis)}
          {overview("Yield", totYield, true)}
          {overview("vs HODL", totHodl, true)}
        </div>
        <p className="text-secondary-foreground mt-2 text-[10px] font-light">
          Value / At deposit / Yield include leveraged positions (equity vs lifetime net invested); vs HODL is
          Auto-only.
        </p>
      </div>

      {/* Auto positions */}
      <div className={PANEL}>
        <span className={LABEL}>Auto LP · positions</span>
        {mine.length === 0 ? (
          <p className="text-secondary-foreground mt-2 text-xs font-light">
            No Auto LP positions on this chain yet — pick a vault on the Auto tab to start.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {mine.map((cfg) => {
              const r = rows[cfg.slug];
              return (
                <button
                  key={cfg.slug}
                  type="button"
                  onClick={() => onOpenVault(cfg.slug)}
                  className="grid grid-cols-2 items-center gap-x-6 gap-y-2 rounded-xl bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.08] md:grid-cols-[1.2fr_repeat(4,1fr)_24px]"
                >
                  <span className="col-span-2 flex items-center gap-2 md:col-span-1">
                    <AutoPairIcons cfg={cfg} />
                    <span className="text-primary-foreground text-base font-medium">{cfg.pair}</span>
                    <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · {cfg.feeLabel}</span>
                  </span>
                  <Cell label="Value" v={r.value} />
                  <Cell label="At deposit" v={r.atDeposit} />
                  <Cell label="Yield" v={r.yieldUsd} signed />
                  <Cell label="vs HODL" v={r.vsHodl} signed />
                  <span className="text-secondary-foreground hidden text-right md:block">→</span>
                </button>
              );
            })}
          </div>
        )}
        {cfgs.some((c) => rows[c.slug]?.closed) && (
          <div className="mt-2 flex flex-col gap-2">
            {cfgs
              .filter((c) => rows[c.slug]?.closed)
              .map((cfg) => {
                const r = rows[cfg.slug];
                return (
                  <button
                    key={`closed-${cfg.slug}`}
                    type="button"
                    onClick={() => onOpenVault(cfg.slug)}
                    className="grid grid-cols-2 items-center gap-x-6 gap-y-2 rounded-xl bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.06] md:grid-cols-[1.2fr_repeat(4,1fr)_24px]"
                  >
                    <span className="col-span-2 flex items-center gap-2 md:col-span-1">
                      <span className="text-secondary-foreground text-base font-medium">{cfg.pair}</span>
                      <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>CLOSED</span>
                    </span>
                    <Cell label="Realized" v={r.realized} signed />
                    <span className="hidden md:block" />
                    <span className="hidden md:block" />
                    <span className="hidden md:block" />
                    <span className="text-secondary-foreground hidden text-right md:block">→</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Leveraged positions — the existing table, embedded as-is (it brings its own heading
          and renders nothing when the account has no leveraged positions) */}
      <FarmPositions />
    </div>
  );
}

function Cell({ label, v, signed = false }: { label: string; v?: number; signed?: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className={`${LABEL} md:hidden`}>{label}</span>
      <span
        className={`${(signed ? farmSignedColor(v) : "") || "text-primary-foreground"} break-all text-sm font-medium tabular-nums`}
      >
        {v !== undefined ? `${signed && v >= 0 ? "+" : ""}${fmtQuote(v, "USD")}` : "－"}
      </span>
    </span>
  );
}

function PortfolioProbe({ cfg, onRow }: { cfg: RangeVaultCfg; onRow: (slug: string, r: Row) => void }) {
  const v = useAutoVault(cfg);
  const basis = useAutoPositionBasis(cfg, v.user);
  const { data: contribution } = useAutoNetContribution(cfg, v.user);

  const mine = v.myShares > 0n;
  const value = mine ? v.myValue1 : undefined;
  const atDeposit = mine ? basis?.costBasisUsd : undefined;
  const yieldUsd = value !== undefined && atDeposit !== undefined ? value - atDeposit : undefined;
  let vsHodl: number | undefined;
  if (mine && contribution && v.bal0 !== undefined && v.bal1 !== undefined && v.price !== undefined) {
    const d0 = v.bal0 * v.myFrac - Number(formatUnits(contribution.net0, cfg.token0.decimals));
    const d1 = v.bal1 * v.myFrac - Number(formatUnits(contribution.net1, cfg.token1.decimals));
    // Fold into the stable leg (SPEC §5 v1.7) — same USD semantics as the detail page.
    vsHodl = cfg.stableLeg === 1 ? d0 * v.price + d1 : d0 + d1 / v.price;
  }
  // Fully-exited history (SPEC §4 v1.8): no live shares, but the basis feed has a lifetime.
  const closed = !mine && basis !== undefined && (basis.lifetimeOutUsd ?? 0) > 0 && (basis.lifetimeInUsd ?? 0) > 0;
  const realized = closed ? (basis!.lifetimeOutUsd ?? 0) - (basis!.lifetimeInUsd ?? 0) : undefined;
  useEffect(() => {
    onRow(cfg.slug, { value, atDeposit, yieldUsd, vsHodl, mine, closed, realized });
  }, [cfg.slug, value, atDeposit, yieldUsd, vsHodl, mine, closed, realized, onRow]);
  return null;
}
