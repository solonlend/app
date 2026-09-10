import { useEffect } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { type Chain } from "viem";
import { useAccount } from "wagmi";

import { AutoVaultDetail } from "@/components/auto-vault-detail";
import { AutoVaultList } from "@/components/auto-vault-list";
import { FarmPositions } from "@/components/farm-positions";
import { FarmProtocolPanel } from "@/components/farm-protocol-panel";
import { FarmTable } from "@/components/farm-table";
import { PageHeader } from "@/components/page-header";
import { resolveFarmRoute } from "@/lib/auto-vault-nav";
import { findRangeVault } from "@/lib/solon-range";

/*
  Farm — two product tabs with opposite risk profiles (DESIGN-farm-tabs-v1 §E):
    /farm/leverage         Leveraged concentrated LP (borrow to amplify, liquidation risk) — default
    /farm/auto             Auto LP vault list (directory + entry point)
    /farm/auto/:vault      Auto LP vault detail (slug-addressed, shareable)
  Legacy /farm/range[/:vault] replace-redirects to the auto equivalent; /farm and unknown
  values normalize to leverage. All URL resolution lives in resolveFarmRoute (unit-tested).
*/

const TABS = [
  { key: "leverage", label: "Leveraged", risk: "borrow to amplify · liquidation risk" },
  { key: "auto", label: "Auto", risk: "auto-compound · auto-rebalance · no leverage" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** NEW badge on the Range tab until this date (hard-coded so it retires itself). */
const RANGE_NEW_UNTIL = Date.parse("2026-10-15");

const SUBTITLES: Record<TabKey, string> = {
  leverage:
    "Leveraged concentrated liquidity. Each position borrows both legs of the pair in the ratio the range requires, so nothing is swapped on entry or exit. The debt sits in the same reserves Earn supplies, and clears on the same liquidation terms as any other loan.",
  auto: "Deposit both tokens and the vault does the rest: it auto-compounds trading fees and auto-rebalances the range as price moves. Your principal is never swapped. No leverage, no liquidation.",
};

export function FarmSubPage() {
  const { chain } = useOutletContext() as { chain?: Chain };
  const { isConnected } = useAccount();
  const { tab, vault } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Absolute base ending in "/farm" — relative navigation is ambiguous between /farm and /farm/:tab.
  const farmBase = location.pathname.replace(/\/farm(\/.*)?$/i, "/farm");

  const route = resolveFarmRoute(tab, vault, (s) => findRangeVault(chain?.id, s) !== undefined);
  const active: TabKey = route.view === "leverage" ? "leverage" : "auto";
  // Legacy /farm/range[/:vault], /farm, unknown tabs and bad slugs normalize via client replace.
  // /farm/portfolio moved to the top-level /portfolio page — send old links there.
  useEffect(() => {
    if (route.view === "portfolio") {
      void navigate(farmBase.replace(/\/farm$/, "/portfolio"), { replace: true });
    } else if (route.redirect) {
      void navigate(`${farmBase}/${route.redirect}`, { replace: true });
    }
  }, [route.view, route.redirect, navigate, farmBase]);

  const detailCfg = route.view === "auto-detail" ? findRangeVault(chain?.id, route.slug) : undefined;

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <PageHeader
        title="Farm"
        subtitle={SUBTITLES[active]}
        hint={isConnected ? undefined : "Connect wallet to get started"}
      />
      {/* Product tabs — URL-driven, same width rail as the content below */}
      <div className="mx-auto w-full max-w-7xl px-2 pb-4 lg:px-8">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => void navigate(`${farmBase}/${t.key}`)}
              className={`flex flex-col items-start rounded-xl border px-4 py-2.5 text-left transition-colors ${
                active === t.key
                  ? "border-white/20 bg-white/[0.08]"
                  : "border-white/[0.06] bg-transparent hover:bg-white/[0.04]"
              }`}
            >
              <span className="text-primary-foreground flex items-center gap-2 text-sm font-medium">
                {t.label}
                {t.key === "auto" && Date.now() < RANGE_NEW_UNTIL && (
                  <span className="text-morpho-brand rounded-sm bg-white/[0.08] px-1 py-0.5 font-mono text-[9px] tracking-wide">
                    NEW
                  </span>
                )}
              </span>
              <span className="text-secondary-foreground hidden text-[11px] font-light sm:block">{t.risk}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex grow flex-col bg-white/[0.03]">
        <div className="bg-linear-to-b from-background to-primary flex h-full grow flex-col items-center rounded-t-xl pb-16 pt-8">
          {active === "leverage" ? (
            <>
              <FarmProtocolPanel />
              <FarmTable chain={chain} />
              <FarmPositions />
            </>
          ) : detailCfg ? (
            <AutoVaultDetail cfg={detailCfg} onBack={() => void navigate(`${farmBase}/auto`)} />
          ) : (
            <AutoVaultList chainId={chain?.id} onOpen={(slug) => void navigate(`${farmBase}/auto/${slug}`)} />
          )}
        </div>
      </div>
    </div>
  );
}
