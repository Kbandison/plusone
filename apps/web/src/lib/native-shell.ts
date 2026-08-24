/**
 * Whether this is running inside the native shell rather than a browser.
 *
 * There are three states here and the code that predates this file knew two. A
 * page is in a browser tab, or it is an installed web app — and both of the
 * checks that answered that question, `display-mode: standalone` and
 * `navigator.standalone`, say "not installed" for a WebView. The first is
 * `browser` there; the second is Safari's own property and does not exist.
 *
 * So a native app read as a tab, and the two screens that branch on it drew the
 * wrong thing: settings offered "add ⁺One to your home screen" to somebody
 * standing inside the app, on the platform where that sentence is otherwise
 * true and so reads as if it were meant.
 *
 * Capacitor injects `window.Capacitor`, and its `isNativePlatform()` returns
 * false on Capacitor's own web target — so this stays false in every browser,
 * including one that has the runtime loaded. Nothing injects it today, which is
 * the point: it answers "no" until the app is wrapped and starts answering
 * "yes" the moment it is, with nothing else to change.
 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

/**
 * The guard the UI branches on.
 *
 * Deliberately not derived from nativePlatform(): a shell that reports itself
 * native under a name this file has not heard of is still a shell, and treating
 * it as a browser would put the home-screen instructions back.
 */
export function inNativeShell(): boolean {
  return capacitor()?.isNativePlatform?.() === true;
}

/**
 * Which shell, for the places that need to say.
 *
 * Separate from the guard because push_subscriptions.platform accepts exactly
 * 'web' | 'ios' | 'android', and this is where the last two will come from when
 * the native push path is wired — a device token goes in `endpoint` and this
 * goes in `platform`. Null rather than a guess when the name is unrecognised.
 */
export type NativePlatform = "ios" | "android";

export function nativePlatform(): NativePlatform | null {
  if (!inNativeShell()) return null;
  const platform = capacitor()?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : null;
}

/**
 * Whether this is running inside the Android Trusted Web Activity.
 *
 * Separate from everything above, because a TWA is not a native shell in the
 * sense those functions mean. It is real Chrome — same engine, same cookie jar,
 * same service worker as the browser — so `window.Capacitor` is absent and both
 * inNativeShell() and nativePlatform() correctly answer no. A TWA registers an
 * ordinary web push subscription, which is why push_subscriptions.platform stays
 * 'web' for one and why nativePlatform() must not start claiming otherwise.
 *
 * What it is needed for is the small set of decisions where being inside a Play
 * app matters and the engine does not: Play Billing through the Digital Goods
 * API, which only exists in a TWA, and anything that should not offer to install
 * an app the member has already installed.
 *
 * The check is `document.referrer`, which web.dev documents for this — Chrome
 * sets it to `android-app://<package>` for the launch navigation. Note "launch":
 * the referrer belongs to that first navigation and a reload does not carry it,
 * so asking twice in one session would answer yes and then no. The answer is
 * cached per tab the first time it is true.
 *
 * Deliberately not wired into install-app.tsx yet. A TWA reports
 * `display-mode: standalone`, so the check already there is expected to hide the
 * install card on its own, and swapping a working condition for an unverified
 * one on hardware nobody here has is how a regression gets shipped. Wire it when
 * there is a TWA to watch it in.
 */
const TWA_LAUNCH_KEY = "plusone:twa";

export function inTwa(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  // sessionStorage throws rather than returning null when storage is blocked,
  // and a member with cookies locked down is exactly who this must not break
  // for. A failure to cache costs nothing but the cache.
  try {
    if (window.sessionStorage.getItem(TWA_LAUNCH_KEY) === "1") return true;
  } catch {
    // Storage unavailable. Fall through to the referrer, which still answers
    // correctly on the launch navigation.
  }

  const launched = document.referrer.startsWith("android-app://");
  if (!launched) return false;

  try {
    window.sessionStorage.setItem(TWA_LAUNCH_KEY, "1");
  } catch {
    // As above.
  }
  return true;
}
