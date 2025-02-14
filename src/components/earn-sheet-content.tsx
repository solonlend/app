import { Button } from "./ui/button";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { formatBalance, Token } from "@/lib/utils";
import { Address, erc4626Abi, extractChain } from "viem";
import { useAccount, useChainId, useChains, useReadContract } from "wagmi";
import { CircleArrowLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { keepPreviousData } from "@tanstack/react-query";

enum Actions {
  Deposit = "Deposit",
  Withdraw = "Withdraw",
}

export function EarnSheetContent({ vaultAddress, asset }: { vaultAddress: Address; asset: Token }) {
  const chainId = useChainId();
  const chains = useChains();
  const chain = extractChain({ chains, id: chainId });
  const { address: userAddress } = useAccount();

  const { data: maxWithdraw } = useReadContract({
    address: vaultAddress,
    abi: erc4626Abi,
    functionName: "maxWithdraw",
    args: [userAddress ?? "0x"],
    query: { enabled: !!userAddress, staleTime: 10 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData },
  });

  return (
    <SheetContent className="gap-3 overflow-y-scroll dark:bg-neutral-900">
      <SheetHeader>
        <SheetTitle>Your Position</SheetTitle>
        <SheetDescription>
          You can view your position here, and take actions that increase its health. To access all features (including
          borrowing) open this market in the{" "}
          <a
            className="underline"
            href={`https://app.morpho.org/${chain.name.toLowerCase()}/vault/${vaultAddress}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            full app.
          </a>
        </SheetDescription>
      </SheetHeader>
      <div className="bg-secondary mx-4 flex flex-col gap-4 rounded-2xl p-4">
        <div className="text-primary/70 flex items-center justify-between text-xs font-light">
          My position {asset.symbol ? `(${asset.symbol})` : ""}
          <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />
        </div>
        <p className="text-lg font-medium">
          {maxWithdraw && asset.decimals !== undefined ? formatBalance(maxWithdraw, asset.decimals) : "－"}
        </p>
      </div>
      <Tabs defaultValue={Actions.Deposit} className="w-full gap-3 px-4">
        <TabsList className="grid w-full grid-cols-2 bg-transparent p-0">
          <TabsTrigger className="rounded-full" value={Actions.Deposit}>
            {Actions.Deposit}
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value={Actions.Withdraw}>
            {Actions.Withdraw}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={Actions.Deposit}>
          <div className="bg-secondary flex flex-col gap-4 rounded-2xl p-4">
            <div className="text-primary/70 flex items-center justify-between text-xs font-light">
              Deposit {asset.symbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />
            </div>
            <Input className="p-0 font-mono text-2xl font-bold" type="number" defaultValue="0" />
          </div>
          <Button className="text-md mt-3 h-12 w-full rounded-full font-light" variant="blue">
            Execute
          </Button>
        </TabsContent>
        <TabsContent value={Actions.Withdraw}>
          <div className="bg-secondary flex flex-col gap-4 rounded-2xl p-4">
            <div className="text-primary/70 flex items-center justify-between text-xs font-light">
              Withdraw {asset.symbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />
            </div>
            <Input className="p-0 font-mono text-2xl font-bold" type="number" defaultValue="0" />
          </div>
          <Button className="text-md mt-3 h-12 w-full rounded-full font-light" variant="blue">
            Execute
          </Button>
        </TabsContent>
      </Tabs>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="text-md h-12 w-full rounded-full font-light" type="submit">
            <CircleArrowLeft />
            Back to list
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}
