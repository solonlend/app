import { type Token } from "@morpho-org/uikit/lib/utils";
import { useMemo } from "react";
import { type Address } from "viem";

import * as Merkl from "@/hooks/use-merkl-campaigns";

export type BorrowingRewards = {
  campaignId: string;
  opportunityId: string;
  startTimestamp: number;
  endTimestamp: number;
  name: string;
  description: string;
  depositUrl: string | null;
  tags: string[];
  rewardToken: Token;
  apr: number;
  dailyRewards: number;
}[];

export function useBorrowingRewards(chainId: number | undefined) {
  const { data: campaigns } = Merkl.useMerklCampaigns({ chainId, subType: Merkl.SubType.BORROW });

  return useMemo(() => {
    const marketRewardMap = new Map<Address, BorrowingRewards>();

    campaigns?.forEach((campaign) => {
      const {
        campaignId,
        startTimestamp,
        endTimestamp,
        rewardToken,
        params: { blacklist, whitelist, marketId },
        Opportunity: opportunity,
      } = campaign;

      if (blacklist.length > 0 && whitelist.length > 0) {
        console.warn(`Skipping campaignId ${campaignId} because blacklist/whitelist isn't implemented.`);
        return;
      }

      if (!marketRewardMap.has(marketId)) {
        marketRewardMap.set(marketId, []);
      }

      marketRewardMap.get(marketId)!.push({
        campaignId,
        opportunityId: opportunity.id,
        startTimestamp,
        endTimestamp,
        name: opportunity.name,
        description: opportunity.description,
        depositUrl: opportunity.depositUrl,
        tags: opportunity.tags,
        rewardToken: {
          address: rewardToken.address as Address,
          symbol: rewardToken.symbol,
          decimals: rewardToken.decimals,
          imageSrc: rewardToken.icon,
        },
        apr: opportunity.apr,
        dailyRewards: opportunity.dailyRewards,
      });
    });

    return marketRewardMap;
  }, [campaigns]);
}
