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

function fmt(x: number) {
  return x.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function PointsSubPage() {
  const { address: userAddress } = useAccount();
  const [data, setData] = useState<PointsData | null>(null);

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}points.json`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const me = userAddress ? data?.leaderboard.find((r) => r.address === userAddress.toLowerCase()) : undefined;
  const myRank = me ? data!.leaderboard.indexOf(me) + 1 : undefined;

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <div className="text-primary-foreground mx-auto w-full max-w-7xl px-2 pb-24 pt-10 lg:px-8">
        <h1 className="font-pixel text-3xl tracking-wide md:text-4xl">Points</h1>
        <p className="text-secondary-foreground mt-3 max-w-2xl font-light">
          Points reward the users who generate Solon&apos;s revenue: depositing into Solon vaults, and borrowing from
          markets those vaults fund — accrued as shares × time held, so wash loops earn nothing. The indexer is open
          source — recompute the whole board yourself.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="border-border bg-primary border p-4">
            <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">My points</div>
            <div className="mt-1 text-2xl">{me ? fmt(me.total) : userAddress ? "0" : "—"}</div>
            <div className="text-secondary-foreground text-xs">{myRank ? `rank #${myRank}` : "connect wallet"}</div>
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
              <TableHead className="text-secondary-foreground text-xs font-light">Supply</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Borrow</TableHead>
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
                  <TableCell className="rounded-r-lg">{fmt(row.total)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {data !== null && data.leaderboard.length === 0 && (
          <p className="text-secondary-foreground mt-6 font-light">
            Accrual begins at Solon vault genesis — no points have been earned yet. Activity on external markets does
            not earn points.
          </p>
        )}
        {data === null && (
          <p className="text-secondary-foreground mt-6 font-light">Points snapshot unavailable — try again shortly.</p>
        )}
      </div>
    </div>
  );
}
