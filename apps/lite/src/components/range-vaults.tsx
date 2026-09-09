import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@morpho-org/uikit/components/shadcn/sheet";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useConfig, useReadContracts, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { useBusy } from "@/hooks/use-busy";
import {
  RANGE_VAULTS,
  rangeVaultAbi,
  rangeStrategyAbi,
  rangePriceToHuman,
  type RangeVaultCfg,
} from "@/lib/solon-range";
import { runTx } from "@/lib/tx-toast";

/*
  Range Vaults (1x) — Solon CLM fork surface. Auto-managed concentrated liquidity: deposit both
  tokens, the strategy handles ranges/compounding; no leverage, no liquidation. Chain-driven:
  fully interactive where addresses exist (Sepolia rehearsal, RH after mainnet deploy), a
  coming-soon card otherwise.
*/

const CARD =
  "bg-primary hover:bg-secondary flex flex-col gap-3 rounded-2xl p-4 transition-colors duration-200 ease-in-out";
const ROW = "text-secondary-foreground flex items-center justify-between text-xs font-light";

function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}

const mockMintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [],
  },
] as const;

export function RangeVaults({ chainId }: { chainId: number | undefined }) {
  const cfg = RANGE_VAULTS.find((v) => v.chainId === chainId) ?? RANGE_VAULTS[0];
  return (
    <div className="flex w-full max-w-5xl flex-col gap-3 px-2 pt-10">
      <div className="flex items-baseline gap-3">
        <h2 className="text-primary-foreground text-lg font-medium">Range Vaults</h2>
        <span className="text-secondary-foreground text-xs">
          1x · auto-managed concentrated liquidity · no leverage, no liquidation
        </span>
      </div>
      {cfg.vault && cfg.strategy ? <RangeVaultCard cfg={cfg} /> : <ComingSoon cfg={cfg} />}
    </div>
  );
}

function ComingSoon({ cfg }: { cfg: RangeVaultCfg }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <span className="text-primary-foreground text-base">{cfg.pair}</span>
        <span className="text-secondary-foreground rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
          V3 · 0.01%
        </span>
        <span className="text-morpho-brand ml-auto rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
          COMING SOON
        </span>
      </div>
      <p className="text-secondary-foreground text-xs font-light">
        Deposit both tokens and the vault manages the range — resets it as price moves, compounds trading fees back in,
        and never swaps your principal. Contracts are complete and verified end-to-end on testnet; mainnet deployment is
        in final review.
      </p>
    </div>
  );
}

function RangeVaultCard({ cfg }: { cfg: RangeVaultCfg }) {
  const { address: user } = useAccount();
  const vault = cfg.vault!;
  const strategy = cfg.strategy!;

  const { data: vaultData, refetch: refetchVault } = useReadContracts({
    contracts: [
      { chainId: cfg.chainId, address: vault, abi: rangeVaultAbi, functionName: "balances" },
      { chainId: cfg.chainId, address: vault, abi: rangeVaultAbi, functionName: "totalSupply" },
      { chainId: cfg.chainId, address: vault, abi: rangeVaultAbi, functionName: "isCalm" },
      {
        chainId: cfg.chainId,
        address: vault,
        abi: rangeVaultAbi,
        functionName: "balanceOf",
        args: [user ?? "0x0000000000000000000000000000000000000000"],
      },
    ],
    query: { refetchInterval: 30_000 },
  });
  const { data: stratData, refetch: refetchStrat } = useReadContracts({
    contracts: [
      { chainId: cfg.chainId, address: strategy, abi: rangeStrategyAbi, functionName: "price" },
      { chainId: cfg.chainId, address: strategy, abi: rangeStrategyAbi, functionName: "range" },
    ],
    query: { refetchInterval: 30_000 },
  });
  const refetch = () => {
    void refetchVault();
    void refetchStrat();
  };

  const balances = vaultData?.[0]?.result as readonly [bigint, bigint] | undefined;
  const totalSupply = vaultData?.[1]?.result as bigint | undefined;
  const isCalm = vaultData?.[2]?.result as boolean | undefined;
  const myShares = (user ? (vaultData?.[3]?.result as bigint | undefined) : 0n) ?? 0n;
  const priceRaw = stratData?.[0]?.result as bigint | undefined;
  const range = stratData?.[1]?.result as readonly [bigint, bigint] | undefined;

  const d0 = cfg.token0.decimals;
  const d1 = cfg.token1.decimals;
  const price = priceRaw !== undefined ? rangePriceToHuman(priceRaw, d0, d1) : undefined;
  const lower = range ? rangePriceToHuman(range[0], d0, d1) : undefined;
  const upper = range ? rangePriceToHuman(range[1], d0, d1) : undefined;
  const inRange = price !== undefined && lower !== undefined && upper !== undefined && price >= lower && price <= upper;

  const bal0 = balances ? Number(formatUnits(balances[0], d0)) : undefined;
  const bal1 = balances ? Number(formatUnits(balances[1], d1)) : undefined;
  const tvl1 = bal0 !== undefined && bal1 !== undefined && price !== undefined ? bal0 * price + bal1 : undefined;

  const myFrac = totalSupply && totalSupply > 0n ? Number(myShares) / Number(totalSupply) : 0;
  const myValue1 = tvl1 !== undefined ? tvl1 * myFrac : undefined;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <span className="text-primary-foreground text-base">{cfg.pair}</span>
        <span className="text-secondary-foreground rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
          V3 · 0.01%
        </span>
        {cfg.testnet && (
          <span className="text-secondary-foreground rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
            TESTNET
          </span>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`ml-auto rounded-sm px-1.5 py-0.5 text-[10px] ${isCalm === false ? "bg-yellow-500/20 text-yellow-300" : "text-secondary-foreground bg-white/[0.06]"}`}
              >
                {isCalm === false ? "VOLATILE" : "CALM"}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
              Deposits and compounding only run while spot sits near the pool&apos;s 2-minute TWAP. Withdrawals are
              never gated.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] ${inRange ? "bg-emerald-500/15 text-emerald-300" : "text-secondary-foreground bg-white/[0.06]"}`}
        >
          {inRange ? "IN RANGE" : "OUT OF RANGE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
        <div className={ROW.replace("justify-between", "flex-col items-start gap-0.5")}>
          <span>TVL</span>
          <span className="text-primary-foreground text-sm">
            {tvl1 !== undefined ? `${fmt(tvl1)} ${cfg.token1.symbol}` : "－"}
          </span>
          <span>
            {bal0 !== undefined ? `${fmt(bal0, 4)} ${cfg.token0.symbol} + ${fmt(bal1!)} ${cfg.token1.symbol}` : ""}
          </span>
        </div>
        <div className={ROW.replace("justify-between", "flex-col items-start gap-0.5")}>
          <span>Price</span>
          <span className="text-primary-foreground text-sm">{price !== undefined ? fmt(price) : "－"}</span>
          <span>
            {cfg.token1.symbol} per {cfg.token0.symbol}
          </span>
        </div>
        <div className={ROW.replace("justify-between", "flex-col items-start gap-0.5")}>
          <span>Managed range</span>
          <span className="text-primary-foreground text-sm">
            {lower !== undefined ? `${fmt(lower)} – ${fmt(upper!)}` : "－"}
          </span>
          <span>auto-reset as price moves</span>
        </div>
        <div className={ROW.replace("justify-between", "flex-col items-start gap-0.5")}>
          <span>My position</span>
          <span className="text-primary-foreground text-sm">
            {myValue1 !== undefined && myShares > 0n ? `${fmt(myValue1)} ${cfg.token1.symbol}` : "－"}
          </span>
          <span>{myShares > 0n ? `${(myFrac * 100).toFixed(2)}% of vault` : "no deposit yet"}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <RangeSheet cfg={cfg} mode="deposit" isCalm={isCalm} refetch={refetch} myShares={myShares} />
        <RangeSheet cfg={cfg} mode="withdraw" isCalm={isCalm} refetch={refetch} myShares={myShares} />
      </div>
    </div>
  );
}

function RangeSheet({
  cfg,
  mode,
  isCalm,
  refetch,
  myShares,
}: {
  cfg: RangeVaultCfg;
  mode: "deposit" | "withdraw";
  isCalm: boolean | undefined;
  refetch: () => void;
  myShares: bigint;
}) {
  const { address: user } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [busy, guard] = useBusy();
  const vault = cfg.vault!;
  const d0 = cfg.token0.decimals;
  const d1 = cfg.token1.decimals;

  const [amt0, setAmt0] = useState("");
  const [amt1, setAmt1] = useState("");
  const [shares, setShares] = useState("");
  const [preview, setPreview] = useState<
    | { shares: bigint; take0: bigint; take1: bigint; fee0: bigint; fee1: bigint }
    | { out0: bigint; out1: bigint }
    | undefined
  >();
  const [txError, setTxError] = useState<string | undefined>();
  const [lastTx, setLastTx] = useState<string | undefined>();

  const doPreview = async (a0: string, a1: string, sh: string) => {
    try {
      if (mode === "deposit") {
        const r = (await readContract(config, {
          chainId: cfg.chainId,
          address: vault,
          abi: rangeVaultAbi,
          functionName: "previewDeposit",
          args: [parseUnits(a0 || "0", d0), parseUnits(a1 || "0", d1)],
        })) as readonly [bigint, bigint, bigint, bigint, bigint];
        setPreview({ shares: r[0], take0: r[1], take1: r[2], fee0: r[3], fee1: r[4] });
      } else {
        const s = parseUnits(sh || "0", 6);
        if (s === 0n) return setPreview(undefined);
        const r = (await readContract(config, {
          chainId: cfg.chainId,
          address: vault,
          abi: rangeVaultAbi,
          functionName: "previewWithdraw",
          args: [s > myShares ? myShares : s],
        })) as readonly [bigint, bigint];
        setPreview({ out0: r[0], out1: r[1] });
      }
    } catch {
      setPreview(undefined);
    }
  };

  const approveIfNeeded = async (token: Address, need: bigint, label: string) => {
    if (need === 0n || !user) return true;
    const cur = (await readContract(config, {
      chainId: cfg.chainId,
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [user, vault],
    }).catch(() => 0n)) as bigint;
    if (cur >= need) return true;
    const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: `Approve ${label}` }, () =>
      writeContractAsync({
        chainId: cfg.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, need],
      }),
    );
    if (!h) return false;
    for (let i = 0; i < 12; i++) {
      const now = (await readContract(config, {
        chainId: cfg.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user, vault],
      }).catch(() => 0n)) as bigint;
      if (now >= need) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    setTxError("Approval not visible on the RPC yet — try again in a moment.");
    return false;
  };

  const doDeposit = () =>
    guard(async () => {
      if (!user || !preview || !("take0" in preview)) return;
      setTxError(undefined);
      try {
        if (!(await approveIfNeeded(cfg.token0.address, preview.take0, cfg.token0.symbol))) return;
        if (!(await approveIfNeeded(cfg.token1.address, preview.take1, cfg.token1.symbol))) return;
        const minShares = (preview.shares * 99n) / 100n;
        const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: "Deposit" }, () =>
          writeContractAsync({
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "deposit",
            args: [preview.take0, preview.take1, minShares],
          }),
        );
        if (!h) return;
        setLastTx(h);
        refetch();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const doWithdraw = (all: boolean) =>
    guard(async () => {
      if (!user) return;
      setTxError(undefined);
      try {
        const s = all
          ? myShares
          : (() => {
              const p = parseUnits(shares || "0", 6);
              return p > myShares ? myShares : p;
            })();
        if (s === 0n) return;
        const pv = (await readContract(config, {
          chainId: cfg.chainId,
          address: vault,
          abi: rangeVaultAbi,
          functionName: "previewWithdraw",
          args: [s],
        })) as readonly [bigint, bigint];
        const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: "Withdraw" }, () =>
          writeContractAsync({
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "withdraw",
            args: [s, (pv[0] * 99n) / 100n, (pv[1] * 99n) / 100n],
          }),
        );
        if (!h) return;
        setLastTx(h);
        refetch();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const doMintTest = () =>
    guard(async () => {
      if (!user) return;
      setTxError(undefined);
      try {
        for (const [t, amt, label] of [
          [cfg.token0.address, parseUnits("1", d0), cfg.token0.symbol],
          [cfg.token1.address, parseUnits("2500", d1), cfg.token1.symbol],
        ] as const) {
          const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: `Mint ${label}` }, () =>
            writeContractAsync({
              chainId: cfg.chainId,
              address: t,
              abi: mockMintAbi,
              functionName: "mint",
              args: [user, amt],
            }),
          );
          if (!h) return;
        }
        refetch();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const depositBlocked = mode === "deposit" && isCalm === false;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className="rounded-full font-light"
          variant={mode === "deposit" ? "blue" : "secondary"}
          size="sm"
          disabled={mode === "withdraw" && myShares === 0n}
        >
          {mode === "deposit" ? "Deposit" : "Withdraw"}
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-scroll sm:w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>
            {mode === "deposit" ? "Deposit" : "Withdraw"} · {cfg.pair}
          </SheetTitle>
          <SheetDescription>
            {mode === "deposit"
              ? "Enter what you have of each token — the vault takes only what fits its current balance ratio (preview shows the exact take and any one-sided entry fee)."
              : "Burn vault shares for your proportional amount of both tokens. Withdrawals are never gated by market conditions."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          {mode === "deposit" ? (
            <>
              {depositBlocked && (
                <p className="rounded-xl bg-yellow-500/10 p-3 text-xs text-yellow-300">
                  Pool is volatile right now (spot is away from the 2-minute TWAP). Deposits resume automatically once
                  it settles.
                </p>
              )}
              {(["0", "1"] as const).map((i) => {
                const t = i === "0" ? cfg.token0 : cfg.token1;
                const val = i === "0" ? amt0 : amt1;
                return (
                  <label key={i} className="flex flex-col gap-1 text-xs">
                    <span className="text-secondary-foreground">{t.symbol}</span>
                    <input
                      className="bg-primary text-primary-foreground rounded-xl p-3 text-sm outline-none"
                      placeholder="0.0"
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (i === "0") setAmt0(v);
                        else setAmt1(v);
                        void doPreview(i === "0" ? v : amt0, i === "1" ? v : amt1, shares);
                      }}
                    />
                  </label>
                );
              })}
              {preview && "take0" in preview && (preview.take0 > 0n || preview.take1 > 0n) && (
                <div className="text-secondary-foreground flex flex-col gap-1 text-xs">
                  <div className={ROW}>
                    <span>Vault takes</span>
                    <span className="text-primary-foreground">
                      {formatUnits(preview.take0, d0)} {cfg.token0.symbol} + {formatUnits(preview.take1, d1)}{" "}
                      {cfg.token1.symbol}
                    </span>
                  </div>
                  {(preview.fee0 > 0n || preview.fee1 > 0n) && (
                    <div className={ROW}>
                      <span>One-sided entry fee</span>
                      <span>
                        {preview.fee0 > 0n
                          ? `${formatUnits(preview.fee0, d0)} ${cfg.token0.symbol}`
                          : `${formatUnits(preview.fee1, d1)} ${cfg.token1.symbol}`}
                      </span>
                    </div>
                  )}
                  <div className={ROW}>
                    <span>Expected shares</span>
                    <span className="text-primary-foreground">{formatUnits(preview.shares, 6)}</span>
                  </div>
                </div>
              )}
              <Button
                className="rounded-full font-light"
                variant="blue"
                disabled={busy || depositBlocked || !preview || !("shares" in preview) || preview.shares === 0n}
                onClick={() => void doDeposit()}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : "Deposit"}
              </Button>
              {cfg.testnet && (
                <Button
                  className="rounded-full font-light"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void doMintTest()}
                >
                  Mint test tokens (1 {cfg.token0.symbol} + 2500 {cfg.token1.symbol})
                </Button>
              )}
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-secondary-foreground">Shares (you hold {formatUnits(myShares, 6)})</span>
                <input
                  className="bg-primary text-primary-foreground rounded-xl p-3 text-sm outline-none"
                  placeholder="0.0"
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => {
                    setShares(e.target.value);
                    void doPreview(amt0, amt1, e.target.value);
                  }}
                />
              </label>
              {preview && "out0" in preview && (
                <div className={ROW}>
                  <span>You receive ≈</span>
                  <span className="text-primary-foreground">
                    {formatUnits(preview.out0, d0)} {cfg.token0.symbol} + {formatUnits(preview.out1, d1)}{" "}
                    {cfg.token1.symbol}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="grow rounded-full font-light"
                  variant="blue"
                  disabled={busy || myShares === 0n}
                  onClick={() => void doWithdraw(false)}
                >
                  {busy ? <LoaderCircle className="animate-spin" /> : "Withdraw"}
                </Button>
                <Button
                  className="rounded-full font-light"
                  variant="secondary"
                  disabled={busy || myShares === 0n}
                  onClick={() => void doWithdraw(true)}
                >
                  Max
                </Button>
              </div>
            </>
          )}
          {txError && <p className="text-xs text-red-400">{txError}</p>}
          {lastTx && (
            <a
              className="text-secondary-foreground text-xs underline"
              href={`${cfg.explorer}/tx/${lastTx}`}
              target="_blank"
              rel="noreferrer"
            >
              View last transaction
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
