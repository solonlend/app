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
import { useFarmProtocol } from "@/hooks/use-farm-protocol";
import { useReserveRates } from "@/hooks/use-reserve-rates";
import { ensureFarmAllowances } from "@/lib/farm-allowance";
import { marginDebt, increaseEstimate, liquidationPrices } from "@/lib/farm-manage-projection";
import { riskPriceAtTick } from "@/lib/farm-protocol";
import { closeMinimums, mintMinimums, poolStateAbi, slippageBps } from "@/lib/farm-slippage";
import { farmVaultAbi } from "@/lib/farm-vault-abi";
import { borrowCostDual, blendedBorrowApr, RH_MAINNET as P } from "@/lib/solon-farms";
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

function priceRange(lower: number, upper: number, protocol: ReturnType<typeof useFarmProtocol>): string {
  const { loanIsC0, decimals0, decimals1, symbols } = protocol;
  if (loanIsC0 === undefined || decimals0 === undefined || decimals1 === undefined || !symbols)
    return "Price data unavailable";
  const prices = [lower, upper]
    .map((tick) => riskPriceAtTick(tick, loanIsC0, decimals0, decimals1))
    .sort((a, b) => a - b);
  return `$${fmt(prices[0], 4)} – $${fmt(prices[1], 4)} ${symbols.risk}/${symbols.quote}`;
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

function HealthBar({ usage, hero = false }: { usage: number | undefined; hero?: boolean }) {
  if (usage === undefined) return <span className="text-xs">LLTV unavailable</span>;
  const pct = Math.min(100, usage * 100);
  const color = usage < 0.8 ? "text-farm-safe" : usage <= 0.9 ? "text-farm-warning" : "text-farm-danger";
  return (
    <div className={`${hero ? "flex flex-col gap-2" : "flex items-center gap-2"} ${color}`}>
      <div className={`bg-foreground/10 relative ${hero ? "h-2 w-full rounded" : "h-1.5 w-20"}`}>
        <div className="h-full rounded-[inherit] bg-current" style={{ width: `${pct}%` }} />
        {hero &&
          [80, 90].map((mark) => (
            <span
              key={mark}
              className="bg-secondary-foreground absolute -top-1 h-4 w-px"
              style={{ left: `${mark}%` }}
              title={`${mark}%`}
            />
          ))}
      </div>
      {hero && (
        <div className="text-secondary-foreground relative h-3 text-[9px]">
          <span>0</span>
          <span className="absolute -translate-x-1/2" style={{ left: "80%" }}>
            80
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: "90%" }}>
            90
          </span>
          <span className="float-right">100</span>
        </div>
      )}
      <span className={hero ? "text-3xl font-semibold tabular-nums" : "text-xs"}>{(usage * 100).toFixed(0)}%</span>
    </div>
  );
}

function PositionSheet({ pos, refetch }: { pos: Pos; refetch: () => void }) {
  const { address: user } = useAccount();
  const protocol = useFarmProtocol();
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
  const [tab, setTab] = useState("Overview");
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

  const riskSymbol = protocol.symbols?.risk ?? "—";
  const loanSymbol = protocol.symbols?.quote ?? "—";
  const riskDecimals = protocol.reserves[1].decimals;
  const loanDecimals = protocol.reserves[0].decimals;
  const riskPrice = ethPx6 === undefined ? undefined : Number(formatUnits(ethPx6, 6));
  const quoteUsd = protocol.feeds[1].price;
  const riskUsd = protocol.feeds[0].price;
  const usd = (value: number | undefined, price: number | undefined) =>
    value === undefined || price === undefined || !Number.isFinite(value) ? "≈ $—" : `≈ $${fmt(value * price)}`;
  const riskAmount = (raw: bigint) => (riskDecimals === undefined ? undefined : Number(formatUnits(raw, riskDecimals)));
  const loanAmount = (raw: bigint) => (loanDecimals === undefined ? undefined : Number(formatUnits(raw, loanDecimals)));
  const pairAmount = (risk: bigint, loan: bigint) => {
    const r = riskAmount(risk),
      l = loanAmount(loan);
    return `${r === undefined ? "—" : fmt(r, 5)} ${riskSymbol} + ${l === undefined ? "—" : fmt(l)} ${loanSymbol}`;
  };
  const pairUsd = (risk: bigint, loan: bigint) => {
    const r = riskAmount(risk),
      l = loanAmount(loan);
    return usd(
      r === undefined || l === undefined || riskUsd === undefined || quoteUsd === undefined
        ? undefined
        : r * riskUsd + l * quoteUsd,
      1,
    );
  };
  const { data: balances } = useReadContracts({
    contracts: [P.weth, P.usdg].map((address) => ({
      chainId: P.chainId,
      address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [user!] as const,
    })),
    allowFailure: true,
    query: { enabled: !!user, staleTime: 15_000, refetchInterval: 15_000 },
  });
  const walletRisk = balances?.[0]?.result;
  const walletLoan = balances?.[1]?.result;
  const maxRisk =
    walletRisk === undefined || !debtsLoaded ? undefined : walletRisk < debtRiskAmt ? walletRisk : debtRiskAmt;
  const maxLoan =
    walletLoan === undefined || !debtsLoaded ? undefined : walletLoan < debtLoanAmt ? walletLoan : debtLoanAmt;
  const parsedAmount = (value: string, decimals: number | undefined) => {
    if (decimals === undefined || (value && !/^\d+(?:\.\d*)?$/.test(value))) return undefined;
    if ((value.split(".")[1]?.length ?? 0) > decimals) return undefined;
    try {
      return parseUnits(value || "0", decimals);
    } catch {
      return undefined;
    }
  };
  const marginRisk = parsedAmount(amEth, riskDecimals),
    marginLoan = parsedAmount(amUsdg, loanDecimals);
  const marginValid =
    marginRisk !== undefined &&
    marginLoan !== undefined &&
    maxRisk !== undefined &&
    maxLoan !== undefined &&
    marginRisk <= maxRisk &&
    marginLoan <= maxLoan;
  const currentUsage = healthUsage(pos.value, pos.debt, protocol.lltv);
  const range =
    protocol.loanIsC0 === undefined || protocol.decimals0 === undefined || protocol.decimals1 === undefined
      ? undefined
      : [pos.tickLower, pos.tickUpper]
          .map((tick) => riskPriceAtTick(tick, protocol.loanIsC0!, protocol.decimals0!, protocol.decimals1!))
          .sort((a, b) => a - b);
  const liqPrices =
    range && debtsLoaded && riskPrice !== undefined && protocol.lltv !== undefined
      ? liquidationPrices(
          pos.value,
          Number(formatUnits(debtRiskAmt, 18)),
          debtLoanValue,
          riskPrice,
          range[0],
          range[1],
          Number(formatUnits(protocol.lltv, 18)),
        )
      : undefined;
  let nextUsage: number | undefined;
  let projectionNote = "输入金额查看操作后健康度";
  let closeLimits: ReturnType<typeof closeMinimums> | undefined;
  let closeEstimateError: string | undefined;
  if (preview && !previewFailed && !previewLoading && validSlippage) {
    try {
      if (hasGap && !useTopUp && (!slot0 || protocol.loanIsC0 === undefined)) throw new Error("等待换币价格");
      closeLimits = closeMinimums({
        preview,
        sqrtPriceX96: slot0?.[0] ?? 1n,
        loanIsC0: protocol.loanIsC0 ?? false,
        slippageBps: slippageBps(slippage),
        useTopUp,
      });
    } catch {
      closeEstimateError = "暂无法估算到手；可尝试自补缺口或刷新价格";
    }
  }
  if (tab === "Add margin" && marginValid && debtsLoaded && riskPrice !== undefined) {
    nextUsage = healthUsage(
      pos.value,
      marginDebt(
        Number(formatUnits(debtRiskAmt, 18)),
        debtLoanValue,
        Number(amEth || 0),
        Number(amUsdg || 0),
        riskPrice,
      ),
      protocol.lltv,
    );
    projectionNote = "按实际还债估算；超额资金不增加 LP";
  } else if (
    tab === "Increase" &&
    range &&
    slot0 &&
    riskPrice &&
    debtsLoaded &&
    parsedAmount(incUsdg, loanDecimals) !== undefined &&
    Number.isFinite(Number(incUsdg)) &&
    Number(incUsdg) > 0
  ) {
    const poolPrice = riskPriceAtTick(Number(slot0[1]), protocol.loanIsC0!, protocol.decimals0!, protocol.decimals1!);
    const added = increaseEstimate(
      Number(incUsdg),
      incLev,
      riskPrice,
      poolPrice,
      range[0],
      range[1],
      Number(formatUnits(debtRiskAmt, 18)),
      debtLoanValue,
    );
    if (added) nextUsage = healthUsage(pos.value + added.value, added.debt, protocol.lltv);
    projectionNote = added
      ? "按当前区间用币估算，剩余资金先还债；成交后以链上为准"
      : "当前价格不在区间内，无法估算加仓";
  } else if (
    tab === "Close" &&
    preview &&
    !previewFailed &&
    !previewLoading &&
    closeLimits &&
    riskPrice !== undefined
  ) {
    nextUsage =
      pct === 10000
        ? 0
        : healthUsage(
            pos.value * (1 - pct / 10000),
            Math.max(
              0,
              pos.debt - Number(formatUnits(preview[2], 18)) * riskPrice - Number(formatUnits(preview[3], 6)),
            ),
            protocol.lltv,
          );
    projectionNote = pct === 10000 ? "还清双腿债务后，此仓关闭" : "按比例撤出 LP 并还债；健康度通常基本不变";
  }
  const changed = currentUsage !== undefined && nextUsage !== undefined ? nextUsage - currentUsage : undefined;
  const projection = (
    <div
      role="status"
      aria-live="polite"
      className="border-foreground/10 bg-primary flex flex-col gap-2 rounded-lg border p-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            changed === undefined || Math.abs(changed) < 1e-8 ? "" : changed < 0 ? "text-farm-safe" : "text-farm-danger"
          }
        >
          {changed === undefined ? "—" : Math.abs(changed) < 1e-8 ? "=" : changed < 0 ? "↓" : "↑"}
        </span>
        <span>{tab === "Add margin" ? "补仓" : tab === "Increase" ? "加仓" : "平仓"}后健康度</span>
        <span className="text-secondary-foreground">
          {currentUsage === undefined ? "—" : `${(currentUsage * 100).toFixed(0)}%`} →
        </span>
        {nextUsage === undefined ? (
          <span>待估算</span>
        ) : tab === "Close" && pct === 10000 ? (
          <span>0% · 仓位关闭</span>
        ) : (
          <HealthBar usage={nextUsage} />
        )}
      </div>
      <p className="text-secondary-foreground text-[11px]">{projectionNote}</p>
    </div>
  );
  const repayFirst =
    marginRisk && marginRisk > 0n
      ? riskSymbol
      : marginLoan && marginLoan > 0n
        ? loanSymbol
        : debtRiskAmt > 0n
          ? riskSymbol
          : loanSymbol;

  return (
    <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-auto font-mono sm:w-[520px] sm:max-w-[520px]">
      <SheetHeader>
        <SheetTitle>
          pos #{pos.id.toString()} · {riskSymbol} / {loanSymbol}
        </SheetTitle>
        <SheetDescription>
          {pos.value > pos.debt ? `${(pos.value / (pos.value - pos.debt)).toFixed(2)}x` : "杠杆 —"} · 仓位管理
        </SheetDescription>
      </SheetHeader>
      <div className="bg-background sticky top-0 z-10 px-4 pb-2">
        <section aria-label="当前仓位健康度" className="border-foreground/10 bg-primary rounded-xl border p-4">
          <div className="text-secondary-foreground mb-3 flex flex-wrap justify-between gap-2 text-[11px]">
            <span>HEALTH · 100% = 清算</span>
            <span>
              清算价 {riskSymbol}{" "}
              {currentUsage !== undefined && currentUsage >= 1
                ? "已达清算线"
                : liqPrices === undefined || quoteUsd === undefined
                  ? "—"
                  : liqPrices.length
                    ? liqPrices
                        .map((price) => `${price < (riskPrice ?? 0) ? "↓" : "↑"} ≈ $${fmt(price * quoteUsd)}`)
                        .join(" / ")
                    : "无有限清算价"}
            </span>
          </div>
          <HealthBar usage={currentUsage} hero />
          <p className="text-secondary-foreground mt-2 text-[10px]">
            清算价为区间 LP 情景估算：计价币价格不变，未计后续利息与费用。
          </p>
        </section>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <div className="border-foreground/10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
          {[
            ["价值", pos.value],
            ["权益", Math.max(0, pos.value - pos.debt)],
            ["债务", pos.debt],
            ["利息/年", borrowCost],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-primary min-w-0 p-3">
              <div className="text-secondary-foreground text-[10px]">{label}</div>
              <div className="mt-1 text-sm tabular-nums">{value === undefined ? "—" : fmt(value as number)}</div>
              <div className="text-secondary-foreground text-[10px]">{usd(value as number | undefined, quoteUsd)}</div>
            </div>
          ))}
        </div>
        <FarmPauseBanner paused={paused} />
        {approvalStep && (
          <p role="status" className="text-xs">
            {approvalStep}
          </p>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid h-auto w-full grid-cols-6">
            {[
              ["Overview", "概览"],
              ["Add margin", "补仓"],
              ["Increase", "加仓"],
              ["Rebalance", "调仓"],
              ["Harvest", "收获"],
              ["Close", "平仓"],
            ].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="min-w-0 px-1 text-xs">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="Overview" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>现债 · {riskSymbol}</span>
                <span>{debtsLoaded ? pairAmount(debtRiskAmt, 0n) : "—"}</span>
              </div>
              <div className="text-secondary-foreground text-right text-[11px]">
                {debtsLoaded ? usd(riskAmount(debtRiskAmt), riskUsd) : "≈ $—"} · 年利率{" "}
                {riskApr === undefined ? "—" : `${(riskApr * 100).toFixed(2)}%`}
              </div>
              <div className={ROW}>
                <span>现债 · {loanSymbol}</span>
                <span>{debtsLoaded ? `${fmt(debtLoanValue)} ${loanSymbol}` : "—"}</span>
              </div>
              <div className="text-secondary-foreground text-right text-[11px]">
                {debtsLoaded ? usd(debtLoanValue, quoteUsd) : "≈ $—"} · 年利率{" "}
                {loanApr === undefined ? "—" : `${(loanApr * 100).toFixed(2)}%`}
              </div>
              <div className={ROW}>
                <span>加权借款年利率</span>
                <span>{borrowCost === undefined ? "—" : `${(blendedApr * 100).toFixed(2)}%`}</span>
              </div>
              <div className={ROW}>
                <span>每日利息</span>
                <span>
                  {borrowCost === undefined ? "—" : fmt(borrowCost / 365, 4)} {loanSymbol} ·{" "}
                  {usd(borrowCost === undefined ? undefined : borrowCost / 365, quoteUsd)}
                </span>
              </div>
              <p className="text-xs">区间 {priceRange(pos.tickLower, pos.tickUpper, protocol)}</p>
              <p className="text-secondary-foreground text-xs">
                {slot0
                  ? curTick >= pos.tickLower && curTick <= pos.tickUpper
                    ? "当前价格在区间内"
                    : "当前价格已超出区间"
                  : "正在读取当前价格"}
              </p>
            </div>
          </TabsContent>
          <TabsContent value="Add margin" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              {[
                {
                  symbol: riskSymbol,
                  decimals: riskDecimals,
                  debt: debtRiskAmt,
                  max: maxRisk,
                  value: amEth,
                  set: setAmEth,
                  price: riskUsd,
                },
                {
                  symbol: loanSymbol,
                  decimals: loanDecimals,
                  debt: debtLoanAmt,
                  max: maxLoan,
                  value: amUsdg,
                  set: setAmUsdg,
                  price: quoteUsd,
                },
              ].map((field, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className={ROW}>
                    <label htmlFor={`margin-${i}`}>
                      {field.symbol} · 现债{" "}
                      {debtsLoaded && field.decimals !== undefined
                        ? fmt(Number(formatUnits(field.debt, field.decimals)), 5)
                        : "—"}
                    </label>
                    <button
                      type="button"
                      className="text-primary-foreground rounded px-2 py-1 focus-visible:outline disabled:opacity-40"
                      disabled={field.max === undefined || field.decimals === undefined || busy || isPending}
                      onClick={() => field.set(formatUnits(field.max!, field.decimals!))}
                    >
                      MAX{" "}
                      {field.max === undefined || field.decimals === undefined
                        ? "—"
                        : fmt(Number(formatUnits(field.max, field.decimals)), 5)}
                    </button>
                  </div>
                  <div className="border-foreground/10 flex items-center gap-2 rounded-lg border p-3">
                    <input
                      id={`margin-${i}`}
                      className="min-w-0 grow bg-transparent text-lg outline-none focus-visible:ring-1"
                      inputMode="decimal"
                      placeholder="0"
                      value={field.value}
                      onChange={(e) => field.set(e.target.value.replace(/[^0-9.]/g, ""))}
                    />
                    <span className="text-secondary-foreground text-xs">{field.symbol}</span>
                  </div>
                  <p className="text-secondary-foreground text-right text-[11px]">
                    {usd(Number(field.value || 0), field.price)}
                  </p>
                </div>
              ))}
              <p className="text-secondary-foreground text-[11px]">
                可补上限 = 钱包余额与现债的较小值。先还 {repayFirst} 腿，按各币种实际所需还债。
              </p>
              {!marginValid && (amEth || amUsdg) && (
                <p className="text-xs">请等待余额/现债读取完成，并输入不超过 MAX 的有效金额。</p>
              )}
            </div>
            {projection}
            <Button
              className="h-10 w-full rounded-lg text-xs"
              variant="blue"
              disabled={isPending || busy || !marginValid || (marginRisk === 0n && marginLoan === 0n)}
              onClick={() => void guard(() => doAddMargin())}
            >
              {isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} 补仓 · 先还 {repayFirst} 腿
            </Button>
          </TabsContent>
          <TabsContent value="Increase" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <label htmlFor="increase-amount" className={ROW}>
                <span>追加 {loanSymbol} 保证金</span>
                <span>{incLev}x 追加杠杆</span>
              </label>
              <div className="border-foreground/10 flex items-center gap-2 rounded-lg border p-3">
                <input
                  id="increase-amount"
                  className="min-w-0 grow bg-transparent text-lg outline-none focus-visible:ring-1"
                  inputMode="decimal"
                  placeholder="0"
                  value={incUsdg}
                  onChange={(e) => setIncUsdg(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="text-secondary-foreground text-xs">{loanSymbol}</span>
              </div>
              <p className="text-secondary-foreground text-right text-[11px]">{usd(Number(incUsdg || 0), quoteUsd)}</p>
              <div className="flex gap-2">
                {[1.5, 2, 3, 4].map((l) => (
                  <Button
                    key={l}
                    variant={l === incLev ? "blue" : "secondary"}
                    className="h-8 grow rounded-md text-xs"
                    onClick={() => setIncLev(l)}
                  >
                    {l}x
                  </Button>
                ))}
              </div>
              <p className="text-secondary-foreground text-[11px]">
                在当前区间借入两币增加 LP，不换币；未用资金先还债。操作后须保持健康。
              </p>
            </div>
            {projection}
            <Button
              className="h-10 w-full rounded-lg text-xs"
              variant="blue"
              disabled={isPending || busy || blocked || !validSlippage || !incUsdg || ethPx6 === undefined}
              onClick={() => void guard(() => doIncrease())}
            >
              {isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} 加仓
            </Button>
          </TabsContent>
          <TabsContent value="Close" className="flex flex-col gap-3 pt-3">
            <div className="grid grid-cols-4 gap-2">
              {[2500, 5000, 7500, 10000].map((p) => (
                <Button
                  key={p}
                  variant={p === pct ? "blue" : "secondary"}
                  className="h-8 rounded-md text-xs"
                  onClick={() => setPct(p)}
                >
                  {p / 100}%
                </Button>
              ))}
            </div>
            <p className="text-secondary-foreground text-[11px]">
              {pct === 10000
                ? "平掉整个仓位，还清双腿债务，余额回到钱包。"
                : `平掉 ${pct / 100}% 仓位，按比例还债，保留剩余 LP。`}
            </p>
            <div className="border-foreground/10 flex flex-col gap-3 rounded-lg border border-dashed p-3">
              <div className={ROW}>
                <span>结算预览</span>
                <span>链上实时读取</span>
              </div>
              {preview && !previewFailed && !previewLoading ? (
                <>
                  {[
                    ["LP 拆出", preview[0], preview[1]],
                    ["还债", preview[2], preview[3]],
                    ...(hasGap ? [["待补缺口", preview[4], preview[5]]] : []),
                  ].map(([label, risk, loan]) => (
                    <div key={label as string} className="text-xs">
                      <div className={ROW}>
                        <span>{label as string}</span>
                        <span className="text-primary-foreground text-right">
                          {pairAmount(risk as bigint, loan as bigint)}
                        </span>
                      </div>
                      <p className="text-secondary-foreground mt-1 text-right text-[11px]">
                        {pairUsd(risk as bigint, loan as bigint)}
                      </p>
                    </div>
                  ))}
                  <div className="border-foreground/10 border-t pt-3 text-xs">
                    <div className={ROW}>
                      <span>预计到手下限</span>
                      <span className="text-primary-foreground text-right">
                        {closeLimits ? pairAmount(closeLimits.minOutRisk, closeLimits.minOutLoan) : "—"}
                      </span>
                    </div>
                    <p className="text-secondary-foreground mt-1 text-right text-[11px]">
                      {closeLimits ? pairUsd(closeLimits.minOutRisk, closeLimits.minOutLoan) : "≈ $—"}
                    </p>
                    <p className="text-secondary-foreground mt-2 text-[10px]">
                      已计滑点保护，未计待收手续费；最终以成交为准。{useTopUp ? "自补金额由钱包另付。" : ""}
                    </p>
                    {closeEstimateError && <p className="mt-2 text-[11px]">{closeEstimateError}</p>}
                  </div>
                  {hasGap ? (
                    <fieldset className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-3 text-xs">
                      <legend className="text-secondary-foreground px-1">补缺口方式</legend>
                      <label className="flex items-start gap-2">
                        <input type="radio" name="gap-mode" checked={useTopUp} onChange={() => setUseTopUp(true)} />
                        <span>
                          自补缺口
                          <span className="text-secondary-foreground"> — 精确还债，不动市场（只拉实际所需）</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input type="radio" name="gap-mode" checked={!useTopUp} onChange={() => setUseTopUp(false)} />
                        <span>
                          自动换币补缺口
                          <span className="text-secondary-foreground">
                            {" "}
                            — 盈余腿换所缺币，滑点 ≤ {validSlippage ? slippage : "—"}%，预言机兜底价
                          </span>
                        </span>
                      </label>
                    </fieldset>
                  ) : (
                    <p className="text-secondary-foreground text-[11px]">无需补缺口 · 两币各自还债，不换币。</p>
                  )}
                </>
              ) : previewFailed ? (
                <p role="alert" className="text-morpho-error text-xs">
                  平仓预览失败，暂不可提交；请稍后重试。
                </p>
              ) : (
                <p role="status" className="text-xs">
                  正在更新平仓预览，暂不可提交。
                </p>
              )}
            </div>
            {projection}
            <Button
              className="h-10 w-full rounded-lg text-xs"
              variant="blue"
              disabled={isPending || busy || !preview || previewFailed || previewLoading || !validSlippage}
              onClick={() => void guard(() => doClose())}
            >
              {isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} 平仓 {pct / 100}%
            </Button>
          </TabsContent>
          <TabsContent value="Rebalance" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>新区间 · 围绕当前价格</span>
                <span>债务不变</span>
              </div>
              <div className="flex gap-2">
                {[2, 5, 10].map((p) => (
                  <Button
                    key={p}
                    variant={p === rangePct ? "blue" : "secondary"}
                    className="h-8 grow rounded-md text-xs"
                    onClick={() => setRangePct(p)}
                  >
                    ±{p}%
                  </Button>
                ))}
              </div>
              <p className="text-secondary-foreground text-[11px]">撤出全部 LP 后在新区间重新添加；当前操作不换币。</p>
            </div>
            <Button
              className="h-10 w-full rounded-lg text-xs"
              variant="blue"
              disabled={isPending || busy}
              onClick={() => void guard(() => doRebalance(curTick))}
            >
              {isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} 调仓至 ±{rangePct}%
            </Button>
          </TabsContent>
          <TabsContent value="Harvest" className="flex flex-col gap-3 pt-3">
            <div className={CARD}>
              <div className={ROW}>
                <span>已累积 LP 手续费</span>
                <span>领取 / 复投均扣除收获费</span>
              </div>
              <p className="text-secondary-foreground text-[11px]">
                领取：扣费后两币回钱包。复投：两币直接加回仓位。两种方式均不换币。
              </p>
              <div className="flex gap-2">
                <Button
                  className="h-10 grow rounded-lg text-xs"
                  variant="blue"
                  disabled={isPending || busy}
                  onClick={() => void guard(() => doHarvest(false))}
                >
                  {isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} 领取手续费
                </Button>
                <Button
                  className="h-10 grow rounded-lg text-xs"
                  variant="secondary"
                  disabled={isPending || busy}
                  onClick={() => void guard(() => doHarvest(true))}
                >
                  复投
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <label className={`${ROW} border-foreground/10 border-t pt-3`}>
          <span>滑点容忍（平仓换币 / 加仓铸造）</span>
          <span className="border-foreground/10 rounded-md border px-2 py-1">
            <input
              aria-label="滑点容忍百分比"
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              className="w-12 bg-transparent text-right"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />{" "}
            %
          </span>
        </label>
        {!validSlippage && <p className="text-morpho-error text-xs">请输入 0.1% 至 5% 的滑点容忍。</p>}
        {txError && <p className="text-morpho-error text-[11px]">{txError}</p>}
        {lastTx && (
          <a
            className="text-secondary-foreground flex items-center justify-center gap-1 text-[11px] underline"
            href={`${P.explorer}/tx/${lastTx}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            查看最近交易 <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </SheetContent>
  );
}

export function FarmPositions() {
  const { lltv } = useVaultDisplay();
  const protocol = useFarmProtocol();
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
                区间 · 价格(风险/计价)
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
                        {priceRange(pos.tickLower, pos.tickUpper, protocol)}
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
