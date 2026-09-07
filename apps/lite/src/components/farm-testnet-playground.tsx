import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { CircleCheck, ExternalLink, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, useConfig, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { FarmPauseBanner } from "@/components/farm-pause-banner";
import { useBusy } from "@/hooks/use-busy";
import { useFarmPaused } from "@/hooks/use-farm-paused";
import { fullCapacityLabel, useFarmProtocol } from "@/hooks/use-farm-protocol";
import { mintMinimums, slippageBps } from "@/lib/farm-slippage";
import { farmVaultAbi } from "@/lib/farm-vault-abi";
import { SEPOLIA_PLAYGROUND, RH_MAINNET } from "@/lib/solon-farms";
import { runTx } from "@/lib/tx-toast";

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

const oracleAbi = [
  {
    type: "function",
    name: "riskValueInLoan",
    stateMutability: "view",
    inputs: [{ name: "riskAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const poolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const vaultAbi = [
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "investRisk", type: "uint256" },
          { name: "investLoan", type: "uint256" },
          { name: "borrowRisk", type: "uint256" },
          { name: "borrowLoan", type: "uint256" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "minLiquidity", type: "uint128" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "positionNftId", type: "uint256" }],
  },
] as const;

function StepButton({
  label,
  doneLabel,
  onClick,
  disabled,
  pending,
  done,
}: {
  label: string;
  doneLabel: string;
  onClick: () => void;
  disabled?: boolean;
  pending: boolean;
  done: boolean;
}) {
  return (
    <Button
      variant={done ? "secondary" : "blue"}
      className="h-9 w-full rounded-full text-xs"
      onClick={onClick}
      disabled={disabled || pending || done}
    >
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : done ? <CircleCheck className="h-4 w-4" /> : null}
      {done ? doneLabel : label}
    </Button>
  );
}

/**
 * Live Sepolia playground: mint test tokens → approve both tokens → call open().
 * wagmi requests a switch to Sepolia if the wallet is on another chain. Amounts, leverage and range use the selections above.
 */
export function FarmTestnetPlayground({
  marginUsdg,
  marginEth,
  leverage,
  rangePct,
  cfg = SEPOLIA_PLAYGROUND,
}: {
  marginUsdg: number;
  marginEth: number;
  leverage: number;
  rangePct: number;
  cfg?: typeof SEPOLIA_PLAYGROUND | typeof RH_MAINNET;
}) {
  // One config drives every read/write: SEPOLIA_PLAYGROUND (mock tokens, mint step) on testnet,
  // RH_MAINNET (real USDG/WETH, no mint) on mainnet. Same vault ABI and open() flow either way.
  const P = cfg;
  const { address: user, isConnected } = useAccount();
  const [txs, setTxs] = useState<{ mint?: `0x${string}`; approve?: `0x${string}`; open?: `0x${string}` }>({});

  const protocol = useFarmProtocol();
  const config = useConfig();
  const { paused, blocked, assertActive } = useFarmPaused();
  const [slippage, setSlippage] = useState("1");
  let slippageError: string | undefined;
  try {
    slippageBps(slippage);
  } catch (e) {
    slippageError = (e as Error).message;
  }
  const { writeContractAsync, isPending } = useWriteContract();
  const [busy, guard] = useBusy();
  const [pendingStep, setPendingStep] = useState<"mint" | "approve" | "open" | null>(null);

  const { data: chainData, refetch } = useReadContracts({
    contracts: [
      { chainId: P.chainId, address: P.oracle, abi: oracleAbi, functionName: "riskValueInLoan", args: [10n ** 18n] },
      { chainId: P.chainId, address: P.pool, abi: poolAbi, functionName: "slot0" },
      ...(user
        ? ([
            { chainId: P.chainId, address: P.usdg, abi: erc20Abi, functionName: "balanceOf", args: [user] },
            { chainId: P.chainId, address: P.weth, abi: erc20Abi, functionName: "balanceOf", args: [user] },
            { chainId: P.chainId, address: P.usdg, abi: erc20Abi, functionName: "allowance", args: [user, P.vault] },
            { chainId: P.chainId, address: P.weth, abi: erc20Abi, functionName: "allowance", args: [user, P.vault] },
          ] as const)
        : []),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    allowFailure: true,
    query: { staleTime: 30_000 },
  });

  const ethPx6 = chainData?.[0]?.result as bigint | undefined; // USDG(6dp) per 1e18 WETH
  const tick = (chainData?.[1]?.result as readonly [bigint, number, ...unknown[]] | undefined)?.[1];
  const balUsdg = (chainData?.[2]?.result as bigint | undefined) ?? 0n;
  const balWeth = (chainData?.[3]?.result as bigint | undefined) ?? 0n;
  const allowUsdg = (chainData?.[4]?.result as bigint | undefined) ?? 0n;
  const allowWeth = (chainData?.[5]?.result as bigint | undefined) ?? 0n;

  const { status: openStatus } = useWaitForTransactionReceipt({
    chainId: P.chainId,
    hash: txs.open,
    query: { enabled: !!txs.open },
  });

  const plan = useMemo(() => {
    if (ethPx6 === undefined || tick === undefined) return undefined;
    const ethPx = Number(formatUnits(ethPx6, 6));
    const equity = marginUsdg + marginEth * ethPx;
    if (equity <= 0) return undefined;
    // Each leg needs positionValue/2; borrowing = leg requirement minus user margin (same formula as the panel preview).
    const perLeg = (equity * leverage) / 2;
    const borrowLoanVal = Math.max(0, perLeg - marginUsdg);
    const borrowRiskVal = Math.max(0, perLeg - marginEth * ethPx);
    const investLoan = parseUnits(marginUsdg.toFixed(6), 6);
    const investRisk = parseUnits(marginEth.toFixed(18), 18);
    const borrowLoan = parseUnits(borrowLoanVal.toFixed(6), 6);
    const borrowRisk = parseUnits((borrowRiskVal / ethPx).toFixed(18), 18);
    // ±pct% → ticks (1.0001^t): ln(1+pct/100)/ln(1.0001)
    const half = Math.max(20, Math.round(Math.log(1 + rangePct / 100) / Math.log(1.0001)));
    return { investLoan, investRisk, borrowLoan, borrowRisk, tickLower: tick - half, tickUpper: tick + half };
  }, [ethPx6, tick, marginUsdg, marginEth, leverage, rangePct]);

  const needsUsdg = plan ? balUsdg < plan.investLoan : false;
  const needsWeth = plan ? balWeth < plan.investRisk : false;
  const minted = !!txs.mint || (!needsUsdg && !needsWeth && (balUsdg > 0n || balWeth > 0n));
  const approved = plan ? allowUsdg >= plan.investLoan && allowWeth >= plan.investRisk : false;

  const [txError, setTxError] = useState<string | undefined>();

  const run = async (step: "mint" | "approve" | "open") => {
    if (!user || !plan) return;
    setPendingStep(step);
    setTxError(undefined);
    try {
      if (step === "mint") {
        const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Mint USDG" }, () =>
          writeContractAsync({
            chainId: P.chainId,
            address: P.usdg,
            abi: mockTokenAbi,
            functionName: "mint",
            args: [user, parseUnits("10000", 6)],
          }),
        );
        if (!h) return;
        setTxs((t) => ({ ...t, mint: h })); // Record the first on-chain transaction; failure of the second should not hide the first.
        const hWeth = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Mint WETH" }, () =>
          writeContractAsync({
            chainId: P.chainId,
            address: P.weth,
            abi: mockTokenAbi,
            functionName: "mint",
            args: [user, parseUnits("5", 18)],
          }),
        );
        if (!hWeth) return;
      } else if (step === "approve") {
        const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Approve USDG" }, () =>
          writeContractAsync({
            chainId: P.chainId,
            address: P.usdg,
            abi: erc20Abi,
            functionName: "approve",
            args: [P.vault, 2n ** 256n - 1n],
          }),
        );
        if (!h) return;
        setTxs((t) => ({ ...t, approve: h }));
        const hApproveWeth = await runTx(
          config,
          { chainId: P.chainId, explorer: P.explorer, label: "Approve WETH" },
          () =>
            writeContractAsync({
              chainId: P.chainId,
              address: P.weth,
              abi: erc20Abi,
              functionName: "approve",
              args: [P.vault, 2n ** 256n - 1n],
            }),
        );
        if (!hApproveWeth) return;
      } else {
        const tolerance = slippageBps(slippage);
        await assertActive();
        await protocol.assertCapacity();
        const [slot0, loanIsC0] = await Promise.all([
          readContract(config, { chainId: P.chainId, address: P.pool, abi: poolAbi, functionName: "slot0" }),
          readContract(config, { chainId: P.chainId, address: P.vault, abi: farmVaultAbi, functionName: "LOAN_IS_C0" }),
        ]);
        const minimums = mintMinimums({
          sqrtPriceX96: slot0[0],
          tickLower: plan.tickLower,
          tickUpper: plan.tickUpper,
          riskAmount: plan.investRisk + plan.borrowRisk,
          loanAmount: plan.investLoan + plan.borrowLoan,
          loanIsC0,
          slippageBps: tolerance,
        });
        const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Open position" }, () =>
          writeContractAsync({
            chainId: P.chainId,
            address: P.vault,
            abi: vaultAbi,
            functionName: "open",
            args: [
              {
                investRisk: plan.investRisk,
                investLoan: plan.investLoan,
                borrowRisk: plan.borrowRisk,
                borrowLoan: plan.borrowLoan,
                tickLower: plan.tickLower,
                tickUpper: plan.tickUpper,
                ...minimums,
                deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
              },
            ],
          }),
        );
        if (!h) return;
        setTxs((t) => ({ ...t, open: h }));
      }
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    } finally {
      setPendingStep(null);
      void refetch();
    }
  };

  return (
    <div className="bg-primary flex flex-col gap-2 rounded-2xl p-4">
      <div className="text-secondary-foreground flex items-center justify-between text-xs font-light">
        <span>{P.testnet ? "Testnet playground · Sepolia" : "Open position · Robinhood Chain"}</span>
        <span>{ethPx6 !== undefined ? `oracle ETH $${Number(formatUnits(ethPx6, 6)).toFixed(0)}` : "…"}</span>
      </div>
      <p className="text-secondary-foreground text-[11px] font-light">
        {P.testnet
          ? "The exact vault heading to mainnet, live on Sepolia — mock tokens, real contract. Your wallet will be asked to switch networks."
          : "Live on Robinhood Chain with real USDG/WETH — this opens a real leveraged position. Soft launch: small reserve caps, so size within the remaining capacity and verify on-chain. Your wallet will be asked to switch networks."}
      </p>
      <FarmPauseBanner paused={paused} />
      <label className="text-secondary-foreground flex items-center justify-between gap-2 text-xs">
        Slippage tolerance (%)
        <input
          aria-label="Open slippage tolerance (%)"
          type="number"
          min="0.1"
          max="5"
          step="0.1"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
          className="bg-background w-20 rounded-lg border px-2 py-1"
        />
      </label>
      {slippageError && <p className="text-morpho-error text-[11px]">{slippageError}</p>}
      {!isConnected ? (
        <p className="text-secondary-foreground text-center text-xs">Connect a wallet to try it.</p>
      ) : (
        <>
          {P.testnet && (
            <StepButton
              label="1 · Get test tokens (10,000 USDG + 5 ETH)"
              doneLabel="Test tokens ready"
              onClick={() => void guard(() => run("mint"))}
              disabled={busy}
              pending={pendingStep === "mint" && (isPending || busy)}
              done={minted && !needsUsdg && !needsWeth}
            />
          )}
          {!P.testnet && (needsUsdg || needsWeth) && (
            <p className="text-morpho-error text-[11px]">
              Insufficient wallet balance for this size — reduce the margin or top up USDG/WETH.
            </p>
          )}
          <StepButton
            label={P.testnet ? "2 · Approve USDG + WETH" : "Approve USDG + WETH"}
            doneLabel="Approved"
            onClick={() => void guard(() => run("approve"))}
            disabled={busy || !plan}
            pending={pendingStep === "approve" && (isPending || busy)}
            done={approved}
          />
          <StepButton
            label={
              fullCapacityLabel(protocol.fullReserve) ??
              (protocol.capacityUnknown
                ? "Capacity unavailable"
                : P.testnet
                  ? "3 · Open position (real tx)"
                  : "Open position (real tx)")
            }
            doneLabel="Position opened"
            onClick={() => void guard(() => run("open"))}
            disabled={
              busy ||
              !plan ||
              !approved ||
              blocked ||
              !!slippageError ||
              !!protocol.fullReserve ||
              protocol.capacityUnknown
            }
            pending={pendingStep === "open" && (isPending || busy)}
            done={openStatus === "success"}
          />
          {txError && <p className="text-morpho-error text-[11px]">{txError}</p>}
          {txs.open && (
            <a
              className="text-secondary-foreground flex items-center justify-center gap-1 text-[11px] underline"
              href={`${P.explorer}/tx/${txs.open}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              View transaction <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="text-secondary-foreground text-[11px] font-light">
            Wallet balance: {Number(formatUnits(balUsdg, 6)).toFixed(0)} USDG ·{" "}
            {Number(formatUnits(balWeth, 18)).toFixed(2)} WETH
          </p>
        </>
      )}
    </div>
  );
}
