import { Address } from "viem";
import { base, corn, hemi, mainnet, mode as modeMainnet, sonic } from "viem/chains";
import { unichain } from "viem/op-stack";

type MorphoContractName = "Morpho" | "MetaMorphoFactory" | "MetaMorphoV1_1Factory";

type OptionalContracts = "MetaMorphoFactory";
type RequiredContracts = Exclude<MorphoContractName, OptionalContracts>;
type DeploymentDetails = { address: Address; fromBlock: bigint };
type Deployments = {
  [chainId: number]: {
    [name in RequiredContracts]-?: DeploymentDetails;
  } & {
    [name in OptionalContracts]?: DeploymentDetails;
  };
};

export const DEPLOYMENTS: Deployments = {
  [mainnet.id]: {
    Morpho: { address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", fromBlock: 18883124n },
    MetaMorphoFactory: { address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101", fromBlock: 18925584n },
    MetaMorphoV1_1Factory: { address: "0x1897A8997241C1cD4bD0698647e4EB7213535c24", fromBlock: 21439510n },
  },
  [base.id]: {
    Morpho: { address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", fromBlock: 13977148n },
    MetaMorphoFactory: { address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101", fromBlock: 13978134n },
    MetaMorphoV1_1Factory: { address: "0xFf62A7c278C62eD665133147129245053Bbf5918", fromBlock: 23928808n },
  },
  [unichain.id]: {
    Morpho: { address: "0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A", fromBlock: 9139027n },
    MetaMorphoV1_1Factory: { address: "0xe9EdE3929F43a7062a007C3e8652e4ACa610Bdc0", fromBlock: 9316789n },
  },
  [corn.id]: {
    Morpho: { address: "0xc2B1E031540e3F3271C5F3819F0cC7479a8DdD90", fromBlock: 251401n },
    MetaMorphoV1_1Factory: { address: "0xe430821595602eA5DD0cD350f86987437c7362fA", fromBlock: 253027n },
  },
  [modeMainnet.id]: {
    Morpho: { address: "0xd85cE6BD68487E0AaFb0858FDE1Cd18c76840564", fromBlock: 19983370n },
    MetaMorphoV1_1Factory: { address: "0xae5b0884bfff430493D6C844B9fd052Af7d79278", fromBlock: 19983443n },
  },
  [hemi.id]: {
    Morpho: { address: "0xa4Ca2c2e25b97DA19879201bA49422bc6f181f42", fromBlock: 1188872n },
    MetaMorphoV1_1Factory: { address: "0x8e52179BeB18E882040b01632440d8Ca0f01da82", fromBlock: 1188885n },
  },
  [sonic.id]: {
    Morpho: { address: "0xd6c916eB7542D0Ad3f18AEd0FCBD50C582cfa95f", fromBlock: 9100931n },
    MetaMorphoV1_1Factory: { address: "0x0cE9e3512CB4df8ae7e265e62Fb9258dc14f12e8", fromBlock: 9101319n },
  },
};

export const CORE_DEPLOYMENTS = new Set<keyof Deployments>([mainnet.id, base.id]);

export const BATCH2_DEPLOYMENTS = new Set<keyof Deployments>([unichain.id, corn.id, modeMainnet.id, hemi.id, sonic.id]);

export function getContractDeploymentInfo(
  chainId: number | undefined,
  name: OptionalContracts,
): DeploymentDetails | undefined;
export function getContractDeploymentInfo(chainId: number | undefined, name: RequiredContracts): DeploymentDetails;
export function getContractDeploymentInfo(chainId: number | undefined, name: MorphoContractName) {
  return DEPLOYMENTS[chainId ?? mainnet.id][name];
}
