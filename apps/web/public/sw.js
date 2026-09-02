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
const VERSION = "plusone-sw-11";

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

/**
 * The dot on the app's own icon, set from here because the app is not open.
 *
 * AppBadge keeps this in step while a page is mounted and cannot while one is
 * not — which is the case this exists for. A push arrives at a closed app, the
 * member clears it from the lock screen, and the icon they glance at an hour
 * later carries no mark: the notification was the only signal and they have
 * already dismissed it. The icon is the one that stays.
 *
 * A DOT, never a count, for the reason AppBadge gives at length — an app icon
 * sits on a home screen in front of whoever picks the phone up. setAppBadge()
 * with no argument draws the unadorned mark. There is no count to pass here in
 * any case: the payload is content-blind by construction and carries no total.
 *
 * Android renders that valueless flag as a "1" — its launcher badge is numeric
 * and has no other shape — and it stays at 1 however many arrive. A constant is
 * not a count, so what the icon discloses is still "something", which is what
 * was wanted. AppBadge says more about it.
 *
 * Never cleared here. Reading is what clears it, and reading happens in the
 * app, where AppBadge can see the unread figure this file has no way to know.
 */
function markIcon() {
  if (!self.navigator || !("setAppBadge" in self.navigator)) return Promise.resolve();
  // Swallowed, and deliberately so: an installed app whose notification
  // permission was withdrawn rejects here, and a throw inside a push handler
  // is silence — which Chrome answers with its own "This site has been updated
  // in the background". The badge is the smaller of the two obligations and
  // must never be able to cost the member the notification.
  return self.navigator.setAppBadge().catch(() => {});
}

/**
 * The events that arrive SILENTLY. Everything else may make a sound.
 *
 * Mirrors PUSH_SILENT in packages/config/src/notifications.ts — see the note at
 * the options below.
 */
const SILENT = [
  "like_received",
  "nearby_joins",
  "activity_nearby",
  "premium_expiring",
  "referral_converted",
];

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
  // Its own waitUntil rather than a Promise.all with the notification below.
  // Both are kept alive to completion either way, and keeping them separate
  // means neither can ever be the reason the other did not happen.
  event.waitUntil(markIcon());

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        /**
         * The glyph for this KIND of notification, chosen by the server.
         *
         * ── the slot cannot be left empty, measured twice ───────────────────
         *
         * Android draws a large icon on the right and will not leave it blank:
         * with none it synthesises a monogram from the origin — a grey circle
         * with a "W" in it, for "www". That was found when the icon was first
         * added, and confirmed again on 2026-09-01 after it was removed on the
         * theory that TWA delegation had changed the fallback. It had not, and
         * the W came back.
         *
         * So the only question is what fills it. It used to be the app's own
         * mark, which drew the mark twice in one notification, once each side.
         * A glyph that matches the sentence is the better use of a space that
         * is going to be occupied regardless.
         *
         * It comes down in the PAYLOAD rather than being mapped here, because
         * this file cannot import from a workspace package and a second copy of
         * a seventeen-event map is a second thing to drift.
         *
         * The fallback is the mark, for a push written before this field
         * existed — an old payload sitting in a service worker's queue is a
         * real thing, and a missing icon would be a "W" again.
         */
        /**
         * The status-bar mark, which Android draws from the ALPHA CHANNEL
         * alone: every opaque pixel becomes solid white, every transparent one
         * disappears. This shipped as a full-colour square with an opaque
         * background, so the status bar showed a solid white block until the
         * shade was pulled down and the real icon appeared under it. It is the
         * glyph and transparency now.
         */
        icon: typeof payload.icon === "string" ? payload.icon : "/icons/icon-192.png",
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
        /**
         * renotify only alongside a tag, and never alongside silent: both
         * combinations throw.
         *
         * Sound is the default now, and silence the exception. A silent
         * notification never peeks and never sounds — it goes to the tray and is
         * found when the member next looks, which for a message is the same as
         * not sending it.
         *
         * §3.3 still holds, because the line it draws is narrower than "no
         * sound": it forbids the APP manufacturing a reason to come back, not
         * telling somebody a person acted. So the silent list is the events
         * where nobody addressed the member — a like, new arrivals nearby, a
         * subscription ending.
         *
         * MUST MATCH PUSH_SILENT in packages/config/src/notifications.ts. This
         * file is served as a static asset and cannot import it, so
         * push.test.ts reads this list back out and fails when they disagree.
         */
        ...(SILENT.includes(payload.event) ? { silent: true } : { renotify: true }),
      })
      .catch(() => self.registration.showNotification(title, { body, data, tag })),
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

/**
 * The subscription the browser rotated out from under us.
 *
 * A push subscription is not permanent. Browsers rotate them — Chrome does it
 * on its own schedule, and a key change or a storage eviction does it too — and
 * when they do, the old endpoint stops working forever and this event fires.
 * Unhandled, the device goes permanently silent while the settings screen still
 * says "On for this device", which is the worst shape a failure can take here:
 * the member has been told it works and has no way to find out it does not.
 *
 * All this does is take out a new subscription with the same key. Telling the
 * SERVER about it happens in the app, on the next load — see ServiceWorker,
 * which re-registers whatever the browser currently holds. That split is
 * deliberate: this event can fire with no page open and no fresh session, so a
 * worker posting to an authenticated route would be relying on a cookie that
 * may well have expired, and failing silently again.
 *
 * The window between the rotation and the next app open is one where pushes do
 * not arrive. It cannot be closed from here, and it closes itself the moment
 * somebody opens the app.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      // The key the old subscription was made with, which is the only place to
      // get it: a worker has no access to the app's environment variables.
      const key = event.oldSubscription?.options?.applicationServerKey;
      if (event.newSubscription || !key) return;

      try {
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      } catch {
        // Permission revoked, or the service refused. Either way there is
        // nothing to retry and nobody to tell — the settings screen reads the
        // browser directly and will say "off" the next time it is opened.
      }
    })(),
  );
});

// Referenced so the constant is not dead code to a linter, and so the version
// shows up in the worker's own scope when debugging from DevTools.
self.__PLUSONE_SW_VERSION = VERSION;
