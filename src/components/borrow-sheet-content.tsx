import { Button } from "./ui/button";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { Token } from "@/components/utils";
import { Address } from "viem";

export function BorrowSheetContent({
  marketId,
  marketParams,
  tokens,
}: {
  marketId: MarketId;
  marketParams: MarketParams;
  tokens: Map<Address, Token>;
}) {
  console.log(marketId, marketParams, tokens);
  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Edit profile</SheetTitle>
        <SheetDescription>Make changes to your profile here. Click save when you're done.</SheetDescription>
      </SheetHeader>
      <div className="h-72 w-full bg-red-500"></div>
      <SheetFooter>
        <SheetClose asChild>
          <Button type="submit">Save changes</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}
