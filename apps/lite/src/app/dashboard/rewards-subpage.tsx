import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-org/uikit/components/shadcn/table";
import { formatBalance } from "@morpho-org/uikit/lib/utils";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { type Address, type Hex } from "viem";
import { useAccount, useWriteContract } from "wagmi";

// Universal Rewards Distributor (morpho-org/universal-rewards-distributor, GPL-2.0)
const URD_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "reward", type: "address" },
      { name: "claimable", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "reward", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type RewardsData = {
  generated_at: number;
  epoch: number;
  urd: Address | null; // null until the distributor is deployed — page shows "not live"
  reward_token: { address: Address; symbol: string; decimals: number };
  merkle_root: Hex;
  claims: { [address: string]: { amount: string; proof: Hex[] } };
};

const EXPLORER = "https://robinhoodchain.blockscout.com";

const MOCK: RewardsData = {
  generated_at: Math.floor(Date.now() / 1000),
  epoch: 1,
  urd: "0x0000000000000000000000000000000000000001",
  reward_token: { address: "0x0000000000000000000000000000000000000002", symbol: "SOLON", decimals: 18 },
  merkle_root: "0x0000000000000000000000000000000000000000000000000000000000000000",
  claims: {},
};

export function RewardsSubPage() {
  const { address: userAddress, status } = useAccount();
  const [data, setData] = useState<RewardsData | null | "missing">(null);
  const { writeContract, isPending } = useWriteContract();

  const isMock = new URLSearchParams(window.location.search).has("mock");

  useEffect(() => {
    if (isMock) {
      const mock = { ...MOCK, claims: { ...MOCK.claims } };
      // In mock mode, grant the connected wallet (or a placeholder) a visible claim.
      const who = (userAddress ?? "0x1bf704707e9f3f407ebc9364fdaed08c39893770").toLowerCase();
      mock.claims[who] = { amount: (12_345n * 10n ** 18n).toString(), proof: [] };
      setData(mock);
      return;
    }
    void fetch(`${import.meta.env.BASE_URL}rewards.json`)
      .then((res) => (res.ok ? res.json() : "missing"))
      .then(setData)
      .catch(() => setData("missing"));
  }, [isMock, userAddress]);

  const live = data !== null && data !== "missing" && data.urd !== null;
  const myClaim = live && userAddress ? (data as RewardsData).claims[userAddress.toLowerCase()] : undefined;

  const claimRows = live
    ? Object.entries((data as RewardsData).claims)
        .map(([address, c]) => ({ address, amount: BigInt(c.amount) }))
        .sort((a, b) => (a.amount > b.amount ? -1 : 1))
        .slice(0, 50)
    : [];

  const d = live ? (data as RewardsData) : undefined;

  return (
    <div className="flex min-h-screen flex-col px-2.5 pt-16">
      <div className="text-primary-foreground mx-auto w-full max-w-7xl px-2 pb-24 pt-10 lg:px-8">
        <h1 className="font-pixel text-3xl tracking-wide md:text-4xl">Rewards</h1>
        <p className="text-secondary-foreground mt-3 max-w-2xl font-light">
          Distributions run through Solon&apos;s own Universal Rewards Distributor — the merkle root lives on-chain, the
          full claim list is published here, and every claim is a transaction you send yourself. Unclaimed rewards
          accumulate; there is no deadline.
        </p>

        {!live ? (
          <div className="border-border bg-primary mt-10 max-w-xl border p-8">
            <div className="font-pixel text-xl">No active distribution</div>
            <p className="text-secondary-foreground mt-3 font-light">
              Rewards are not live yet. Points are already accruing — see the Points tab. When a distribution starts,
              this page lists your claimable balance and a claim button, with the merkle proof published for independent
              verification.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="border-border bg-primary border p-4">
                <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">
                  My claimable
                </div>
                <div className="mt-1 text-2xl">
                  {userAddress
                    ? myClaim
                      ? `${formatBalance(BigInt(myClaim.amount), d!.reward_token.decimals)} ${d!.reward_token.symbol}`
                      : "0"
                    : "—"}
                </div>
                <div className="text-secondary-foreground text-xs">
                  {userAddress ? `epoch ${d!.epoch}` : "connect wallet"}
                </div>
              </div>
              <div className="border-border bg-primary border p-4">
                <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Recipients</div>
                <div className="mt-1 text-2xl">{Object.keys(d!.claims).length}</div>
                <div className="text-secondary-foreground text-xs">in current tree</div>
              </div>
              <div className="border-border bg-primary border p-4">
                <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Distributor</div>
                <div className="mt-1 truncate text-sm">
                  <a
                    className="inline-flex items-center gap-1"
                    href={`${EXPLORER}/address/${d!.urd}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {d!.urd!.slice(0, 10)}… <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="text-secondary-foreground text-xs">URD contract</div>
              </div>
              <div className="border-border bg-primary border p-4">
                <div className="text-secondary-foreground text-xs font-light uppercase tracking-wider">Merkle root</div>
                <div className="mt-1 truncate text-sm">{d!.merkle_root.slice(0, 14)}…</div>
                <div className="text-secondary-foreground text-xs">verifiable on-chain</div>
              </div>
            </div>

            {status === "connected" && myClaim && (
              <Button
                variant="blue"
                size="lg"
                className="mt-6"
                disabled={isPending}
                onClick={() =>
                  writeContract({
                    address: d!.urd!,
                    abi: URD_ABI,
                    functionName: "claim",
                    args: [userAddress!, d!.reward_token.address, BigInt(myClaim.amount), myClaim.proof],
                  })
                }
              >
                {isPending ? "Confirm in wallet…" : `Claim ${d!.reward_token.symbol}`}
              </Button>
            )}

            <Table className="mt-8 border-separate border-spacing-y-3">
              <TableHeader className="bg-primary">
                <TableRow>
                  <TableHead className="text-secondary-foreground rounded-l-lg pl-4 text-xs font-light">#</TableHead>
                  <TableHead className="text-secondary-foreground text-xs font-light">Address</TableHead>
                  <TableHead className="text-secondary-foreground rounded-r-lg text-xs font-light">
                    Allocation
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claimRows.map((row, i) => (
                  <TableRow key={row.address} className="bg-primary hover:bg-secondary">
                    <TableCell className="rounded-l-lg py-3 pl-4">{i + 1}</TableCell>
                    <TableCell>{`${row.address.slice(0, 8)}...${row.address.slice(-6)}`}</TableCell>
                    <TableCell className="rounded-r-lg">
                      {formatBalance(row.amount, d!.reward_token.decimals)} {d!.reward_token.symbol}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
