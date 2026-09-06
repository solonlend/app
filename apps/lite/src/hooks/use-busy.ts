import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 写操作防重。
 *
 * `useWriteContract().isPending` 在拿到交易哈希那一刻就结束,而 runTx 此时还在等回执 ——
 * 中间这段窗口按钮会重新变成可点,用户能再点一次,造成重复加仓/重复还款/重复存款。
 * 用它包住整个异步处理函数,直到回执回来为止都保持 busy。
 *
 * 用 ref 上锁而不只靠 state:同一次渲染里的连续两次点击看到的 state 是同一个值,拦不住。
 */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);

  // Wallet requests are not abortable. A timer that unlocks while this component is still mounted
  // could let the user submit twice if the original prompt later resolves, so only unmount releases
  // an unsettled lock; the cleanup also prevents a late promise from setting state after unmount.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      locked.current = false;
    };
  }, []);

  const guard = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return [busy, guard];
}
