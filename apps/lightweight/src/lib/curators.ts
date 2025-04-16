import { optimism, polygon } from "wagmi/chains";

import { graphql, FragmentOf } from "@/graphql/graphql";

export const CuratorFragment = graphql(`
  fragment Curator on Curator @_unmask {
    addresses {
      address
      chainId
    }
    image
    name
    url
  }
`);

export const MANUALLY_WHITELISTED_CURATORS: FragmentOf<typeof CuratorFragment>[] = [
  {
    addresses: [{ address: "0xCC3E7c85Bb0EE4f09380e041fee95a0caeDD4a02", chainId: polygon.id }],
    image: "https://cdn.morpho.org/v2/assets/images/compound.svg",
    name: "Compound",
    url: "https://compound.finance/",
  },
  {
    addresses: [{ address: "0x17C9ba3fDa7EC71CcfD75f978Ef31E21927aFF3d", chainId: optimism.id }],
    image: "https://cdn.morpho.org/v2/assets/images/moonwell.svg",
    name: "Moonwell",
    url: "https://moonwell.fi/",
  },
];
