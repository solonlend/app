export function FarmPauseBanner({ paused }: { paused: boolean | undefined }) {
  if (paused === false) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300"
    >
      {paused
        ? "LendingPool is paused. Deposits, opening/increasing positions, redeeming and unstaking are disabled. Repay, close, add margin and liquidation remain available."
        : "Checking LendingPool pause status. Deposits, opening/increasing positions and withdrawals are disabled until the status is verified. Repay, close, add margin and liquidation remain available."}
    </div>
  );
}
