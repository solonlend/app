import { FleekConfig } from "@fleek-platform/cli";

export default {
  sites: [
    {
      slug: "morpho-blue-offchain-public",
      distDir: "dist",
      buildCommand: "pnpm run build",
    },
  ],
} satisfies FleekConfig;
