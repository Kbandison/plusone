import { inTwa, nativePlatform } from "./native-shell";

/**
 * The context a bug report carries, worked out in the browser.
 *
 * All three are facts about the software. None is a fact about the person, and
 * that is a property this file has to keep rather than a coincidence — see the
 * stripping below.
 */
export type Surface = "browser" | "twa" | "ios" | "android";

/**
 * Which engine this is, which is the first question any bug on this app raises.
 *
 * `AGENTS.md` makes it a standing rule that a fix verified in one engine is not
 * verified in the other: the TWA is real Chrome, the iOS shell is WKWebView,
 * and Android's WebView is neither. So a report that does not say which one saw
 * the bug cannot be acted on without asking, and nobody ever volunteers it.
 *
 * `inTwa()` is checked BEFORE the native platform and not after. A TWA has no
 * `window.Capacitor` — it is Chrome — so `nativePlatform()` correctly answers
 * null there and an order that trusted it first would file every Android TWA
 * report as "browser", which is the one answer that loses the distinction this
 * exists for.
 */
export function currentSurface(): Surface {
  if (inTwa()) return "twa";
  const native = nativePlatform();
  if (native) return native;
  return "browser";
}

/**
 * A pathname reduced to its route shape.
 *
 * `/app/chats/3f2a8c1e-…` identifies a conversation, and a conversation on this
 * app is two people and a diagnosis. `/app/chats/[id]` says exactly as much
 * about WHERE a bug is and nothing about who was in it — which is the whole
 * trade, and it costs the report nothing.
 *
 * Query strings and fragments are dropped entirely rather than filtered. They
 * are where an identifier most often smuggles itself in — `?chat=`, `?u=`, a
 * token on a confirmation link — and there is no version of "the useful half of
 * a query string" worth the risk of guessing wrong.
 *
 * The CHECK constraint on `feedback.page` refuses anything this would not have
 * produced, so a caller that skips this is refused by the database rather than
 * quietly storing a path.
 */
export function routeShape(pathname: string): string {
  const path = (pathname || "/").split(/[?#]/)[0] ?? "/";

  return (
    "/" +
    path
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        // A uuid, the id shape everything in this schema uses.
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
          return "[id]";
        }
        // Anything entirely numeric.
        if (/^\d+$/.test(segment)) return "[id]";
        // A long opaque token — a base64url invite code, a hex beta code. The
        // length floor is what keeps ordinary route names ("notifications",
        // "verifications") out of it.
        if (
          segment.length >= 16 &&
          /^[A-Za-z0-9_-]+$/.test(segment) &&
          !/^[a-z-]+$/.test(segment)
        ) {
          return "[token]";
        }
        return segment;
      })
      .join("/")
  );
}

/**
 * The version string, such as it is.
 *
 * Deliberately the deploy sha rather than package.json's `version`, which has
 * been "0.1.0" since the repo was created and would tell a bug report nothing.
 * Vercel exposes the commit; falls back to "dev" locally, which is itself the
 * useful answer when somebody reports from a dev server.
 */
export function appVersion(): string {
  return (process.env["NEXT_PUBLIC_COMMIT_SHA"] ?? "dev").slice(0, 12);
}
