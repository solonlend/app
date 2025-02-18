import { Address } from "viem";
import { base, mainnet } from "viem/chains";

type MorphoContractName = "Morpho" | "MetaMorphoFactory" | "MetaMorphoV1_1Factory";

type Deployments = { [chainId: number]: { [name in MorphoContractName]: { address: Address; fromBlock: bigint } } };

export const DEPLOYMENTS: Deployments = {
  [mainnet.id]: {
    Morpho: {
      address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      fromBlock: 18883124n,
    },
    MetaMorphoFactory: {
      address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
      fromBlock: 18925584n,
    },
    MetaMorphoV1_1Factory: {
      address: "0x1897A8997241C1cD4bD0698647e4EB7213535c24",
      fromBlock: 21439510n,
    },
  },
  [base.id]: {
    Morpho: {
      address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      fromBlock: 13977148n,
    },
    MetaMorphoFactory: {
      address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
      fromBlock: 13978134n,
    },
    MetaMorphoV1_1Factory: {
      address: "0xFf62A7c278C62eD665133147129245053Bbf5918",
      fromBlock: 23928808n,
    },
  },
};

export const CORE_DEPLOYMENTS = new Set<keyof Deployments>([mainnet.id, base.id]);

export function getContractDeploymentInfo(chainId: number | undefined, name: MorphoContractName) {
  return DEPLOYMENTS[chainId ?? mainnet.id][name];
}
