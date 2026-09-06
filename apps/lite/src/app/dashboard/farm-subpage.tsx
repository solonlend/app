import { useOutletContext } from "react-router";
import { type Chain } from "viem";
import { useAccount } from "wagmi";

import { FarmPositions } from "@/components/farm-positions";
import { FarmProtocolPanel } from "@/components/farm-protocol-panel";
import { FarmTable } from "@/components/farm-table";
import { PageHeader } from "@/components/page-header";

/** Farm — leveraged concentrated LP. Separated from Earn: active product with liquidation risk. */
export function FarmSubPage() {
  const { chain } = useOutletContext() as { chain?: Chain };
  const { isConnected } = useAccount();
  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <PageHeader
        title="Farm"
        subtitle="Leveraged concentrated liquidity. Each position borrows both legs of the pair in the ratio the range requires, so nothing is swapped on entry or exit. The debt sits in the same reserves Earn supplies, and clears on the same liquidation terms as any other loan."
        hint={isConnected ? undefined : "Connect wallet to get started"}
      />
      <div className="flex grow flex-col bg-white/[0.03]">
        <div className="bg-linear-to-b from-background to-primary flex h-full grow flex-col items-center rounded-t-xl pb-16 pt-8">
          <FarmProtocolPanel />
          <FarmTable chain={chain} />
          <FarmPositions />
        </div>
      </div>
    </div>
  );
}
