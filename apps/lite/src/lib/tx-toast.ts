import { toast } from "sonner";
import type { ReplacementReturnType } from "viem/actions";
import type { Config } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

/**
 * Unified transaction feedback: a loading toast on send, then success/failure once mined, with an explorer link.
 * Same semantics as Morpho uikit's TransactionButton (sonner + useWaitForTransactionReceipt);
 * our flows are multiple sequential txs, so this is an imperative helper we reuse.
 */
export async function runTx(
  config: Config,
  opts: { chainId: number; explorer: string; label: string },
  send: () => Promise<`0x${string}`>,
): Promise<`0x${string}` | undefined> {
  const id = toast.loading(`${opts.label} — awaiting wallet…`);
  try {
    const hash = await send();
    toast.loading(`${opts.label} — submitted, waiting for confirmation…`, { id });
    let replacement: ReplacementReturnType | undefined;
    const rcpt = await waitForTransactionReceipt(config, {
      hash,
      chainId: opts.chainId,
      confirmations: 1,
      onReplaced: (value) => {
        replacement = value;
      },
    });
    const confirmedHash = replacement?.transaction.hash ?? hash;
    const short = `${confirmedHash.slice(0, 10)}…`;
    if (replacement?.reason === "cancelled" || replacement?.reason === "replaced") {
      const cancelled = replacement.reason === "cancelled";
      toast.error(cancelled ? `${opts.label} cancelled` : `${opts.label} replaced by another transaction`, {
        id,
        description: short,
        duration: 12000,
        action: {
          label: "View",
          onClick: () => window.open(`${opts.explorer}/tx/${confirmedHash}`, "_blank"),
        },
      });
      return undefined;
    }
    if (rcpt.status === "success") {
      toast.success(
        replacement?.reason === "repriced" ? `${opts.label} confirmed after repricing` : `${opts.label} confirmed`,
        {
          id,
          description: short,
          duration: 8000,
          action: { label: "View", onClick: () => window.open(`${opts.explorer}/tx/${confirmedHash}`, "_blank") },
        },
      );
    } else {
      toast.error(`${opts.label} reverted`, {
        id,
        description: short,
        duration: 12000,
        action: { label: "View", onClick: () => window.open(`${opts.explorer}/tx/${confirmedHash}`, "_blank") },
      });
      // Mined-but-reverted = failure. Never return a hash: callers judge success by the return value,
      // returning a hash would let a multi-tx flow send the next tx, or a single-tx flow record a failed tx as the latest success.
      return undefined;
    }
    return confirmedHash;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const rejected = /User rejected|denied|rejected the request/i.test(msg);
    toast.error(rejected ? `${opts.label} cancelled` : `${opts.label} failed`, {
      id,
      description: msg.split("\n")[0]?.slice(0, 140),
      duration: 12000,
    });
    return undefined;
  }
}
