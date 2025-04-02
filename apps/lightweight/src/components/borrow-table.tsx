import { Avatar, AvatarFallback, AvatarImage } from "@morpho-blue-offchain-public/uikit/components/shadcn/avatar";
import { Sheet, SheetTrigger } from "@morpho-blue-offchain-public/uikit/components/shadcn/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/table";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/tooltip";
import { formatLtv, formatBalanceWithSymbol, formatApy, Token } from "@morpho-blue-offchain-public/uikit/lib/utils";
import { Market } from "@morpho-org/blue-sdk";
import { blo } from "blo";
import { Info, Eye } from "lucide-react";
import { type Address } from "viem";

import { BorrowSheetContent } from "@/components/borrow-sheet-content";

function TokenTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-4 w-4 rounded-sm">
        <AvatarImage src={imageSrc} alt="Avatar" />
        <AvatarFallback delayMs={1000}>
          <img src={blo(address)} />
        </AvatarFallback>
      </Avatar>
      {symbol ?? "－"}
      <span className="text-primary/30 font-mono">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
    </div>
  );
}

export function BorrowTable({
  markets,
  tokens,
  positions,
  refetchPositions,
}: {
  markets: Market[];
  tokens: Map<Address, Token>;
  positions: { supplyShares: bigint; borrowShares: bigint; collateral: bigint }[] | undefined;
  refetchPositions: () => void;
}) {
  return (
    <Table className="border-separate border-spacing-y-3">
      <TableHeader className="bg-secondary">
        <TableRow>
          <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
          <TableHead className="text-primary text-xs font-light">Loan</TableHead>
          <TableHead className="text-primary text-xs font-light">LLTV</TableHead>
          <TableHead className="text-primary text-xs font-light">Position</TableHead>
          <TableHead className="text-primary text-xs font-light">
            <div className="flex items-center gap-1">
              Liquidity
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 font-mono shadow-2xl">
                    This value will be smaller than that of the full app. It doesn't include shared market liquidity
                    which could be reallocated upon borrow.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </TableHead>
          <TableHead className="text-primary rounded-r-lg text-xs font-light">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {markets.map((market, idx) => (
          <Sheet
            key={market.id}
            onOpenChange={(isOpen) => {
              // Refetch positions on sidesheet close, since user may have sent txns to modify one
              if (!isOpen) void refetchPositions();
            }}
          >
            <SheetTrigger asChild>
              <TableRow className="bg-secondary">
                <TableCell className="rounded-l-lg p-5">
                  <TokenTableCell {...tokens.get(market.params.collateralToken)!} />
                </TableCell>
                <TableCell>
                  <TokenTableCell {...tokens.get(market.params.loanToken)!} />
                </TableCell>
                <TableCell>{formatLtv(market.params.lltv)}</TableCell>
                <TableCell>
                  {
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Eye className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 font-mono shadow-2xl">
                          <h3>Collateral</h3>
                          <p>
                            {positions && tokens.get(market.params.collateralToken)?.decimals !== undefined
                              ? formatBalanceWithSymbol(
                                  positions[idx].collateral,
                                  tokens.get(market.params.collateralToken)!.decimals!,
                                  tokens.get(market.params.collateralToken)!.symbol,
                                  5,
                                  true,
                                )
                              : "－"}
                          </p>
                          <h3 className="pt-3">Borrows</h3>
                          <p>
                            {positions && tokens.get(market.params.loanToken)?.decimals !== undefined
                              ? formatBalanceWithSymbol(
                                  market.toBorrowAssets(positions[idx].borrowShares),
                                  tokens.get(market.params.loanToken)!.decimals!,
                                  tokens.get(market.params.loanToken)!.symbol,
                                  5,
                                  true,
                                )
                              : "－"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  }
                </TableCell>
                <TableCell>
                  {markets && tokens.get(market.params.loanToken)?.decimals !== undefined
                    ? formatBalanceWithSymbol(
                        market.liquidity,
                        tokens.get(market.params.loanToken)!.decimals!,
                        tokens.get(market.params.loanToken)!.symbol,
                        5,
                        true,
                      )
                    : "－"}
                </TableCell>
                <TableCell className="rounded-r-lg">
                  {market.borrowApy ? `${formatApy(market.borrowApy)}` : "－"}
                </TableCell>
              </TableRow>
            </SheetTrigger>
            <BorrowSheetContent marketId={market.id} marketParams={market.params} imarket={market} tokens={tokens} />
          </Sheet>
        ))}
      </TableBody>
    </Table>
  );
}
