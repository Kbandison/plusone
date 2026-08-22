/**
 * The service worker, and it does almost nothing on purpose.
 *
 * Two jobs: receive a push and open the right screen when it is tapped. That is
 * the whole file, and the omission is the design decision worth reading.
 *
 * ── why there is no fetch handler ────────────────────────────────────────────
 *
 * Every PWA guide caches responses here for offline use. Doing that in this app
 * would put somebody's chats, their Drop and the rooms they read into a cache
 * that survives signing out — on a phone that can be picked up by a partner, a
 * parent or a border officer. This is an app people use precisely because who
 * they are is not safe to broadcast, and the app itself is entirely behind a
 * login and marked force-dynamic for the same reason.
 *
 * So there is no fetch handler at all. Not a narrow one, not a
 * network-first-with-fallback one: none. A service worker with no fetch handler
 * is still a first-class service worker for push, install and the home screen,
 * and it cannot leak a page it never stored. Offline support is a real feature
 * and it is not free here; it needs a decision about what may be cached and for
 * how long after a session ends, and that is Kevin's call rather than a default.
 *
 * ── content-blindness reaches this file too ──────────────────────────────────
 *
 * The payload arrives already checked by buildPayload, whose whole purpose is
 * that nothing carrying a condition word can leave it. This adds nothing to
 * what it is given — no name, no preview, no count — because a notification is
 * rendered on a lock screen visible to whoever is holding the phone.
 */

/**
 * The version exists so an update is visible in DevTools and so
 * skipWaiting/clients.claim below have an obvious reason. Bump it when this
 * file changes; the browser diffs the bytes, not the number, but a human
 * reading two versions of this cannot.
 */
const VERSION = "plusone-sw-3";

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close. There is
  // nothing cached to invalidate, so the usual reason to wait does not apply,
  // and a member who just granted permission should not have to close the app
  // before a push can arrive.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // A push with no data is legal and some services send one to test an
  // endpoint. Showing nothing is right; throwing would mark the delivery failed
  // and cost us the subscription.
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Not ours, or malformed. A push service will not send us anything we did
    // not sign for, so this is a bug rather than an attack — and the correct
    // response to a message we cannot read is still silence.
    return;
  }

  const title = payload.title;
  const body = payload.body;
  if (typeof title !== "string" || typeof body !== "string") return;

  const tag = typeof payload.event === "string" ? payload.event : "plusone";
  const data = { path: typeof payload.path === "string" ? payload.path : "/app" };

  /**
   * Shown with the full options, or with the bare minimum if those are refused.
   *
   * showNotification validates its options and THROWS on a combination the
   * browser dislikes — `silent` with `renotify` is one, and the set has changed
   * between Chrome versions. A throw inside a push handler is silence, and
   * Chrome answers silence with its own "This site has been updated in the
   * background", so the member gets a worse notification and we get no signal.
   *
   * The fallback drops every option that is decoration. Title and body are the
   * notification; the rest is polish, and polish is not worth the message.
   */
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        /**
         * No `icon`.
         *
         * Android already draws the app's own icon beside a notification, so
         * supplying the same image again renders it TWICE — once as the app,
         * once as the large icon on the right. In a browser the left slot is
         * the browser's own logo and cannot be changed, so the second copy
         * bought a duplicate when installed and nothing much when not.
         *
         * The badge is the one image worth sending: it is the status-bar mark,
         * and Android draws it from the alpha channel alone — every opaque
         * pixel becomes solid white. It was a full-colour square with an opaque
         * background, so the status bar showed a solid white block until the
         * shade was pulled down. It is the glyph and transparency now.
         */
        badge: "/icons/badge-96.png",
        // The path travels in data rather than in the tag or the title, so
        // nothing about the destination is displayed.
        data,
        /**
         * One notification per event type, replaced rather than stacked.
         *
         * Four unread messages should be one line saying there are messages,
         * not four identical lines — and the event name is the only thing here
         * that is safe to use as a key, because it carries no identity.
         */
        tag,
        // renotify only alongside a tag, and never alongside silent: both
        // combinations throw. The drop is the one event worth a buzz — it is a
        // scheduled moment the member opted into — so it is the one that is
        // not silent, and therefore the only one that may re-alert.
        ...(payload.event === "drop_ready" ? { renotify: true } : { silent: true }),
      })
      .catch(() =>
        self.registration.showNotification(title, { body, data, tag }),
      ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const path = event.notification.data?.path || "/app";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        // Includes the tabs this worker has not yet controlled — without it, a
        // tab open since before the worker activated is invisible here and the
        // tap opens a second copy of the app beside it.
        includeUncontrolled: true,
      });

      // Reuse a window rather than opening another. An installed app has one,
      // and a member who taps a notification expects to land in the app they
      // already have open, at the screen it names.
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});

// Referenced so the constant is not dead code to a linter, and so the version
// shows up in the worker's own scope when debugging from DevTools.
self.__PLUSONE_SW_VERSION = VERSION;
