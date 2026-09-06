import { useEffect, useState } from "react";
import { formatUnits } from "viem";

import { reserveAmount, useFarmProtocol } from "@/hooks/use-farm-protocol";
import { SOLON_FARMS } from "@/lib/solon-farms";

function duration(seconds: number) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function FarmProtocolPanel() {
  const protocol = useFarmProtocol();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(timer);
  }, []);
  const stable = protocol.feeds[1];
  const deviation = stable.price === undefined ? undefined : (stable.price - 1) * 100;
  const depegLimit = protocol.stableDepegBps === undefined ? undefined : Number(protocol.stableDepegBps) / 100;
  const stableAge = stable.updatedAt === undefined ? undefined : now - Number(stable.updatedAt);
  const stableFresh =
    stable.valid &&
    stableAge !== undefined &&
    stableAge >= 0 &&
    stable.maxStaleness !== undefined &&
    stableAge <= Number(stable.maxStaleness);
  const bps = (value: bigint | undefined) => (value === undefined ? "—" : `${Number(value) / 100}%`);
  const params = [
    [
      "清算线 LLTV",
      protocol.lltv === undefined ? "—" : `${(Number(formatUnits(protocol.lltv, 18)) * 100).toFixed(0)}%`,
    ],
    ["清算奖励", bps(protocol.liqBonusBps)],
    ["协议留存", bps(protocol.protocolFeeBps)],
    [
      "喂价超时",
      protocol.feeds
        .map((f) => `${f.symbol} ${f.maxStaleness === undefined ? "—" : duration(Number(f.maxStaleness))}`)
        .join(" / "),
    ],
    ["脱锚带", depegLimit === undefined ? "—" : `±${depegLimit}%`],
    // No max-leverage getter exists in UniV3DualVault: existing SOLON_FARMS display/input cap.
    ["最大杠杆（前端限额）", `${SOLON_FARMS[0].maxLeverage}x`],
  ];
  return (
    <section
      aria-label="协议状态与限额"
      className="text-primary-foreground w-full min-w-0 max-w-7xl overflow-hidden break-words px-2 lg:px-8"
    >
      <div className="bg-primary overflow-hidden rounded-xl border border-white/10 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/10 px-4 py-3">
          <span className="text-farm-warning bg-farm-warning-subtle rounded-md px-2.5 py-1">软启动 · Sepolia</span>
          {protocol.feeds.map((feed, i) => {
            const age = feed.updatedAt === undefined ? undefined : now - Number(feed.updatedAt);
            const known = feed.valid && age !== undefined && age >= 0 && feed.maxStaleness !== undefined;
            const stale = known && age > Number(feed.maxStaleness);
            return (
              <span key={i} className="text-secondary-foreground">
                {feed.symbol} 喂价 · {known ? `${duration(age)} 前 · ${stale ? "已超时" : "新鲜"}` : "未知"}
              </span>
            );
          })}
          <span className="text-secondary-foreground">
            {stable.symbol} 锚定 {stable.price === undefined ? "—" : `$${stable.price.toFixed(4)}`} · 偏离{" "}
            {deviation === undefined ? "—" : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(3)}%`} ·{" "}
            {deviation === undefined || depegLimit === undefined || !stableFresh
              ? "锚定状态未知"
              : Math.abs(deviation) > depegLimit
                ? "超出脱锚带"
                : "带内"}
          </span>
        </div>
        <div className="grid gap-4 border-b border-white/10 px-4 py-4 sm:grid-cols-2">
          {protocol.reserves.map((reserve, i) => (
            <div key={i} className="min-w-0 overflow-hidden">
              <div className="mb-2 flex min-w-0 flex-wrap justify-between gap-2">
                <span className="text-secondary-foreground">{reserve.symbol} 储备 · 供给上限</span>
                <span className="min-w-0 max-w-full tabular-nums [overflow-wrap:anywhere]">
                  {reserve.unlimited ? (
                    "无上限 · unlimited"
                  ) : (
                    <>
                      {reserveAmount(reserve.supplied, reserve.decimals)} /{" "}
                      {reserveAmount(reserve.capacity, reserve.decimals)}
                      {reserve.percent !== undefined && ` · ${Math.round(reserve.percent)}%`}
                    </>
                  )}
                </span>
              </div>
              {!reserve.unlimited && (
                <>
                  <div
                    role="progressbar"
                    aria-label={`${reserve.symbol} 储备容量`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={reserve.percent}
                    className="h-1.5 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className={`h-full rounded-full ${reserve.near ? "bg-farm-warning" : "bg-morpho-brand"}`}
                      style={{ width: `${reserve.percent ?? 0}%` }}
                    />
                  </div>
                  <p className="text-secondary-foreground mt-2 text-[11px]">
                    剩余 {reserveAmount(reserve.remaining, reserve.decimals)} {reserve.symbol} 可存
                    {reserve.full ? " · 额度已满" : reserve.near ? " · 接近上限" : ""}
                  </p>
                </>
              )}
              <p className="text-secondary-foreground mt-1 text-[11px]">
                借款利用率 {reserve.utilization === undefined ? "—" : `${(reserve.utilization * 100).toFixed(2)}%`} ·{" "}
                {reserve.utilization === undefined
                  ? "距 90% 拐点 —"
                  : reserve.utilization <= 0.9
                    ? `距 90% 拐点 ${((0.9 - reserve.utilization) * 100).toFixed(2)} 个百分点`
                    : `已超过 90% 拐点 ${((reserve.utilization - 0.9) * 100).toFixed(2)} 个百分点`}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {params.map(([label, value]) => (
            <span key={label} className="text-secondary-foreground rounded-md border border-white/10 px-2 py-1">
              {label} <b className="text-primary-foreground font-medium">{value}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
