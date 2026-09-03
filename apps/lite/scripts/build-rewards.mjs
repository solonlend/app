/* global process, console, URL */
// Build rewards.json (merkle distribution) from a points snapshot.
//
//   node scripts/build-rewards.mjs <points.json> <rewardTokenAddress> <totalAmountWei> [urdAddress]
//
// Allocation is pro-rata to total points. Leaf encoding matches morpho-org/universal-rewards-distributor:
//   leaf = keccak256(bytes.concat(keccak256(abi.encode(account, reward, claimable))))
// (OpenZeppelin standard double-hashed leaves, sorted-pair internal nodes.)
// ⚠️ Before the first real distribution, verify one proof against the deployed URD on a testnet claim.

import { readFileSync, writeFileSync } from "node:fs";
import { encodeAbiParameters, keccak256, concat, getAddress } from "viem";

const [pointsPath, rewardToken, totalWeiStr, urd = null] = process.argv.slice(2);
if (!pointsPath || !rewardToken || !totalWeiStr) {
  console.error("usage: node scripts/build-rewards.mjs <points.json> <rewardToken> <totalWei> [urd]");
  process.exit(1);
}

const points = JSON.parse(readFileSync(pointsPath, "utf8"));
const totalWei = BigInt(totalWeiStr);
const totalPoints = points.leaderboard.reduce((acc, r) => acc + r.total, 0);

function leafOf(account, reward, claimable) {
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint256" }],
      [getAddress(account), getAddress(reward), claimable],
    ),
  );
  return keccak256(concat([inner]));
}

function hashPair(a, b) {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(concat([lo, hi]));
}

// build leaves
const entries = points.leaderboard
  .map((r) => ({
    address: r.address.toLowerCase(),
    amount: (BigInt(Math.round(r.total * 1e6)) * totalWei) / BigInt(Math.round(totalPoints * 1e6)),
  }))
  .filter((e) => e.amount > 0n);

const leaves = entries.map((e) => leafOf(e.address, rewardToken, e.amount));

// build tree (levels bottom-up)
const levels = [leaves];
while (levels[levels.length - 1].length > 1) {
  const prev = levels[levels.length - 1];
  const next = [];
  for (let i = 0; i < prev.length; i += 2) {
    next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
  }
  levels.push(next);
}
const root = levels[levels.length - 1][0];

function proofOf(index) {
  const proof = [];
  let idx = index;
  for (let lvl = 0; lvl < levels.length - 1; lvl++) {
    const sibling = idx ^ 1;
    if (sibling < levels[lvl].length) proof.push(levels[lvl][sibling]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

const claims = {};
entries.forEach((e, i) => {
  claims[e.address] = { amount: e.amount.toString(), proof: proofOf(i) };
});

const out = {
  generated_at: Math.floor(Date.now() / 1000),
  epoch: 1,
  urd,
  reward_token: { address: rewardToken, symbol: "SOLON", decimals: 18 },
  merkle_root: root,
  total: totalWei.toString(),
  points_snapshot_block: points.block,
  claims,
};
writeFileSync(new URL("../public/rewards.json", import.meta.url), JSON.stringify(out));
console.log(`root ${root} · ${entries.length} recipients · total ${totalWei}`);
