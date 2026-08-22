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

  /** Absent keys are a legal state; a half pair is not. */
  it("is chosen by whether VAPID is configured, not by NODE_ENV", () => {
    expect(notifier).toMatch(/process\.env\.VAPID_PRIVATE_KEY/);
    expect(notifier).toMatch(/return webPushNotifier\(\)/);
  });
});

/**
 * A permission dialogue on arrival is the one people dismiss by reflex — and on
 * iOS and Firefox a dismissal is permanent for the origin. There is no second
 * ask.
 */
describe("permission is asked for where somebody went looking for it", () => {
  it("never prompts on load", () => {
    const effect = toggle.slice(toggle.indexOf("useEffect("));
    expect(effect.slice(0, effect.indexOf("}, [vapidPublicKey])"))).not.toMatch(
      /requestPermission/,
    );
    expect(toggle).toMatch(/function enable\(\)[\s\S]{0,400}requestPermission/);
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
    expect(toggle).toMatch(/iPad\|iPhone\|iPod/);
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
    expect(cron.indexOf("send = notifier()")).toBeLessThan(
      cron.indexOf("claim_drop_notifications"),
    );
  });

  /** Push only: a nudge in an inbox sits beside work mail on a shared screen. */
  it("sends on one channel", () => {
    expect(cron).toMatch(/planDeliveries\("drop_ready", recipients, \["push"\]\)/);
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
