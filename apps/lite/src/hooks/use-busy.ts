import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Write-action re-entrancy guard.
 *
 * `useWriteContract().isPending` ends the moment a tx hash arrives, but runTx is still awaiting the receipt —
 * in that window the button becomes clickable again and the user can double-submit (duplicate add/repay/deposit).
 * wrap the whole async handler with it so it stays busy until the receipt returns.
 *
 * lock with a ref, not just state: two clicks in the same render see the same state value and slip through.
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
