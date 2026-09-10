import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { useModal } from "connectkit";
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

import { BADGE, LABEL, PANEL, fmtQuote } from "@/components/auto-vault-common";
import { FarmPositions } from "@/components/farm-positions";
import { useAutoNetContribution } from "@/hooks/use-auto-pnl";
import { useAutoPositionBasis } from "@/hooks/use-auto-position-basis";
import { useAutoVault } from "@/hooks/use-auto-vault";
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
        cur.mine === r.mine
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
  const totValue = sum((r) => r.value);
  const totBasis = sum((r) => r.atDeposit);
  const totYield = sum((r) => r.yieldUsd);
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

      {/* Overview (Auto LP totals — leverage positions carry no cost-basis feed yet) */}
      <div className={PANEL}>
        <span className={LABEL}>Auto LP · overview</span>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {overview("Total value", totValue)}
          {overview("At deposit", totBasis)}
          {overview("Yield", totYield, true)}
          {overview("vs HODL", totHodl, true)}
        </div>
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
    vsHodl = d0 * v.price + d1;
  }
  useEffect(() => {
    onRow(cfg.slug, { value, atDeposit, yieldUsd, vsHodl, mine });
  }, [cfg.slug, value, atDeposit, yieldUsd, vsHodl, mine, onRow]);
  return null;
}
