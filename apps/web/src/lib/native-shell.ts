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
