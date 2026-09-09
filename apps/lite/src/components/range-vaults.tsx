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
import { useEffect, useRef, useState } from "react";
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

const CARD = "bg-primary flex flex-col rounded-2xl p-5 transition-colors duration-200 ease-in-out";
const BADGE = "rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-wide";
const INPUT =
  "bg-primary text-primary-foreground rounded-xl p-3 text-sm outline-none ring-1 ring-white/[0.06] focus:ring-white/20 w-full tabular-nums";

function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}
/** Token amount for display: enough precision to be useful, no 18-decimal noise. */
function fmtAmt(raw: bigint, decimals: number): string {
  const n = Number(formatUnits(raw, decimals));
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return fmt(n, n < 1 ? 4 : 2);
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
  // Section heading lives on the Farm tab bar now (DESIGN-farm-tabs-v1) — this renders the card only.
  return (
    <div className="flex w-full max-w-7xl flex-col gap-3 px-2 lg:px-8">
      {cfg.vault && cfg.strategy ? <RangeVaultCard cfg={cfg} /> : <ComingSoon cfg={cfg} />}
    </div>
  );
}

function ComingSoon({ cfg }: { cfg: RangeVaultCfg }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <span className="text-primary-foreground text-base font-medium">{cfg.pair}</span>
        <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · 0.01%</span>
        <span className={`${BADGE} text-morpho-brand ml-auto bg-white/[0.06]`}>COMING SOON</span>
      </div>
      <p className="text-secondary-foreground mt-3 max-w-3xl text-xs font-light leading-relaxed">
        Deposit both tokens and walk away: the vault sets the range, resets it as price moves, and compounds trading
        fees back into the position. Your principal is never swapped. Contracts are complete and verified end-to-end on
        a live testnet — mainnet deployment is in final review.
      </p>
    </div>
  );
}

/** One aligned stat cell: fixed three-line structure so columns share a baseline. */
function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-secondary-foreground font-mono text-[10px] uppercase tracking-wider">{label}</span>
      <span className={`text-primary-foreground text-sm font-medium tabular-nums ${valueClass ?? ""}`}>{value}</span>
      <span className="text-secondary-foreground text-[11px] font-light tabular-nums">{sub}</span>
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
      {/* Header: identity left, status right */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-primary-foreground text-base font-medium">{cfg.pair}</span>
        <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · 0.01%</span>
        {cfg.testnet && <span className={`${BADGE} bg-yellow-500/15 text-yellow-300`}>TESTNET</span>}
        <div className="ml-auto flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`${BADGE} ${isCalm === false ? "bg-yellow-500/20 text-yellow-300" : "bg-emerald-500/15 text-emerald-300"}`}
                >
                  {isCalm === false ? "VOLATILE" : "CALM"}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                Deposits and fee compounding run only while spot price sits near the pool&apos;s 2-minute average — this
                blocks price-manipulation entries. Withdrawals are never gated.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`${BADGE} ${inRange ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}
                >
                  {inRange ? "IN RANGE" : "OUT OF RANGE"}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                {inRange
                  ? "The position brackets the current price and is earning trading fees."
                  : "Price has left the managed range; the keeper re-centers it once the market is calm. No losses are realized by waiting."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Stats: aligned three-line cells */}
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
        <Stat
          label="TVL"
          value={tvl1 !== undefined ? `${fmt(tvl1)} ${cfg.token1.symbol}` : "－"}
          sub={
            balances
              ? `${fmtAmt(balances[0], d0)} ${cfg.token0.symbol} + ${fmtAmt(balances[1], d1)} ${cfg.token1.symbol}`
              : "loading…"
          }
        />
        <Stat
          label="Pool price"
          value={price !== undefined ? fmt(price) : "－"}
          sub={`${cfg.token1.symbol} per ${cfg.token0.symbol}`}
        />
        <Stat
          label="Managed range"
          value={lower !== undefined ? `${fmt(lower)} – ${fmt(upper!)}` : "－"}
          sub="auto re-centered by the keeper"
        />
        <Stat
          label="My position"
          value={!user ? "－" : myShares > 0n && myValue1 !== undefined ? `${fmt(myValue1)} ${cfg.token1.symbol}` : "0"}
          sub={
            !user
              ? "connect wallet to view"
              : myShares > 0n
                ? `${(myFrac * 100).toFixed(2)}% of the vault`
                : "no deposit yet"
          }
        />
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2 border-t border-white/[0.06] pt-4">
        <RangeSheet
          cfg={cfg}
          mode="deposit"
          isCalm={isCalm}
          refetch={refetch}
          myShares={myShares}
          totalSupply={totalSupply}
        />
        <RangeSheet
          cfg={cfg}
          mode="withdraw"
          isCalm={isCalm}
          refetch={refetch}
          myShares={myShares}
          totalSupply={totalSupply}
        />
        <span className="text-secondary-foreground ml-auto hidden text-[11px] font-light sm:block">
          10% performance fee on earned trading fees — nothing on principal
        </span>
      </div>
    </div>
  );
}

type DepositPreview = { shares: bigint; take0: bigint; take1: bigint; fee0: bigint; fee1: bigint };
type WithdrawPreview = { out0: bigint; out1: bigint; shares: bigint };

function RangeSheet({
  cfg,
  mode,
  isCalm,
  refetch,
  myShares,
  totalSupply,
}: {
  cfg: RangeVaultCfg;
  mode: "deposit" | "withdraw";
  isCalm: boolean | undefined;
  refetch: () => void;
  myShares: bigint;
  totalSupply: bigint | undefined;
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
  const [pct, setPct] = useState<number | undefined>();
  const [depPreview, setDepPreview] = useState<DepositPreview | undefined>();
  const [wdPreview, setWdPreview] = useState<WithdrawPreview | undefined>();
  const [previewing, setPreviewing] = useState(false);
  const [txError, setTxError] = useState<string | undefined>();
  const [lastTx, setLastTx] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Wallet balances for the deposit form (MAX buttons + "you have" hints).
  const { data: walletData, refetch: refetchWallet } = useReadContracts({
    contracts: [
      {
        chainId: cfg.chainId,
        address: cfg.token0.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user ?? "0x0000000000000000000000000000000000000000"],
      },
      {
        chainId: cfg.chainId,
        address: cfg.token1.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user ?? "0x0000000000000000000000000000000000000000"],
      },
    ],
    query: { enabled: !!user && mode === "deposit" },
  });
  const wallet0 = (walletData?.[0]?.result as bigint | undefined) ?? 0n;
  const wallet1 = (walletData?.[1]?.result as bigint | undefined) ?? 0n;

  const parseAmt = (v: string, dec: number): bigint => {
    try {
      return parseUnits((v || "0").replace(/,/g, ""), dec);
    } catch {
      return 0n;
    }
  };

  const schedulePreview = (a0: string, a1: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewing(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const r = (await readContract(config, {
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "previewDeposit",
            args: [parseAmt(a0, d0), parseAmt(a1, d1)],
          })) as readonly [bigint, bigint, bigint, bigint, bigint];
          setDepPreview({ shares: r[0], take0: r[1], take1: r[2], fee0: r[3], fee1: r[4] });
        } catch {
          setDepPreview(undefined);
        } finally {
          setPreviewing(false);
        }
      })();
    }, 400);
  };

  const previewWithdrawPct = (p: number) => {
    setPct(p);
    const shares = (myShares * BigInt(p)) / 100n;
    if (shares === 0n) return setWdPreview(undefined);
    setPreviewing(true);
    void (async () => {
      try {
        const r = (await readContract(config, {
          chainId: cfg.chainId,
          address: vault,
          abi: rangeVaultAbi,
          functionName: "previewWithdraw",
          args: [shares],
        })) as readonly [bigint, bigint];
        setWdPreview({ out0: r[0], out1: r[1], shares });
      } catch {
        setWdPreview(undefined);
      } finally {
        setPreviewing(false);
      }
    })();
  };

  useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), []);

  const approveIfNeeded = async (token: Address, need: bigint, label: string) => {
    if (need === 0n || !user) return true;
    const read = () =>
      readContract(config, {
        chainId: cfg.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user, vault],
      }).catch(() => 0n) as Promise<bigint>;
    if ((await read()) >= need) return true;
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
      if ((await read()) >= need) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    setTxError("Approval not visible on the RPC yet — try again in a moment.");
    return false;
  };

  const doDeposit = () =>
    guard(async () => {
      if (!user || !depPreview) return;
      setTxError(undefined);
      try {
        if (!(await approveIfNeeded(cfg.token0.address, depPreview.take0, cfg.token0.symbol))) return;
        if (!(await approveIfNeeded(cfg.token1.address, depPreview.take1, cfg.token1.symbol))) return;
        const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: "Deposit" }, () =>
          writeContractAsync({
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "deposit",
            args: [depPreview.take0, depPreview.take1, (depPreview.shares * 99n) / 100n],
          }),
        );
        if (!h) return;
        setLastTx(h);
        setAmt0("");
        setAmt1("");
        setDepPreview(undefined);
        refetch();
        void refetchWallet();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const doWithdraw = () =>
    guard(async () => {
      if (!user || !wdPreview || wdPreview.shares === 0n) return;
      setTxError(undefined);
      try {
        const h = await runTx(config, { chainId: cfg.chainId, explorer: cfg.explorer, label: "Withdraw" }, () =>
          writeContractAsync({
            chainId: cfg.chainId,
            address: vault,
            abi: rangeVaultAbi,
            functionName: "withdraw",
            args: [wdPreview.shares, (wdPreview.out0 * 99n) / 100n, (wdPreview.out1 * 99n) / 100n],
          }),
        );
        if (!h) return;
        setLastTx(h);
        setPct(undefined);
        setWdPreview(undefined);
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
        void refetchWallet();
      } catch (e) {
        setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
      }
    });

  const depositBlocked = mode === "deposit" && isCalm === false;
  const takeSummary =
    depPreview && (depPreview.take0 > 0n || depPreview.take1 > 0n)
      ? [
          depPreview.take0 > 0n ? `${fmtAmt(depPreview.take0, d0)} ${cfg.token0.symbol}` : undefined,
          depPreview.take1 > 0n ? `${fmtAmt(depPreview.take1, d1)} ${cfg.token1.symbol}` : undefined,
        ]
          .filter(Boolean)
          .join(" + ")
      : undefined;
  const feeAmt = depPreview
    ? depPreview.fee0 > 0n
      ? `${fmtAmt(depPreview.fee0, d0)} ${cfg.token0.symbol}`
      : depPreview.fee1 > 0n
        ? `${fmtAmt(depPreview.fee1, d1)} ${cfg.token1.symbol}`
        : undefined
    : undefined;
  const shareFrac =
    depPreview && totalSupply !== undefined && totalSupply + depPreview.shares > 0n
      ? (Number(depPreview.shares) / Number(totalSupply + depPreview.shares)) * 100
      : undefined;

  const ROW = "text-secondary-foreground flex items-center justify-between text-xs font-light";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className="rounded-full px-5 font-light"
          variant={mode === "deposit" ? "blue" : "secondary"}
          size="sm"
          disabled={mode === "withdraw" && myShares === 0n}
        >
          {mode === "deposit" ? "Deposit" : "Withdraw"}
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-background z-[9999] w-full gap-4 overflow-y-scroll sm:w-[440px] sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>
            {mode === "deposit" ? "Deposit" : "Withdraw"} · {cfg.pair}
          </SheetTitle>
          <SheetDescription>
            {mode === "deposit"
              ? "Enter what you'd like to add. The vault takes only what fits its current balance — anything above that stays in your wallet."
              : "Choose how much of your position to exit. You receive both tokens in the vault's current proportion."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {!user ? (
            <p className="text-secondary-foreground rounded-xl bg-white/[0.04] p-4 text-xs">
              Connect a wallet to {mode === "deposit" ? "deposit" : "withdraw"}.
            </p>
          ) : mode === "deposit" ? (
            <>
              {depositBlocked && (
                <p className="rounded-xl bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-300">
                  The pool is moving right now (price is away from its 2-minute average). Deposits resume automatically
                  once it settles — usually minutes.
                </p>
              )}
              {[
                ["0", cfg.token0, wallet0, amt0, setAmt0] as const,
                ["1", cfg.token1, wallet1, amt1, setAmt1] as const,
              ].map(([i, t, walletBal, val, setVal]) => (
                <label key={i} className="flex flex-col gap-1.5">
                  <span className="text-secondary-foreground flex items-baseline justify-between text-xs">
                    <span className="font-medium">{t.symbol}</span>
                    <span className="font-light tabular-nums">
                      Balance: {fmtAmt(walletBal, t.decimals)}
                      <button
                        type="button"
                        className="text-morpho-brand ml-2 uppercase"
                        onClick={() => {
                          const v = formatUnits(walletBal, t.decimals);
                          setVal(v);
                          schedulePreview(i === "0" ? v : amt0, i === "1" ? v : amt1);
                        }}
                      >
                        max
                      </button>
                    </span>
                  </span>
                  <input
                    className={INPUT}
                    placeholder="0.0"
                    inputMode="decimal"
                    value={val}
                    onChange={(e) => {
                      const v = e.target.value;
                      setVal(v);
                      schedulePreview(i === "0" ? v : amt0, i === "1" ? v : amt1);
                    }}
                  />
                </label>
              ))}

              <div className="flex min-h-[72px] flex-col justify-center gap-1.5 rounded-xl bg-white/[0.04] p-3">
                {previewing ? (
                  <span className="text-secondary-foreground flex items-center gap-2 text-xs">
                    <LoaderCircle className="size-3 animate-spin" /> calculating…
                  </span>
                ) : takeSummary ? (
                  <>
                    <div className={ROW}>
                      <span>Vault will take</span>
                      <span className="text-primary-foreground tabular-nums">{takeSummary}</span>
                    </div>
                    {feeAmt && (
                      <div className={ROW}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="underline decoration-dotted underline-offset-2">Balancing fee</span>
                            </TooltipTrigger>
                            <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                              A one-sided deposit shifts the vault&apos;s token balance, so the filling side pays the
                              pool&apos;s swap fee — the same cost as trading into position yourself. Balanced deposits
                              pay nothing.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="tabular-nums">{feeAmt}</span>
                      </div>
                    )}
                    <div className={ROW}>
                      <span>You receive (est.)</span>
                      <span className="text-primary-foreground tabular-nums">
                        {fmtAmt(depPreview!.shares, d1)} shares
                        {shareFrac !== undefined ? ` · ${shareFrac.toFixed(2)}% of vault` : ""}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-secondary-foreground text-xs">Enter an amount to see the exact terms.</span>
                )}
              </div>

              <Button
                className="rounded-full font-light"
                variant="blue"
                disabled={busy || depositBlocked || previewing || !depPreview || depPreview.shares === 0n}
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
                  Mint test tokens · 1 {cfg.token0.symbol} + 2,500 {cfg.token1.symbol}
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-secondary-foreground text-xs">Amount to withdraw</span>
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={pct === p ? "blue" : "secondary"}
                      className="grow rounded-full font-light tabular-nums"
                      disabled={busy || myShares === 0n}
                      onClick={() => previewWithdrawPct(p)}
                    >
                      {p === 100 ? "Max" : `${p}%`}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex min-h-[56px] flex-col justify-center gap-1.5 rounded-xl bg-white/[0.04] p-3">
                {previewing ? (
                  <span className="text-secondary-foreground flex items-center gap-2 text-xs">
                    <LoaderCircle className="size-3 animate-spin" /> calculating…
                  </span>
                ) : wdPreview ? (
                  <>
                    <div className={ROW}>
                      <span>You receive (est.)</span>
                      <span className="text-primary-foreground tabular-nums">
                        {fmtAmt(wdPreview.out0, d0)} {cfg.token0.symbol} + {fmtAmt(wdPreview.out1, d1)}{" "}
                        {cfg.token1.symbol}
                      </span>
                    </div>
                    <div className={ROW}>
                      <span>Burning</span>
                      <span className="tabular-nums">
                        {fmtAmt(wdPreview.shares, d1)} of {fmtAmt(myShares, d1)} shares
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-secondary-foreground text-xs">Pick a percentage of your position.</span>
                )}
              </div>

              <Button
                className="rounded-full font-light"
                variant="blue"
                disabled={busy || previewing || !wdPreview || wdPreview.shares === 0n}
                onClick={() => void doWithdraw()}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : "Withdraw"}
              </Button>
              <p className="text-secondary-foreground text-[11px] font-light">
                Withdrawals are available in any market condition.
              </p>
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
              View last transaction ↗
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
