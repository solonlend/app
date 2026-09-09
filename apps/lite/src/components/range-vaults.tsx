import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useConfig, useReadContracts, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { useBusy } from "@/hooks/use-busy";
import { useLiveFeeApr } from "@/hooks/use-live-fee-apr";
import {
  RANGE_VAULTS,
  rangeVaultAbi,
  rangeStrategyAbi,
  rangePriceToHuman,
  type RangeVaultCfg,
} from "@/lib/solon-range";
import { runTx } from "@/lib/tx-toast";

/*
  Auto LP — Solon CLM fork surface (DESIGN-farm-tabs-v1 §v1.1, IA referenced from app.beefy.com):
  vault list row (APR front and center) → detail: price-range visual + LP breakdown + strategy on
  the left, a sticky Deposit/Withdraw action panel with full fee disclosure on the right.
  Chain-driven: interactive where addresses exist (Sepolia rehearsal, RH after mainnet deploy).
*/

const BADGE = "rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-wide";
const PANEL = "bg-primary rounded-2xl p-4";
const LABEL = "text-secondary-foreground font-mono text-[10px] uppercase tracking-wider";
const INPUT =
  "bg-background text-primary-foreground w-full rounded-xl p-3 text-sm tabular-nums outline-none ring-1 ring-white/[0.06] focus:ring-white/20";

function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}
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

/** Net-of-fees APR shown to depositors: live gross fee APR × (1 − 10% performance fee). */
const PERFORMANCE_FEE = 0.1;

export function RangeVaults({ chainId }: { chainId: number | undefined }) {
  const cfg = RANGE_VAULTS.find((v) => v.chainId === chainId) ?? RANGE_VAULTS[0];
  return (
    <div className="flex w-full max-w-7xl flex-col gap-4 px-2 lg:px-8">
      {cfg.vault && cfg.strategy ? <AutoVault cfg={cfg} /> : <ComingSoon cfg={cfg} />}
    </div>
  );
}

function ComingSoon({ cfg }: { cfg: RangeVaultCfg }) {
  return (
    <div className={PANEL}>
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

function AutoVault({ cfg }: { cfg: RangeVaultCfg }) {
  const { address: user } = useAccount();
  const vault = cfg.vault!;
  const strategy = cfg.strategy!;
  const d0 = cfg.token0.decimals;
  const d1 = cfg.token1.decimals;

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

  const price = priceRaw !== undefined ? rangePriceToHuman(priceRaw, d0, d1) : undefined;
  const lower = range ? rangePriceToHuman(range[0], d0, d1) : undefined;
  const upper = range ? rangePriceToHuman(range[1], d0, d1) : undefined;
  const inRange = price !== undefined && lower !== undefined && upper !== undefined && price >= lower && price <= upper;

  const bal0 = balances ? Number(formatUnits(balances[0], d0)) : undefined;
  const bal1 = balances ? Number(formatUnits(balances[1], d1)) : undefined;
  const tvl1 = bal0 !== undefined && bal1 !== undefined && price !== undefined ? bal0 * price + bal1 : undefined;
  const myFrac = totalSupply && totalSupply > 0n ? Number(myShares) / Number(totalSupply) : 0;
  const myValue1 = tvl1 !== undefined ? tvl1 * myFrac : undefined;

  // Live fee APR — same on-chain feeGrowth feed the leveraged table uses; testnet has no feed.
  const { data: liveApr } = useLiveFeeApr();
  const grossApr = cfg.testnet ? undefined : liveApr?.feeApr;
  const netApr = grossApr !== undefined ? grossApr * (1 - PERFORMANCE_FEE) : undefined;

  const val0 = bal0 !== undefined && price !== undefined ? bal0 * price : undefined;
  const share0 = val0 !== undefined && tvl1 ? (val0 / tvl1) * 100 : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Vault list row: pair | Net APR | Daily | TVL | My deposit ── */}
      <div className={`${PANEL} grid grid-cols-2 items-center gap-x-6 gap-y-3 md:grid-cols-[1.4fr_repeat(4,1fr)]`}>
        <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
          <span className="text-primary-foreground text-base font-medium">{cfg.pair}</span>
          <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · 0.01%</span>
          {cfg.testnet && <span className={`${BADGE} bg-yellow-500/15 text-yellow-300`}>TESTNET</span>}
          <span
            className={`${BADGE} ${inRange ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}
          >
            {inRange ? "IN RANGE" : "OUT OF RANGE"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`${LABEL} underline decoration-dotted underline-offset-2`}>Net APR</span>
              </TooltipTrigger>
              <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                Live 24h trading-fee APR of the pool (computed on-chain from realized feeGrowth, refreshed every 30
                minutes) after the 10% performance fee. Not compounded, not a promise.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-morpho-brand text-lg font-medium tabular-nums">
            {netApr !== undefined ? `${(netApr * 100).toFixed(2)}%` : "－"}
          </span>
          {cfg.testnet && netApr === undefined && (
            <span className="text-secondary-foreground text-[10px] font-light">no APR feed on testnet</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>Daily</span>
          <span className="text-primary-foreground text-sm font-medium tabular-nums">
            {netApr !== undefined ? `${((netApr / 365) * 100).toFixed(4)}%` : "－"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>TVL</span>
          <span className="text-primary-foreground text-sm font-medium tabular-nums">
            {tvl1 !== undefined ? `${fmt(tvl1)} ${cfg.token1.symbol}` : "－"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>My deposit</span>
          <span className="text-primary-foreground text-sm font-medium tabular-nums">
            {!user ? "－" : myShares > 0n && myValue1 !== undefined ? `${fmt(myValue1)} ${cfg.token1.symbol}` : "0"}
          </span>
        </div>
      </div>

      {/* ── Detail: content left, sticky action panel right ── */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Price & managed range */}
          <div className={PANEL}>
            <div className="mb-3 flex items-center justify-between">
              <span className={LABEL}>Price & managed range</span>
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
                    Deposits and compounding run only while spot sits near the pool&apos;s 2-minute average — this
                    blocks price-manipulation entries. Withdrawals are never gated.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/[0.04] p-3">
                <span className={LABEL}>Min price</span>
                <div className="text-primary-foreground mt-1 text-sm font-medium tabular-nums">
                  {lower !== undefined ? fmt(lower) : "－"}
                </div>
                <span className="text-secondary-foreground text-[10px]">
                  {cfg.token1.symbol}/{cfg.token0.symbol}
                </span>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-3">
                <span className={LABEL}>
                  Current{" "}
                  <span className={inRange ? "text-emerald-300" : "text-yellow-300"}>
                    {inRange ? "(in range)" : "(out)"}
                  </span>
                </span>
                <div className="text-primary-foreground mt-1 text-sm font-medium tabular-nums">
                  {price !== undefined ? fmt(price) : "－"}
                </div>
                <span className="text-secondary-foreground text-[10px]">
                  {cfg.token1.symbol}/{cfg.token0.symbol}
                </span>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-3">
                <span className={LABEL}>Max price</span>
                <div className="text-primary-foreground mt-1 text-sm font-medium tabular-nums">
                  {upper !== undefined ? fmt(upper) : "－"}
                </div>
                <span className="text-secondary-foreground text-[10px]">
                  {cfg.token1.symbol}/{cfg.token0.symbol}
                </span>
              </div>
            </div>
            {/* Range bar with current-price marker */}
            {lower !== undefined && upper !== undefined && price !== undefined && upper > lower && (
              <div className="mt-3">
                <div className="relative h-2 rounded-full bg-white/[0.06]">
                  <div className="absolute inset-y-0 left-[10%] right-[10%] rounded-full bg-emerald-500/25" />
                  <div
                    className={`absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded ${inRange ? "bg-emerald-300" : "bg-yellow-300"}`}
                    style={{
                      left: `${Math.min(98, Math.max(2, 10 + ((price - lower) / (upper - lower)) * 80))}%`,
                    }}
                  />
                </div>
                <div className="text-secondary-foreground mt-1 flex justify-between text-[10px] tabular-nums">
                  <span>{fmt(lower)}</span>
                  <span>range auto re-centered by the keeper</span>
                  <span>{fmt(upper)}</span>
                </div>
              </div>
            )}
          </div>

          {/* LP breakdown */}
          <div className={PANEL}>
            <span className={LABEL}>LP breakdown</span>
            <div className="mt-3 flex flex-col gap-2">
              {[
                [cfg.token0, balances?.[0], d0, val0, share0] as const,
                [cfg.token1, balances?.[1], d1, bal1, share0 !== undefined ? 100 - share0 : undefined] as const,
              ].map(([t, raw, dec, val, share]) => (
                <div key={t.symbol} className="flex items-center gap-3">
                  <span className="text-primary-foreground w-14 text-sm font-medium">{t.symbol}</span>
                  <div className="h-1.5 grow rounded-full bg-white/[0.06]">
                    <div
                      className="bg-morpho-brand/60 h-full rounded-full"
                      style={{ width: `${share !== undefined ? Math.max(2, share) : 0}%` }}
                    />
                  </div>
                  <span className="text-secondary-foreground w-40 text-right text-xs tabular-nums">
                    {raw !== undefined ? fmtAmt(raw, dec) : "－"}{" "}
                    {t.symbol !== cfg.token1.symbol && val !== undefined ? `· ${fmt(val)} ${cfg.token1.symbol}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-secondary-foreground mt-2 text-[11px] font-light">
              The mix drifts with price and is never force-rebalanced by selling — that is the point.
            </p>
          </div>

          {/* Strategy */}
          <div className={PANEL}>
            <span className={LABEL}>Strategy</span>
            <p className="text-secondary-foreground mt-2 text-xs font-light leading-relaxed">
              Your two tokens are placed as concentrated liquidity around the current price on Uniswap V3. The vault
              collects trading fees and compounds them back into the position; a keeper re-centers the range when price
              moves out of it, and every sensitive action is gated behind a 2-minute TWAP calm check. Your principal is
              never swapped. Risk to understand: while price sits outside the range the position earns no fees and holds
              mostly one token until the next re-center — no losses are forced, but the mix follows the market.
            </p>
          </div>

          {/* My position (only when holding) */}
          {user && myShares > 0n && (
            <div className={PANEL}>
              <span className={LABEL}>My position</span>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <span className={LABEL}>Value</span>
                  <div className="text-primary-foreground mt-0.5 text-sm font-medium tabular-nums">
                    {myValue1 !== undefined ? `${fmt(myValue1)} ${cfg.token1.symbol}` : "－"}
                  </div>
                </div>
                <div>
                  <span className={LABEL}>Vault share</span>
                  <div className="text-primary-foreground mt-0.5 text-sm font-medium tabular-nums">
                    {(myFrac * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <span className={LABEL}>Shares</span>
                  <div className="text-primary-foreground mt-0.5 text-sm font-medium tabular-nums">
                    {fmtAmt(myShares, d1)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <ActionPanel cfg={cfg} isCalm={isCalm} refetch={refetch} myShares={myShares} totalSupply={totalSupply} />
      </div>
    </div>
  );
}

type DepositPreview = { shares: bigint; take0: bigint; take1: bigint; fee0: bigint; fee1: bigint };
type WithdrawPreview = { out0: bigint; out1: bigint; shares: bigint };

function ActionPanel({
  cfg,
  isCalm,
  refetch,
  myShares,
  totalSupply,
}: {
  cfg: RangeVaultCfg;
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

  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amt0, setAmt0] = useState("");
  const [amt1, setAmt1] = useState("");
  const [pct, setPct] = useState<number | undefined>();
  const [depPreview, setDepPreview] = useState<DepositPreview | undefined>();
  const [wdPreview, setWdPreview] = useState<WithdrawPreview | undefined>();
  const [previewing, setPreviewing] = useState(false);
  const [txError, setTxError] = useState<string | undefined>();
  const [lastTx, setLastTx] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewSeq = useRef(0);

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
    query: { enabled: !!user },
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

  // Monotonic sequence: only the latest preview request may write state (race guard).
  const schedulePreview = (a0: string, a1: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const seq = ++previewSeq.current;
    setDepPreview(undefined);
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
          if (seq !== previewSeq.current) return;
          setDepPreview({ shares: r[0], take0: r[1], take1: r[2], fee0: r[3], fee1: r[4] });
        } catch {
          if (seq === previewSeq.current) setDepPreview(undefined);
        } finally {
          if (seq === previewSeq.current) setPreviewing(false);
        }
      })();
    }, 400);
  };

  const previewWithdrawPct = (p: number) => {
    setPct(p);
    const seq = ++previewSeq.current;
    setWdPreview(undefined);
    const shares = (myShares * BigInt(p)) / 100n;
    if (shares === 0n) return;
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
        if (seq !== previewSeq.current) return;
        setWdPreview({ out0: r[0], out1: r[1], shares });
      } catch {
        if (seq === previewSeq.current) setWdPreview(undefined);
      } finally {
        if (seq === previewSeq.current) setPreviewing(false);
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
        void refetchWallet();
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
  const balancingFee = depPreview
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
    <div className={`${PANEL} flex flex-col gap-4 lg:sticky lg:top-24`}>
      {/* Mode tabs */}
      <div className="flex rounded-xl bg-white/[0.04] p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`grow rounded-lg py-2 text-sm capitalize transition-colors ${
              mode === m
                ? "text-primary-foreground bg-white/[0.1]"
                : "text-secondary-foreground hover:text-primary-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {!user ? (
        <p className="text-secondary-foreground rounded-xl bg-white/[0.04] p-4 text-xs">
          Connect a wallet to {mode === "deposit" ? "deposit" : "withdraw"}.
        </p>
      ) : mode === "deposit" ? (
        <>
          {depositBlocked && (
            <p className="rounded-xl bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-300">
              The pool is moving right now. Deposits resume automatically once it settles — usually minutes.
            </p>
          )}
          {[["0", cfg.token0, wallet0, amt0, setAmt0] as const, ["1", cfg.token1, wallet1, amt1, setAmt1] as const].map(
            ([i, t, walletBal, val, setVal]) => (
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
            ),
          )}

          <div className="flex min-h-[64px] flex-col justify-center gap-1.5 rounded-xl bg-white/[0.04] p-3">
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
                <div className={ROW}>
                  <span>You receive (est.)</span>
                  <span className="text-primary-foreground tabular-nums">
                    {fmtAmt(depPreview!.shares, d1)} shares
                    {shareFrac !== undefined ? ` · ${shareFrac.toFixed(2)}%` : ""}
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
            <span className="text-secondary-foreground text-xs">
              Amount to withdraw · you hold {fmtAmt(myShares, d1)} shares
            </span>
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

          <div className="flex min-h-[52px] flex-col justify-center gap-1.5 rounded-xl bg-white/[0.04] p-3">
            {previewing ? (
              <span className="text-secondary-foreground flex items-center gap-2 text-xs">
                <LoaderCircle className="size-3 animate-spin" /> calculating…
              </span>
            ) : wdPreview ? (
              <>
                <div className={ROW}>
                  <span>You receive (est.)</span>
                  <span className="text-primary-foreground tabular-nums">
                    {fmtAmt(wdPreview.out0, d0)} {cfg.token0.symbol} + {fmtAmt(wdPreview.out1, d1)} {cfg.token1.symbol}
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
            disabled={busy || previewing || !wdPreview || wdPreview.shares === 0n || myShares === 0n}
            onClick={() => void doWithdraw()}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : "Withdraw"}
          </Button>
        </>
      )}

      {/* Fee disclosure — mirrors the contract exactly */}
      <div className="flex flex-col gap-1 border-t border-white/[0.06] pt-3">
        <div className={ROW}>
          <span>Deposit fee</span>
          <span>0%</span>
        </div>
        <div className={ROW}>
          <span>Withdrawal fee</span>
          <span>0%</span>
        </div>
        <div className={ROW}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="underline decoration-dotted underline-offset-2">Performance fee</span>
              </TooltipTrigger>
              <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                10% of earned trading fees, taken at harvest — never from principal. The Net APR shown already accounts
                for it.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span>10% of yield</span>
        </div>
        {mode === "deposit" && balancingFee && (
          <div className={ROW}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="underline decoration-dotted underline-offset-2">Balancing fee (this deposit)</span>
                </TooltipTrigger>
                <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                  A one-sided deposit shifts the vault&apos;s token balance, so the filling side pays the pool&apos;s
                  swap fee — the same cost as trading into position yourself. Balanced deposits pay nothing.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="tabular-nums">{balancingFee}</span>
          </div>
        )}
        <p className="text-secondary-foreground text-[11px] font-light">
          Withdrawals are available in any market condition.
        </p>
      </div>

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
  );
}
