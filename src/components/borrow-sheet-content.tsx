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
import { Address, erc20Abi, extractChain, parseUnits } from "viem";
import { useAccount, useChainId, useChains, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { CircleArrowLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getContractDeploymentInfo } from "./constants";
import { morphoAbi } from "@/assets/abis/morpho";
import { keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { oracleAbi } from "@/assets/abis/oracle";
import { TokenAmountInput } from "./token-amount-input";

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
  const { writeContract } = useWriteContract();

  const [selectedTab, setSelectedTab] = useState(Actions.SupplyCollateral);
  const [textInputValue, setTextInputValue] = useState("");

  const morpho = getContractDeploymentInfo(chainId, "Morpho").address;

  const { data: positionRaw } = useReadContract({
    address: morpho,
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

  const { data: allowances, refetch: refetchAllowances } = useReadContracts({
    contracts: [
      {
        address: marketParams.collateralToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress ?? "0x", morpho],
      },
      {
        address: marketParams.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress ?? "0x", morpho],
      },
    ],
    allowFailure: false,
    query: { enabled: !!userAddress, staleTime: 5_000, gcTime: 5_000 },
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

  const { token, inputValue } = useMemo(() => {
    const token = tokens.get(marketParams[selectedTab === Actions.SupplyCollateral ? "collateralToken" : "loanToken"]);
    return {
      token,
      inputValue: token?.decimals !== undefined ? parseUnits(textInputValue, token.decimals) : undefined,
    };
  }, [textInputValue, selectedTab, tokens, marketParams]);

  const approvalTxnConfig =
    token !== undefined &&
    inputValue !== undefined &&
    allowances !== undefined &&
    allowances[selectedTab === Actions.SupplyCollateral ? 0 : 1] < inputValue
      ? ({
          address: token.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [morpho, inputValue],
        } as const satisfies Parameters<typeof writeContract>[0])
      : undefined;

  const supplyCollateralTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "supplyCollateral",
          args: [{ ...marketParams }, inputValue, userAddress, "0x"],
        } as const satisfies Parameters<typeof writeContract>[0])
      : undefined;

  const repayTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "repay",
          args: [{ ...marketParams }, inputValue, 0n, userAddress, "0x"],
        } as const satisfies Parameters<typeof writeContract>[0])
      : undefined;

  const {
    symbol: collateralSymbol,
    decimals: collateralDecimals,
    imageSrc: collateralImgSrc,
  } = tokens.get(marketParams.collateralToken) ?? {};
  const { symbol: loanSymbol, decimals: loanDecimals, imageSrc: loanImgSrc } = tokens.get(marketParams.loanToken) ?? {};

  return (
    <SheetContent className="z-[9999] gap-3 overflow-y-scroll dark:bg-neutral-900">
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
      <Tabs
        defaultValue={Actions.SupplyCollateral}
        className="w-full gap-3 px-4"
        onValueChange={(value) => {
          setSelectedTab(value as Actions);
          setTextInputValue("");
        }}
      >
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
            <TokenAmountInput decimals={token?.decimals} value={textInputValue} onChange={setTextInputValue} />
          </div>
          <Button
            className="text-md mt-3 h-12 w-full rounded-full font-light"
            variant="blue"
            onClick={() => {
              if (approvalTxnConfig) {
                writeContract(approvalTxnConfig, {
                  onSettled(txnHash, err) {
                    console.log(txnHash, err);
                    refetchAllowances();
                  },
                });
              } else if (supplyCollateralTxnConfig) {
                writeContract(supplyCollateralTxnConfig);
              }
            }}
            disabled={inputValue === 0n}
          >
            {approvalTxnConfig ? "Approve" : "Execute"}
          </Button>
        </TabsContent>
        <TabsContent value={Actions.Repay}>
          <div className="bg-secondary flex flex-col gap-4 rounded-2xl p-4">
            <div className="text-primary/70 flex items-center justify-between text-xs font-light">
              Repay Loan {loanSymbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={loanImgSrc} />
            </div>
            <TokenAmountInput decimals={token?.decimals} value={textInputValue} onChange={setTextInputValue} />
          </div>
          <Button
            className="text-md mt-3 h-12 w-full rounded-full font-light"
            variant="blue"
            onClick={() => {
              if (approvalTxnConfig) {
                writeContract(approvalTxnConfig, {
                  onSettled(txnHash, err) {
                    console.log(txnHash, err);
                    refetchAllowances();
                  },
                });
              } else if (repayTxnConfig) {
                writeContract(repayTxnConfig);
              }
            }}
            disabled={inputValue === 0n}
          >
            {approvalTxnConfig ? "Approve" : "Execute"}
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
