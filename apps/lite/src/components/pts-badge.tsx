import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@morpho-org/uikit/components/shadcn/tooltip";

/**
 * The same +PTS badge as the Morpho side (styling from apy-table-cell.tsx), used for farm and lending reserves.
 * Scoring matches points/farm_points.py: lending = shares x time, farm = principal debt (USDG-valued) x time.
 */
export function PtsBadge({ side }: { side: "supply" | "farm" }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="border-foreground/40 text-foreground/80 border px-1 py-px font-mono text-[10px] tracking-wider">
            +PTS
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-primary-foreground max-w-80 rounded-3xl p-4 shadow-2xl">
          <p>
            {side === "supply"
              ? "Points accrue as eToken balance × time held, converted to USDG-days. Moving in and out earns nothing extra."
              : "Points accrue as principal debt × time, in USDG-days. Accrued interest is not counted, so letting debt grow earns no points."}
          </p>
          <p className="pt-2">Accrual starts at mainnet genesis; the indexer is open source and replayable.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
