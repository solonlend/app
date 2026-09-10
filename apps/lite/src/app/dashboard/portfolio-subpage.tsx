import { useLocation, useNavigate, useOutletContext } from "react-router";
import { type Chain } from "viem";
import { useAccount } from "wagmi";

import { PointsSection } from "@/app/dashboard/points-subpage";
import { FarmPortfolio } from "@/components/farm-portfolio";
import { PageHeader } from "@/components/page-header";

/*
  Portfolio — top-level account view (/:chain/portfolio): everything the connected account
  holds on this chain. Currently the two Farm products (Auto LP with cost basis and yield,
  leveraged positions); Earn balances and Borrow debt join as their data surfaces land.
*/

export function PortfolioSubPage() {
  const { chain } = useOutletContext() as { chain?: Chain };
  const { isConnected } = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const chainBase = location.pathname.replace(/\/portfolio(\/.*)?$/i, "");

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <PageHeader
        title="Portfolio"
        subtitle={`Everything about your account on ${chain?.name ?? "this chain"} — Auto LP value, cost and yield, leveraged positions, and your points.`}
        hint={isConnected ? undefined : "Connect wallet to see your positions"}
      />
      <div className="flex grow flex-col bg-white/[0.03]">
        <div className="bg-linear-to-b from-background to-primary flex h-full grow flex-col items-center rounded-t-xl pb-16 pt-8">
          <FarmPortfolio chainId={chain?.id} onOpenVault={(slug) => void navigate(`${chainBase}/farm/auto/${slug}`)} />
          <div className="mt-10 flex w-full max-w-7xl flex-col px-2 lg:px-8">
            <PointsSection />
          </div>
        </div>
      </div>
    </div>
  );
}
