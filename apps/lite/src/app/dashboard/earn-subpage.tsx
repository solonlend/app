import {
  AccrualPosition,
  AccrualVault,
  MarketId,
  Vault,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/uikit/assets/abis/meta-morpho";
import { metaMorphoFactoryAbi } from "@morpho-org/uikit/assets/abis/meta-morpho-factory";
import useContractEvents from "@morpho-org/uikit/hooks/use-contract-events/use-contract-events";
import {
  getDeadDepositsBitmap,
  readAccrualVaults,
  readAccrualVaultsStateOverride,
  vaultHasDeadDeposits,
} from "@morpho-org/uikit/lens/read-vaults";
import { CORE_DEPLOYMENTS, getContractDeploymentInfo } from "@morpho-org/uikit/lib/deployments";
import { Token } from "@morpho-org/uikit/lib/utils";
import { useEffect, useMemo } from "react";
import { useOutletContext } from "react-router";
import { type Address, type Chain, erc20Abi, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { EarnTable } from "@/components/earn-table";
import { FarmLendingVaults } from "@/components/farm-lending-vaults";
import { PageHeader } from "@/components/page-header";
import { useMarkets } from "@/hooks/use-markets";
import * as Merkl from "@/hooks/use-merkl-campaigns";
import { useMerklOpportunities } from "@/hooks/use-merkl-opportunities";
import { useSolonVault } from "@/hooks/use-solon-vault";
import { useTopNCurators } from "@/hooks/use-top-n-curators";
import { getDisplayableCurators } from "@/lib/curators";
import { getDeploylessMode, getShouldEnforceDeadDeposit } from "@/lib/overrides";
import { SOLON_VAULT } from "@/lib/solon-markets";
import { MOCK_EARN_TOKENS } from "@/lib/solon-mock";
import { getTokenURI } from "@/lib/tokens";

const STALE_TIME = 5 * 60 * 1000;

export function EarnSubPage() {
  const { status, isConnected, address: userAddress } = useAccount();
  const { chain } = useOutletContext() as { chain?: Chain };
  const chainId = chain?.id;

  const shouldUseDeploylessReads = getDeploylessMode(chainId) === "deployless";
  const shouldEnforceDeadDeposit = getShouldEnforceDeadDeposit(chainId);

  const [morpho, factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "Morpho"),
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  const lendingRewards = useMerklOpportunities({ chainId, side: Merkl.CampaignSide.EARN, userAddress });

  // MARK: Index `MetaMorphoFactory.CreateMetaMorpho` on all factory versions to get a list of all vault addresses
  const fromBlock = factory?.fromBlock ?? factoryV1_1?.fromBlock;
  const {
    logs: { all: createMetaMorphoEvents },
    fractionFetched,
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factoryV1_1 ? [factoryV1_1.address].concat(factory ? [factory.address] : []) : [],
    fromBlock,
    toBlock: "finalized",
    reverseChronologicalOrder: true,
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined && fromBlock !== undefined },
  });
  const vaultAddresses = useMemo(
    () => createMetaMorphoEvents.map((ev) => ev.args.metaMorpho),
    [createMetaMorphoEvents],
  );

  // MARK: Fetch additional data for whitelisted vaults
  const curators = useTopNCurators({ n: "all", verifiedOnly: true, chainIds: [...CORE_DEPLOYMENTS] });
  const { data: vaultsData } = useReadContract({
    chainId,
    ...readAccrualVaults(
      morpho?.address ?? "0x",
      vaultAddresses,
      curators.flatMap(
        (curator) =>
          curator.addresses?.filter((entry) => entry.chainId === chainId).map((entry) => entry.address as Address) ??
          [],
      ),
      // @ts-expect-error function signature overloading was meant for hard-coded `true` or `false`
      shouldUseDeploylessReads,
    ),
    stateOverride: shouldUseDeploylessReads ? undefined : [readAccrualVaultsStateOverride()],
    query: {
      enabled: chainId !== undefined && fractionFetched > 0.99 && !!morpho?.address,
      staleTime: STALE_TIME,
      gcTime: Infinity,
      notifyOnChangeProps: ["data"],
    },
  });

  // Logging of whitelisting status to help curators diagnose their situation.
  useEffect(() => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    if (!urlSearchParams.has("dev")) {
      return;
    }

    for (const ev of createMetaMorphoEvents) {
      if (vaultsData?.some((vd) => vd.vault.vault === ev.args.metaMorpho)) continue;
      console.log(`Skipping vault '${ev.args.name}' (${ev.args.metaMorpho}):
- ❌ owner is not whitelisted
`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultsData]);

  const marketIds = useMemo(() => [...new Set(vaultsData?.flatMap((d) => d.vault.withdrawQueue) ?? [])], [vaultsData]);
  const markets = useMarkets({ chainId, marketIds, staleTime: STALE_TIME });
  const { vaults, hasDeadDeposits } = useMemo(() => {
    const vaults: AccrualVault[] = [];
    const hasDeadDeposits = new Map<Address, boolean>();
    vaultsData?.forEach((vaultData) => {
      const { vault: address, supplyQueue, withdrawQueue, ...iVault } = vaultData.vault;
      // NOTE: pending values are placeholders
      const vault = new Vault({
        ...iVault,
        address,
        supplyQueue: supplyQueue as MarketId[],
        withdrawQueue: withdrawQueue as MarketId[],
        pendingOwner: zeroAddress,
        pendingGuardian: { value: zeroAddress, validAt: 0n },
        pendingTimelock: { value: 0n, validAt: 0n },
      });

      const shouldSkipVault =
        vault.name === "" || vaultData.allocations.some((allocation) => markets[allocation.id] === undefined);

      if (shouldSkipVault) {
        const urlSearchParams = new URLSearchParams(window.location.search);
        if (urlSearchParams.has("dev")) {
          // Detailed logging of filtering reason to help curators diagnose their situation.
          console.log(`Skipping vault '${vault.name}':
- ${vault.name === "" ? "❌" : "✅"} name is defined
- ${vaultData.allocations.some((allocation) => markets[allocation.id] === undefined) ? "❌" : "✅"} fetched constituent markets
- ${shouldEnforceDeadDeposit && !hasDeadDeposits ? "❌" : "✅"} has dead deposits (${getDeadDepositsBitmap(vaultData)})
`);
        }
        return;
      }

      // NOTE: pending values and `publicAllocatorConfig` are placeholders
      const allocations = vaultData.allocations.map((allocation) => {
        const market = markets[allocation.id];

        return new VaultMarketAllocation({
          config: new VaultMarketConfig({
            vault: address,
            marketId: allocation.id as MarketId,
            cap: allocation.config.cap,
            pendingCap: { value: 0n, validAt: 0n },
            removableAt: allocation.config.removableAt,
            enabled: allocation.config.enabled,
            publicAllocatorConfig: new VaultMarketPublicAllocatorConfig({
              vault: address,
              marketId: allocation.id as MarketId,
              maxIn: 0n,
              maxOut: 0n,
            }),
          }),
          position: new AccrualPosition({ user: address, ...allocation.position }, market),
        });
      });

      vaults.push(new AccrualVault(vault, allocations));
      hasDeadDeposits.set(vault.address, vaultHasDeadDeposits(vaultData));
    });
    vaults.sort((a, b) => (a.netApy > b.netApy ? -1 : 1));
    return { vaults, hasDeadDeposits };
  }, [shouldEnforceDeadDeposit, vaultsData, markets]);

  // MARK: Fetch metadata for every ERC20 asset
  const tokenAddresses = useMemo(() => {
    const tokenAddressesSet = new Set(
      vaults.map((vault) => [vault.asset, ...vault.collateralAllocations.keys()]).flat(),
    );
    tokenAddressesSet.delete(zeroAddress);
    const tokenAddresses = [...tokenAddressesSet];
    tokenAddresses.sort(); // sort so that any query keys derived from this don't change
    return tokenAddresses;
  }, [vaults]);

  const { data: tokenData } = useReadContracts({
    contracts: tokenAddresses
      .map((asset) => [
        { chainId, address: asset, abi: erc20Abi, functionName: "symbol" } as const,
        { chainId, address: asset, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const tokens = useMemo(() => {
    const tokens = new Map<Address, { decimals?: number; symbol?: string }>();
    tokenAddresses.forEach((tokenAddress, idx) => {
      const symbol = tokenData?.[idx * 2 + 0].result as string | undefined;
      const decimals = tokenData?.[idx * 2 + 1].result as number | undefined;
      tokens.set(tokenAddress, { decimals, symbol });
    });
    return tokens;
  }, [tokenAddresses, tokenData]);

  // MARK: Fetch user's balance in each vault
  const { data: balanceOfData, refetch: refetchBalanceOf } = useReadContracts({
    contracts: vaultsData?.map(
      (vaultData) =>
        ({
          chainId,
          address: vaultData.vault.vault,
          abi: metaMorphoAbi,
          functionName: "balanceOf",
          args: userAddress && [userAddress],
        }) as const,
    ),
    allowFailure: false,
    query: {
      enabled: chainId !== undefined && !!userAddress,
      staleTime: STALE_TIME,
      gcTime: Infinity,
    },
  });

  const userShares = useMemo(
    () => Object.fromEntries(vaultsData?.map((vaultData, idx) => [vaultData.vault.vault, balanceOfData?.[idx]]) ?? []),
    [vaultsData, balanceOfData],
  ) as { [vault: Address]: bigint | undefined };

  const rows = useMemo(() => {
    return vaults
      .map((vault) => {
        const { decimals, symbol } = tokens.get(vault.asset) ?? { decimals: undefined, symbol: undefined };
        const isDeadDepositStateValid = !shouldEnforceDeadDeposit || (hasDeadDeposits.get(vault.address) ?? false);

        return {
          vault,
          isDeadDepositStateValid,
          asset: {
            address: vault.asset,
            imageSrc: getTokenURI({ symbol, address: vault.asset, chainId }),
            symbol,
            decimals,
          } as Token,
          curators: getDisplayableCurators(vault, curators, chainId),
          userShares: userShares[vault.address],
          imageSrc: getTokenURI({ symbol, address: vault.asset, chainId }),
        };
      })
      .filter((vault) => vault.isDeadDepositStateValid || (vault.userShares ?? 0n) > 0n);
  }, [vaults, hasDeadDeposits, shouldEnforceDeadDeposit, tokens, userShares, curators, chainId]);

  // Live Solon Vault V2 row (genesis 2026-09-03) — read straight from chain.
  const solon = useSolonVault({ chainId, userAddress });
  const solonRow = useMemo(() => {
    const vaultDuck = {
      address: SOLON_VAULT.address,
      owner: SOLON_VAULT.owner,
      name: solon.name,
      asset: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address,
      timelock: 259200n,
      totalAssets: solon.totalAssets,
      apy: solon.apy,
      fee: SOLON_VAULT.performanceFeeWad,
      allocations: new Map(),
      collateralAllocations: new Map([
        [
          "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" as Address,
          {
            proportion: 803212851405622528n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0x4f6185269EbcAD4cFA0371d63b29d923956E60AC"]),
          },
        ],
        [
          "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0xfA6e814Ab26b459C909F86C9650D433D5330B86D"]),
          },
        ],
        [
          "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([625000000000000000n]),
            oracles: new Set(["0x10AC7506227bD990C898b9BF59afaf0e04E1568B"]),
          },
        ],
        [
          "0x117cc2133c37b721f49de2a7a74833232b3b4c0c" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([625000000000000000n]),
            oracles: new Set(["0xA6aAebAE5833776DaD374DbB4A3caBb9F2a39C22"]),
          },
        ],
        [
          "0x322f0929c4625ed5bad873c95208d54e1c003b2d" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0xEb247f0Ab23fbFA2409e4997Fd2e521c63b7A0DC"]),
          },
        ],
        [
          "0xff080c8ce2e5feadaca0da81314ae59d232d4afd" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0xc4E6f466e9e69334Cc9A32E120D42AE9A21Ca4E4"]),
          },
        ],
        [
          "0x1b0e319c6a659f002271b69db8a7df2f911c153e" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0x2599449F32D6845789fAE5a6FD646971AE0D18b9"]),
          },
        ],
        [
          "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0x244C80f271952d2CB5F005bEe56dDE0dFEA6De50"]),
          },
        ],
        [
          "0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5" as Address,
          {
            proportion: 22088353413654620n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0x721314Bf05e4736fF21A9f6BE83f47dff3eF95F8"]),
          },
        ],
        [
          "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" as Address,
          {
            proportion: 20080321285140564n,
            lltvs: new Set([385000000000000000n]),
            oracles: new Set(["0xA563885F7dE7757A6A1451729fe23e51196232c7"]),
          },
        ],
      ]),
      toAssets: solon.toAssets,
      getAllocationProportion: () => 0n,
    } as unknown as AccrualVault;
    return {
      vault: vaultDuck,
      isDeadDepositStateValid: true,
      asset: {
        address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address,
        symbol: "USDG",
        decimals: 6,
        imageSrc: getTokenURI({
          symbol: "USDG",
          address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address,
          chainId,
        }),
      },
      curators: {
        Solon: {
          name: "Solon",
          roles: [{ name: "Owner", address: SOLON_VAULT.owner }],
          url: "https://solonlend.xyz",
          imageSrc: `${import.meta.env.BASE_URL}solon-icon.svg`,
          shouldAlwaysShow: true,
        },
      },
      userShares: solon.userShares,
      imageSrc: `${import.meta.env.BASE_URL}solon-icon.svg`,
    };
  }, [solon, chainId]);

  const displayRows = useMemo(() => [solonRow as unknown as (typeof rows)[number], ...rows], [solonRow, rows]);
  const displayTokens = useMemo(() => {
    const m = new Map(tokens);
    for (const [k, v] of MOCK_EARN_TOKENS) if (!m.has(k)) m.set(k, v);
    return m;
  }, [tokens]);

  const userRows = displayRows.filter((row) => (row.userShares ?? 0n) > 0n);

  if (status === "reconnecting") return undefined;

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <PageHeader
        title="Earn"
        subtitle="The other side of the farm. Supply USDG or ETH to the reserves that fund leveraged positions, and accrue the interest those positions pay. Redeemable against whatever the reserve has not lent out."
        hint={isConnected ? undefined : "Connect wallet to get started"}
      />
      {status !== "disconnected" && userRows.length > 0 && (
        <div className="bg-linear-to-b lg:pt-22 flex h-fit w-full flex-col items-center from-transparent to-white/[0.03] pb-20">
          <EarnTable
            chain={chain}
            rows={userRows}
            depositsMode="userAssets"
            tokens={displayTokens}
            lendingRewards={lendingRewards}
            refetchPositions={refetchBalanceOf}
          />
        </div>
      )}
      {/*
      Outer div ensures background color matches the end of the gradient from the div above,
      allowing rounded corners to show correctly. Inner div defines rounded corners and table background.
      */}
      <div className="flex grow flex-col bg-white/[0.03]">
        <div className="bg-linear-to-b from-background to-primary flex h-full grow flex-col items-center rounded-t-xl pb-16 pt-8">
          <EarnTable
            chain={chain}
            rows={displayRows}
            depositsMode="totalAssets"
            tokens={displayTokens}
            lendingRewards={lendingRewards}
            refetchPositions={refetchBalanceOf}
          />
          <FarmLendingVaults />
        </div>
      </div>
    </div>
  );
}
