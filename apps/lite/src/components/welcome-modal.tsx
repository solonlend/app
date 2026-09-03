import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morpho-org/uikit/components/shadcn/alert-dialog";
import { useLocalStorage } from "@morpho-org/uikit/hooks/use-local-storage";

import { TERMS_OF_USE } from "@/lib/constants";

export function WelcomeModal() {
  const [hasSeenWelcome, setHasSeenWelcome] = useLocalStorage<boolean>(
    "hasSeenWelcome",
    new URLSearchParams(window.location.search).has("skipWelcome"),
  );

  const onClose = () => {
    setHasSeenWelcome(true);
  };

  return (
    <AlertDialog open={!hasSeenWelcome}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="mb-3 text-2xl font-light">Welcome!</AlertDialogTitle>
          <AlertDialogDescription className="bg-secondary text-secondary-foreground rounded-lg p-4 font-light">
            You are using Solon — borrow USDG against tokenized US stocks, or supply USDG to earn the interest borrowers
            pay.
            <br />
            <br />
            Solon is a curator on Morpho. Every position lives in immutable, audited Morpho contracts on Robinhood Chain
            — this interface holds nothing and can be bypassed entirely.
            <br />
            <br />
            Not offered to persons or entities in the US, China, or sanctioned jurisdictions. By continuing, you also
            agree to Morpho's{" "}
            <a className="underline" href={TERMS_OF_USE} rel="noopener noreferrer" target="_blank">
              Terms of Use
            </a>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className="w-full rounded-full" onClick={onClose}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
