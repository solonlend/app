import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@morpho-org/uikit/components/shadcn/sheet";
import {
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Table,
} from "@morpho-org/uikit/components/shadcn/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@morpho-org/uikit/components/shadcn/tabs";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, useConfig, useReadContracts, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { FarmPauseBanner } from "@/components/farm-pause-banner";
import { PtsBadge } from "@/components/pts-badge";
import { useBusy } from "@/hooks/use-busy";
import { useFarmPaused } from "@/hooks/use-farm-paused";
import { RH_FARM_LENDING as P } from "@/lib/solon-farms";
import { runTx } from "@/lib/tx-toast";

/** Solon dual-reserve LendingPool (ExtraFi-style) — the funding side of the leveraged-LP farm. */
const LENDING = P.lending;

const lendingAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "reserveId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [{ name: "eTokenAmount", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "reserveId", type: "uint256" },
      { name: "eTokenAmount", type: "uint256" },
      { name: "to", type: "address" },
      { name: "receiveNativeETH", type: "bool" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getETokenAddress",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "exchangeRateOfReserve",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "utilizationRateOfReserve",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "borrowingRateOfReserve",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalLiquidityOfReserve",
    stateMutability: "view",
    inputs: [{ name: "reserveId", type: "uint256" }],
    outputs: [{ name: "totalLiquidity", type: "uint256" }],
  },
] as const;

const mockTokenAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

type ReserveCfg = {
  reserveId: bigint;
  name: string;
  symbol: string;
  underlying: `0x${string}`;
  decimals: number;
  mintAmount: string;
  role: string;
};

const RESERVES: ReserveCfg[] = [
  {
    reserveId: 1n,
    name: "Solon Lending · USDG",
    symbol: "USDG",
    underlying: P.usdg,
    decimals: 6,
    mintAmount: "10000",
    role: "funds the USDG leg of leveraged LP",
  },
  {
    reserveId: 2n,
    name: "Solon Lending · ETH",
    symbol: "WETH",
    underlying: P.weth,
    decimals: 18,
    mintAmount: "5",
    role: "funds the WETH leg of leveraged LP",
  },
];

function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}

function LendingSheet({
  r,
  eToken,
  exchangeRate,
  myShares,
  availableCash,
  refetch,
}: {
  r: ReserveCfg;
  eToken: `0x${string}` | undefined;
  exchangeRate: number;
  myShares: bigint;
  availableCash: bigint; // Unborrowed underlying tokens in the pool (the current withdrawal limit for lenders)
  refetch: () => void;
}) {
  const { address: user } = useAccount();
  const config = useConfig();
  const { paused, blocked, assertActive } = useFarmPaused();
  const { writeContractAsync, isPending } = useWriteContract();
  const [busy, guard] = useBusy();
  const [amount, setAmount] = useState("");
  // A receipt alone is insufficient: public RPC replicas serving estimates may not yet see it (STF still occurred in testing).
  // Poll until the allowance is readable before sending the second transaction; public RPC users face the same issue.
  const awaitAllowance = async (token: `0x${string}`, spender: `0x${string}`, need: bigint) => {
    for (let i = 0; i < 12; i++) {
      const cur = (await readContract(config, {
        chainId: P.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user!, spender],
      }).catch(() => 0n)) as bigint;
      if (cur >= need) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  };
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>();

  const myAssets = Number(formatUnits(myShares, r.decimals)) * exchangeRate;
  const availableNow = Math.min(myAssets, Number(formatUnits(availableCash, r.decimals)));

  const doMint = async () => {
    if (!user) return;
    setTxError(undefined);
    try {
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: `Mint ${r.symbol}` }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: r.underlying,
          abi: mockTokenAbi,
          functionName: "mint",
          args: [user, parseUnits(r.mintAmount, r.decimals)],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  const doDeposit = async () => {
    if (!user || !amount) return;
    setTxError(undefined);
    try {
      await assertActive();
      const _tx2 = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: `Approve ${r.symbol}` }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: r.underlying,
          abi: erc20Abi,
          functionName: "approve",
          args: [LENDING, parseUnits(amount, r.decimals)],
        }),
      );
      if (!_tx2) return;
      // runTx has awaited the approval receipt, but public RPC replicas serving estimates may lag; still poll until the allowance is readable.
      if (!(await awaitAllowance(r.underlying, LENDING, parseUnits(amount, r.decimals)))) {
        setTxError("Approval not visible on the RPC yet — try again in a moment.");
        return;
      }
      await assertActive();
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: `Deposit ${r.symbol}` }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: LENDING,
          abi: lendingAbi,
          functionName: "deposit",
          args: [r.reserveId, parseUnits(amount, r.decimals), user, 0],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  const [txError, setTxError] = useState<string | undefined>();
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const doWithdraw = async (all: boolean) => {
    if (!user || !eToken) return;
    setTxError(undefined);
    try {
      await assertActive();
      // partial: underlying → eToken shares via exchangeRate; cap at balance (redeem is share-denominated)
      let shares: bigint;
      if (all) {
        // Do not blindly pass max: borrowed assets cannot be withdrawn (contract error 3). Cap at the lower of owned shares and available pool funds.
        const cashShares =
          exchangeRate > 0
            ? parseUnits(
                ((Number(formatUnits(availableCash, r.decimals)) / exchangeRate) * 0.999).toFixed(r.decimals),
                r.decimals,
              )
            : 0n;
        shares = myShares < cashShares ? 2n ** 256n - 1n : cashShares;
      } else {
        const amt = Number(withdrawAmt) || 0;
        if (amt <= 0 || exchangeRate <= 0) return;
        const sharesFloat = amt / exchangeRate;
        shares = parseUnits(sharesFloat.toFixed(r.decimals), r.decimals);
        if (shares > myShares) shares = myShares;
      }
      const approveHash = await runTx(
        config,
        { chainId: P.chainId, explorer: P.explorer, label: `Approve ${r.symbol} shares` },
        () =>
          writeContractAsync({
            chainId: P.chainId,
            address: eToken,
            abi: erc20Abi,
            functionName: "approve",
            args: [LENDING, shares],
          }),
      );
      if (!approveHash) return;
      const allowOk = eToken
        ? await awaitAllowance(eToken, LENDING, shares === 2n ** 256n - 1n ? myShares : shares)
        : false;
      if (!allowOk) {
        setTxError("Approval not visible on the RPC yet — try again in a moment.");
        return;
      }
      await assertActive();
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: `Withdraw ${r.symbol}` }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: LENDING,
          abi: lendingAbi,
          functionName: "redeem",
          args: [r.reserveId, shares, user, false],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  return (
    <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-scroll sm:w-[480px] sm:max-w-[480px]">
      <SheetHeader>
        <SheetTitle>{r.name}</SheetTitle>
        <SheetDescription>
          Lend {r.symbol}, earn the interest leveraged farmers pay. Withdraw any time liquidity allows. Live on
          Robinhood Chain — scaled soft launch, small caps to start.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <FarmPauseBanner paused={paused} />
        <div className="bg-primary flex flex-col gap-2 rounded-2xl p-4">
          <div className="text-secondary-foreground flex items-center justify-between text-xs font-light">
            <span>My deposit</span>
            <span className="text-primary-foreground">
              {fmt(myAssets, r.decimals === 6 ? 2 : 4)} {r.symbol}
            </span>
          </div>
        </div>
        <Tabs defaultValue="Deposit">
          <TabsList className="w-full">
            <TabsTrigger value="Deposit" className="grow">
              Deposit
            </TabsTrigger>
            <TabsTrigger value="Withdraw" className="grow">
              Withdraw
            </TabsTrigger>
          </TabsList>
          <TabsContent value="Deposit" className="flex flex-col gap-3 pt-3">
            <div className="bg-primary flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-baseline gap-2">
                <input
                  className="text-primary-foreground grow bg-transparent text-2xl font-light outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="text-secondary-foreground text-xs">{r.symbol}</span>
              </div>
            </div>
            {P.testnet && (
              <Button
                className="h-9 w-full rounded-full text-xs"
                variant="secondary"
                disabled={isPending || busy}
                onClick={() => void guard(() => doMint())}
              >
                Get {r.mintAmount} test {r.symbol}
              </Button>
            )}
            <Button
              className="h-10 w-full rounded-full text-xs"
              variant="blue"
              disabled={isPending || busy || blocked || !amount}
              onClick={() => void guard(() => doDeposit())}
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Approve + Deposit
            </Button>
          </TabsContent>
          <TabsContent value="Withdraw" className="flex flex-col gap-3 pt-3">
            <div className="bg-primary flex flex-col gap-2 rounded-2xl p-4">
              <div className="text-secondary-foreground flex items-center justify-between text-xs font-light">
                <span>Available to withdraw now</span>
                <span className="text-primary-foreground">
                  {fmt(availableNow, r.decimals === 6 ? 2 : 4)} {r.symbol}
                </span>
              </div>
              {availableNow < myAssets - 0.01 && (
                <p className="text-secondary-foreground text-[11px] font-light">
                  The rest of your deposit is currently lent out to farmers. It frees up as they repay or get liquidated
                  — or you can withdraw the available part now.
                </p>
              )}
            </div>
            <div className="bg-primary flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-baseline gap-2">
                <input
                  className="text-primary-foreground grow bg-transparent text-2xl font-light outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="text-secondary-foreground text-xs">{r.symbol}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="h-10 grow rounded-full text-xs"
                variant="blue"
                disabled={isPending || busy || blocked || myShares === 0n || !withdrawAmt}
                onClick={() => void guard(() => doWithdraw(false))}
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Withdraw
              </Button>
              <Button
                className="h-10 grow rounded-full text-xs"
                variant="secondary"
                disabled={isPending || busy || blocked || myShares === 0n}
                onClick={() => void guard(() => doWithdraw(true))}
              >
                Withdraw all
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {txError && <p className="text-morpho-error text-[11px]">{txError}</p>}
        {lastTx && (
          <a
            className="text-secondary-foreground flex items-center justify-center gap-1 text-[11px] underline"
            href={`${P.explorer}/tx/${lastTx}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            View last transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </SheetContent>
  );
}

export function FarmLendingVaults() {
  const { paused } = useFarmPaused();
  const { address: user } = useAccount();

  const { data, refetch } = useReadContracts({
    contracts: RESERVES.flatMap((r) => [
      {
        chainId: P.chainId,
        address: LENDING,
        abi: lendingAbi,
        functionName: "totalLiquidityOfReserve" as const,
        args: [r.reserveId] as const,
      },
      {
        chainId: P.chainId,
        address: LENDING,
        abi: lendingAbi,
        functionName: "utilizationRateOfReserve" as const,
        args: [r.reserveId] as const,
      },
      {
        chainId: P.chainId,
        address: LENDING,
        abi: lendingAbi,
        functionName: "borrowingRateOfReserve" as const,
        args: [r.reserveId] as const,
      },
      {
        chainId: P.chainId,
        address: LENDING,
        abi: lendingAbi,
        functionName: "exchangeRateOfReserve" as const,
        args: [r.reserveId] as const,
      },
      {
        chainId: P.chainId,
        address: LENDING,
        abi: lendingAbi,
        functionName: "getETokenAddress" as const,
        args: [r.reserveId] as const,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]) as any,
    allowFailure: true,
    query: { staleTime: 30_000 },
  });

  const eTokens = RESERVES.map((_, i) => data?.[i * 5 + 4]?.result as `0x${string}` | undefined);

  const { data: shareData, refetch: refetchShares } = useReadContracts({
    contracts: RESERVES.map((_r, i) => ({
      chainId: P.chainId,
      address: eTokens[i] ?? "0x0000000000000000000000000000000000000000",
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [user ?? "0x0000000000000000000000000000000000000000"] as const,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any,
    allowFailure: true,
    query: { enabled: !!user && eTokens.every((e) => !!e), staleTime: 30_000 },
  });

  const { data: cashData, refetch: refetchCash } = useReadContracts({
    contracts: RESERVES.map((r, i) => ({
      chainId: P.chainId,
      address: r.underlying,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [eTokens[i] ?? "0x0000000000000000000000000000000000000000"] as const,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any,
    allowFailure: true,
    query: { enabled: eTokens.every((e) => !!e), staleTime: 30_000 },
  });

  const refetchAll = () => {
    void refetch();
    void refetchShares();
    void refetchCash();
  };

  return (
    <div className="text-primary-foreground w-full max-w-7xl px-2 lg:px-8">
      <div className="flex flex-col gap-1 px-2 pb-1 pt-8 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-sm font-light tracking-wide">Lending vaults · funding the farm</h2>
        <span className="text-secondary-foreground text-xs font-light">
          Lend a leg, earn what leveraged farmers pay
        </span>
      </div>
      <FarmPauseBanner paused={paused} />
      <div className="overflow-x-auto">
        <Table className="border-separate border-spacing-y-3">
          <TableHeader className="bg-primary">
            <TableRow>
              <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">Vault</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Deposits</TableHead>
              <TableHead className="text-secondary-foreground hidden text-xs font-light md:table-cell">
                Utilization
              </TableHead>
              <TableHead className="text-secondary-foreground hidden text-xs font-light md:table-cell">
                Borrow APR
              </TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Supply APY (est.)</TableHead>
              <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light">My deposit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RESERVES.map((r, i) => {
              const tvl = data?.[i * 5]?.result as bigint | undefined;
              const util = data?.[i * 5 + 1]?.result as bigint | undefined;
              const borrowRate = data?.[i * 5 + 2]?.result as bigint | undefined;
              const xr = data?.[i * 5 + 3]?.result as bigint | undefined;
              const utilN = util !== undefined ? Number(formatUnits(util, 18)) : undefined;
              const brN = borrowRate !== undefined ? Number(formatUnits(borrowRate, 18)) : undefined;
              const supplyApy = utilN !== undefined && brN !== undefined ? brN * utilN : undefined;
              const xrN = xr !== undefined ? Number(formatUnits(xr, 18)) : 1;
              const myShares = (shareData?.[i]?.result as bigint | undefined) ?? 0n;
              const myAssets = Number(formatUnits(myShares, r.decimals)) * xrN;
              return (
                <Sheet key={r.reserveId.toString()}>
                  <SheetTrigger asChild>
                    <TableRow className="bg-primary hover:bg-secondary">
                      <TableCell className="rounded-l-lg py-3 pl-4">
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-secondary-foreground whitespace-nowrap rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                                  Mainnet
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-primary-foreground max-w-80 rounded-3xl p-4 shadow-2xl">
                                <p>
                                  {r.role}. Reserve #{r.reserveId.toString()} of the Solon dual-reserve lending pool.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tvl !== undefined ? `${fmt(Number(formatUnits(tvl, r.decimals)))} ${r.symbol}` : "－"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {utilN !== undefined ? `${(utilN * 100).toFixed(1)}%` : "－"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {brN !== undefined ? `${(brN * 100).toFixed(2)}%` : "－"}
                      </TableCell>
                      <TableCell className="text-morpho-brand">
                        <div className="flex items-center gap-2">
                          {supplyApy !== undefined ? `${(supplyApy * 100).toFixed(2)}%` : "－"}
                          <PtsBadge side="supply" />
                        </div>
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        {myShares > 0n ? `${fmt(myAssets, r.decimals === 6 ? 2 : 4)} ${r.symbol}` : "－"}
                      </TableCell>
                    </TableRow>
                  </SheetTrigger>
                  <LendingSheet
                    r={r}
                    eToken={eTokens[i]}
                    exchangeRate={xrN}
                    myShares={myShares}
                    availableCash={(cashData?.[i]?.result as bigint | undefined) ?? 0n}
                    refetch={refetchAll}
                  />
                </Sheet>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
