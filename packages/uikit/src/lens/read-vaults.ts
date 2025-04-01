import { type Address, getContractAddress, type Hex, hexToBigInt, type StateOverride, zeroAddress } from "viem";

import { Lens } from "@/lens/read-vaults.s.sol";

const address = getContractAddress({
  bytecode: Lens.bytecode,
  from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
  opcode: "CREATE2",
  salt: `${zeroAddress}51A1E51A1E51A1E51A1E51A1`,
});

// NOTE: If type inference isn't working, ensure contract *does not* use named return values!

/**
 * IMPORTANT: `deployless` mode is incompatible with multicall / `useReadContracts`. In `useReadContracts`,
 * it will cause an error and resend each `eth_call` individually to try to correct it, resulting in
 * (potentially many) extra RPC calls. Instead, you should use an ordinary call with a `StateOverride` for
 * the entire multicall call. See `readAccrualVaultsStateOverride()`.
 */
export function readAccrualVaults(
  morpho: Address,
  metaMorphos: Address[],
  includedOwners: Address[],
  deployless?: false,
): Omit<ReturnType<typeof Lens.read.getAccrualVaults>, "humanReadableAbi"> & { address: Address };
export function readAccrualVaults(
  morpho: Address,
  metaMorphos: Address[],
  includedOwners: Address[],
  deployless: true,
): Omit<ReturnType<typeof Lens.read.getAccrualVaults>, "humanReadableAbi"> & { code: Hex };
export function readAccrualVaults(
  morpho: Address,
  metaMorphos: readonly Address[],
  includedOwners: readonly Address[],
  deployless: boolean = false,
) {
  const uniqueOwners = [...new Set(includedOwners)];
  uniqueOwners.sort((a, b) => (hexToBigInt(a) - hexToBigInt(b) > 0 ? 1 : -1));
  const sortedOwners = Object.freeze(uniqueOwners);

  const { humanReadableAbi, ...action } = Lens.read.getAccrualVaults(morpho, metaMorphos, sortedOwners);
  if (deployless) {
    return { ...action, code: Lens.bytecode } as const;
  } else {
    return { ...action, address } as const;
  }
}

export function readAccrualVaultsStateOverride(): StateOverride[number] {
  return {
    address,
    code: Lens.deployedBytecode,
  };
}
