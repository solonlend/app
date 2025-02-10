import {
  createConfig,
  fallback,
  http,
  injected,
  unstable_connector,
  WagmiProvider,
} from "wagmi";
import { base, mainnet } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "./app/dashboard/page";

const wagmiConfig = createConfig({
  chains: [mainnet, base],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [mainnet.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected" }),
      http("https://eth.drpc.org"),
      http(undefined, { retryCount: 5, retryDelay: 500 }),
    ]),
    [base.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected" }),
      http("https://base.drpc.org"),
      http(undefined, { retryCount: 5, retryDelay: 500 }),
    ]),
  },
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
