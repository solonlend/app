/** Await each required approval before the caller may submit the vault operation. */
export async function ensureFarmAllowances<Token extends string>(
  legs: readonly { token: Token; amount: bigint }[],
  readAllowance: (token: Token) => Promise<bigint>,
  approve: (token: Token, amount: bigint) => Promise<boolean>,
): Promise<void> {
  for (const { token, amount } of legs) {
    if (amount < 0n) throw new Error("Invalid approval amount");
    if (amount === 0n) continue;
    if ((await readAllowance(token)) >= amount) continue;
    if (!(await approve(token, amount))) {
      throw new Error("Approval cancelled or failed; transaction not submitted.");
    }
    // A confirmed receipt may precede allowance visibility on a load-balanced RPC.
    let visible = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((await readAllowance(token)) >= amount) {
        visible = true;
        break;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750));
    }
    if (!visible) throw new Error("Approval not visible on the RPC yet; retry in a moment.");
  }
}
