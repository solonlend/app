/*
  Farm URL resolution (DESIGN-farm-tabs-v1 §E/§G):
    /farm/auto            → vault list        /farm/auto/:vault     → detail (slug-addressed)
    /farm/range[/:vault]  → client replace-redirect to the auto equivalent, carrying the segment
    /farm/leverage/:x     → normalized back to /farm/leverage; unknown tabs → leverage
  All redirects are client-side `replace` — BrowserRouter, no server involvement.
*/

export type FarmRoute = {
  view: "leverage" | "auto-list" | "auto-detail" | "portfolio";
  /** Path relative to the /farm base the subpage should replace-navigate to, when set. */
  redirect?: string;
  slug?: string;
};

export function resolveFarmRoute(
  tab: string | undefined,
  vault: string | undefined,
  hasSlug: (slug: string) => boolean,
): FarmRoute {
  if (tab === "auto" || tab === "range") {
    const valid = vault !== undefined && hasSlug(vault);
    const target = valid ? `auto/${vault}` : "auto";
    const view = valid ? ("auto-detail" as const) : ("auto-list" as const);
    if (tab === "range" || (vault !== undefined && !valid)) {
      return valid ? { view, slug: vault, redirect: target } : { view, redirect: target };
    }
    return valid ? { view, slug: vault } : { view };
  }
  if (tab === "leverage") {
    return vault !== undefined ? { view: "leverage", redirect: "leverage" } : { view: "leverage" };
  }
  if (tab === "portfolio") {
    return vault !== undefined ? { view: "portfolio", redirect: "portfolio" } : { view: "portfolio" };
  }
  return { view: "leverage", redirect: "leverage" };
}

/** Chain-switch subpath: keep the detail segment only when the target chain configures the same slug. */
export function farmChainSwitchSubPath(
  tab: string | undefined,
  vault: string | undefined,
  targetHasSlug: boolean,
): string {
  if (!tab) return "farm";
  if (vault && targetHasSlug) return `farm/${tab}/${vault}`;
  return `farm/${tab}`;
}
