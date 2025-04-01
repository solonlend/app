import { metaMorphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho";
import { metaMorphoFactoryAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho-factory";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-blue-offchain-public/uikit/components/shadcn/avatar";
import { Sheet, SheetTrigger } from "@morpho-blue-offchain-public/uikit/components/shadcn/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/tooltip";
import useContractEvents from "@morpho-blue-offchain-public/uikit/hooks/use-contract-events/use-contract-events";
import { readAccrualVaults, readAccrualVaultsStateOverride } from "@morpho-blue-offchain-public/uikit/lens/read-vaults";
import {
  formatApy,
  formatBalanceWithSymbol,
  getTokenSymbolURI,
  Token,
} from "@morpho-blue-offchain-public/uikit/lib/utils";
import {
  AccrualPosition,
  AccrualVault,
  MarketId,
  Vault,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { blo } from "blo";
// @ts-expect-error: this package lacks types
import humanizeDuration from "humanize-duration";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { useOutletContext } from "react-router";
import { Address, Chain, erc20Abi, hashMessage, isAddressEqual, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { CtaCard } from "@/components/cta-card";
import { EarnSheetContent } from "@/components/earn-sheet-content";
import { useMarkets } from "@/hooks/use-markets";
import { useTopNCurators } from "@/hooks/use-top-n-curators";
import { CORE_DEPLOYMENTS, getContractDeploymentInfo } from "@/lib/constants";

type Row = {
  vault: AccrualVault;
  asset: Token;
  curators: {
    [name: string]: {
      name: string;
      roles: { name: string; address: Address }[];
      url: string | null;
      imageSrc: string | null;
    };
  };
  maxWithdraw: bigint | undefined;
  imageSrc: string;
};

function VaultTableCell({
  address,
  symbol,
  imageSrc,
  chain,
  timelock,
}: Token & { chain: Chain | undefined; timelock: bigint }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-sm">
              <AvatarImage src={imageSrc} alt="Avatar" />
              <AvatarFallback delayMs={500}>
                <img src={blo(address)} />
              </AvatarFallback>
            </Avatar>
            {symbol ?? "－"}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="underline">Properties</p>
          <p>Timelock: {humanizeDuration(Number(timelock) * 1000)}</p>
          <br />
          <div className="flex items-center gap-1">
            <p>
              Vault:{" "}
              <code>
                {address.slice(0, 6)}...{address.slice(-4)}
              </code>
            </p>
            {chain?.blockExplorers?.default.url && (
              <a
                href={`${chain.blockExplorers.default.url}/address/${address}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CuratorTableCell({
  name,
  roles,
  url,
  imageSrc,
  chain,
}: Row["curators"][string] & { chain: Chain | undefined }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 ml-[-8px] flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-sm">
              <AvatarImage src={imageSrc ?? ""} alt="Avatar" />
              <AvatarFallback delayMs={500}>
                <img src={blo(hashMessage(name).padEnd(42, "0").slice(0, 42) as Address)} />
              </AvatarFallback>
            </Avatar>
            {name}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="underline">Roles</p>
          {roles.map((role) => (
            <div className="flex items-center gap-1" key={role.name}>
              <p>
                {role.name}:{" "}
                <code>
                  {role.address.slice(0, 6)}...{role.address.slice(-4)}
                </code>
              </p>
              {chain?.blockExplorers?.default.url && (
                <a
                  href={`${chain.blockExplorers.default.url}/address/${role.address}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
          <br />
          {url != null && (
            <a className="text-blue-200 underline" href={url} rel="noopener noreferrer" target="_blank">
              {url}
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function VaultTable({
  chain,
  rows,
  depositsMode,
}: {
  chain: Chain | undefined;
  rows: Row[];
  depositsMode: "totalAssets" | "maxWithdraw";
}) {
  return (
    <div className="text-primary w-full max-w-5xl px-8 pt-8">
      <Table className="border-separate border-spacing-y-3">
        <TableHeader className="bg-secondary">
          <TableRow>
            <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Vault</TableHead>
            <TableHead className="text-primary text-xs font-light">Deposits</TableHead>
            <TableHead className="text-primary text-xs font-light">Curator</TableHead>
            <TableHead className="text-primary rounded-r-lg text-xs font-light">APY</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const ownerText = `${row.vault.owner.slice(0, 6)}...${row.vault.owner.slice(-4)}`;
            const deposits = depositsMode === "maxWithdraw" ? row.maxWithdraw : row.vault.totalAssets;
            return (
              <Sheet key={row.vault.address}>
                <SheetTrigger asChild>
                  <TableRow className="bg-secondary hover:bg-accent">
                    <TableCell className="rounded-l-lg py-3">
                      <VaultTableCell
                        address={row.vault.address}
                        symbol={row.vault.name}
                        imageSrc={row.imageSrc}
                        chain={chain}
                        timelock={row.vault.timelock}
                      />
                    </TableCell>
                    <TableCell>
                      {deposits !== undefined && row.asset.decimals !== undefined
                        ? formatBalanceWithSymbol(deposits, row.asset.decimals, row.asset.symbol, 5, true)
                        : "－"}
                    </TableCell>
                    <TableCell className="flex w-min gap-2">
                      {Object.keys(row.curators).length > 0
                        ? Object.values(row.curators).map((curator) => (
                            <CuratorTableCell key={curator.name} {...curator} chain={chain} />
                          ))
                        : ownerText}
                    </TableCell>
                    <TableCell className="rounded-r-lg">{formatApy(row.vault.netApy)}</TableCell>
                  </TableRow>
                </SheetTrigger>
                <EarnSheetContent vaultAddress={row.vault.address} asset={row.asset} />
              </Sheet>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const STALE_TIME = 5 * 60 * 1000;

export function EarnSubPage() {
  const { status, address: userAddress } = useAccount();
  const { chain } = useOutletContext() as { chain?: Chain };
  const chainId = chain?.id;

  const [morpho, factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "Morpho"),
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  // MARK: Index `MetaMorphoFactory.CreateMetaMorpho` on all factory versions to get a list of all vault addresses
  const {
    logs: { all: createMetaMorphoEvents },
    isFetching: isFetchingCreateMetaMorphoEvents,
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factoryV1_1 ? [factoryV1_1.address].concat(factory ? [factory.address] : []) : [],
    fromBlock: factory?.fromBlock ?? factoryV1_1?.fromBlock,
    reverseChronologicalOrder: true,
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined },
  });

  // MARK: Fetch additional data for vaults owned by the top 5 curators from core deployments
  const top5Curators = useTopNCurators({ n: 5, verifiedOnly: true, chainIds: [...CORE_DEPLOYMENTS] });
  const { data: vaultsData } = useReadContract({
    chainId,
    ...readAccrualVaults(
      morpho?.address ?? "0x",
      createMetaMorphoEvents.map((ev) => ev.args.metaMorpho),
      // NOTE: This assumes that if a curator controls an address on one chain, they control it across all chains.
      top5Curators.flatMap((curator) => curator.addresses?.map((entry) => entry.address as Address) ?? []),
    ),
    stateOverride: [readAccrualVaultsStateOverride()],
    query: { enabled: chainId !== undefined && !isFetchingCreateMetaMorphoEvents && !!morpho?.address },
  });

  const marketIds = useMemo(() => [...new Set(vaultsData?.flatMap((d) => d.vault.withdrawQueue) ?? [])], [vaultsData]);
  const markets = useMarkets({ chainId, marketIds, staleTime: STALE_TIME });
  const vaults = useMemo(() => {
    const vaults: AccrualVault[] = [];
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

      if (
        vault.name === "" ||
        vault.totalAssets === 0n ||
        markets === undefined ||
        vaultData.allocations.some((allocation) => markets[allocation.id] === undefined)
      ) {
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
    });
    vaults.sort((a, b) => (a.netApy > b.netApy ? -1 : 1));
    return vaults;
  }, [vaultsData, markets]);

  // MARK: Fetch metadata for every ERC20 asset
  const assets = useMemo(() => {
    const assets = [...new Set(vaultsData?.map((vaultData) => vaultData.vault.asset) ?? [])];
    assets.sort(); // sort so that any query keys derived from this don't change
    return assets;
  }, [vaultsData]);

  const { data: assetsData } = useReadContracts({
    contracts: assets
      .map((asset) => [
        { chainId, address: asset, abi: erc20Abi, functionName: "symbol" } as const,
        { chainId, address: asset, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  // MARK: Fetch user's balance in each vault
  const { data: maxWithdrawsData } = useReadContracts({
    contracts: vaultsData?.map(
      (vaultData) =>
        ({
          chainId,
          address: vaultData.vault.vault,
          abi: metaMorphoAbi,
          functionName: "maxWithdraw",
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

  const maxWithdraws = useMemo(
    () =>
      Object.fromEntries(vaultsData?.map((vaultData, idx) => [vaultData.vault.vault, maxWithdrawsData?.[idx]]) ?? []),
    [vaultsData, maxWithdrawsData],
  ) as { [vault: Address]: bigint | undefined };

  const rows = useMemo(() => {
    return vaults.map((vault) => {
      const assetIdx = assets.indexOf(vault.asset);
      const symbol = assetIdx > -1 ? (assetsData?.[assetIdx * 2 + 0].result as string) : undefined;
      const decimals = assetIdx > -1 ? (assetsData?.[assetIdx * 2 + 1].result as number) : undefined;

      const curators: Row["curators"] = {};
      for (const curator of top5Curators) {
        for (const roleName of ["owner", "curator", "guardian"] as const) {
          const address = curator.addresses
            ?.map((entry) => entry.address as Address)
            .find((a) => isAddressEqual(a, vault[roleName]));
          if (!address) continue;

          const roleNameCapitalized = `${roleName.charAt(0).toUpperCase()}${roleName.slice(1)}`;
          if (curators[curator.name]) {
            curators[curator.name].roles.push({ name: roleNameCapitalized, address });
          } else {
            curators[curator.name] = {
              name: curator.name,
              roles: [{ name: roleNameCapitalized, address }],
              url: curator.url,
              imageSrc: curator.image,
            };
          }
        }
      }

      return {
        vault,
        asset: {
          address: vault.asset,
          imageSrc: getTokenSymbolURI(symbol),
          symbol,
          decimals,
        } as Token,
        curators,
        maxWithdraw: maxWithdraws[vault.address],
        imageSrc: getTokenSymbolURI(symbol),
      };
    });
  }, [vaults, assets, assetsData, maxWithdraws, top5Curators]);

  const userRows = rows.filter((row) => !!row.maxWithdraw);

  if (status === "connecting") return undefined;

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      {status === "disconnected" ? (
        <CtaCard
          className="flex w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-8 md:m-auto md:grid md:grid-cols-[50%_50%] md:px-0 dark:bg-neutral-900"
          bigText="Earn on your terms"
          littleText="Connect wallet to get started"
          videoSrc={{
            mov: "https://cdn.morpho.org/v2/assets/videos/earn-animation.mov",
            webm: "https://cdn.morpho.org/v2/assets/videos/earn-animation.webm",
          }}
        />
      ) : (
        userRows.length > 0 && (
          <div className="flex h-fit w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-8 md:m-auto md:px-0 dark:bg-neutral-900">
            <VaultTable chain={chain} rows={userRows} depositsMode="maxWithdraw" />
          </div>
        )
      )}
      <div className="bg-background dark:bg-background/30 flex grow justify-center rounded-t-xl pb-32">
        <VaultTable chain={chain} rows={rows} depositsMode="totalAssets" />
      </div>
    </div>
  );
}
