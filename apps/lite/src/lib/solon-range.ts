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
    vault: undefined,
    strategy: undefined,
    pool: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca",
    token0: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "ETH", decimals: 18 },
    token1: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
    explorer: "https://robinhoodchain.blockscout.com",
  },
  {
    // RH NVDA/USDG 0.05% — candidate pool #2 (2026-09-10 gateway pull: TVL $7.9M, fee APR ~68-74%).
    // Coming-soon until deployed. NOTE before deploying: token1 is NVDA, so TVL/My-deposit render
    // in NVDA units — the USD/stable quote source must land first (list sorting assumes token1
    // is a stable quote; harmless while undeployed since reads stay disabled).
    chainId: 4663,
    testnet: false,
    slug: "nvda-usdg",
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
    // RH SPY/WETH 0.05% — candidate pool #3 (gateway pull: TVL $1.9M, fee APR ~91-125%). Same
    // token1-quote caveat as above (token1 = SPY). Coming-soon until deployed.
    chainId: 4663,
    testnet: false,
    slug: "spy-weth",
    pair: "SPY / WETH",
    feeLabel: "0.05%",
    vault: undefined,
    strategy: undefined,
    pool: "0xDDCBBa3666f578E3F09516f21Ff85BFee859AB5e",
    token0: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "WETH", decimals: 18 },
    token1: { address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", symbol: "SPY", decimals: 18 },
    explorer: "https://robinhoodchain.blockscout.com",
  },
  {
    // Sepolia rehearsal instance (deployments/sepolia-clm-2026-09-09.md) — testnet playground only.
    chainId: 11155111,
    testnet: true,
    slug: "eth-usdg",
    pair: "ETH / USDG",
    feeLabel: "0.01%",
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
