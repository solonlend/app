import { type Address, getContractAddress, type Hex, type StateOverride, zeroAddress } from "viem";

import { Lens } from "@/lens/read-withdraw-queue.s.sol";

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
 * the entire multicall call. See `readWithdrawQueueStateOverride()`.
 */
export function readWithdrawQueue(
  metaMorpho: Address,
  deployless?: false,
): Omit<ReturnType<typeof Lens.read.withdrawQueue>, "humanReadableAbi"> & { address: Address };
export function readWithdrawQueue(
  metaMorpho: Address,
  deployless: true,
): Omit<ReturnType<typeof Lens.read.withdrawQueue>, "humanReadableAbi"> & { code: Hex };
export function readWithdrawQueue(metaMorpho: Address, deployless: boolean = false) {
  const { humanReadableAbi, ...action } = Lens.read.withdrawQueue(metaMorpho);

  if (deployless) {
    return { ...action, code: Lens.bytecode } as const;
  } else {
    return { ...action, address } as const;
  }
}

export function readWithdrawQueueStateOverride(): StateOverride[number] {
  return {
    address,
    code: Lens.deployedBytecode,
  };
}
