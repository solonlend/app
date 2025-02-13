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
import { Address, extractChain } from "viem";
import { useChainId, useChains } from "wagmi";
import { CircleArrowLeft } from "lucide-react";

export function BorrowSheetContent({
  marketId,
  marketParams,
  tokens,
}: {
  marketId: MarketId;
  marketParams: MarketParams;
  tokens: Map<Address, Token>;
}) {
  const chainId = useChainId();
  const chains = useChains();
  const chain = extractChain({ chains, id: chainId });

  console.log(marketId, marketParams, tokens);
  return (
    <SheetContent className="dark:bg-neutral-900">
      <SheetHeader>
        <SheetTitle>Your Position</SheetTitle>
        <SheetDescription>
          You can view and manage your position here, or open this market in the{" "}
          <a
            className="underline"
            href={`https://app.morpho.org/${chain.name.toLowerCase()}/market/${marketId}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            full app.
          </a>
        </SheetDescription>
      </SheetHeader>
      <div className="h-72 w-full bg-red-500"></div>
      <SheetFooter>
        <SheetClose asChild>
          <Button type="submit">
            <CircleArrowLeft />
            Back to list
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}
