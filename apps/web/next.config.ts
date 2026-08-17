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

      /**
       * Lets a dev tunnel reach the Server Actions behind it.
       *
       * Needed because the liveness step cannot be tested on a desktop without
       * a camera, and a phone cannot reach `localhost`. Its LAN address is no
       * use either: `getUserMedia` requires a secure context, and an http://
       * origin that is not localhost is not one — the camera is refused before
       * any of our code runs. A tunnel gives the phone a real HTTPS origin.
       *
       * Next compares a Server Action's Origin against the host to stop CSRF,
       * and a tunnel makes those differ, so the tunnel host has to be named.
       *
       * Gated on NODE_ENV so a stale value cannot widen the check in
       * production, and read from the environment because the hostname changes
       * every time a quick tunnel restarts. Set DEV_TUNNEL_HOST to the bare
       * host — no scheme, no path.
       */
      ...(process.env.NODE_ENV !== "production" && process.env["DEV_TUNNEL_HOST"]
        ? { allowedOrigins: [process.env["DEV_TUNNEL_HOST"]] }
        : {}),
    },
  },

  images: {
    /**
     * The optimiser is OFF, which is what this app already assumed.
     *
     * Every image renders with `unoptimized` on the component (member-photo.tsx)
     * — deliberately, because Vercel's optimiser caches by URL and these are
     * per-viewer signed objects. But the route still existed, and its
     * remotePatterns entry was `hostname: "*.supabase.co"` with `search`
     * omitted, which the Next docs call out by name: a single-subdomain wildcard
     * plus an implied `**` search "may allow malicious actors to optimize urls
     * you did not intend". So /_next/image would happily fetch and cache a
     * signed object from ANY Supabase project on the internet, on our bandwidth.
     *
     * Nothing renders an optimised image, so the door is closed rather than
     * narrowed. If the optimiser is ever wanted, pin the hostname to this
     * project's exact ref.
     */
    unoptimized: true,
  },
};

export default nextConfig;
