import WatermarkSvg from "@morpho-org/uikit/assets/powered-by-morpho.svg?react";
import { Button } from "@morpho-org/uikit/components/shadcn/button";
import { WalletMenu } from "@morpho-org/uikit/components/wallet-menu";
import { CORE_DEPLOYMENTS } from "@morpho-org/uikit/lib/deployments";
import { getChainSlug } from "@morpho-org/uikit/lib/utils";
import { ConnectKitButton } from "connectkit";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Toaster } from "sonner";
import { useChains } from "wagmi";

import { DeprecationModal } from "@/components/deprecation-modal";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { MorphoMenu } from "@/components/morpho-menu";
import { WelcomeModal } from "@/components/welcome-modal";
import { APP_DETAILS, SHOW_REWARDS, SITE_URL, WORDMARK } from "@/lib/constants";

enum SubPage {
  Earn = "earn",
  Farm = "farm",
  Borrow = "borrow",
  Points = "points",
  Liquidations = "liquidations",
  Rewards = "rewards",
}

function ConnectWalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ show }) => {
        return (
          <Button variant="blue" size="lg" className="rounded-full px-3 font-light md:px-6" onClick={show}>
            <span className="inline md:hidden">Connect</span>
            <span className="hidden md:inline">Connect&nbsp;Wallet</span>
          </Button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

export default function Page() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { chain: selectedChainSlug } = useParams();

  const location = useLocation();
  const locationSegments = location.pathname.toLowerCase().split("/").slice(1);
  const selectedSubPage =
    locationSegments.at(1) === SubPage.Farm
      ? SubPage.Farm
      : locationSegments.at(1) === SubPage.Borrow
        ? SubPage.Borrow
        : locationSegments.at(1) === SubPage.Points
          ? SubPage.Points
          : locationSegments.at(1) === SubPage.Liquidations
            ? SubPage.Liquidations
            : locationSegments.at(1) === SubPage.Rewards
              ? SubPage.Rewards
              : SubPage.Earn;

  const chains = useChains();
  const chain = useMemo(
    () => chains.find((chain) => getChainSlug(chain) === selectedChainSlug),
    [chains, selectedChainSlug],
  );

  const setSelectedChainSlug = useCallback(
    (value: string) => {
      void navigate(`../${value}/${selectedSubPage}`, { replace: true, relative: "path" });
      // If selected chain is a core deployment, open main app in a new tab (we don't navigate away in
      // case they're using this because the main app is down).
      // if ([...CORE_DEPLOYMENTS].map((id) => getChainSlug(extractChain({ chains, id }))).includes(value)) {
      //   window.open(`https://app.morpho.org/${value}/${selectedSubPage}`, "_blank", "noopener,noreferrer");
      // }
    },
    [navigate, selectedSubPage],
  );

  useEffect(() => {
    document.title = `${APP_DETAILS.name} | ${selectedSubPage.charAt(0).toUpperCase()}${selectedSubPage.slice(1)}`;
  }, [selectedSubPage]);

  return (
    <div className="bg-background">
      <Toaster theme="dark" position="bottom-left" richColors />
      <Header className="flex flex-wrap items-center justify-between gap-y-2 px-3 py-3 md:px-5" chainId={chain?.id}>
        <div className="text-primary-foreground flex min-w-0 items-center gap-2 md:gap-4">
          {WORDMARK.length > 0 ? (
            <>
              <a href={SITE_URL} aria-label="Back to solonlend.xyz">
                <img className="max-h-[24px]" src={WORDMARK} />
              </a>
              <WatermarkSvg height={24} className="text-primary-foreground/50 hidden w-[170px] min-w-0 md:block" />
            </>
          ) : (
            <MorphoMenu />
          )}
          <div className="hidden items-center gap-0.5 rounded-full bg-transparent p-1 md:flex md:gap-2">
            <Link to={SubPage.Farm} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Farm ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full px-3 font-light md:px-6"
              >
                Farm
              </Button>
            </Link>
            <Link to={SubPage.Earn} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Earn ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full px-3 font-light md:px-6"
              >
                Earn
              </Button>
            </Link>
            <Link to={SubPage.Borrow} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Borrow ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full px-3 font-light md:px-6"
              >
                Borrow
              </Button>
            </Link>
            <Link to={SubPage.Points} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Points ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full px-3 font-light md:px-6"
              >
                Points
              </Button>
            </Link>
            <Link to={SubPage.Liquidations} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Liquidations ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full px-3 font-light md:px-6"
              >
                Liquidations
              </Button>
            </Link>
            {SHOW_REWARDS && (
              <Link to={SubPage.Rewards} relative="path">
                <Button
                  variant={selectedSubPage === SubPage.Rewards ? "tertiary" : "secondaryTab"}
                  size="lg"
                  className="rounded-full px-3 font-light md:px-6"
                >
                  Rewards
                </Button>
              </Link>
            )}
            <a href={`${SITE_URL}/docs`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondaryTab" size="lg" className="rounded-full px-3 font-light md:px-6">
                Docs ↗
              </Button>
            </a>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 md:gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-primary-foreground hover:bg-foreground hover:text-background p-2 font-mono transition-all duration-200 md:hidden"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <WalletMenu
            selectedChainSlug={selectedChainSlug!}
            setSelectedChainSlug={setSelectedChainSlug}
            connectWalletButton={<ConnectWalletButton />}
            coreDeployments={CORE_DEPLOYMENTS}
          />
        </div>
        {isMobileMenuOpen && (
          <div className="border-border bg-background/95 order-last -mx-3 w-screen border-b backdrop-blur-md md:hidden">
            <div className="flex flex-col gap-1 px-4 py-4">
              {[
                { to: SubPage.Farm, label: "FARM" },
                { to: SubPage.Earn, label: "EARN" },
                { to: SubPage.Borrow, label: "BORROW" },
                { to: SubPage.Points, label: "POINTS" },
                { to: SubPage.Liquidations, label: "LIQUIDATIONS" },
                ...(SHOW_REWARDS ? [{ to: SubPage.Rewards, label: "REWARDS" }] : []),
              ].map(({ to, label }) => (
                <Link key={to} to={to} relative="path" onClick={() => setIsMobileMenuOpen(false)}>
                  <span
                    className={`block px-3 py-2 text-left font-mono text-sm transition-all duration-200 ${
                      selectedSubPage === to
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-foreground hover:text-background"
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              ))}
              <div className="bg-border my-2 h-px" />
              <div className="px-3 py-1">
                <WatermarkSvg height={18} className="text-primary-foreground/50 w-[130px]" />
              </div>
              <a
                href={`${SITE_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-3 py-2 font-mono text-sm transition-all duration-200"
              >
                DOCS
                <span>{"\u2192"}</span>
              </a>
            </div>
          </div>
        )}
      </Header>
      <WelcomeModal />
      <DeprecationModal chainId={chain?.id} />
      <Outlet context={{ chain }} />
      <Footer />
    </div>
  );
}
