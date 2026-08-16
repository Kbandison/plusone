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

  experimental: {
    serverActions: {
      /**
       * Must clear MAX_UPLOAD_BYTES, or the app rejects nothing and the
       * framework rejects everything.
       *
       * Next caps a Server Action body at 1 MB by default. photo-limits.ts
       * accepts 8 MB and the storage bucket accepts 8 MB, so a photo from any
       * phone passed both of our checks and was refused by the framework before
       * the action ran — the member got "Body exceeded 1 MB limit" instead of
       * anything this app wrote.
       *
       * The number is 8 MB plus 256 KB of headroom: the limit applies to the
       * raw request body, and multipart/form-data adds boundaries, part headers
       * and field metadata on top of the file itself.
       *
       * upload-limits.test.ts asserts the three stay in step.
       */
      bodySizeLimit: 8 * 1024 * 1024 + 256 * 1024,
    },
  },

  images: {
    // Signed photo URLs come from the Supabase project host. Narrow to that
    // host and that path: a wildcard here would let any URL be proxied through
    // our optimiser.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
    // Caps the number of transformation variants Vercel bills for
    // (BACKEND.md → Scale & Cost Resilience, Layer 2).
    qualities: [75],
  },
};

export default nextConfig;
