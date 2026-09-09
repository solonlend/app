import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useConfig, useReadContracts, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { BADGE, INPUT, LABEL, PANEL, fmt, fmtAmt } from "@/components/auto-vault-common";
import { useAutoVault } from "@/hooks/use-auto-vault";
import { useBusy } from "@/hooks/use-busy";
import { depositPctAmounts } from "@/lib/auto-deposit";
import { rangeVaultAbi, type RangeVaultCfg } from "@/lib/solon-range";
import { runTx } from "@/lib/tx-toast";

/*
  Auto LP vault detail — /farm/auto/:vault (DESIGN-farm-tabs-v1 §E): price-range visual +
  LP breakdown + strategy on the left, sticky Deposit/Withdraw action panel with full fee
  disclosure on the right. Reached only from the vault list; `← All vaults` goes back.
  The whole subtree is remounted per vault/chain/account so no input, preview or tx state
  can leak across identities (preview race lesson, structural fix).
*/

export function AutoVaultDetail({ cfg, onBack }: { cfg: RangeVaultCfg; onBack: () => void }) {
  const { address: user } = useAccount();
  return (
    <div className="flex w-full max-w-7xl flex-col gap-4 px-2 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-secondary-foreground hover:text-primary-foreground text-xs"
        >
          ← All vaults
        </button>
        <span className="text-primary-foreground ml-2 text-base font-medium">{cfg.pair}</span>
        <span className={`${BADGE} text-secondary-foreground bg-white/[0.06]`}>V3 · 0.01%</span>
        {cfg.testnet && <span className={`${BADGE} bg-yellow-500/15 text-yellow-300`}>TESTNET</span>}
      </div>
      <DetailInner key={`${cfg.chainId}:${cfg.slug}:${user ?? "-"}`} cfg={cfg} />
    </div>
  );
}

function DetailInner({ cfg }: { cfg: RangeVaultCfg }) {
  const v = useAutoVault(cfg);

  if (!v.deployed) {
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={PANEL}>
          <span className={LABEL}>Strategy</span>
          <p className="text-secondary-foreground mt-2 max-w-3xl text-xs font-light leading-relaxed">
            Deposit both tokens and walk away: the vault sets the range, resets it as price moves, and compounds trading
            fees back into the position. Your principal is never swapped. Contracts are complete and verified end-to-end
            on a live testnet — mainnet deployment is in final review.
          </p>
        </div>
        <div className={`${PANEL} flex flex-col gap-3 lg:sticky lg:top-24`}>
          <span className={`${BADGE} text-morpho-brand self-start bg-white/[0.06]`}>COMING SOON</span>
          <p className="text-secondary-foreground text-xs font-light leading-relaxed">
            This vault is not live on this chain yet. Deposits open when the mainnet deployment lands.
          </p>
        </div>
      </div>
    );
  }

  const { d0, d1 } = v;
  const balances = v.balances;

  return (
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
                    className={`${BADGE} ${v.isCalm === false ? "bg-yellow-500/20 text-yellow-300" : "bg-emerald-500/15 text-emerald-300"}`}
                  >
                    {v.isCalm === false ? "VOLATILE" : "CALM"}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-primary-foreground max-w-72 rounded-3xl p-4 shadow-2xl">
                  Deposits and compounding run only while spot sits near the pool&apos;s 2-minute average — this blocks
                  price-manipulation entries. Withdrawals are never gated.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className={LABEL}>Min price</span>
              <div className="text-primary-foreground mt-1 text-sm font-medium tabular-nums">
                {v.lower !== undefined ? fmt(v.lower) : "－"}
              </div>
              <span className="text-secondary-foreground text-[10px]">
                {cfg.token1.symbol}/{cfg.token0.symbol}
              </span>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className={LABEL}>
                Current{" "}
                <span className={v.inRange ? "text-emerald-300" : "text-yellow-300"}>
                  {v.inRange ? "(in range)" : "(out)"}
                </span>
              </span>
              <div className="text-primary-foreground mt-1 text-sm font-medium tabular-nums">
                {v.price !== undefined ? fmt(v.price) : "－"}
              </div>
              <span className="text-secondary-foreground text-[10px]">
                {cfg.token1.symbol}/{cfg.token0.symbol}
              </span>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className={LABEL}>Max price</span>
              <div className="text-primary-foreground mt-1 text-sm font-medium tabular-nums">
                {v.upper !== undefined ? fmt(v.upper) : "－"}
              </div>
              <span className="text-secondary-foreground text-[10px]">
                {cfg.token1.symbol}/{cfg.token0.symbol}
              </span>
            </div>
          </div>
          {/* Range bar with current-price marker */}
          {v.lower !== undefined && v.upper !== undefined && v.price !== undefined && v.upper > v.lower && (
            <div className="mt-3">
              <div className="relative h-2 rounded-full bg-white/[0.06]">
                <div className="absolute inset-y-0 left-[10%] right-[10%] rounded-full bg-emerald-500/25" />
                <div
                  className={`absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded ${v.inRange ? "bg-emerald-300" : "bg-yellow-300"}`}
                  style={{
                    left: `${Math.min(98, Math.max(2, 10 + ((v.price - v.lower) / (v.upper - v.lower)) * 80))}%`,
                  }}
                />
              </div>
              <div className="text-secondary-foreground mt-1 flex justify-between text-[10px] tabular-nums">
                <span>{fmt(v.lower)}</span>
                <span>range auto re-centered by the keeper</span>
                <span>{fmt(v.upper)}</span>
              </div>
            </div>
          )}
        </div>

        {/* LP breakdown */}
        <div className={PANEL}>
          <span className={LABEL}>LP breakdown</span>
          <div className="mt-3 flex flex-col gap-2">
            {[
              [cfg.token0, balances?.[0], d0, v.val0, v.share0] as const,
              [cfg.token1, balances?.[1], d1, v.bal1, v.share0 !== undefined ? 100 - v.share0 : undefined] as const,
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
        {v.user && v.myShares > 0n && (
          <div className={PANEL}>
            <span className={LABEL}>My position</span>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div>
                <span className={LABEL}>Value</span>
                <div className="text-primary-foreground mt-0.5 text-sm font-medium tabular-nums">
                  {v.myValue1 !== undefined ? `${fmt(v.myValue1)} ${cfg.token1.symbol}` : "－"}
                </div>
              </div>
              <div>
                <span className={LABEL}>Vault share</span>
                <div className="text-primary-foreground mt-0.5 text-sm font-medium tabular-nums">
                  {(v.myFrac * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <span className={LABEL}>Shares</span>
                <div className="text-primary-foreground mt-0.5 text-sm font-medium tabular-nums">
                  {fmtAmt(v.myShares, d1)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ActionPanel
        cfg={cfg}
        isCalm={v.isCalm}
        refetch={v.refetch}
        myShares={v.myShares}
        totalSupply={v.totalSupply}
        vaultBal0={balances?.[0]}
        vaultBal1={balances?.[1]}
      />
    </div>
  );
}

type DepositPreview = { shares: bigint; take0: bigint; take1: bigint; fee0: bigint; fee1: bigint };
type WithdrawPreview = { out0: bigint; out1: bigint; shares: bigint };

const mockMintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [],
  },
] as const;

function ActionPanel({
  cfg,
  isCalm,
  refetch,
  myShares,
  totalSupply,
  vaultBal0,
  vaultBal1,
}: {
  cfg: RangeVaultCfg;
  isCalm: boolean | undefined;
  refetch: () => void;
  myShares: bigint;
  totalSupply: bigint | undefined;
  vaultBal0: bigint | undefined;
  vaultBal1: bigint | undefined;
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
  const [depPct, setDepPct] = useState<number | undefined>();
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

  // Deposit percentage: fill both inputs in the vault's current ratio, sized by the scarcer side.
  // Fill values are floored to 8 decimals — readable, and never above the computed amount.
  const trimDp = (s: string) => (s.includes(".") ? s.replace(/(\.\d{1,8})\d*$/, "$1").replace(/\.$/, "") : s);
  const applyDepositPct = (p: number) => {
    setDepPct(p);
    const { amt0: a0, amt1: a1 } = depositPctAmounts(p, wallet0, wallet1, vaultBal0 ?? 0n, vaultBal1 ?? 0n);
    const v0 = a0 > 0n ? trimDp(formatUnits(a0, d0)) : "";
    const v1 = a1 > 0n ? trimDp(formatUnits(a1, d1)) : "";
    setAmt0(v0);
    setAmt1(v1);
    schedulePreview(v0, v1);
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
        setDepPct(undefined);
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
          <div className="flex flex-col gap-1.5">
            <span className="text-secondary-foreground text-xs">Fill in the vault&apos;s current ratio</span>
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={depPct === p ? "blue" : "secondary"}
                  className="grow rounded-full font-light tabular-nums"
                  disabled={busy || (wallet0 === 0n && wallet1 === 0n)}
                  onClick={() => applyDepositPct(p)}
                >
                  {p === 100 ? "Max" : `${p}%`}
                </Button>
              ))}
            </div>
          </div>
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
                        setDepPct(undefined);
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
                    setDepPct(undefined);
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
