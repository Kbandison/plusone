"use client";

import { useEffect, useState, useTransition } from "react";

import { DRAFT_COPY, PUSH_APP_NAME } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { registerPushDevice, unregisterPushDevice } from "@/app/app/push-actions";
import { inNativeShell, isAppleMobile, nativePlatform } from "@/lib/native-shell";
import { nativePushPermission, registerForNativeToken, requestNativePush } from "@/lib/native-push";

const C = DRAFT_COPY.app;

/**
 * VAPID's public key arrives base64url and PushManager wants bytes.
 *
 * Backed by an explicitly allocated ArrayBuffer rather than `Uint8Array.from`:
 * the latter infers `Uint8Array<ArrayBufferLike>`, which is not a `BufferSource`
 * — the DOM types narrowed when ArrayBuffer became generic, and a view over a
 * SharedArrayBuffer cannot be sent to a push service.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The two keys off a PushSubscription, base64url, which is what the DB stores. */
function keysOf(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return p256dh && auth ? { p256dh, auth } : null;
}

type State = "checking" | "unsupported" | "install-first" | "blocked" | "off" | "on";

/**
 * Turning the Drop's notification on, per device.
 *
 * Per device rather than per account, deliberately, and the UI says so. A
 * member with a phone and a laptop has two subscriptions and may reasonably
 * want one — and "on" here can only ever mean "on in this browser", because a
 * push subscription belongs to a browser install rather than to a person.
 *
 * No automatic prompt. A permission dialogue on arrival is the one people
 * dismiss by reflex, and dismissing it on iOS or Firefox is permanent for the
 * origin — there is no second ask. So it happens behind a button, on a screen
 * where somebody has gone looking for it, with the privacy note visible before
 * they press.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  // Evaluated once per render rather than per branch: inNativeShell() reads
  // window, so it must not be called during the server render.
  const [native, setNative] = useState(false);
  useEffect(() => setNative(inNativeShell()), []);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!vapidPublicKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads Notification and PushManager, which do not exist on the server
      setState("unsupported");
      return;
    }

    // The three things that have to exist, checked separately from permission:
    // a browser can have Notification and no PushManager (older Safari), and
    // an iPhone has all three only once the site is on the home screen.
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      /**
       * iOS is the case worth telling apart.
       *
       * Safari on iOS exposes none of this in a browser tab and all of it in an
       * installed one, so "your browser cannot do this" is wrong and
       * discouraging — the member is one gesture away. `standalone` is the only
       * way to tell whether they have already made it.
       */
      /**
       * The shell lands here, and must not be told to install anything.
       *
       * A WebView has no PushManager at all — Apple gives web push to Safari
       * and to home-screen web apps, and to nothing else — so the native app
       * falls into this branch, with `installed` false for the reason
       * install-app.tsx sets out. Left alone it reads iPhone off the user agent
       * and prints the share-menu instructions inside the app itself.
       *
       * `unsupported` because it is presently true: native push arrives through
       * the Capacitor plugin rather than PushManager, and until that path is
       * built this device cannot be switched on from this screen. pushUnsupported
       * no longer says "browser" for exactly this reason.
       *
       * This is where the native branch plugs in, and it wants its own state
       * when it does — "not yet" and "not here" are different sentences, and
       * only one of them is worth a member reading twice.
       */
      if (inNativeShell()) {
        /**
         * The native branch the comment above waited for.
         *
         * iOS is the source of truth here, the same way the browser is for the
         * web path below — `checkPermissions` answers without asking the member
         * anything, so this can run on every visit to the screen.
         *
         * "granted" is reported as ON rather than looked up in the database.
         * The device knows; `push_subscriptions` grants members no select, and
         * NativePush re-registers on every app load, so a granted permission and
         * a stored token are the same state in practice.
         */
        void (async () => {
          const permission = await nativePushPermission();
          if (permission === "granted") setState("on");
          else if (permission === "denied") setState("blocked");
          else if (permission === null) setState("unsupported");
          else setState("off");
        })();
        return;
      }

      const iOS = isAppleMobile();
      const installed =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      setState(iOS && !installed ? "install-first" : "unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    // The browser is the source of truth for whether THIS device is subscribed,
    // which is why push_subscriptions grants members no select: the answer is
    // already here and does not need a row read to produce it.
    void navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    });
  }, [vapidPublicKey]);

  function enable() {
    setError(null);
    start(async () => {
      try {
        /**
         * The native path, and the only place this app asks iOS for permission.
         *
         * iOS shows that alert once for the life of an install, so it is spent
         * here — on a member who has come to the settings screen and pressed a
         * switch — rather than on a cold launch, which is what it did until the
         * Simulator showed the prompt landing on top of Tonight's Drop.
         */
        if (inNativeShell()) {
          const platform = nativePlatform();
          if (platform !== "ios" && platform !== "android") {
            setState("unsupported");
            return;
          }

          const permission = await requestNativePush();
          if (permission !== "granted") {
            setState(permission === "denied" ? "blocked" : "off");
            return;
          }

          // No token means APNs did not answer — offline, or refusing. Left OFF
          // rather than ON, because a switch that says on while nothing can
          // reach the device is the failure this whole screen exists to avoid.
          const token = await registerForNativeToken();
          if (!token) {
            setState("off");
            setError(C.pushFailed);
            return;
          }

          const result = await registerPushDevice({ platform, token });
          if (!result.ok) {
            setState("off");
            setError(C.pushFailed);
            return;
          }

          setState("on");
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          // Required to be true by every browser that implements this: a
          // subscription that could send a silent push is a tracking channel,
          // so the platforms simply do not allow one.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
        });

        const keys = keysOf(subscription);
        if (!keys) {
          setError(C.pushFailed);
          return;
        }

        const result = await registerPushDevice({
          platform: "web",
          endpoint: subscription.endpoint,
          ...keys,
        });
        if (!result.ok) {
          // Rolled back, so the browser does not hold a subscription the server
          // has never heard of — that device would be permanently silent while
          // its own settings said otherwise.
          await subscription.unsubscribe();
          setError(C.pushFailed);
          return;
        }
        setState("on");
      } catch {
        setError(C.pushFailed);
      }
    });
  }

  /**
   * Draws one locally, to tell the two halves of the chain apart.
   *
   * A push accepted by the push service and never seen has two possible causes
   * and they need different fixes: the service worker refused to draw it, or
   * the phone's own notification settings swallowed it. This skips the server
   * and the push service entirely and asks the worker to draw one now — so
   * nothing appearing means the device is blocking, and something appearing
   * means the device is fine and the problem is delivery.
   *
   * Through the registration rather than `new Notification()`: the constructor
   * is unavailable in an installed app on Android, which is exactly where this
   * question gets asked.
   */
  function test() {
    setError(null);
    start(async () => {
      try {
        /**
         * Web only, and guarded rather than assumed.
         *
         * This draws through the service worker, and a WebView has none —
         * `navigator.serviceWorker` is undefined in the shell, so this threw
         * "undefined is not an object" straight onto the settings screen the
         * first time push worked there. The button is not rendered natively
         * either; this is the second lock, because a render condition is easier
         * to change by accident than a return.
         */
        if (inNativeShell()) return;

        const registration = await navigator.serviceWorker.ready;
        // The app name, exactly as a real one arrives. This is answering "what
        // will these look like", and a test wearing a different title than the
        // thing it is testing answers a different question.
        // The same options a real one is drawn with. A test that looks
        // different from the thing it tests is not a test — including the icon,
        // whose absence Android fills with a letter taken from the domain.
        await registration.showNotification(PUSH_APP_NAME, {
          body: C.pushTestBody,
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag: "plusone-test",
        });
        setTested(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : C.pushFailed);
      }
    });
  }

  function disable() {
    setError(null);
    start(async () => {
      /**
       * Nothing to unsubscribe from natively: iOS owns the permission, and it
       * is revoked in Settings rather than here. What this can do is forget the
       * token, which is what actually stops a send reaching the device.
       *
       * The permission stays granted, so the switch comes back ON next time the
       * screen reads it. That is honest — the member has not withdrawn
       * anything, and telling them otherwise would be the lie in the other
       * direction.
       */
      if (inNativeShell()) {
        const token = await registerForNativeToken();
        if (token) await unregisterPushDevice(token);
        setState("off");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          setState("off");
          return;
        }
        // The row goes first. The other order can leave a row pointing at an
        // endpoint the browser has already discarded, which is a guaranteed 410
        // on the next send.
        await unregisterPushDevice(subscription.endpoint);
        await subscription.unsubscribe();
        setState("off");
      } catch {
        setError(C.pushFailed);
      }
    });
  }

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[0.972rem]">{C.pushHeading}</h2>
      <p className="mt-3 text-[12.2px] leading-[1.65] text-ink-2">{C.pushBody}</p>

      {/* Before the button, not after it. Somebody deciding whether to allow
          notifications from an app like this one is deciding what a locked
          phone will show, and that has to be answerable before they press. */}
      <p className="mt-3 max-w-[52ch] text-[11.3px] leading-[1.6] text-ink-3">
        {C.pushPrivacyNote}
      </p>

      <div className="mt-5">
        {state === "checking" ? null : state === "install-first" ? (
          <p className="text-[12.2px] leading-[1.6] text-ink-2">{C.pushInstallFirst}</p>
        ) : state === "unsupported" ? (
          <p className="text-[12.2px] text-ink-3">{C.pushUnsupported}</p>
        ) : state === "blocked" ? (
          <p className="max-w-[52ch] text-[12.2px] leading-[1.6] text-ink-2">{C.pushBlocked}</p>
        ) : state === "on" ? (
          <div className="flex flex-wrap items-center gap-4">
            <p role="status" className="text-[12.2px] text-positive">
              {C.pushEnabled}
            </p>
            {/* Not offered in the shell. It answers "will this device draw a
                notification at all", which the web needs because a service
                worker can refuse silently — and which iOS has already answered
                by granting the permission that got us here. There is no service
                worker in a WebView to ask, and the question it would answer
                next, whether delivery works, is only answered by a real push. */}
            {native ? null : (
              <button
                type="button"
                onClick={test}
                disabled={pending}
                className={buttonClass("secondary")}
              >
                {C.pushTestLabel}
              </button>
            )}
            <button
              type="button"
              onClick={disable}
              disabled={pending}
              className="ease-brand text-[11.7px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
            >
              {C.pushDisableLabel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={pending}
            className={buttonClass("secondary")}
          >
            {C.pushEnableLabel}
          </button>
        )}
      </div>

      {tested && !error ? (
        <p role="status" className="mt-3 max-w-[52ch] text-[11.3px] leading-[1.6] text-ink-2">
          {C.pushTestShown}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[11.3px] text-critical">
          {error}
        </p>
      ) : null}
    </section>
  );
}
