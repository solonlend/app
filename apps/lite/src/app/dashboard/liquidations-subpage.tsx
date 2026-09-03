import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-org/uikit/components/shadcn/table";
import { abbreviateAddress } from "@morpho-org/uikit/lib/utils";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

type LiqData = {
  generated_at: number;
  block: number;
  totals: { count: number; repaid_usdg: number; bad_debt_usdg: number };
  events: {
    ts: number;
    block: number;
    tx: string;
    market: string;
    lltv: number;
    borrower: string;
    liquidator: string;
    repaid_usdg: number;
    seized: number;
    bad_debt_usdg: number;
  }[];
};

const EXPLORER = "https://robinhoodchain.blockscout.com";

function fmtTime(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export function LiquidationsSubPage() {
  const [data, setData] = useState<LiqData | null>(null);

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}liquidations.json`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <div className="text-primary-foreground mx-auto w-full max-w-7xl px-2 pb-24 pt-10 lg:px-8">
        <h1 className="font-pixel text-3xl tracking-wide md:text-4xl">Liquidations</h1>
        <p className="text-secondary-foreground mt-3 max-w-2xl font-light">
          The public ledger. Every liquidation on the curated markets, straight from on-chain Liquidate events — who was
          liquidated, who executed it, what was repaid and seized. Nothing hidden, nothing editable.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="border-border bg-primary border p-4">
            <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Liquidations</div>
            <div className="mt-1 text-2xl">{data ? data.totals.count : "…"}</div>
            <div className="text-secondary-foreground text-xs">all-time, curated markets</div>
          </div>
          <div className="border-border bg-primary border p-4">
            <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Debt repaid</div>
            <div className="mt-1 text-2xl">{data ? `$${data.totals.repaid_usdg.toLocaleString("en-US")}` : "…"}</div>
            <div className="text-secondary-foreground text-xs">USDG returned to lenders</div>
          </div>
          <div className="border-border bg-primary border p-4">
            <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Bad debt</div>
            <div className="mt-1 text-2xl">{data ? `$${data.totals.bad_debt_usdg.toLocaleString("en-US")}` : "…"}</div>
            <div className="text-secondary-foreground text-xs">unrecovered, all-time</div>
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
              <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">
                Time (UTC)
              </TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Market</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Borrower</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Liquidator</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Repaid</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Seized</TableHead>
              <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light">Tx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.events ?? []).map((ev) => (
              <TableRow key={ev.tx + ev.borrower} className="bg-primary hover:bg-secondary">
                <TableCell className="rounded-l-lg py-3 pl-4">{fmtTime(ev.ts)}</TableCell>
                <TableCell>
                  {ev.market}/USDG <span className="text-secondary-foreground text-xs">{ev.lltv}%</span>
                </TableCell>
                <TableCell>{abbreviateAddress(ev.borrower as `0x${string}`)}</TableCell>
                <TableCell>{abbreviateAddress(ev.liquidator as `0x${string}`)}</TableCell>
                <TableCell>{ev.repaid_usdg.toLocaleString("en-US")} USDG</TableCell>
                <TableCell>
                  {ev.seized.toLocaleString("en-US", { maximumFractionDigits: 4 })} {ev.market}
                </TableCell>
                <TableCell className="rounded-r-lg">
                  <a
                    href={`${EXPLORER}/tx/${ev.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1"
                  >
                    {ev.tx.slice(0, 8)}… <ExternalLink className="size-3" />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data && data.events.length === 0 && (
          <p className="text-secondary-foreground mt-6 font-light">No liquidations yet on the curated markets.</p>
        )}
        {data === null && (
          <p className="text-secondary-foreground mt-6 font-light">Ledger snapshot unavailable — try again shortly.</p>
        )}
      </div>
    </div>
  );
}
