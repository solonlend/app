import { useCallback, useEffect, useMemo, useState } from "react";

import { BADGE, LABEL, fmt } from "@/components/auto-vault-common";
import { AutoPairInfo } from "@/components/auto-vault-info";
import { useAutoVault } from "@/hooks/use-auto-vault";
import { farmSignedColor } from "@/lib/farm-semantic-colors";
import { rangeVaultsForChain, type RangeVaultCfg } from "@/lib/solon-range";

/*
  Auto LP landing: the vault directory (DESIGN-farm-tabs-v1 §E). One row per vault —
  pair | Net APR | Daily | TVL | My deposit — sortable, scannable in one screen. Everything
  else (range visual, breakdown, actions) lives on the detail page a row click opens.
  Undeployed vaults keep their row (COMING SOON) so the directory shows what's ahead.
*/

type RowStats = { tvl?: number; apr?: number; mine: boolean };
type SortKey = "apr" | "tvl";

/** Below this many vaults the filter row would be noise — hide it (doc §E). */
const FILTERS_FROM = 7;

export function AutoVaultList({ chainId, onOpen }: { chainId: number | undefined; onOpen: (slug: string) => void }) {
  const cfgs = rangeVaultsForChain(chainId);
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [stats, setStats] = useState<Record<string, RowStats>>({});

  const reportStats = useCallback((slug: string, s: RowStats) => {
    setStats((prev) => {
      const cur = prev[slug];
      if (cur && cur.tvl === s.tvl && cur.apr === s.apr && cur.mine === s.mine) return prev;
      return { ...prev, [slug]: s };
    });
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = cfgs.filter((c) => {
      if (q && !c.pair.toLowerCase().includes(q) && !c.slug.includes(q)) return false;
      if (onlyMine && !stats[c.slug]?.mine) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      // Missing data sorts last in BOTH directions.
      const missing = sortDesc ? -Infinity : Infinity;
      const va = stats[a.slug]?.[sortKey] ?? missing;
      const vb = stats[b.slug]?.[sortKey] ?? missing;
      return sortDesc ? vb - va : va - vb;
    });
  }, [cfgs, stats, sortKey, sortDesc, search, onlyMine]);

  const sortHeader = (key: SortKey, label: string) => (
    <button
      type="button"
      className={`${LABEL} flex items-center gap-1 text-left`}
      onClick={() => {
        if (sortKey === key) setSortDesc((d) => !d);
        else {
          setSortKey(key);
          setSortDesc(true);
        }
      }}
    >
      {label}
      <span className={sortKey === key ? "text-primary-foreground" : "opacity-30"}>{sortDesc ? "↓" : "↑"}</span>
    </button>
  );

  return (
    <div className="flex w-full max-w-7xl flex-col gap-3 px-2 lg:px-8">
      {cfgs.length >= FILTERS_FROM && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="bg-primary text-primary-foreground w-56 rounded-xl px-3 py-2 text-xs outline-none ring-1 ring-white/[0.06] focus:ring-white/20"
            placeholder="Search token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setOnlyMine((v) => !v)}
            className={`rounded-xl px-3 py-2 text-xs transition-colors ${
              onlyMine ? "text-primary-foreground bg-white/[0.1]" : "text-secondary-foreground bg-primary"
            }`}
          >
            My positions
          </button>
        </div>
      )}

      {/* Header — hidden on mobile where rows stack their own labels */}
      <div className="hidden grid-cols-[1.4fr_repeat(4,1fr)_24px] items-center gap-x-6 px-4 md:grid">
        <span className={LABEL}>Vault</span>
        {sortHeader("apr", "Net APR")}
        <span className={LABEL}>Daily</span>
        {sortHeader("tvl", "TVL")}
        <span className={LABEL}>My deposit</span>
        <span />
      </div>

      {rows.map((cfg) => (
        <AutoVaultRow key={`${cfg.chainId}:${cfg.slug}`} cfg={cfg} onOpen={onOpen} onStats={reportStats} />
      ))}
      {rows.length === 0 && (
        <p className="text-secondary-foreground bg-primary rounded-2xl p-4 text-xs">No vaults match.</p>
      )}
    </div>
  );
}

function AutoVaultRow({
  cfg,
  onOpen,
  onStats,
}: {
  cfg: RangeVaultCfg;
  onOpen: (slug: string) => void;
  onStats: (slug: string, s: RowStats) => void;
}) {
  const v = useAutoVault(cfg);
  // Undeployed rows sort by their pool-level numbers so the directory still orders sensibly.
  const sortTvl = v.tvl1 ?? v.poolTvlUsd;
  const { netApr, myShares } = v;
  useEffect(() => {
    onStats(cfg.slug, { tvl: sortTvl, apr: netApr, mine: myShares > 0n });
  }, [cfg.slug, sortTvl, netApr, myShares, onStats]);

  // Net APR is a directional yield metric — same signed color the leveraged table's Net APY uses.
  const cell = (label: string, value: string, colorClass = "", note?: string) => (
    <div className="flex flex-col gap-0.5">
      <span className={`${LABEL} md:hidden`}>{label}</span>
      <span
        className={`${colorClass || "text-primary-foreground"} ${colorClass ? "text-lg" : "text-base"} font-medium tabular-nums`}
      >
        {value}
      </span>
      {note && <span className="text-secondary-foreground text-[10px] font-light">{note}</span>}
    </div>
  );
  const poolNote = v.poolLevel ? "pool, pre-launch" : undefined;

  return (
    <button
      type="button"
      onClick={() => onOpen(cfg.slug)}
      className={`bg-primary grid grid-cols-2 items-center gap-x-6 gap-y-3 rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.08] md:grid-cols-[1.4fr_repeat(4,1fr)_24px] ${
        v.myShares > 0n ? "ring-1 ring-white/[0.12]" : ""
      }`}
    >
      <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
        <AutoPairInfo cfg={cfg}>
          <span className="flex items-center gap-2">
            <span className="text-primary-foreground text-base font-medium">{cfg.pair}</span>
            <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · {cfg.feeLabel}</span>
          </span>
        </AutoPairInfo>
        {cfg.testnet && <span className={`${BADGE} bg-yellow-500/15 text-yellow-300`}>TESTNET</span>}
        {v.deployed ? (
          v.price !== undefined &&
          v.lower !== undefined && (
            <span
              className={`${BADGE} ${v.inRange ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}
            >
              {v.inRange ? "IN RANGE" : "OUT OF RANGE"}
            </span>
          )
        ) : (
          <span className={`${BADGE} text-morpho-brand bg-white/[0.06]`}>COMING SOON</span>
        )}
      </div>
      {cell(
        "Net APR",
        v.netApr !== undefined ? `${(v.netApr * 100).toFixed(2)}%` : "－",
        farmSignedColor(v.netApr) || "text-primary-foreground",
        poolNote,
      )}
      {cell("Daily", v.netApr !== undefined ? `${((v.netApr / 365) * 100).toFixed(4)}%` : "－")}
      {cell(
        "TVL",
        v.tvl1 !== undefined
          ? `${fmt(v.tvl1)} ${cfg.token1.symbol}`
          : v.poolTvlUsd !== undefined
            ? `$${fmt(v.poolTvlUsd)}`
            : "－",
        "",
        poolNote,
      )}
      {cell(
        "My deposit",
        !v.user ? "－" : v.myShares > 0n && v.myValue1 !== undefined ? `${fmt(v.myValue1)} ${cfg.token1.symbol}` : "0",
      )}
      <span className="text-secondary-foreground hidden text-right md:block">→</span>
    </button>
  );
}
