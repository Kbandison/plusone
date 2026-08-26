/**
 * Push inside the native shell, which is a different mechanism from push in a
 * browser — not a variation on it.
 *
 * A WebView has no `PushManager`. Apple gives web push to Safari and to
 * home-screen web apps and to nothing else, so every line of the PushManager
 * path is unreachable in the shell. What replaces it is `@capacitor/push-notifications`,
 * reached through the bridge the shell injects.
 *
 * Called through `Capacitor.nativePromise` and `Capacitor.addListener` rather
 * than by importing the plugin: the shell loads this app over the network, so
 * nothing in `apps/web` is bundled into it. The bridge defines both at document
 * start and they are the entire interface.
 *
 * Everything here answers null or false in a browser, so a caller does not have
 * to know which surface it is on.
 */
const PLUGIN = "PushNotifications";

/** iOS reports one of these; the plugin normalises Android to match. */
export type NativePushPermission = "granted" | "denied" | "prompt" | "prompt-with-rationale";

interface CapacitorBridge {
  nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown>;
  addListener?: (
    plugin: string,
    eventName: string,
    callback: (data: unknown) => void,
  ) => { remove: () => Promise<void> };
}

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  // Both, because an older shell may carry the bridge without the plugin —
  // apps/web and apps/ios ship on entirely different clocks.
  return cap?.nativePromise && cap.addListener ? cap : null;
}

export function nativePushAvailable(): boolean {
  return bridge() !== null;
}

/**
 * What iOS currently thinks, without asking the member anything.
 *
 * Separate from requesting on purpose. iOS shows the permission alert ONCE for
 * the life of an install: a member who declines can never be asked again from
 * inside the app. Spending that on a cold launch, before anybody has expressed
 * interest, is the one mistake that cannot be undone.
 */
export async function nativePushPermission(): Promise<NativePushPermission | null> {
  const cap = bridge();
  if (!cap) return null;
  try {
    const status = (await cap.nativePromise?.(PLUGIN, "checkPermissions", {})) as
      { receive?: NativePushPermission } | undefined;
    return status?.receive ?? null;
  } catch {
    return null;
  }
}

/** Asks. Only ever from something the member pressed. */
export async function requestNativePush(): Promise<NativePushPermission | null> {
  const cap = bridge();
  if (!cap) return null;
  try {
    const status = (await cap.nativePromise?.(PLUGIN, "requestPermissions", {})) as
      { receive?: NativePushPermission } | undefined;
    return status?.receive ?? null;
  } catch {
    return null;
  }
}

/**
 * Registers with APNs and resolves the device token.
 *
 * THE TOKEN IS AN EVENT, NOT A RETURN VALUE. `register()` resolves as soon as
 * iOS has been asked; the token arrives later on the `registration` listener,
 * or never — the device may be offline, or APNs may refuse. Written as
 * `const token = await register()` this would compile, run, and store nothing,
 * which is why the promise is built around the listener rather than the call.
 *
 * The timeout is not a guess about network speed: it is the difference between
 * a settings toggle that resolves to "off" and one that spins forever on a
 * device that is never going to answer.
 */
export async function registerForNativeToken(timeoutMs = 10_000): Promise<string | null> {
  const cap = bridge();
  if (!cap) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const handles: { remove: () => Promise<void> }[] = [];

    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const handle of handles) void handle.remove();
      resolve(token);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    // Listeners before register(), or a token iOS answers from cache in the
    // same tick is delivered to nobody.
    handles.push(
      cap.addListener!(PLUGIN, "registration", (data) => {
        finish((data as { value?: string } | undefined)?.value ?? null);
      }),
    );
    handles.push(cap.addListener!(PLUGIN, "registrationError", () => finish(null)));

    void cap.nativePromise?.(PLUGIN, "register", {}).catch(() => finish(null));
  });
}
