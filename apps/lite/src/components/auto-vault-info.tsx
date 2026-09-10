import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@morpho-org/uikit/components/shadcn/tooltip";
import { abbreviateAddress } from "@morpho-org/uikit/lib/utils";
import { ExternalLink } from "lucide-react";
import { type ReactNode } from "react";

import { type RangeVaultCfg } from "@/lib/solon-range";

/*
  Pair-hover info card for Auto LP rows and the detail header — same structure as the
  leveraged table's pair tooltip (Properties / Tokens), plus a Contracts section for the
  vault + strategy addresses. Everything links to the chain explorer.
*/

function AddrRow({ label, address, explorer }: { label: string; address?: string; explorer: string }) {
  return (
    <div className="flex items-center gap-1">
      <p>
        {label}: <code>{address ? abbreviateAddress(address as `0x${string}`) : "pending deployment"}</code>
      </p>
      {address && (
        <a href={`${explorer}/address/${address}`} rel="noopener noreferrer" target="_blank">
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export function AutoPairInfo({ cfg, children }: { cfg: RangeVaultCfg; children: ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          className="text-primary-foreground max-w-96 rounded-3xl p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="underline">Properties</p>
          <p>DEX: Uniswap V3 (official deployment) · fee tier {cfg.feeLabel}</p>
          <AddrRow label="Pool" address={cfg.pool} explorer={cfg.explorer} />
          <br />
          <p className="underline">Contracts</p>
          <AddrRow label="Vault" address={cfg.vault} explorer={cfg.explorer} />
          <AddrRow label="Strategy" address={cfg.strategy} explorer={cfg.explorer} />
          <br />
          <p className="underline">Tokens (canonical, verified on-chain)</p>
          <AddrRow label={cfg.token0.symbol} address={cfg.token0.address} explorer={cfg.explorer} />
          <AddrRow label={cfg.token1.symbol} address={cfg.token1.address} explorer={cfg.explorer} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
