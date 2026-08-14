import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so Next
  // compiles them alongside the app.
  transpilePackages: [
    "@plusone/config",
    "@plusone/db",
    "@plusone/logic",
    "@plusone/types",
    "@plusone/ui-tokens",
  ],
  // Native module. Bundling it produces a build error that points at
  // detect-libc rather than at sharp.
  serverExternalPackages: ["sharp"],

  images: {
    // Caps the number of transformation variants Vercel bills for
    // (BACKEND.md → Scale & Cost Resilience, Layer 2).
    qualities: [75],
  },
};

export default nextConfig;
