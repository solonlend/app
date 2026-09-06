import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureFarmAllowances } from "./farm-allowance.ts";

test("approves only insufficient nonzero legs before allowing submission", async () => {
  const events = [];
  let approved = false;
  await ensureFarmAllowances(
    [
      { token: "risk", amount: 10n },
      { token: "loan", amount: 20n },
    ],
    async (token) => {
      events.push(`read:${token}`);
      return token === "risk" ? 10n : approved ? 20n : 0n;
    },
    async (token, amount) => {
      events.push(`approve:${token}:${amount}`);
      approved = true;
      return true;
    },
  );
  assert.deepEqual(events, ["read:risk", "read:loan", "approve:loan:20", "read:loan"]);
});
test("cancelled or reverted approval stops later legs and submission", async () => {
  let approvals = 0;
  await assert.rejects(
    ensureFarmAllowances(
      [
        { token: "risk", amount: 10n },
        { token: "loan", amount: 20n },
      ],
      async () => 0n,
      async () => {
        approvals++;
        return false;
      },
    ),
    /Approval/,
  );
  assert.equal(approvals, 1);
});
test("allowance read failure fails closed; zero amounts need no wallet transaction", async () => {
  await assert.rejects(
    ensureFarmAllowances(
      [{ token: "risk", amount: 1n }],
      async () => {
        throw Error("RPC failed");
      },
      async () => true,
    ),
    /RPC failed/,
  );
  await ensureFarmAllowances(
    [{ token: "risk", amount: 0n }],
    async () => {
      throw Error("unexpected read");
    },
    async () => false,
  );
});
test("confirmed approval with stale RPC allowance blocks submission", async () => {
  await assert.rejects(
    ensureFarmAllowances(
      [{ token: "risk", amount: 1n }],
      async () => 0n,
      async () => true,
    ),
    /Approval not visible/,
  );
});
