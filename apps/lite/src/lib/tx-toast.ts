import { toast } from "sonner";
import type { ReplacementReturnType } from "viem/actions";
import type { Config } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

/**
 * 统一的交易反馈:发出即 loading toast → 上链后成功/失败,附区块浏览器链接。
 * 与 Morpho uikit 的 TransactionButton 同一套语义(sonner + useWaitForTransactionReceipt),
 * 我们的动作是多笔顺序交易,所以做成命令式工具函数复用。
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
      // 上链但执行失败 = 失败。绝不能返回哈希:调用方一律用返回值判成功,
      // 返回哈希会让多笔流程继续发下一笔、单笔流程把失败交易记成"最新成功交易"。
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
