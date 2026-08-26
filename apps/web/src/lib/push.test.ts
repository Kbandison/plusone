import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOTIFICATIONS } from "@plusone/config";

const WEB = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

/**
 * Assertions read code, not the prose around it.
 *
 * Every file here explains itself at length, and a window measured in
 * characters closes inside a comment long before it reaches the next statement.
 * Five of these assertions failed on their first run for exactly that, against
 * code that was already right.
 */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

const sw = withoutComments(read("public/sw.js"));
const transport = withoutComments(read("src/lib/web-push.ts"));
const notifier = withoutComments(read("src/lib/notifier.ts"));
const fanout = withoutComments(read("src/lib/notify.ts"));
const toggle = withoutComments(read("src/app/app/settings/push-toggle.tsx"));
const cron = withoutComments(read("src/app/api/cron/drop-notify/route.ts"));
const sql = withoutComments(
  read("../../supabase/migrations/20260821000400_telling_people_the_drop_landed.sql"),
);

/**
 * Every deep link was a 404.
 *
 * The paths were written before the app had routes and never revisited: /drop,
 * /inbox, /chats, /browse, /invite. The app lives under /app. A notification
 * whose entire purpose is bringing somebody back would have landed them on a
 * not-found page, and nothing caught it because nothing had ever delivered one.
 */
describe("a notification leads somewhere that exists", () => {
  /** Every page route in the app directory, as a URL path. */
  function pagesUnder(dir: string, prefix = ""): Set<string> {
    const found = new Set<string>();
    for (const entry of readdirSync(join(WEB, "src/app", dir), { withFileTypes: true })) {
      if (entry.name === "page.tsx") found.add(prefix || "/");
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const segment = /^[(@]/.test(entry.name) ? "" : `/${entry.name}`;
      for (const nested of pagesUnder(`${dir}/${entry.name}`, `${prefix}${segment}`)) {
        found.add(nested);
      }
    }
    return found;
  }

  const pages = pagesUnder(".");

  it("finds the routes at all", () => {
    expect(pages.size).toBeGreaterThan(20);
  });

  it.each(Object.values(NOTIFICATIONS).map((t) => [t.event, t.path] as const))(
    "%s points at a real page",
    (_event, path) => {
      expect(pages, path).toContain(path);
    },
  );
});

/**
 * Every PWA guide caches responses in the worker. Doing that here would put
 * somebody's chats and their Drop into a cache that survives signing out, on a
 * phone that can be picked up by a partner or a parent. This is an app people
 * use because who they are is not safe to broadcast.
 */
describe("the service worker stores nothing", () => {
  it("has no fetch handler at all", () => {
    expect(sw).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(sw).not.toMatch(/caches\.(open|match|keys)/);
  });

  it("still does the two things it exists for", () => {
    expect(sw).toMatch(/addEventListener\("push"/);
    expect(sw).toMatch(/addEventListener\("notificationclick"/);
  });

  /**
   * The payload arrives already checked by buildPayload. The worker must add
   * nothing to it — no name, no preview, no count — because a notification is
   * rendered on a lock screen visible to whoever is holding the phone.
   */
  it("renders only the fields it was handed", () => {
    expect(sw).toMatch(/const title = payload\.title/);
    expect(sw).toMatch(/const body = payload\.body/);
    // Nothing assembled, interpolated or counted.
    expect(sw).not.toMatch(/`\$\{/);
  });

  /** A malformed or empty push is silence, not a throw that costs us the endpoint. */
  it("survives a push it cannot read", () => {
    expect(sw).toMatch(/if \(!event\.data\) return;/);
    expect(sw).toMatch(/catch \{[\s\S]{0,200}return;/);
  });

  /** Four unread messages are one line, not four identical ones. */
  it("replaces rather than stacks, keyed on something with no identity", () => {
    expect(sw).toMatch(
      /const tag = typeof payload\.event === "string" \? payload\.event : "plusone"/,
    );
    expect(sw).toMatch(/\btag,/);
  });

  /**
   * showNotification validates its options and THROWS on a combination the
   * browser dislikes — silent with renotify is one, and the set has changed
   * between Chrome versions. A throw inside a push handler is silence, and
   * Chrome answers silence with its own "site updated in the background", so
   * the member gets a worse notification and we get no signal at all.
   */
  it("still shows something if the options are refused", () => {
    expect(sw).toMatch(
      /\.catch\(\(\) =>\s*\n?\s*self\.registration\.showNotification\(title, \{ body, data, tag \}\)/,
    );
  });

  /** Both combinations throw, so they are never sent together. */
  it("never sets silent and renotify at once", () => {
    expect(sw).toMatch(
      /\.\.\.\(payload\.event === "drop_ready" \? \{ renotify: true \} : \{ silent: true \}\)/,
    );
  });

  it("reuses the open window rather than opening a second app", () => {
    expect(sw).toMatch(/includeUncontrolled: true/);
    expect(sw).toMatch(/await client\.focus\(\)/);
  });
});

/**
 * 404 and 410 mean the address will never work again. Anything else is this
 * attempt failing rather than the address being dead, and deleting on those
 * would unsubscribe people because a push service had a bad afternoon.
 */
describe("the transport forgets only what is really gone", () => {
  it("deletes on 404 and 410 and nothing else", () => {
    expect(transport).toMatch(/status === 404 \|\| status === 410/);
    expect(transport).toMatch(/forget_push_device/);
  });

  /** The seam's whole point: this delivers, it does not compose. */
  it("sends the checked payload and adds nothing", () => {
    const body = transport.slice(transport.indexOf("sendNotification("));
    expect(body.slice(0, 600)).toMatch(/title: delivery\.payload\.title/);
    expect(body.slice(0, 600)).toMatch(/body: delivery\.payload\.body/);
    expect(body.slice(0, 600)).not.toMatch(/display_name|preview|count/);
  });

  /** §9.6 — an endpoint is a device identifier and never goes in a log. */
  it("logs a status, never an address", () => {
    const logs = [...transport.matchAll(/console\.(error|warn|info)\([\s\S]{0,300}?\);/g)].map(
      (m) => m[0],
    );
    expect(logs.length).toBeGreaterThan(1);
    for (const line of logs) expect(line).not.toMatch(/endpoint|recipientId|user_id/);
  });

  /**
   * A native token has no p256dh and no auth, and until 2026-08-25 there was
   * nowhere to put one: registerPushDevice hard-coded `p_platform: "web"` and
   * demanded both keys. The RPC has always taken a platform and the table has
   * always allowed those columns null for a non-web row — verified against the
   * live database, which accepts an 'ios' row with both null and still refuses
   * a 'web' row missing them — so only the Server Action could not say it.
   *
   * Shells lane item 2 lands here, and an APNs notifier would otherwise be
   * sending to an empty set.
   */
  it("can register a native device token, not only a web subscription", () => {
    const actions = withoutComments(read("src/app/app/push-actions.ts"));
    // A discriminated union, so the impossible pairs cannot be written: a web
    // subscription missing its keys, or a native token carrying them.
    expect(actions).toMatch(/platform: "web";[\s\S]*?p256dh: string/);
    expect(actions).toMatch(/platform: "ios" \| "android"; token: string/);
    // The native branch sends explicit nulls rather than omitting the keys.
    expect(actions).toMatch(/p_p256dh: address\.platform === "web" \? address\.p256dh : null/);
    expect(actions).toMatch(/p_auth: address\.platform === "web" \? address\.auth : null/);
    // And the platform is the caller's, never a constant.
    expect(actions).toMatch(/p_platform: address\.platform/);
    expect(actions).not.toMatch(/p_platform: "web"/);
  });

  /**
   * Guideline 3.1.1, and 3.1.3(f)'s second half.
   *
   * A subscription unlocked inside an iOS app must go through in-app purchase,
   * and a free companion app may sell nothing AND carry no call to action for
   * buying elsewhere. startCheckout creates a Stripe session, so drawing it in
   * the shell is a rejection rather than a warning — and it contradicts the
   * billing decision made on the 24th, which is store billing on both at 15%.
   *
   * The prices go with the button. "Premium is $X" and no way to buy it is
   * still an invitation to buy it somewhere else, which is the half that is
   * easy to miss.
   */
  it("offers no Stripe purchase inside the native shell", () => {
    const buttons = withoutComments(read("src/app/app/settings/premium/plan-buttons.tsx"));
    expect(buttons).toMatch(/inNativeShell/);

    /**
     * Repinned when StoreKit landed. This used to assert the same early return
     * twice, because the shell rendered NOTHING and both components said so the
     * same way. The shell now sells through Apple, so the two differ: the
     * chooser hands off to `NativePlanChooser`, and the portal still has no
     * native equivalent and still draws nothing.
     *
     * What is being pinned has not changed — no Stripe purchase, and no price
     * beside it, reachable from inside the shell.
     */
    expect(buttons).toMatch(/if \(surface === "native"\)/);
    expect(buttons).toMatch(/<NativePlanChooser/);
    expect(buttons.match(/if \(surface !== "web"\) return null;/g) ?? []).toHaveLength(1);

    // Nothing renders until the environment is known. Starting visible and
    // hiding on hydration draws a Subscribe button in the shell for a frame.
    expect(buttons).toMatch(/useState<Surface>\(null\)/);
    expect(buttons).toMatch(/if \(surface === null\) return null;/);
  });

  /**
   * Two Stripe subscriptions on one customer, both billing, with nothing in the
   * app showing the second.
   *
   * The page hides the chooser from a premium member, and that is presentation.
   * A form rendered before subscribing and submitted after, a second tab, or a
   * direct POST all reach the action anyway — which is the door.
   */
  it("refuses a checkout from somebody who already subscribes", () => {
    const actions = withoutComments(read("src/app/app/settings/premium/actions.ts"));
    // Through the one liveness function, not an expression written out here.
    //
    // This used to pin the inline `status === "active" || ...` and the
    // Date.parse beside it, and that was pinning the wrong thing: the premium
    // page had its OWN copy of the same test which disagreed about a null
    // period end, and an assertion on this file's text could not see it.
    // `stripeIsLive` is the single reading now and subscription-source.test.ts
    // covers what it answers, including the case the two used to differ on.
    expect(actions).toMatch(/stripeIsLive\(existing as StripeRow \| null, Date\.now\(\)\)/);
    expect(actions).toMatch(/premiumAlreadySubscribed/);

    // NOT is_premium(). That is true for a referral grant too, and somebody
    // whose grant expires next week has every reason to subscribe now — gating
    // on it would make them wait for their own reward to lapse first.
    expect(actions).not.toMatch(/is_premium/);
  });

  /** Absent keys are a legal state; a half pair is not. */
  it("includes each transport by its own configuration, not by NODE_ENV", () => {
    expect(notifier).toMatch(/process\.env\.VAPID_PRIVATE_KEY/);
    expect(notifier).toMatch(/live\.push\(webPushNotifier\(\)\)/);
    expect(notifier).not.toMatch(/NODE_ENV/);
  });

  /**
   * Composed, not chosen. Returning one provider assumed a single transport
   * reaches everybody, and push is opt-in — on iOS it is not even offered until
   * the app is on a home screen.
   */
  it("runs every configured transport rather than picking one", () => {
    expect(notifier).toMatch(/composeNotifiers\(live\)/);
    // Gated on the verified sender, not the API key: the key is always present
    // and RESEND_FROM is the thing that actually has to be arranged.
    expect(notifier).toMatch(/process\.env\.RESEND_FROM/);
    expect(notifier).toMatch(/live\.push\(emailNotifier\(\)\)/);
  });

  /**
   * The cohort that used to be dropped on the floor.
   *
   * notify_member has always returned email among the surviving channels, and
   * the fan-out kept only the push list and returned early when it was empty —
   * so somebody with push off and email on was reached by nothing at all while
   * their settings said otherwise.
   */
  it("sends to the email cohort as well as the push one", () => {
    expect(fanout).toMatch(/channels\.includes\("email"\)/);
    expect(fanout).toMatch(/planDeliveries\(event, email, \["email"\]\)/);
  });

  it("only gives up when neither cohort wants anything", () => {
    expect(fanout).toMatch(/push\.length === 0 && email\.length === 0/);
    // The old early return, which is the bug itself.
    expect(fanout).not.toMatch(/if \(push\.length === 0\) return;/);
  });
});

/**
 * A permission dialogue on arrival is the one people dismiss by reflex — and on
 * iOS and Firefox a dismissal is permanent for the origin. There is no second
 * ask.
 */
describe("permission is asked for where somebody went looking for it", () => {
  /**
   * Repinned 2026-08-26. This matched `function enable()[\s\S]{0,400}requestPermission`
   * — a character count standing in for "inside enable()" — and the native
   * branch, which asks iOS, pushed the browser's ask past 400 characters. The
   * count was never the point. Both asks are now looked for by name, in the
   * function they belong to, and neither depends on how long it is.
   *
   * There are two prompts to keep honest now, and only one of them existed when
   * this test was written: a WebView has no PushManager, so the shell asks
   * through the Capacitor plugin instead. iOS shows its alert ONCE for the life
   * of an install, which makes prompting on load worse there than anywhere —
   * a member who dismisses it by reflex can never be asked again from inside
   * the app.
   */
  it("never prompts on load, on either surface", () => {
    const effect = toggle.slice(toggle.indexOf("useEffect("));
    const onMount = effect.slice(0, effect.indexOf("}, [vapidPublicKey])"));
    expect(onMount).not.toMatch(/requestPermission/);
    expect(onMount).not.toMatch(/requestNativePush/);
    // Reading what iOS already decided is not asking, and is what lets the
    // screen show the true state without spending the one prompt.
    expect(onMount).toMatch(/nativePushPermission/);

    const enable = toggle.slice(toggle.indexOf("function enable()"));
    const body = enable.slice(0, enable.indexOf("\n  function "));
    expect(body).toMatch(/requestNativePush/);
    expect(body).toMatch(/Notification\.requestPermission/);
  });

  /**
   * The shell must not report "not available here" once it is. That string was
   * honest while native push did not exist and becomes a lie the moment it
   * does — and it is the sentence a member reads before giving up on
   * notifications entirely.
   */
  it("no longer tells the shell push is unavailable", () => {
    const effect = toggle.slice(toggle.indexOf("useEffect("));
    const onMount = effect.slice(0, effect.indexOf("}, [vapidPublicKey])"));
    const shellBranch = onMount.slice(onMount.indexOf("if (inNativeShell())"));
    expect(shellBranch).toMatch(/setState\("on"\)/);
    expect(shellBranch).toMatch(/setState\("blocked"\)/);
  });

  /** What will appear on a locked phone, before the button that causes it. */
  it("shows the privacy note above the control", () => {
    expect(toggle.indexOf("pushPrivacyNote")).toBeLessThan(toggle.indexOf("pushEnableLabel"));
  });

  /**
   * Safari exposes none of this in a tab and all of it in an installed app, so
   * "your browser cannot do this" is both wrong and discouraging — the member
   * is one gesture away.
   */
  it("tells an iPhone to install rather than calling it unsupported", () => {
    // isAppleMobile() rather than the user-agent test that used to be inline
    // here: a current iPad reports a Macintosh string with no "iPad" in it, so
    // the regex alone answered no on the exact device this branch is for. See
    // native-shell.ts, which keeps the old test and adds maxTouchPoints.
    expect(toggle).toMatch(/isAppleMobile\(\)/);
    expect(toggle).toMatch(/display-mode: standalone/);
    expect(toggle).toMatch(/pushInstallFirst/);
  });

  /** A browser holding a subscription the server never recorded is silent forever. */
  it("rolls the subscription back when the server does not record it", () => {
    expect(toggle).toMatch(/if \(!result\.ok\) \{[\s\S]{0,200}subscription\.unsubscribe\(\)/);
  });

  /** The other order leaves a row pointing at an endpoint the browser discarded. */
  it("deletes the row before unsubscribing", () => {
    const off = toggle.slice(toggle.indexOf("function disable()"));
    expect(off.indexOf("unregisterPushDevice")).toBeLessThan(
      off.indexOf("subscription.unsubscribe"),
    );
  });
});

/**
 * The drop lands at 20:00 in each member's own timezone, and until this route
 * existed nothing said so.
 */
describe("the drop tells people it landed", () => {
  it("is registered, and on a schedule fine enough for a 45-minute offset", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      crons?: { path: string; schedule: string }[];
    };
    const job = (vercel.crons ?? []).find((c) => c.path === "/api/cron/drop-notify");
    expect(job).toBeTruthy();
    // India is +5:30, Nepal +5:45, the Chathams +12:45. Hourly would reach
    // those members up to three quarters of an hour late.
    expect(job!.schedule).toBe("*/15 * * * *");
  });

  /** Vercel Cron sends GET; a route exporting only POST answers 405, silently. */
  it("answers the verb Vercel actually uses", () => {
    expect(cron).toMatch(/export const GET = POST/);
  });

  /**
   * createStubNotifier throws synchronously in production. Built after the
   * claim, each run would consume a whole night of notifications and then throw
   * — which is exactly how the fuse warning managed to never warn anybody.
   */
  it("builds the notifier before it claims anything", () => {
    // Both indices asserted present. This read `indexOf(...) < indexOf(...)`
    // alone, and when the route stopped holding the notifier in a variable the
    // left side became -1 — which is less than everything, so the test went on
    // passing while checking nothing.
    const built = cron.indexOf("notifier();");
    const claimed = cron.indexOf("claim_drop_notifications");
    expect(built).toBeGreaterThan(-1);
    expect(claimed).toBeGreaterThan(-1);
    expect(built).toBeLessThan(claimed);
  });

  /**
   * Through the shared dispatcher now, so the in-app copy is written and the
   * member's own switches are honoured — this built its deliveries by hand and
   * sent them straight out, which meant a member who had turned the drop's push
   * off was buzzed anyway and one who missed the buzz had nothing to return to.
   *
   * notify() still resolves to push alone for this event: NOTIFICATION_DEFAULTS
   * gives drop_ready in-app and push and no email, because a nudge in an inbox
   * sits beside work mail on a screen anyone can glance at.
   */
  it("goes through the dispatcher rather than sending on its own", () => {
    expect(cron).toMatch(/notifyMember\("drop_ready", recipients\)/);
    expect(cron).not.toMatch(/planDeliveries\(/);
  });

  /** §9.6 — counts, never ids. */
  it("returns numbers and nothing else", () => {
    expect(cron).toMatch(/claimed: recipients\.length/);
    const body = cron.slice(cron.indexOf("return NextResponse.json({ claimed"));
    expect(body).not.toMatch(/recipients\.join|recipients\[0\]|user_id/);
  });
});

/**
 * The claim is what makes an every-fifteen-minutes sweep safe. The fuse warning
 * queried without writing back and sent the same warning twenty-four times.
 */
describe("each night is handed out once", () => {
  it("selects and stamps in one statement", () => {
    expect(sql).toMatch(/update public\.profiles p\s*\n\s*set drop_notified_night = due\.night/);
    expect(sql).toMatch(/returning p\.id/);
  });

  /**
   * The hour alone would re-notify every run until midnight; the night alone
   * would notify a brand-new member at ten in the morning, because their marker
   * is null and their current night is yesterday's.
   */
  it("needs both the hour and the night", () => {
    expect(sql).toMatch(/c\.local_hour >= p_hour/);
    expect(sql).toMatch(/is distinct from c\.night/);
  });

  /** The same boundary dropNightDate uses, or the push names a different drop. */
  it("computes the night the way the app does", () => {
    expect(sql).toMatch(/< p_hour\s*\n?\s*then \(public\.local_now\(p\.timezone\)\)::date - 1/);
  });

  /** profiles.timezone is filled from a browser; one bad value must not abort a sweep. */
  it("survives a timezone Postgres does not recognise", () => {
    expect(sql).toMatch(
      /exception\s*\n\s*when others then\s*\n\s*return now\(\) at time zone 'UTC'/,
    );
  });

  /**
   * §3.3 bans engagement bait. A nightly push at somebody who chose the
   * support-only shield, whose only call to action is "switch to dating", is a
   * nightly nudge to give up the shield.
   */
  it("leaves support-only members alone", () => {
    expect(sql).toMatch(/p\.mode = 'dating'/);
  });

  /** The marker must mean "was told", not "would have been told". */
  it("claims nobody it cannot reach", () => {
    expect(sql).toMatch(
      /exists \(select 1 from public\.push_subscriptions s where s\.user_id = p\.id\)/,
    );
  });

  /** A member who could write this could silence their own notification. */
  it("is service role only, and the column is not member-writable", () => {
    expect(sql).toMatch(
      /revoke all on function public\.claim_drop_notifications\(integer\) from public, anon, authenticated/,
    );
    const grants = read("../../supabase/migrations/20260815000800_columns_are_the_wall.sql");
    expect(grants).not.toMatch(/drop_notified_night/);
  });
});

describe("the app can be installed", () => {
  it("has a manifest and the icons it names", () => {
    expect(existsSync(join(WEB, "src/app/manifest.ts"))).toBe(true);
    const manifest = read("src/app/manifest.ts");
    for (const icon of [...manifest.matchAll(/src: "(\/icons\/[^"]+)"/g)].map((m) => m[1]!)) {
      expect(existsSync(join(WEB, "public", icon)), icon).toBe(true);
    }
  });

  /** Android crops to the launcher's shape and slices a non-maskable mark. */
  it("ships a maskable variant", () => {
    expect(read("src/app/manifest.ts")).toMatch(/purpose: "maskable"/);
  });

  /**
   * A home screen label is drawn in the launcher's font, and U+207A is missing
   * from some. BRAND anticipates this with deviceNameFallback.
   */
  it("uses a label every launcher can draw", () => {
    expect(read("src/app/manifest.ts")).toMatch(/short_name: BRAND\.deviceNameFallback/);
  });
});

/**
 * A push accepted by the push service and never seen has two possible causes,
 * and they need completely different fixes: the worker refused to draw it, or
 * the phone's own settings swallowed it. Without a way to tell them apart,
 * diagnosing it is guesswork — which is how the first one was spent.
 */
describe("a member can tell which half of the chain is broken", () => {
  it("draws one locally, with no server and no push service", () => {
    expect(toggle).toMatch(/function test\(\)/);
    // The app name, exactly as a real one arrives — a test wearing a different
    // title than the thing it tests answers a different question.
    expect(toggle).toMatch(/registration\.showNotification\(PUSH_APP_NAME/);
    const fn = toggle.slice(toggle.indexOf("function test()"));
    const body = fn.slice(0, fn.indexOf("function disable()"));
    expect(body).not.toMatch(/registerPushDevice|fetch\(|webpush/);
  });

  /**
   * The Notification constructor is unavailable in an installed app on Android,
   * which is exactly where this question gets asked.
   */
  it("goes through the registration rather than the constructor", () => {
    expect(toggle).not.toMatch(/new Notification\(/);
  });

  /** The browser's own message is more use than ours when it refuses. */
  it("shows what the browser said when it refuses", () => {
    expect(toggle).toMatch(/cause instanceof Error \? cause\.message : C\.pushFailed/);
  });

  /** Only offered once notifications are on — there is nothing to test before. */
  it("is offered only when this device is subscribed", () => {
    const on = toggle.slice(toggle.indexOf('state === "on"'));
    expect(on.slice(0, 1200)).toMatch(/pushTestLabel/);
  });
});

/**
 * Chrome's own install path is a menu item three taps deep whose label changes
 * with whether the criteria are met — "Install app" when they are, "Add to Home
 * screen" when they are not — and the second makes a badged bookmark that looks
 * installed and is not.
 *
 * That difference is not cosmetic here. A notification from a browser carries
 * the site's address: Chrome prints "www.loveplusone.app" under every one and
 * there is no API to suppress it. §8 keeps a person, a subject and every
 * condition word off a lock screen, and then the domain says "dating app" to
 * anybody glancing at the phone. An installed app notifies as itself.
 */
describe("installing is offered by the app, not hunted for in a menu", () => {
  const install = withoutComments(read("src/app/app/settings/install-app.tsx"));
  const manifest = read("src/app/manifest.ts");
  const settings = read("src/app/app/settings/page.tsx");

  /**
   * beforeinstallprompt fires only when every criterion is met, which makes the
   * button its own proof: if it is there, installing works.
   */
  it("shows the button only when the browser says it would work", () => {
    expect(install).toMatch(/addEventListener\("beforeinstallprompt", onPrompt\)/);
    expect(install).toMatch(/state === "ready" && prompt/);
  });

  /** Otherwise Chrome shows its own bar, at a moment we did not choose. */
  it("takes the prompt over from the browser", () => {
    expect(install).toMatch(/event\.preventDefault\(\)/);
  });

  /**
   * The event is dispatched on load and this mounts after hydration, so on a
   * fast connection the listener can be attached too late — and the button
   * would never appear on a device that could install perfectly well.
   */
  it("does not leave the section blank when the event fired first", () => {
    expect(install).toMatch(/current === "unknown" \? "unavailable" : current/);
    expect(install).toMatch(/installUnavailable/);
  });

  /** iOS has no such event; Safari offers it from its share menu and nowhere else. */
  it("describes the gesture where there is no API for it", () => {
    // As above — the detection moved into isAppleMobile() because a current
    // iPad does not admit to being one.
    expect(install).toMatch(/isAppleMobile\(\)/);
    expect(install).toMatch(/installIos/);
  });

  /** Nothing to offer somebody already running the installed app. */
  it("disappears once installed", () => {
    expect(install).toMatch(/display-mode: standalone/);
    expect(install).toMatch(/if \(state === "installed"\) return null;/);
  });

  /**
   * Without `id`, Chrome identifies an installed app by its start_url — so
   * moving where the app opens would look like a different app to a member who
   * already has it.
   */
  it("pins the app's identity separately from where it opens", () => {
    expect(manifest).toMatch(/id: "\/app"/);
  });

  /**
   * Installing stays in General; the push switch has moved to the Notifications
   * tab, beside the forty-two per-event switches whose push column it decides
   * the meaning of.
   *
   * They used to be adjacent because installing changes what a notification
   * shows. The fact that argument rested on — that a lock screen shows the web
   * address either way — is in pushPrivacyNote as well, which is on the screen
   * where somebody actually grants the permission.
   */
  it("keeps installing in General and the push switch with the notifications", () => {
    expect(settings).toMatch(/<InstallApp \/>/);
    expect(settings).not.toMatch(/<PushToggle/);

    const notifications = read("src/app/app/settings/notifications/page.tsx");
    expect(notifications).toMatch(/<PushToggle/);
    // The device switch first: it is the one that decides whether the push
    // column below it means anything at all.
    expect(notifications.indexOf("<PushToggle")).toBeLessThan(
      notifications.indexOf("<NotificationSwitches"),
    );
  });
});

/**
 * Two rendering bugs that only a real phone could have shown, and one claim
 * that a real phone disproved.
 */
describe("what the phone actually draws", () => {
  const icons = readFileSync(join(WEB, "../../scripts/generate-icons.mjs"), "utf8");

  /**
   * Android draws the status-bar badge from the ALPHA CHANNEL alone — every
   * opaque pixel becomes solid white and every transparent one disappears. The
   * badge shipped with an opaque background, so the status bar showed a solid
   * white square until the shade was pulled down and the full-colour icon
   * appeared underneath.
   */
  it("builds the badge from transparency, not colour", () => {
    expect(icons).toMatch(/function badgeSvg/);
    // No background rect, which is the whole bug.
    const badge = icons.slice(icons.indexOf("function badgeSvg"));
    expect(badge.slice(0, badge.indexOf("function svg("))).not.toMatch(/<rect width="\$\{size\}"/);
    // And the generator refuses to ship an opaque one again.
    expect(icons).toMatch(/if \(isOpaque\)/);
  });

  /**
   * Android draws a large icon on the right and will not leave it empty: with
   * no `icon` it synthesises a monogram from the notification's source, which
   * here is the origin — a grey circle with a "W" in it, for "www". The app's
   * mark repeated is the better of the two outcomes, and there is no third.
   * Determined on a real phone, in both directions.
   */
  it("sends the icon, because the platform invents a worse one otherwise", () => {
    expect(sw).toMatch(/icon: "\/icons\/icon-192\.png"/);
    expect(sw).toMatch(/badge: "\/icons\/badge-96\.png"/);
    // And the test control draws exactly what a real one draws.
    const toggleRaw = read("src/app/app/settings/push-toggle.tsx");
    expect(toggleRaw).toMatch(/icon: "\/icons\/icon-192\.png"/);
  });

  /**
   * Claude claimed an installed app's notifications carry no web address. They
   * do — every web notification shows its origin, installed or not, and the
   * Notification API has no property that suppresses it. It is a deliberate
   * browser security feature. The copy said otherwise and was corrected.
   */
  it("does not promise the web address goes away", () => {
    const copy = read("../../packages/config/src/draft-copy.ts");
    const install = copy.slice(copy.indexOf("installBody:"));
    expect(install.slice(0, 400)).toMatch(/no app can hide that/i);
    const push = copy.slice(copy.indexOf("pushPrivacyNote:"));
    expect(push.slice(0, 400)).toMatch(/no app can turn off/i);
  });
});

/**
 * What an installed app needs that a browser tab does not.
 *
 * Every one of these failed in a way nothing could report: an icon iOS
 * substitutes silently, a subscription the browser rotates without telling
 * anybody, a nav bar under a gesture bar that only exists once the app is
 * installed on a phone with a home indicator. None of them is visible on a
 * desktop, in a tab, or in a test that only renders the page.
 */
describe("the installed app", () => {
  const root = read("src/app/layout.tsx");

  /**
   * generate-icons.mjs has drawn apple-touch-icon.png since the icons existed
   * and nothing pointed at it. iOS looks for a rel="apple-touch-icon" link or
   * the file at the ORIGIN ROOT, and it is under /icons/ — so neither. With no
   * icon, iOS puts a SCREENSHOT OF THE PAGE on the home screen.
   */
  it("gives an iPhone an icon rather than a screenshot of the sign-in form", () => {
    expect(root).toMatch(/apple:\s*\[\{\s*url:\s*"\/icons\/apple-touch-icon\.png"/);
    expect(existsSync(join(WEB, "public/icons/apple-touch-icon.png"))).toBe(true);
  });

  /**
   * The manifest is what iOS 16.4 and later read. These are what everything
   * before it reads, and an iPhone that has not been updated is exactly the one
   * still on a version that needs them.
   */
  it("carries the older iOS switches too", () => {
    expect(root).toMatch(/appleWebApp: \{[\s\S]{0,200}capable: true/);
    // Not black-translucent: that puts the page under the clock, which hides a
    // heading behind the status bar on every phone with a notch.
    expect(root).toMatch(/statusBarStyle: "default"/);
  });

  /**
   * env(safe-area-inset-*) reports nought on every iPhone without this, so the
   * fixed nav sat under the gesture bar — over the five links the app is
   * navigated by. Invisible in a browser tab, where Safari's own chrome is in
   * the way.
   */
  it("reaches the true edge of the screen, and then says so", () => {
    expect(root).toMatch(/viewportFit: "cover"/);
    const app = read("src/app/app/layout.tsx");
    expect(app).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
    // The two things that sit on the bottom edge with the nav.
    expect(read("src/app/modal.tsx")).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(read("src/app/route-modal.tsx")).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  /**
   * A push subscription is not permanent. Unhandled, a rotation makes the
   * device permanently silent while the settings screen still says "On for this
   * device" — a failure the member has been told cannot happen.
   */
  it("survives the browser rotating the subscription", () => {
    expect(sw).toMatch(/addEventListener\("pushsubscriptionchange"/);
    // The key comes off the old subscription: a worker cannot read the app's
    // environment.
    expect(sw).toMatch(/event\.oldSubscription\?\.options\?\.applicationServerKey/);

    // And the server is told on the next app load, not from the worker — that
    // event can fire with no page open and no fresh session.
    const registrar = read("src/app/app/service-worker.tsx");
    expect(registrar).toMatch(/pushManager\.getSubscription\(\)/);
    expect(registrar).toMatch(/registerPushDevice\(\{/);
    // The web path names its platform now rather than relying on a default —
    // see the union in push-actions.ts.
    expect(registrar).toMatch(/platform: "web"/);
  });

  /** §8 rules out count granularity below five, and an icon sits on a home
      screen indefinitely in front of whoever picks the phone up. */
  it("marks the app icon without saying how many", () => {
    const badge = read("src/app/app/app-badge.tsx");
    expect(badge).toMatch(/setAppBadge\?\.\(\)/);
    expect(badge).not.toMatch(/setAppBadge\?\.\(unread\)/);
    expect(badge).toMatch(/clearAppBadge/);
  });
});
