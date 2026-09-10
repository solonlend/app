import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { farmVaultAbi } from "@/lib/farm-vault-abi";
import { RH_MAINNET as P } from "@/lib/solon-farms";

/*
  Shared scan of the connected account's leveraged positions (extracted from FarmPositions so
  the Portfolio Risk section reads the same data): recent position ids → ownerOf filter →
  positions/positionValue/totalDebtInLoan/isHealthy batch. RH mainnet vault, 30s stale time.
*/

const MAX_SCAN = 50n; // scan the most recent ids

export type FarmPos = {
  id: bigint;
  debtRisk: bigint;
  debtLoan: bigint;
  debtRiskAmt: bigint; // WETH leg debt (18 decimals)
  debtLoanAmt: bigint; // USDG leg debt (6 decimals)
  tickLower: number;
  tickUpper: number;
  value: number; // USDG
  debt: number; // USDG
  healthy: boolean;
};

export function farmHealthUsage(value: number, debt: number, lltv: bigint | undefined): number | undefined {
  if (lltv === undefined || lltv <= 0n) return undefined;
  return value > 0 ? debt / (value * Number(formatUnits(lltv, 18))) : 0; // 1.0 = liquidation line
}

export function useFarmPositions() {
  const { address: user, isConnected } = useAccount();

  const { data: lltv } = useReadContract({
    chainId: P.chainId,
    address: P.vault,
    abi: farmVaultAbi,
    functionName: "LLTV",
    query: { staleTime: Infinity },
  });

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

  const positions: FarmPos[] = useMemo(() => {
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
      .filter((x): x is FarmPos => !!x && x.value > 0);
  }, [myIds, details]);

  const refetch = () => {
    void r0();
    void r1();
    void r2();
  };

  return { positions, lltv, isConnected, refetch };
}
