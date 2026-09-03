import { type AccrualVault } from "@morpho-org/blue-sdk";
import { type Address, type Hex } from "viem";

// Preview-only fixtures for the Earn tab (`?mock` in the URL) — Solon's own vaults don't exist
// on-chain until M1 deploys them, so this lets us review the vault-table UI today.
// Duck-typed stand-ins for AccrualVault: only the fields/methods EarnTable actually reads.

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address;
const AAPL = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" as Address;
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" as Address;
const TSLA = "0x322F0929c4625eD5bAd873c95208D54E1c003b2d" as Address;
const SPY = "0x117cc2133c37b721f49de2a7a74833232b3b4c0c" as Address;

const OWNER = "0x50104051e6C43d61B32D1965a6dC5f4dd4Ac1F6b" as Address;

function pct(x: number): bigint {
  return BigInt(Math.round(x * 1e6)) * 10n ** 12n; // number -> 18-dec bigint
}

function mockVault(args: {
  address: Address;
  name: string;
  apy: number;
  fee: number;
  totalAssets: bigint;
  collaterals: [Address, number, number[]][]; // [token, proportion, lltvs]
}) {
  const collateralAllocations = new Map(
    args.collaterals.map(([token, proportion, lltvs]) => [
      token,
      {
        proportion: pct(proportion),
        lltvs: new Set(lltvs.map(pct)),
        oracles: new Set([OWNER]),
      },
    ]),
  );
  const allocations = new Map<Hex, unknown>();
  return {
    address: args.address,
    owner: OWNER,
    name: args.name,
    asset: USDG,
    timelock: 3n * 24n * 60n * 60n,
    totalAssets: args.totalAssets,
    apy: pct(args.apy),
    fee: pct(args.fee),
    allocations,
    collateralAllocations,
    toAssets: (shares: bigint) => shares,
    getAllocationProportion: () => 0n,
  } as unknown as AccrualVault;
}

const SOLON_CURATOR = {
  Solon: {
    name: "Solon",
    roles: [{ name: "Owner", address: OWNER }],
    url: "https://solonlend.xyz",
    imageSrc: `${import.meta.env.BASE_URL}solon-icon.svg`,
    shouldAlwaysShow: true,
  },
};

export const MOCK_EARN_TOKENS = new Map<Address, { decimals?: number; symbol?: string }>([
  [USDG, { decimals: 6, symbol: "USDG" }],
  [AAPL, { decimals: 18, symbol: "AAPL" }],
  [NVDA, { decimals: 18, symbol: "NVDA" }],
  [TSLA, { decimals: 18, symbol: "TSLA" }],
  [SPY, { decimals: 18, symbol: "SPY" }],
]);

export const MOCK_EARN_ROWS = [
  {
    vault: mockVault({
      address: "0x5010000000000000000000000000000000000001" as Address,
      name: "Solon USDG · Blue Chips",
      apy: 0.062,
      fee: 0.15,
      totalAssets: 262_450_000000n, // 262,450 USDG (6 decimals)
      collaterals: [
        [AAPL, 0.38, [0.625]],
        [NVDA, 0.34, [0.625]],
        [TSLA, 0.28, [0.625]],
      ],
    }),
    isDeadDepositStateValid: true,
    asset: { address: USDG, symbol: "USDG", decimals: 6, imageSrc: undefined },
    curators: SOLON_CURATOR,
    userShares: 0n,
    imageSrc: `${import.meta.env.BASE_URL}solon-icon.svg`,
  },
  {
    vault: mockVault({
      address: "0x5010000000000000000000000000000000000002" as Address,
      name: "Solon USDG · Index",
      apy: 0.048,
      fee: 0.15,
      totalAssets: 118_920_000000n,
      collaterals: [
        [SPY, 0.72, [0.625, 0.77]],
        [AAPL, 0.28, [0.625]],
      ],
    }),
    isDeadDepositStateValid: true,
    asset: { address: USDG, symbol: "USDG", decimals: 6, imageSrc: undefined },
    curators: SOLON_CURATOR,
    userShares: 0n,
    imageSrc: `${import.meta.env.BASE_URL}solon-icon.svg`,
  },
];
