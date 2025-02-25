import { JSX } from "react";
import EthereumChainSvg from "@/assets/chains/ethereum.svg?react";
import BaseChainSvg from "@/assets/chains/base.svg?react";
import UnichainSvg from "@/assets/chains/unichain.svg?react";
import CornSvg from "@/assets/chains/corn.svg?react";
import ModeSvg from "@/assets/chains/mode.svg?react";
import HemiSvg from "@/assets/chains/hemi.svg?react";
import SonicSvg from "@/assets/chains/sonic.svg?react";
import { CircleHelpIcon } from "lucide-react";

export function ChainIcon({ name }: { name: string }): JSX.Element {
  switch (name) {
    case "Ethereum":
      return <EthereumChainSvg />;
    case "Base":
      return <BaseChainSvg />;
    case "Unichain":
      return <UnichainSvg className="rounded-sm" />;
    case "Sonic":
      return <SonicSvg />;
    case "Mode Mainnet":
      return <ModeSvg />;
    case "Hemi":
      return <HemiSvg />;
    case "Corn":
      return <CornSvg />;
    default:
      return <CircleHelpIcon />;
  }
}
