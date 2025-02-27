import { FleekConfig } from "@fleek-platform/cli";

export default {
  sites: [
    {
      slug: "colossal-machine-hundreds",
      distDir: "dist",
      buildCommand: "pnpm run build",
    },
  ],
} satisfies FleekConfig;
