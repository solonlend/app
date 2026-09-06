import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@morpho-org/uikit/components/shadcn/tooltip";

/**
 * 与 Morpho 侧同一枚 +PTS 徽标(样式沿用 apy-table-cell.tsx),用于 farm 与出借储备。
 * 计分口径与 points/farm_points.py 一一对应:出借=份额×时间,farm=本金债务(USDG 计价)×时间。
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
