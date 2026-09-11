import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-org/uikit/components/shadcn/table";
import { abbreviateAddress } from "@morpho-org/uikit/lib/utils";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { monogramURI } from "@/lib/monogram";

type PointsData = {
  generated_at: number;
  block: number;
  params: { supply_weight: number; borrow_weight: number; point_scale: string; markets: number };
  leaderboard: { address: string; supply_points: number; borrow_points: number; total: number }[];
};

// v2 board (SPEC §4 Points v2): revenue-attribution points, 1 pt = $1 realized revenue × K.
// v1 boards are frozen at meta.v1_freeze_block; the table shows v1 + v2 combined.
type PointsV2Data = {
  meta: { activation_block: number; v1_freeze_block: number; k: number; generated_at: number };
  byAddress: Record<string, { points: number; breakdown: Record<string, number> }>;
};

function fmt(x: number) {
  return x.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function PointsSection() {
  const { address: userAddress } = useAccount();
  // undefined = still loading, null = both sources failed
  const [data, setData] = useState<PointsData | null | undefined>(undefined);
  const [v2, setV2] = useState<PointsV2Data | null | undefined>(undefined);

  useEffect(() => {
    // Three boards: the two frozen v1 sources (points.json + data/farm-points.json, USDG-day
    // units) and the v2 revenue-attribution board (data/points-v2.json, USD units). v1 rows
    // merge by address as before; v2 adds a per-address revenue column on top.
    const grab = <T,>(url: string) =>
      fetch(url)
        .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
        .catch(() => null);
    void Promise.all([
      grab<PointsData>(`${import.meta.env.BASE_URL}points.json`),
      grab<PointsData>(`${import.meta.env.BASE_URL}data/farm-points.json`),
      grab<PointsV2Data>(`${import.meta.env.BASE_URL}data/points-v2.json`),
    ]).then(([base, farm, board2]) => {
      setV2(board2);
      if (!base && !farm) return setData(null);
      const byAddr = new Map<string, PointsData["leaderboard"][number]>();
      for (const src of [base, farm]) {
        for (const row of src?.leaderboard ?? []) {
          const key = row.address.toLowerCase();
          const cur = byAddr.get(key) ?? { address: key, supply_points: 0, borrow_points: 0, total: 0 };
          cur.supply_points += row.supply_points ?? 0;
          cur.borrow_points += row.borrow_points ?? 0;
          cur.total += row.total ?? 0;
          byAddr.set(key, cur);
        }
      }
      // v2-only addresses still deserve a row (first revenue before any frozen v1 history).
      for (const key of Object.keys(board2?.byAddress ?? {})) {
        if (!byAddr.has(key)) byAddr.set(key, { address: key, supply_points: 0, borrow_points: 0, total: 0 });
      }
      const v2pts = (a: string) => board2?.byAddress[a]?.points ?? 0;
      const leaderboard = [...byAddr.values()].sort(
        (a, b) => b.total + v2pts(b.address) - (a.total + v2pts(a.address)),
      );
      setData({
        generated_at: Math.max(base?.generated_at ?? 0, farm?.generated_at ?? 0),
        block: Math.max(base?.block ?? 0, farm?.block ?? 0),
        params: base?.params ??
          farm?.params ?? { supply_weight: 1, borrow_weight: 1, point_scale: "1 USDG-day", markets: 0 },
        leaderboard,
      });
    });
  }, []);

  const me = userAddress ? data?.leaderboard.find((r) => r.address === userAddress.toLowerCase()) : undefined;
  const myRank = me ? data!.leaderboard.indexOf(me) + 1 : undefined;
  const v2of = (a: string) => v2?.byAddress[a]?.points ?? 0;
  const myTotal = me ? me.total + v2of(me.address) : undefined;

  return (
    <div className="text-primary-foreground w-full">
      <h2 className="font-pixel text-2xl tracking-wide">Points</h2>
      <p className="text-secondary-foreground mt-3 max-w-2xl text-sm font-light">
        Points track the revenue you generate for Solon: 1 point = $1 of realized protocol revenue attributed to your
        address — performance fees your Auto LP shares produced, the protocol&apos;s cut of your leveraged-LP trading
        fees, and the fee share on the lending side. Lines whose revenue is still ramping accrue at their target fee
        rate on principal × time instead, and switch to realized revenue from an announced block. Liquidation penalties
        never earn points; wash loops earn nothing because points follow money actually paid. v1 points are frozen — the
        board shows v1 + v2 combined — and the indexer stays open source: recompute the whole board yourself.
      </p>
      {v2 && (
        <p className="text-secondary-foreground mt-2 text-xs font-light">
          v2 active since block {v2.meta.activation_block.toLocaleString("en-US")} · v1 frozen at the same block · K ={" "}
          {v2.meta.k}
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="border-border bg-primary border p-4">
          <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">My points</div>
          <div className="mt-1 text-2xl">{myTotal !== undefined ? fmt(myTotal) : userAddress ? "0" : "—"}</div>
          <div className="text-secondary-foreground text-xs">
            {myRank ? `rank #${myRank}` : userAddress ? "unranked" : "connect wallet"}
          </div>
        </div>
        <div className="border-border bg-primary border p-4">
          <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Participants</div>
          <div className="mt-1 text-2xl">{data ? data.leaderboard.length : "…"}</div>
          <div className="text-secondary-foreground text-xs">addresses with points</div>
        </div>
        <div className="border-border bg-primary border p-4">
          <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Markets</div>
          <div className="mt-1 text-2xl">{data ? data.params.markets : "…"}</div>
          <div className="text-secondary-foreground text-xs">curated stock/ETF → USDG</div>
        </div>
        <div className="border-border bg-primary border p-4">
          <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Updated</div>
          <div className="mt-1 text-2xl">
            {data ? new Date(data.generated_at * 1000).toISOString().slice(5, 16).replace("T", " ") : "…"}
          </div>
          <div className="text-secondary-foreground text-xs">{data ? `block ${data.block}` : ""}</div>
        </div>
      </div>

      <Table className="mt-8 border-separate border-spacing-y-3">
        <TableHeader className="bg-primary">
          <TableRow>
            <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">Rank</TableHead>
            <TableHead className="text-secondary-foreground text-xs font-light">Address</TableHead>
            <TableHead className="text-secondary-foreground text-xs font-light">Supply (v1)</TableHead>
            <TableHead className="text-secondary-foreground text-xs font-light">Borrow (v1)</TableHead>
            <TableHead className="text-secondary-foreground text-xs font-light">Revenue (v2)</TableHead>
            <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.leaderboard ?? []).slice(0, 100).map((row, i) => {
            const isMe = userAddress && row.address === userAddress.toLowerCase();
            return (
              <TableRow key={row.address} className={isMe ? "bg-secondary" : "bg-primary hover:bg-secondary"}>
                <TableCell className="rounded-l-lg py-3 pl-4">{i + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <img className="size-4" src={monogramURI(row.address.slice(2, 4))} />
                    {abbreviateAddress(row.address as `0x${string}`)}
                    {isMe && <span className="text-secondary-foreground text-xs">(you)</span>}
                  </div>
                </TableCell>
                <TableCell>{fmt(row.supply_points)}</TableCell>
                <TableCell>{fmt(row.borrow_points)}</TableCell>
                <TableCell>{fmt(v2of(row.address))}</TableCell>
                <TableCell className="rounded-r-lg">{fmt(row.total + v2of(row.address))}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {data != null && data.leaderboard.length === 0 && (
        <p className="text-secondary-foreground mt-6 font-light">
          Accrual begins at Solon vault genesis — no points have been earned yet. Activity on external markets does not
          earn points.
        </p>
      )}
      {data === null && (
        <p className="text-secondary-foreground mt-6 font-light">Points snapshot unavailable — try again shortly.</p>
      )}
    </div>
  );
}
