import { Avatar, AvatarFallback, AvatarImage } from "@morpho-org/uikit/components/shadcn/avatar";
import { type Address } from "viem";

import { monogramURI } from "@/lib/monogram";
import { type RangeVaultCfg } from "@/lib/solon-range";
import { getTokenURI } from "@/lib/tokens";

/*
  Paired token icons for Auto LP rows/headers — same Avatar treatment as the leveraged
  table's PairCell so the two Farm tabs read as one product. Icons follow the DISPLAY
  order of cfg.pair (risk asset first), not on-chain token0/token1 (equity pools sort
  USDG as token0 by address).
*/
export function AutoPairIcons({ cfg }: { cfg: RangeVaultCfg }) {
  const bySymbol = new Map([cfg.token0, cfg.token1].map((t) => [t.symbol, t]));
  const tokens = cfg.pair
    .split("/")
    .map((s) => bySymbol.get(s.trim()))
    .filter((t) => t !== undefined);
  const ordered = tokens.length === 2 ? tokens : [cfg.token0, cfg.token1];
  const iconSrc = (symbol: string, address: Address) =>
    symbol === "WETH" || symbol === "ETH"
      ? `${import.meta.env.BASE_URL}eth-logo.svg`
      : getTokenURI({ symbol, address, chainId: cfg.chainId });
  return (
    <span className="flex -space-x-2">
      {ordered.map((t, i) => (
        <Avatar key={i} className="h-6 w-6">
          <AvatarImage src={iconSrc(t.symbol, t.address)} alt={t.symbol} />
          <AvatarFallback delayMs={500}>
            <img src={monogramURI(t.symbol)} alt={t.symbol} />
          </AvatarFallback>
        </Avatar>
      ))}
    </span>
  );
}
