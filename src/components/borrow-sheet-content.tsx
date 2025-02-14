import { Button } from "./ui/button";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { AccrualPosition, IMarket, Market, MarketId, MarketParams, Position } from "@morpho-org/blue-sdk";
import { formatBalance, formatLtv, Token } from "@/lib/utils";
import { Address, extractChain } from "viem";
import { useAccount, useChainId, useChains, useReadContract } from "wagmi";
import { CircleArrowLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { getContractDeploymentInfo } from "./constants";
import { morphoAbi } from "@/assets/abis/morpho";
import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { oracleAbi } from "@/assets/abis/oracle";

enum Actions {
  SupplyCollateral = "Add",
  Repay = "Repay",
}

export function BorrowSheetContent({
  marketId,
  marketParams,
  imarket,
  tokens,
}: {
  marketId: MarketId;
  marketParams: MarketParams;
  imarket?: IMarket;
  tokens: Map<Address, Token>;
}) {
  const chainId = useChainId();
  const chains = useChains();
  const chain = extractChain({ chains, id: chainId });
  const { address: userAddress } = useAccount();

  const { data: positionRaw } = useReadContract({
    address: getContractDeploymentInfo(chainId, "Morpho").address,
    abi: morphoAbi,
    functionName: "position",
    args: userAddress ? [marketId, userAddress] : undefined,
    query: { staleTime: 10 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData },
  });

  const { data: price } = useReadContract({
    address: marketParams.oracle,
    abi: oracleAbi,
    functionName: "price",
    query: { staleTime: 1 * 60 * 1000, placeholderData: keepPreviousData, refetchInterval: 1 * 60 * 1000 },
  });

  const market = useMemo(
    () => (imarket && price !== undefined ? new Market({ ...imarket, price }) : undefined),
    [imarket, price],
  );

  const position = useMemo(
    () =>
      userAddress && positionRaw
        ? new Position({
            user: userAddress,
            marketId,
            supplyShares: positionRaw[0],
            borrowShares: positionRaw[1],
            collateral: positionRaw[2],
          })
        : undefined,
    [userAddress, marketId, positionRaw],
  );

  const accrualPosition = useMemo(
    () => (market && position ? new AccrualPosition(position, market) : undefined),
    [position, market],
  );

  const {
    symbol: collateralSymbol,
    decimals: collateralDecimals,
    imageSrc: collateralImgSrc,
  } = tokens.get(marketParams.collateralToken) ?? {};
  const { symbol: loanSymbol, decimals: loanDecimals, imageSrc: loanImgSrc } = tokens.get(marketParams.loanToken) ?? {};

  return (
    <SheetContent className="gap-3 overflow-y-scroll dark:bg-neutral-900">
      <SheetHeader>
        <SheetTitle>Your Position</SheetTitle>
        <SheetDescription>
          You can view your position here, and take actions that increase its health. To access all features (including
          borrowing) open this market in the{" "}
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
      <div className="bg-secondary mx-4 flex flex-col gap-4 rounded-2xl p-4">
        <div className="text-primary/70 flex items-center justify-between text-xs font-light">
          My collateral position {collateralSymbol ? `(${collateralSymbol})` : ""}
          <img className="rounded-full" height={16} width={16} src={collateralImgSrc} />
        </div>
        <p className="text-lg font-medium">
          {accrualPosition?.collateral && collateralDecimals !== undefined
            ? formatBalance(accrualPosition.collateral, collateralDecimals)
            : "－"}
        </p>
        <div className="text-primary/70 flex items-center justify-between text-xs font-light">
          My loan position {loanSymbol ? `(${loanSymbol})` : ""}
          <img className="rounded-full" height={16} width={16} src={loanImgSrc} />
        </div>
        <p className="text-lg font-medium">
          {accrualPosition?.borrowAssets && loanDecimals !== undefined
            ? formatBalance(accrualPosition.borrowAssets, loanDecimals)
            : "－"}
        </p>
        <div className="text-primary/70 flex items-center justify-between text-xs font-light">
          LTV / Liquidation LTV
        </div>
        <p className="text-lg font-medium">
          {accrualPosition?.ltv ? formatLtv(accrualPosition.ltv) : "－"} / {formatLtv(marketParams.lltv)}
        </p>
      </div>
      <Tabs defaultValue={Actions.SupplyCollateral} className="w-full gap-3 px-4">
        <TabsList className="grid w-full grid-cols-2 bg-transparent p-0">
          <TabsTrigger className="rounded-full" value={Actions.SupplyCollateral}>
            {Actions.SupplyCollateral}
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value={Actions.Repay}>
            {Actions.Repay}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={Actions.SupplyCollateral}>
          <div className="bg-secondary flex flex-col gap-4 rounded-2xl p-4">
            <div className="text-primary/70 flex items-center justify-between text-xs font-light">
              Supply Collateral {collateralSymbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={collateralImgSrc} />
            </div>
            <Input className="p-0 font-mono text-2xl font-bold" type="number" defaultValue="0" />
          </div>
          <Button className="text-md mt-3 h-12 w-full rounded-full font-light" variant="blue">
            Execute
          </Button>
        </TabsContent>
        <TabsContent value={Actions.Repay}>
          <div className="bg-secondary flex flex-col gap-4 rounded-2xl p-4">
            <div className="text-primary/70 flex items-center justify-between text-xs font-light">
              Repay Loan {loanSymbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={loanImgSrc} />
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
