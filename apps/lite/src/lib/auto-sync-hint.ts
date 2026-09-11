/*
  Post-transaction sync hint (SPEC §2.4 v1.8): the cost-basis feed refreshes every ~10min
  and event replay every ~120s, so PnL numbers lag right after a deposit/withdraw. The
  drawer records the tx time; panels show a hint while inside the window. Per-browser
  only (localStorage) — the public board is unaffected.
*/

const KEY = (chainId: number, vault: string) => `solon-auto-lasttx:${chainId}:${vault.toLowerCase()}`;
export const SYNC_WINDOW_MS = 12 * 60 * 1000;

export function recordAutoTx(chainId: number, vault: string, now = Date.now()) {
  try {
    localStorage.setItem(KEY(chainId, vault), String(now));
  } catch {
    /* storage unavailable (private mode) — hint simply never shows */
  }
}

/** True while a recent tx may still be ahead of the PnL feeds. */
export function isSyncing(chainId: number, vault: string, now = Date.now()): boolean {
  try {
    const t = Number(localStorage.getItem(KEY(chainId, vault)) ?? 0);
    return t > 0 && now - t < SYNC_WINDOW_MS;
  } catch {
    return false;
  }
}
