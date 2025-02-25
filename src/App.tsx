import {
  createConfig,
  deserialize,
  fallback,
  http,
  injected,
  serialize,
  unstable_connector,
  WagmiProvider,
} from "wagmi";
import { base, corn, hemi, mainnet, mode as modeMainnet, sonic } from "viem/chains";
import { unichain } from "viem/op-stack";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import DashboardPage from "./app/dashboard/page";
import { Chain, HttpTransportConfig } from "viem";
import { RequestTrackingProvider } from "./hooks/use-request-tracking";

const httpConfig: HttpTransportConfig = {
  retryCount: 5,
  retryDelay: 500,
  timeout: 60_000,
};

const wagmiConfig = createConfig({
  chains: [mainnet, base, unichain as Chain, corn, modeMainnet, hemi, sonic],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [mainnet.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http("https://eth.drpc.org", httpConfig),
      http(undefined, httpConfig),
    ]),
    [base.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http("https://base.drpc.org", httpConfig),
      http(undefined, httpConfig),
    ]),
    [unichain.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http("https://unichain.drpc.org", httpConfig),
      http(undefined, httpConfig),
    ]),
    [corn.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http("https://mainnet.corn-rpc.com", httpConfig),
      http("https://maizenet-rpc.usecorn.com", httpConfig),
      http(undefined, httpConfig),
    ]),
    [modeMainnet.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http("https://mode.drpc.org", httpConfig),
      http(undefined, httpConfig),
    ]),
    [hemi.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http(undefined, httpConfig),
    ]),
    [sonic.id]: fallback([
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 5, retryDelay: 500 }),
      http("https://sonic.drpc.org", httpConfig),
      http(undefined, httpConfig),
    ]),
  },
  batch: {
    multicall: {
      batchSize: 2048,
      wait: 500,
    },
  },
  cacheTime: 4000,
  pollingInterval: 4000,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 7 * 24 * 60 * 60 * 1_000, // 7 days
    },
  },
});

const persister = createSyncStoragePersister({
  serialize,
  storage: window.localStorage,
  deserialize,
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <RequestTrackingProvider>
          <DashboardPage />
        </RequestTrackingProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
