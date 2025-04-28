import { MerklApi } from "@merkl/api";
import { type QueryKey, useQuery } from "@tanstack/react-query";

const merkl = MerklApi("https://api.merkl.xyz").v4;

export enum SubType {
  LEND,
  UNUSED,
  BORROW,
}

async function queryFn({ queryKey }: { queryKey: QueryKey }) {
  const [subType, chainId] = queryKey.slice(4) as [number, number];

  const campaigns = await merkl.campaigns.index.get({
    query: { chainId, status: "LIVE", type: "MORPHO", subType, withOpportunity: true, items: 100 },
  });

  if (campaigns.error) {
    console.error("Error fetching campaigns from Merkl API");
    throw new Error(JSON.stringify(campaigns.error));
  }

  return campaigns.data.filter((campaign) => campaign.Opportunity?.status === "LIVE");
}

export function useMerklCampaigns({ chainId, subType }: { chainId: number | undefined; subType: SubType }) {
  return useQuery({
    queryKey: ["merkl", "campaigns", "LIVE", "MORPHO", subType, chainId, "withOpportunity"],
    queryFn,
    staleTime: 5 * 60 * 1_000,
    enabled: chainId !== undefined,
  });
}
