import { type Address } from "viem";

/**
 * Solon leveraged-LP farm pools (single- and dual-borrow vaults on Uniswap V3, Robinhood Chain).
 *
 * The V3 dual-borrow and V3 single-borrow vaults are LIVE on Robinhood Chain since 2026-09-07
 * (scaled soft launch — small reserve caps, single operator key, external audit pending). V4 vaults
 * are built and tested but not yet deployed, so those entries stay `status: "soon"` with `vault`
 * undefined. `feeAprSnapshot` is a manually refreshed 24h snapshot from the DEX interface — NOT live
 * data; refresh `snapshotDate` whenever it's updated. Everything marked estimate is labeled in the UI.
 */
export type FarmPool = {
  id: string;
  pair: string;
  token0Symbol: string;
  token1Symbol: string;
  loanIsC0: boolean; // quote is token0 when true; the other token is the risk asset
  token0Address?: Address;
  token1Address?: Address;
  dex: "Uniswap V3" | "Uniswap V4";
  borrowMode: "dual" | "single"; // dual-borrow both legs, or single-borrow the loan asset (classic leverage)
  feeTierBps: number; // e.g. 100 = 0.01%
  feeLabel?: string; // overrides the % label (e.g. dynamic-fee v4 pools)
  poolAddress?: Address; // V3 pool (readable TVL); V4 sits inside the singleton PoolManager
  v4PoolId?: `0x${string}`;
  maxLeverage: number; // display cap (shipped 4x at LLTV 77%)
  lltvPercent: number;
  feeAprSnapshot: number; // fraction, e.g. 0.9427
  snapshotDate: string;
  vault?: Address; // leverage vault (set once deployed on mainnet)
  vaultId?: number; // SolonVaultRegistry id
  status: "soon" | "live";
  flagship?: boolean;
  note?: string; // honest caveat shown in the row tooltip
};

/** Candidate pools (new assets, no Chainlink feed yet — oracle design pending, own red-team round required). */
export type CandidatePool = {
  pair: string;
  dexLabel: string;
  tvlSnapshot: string; // manual snapshot from DEX interface
  feeAprSnapshot: string;
  blocker: string;
};

/** Robinhood Chain (4663) — addresses verified on-chain, see leverage OPS BOARD §06. */
export const WETH_RH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;
export const USDG_RH = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
export const ETH_USD_FEED_RH = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9" as Address;

export const SOLON_FARMS: FarmPool[] = [
  {
    id: "eth-usdg-v3-100-dual",
    pair: "ETH / USDG",
    token0Symbol: "WETH",
    token1Symbol: "USDG",
    loanIsC0: false,
    token0Address: WETH_RH,
    token1Address: USDG_RH,
    dex: "Uniswap V3",
    borrowMode: "dual",
    feeTierBps: 100,
    poolAddress: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca" as Address,
    maxLeverage: 4,
    lltvPercent: 77,
    feeAprSnapshot: 0.9427,
    snapshotDate: "2026-09-04",
    vault: "0x9Db7aDa64D1E8b856E15D916d886797501F28ce0" as Address,
    vaultId: 1,
    status: "live",
    flagship: true,
    note: "Live on Robinhood Chain (soft launch): USDG reserve cap 200, credit 100 USDG + 0.04 WETH. Size accordingly; re-verify on-chain.",
  },
  {
    id: "eth-usdg-v3-100-single",
    pair: "ETH / USDG",
    token0Symbol: "WETH",
    token1Symbol: "USDG",
    loanIsC0: false,
    token0Address: WETH_RH,
    token1Address: USDG_RH,
    dex: "Uniswap V3",
    borrowMode: "single",
    feeTierBps: 100,
    poolAddress: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca" as Address,
    maxLeverage: 4,
    lltvPercent: 77,
    feeAprSnapshot: 0.9427,
    snapshotDate: "2026-09-04",
    vault: "0x9e100d524DFEa1Aa76286A7F00682e72F79aC3aE" as Address,
    vaultId: 2,
    status: "live",
    note: "Classic single-borrow leverage (borrows USDG only). Shares the same pool and reserves as the dual vault; soft-launch credit 60 USDG.",
  },
  {
    id: "eth-usdg-v4-100",
    pair: "ETH / USDG",
    token0Symbol: "WETH",
    token1Symbol: "USDG",
    loanIsC0: false,
    token0Address: WETH_RH,
    token1Address: USDG_RH,
    dex: "Uniswap V4",
    borrowMode: "dual",
    feeTierBps: 100,
    feeLabel: "dyn",
    v4PoolId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    maxLeverage: 4,
    lltvPercent: 77,
    feeAprSnapshot: 0,
    snapshotDate: "2026-09-04",
    status: "soon",
    note: "WETH/USDG fee-100 v4 pool is initialized on mainnet but holds zero liquidity today; the $8M v4 ETH/USDG pool uses native ETH + a dynamic-fee hook, which the vault does not support yet (v1.5).",
  },
];

/**
 * 新兴资产候选(用户点名 PONS/CASHCAT/AI 等,meme 生态 TVL 与深度已可观)。
 * 硬闸:这些对没有 Chainlink 喂价 —— 清算估值只能依赖池价(可操纵),正是主推池在结构上免疫
 * 的攻击面。上线前置:长窗口 TWAP 预言机 + 保守 LLTV(~38.5%) + 小额度上限 + 独立红队轮。
 * 数字为 DEX 界面人工快照(2026-09-04),仅供评估。
 */
export const CANDIDATE_POOLS: CandidatePool[] = [
  { pair: "PONS / ETH", dexLabel: "V3 · 1%", tvlSnapshot: "$6.23M", feeAprSnapshot: "438%", blocker: "no price feed" },
  {
    pair: "CASHCAT / ETH",
    dexLabel: "V3 · 1%",
    tvlSnapshot: "$5.37M",
    feeAprSnapshot: "392%",
    blocker: "no price feed",
  },
  { pair: "PONS / USDG", dexLabel: "V3 · 1%", tvlSnapshot: "$3.52M", feeAprSnapshot: "263%", blocker: "no price feed" },
  {
    pair: "CASHCAT / ETH",
    dexLabel: "V3 · 0.3%",
    tvlSnapshot: "$3.34M",
    feeAprSnapshot: "629%",
    blocker: "no price feed",
  },
  {
    pair: "AI / NVDA",
    dexLabel: "V4 · dyn · Doppler",
    tvlSnapshot: "$5.61M",
    feeAprSnapshot: "179%",
    blocker: "no feed + hook",
  },
];

/** Rough borrow cost assumption for the net-APY estimate until the dual-reserve pool is live on mainnet. */
export const EST_BORROW_APR = 0.08;

/** feeApr·L − borrowApr·(L−1); labeled as estimate in the UI. */
export function estimateNetApy(feeApr: number, leverage: number, borrowApr = EST_BORROW_APR): number {
  return feeApr * leverage - borrowApr * (leverage - 1);
}

/**
 * 双借的年化借款成本(USDG 计价):两条腿各按各自储备的 borrow APR 计息,不能用一个混合利率反推。
 * riskValue/loanValue = 各腿借款折成 USDG 的价值。
 */
export function borrowCostDual(riskValue: number, riskApr: number, loanValue: number, loanApr: number): number {
  return riskValue * riskApr + loanValue * loanApr;
}

/** 借款构成加权后的等效利率,仅用于展示"整体借款成本相当于百分之几"。 */
export function blendedBorrowApr(riskValue: number, riskApr: number, loanValue: number, loanApr: number): number {
  const total = riskValue + loanValue;
  return total > 0 ? borrowCostDual(riskValue, riskApr, loanValue, loanApr) / total : 0;
}

/**
 * 权益口径净 APY:(费用收入 − 两腿利息) / 权益。
 * 与 estimateNetApy 的区别是借款成本按实际两腿构成算,所以单币/双币保证金会给出不同的数 —— 这正是应有的。
 */
export function netApyDual(args: {
  feeApr: number;
  positionValue: number;
  equity: number;
  riskValue: number;
  riskApr: number;
  loanValue: number;
  loanApr: number;
}): number {
  const { feeApr, positionValue, equity, riskValue, riskApr, loanValue, loanApr } = args;
  if (equity <= 0) return 0;
  return (feeApr * positionValue - borrowCostDual(riskValue, riskApr, loanValue, loanApr)) / equity;
}

/** Sepolia testnet playground — deployment recorded in leverage/deployments/sepolia-2026-09-06.md. Mock tokens are open-mint. */
export const SEPOLIA_PLAYGROUND = {
  chainId: 11155111,
  testnet: true,
  vault: "0x76C3F4730098dfAc400125E7ae16636C566B8009" as Address,
  weth: "0x5Fb4b5AA8f408389cA96E7e5B9cFF014A8176563" as Address,
  usdg: "0xB89b8f4d12bDFf564FF475832DE683dAF0911cDb" as Address,
  oracle: "0xd68B55abA9BF89094035fcB0A1dc0585A85c9fd4" as Address,
  pool: "0x81ffB0C7127e90212f85cc825e9ecA8056A28A02" as Address,
  lending: "0x1C8331c1DE3BF11CCc68Fb763b1054e891BF450e" as Address,
  explorer: "https://sepolia.etherscan.io",
};

/**
 * Robinhood Chain mainnet farm config, live 2026-09-07. Drop-in shape-compatible with
 * SEPOLIA_PLAYGROUND (so the interactive components can repoint by swapping the import), plus a
 * `vaults` map for the two-vault mainnet reality. `vault` defaults to the flagship dual-borrow vault;
 * per-vault code should read `vaults.dual` / `vaults.single`. Real USDG/WETH — no mock mint.
 */
export const RH_MAINNET = {
  chainId: 4663,
  testnet: false,
  vault: "0x9Db7aDa64D1E8b856E15D916d886797501F28ce0" as Address, // flagship = dual
  vaults: {
    dual: "0x9Db7aDa64D1E8b856E15D916d886797501F28ce0" as Address, // vaultId 1
    single: "0x9e100d524DFEa1Aa76286A7F00682e72F79aC3aE" as Address, // vaultId 2, borrows USDG only
  },
  weth: WETH_RH,
  usdg: USDG_RH,
  oracle: "0x52b5728D1086b0B68d98DD51ee6544d87062Ef0f" as Address,
  pool: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca" as Address,
  lending: "0xA4af5515A7DE8E1661C92d3246296Ff3a48791Dd" as Address,
  explorer: "https://robinhoodchain.blockscout.com",
};

/** Back-compat alias: the funding side reads the same mainnet config. */
export const RH_FARM_LENDING = RH_MAINNET;
