import { erc20Abi, formatUnits, parseAbi, zeroAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";

import { capacityState, farmAssets } from "@/lib/farm-protocol";
import { farmReserveAbi } from "@/lib/farm-protocol-abi";
import { RH_MAINNET, SEPOLIA_PLAYGROUND } from "@/lib/solon-farms";

const vaultAbi = parseAbi([
  "function LLTV() view returns (uint256)",
  "function LIQ_BONUS_BPS() view returns (uint256)",
  "function PROTOCOL_FEE_BPS() view returns (uint256)",
  "function LOAN_IS_C0() view returns (bool)",
  "function TOKEN0() view returns (address)",
  "function TOKEN1() view returns (address)",
  "function RESERVE_LOAN() view returns (uint256)",
  "function RESERVE_RISK() view returns (uint256)",
]);
const oracleAbi = parseAbi([
  "function RISK_MAX_STALENESS() view returns (uint256)",
  "function STABLE_MAX_STALENESS() view returns (uint256)",
  "function STABLE_DEPEG_BPS() view returns (uint256)",
  "function RISK_FEED() view returns (address)",
  "function LOAN_FEED() view returns (address)",
]);
const feedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
const query = { staleTime: 15_000, refetchInterval: 30_000 };

/** Reads the mainnet vault used by the farm entry points. */
export function useFarmProtocol(cfg: typeof RH_MAINNET | typeof SEPOLIA_PLAYGROUND = RH_MAINNET) {
  const P = cfg; // default mainnet; the Sepolia playground passes its own config
  const { data: config } = useReadContracts({
    contracts: [
      ...(
        [
          "LLTV",
          "LIQ_BONUS_BPS",
          "PROTOCOL_FEE_BPS",
          "LOAN_IS_C0",
          "TOKEN0",
          "TOKEN1",
          "RESERVE_LOAN",
          "RESERVE_RISK",
        ] as const
      ).map((functionName) => ({ chainId: P.chainId, address: P.vault, abi: vaultAbi, functionName })),
      ...(["RISK_MAX_STALENESS", "STABLE_MAX_STALENESS", "STABLE_DEPEG_BPS", "RISK_FEED", "LOAN_FEED"] as const).map(
        (functionName) => ({ chainId: P.chainId, address: P.oracle, abi: oracleAbi, functionName }),
      ),
    ],
    allowFailure: true,
    query,
  });
  const c = <T>(i: number) => config?.[i]?.result as T | undefined;
  const loanIsC0 = c<boolean>(3);
  const token0 = c<Address>(4),
    token1 = c<Address>(5);
  const loanId = c<bigint>(6),
    riskId = c<bigint>(7);
  const riskFeed = c<Address>(11),
    loanFeed = c<Address>(12);
  const ready = !!token0 && !!token1 && loanId !== undefined && riskId !== undefined && !!riskFeed && !!loanFeed;
  const { data, refetch } = useReadContracts({
    contracts: [
      ...[loanId, riskId].flatMap(
        (id) =>
          [
            { chainId: P.chainId, address: P.lending, abi: farmReserveAbi, functionName: "reserves", args: [id ?? 0n] },
            {
              chainId: P.chainId,
              address: P.lending,
              abi: farmReserveAbi,
              functionName: "totalLiquidityOfReserve",
              args: [id ?? 0n],
            },
            {
              chainId: P.chainId,
              address: P.lending,
              abi: farmReserveAbi,
              functionName: "utilizationRateOfReserve",
              args: [id ?? 0n],
            },
          ] as const,
      ),
      ...[token0, token1].flatMap(
        (address) =>
          [
            { chainId: P.chainId, address: address ?? zeroAddress, abi: erc20Abi, functionName: "symbol" },
            { chainId: P.chainId, address: address ?? zeroAddress, abi: erc20Abi, functionName: "decimals" },
          ] as const,
      ),
      ...[riskFeed, loanFeed].flatMap(
        (address) =>
          [
            { chainId: P.chainId, address: address ?? zeroAddress, abi: feedAbi, functionName: "latestRoundData" },
            { chainId: P.chainId, address: address ?? zeroAddress, abi: feedAbi, functionName: "decimals" },
          ] as const,
      ),
    ],
    allowFailure: true,
    query: { ...query, enabled: ready },
  });
  const d = <T>(i: number) => data?.[i]?.result as T | undefined;
  const symbols = farmAssets(d<string>(6) ?? "—", d<string>(8) ?? "—", loanIsC0);
  const decimals0 = d<number>(7),
    decimals1 = d<number>(9);
  const reserves = [0, 1].map((i) => {
    const raw = d<readonly unknown[]>(i * 3);
    const capacity = raw?.[6] as bigint | undefined;
    const supplied = d<bigint>(i * 3 + 1);
    const util = d<bigint>(i * 3 + 2);
    const decimals = loanIsC0 === undefined ? undefined : (i === 0) === loanIsC0 ? decimals0 : decimals1;
    return {
      id: i === 0 ? loanId : riskId,
      symbol: (i === 0 ? symbols?.quote : symbols?.risk) ?? "—",
      decimals,
      capacity,
      supplied,
      utilization: util === undefined ? undefined : Number(formatUnits(util, 18)),
      ...capacityState(supplied, capacity),
    };
  });
  const feeds = [0, 1].map((i) => {
    const round = d<readonly [bigint, bigint, bigint, bigint, bigint]>(10 + i * 2);
    const decimals = d<number>(11 + i * 2);
    return {
      symbol: (i === 0 ? symbols?.risk : symbols?.quote) ?? "—",
      updatedAt: round?.[3],
      valid: !!round && round[1] > 0n && round[3] > 0n,
      price: round && decimals !== undefined && round[1] > 0n ? Number(formatUnits(round[1], decimals)) : undefined,
      maxStaleness: c<bigint>(8 + i),
    };
  });
  const fullReserve = reserves.find((r) => r.full);
  return {
    reserves,
    feeds,
    symbols,
    decimals0,
    decimals1,
    loanIsC0,
    lltv: c<bigint>(0),
    liqBonusBps: c<bigint>(1),
    protocolFeeBps: c<bigint>(2),
    stableDepegBps: c<bigint>(10),
    fullReserve,
    capacityUnknown: reserves.some((r) => r.full === undefined),
    async assertCapacity() {
      const fresh = await refetch();
      for (const i of [0, 1]) {
        const raw = fresh.data?.[i * 3]?.result as readonly unknown[] | undefined;
        const supplied = fresh.data?.[i * 3 + 1]?.result as bigint | undefined;
        const state = capacityState(supplied, raw?.[6] as bigint | undefined);
        if (state.full === undefined) throw new Error("Unable to read capacity. Please try again.");
        if (state.full) throw new Error("Capacity reached");
      }
    },
  };
}

export function reserveAmount(value: bigint | undefined, decimals: number | undefined) {
  return value === undefined || decimals === undefined
    ? "—"
    : Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}
export function fullCapacityLabel(reserve: ReturnType<typeof useFarmProtocol>["fullReserve"]) {
  return reserve
    ? `Capacity reached ${reserveAmount(reserve.supplied, reserve.decimals)}/${reserveAmount(reserve.capacity, reserve.decimals)} ${reserve.symbol}`
    : undefined;
}
