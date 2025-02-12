import { useQueries } from "@tanstack/react-query";
import type { Abi, BlockNumber, BlockTag, ContractEventName, GetContractEventsParameters } from "viem";
import { usePublicClient } from "wagmi";
import { hash } from "ohash";

type BlockRangeBound = BlockNumber | BlockTag | undefined;
type BlockRange = [BlockRangeBound, BlockRangeBound];

export default function useContractEvents<
  const abi extends Abi | readonly unknown[],
  eventName extends ContractEventName<abi> | undefined = undefined,
  strict extends boolean | undefined = undefined,
  fromBlock extends BlockNumber | BlockTag = "earliest",
  toBlock extends BlockNumber | BlockTag = "latest",
>(
  args: GetContractEventsParameters<abi, eventName, strict, fromBlock, toBlock> & {
    query?: { enabled?: boolean };
    maxBlockRange?: bigint;
  },
) {
  args = { ...args };

  if (args.blockHash === undefined) {
    if (args.fromBlock === undefined) args.fromBlock = "earliest";
    if (args.toBlock === undefined) args.toBlock = "latest";
  }

  // Extract and remove these fields from `args` since we don't want them in the `queryKey`.
  const { fromBlock, toBlock, query, maxBlockRange } = args;
  delete args.fromBlock;
  delete args.toBlock;
  delete args.query;
  delete args.maxBlockRange;

  let blockRanges: BlockRange[] = [[fromBlock, toBlock]];

  if (query?.enabled && maxBlockRange) {
    if (typeof toBlock !== "bigint" || typeof fromBlock !== "bigint") {
      throw new Error(
        `Tried to query contract events with \`maxBlockRange\` constraint without explicit \`fromBlock\` or \`toBlock\`.`,
      );
    }
    blockRanges = sliceBlockRange([fromBlock, toBlock], maxBlockRange);
  }

  const publicClient = usePublicClient();

  const queryFn = async ([fromBlock, toBlock]: BlockRange) => {
    if (publicClient === undefined) {
      throw new Error(`Tried to query contract events when publicClient was undefined.`);
    }
    // TODO: Could add binary slicing retries to account for num-returned-events constraint in addition to
    // block-range constraint.
    return publicClient.getContractEvents({ ...args, fromBlock, toBlock } as GetContractEventsParameters<
      abi,
      eventName,
      strict,
      fromBlock,
      toBlock
    >);
  };

  const results = useQueries({
    queries: blockRanges.map((blockRange) => {
      return {
        queryKey: [
          "useContractEvents",
          publicClient?.chain.id,
          replaceBigInts({ ...args, abi: hash(args.abi) }),
          replaceBigInts({ fromBlock: blockRange[0], toBlock: blockRange[1] }),
        ],
        queryFn: () => queryFn(blockRange),
        staleTime: typeof blockRange[1] !== "bigint" ? 5 * 60 * 1000 : Infinity,
        gcTime: typeof blockRange[1] !== "bigint" ? 10 * 60 * 1000 : Infinity,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        placeholderData: [],
        enabled: query?.enabled,
      };
    }),
  });

  const data = results.flatMap((result) => result.data);
  const isFetching = results.reduce((a, b) => a || b.isFetching, false);

  return { data, isFetching };
}

function replaceBigInts(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (key, value) => (typeof value === "bigint" ? `${value.toString()}n` : value)));
}

function sliceBlockRange([fromBlock, toBlock]: [bigint, bigint], rangeConstraint: bigint) {
  const bounds: [bigint, bigint][] = [];

  for (let i = fromBlock; i < toBlock; i += rangeConstraint) {
    bounds.push([i, i + rangeConstraint < toBlock ? i + rangeConstraint : toBlock]);
  }

  return bounds;
}
