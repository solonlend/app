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
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";

import { FarmPauseBanner } from "@/components/farm-pause-banner";
import { useBusy } from "@/hooks/use-busy";
import { useFarmPaused } from "@/hooks/use-farm-paused";
import { useReserveRates } from "@/hooks/use-reserve-rates";
import { ensureFarmAllowances } from "@/lib/farm-allowance";
import { closeMinimums, mintMinimums, poolStateAbi, slippageBps } from "@/lib/farm-slippage";
import { farmVaultAbi } from "@/lib/farm-vault-abi";
import { borrowCostDual, blendedBorrowApr, SEPOLIA_PLAYGROUND as P } from "@/lib/solon-farms";
import { runTx } from "@/lib/tx-toast";

const lendingDebtAbi = [
  {
    type: "function",
    name: "getCurrentDebt",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

const MAX_SCAN = 50n; // scan the most recent ids (testnet scale)

const ROW = "text-secondary-foreground flex items-center justify-between text-xs font-light";
const CARD = "bg-primary flex flex-col gap-3 rounded-2xl p-4";

/** token1/token0 raw-unit price; WETH has 18 decimals and USDG has 6. */
function tickToEthPx(tick: number, loanIsC0: boolean): number {
  return loanIsC0 ? 1e12 / Math.pow(1.0001, tick) : 1e12 * Math.pow(1.0001, tick);
}

function priceRange(lower: number, upper: number, loanIsC0: boolean | undefined): string {
  if (loanIsC0 === undefined) return "Price direction unavailable";
  const prices = [tickToEthPx(lower, loanIsC0), tickToEthPx(upper, loanIsC0)].sort((a, b) => a - b);
  return `$${fmt(prices[0], 0)} – $${fmt(prices[1], 0)}`;
}

function useVaultDisplay() {
  const { data: lltv } = useReadContract({
    chainId: P.chainId,
    address: P.vault,
    abi: farmVaultAbi,
    functionName: "LLTV",
    query: { staleTime: Infinity },
  });
  const { data: loanIsC0 } = useReadContract({
    chainId: P.chainId,
    address: P.vault,
    abi: farmVaultAbi,
    functionName: "LOAN_IS_C0",
    query: { staleTime: Infinity },
  });
  return { lltv, loanIsC0 };
}

function fmt(n: number, dp = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: dp }) : "－";
}

type Pos = {
  id: bigint;
  debtRisk: bigint;
  debtLoan: bigint;
  debtRiskAmt: bigint; // WETH 腿欠款(18dp)
  debtLoanAmt: bigint; // USDG 腿欠款(6dp)
  tickLower: number;
  tickUpper: number;
  value: number; // USDG
  debt: number; // USDG
  healthy: boolean;
};

function healthUsage(value: number, debt: number, lltv: bigint | undefined): number | undefined {
  if (lltv === undefined || lltv <= 0n) return undefined;
  return value > 0 ? debt / (value * Number(formatUnits(lltv, 18))) : 0; // 1.0 = liquidation line
}

function HealthBar({ usage }: { usage: number | undefined }) {
  if (usage === undefined) return <span className="text-xs">LLTV unavailable</span>;
  const pct = Math.min(100, usage * 100);
  const color = usage < 0.8 ? "text-farm-safe" : usage <= 0.9 ? "text-farm-warning" : "text-farm-danger";
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <div className="bg-foreground/10 h-1.5 w-20">
        <div className="h-1.5 bg-current" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs">{(usage * 100).toFixed(0)}%</span>
    </div>
  );
}

function PositionSheet({ pos, refetch }: { pos: Pos; refetch: () => void }) {
  const { address: user } = useAccount();
  const { loanIsC0 } = useVaultDisplay();
  const { paused, blocked, assertActive } = useFarmPaused();
  const [slippage, setSlippage] = useState("1");
  const [approvalStep, setApprovalStep] = useState<string | undefined>();
  let validSlippage = true;
  try {
    slippageBps(slippage);
  } catch {
    validSlippage = false;
  }
  const { writeContractAsync, isPending } = useWriteContract();
  const config = useConfig();
  const [busy, guard] = useBusy();
  const rates = useReserveRates();
  const riskApr = rates.riskBorrowApr;
  const loanApr = rates.loanBorrowApr;
  const [tab, setTab] = useState("Close");
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState<string | undefined>();

  // Add margin
  const [amEth, setAmEth] = useState("");
  const [amUsdg, setAmUsdg] = useState("");

  // Close
  const [pct, setPct] = useState(10000);
  const [useTopUp, setUseTopUp] = useState(false);

  // Rebalance
  const [rangePct, setRangePct] = useState(5);

  // Increase(加仓):追加 USDG 保证金 + 目标追加杠杆倍数
  const [incUsdg, setIncUsdg] = useState("");
  const [incLev, setIncLev] = useState(2);

  const { data: legDebts } = useReadContracts({
    contracts: [
      {
        chainId: P.chainId,
        address: P.lending,
        abi: lendingDebtAbi,
        functionName: "getCurrentDebt",
        args: [pos.debtRisk],
      },
      {
        chainId: P.chainId,
        address: P.lending,
        abi: lendingDebtAbi,
        functionName: "getCurrentDebt",
        args: [pos.debtLoan],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    allowFailure: true,
    query: { staleTime: 20_000 },
  });
  // 读失败不能静默当 0:那会把有债仓位显示成零债务、零利息和错误的加权利率
  const debtRiskRaw = (legDebts?.[0]?.result as readonly [bigint, bigint] | undefined)?.[0];
  const debtLoanRaw = (legDebts?.[1]?.result as readonly [bigint, bigint] | undefined)?.[0];
  const debtsLoaded = debtRiskRaw !== undefined && debtLoanRaw !== undefined;
  const debtRiskAmt = debtRiskRaw ?? 0n;
  const debtLoanAmt = debtLoanRaw ?? 0n;

  const {
    data: preview,
    isError: previewFailed,
    isFetching: previewLoading,
  } = useReadContract({
    chainId: P.chainId,
    address: P.vault,
    abi: farmVaultAbi,
    functionName: "previewClose",
    args: [pos.id, pct],
    query: { staleTime: 15_000, refetchInterval: 15_000 },
  });
  const shortRisk = preview ? Number(formatUnits(preview[4], 18)) : undefined;
  const shortLoan = preview ? Number(formatUnits(preview[5], 6)) : undefined;
  const hasGap = !!preview && (preview[4] > 0n || preview[5] > 0n);

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1800);

  const ensureApprovals = async (risk: bigint, loan: bigint) => {
    if (!user) throw new Error("Connect your wallet first.");
    try {
      await ensureFarmAllowances(
        [
          { token: P.weth, amount: risk },
          { token: P.usdg, amount: loan },
        ],
        (token) =>
          readContract(config, {
            chainId: P.chainId,
            address: token,
            abi: erc20Abi,
            functionName: "allowance",
            args: [user, P.vault],
          }),
        async (token, amount) => {
          const label = `Approve ${token === P.weth ? "WETH" : "USDG"}`;
          setApprovalStep(`${label} — confirm approval before the position transaction`);
          const hash = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label }, () =>
            writeContractAsync({
              chainId: P.chainId,
              address: token,
              abi: erc20Abi,
              functionName: "approve",
              args: [P.vault, amount],
            }),
          );
          return !!hash;
        },
      );
    } finally {
      setApprovalStep(undefined);
    }
  };

  const doAddMargin = async () => {
    setTxError(undefined);
    try {
      const risk = parseUnits(amEth || "0", 18);
      const loan = parseUnits(amUsdg || "0", 6);
      await ensureApprovals(risk, loan);
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Add margin" }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: P.vault,
          abi: farmVaultAbi,
          functionName: "addMargin",
          args: [pos.id, risk, loan],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  const doClose = async () => {
    setTxError(undefined);
    try {
      const bps = slippageBps(slippage);
      const quoteClose = async () => {
        // Never reuse stale/error preview data to sign a close transaction.
        const fresh = await readContract(config, {
          chainId: P.chainId,
          address: P.vault,
          abi: farmVaultAbi,
          functionName: "previewClose",
          args: [pos.id, pct],
        }).catch(() => {
          throw new Error("Close preview failed. Submission blocked; retry when preview is available.");
        });
        const needsSwap = !useTopUp && (fresh[4] > 0n || fresh[5] > 0n);
        const [pool, direction] = needsSwap
          ? await Promise.all([
              readContract(config, { chainId: P.chainId, address: P.pool, abi: poolStateAbi, functionName: "slot0" }),
              readContract(config, {
                chainId: P.chainId,
                address: P.vault,
                abi: farmVaultAbi,
                functionName: "LOAN_IS_C0",
              }),
            ])
          : ([undefined, false] as const);
        return closeMinimums({
          preview: fresh,
          sqrtPriceX96: pool?.[0] ?? 1n,
          loanIsC0: direction,
          slippageBps: bps,
          useTopUp,
        });
      };
      const initial = await quoteClose();
      await ensureApprovals(initial.topUpRisk, initial.topUpLoan);
      // Approval mining accrues debt: refresh bounds, then recheck allowance before signing.
      const limits = await quoteClose();
      await ensureApprovals(limits.topUpRisk, limits.topUpLoan);
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Close position" }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: P.vault,
          abi: farmVaultAbi,
          functionName: "close",
          args: [
            pos.id,
            {
              percent: pct,
              ...limits,
              zapPath: "0x",
              deadline: deadline(),
            },
          ],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  // harvest(id, compound):claim=净手续费直转持有人;compound=手续费两腿直接增铸回仓位(合约 v1.1)
  const doHarvest = async (compound: boolean) => {
    setTxError(undefined);
    try {
      const h = await runTx(
        config,
        { chainId: P.chainId, explorer: P.explorer, label: compound ? "Compound fees" : "Claim fees" },
        () =>
          writeContractAsync({
            chainId: P.chainId,
            address: P.vault,
            abi: farmVaultAbi,
            functionName: "harvest",
            args: [pos.id, compound, deadline()],
          }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  const doRebalance = async (curTick: number) => {
    setTxError(undefined);
    try {
      const half = Math.max(20, Math.round(Math.log(1 + rangePct / 100) / Math.log(1.0001)));
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Rebalance range" }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: P.vault,
          abi: farmVaultAbi,
          functionName: "rebalance",
          args: [
            pos.id,
            {
              newTickLower: curTick - half,
              newTickUpper: curTick + half,
              swapAmount: 0n,
              minSwapOut: 0n,
              minLiquidity: 0n,
              zapPath: "0x",
              deadline: deadline(),
            },
          ],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  // current tick from range midpoint fallback; better: read pool slot0
  const { data: slot0 } = useReadContract({
    chainId: P.chainId,
    address: P.pool,
    abi: [
      {
        type: "function",
        name: "slot0",
        stateMutability: "view",
        inputs: [],
        outputs: [
          { type: "uint160" },
          { type: "int24" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint16" },
          { type: "uint8" },
          { type: "bool" },
        ],
      },
    ] as const,
    functionName: "slot0",
    query: { staleTime: 30_000 },
  });
  const curTick = slot0 ? Number(slot0[1]) : Math.round((pos.tickLower + pos.tickUpper) / 2);

  const { data: ethPx6 } = useReadContract({
    chainId: P.chainId,
    address: P.oracle,
    abi: [
      {
        type: "function",
        name: "riskValueInLoan",
        stateMutability: "view",
        inputs: [{ type: "uint256" }],
        outputs: [{ type: "uint256" }],
      },
    ] as const,
    functionName: "riskValueInLoan",
    args: [10n ** 18n],
    query: { staleTime: 60_000 },
  });

  const doIncrease = async () => {
    setTxError(undefined);
    try {
      const bps = slippageBps(slippage);
      await assertActive();
      const m = Number(incUsdg) || 0;
      if (m <= 0 || ethPx6 === undefined) return;
      const ethPx = Number(formatUnits(ethPx6, 6));
      // 与开仓面板同一口径:每腿各需"新增仓位价值/2",借款 = 该腿所需 − 自带(此处自带全在 USDG 腿)
      const perLeg = (m * incLev) / 2;
      const borrowLoanVal = Math.max(0, perLeg - m);
      const borrowRiskVal = perLeg;
      const investLoan = parseUnits(m.toFixed(6), 6);
      const borrowRisk = parseUnits((borrowRiskVal / ethPx).toFixed(18), 18);
      const borrowLoan = parseUnits(borrowLoanVal.toFixed(6), 6);
      await ensureApprovals(0n, investLoan);
      await assertActive();
      const [pool, direction] = await Promise.all([
        readContract(config, { chainId: P.chainId, address: P.pool, abi: poolStateAbi, functionName: "slot0" }),
        readContract(config, { chainId: P.chainId, address: P.vault, abi: farmVaultAbi, functionName: "LOAN_IS_C0" }),
      ]);
      const limits = mintMinimums({
        sqrtPriceX96: pool[0],
        tickLower: pos.tickLower,
        tickUpper: pos.tickUpper,
        riskAmount: borrowRisk,
        loanAmount: investLoan + borrowLoan,
        loanIsC0: direction,
        slippageBps: bps,
      });
      const h = await runTx(config, { chainId: P.chainId, explorer: P.explorer, label: "Increase position" }, () =>
        writeContractAsync({
          chainId: P.chainId,
          address: P.vault,
          abi: farmVaultAbi,
          functionName: "increase",
          args: [
            pos.id,
            {
              investRisk: 0n,
              investLoan,
              borrowRisk,
              borrowLoan,
              ...limits,
              deadline: deadline(),
            },
          ],
        }),
      );
      if (!h) return;
      setLastTx(h);
      refetch();
    } catch (e) {
      setTxError((e as Error).message?.split("\n")[0]?.slice(0, 160));
    }
  };

  // 两腿各按各自储备的实时借款利率计息 —— 单一利率会把成本算错一个数量级
  const debtRiskValue =
    ethPx6 !== undefined ? Number(formatUnits(debtRiskAmt, 18)) * Number(formatUnits(ethPx6, 6)) : 0;
  const debtLoanValue = Number(formatUnits(debtLoanAmt, 6));
  const borrowCost =
    debtsLoaded && riskApr !== undefined && loanApr !== undefined && ethPx6 !== undefined
      ? borrowCostDual(debtRiskValue, riskApr, debtLoanValue, loanApr)
      : undefined;
  const blendedApr =
    riskApr !== undefined && loanApr !== undefined
      ? blendedBorrowApr(debtRiskValue, riskApr, debtLoanValue, loanApr)
      : 0;

  return (
    <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-scroll sm:w-[480px] sm:max-w-[480px]">
      <SheetHeader>
        <SheetTitle>Position #{pos.id.toString()}</SheetTitle>
        <SheetDescription>
          Value {fmt(pos.value)} USDG · Debt {fmt(pos.debt)} USDG ·{" "}
          {pos.value > pos.debt ? `${(pos.value / (pos.value - pos.debt)).toFixed(2)}x leverage` : "leverage n/a"} ·
          Equity {fmt(Math.max(0, pos.value - pos.debt))} USDG
          <br />
          Debt breakdown: {debtsLoaded ? fmt(Number(formatUnits(debtRiskAmt, 18)), 5) : "－"} WETH
          {riskApr !== undefined ? ` @ ${(riskApr * 100).toFixed(2)}%` : ""} +{" "}
          {debtsLoaded ? fmt(Number(formatUnits(debtLoanAmt, 6))) : "－"} USDG
          {loanApr !== undefined ? ` @ ${(loanApr * 100).toFixed(2)}%` : ""}
          <br />
          {borrowCost !== undefined ? (
            <>
              Interest: {fmt(borrowCost)} USDG / year ({(blendedApr * 100).toFixed(2)}% blended) ·{" "}
              {fmt(borrowCost / 365, 4)} / day
              <br />
            </>
          ) : null}
          Range {priceRange(pos.tickLower, pos.tickUpper, loanIsC0)}{" "}
          {curTick >= pos.tickLower && curTick <= pos.tickUpper ? "· in range" : "· OUT OF RANGE"}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <FarmPauseBanner paused={paused} />
        <label className={ROW}>
          <span>Slippage tolerance (close / increase)</span>
          <span>
            <input
              aria-label="Slippage tolerance percent"
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              className="w-16 bg-transparent text-right"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />{" "}
            %
          </span>
        </label>
        {!validSlippage && <p className="text-morpho-error text-xs">Enter slippage between 0.1% and 5%.</p>}
        {approvalStep && (
          <p role="status" className="text-xs">
            {approvalStep}
          </p>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="Close" className="grow">
              Close
            </TabsTrigger>
            <TabsTrigger value="Add margin" className="grow">
              Add margin
            </TabsTrigger>
            <TabsTrigger value="Rebalance" className="grow">
              Rebalance
            </TabsTrigger>
            <TabsTrigger value="Harvest" className="grow">
              Harvest
            </TabsTrigger>
            <TabsTrigger value="Increase" className="grow">
              Increase
            </TabsTrigger>
          </TabsList>

          <TabsContent value="Close" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>Close amount</span>
                <span>{(pct / 100).toFixed(0)}%</span>
              </div>
              <div className="flex gap-2">
                {[2500, 5000, 7500, 10000].map((p) => (
                  <Button
                    key={p}
                    variant={p === pct ? "blue" : "secondary"}
                    className="h-7 grow rounded-full text-xs"
                    onClick={() => setPct(p)}
                  >
                    {p / 100}%
                  </Button>
                ))}
              </div>
            </div>
            <div className={CARD}>
              <div className={ROW}>
                <span>Settlement preview</span>
                <span>live from previewClose()</span>
              </div>
              {preview && !previewFailed ? (
                <>
                  <div className={ROW}>
                    <span>LP proceeds before debt / swap</span>
                    <span className="text-primary-foreground">
                      {fmt(Number(formatUnits(preview[0], 18)), 4)} WETH + {fmt(Number(formatUnits(preview[1], 6)))}{" "}
                      USDG
                    </span>
                  </div>
                  <div className={ROW}>
                    <span>Debt due</span>
                    <span className="text-primary-foreground">
                      {fmt(Number(formatUnits(preview[2], 18)), 4)} WETH + {fmt(Number(formatUnits(preview[3], 6)))}{" "}
                      USDG
                    </span>
                  </div>
                  {hasGap ? (
                    <div className="flex flex-col gap-2 border border-white/[0.12] p-3">
                      <p className="text-primary-foreground text-xs">
                        Gap: short {(shortRisk ?? 0) > 1e-9 ? `${fmt(shortRisk ?? 0, 5)} WETH` : ""}
                        {(shortRisk ?? 0) > 1e-9 && (shortLoan ?? 0) > 1e-3 ? " + " : ""}
                        {(shortLoan ?? 0) > 1e-3 ? `${fmt(shortLoan ?? 0)} USDG` : ""}
                      </p>
                      <label className="text-secondary-foreground flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={useTopUp} onChange={(e) => setUseTopUp(e.target.checked)} />
                        Top up the gap myself — lossless exit, skips the swap (only pulls what is actually needed)
                      </label>
                      {!useTopUp && (
                        <p className="text-secondary-foreground text-[11px]">
                          Otherwise the surplus leg buys the gap via exactOutput (slippage-fused, oracle-floored).
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-secondary-foreground text-[11px]">No gap — both legs repay in kind, no swap.</p>
                  )}
                </>
              ) : previewFailed ? (
                <p role="alert" className="text-morpho-error text-xs">
                  Close preview failed. Submission blocked; retry when available.
                </p>
              ) : (
                <p className="text-xs">Loading close preview — submission blocked.</p>
              )}
            </div>
            <Button
              className="h-10 w-full rounded-full text-xs"
              variant="blue"
              disabled={isPending || busy || !preview || previewFailed || previewLoading || !validSlippage}
              onClick={() => void guard(() => doClose())}
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Close {pct / 100}%
            </Button>
          </TabsContent>

          <TabsContent value="Add margin" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>Amounts (either or both)</span>
                <span>repays debt legs first</span>
              </div>
              <div className={ROW}>
                <span>Current debt · WETH leg</span>
                <span className={debtRiskAmt === 0n ? "text-secondary-foreground" : "text-primary-foreground"}>
                  {debtsLoaded ? fmt(Number(formatUnits(debtRiskAmt, 18)), 5) : "－"} WETH
                  {debtsLoaded && debtRiskAmt === 0n ? " (nothing to repay)" : ""}
                </span>
              </div>
              <div className={ROW}>
                <span>Current debt · USDG leg</span>
                <span className={debtLoanAmt === 0n ? "text-secondary-foreground" : "text-primary-foreground"}>
                  {debtsLoaded ? fmt(Number(formatUnits(debtLoanAmt, 6))) : "－"} USDG
                  {debtsLoaded && debtLoanAmt === 0n ? " (nothing to repay)" : ""}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <input
                  className="text-primary-foreground grow bg-transparent text-xl font-light outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  value={amEth}
                  onChange={(e) => setAmEth(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="text-secondary-foreground text-xs">WETH</span>
              </div>
              <div className="flex items-baseline gap-2">
                <input
                  className="text-primary-foreground grow bg-transparent text-xl font-light outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  value={amUsdg}
                  onChange={(e) => setAmUsdg(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="text-secondary-foreground text-xs">USDG</span>
              </div>
            </div>
            <Button
              className="h-10 w-full rounded-full text-xs"
              variant="blue"
              disabled={isPending || busy || (!amEth && !amUsdg)}
              onClick={() => void guard(() => doAddMargin())}
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Add margin
            </Button>
          </TabsContent>

          <TabsContent value="Rebalance" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>New range (around current price)</span>
                <span>debts untouched</span>
              </div>
              <div className="flex gap-2">
                {[2, 5, 10].map((p) => (
                  <Button
                    key={p}
                    variant={p === rangePct ? "blue" : "secondary"}
                    className="h-7 grow rounded-full text-xs"
                    onClick={() => setRangePct(p)}
                  >
                    ±{p}%
                  </Button>
                ))}
              </div>
              <p className="text-secondary-foreground text-[11px]">
                Withdraw-all → re-mint at the new range. Net delta swap (swapAmount) is auto-0 here; set it off-chain
                for asymmetric moves.
              </p>
            </div>
            <Button
              className="h-10 w-full rounded-full text-xs"
              variant="blue"
              disabled={isPending || busy}
              onClick={() => void guard(() => doRebalance(curTick))}
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Rebalance to ±{rangePct}%
            </Button>
          </TabsContent>

          <TabsContent value="Harvest" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>Accrued LP fees</span>
                <span>10% protocol harvest fee applies</span>
              </div>
              <p className="text-secondary-foreground text-[11px] font-light">
                Claim sends the net fees (both tokens) to your wallet. Compound rolls them straight back into the
                position — no swap either way.
              </p>
              <div className="flex gap-2">
                <Button
                  className="h-10 grow rounded-full text-xs"
                  variant="blue"
                  disabled={isPending || busy}
                  onClick={() => void guard(() => doHarvest(false))}
                >
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Claim fees
                </Button>
                <Button
                  className="h-10 grow rounded-full text-xs"
                  variant="secondary"
                  disabled={isPending || busy}
                  onClick={() => void guard(() => doHarvest(true))}
                >
                  Compound
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="Increase" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>Add margin (USDG) + leverage it</span>
                <span>{incLev}x on the added margin</span>
              </div>
              <div className="flex items-baseline gap-2">
                <input
                  className="text-primary-foreground grow bg-transparent text-xl font-light outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  value={incUsdg}
                  onChange={(e) => setIncUsdg(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="text-secondary-foreground text-xs">USDG</span>
              </div>
              <div className="flex gap-2">
                {[1.5, 2, 3, 4].map((l) => (
                  <Button
                    key={l}
                    variant={l === incLev ? "blue" : "secondary"}
                    className="h-7 grow rounded-full text-xs"
                    onClick={() => setIncLev(l)}
                  >
                    {l}x
                  </Button>
                ))}
              </div>
              <p className="text-secondary-foreground text-[11px] font-light">
                Borrows both legs against your existing position (same range, zero-swap) — unused borrow auto-repays.
                Position must stay healthy after.
              </p>
            </div>
            <Button
              className="h-10 w-full rounded-full text-xs"
              variant="blue"
              disabled={isPending || busy || blocked || !validSlippage || !incUsdg || ethPx6 === undefined}
              onClick={() => void guard(() => doIncrease())}
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Increase position
            </Button>
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

export function FarmPositions() {
  const { lltv, loanIsC0 } = useVaultDisplay();
  const { address: user, isConnected } = useAccount();

  const { data: nextId, refetch: r0 } = useReadContract({
    chainId: P.chainId,
    address: P.vault,
    abi: farmVaultAbi,
    functionName: "nextPositionId",
    query: { staleTime: 30_000 },
  });

  const ids = useMemo(() => {
    if (!nextId) return [];
    const start = nextId > MAX_SCAN ? nextId - MAX_SCAN : 1n;
    const out: bigint[] = [];
    for (let i = start; i < nextId; i++) out.push(i);
    return out;
  }, [nextId]);

  const { data: owners, refetch: r1 } = useReadContracts({
    contracts: ids.map((id) => ({
      chainId: P.chainId,
      address: P.vault,
      abi: farmVaultAbi,
      functionName: "ownerOf" as const,
      args: [id] as const,
    })),
    allowFailure: true,
    query: { enabled: ids.length > 0, staleTime: 30_000 },
  });

  const myIds = useMemo(
    () =>
      ids.filter((_, i) => {
        const o = owners?.[i]?.result as string | undefined;
        return !!user && !!o && o.toLowerCase() === user.toLowerCase();
      }),
    [ids, owners, user],
  );

  const { data: details, refetch: r2 } = useReadContracts({
    contracts: myIds.flatMap((id) => [
      {
        chainId: P.chainId,
        address: P.vault,
        abi: farmVaultAbi,
        functionName: "positions" as const,
        args: [id] as const,
      },
      {
        chainId: P.chainId,
        address: P.vault,
        abi: farmVaultAbi,
        functionName: "positionValue" as const,
        args: [id] as const,
      },
      {
        chainId: P.chainId,
        address: P.vault,
        abi: farmVaultAbi,
        functionName: "totalDebtInLoan" as const,
        args: [id] as const,
      },
      {
        chainId: P.chainId,
        address: P.vault,
        abi: farmVaultAbi,
        functionName: "isHealthy" as const,
        args: [id] as const,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]) as any,
    allowFailure: true,
    query: { enabled: myIds.length > 0, staleTime: 30_000 },
  });

  const positions: Pos[] = useMemo(() => {
    return myIds
      .map((id, i) => {
        const p = details?.[i * 4]?.result as readonly [bigint, bigint, number, number, bigint, bigint] | undefined;
        const v = details?.[i * 4 + 1]?.result as bigint | undefined;
        const d = details?.[i * 4 + 2]?.result as bigint | undefined;
        const h = details?.[i * 4 + 3]?.result as boolean | undefined;
        if (!p || v === undefined || d === undefined) return undefined;
        return {
          id,
          debtRisk: p[4],
          debtLoan: p[5],
          debtRiskAmt: 0n,
          debtLoanAmt: 0n,
          tickLower: Number(p[2]),
          tickUpper: Number(p[3]),
          value: Number(formatUnits(v, 6)),
          debt: Number(formatUnits(d, 6)),
          healthy: h ?? true,
        };
      })
      .filter((x): x is Pos => !!x && x.value > 0);
  }, [myIds, details]);

  const refetch = () => {
    void r0();
    void r1();
    void r2();
  };

  if (!isConnected || positions.length === 0) return null;

  return (
    <div className="text-primary-foreground w-full max-w-7xl px-2 lg:px-8">
      <div className="flex items-baseline justify-between px-2 pb-1 pt-8">
        <h2 className="text-sm font-light tracking-wide">My farm positions · Sepolia testnet</h2>
        <span className="text-secondary-foreground text-xs font-light">click a row to manage</span>
      </div>
      <div className="overflow-x-auto">
        <Table className="border-separate border-spacing-y-3">
          <TableHeader className="bg-primary">
            <TableRow>
              <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">Position</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Value</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Debt</TableHead>
              <TableHead className="text-secondary-foreground text-xs font-light">Leverage</TableHead>
              <TableHead className="text-secondary-foreground hidden text-xs font-light md:table-cell">
                Range (ETH price)
              </TableHead>
              <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light">
                Health (100% = liquidation)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((pos) => {
              const usage = healthUsage(pos.value, pos.debt, lltv);
              return (
                <Sheet key={pos.id.toString()}>
                  <SheetTrigger asChild>
                    <TableRow
                      className={
                        usage !== undefined && usage > 0.9
                          ? "bg-farm-danger-subtle hover:bg-farm-danger-subtle"
                          : "bg-primary hover:bg-secondary"
                      }
                    >
                      <TableCell className="rounded-l-lg py-3 pl-4">#{pos.id.toString()}</TableCell>
                      <TableCell>{fmt(pos.value)} USDG</TableCell>
                      <TableCell>{fmt(pos.debt)} USDG</TableCell>
                      <TableCell>
                        {pos.value > pos.debt ? `${(pos.value / (pos.value - pos.debt)).toFixed(2)}x` : "－"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {priceRange(pos.tickLower, pos.tickUpper, loanIsC0)}
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        <HealthBar usage={usage} />
                      </TableCell>
                    </TableRow>
                  </SheetTrigger>
                  <PositionSheet pos={pos} refetch={refetch} />
                </Sheet>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
