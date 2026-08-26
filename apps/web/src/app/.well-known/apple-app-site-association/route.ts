/**
 * Universal Links: what stops a tapped link throwing a member into Safari.
 *
 * Without this, a notification tap or an emailed link opens the system browser
 * — which has its own cookie jar, so a signed-in member lands on a sign-in
 * page and the app they already have is not involved. 6c60f63 found the same
 * shape from the other direction: Capacitor hands any navigation outside
 * `server.url`'s host to Safari, and the apex 308s to www.
 *
 * Like assetlinks.json, the failure is silent. Get the appID wrong, serve the
 * wrong content-type, or answer through a redirect and iOS simply never claims
 * the domain. Nothing errors, nothing logs, links just keep opening a browser.
 *
 * A Route Handler rather than a file in `public/`, for the same two reasons the
 * Android one gives: Next documents `.well-known` as a custom route, and a
 * handler is the only way to be sure of the `content-type`.
 *
 * NOTE THE PATH HAS NO EXTENSION. `apple-app-site-association.json` is a
 * different URL and iOS does not look for it.
 */
import { NextResponse } from "next/server";

/**
 * Static. Nothing varies by request, and a Route Handler is dynamic by default
 * — which would mean a server render every time iOS revalidates, for a file
 * that changes when the app id changes and never otherwise.
 */
export const dynamic = "force-static";

/**
 * The team id, and the same value as APNS_TEAM_ID.
 *
 * Written here rather than read from the environment because this file is
 * static: a build-time env read would bake whatever the build machine had, and
 * a wrong one fails silently rather than loudly. assetlinks.json hard-codes its
 * fingerprint for the same reason.
 *
 * Apple calls this the "app id prefix". For this account it is the team id;
 * they differ only for apps migrated between accounts, which this is not.
 */
const TEAM_ID = "JUR426AHDD";

/** The same identifier as Android, deliberately — one name across both stores. */
const BUNDLE_ID = "app.loveplusone";

/**
 * `appIDs` and `components`, not `appID` and `paths`.
 *
 * The second pair is the iOS 12 format. Both still parse, and mixing them is
 * how a file ends up doing something other than what it reads like — the
 * system prefers `components` where it exists, so `paths` beside it is dead
 * weight that looks authoritative.
 */
const APP_ID = `${TEAM_ID}.${BUNDLE_ID}`;

/**
 * Three prefixes, and the exclusions matter as much as the inclusions.
 *
 * `/app/*` is the member area — everything a notification links to. `/i/*` is
 * an invite, which is the one link most likely to be tapped by somebody who
 * already has the app. `/auth/*` is the sign-in return: it MUST open in the
 * app, because a session that lands in Safari is a session the shell cannot
 * see, which is the exact failure 6c60f63 describes.
 *
 * Marketing stays out on purpose. Somebody sharing /faq or /how-it-works is
 * usually sharing it with a person who does not have the app, and a link that
 * opens an app they do not have is a link that does nothing useful — while the
 * same page in a browser is the whole point of it being public.
 */
const COMPONENTS = [
  { "/": "/app/*", comment: "The member area. Every notification links here." },
  {
    "/": "/i/*",
    comment: "An invite. Most likely of all to be tapped by somebody who has the app.",
  },
  {
    "/": "/auth/*",
    comment: "Sign-in return. In Safari the session lands where the shell cannot see it.",
  },
];

export function GET() {
  return NextResponse.json(
    { applinks: { details: [{ appIDs: [APP_ID], components: COMPONENTS }] } },
    {
      headers: {
        // iOS wants application/json and will not accept a guess. It also must
        // not be behind a redirect — see the route's own note.
        "content-type": "application/json",
        // A day. Long enough that iOS is not refetching it, short enough that a
        // corrected app id is picked up without waiting for a cache to age out.
        "cache-control": "public, max-age=86400",
      },
    },
  );
}
