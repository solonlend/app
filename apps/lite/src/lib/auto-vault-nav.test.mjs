import { test } from "node:test";
import assert from "node:assert/strict";
const load = () => import("./auto-vault-nav.ts");

const hasSlug = (s) => s === "eth-usdg";

test("auto tab: no vault renders list, valid slug renders detail, bad slug redirects to list", async () => {
  const { resolveFarmRoute } = await load();
  assert.deepEqual(resolveFarmRoute("auto", undefined, hasSlug), { view: "auto-list" });
  assert.deepEqual(resolveFarmRoute("auto", "eth-usdg", hasSlug), { view: "auto-detail", slug: "eth-usdg" });
  assert.deepEqual(resolveFarmRoute("auto", "nope", hasSlug), { view: "auto-list", redirect: "auto" });
});

test("legacy range tab redirects to auto and carries a valid vault segment", async () => {
  const { resolveFarmRoute } = await load();
  assert.deepEqual(resolveFarmRoute("range", undefined, hasSlug), { view: "auto-list", redirect: "auto" });
  assert.deepEqual(resolveFarmRoute("range", "eth-usdg", hasSlug), {
    view: "auto-detail",
    slug: "eth-usdg",
    redirect: "auto/eth-usdg",
  });
  assert.deepEqual(resolveFarmRoute("range", "nope", hasSlug), { view: "auto-list", redirect: "auto" });
});

test("portfolio tab renders portfolio view; stray vault segment normalizes back", async () => {
  const { resolveFarmRoute } = await load();
  assert.deepEqual(resolveFarmRoute("portfolio", undefined, hasSlug), { view: "portfolio" });
  assert.deepEqual(resolveFarmRoute("portfolio", "anything", hasSlug), { view: "portfolio", redirect: "portfolio" });
});

test("leverage tab normalizes stray vault segment; unknown tabs fall back to leverage", async () => {
  const { resolveFarmRoute } = await load();
  assert.deepEqual(resolveFarmRoute("leverage", undefined, hasSlug), { view: "leverage" });
  assert.deepEqual(resolveFarmRoute("leverage", "anything", hasSlug), { view: "leverage", redirect: "leverage" });
  assert.deepEqual(resolveFarmRoute(undefined, undefined, hasSlug), { view: "leverage", redirect: "leverage" });
  assert.deepEqual(resolveFarmRoute("xyz", undefined, hasSlug), { view: "leverage", redirect: "leverage" });
});

test("chain switch keeps the detail path only when the target chain has the same slug", async () => {
  const { farmChainSwitchSubPath } = await load();
  assert.equal(farmChainSwitchSubPath("auto", "eth-usdg", true), "farm/auto/eth-usdg");
  assert.equal(farmChainSwitchSubPath("auto", "eth-usdg", false), "farm/auto");
  assert.equal(farmChainSwitchSubPath("auto", undefined, false), "farm/auto");
  assert.equal(farmChainSwitchSubPath("leverage", undefined, false), "farm/leverage");
  assert.equal(farmChainSwitchSubPath(undefined, undefined, false), "farm");
});
