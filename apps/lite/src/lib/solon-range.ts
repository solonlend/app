import { type Address } from "viem";

/**
 * Solon Range Vaults (CLM fork, 1x auto-managed concentrated liquidity).
 * Chain-driven config: the Sepolia entry is live for interactive verification; the RH mainnet
 * entry stays `vault: undefined` (renders as "coming soon") until the mainnet pair is deployed —
 * then filling in the three addresses lights the module up with no further code changes.
 */
export type RangeVaultCfg = {
  chainId: number;
  testnet: boolean;
  /** URL segment for /farm/auto/:vault — human-readable, unique within a chain. */
  slug: string;
  /** Which token is the USD-stable quote leg (SPEC §5 v1.7): all quote values fold into it. */
  stableLeg: 0 | 1;
  /** Equity/ETF leg pools: underlying market closes overnight/weekends while the pool trades. */
  marketHours?: boolean;
  pair: string;
  /** Pool fee tier, display form ("0.01%"). */
  feeLabel: string;
  vault?: Address;
  strategy?: Address;
  pool?: Address;
  /** Block the vault was deployed at — lower bound for event scans (user PnL). */
  deployBlock?: number;
  token0: { address: Address; symbol: string; decimals: number };
  token1: { address: Address; symbol: string; decimals: number };
  explorer: string;
};

export const RANGE_VAULTS: RangeVaultCfg[] = [
  {
    // Robinhood Chain mainnet — deployment pending sign-off; coming-soon card until addresses land.
    chainId: 4663,
    testnet: false,
    slug: "eth-usdg",
    pair: "ETH / USDG",
    feeLabel: "0.01%",
    stableLeg: 1,
    vault: undefined,
    strategy: undefined,
    pool: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca",
    token0: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "ETH", decimals: 18 },
    token1: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
    explorer: "https://robinhoodchain.blockscout.com",
  },
  {
    // RH NVDA/USDG 0.05% — candidate pool #2 (2026-09-10 gateway pull: TVL $7.9M, fee APR ~68-74%).
    // Coming-soon until deployed. stableLeg=0: USDG is token0 on-chain, quotes fold into it
    // (SPEC §5 v1.7); deployBlock must still be filled on deploy day.
    chainId: 4663,
    testnet: false,
    slug: "nvda-usdg",
    stableLeg: 0,
    marketHours: true,
    pair: "NVDA / USDG",
    feeLabel: "0.05%",
    vault: undefined,
    strategy: undefined,
    pool: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3",
    token0: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
    token1: { address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", symbol: "NVDA", decimals: 18 },
    explorer: "https://robinhoodchain.blockscout.com",
  },
  {
    // RH GLD/USDG 0.3% — first-batch candidate #3 (2026-09-11 gateway pull: TVL $4.8M, gross fee
    // APR ~51%). Gold ETF leg = mild volatility, IL-friendly. stableLeg=0 quoting.
    // Coming-soon until deployed (deployBlock on deploy day). Replaced SPY/WETH (out of top-10 TVL, both
    // legs volatile) per 2026-09-11 first-batch decision.
    chainId: 4663,
    testnet: false,
    slug: "gld-usdg",
    stableLeg: 0,
    marketHours: true,
    pair: "GLD / USDG",
    feeLabel: "0.3%",
    vault: undefined,
    strategy: undefined,
    pool: "0x7A6A053eCCf1446A2633E05aA6D40D09381997ec",
    token0: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
    token1: { address: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", symbol: "GLD", decimals: 18 },
    explorer: "https://robinhoodchain.blockscout.com",
  },
  {
    // RH SGOV/USDG 0.3% — first-batch candidate #4 (2026-09-11 gateway pull: TVL $5.1M, gross fee
    // APR ~16%). Short-treasury ETF: price barely moves, IL≈0 — the conservative "fixed-income-
    // like" entry. stableLeg=0 quoting. Coming-soon until deployed (deployBlock on deploy day).
    chainId: 4663,
    testnet: false,
    slug: "sgov-usdg",
    stableLeg: 0,
    marketHours: true,
    pair: "SGOV / USDG",
    feeLabel: "0.3%",
    vault: undefined,
    strategy: undefined,
    pool: "0xfAb520051f96F4D2a32c22B6a3dD7fFfdf231bFe",
    token0: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
    token1: { address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", symbol: "SGOV", decimals: 18 },
    explorer: "https://robinhoodchain.blockscout.com",
  },
  {
    // Sepolia rehearsal instance (deployments/sepolia-clm-2026-09-09.md) — testnet playground only.
    chainId: 11155111,
    testnet: true,
    slug: "eth-usdg",
    pair: "ETH / USDG",
    feeLabel: "0.01%",
    stableLeg: 1,
    vault: "0x7C0cCcCB2C41e3DE01b4cB0Ba7d0EbdA11bb3701",
    strategy: "0x8352d9Df9006c21Cfc4dCaeBA8ec91Dae4Af8F4F",
    pool: "0x81ffB0C7127e90212f85cc825e9ecA8056A28A02",
    deployBlock: 11650000, // safe floor: deployed 2026-09-09, chain was ~11,672k on 09-10
    token0: { address: "0x5Fb4b5AA8f408389cA96E7e5B9cFF014A8176563", symbol: "ETH", decimals: 18 },
    token1: { address: "0xB89b8f4d12bDFf564FF475832DE683dAF0911cDb", symbol: "USDG", decimals: 6 },
    explorer: "https://sepolia.etherscan.io",
  },
];

/** All Auto LP vaults configured for a chain (falls back to the first chain when disconnected). */
export function rangeVaultsForChain(chainId: number | undefined): RangeVaultCfg[] {
  const own = RANGE_VAULTS.filter((v) => v.chainId === chainId);
  return own.length > 0 ? own : RANGE_VAULTS.filter((v) => v.chainId === RANGE_VAULTS[0].chainId);
}

export function findRangeVault(chainId: number | undefined, slug: string | undefined): RangeVaultCfg | undefined {
  if (slug === undefined) return undefined;
  return rangeVaultsForChain(chainId).find((v) => v.slug === slug);
}

export const rangeVaultAbi = [
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "isCalm", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "previewDeposit",
    stateMutability: "view",
    inputs: [
      { name: "_amount0", type: "uint256" },
      { name: "_amount1", type: "uint256" },
    ],
    outputs: [
      { name: "shares", type: "uint256" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
      { name: "fee0", type: "uint256" },
      { name: "fee1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "previewWithdraw",
    stateMutability: "view",
    inputs: [{ name: "_shares", type: "uint256" }],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { name: "_minShares", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_shares", type: "uint256" },
      { name: "_minAmount0", type: "uint256" },
      { name: "_minAmount1", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const rangeStrategyAbi = [
  {
    type: "function",
    name: "range",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "lowerPrice", type: "uint256" },
      { name: "upperPrice", type: "uint256" },
    ],
  },
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "lastPositionAdjustment",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** strategy.price()/range() are token1-per-token0 encoded at 1e36 with a dec0−dec1 skew; normalize to a human number. */
export function rangePriceToHuman(p: bigint, dec0: number, dec1: number): number {
  return (Number(p) / 1e36) * 10 ** (dec0 - dec1);
}
