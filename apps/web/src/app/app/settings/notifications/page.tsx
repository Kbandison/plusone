import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY, NOTIFICATION_EVENT_LABELS } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { PushToggle } from "../push-toggle";
import { ActivityAlert } from "./activity-alert";
import { NotificationSwitches } from "./switches";

const C = DRAFT_COPY.app;

export const metadata: Metadata = { title: C.settingsNotifications };

/**
 * Every notification, and a way to turn it off.
 *
 * Its own tab rather than a card in General, because it is the one settings
 * screen with more than a handful of controls on it — forty-two switches under
 * a checkbox about other communities would be a section that swallowed the
 * page.
 *
 * The device switch comes with it. Turning `message_received` on for push and
 * then finding nothing arrives, because this browser was never subscribed, is
 * the failure this screen is most likely to produce; the two controls belong
 * on one screen so the answer is in view. What stays behind in General is the
 * install card — it is about the app shell rather than about notifications,
 * and the one fact it carried that this screen needs, that a lock screen shows
 * the web address either way, is in pushPrivacyNote too.
 */
export default async function NotificationSettingsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Only the OFF switches exist. A member who has never touched this screen
  // has no rows, which is exactly what makes a change to NOTIFICATION_DEFAULTS
  // reach everybody who never expressed a preference.
  const { data } = await supabase.from("notification_mutes").select("event, channel");

  /**
   * The premium activity alert's own row (server 18c).
   *
   * `error` is treated as "not available" rather than thrown, and the reason is
   * specific rather than defensive: 20260829001000 is written and NOT applied,
   * so against production today this table does not exist. A settings page that
   * threw would take the other forty-two switches down with it over a feature
   * nobody can use yet. The component says so on screen instead of rendering a
   * control that accepts a change and drops it.
   */
  const [{ data: isPremium }, { data: alertRow, error: alertError }] = await Promise.all([
    supabase.rpc("i_am_premium"),
    supabase.from("activity_alerts").select("radius_mi, enabled").maybeSingle(),
  ]);
  const alert = alertRow
    ? {
        radiusMi: (alertRow as { radius_mi: number }).radius_mi,
        enabled: (alertRow as { enabled: boolean }).enabled,
      }
    : null;
  const muted = ((data ?? []) as { event: string; channel: string }[]).map(
    (row) => `${row.event}:${row.channel}`,
  );

  return (
    <main id="main">
      <h1 className="text-h2">{C.settingsNotifications}</h1>

      {/* The device switch first. It is the one that decides whether the push
          column below means anything at all. */}
      <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />

      {/* Above the switches, because its own note points down at them: the
          alert decides whether there is anything to deliver, and the push
          column decides where. */}
      <ActivityAlert premium={Boolean(isPremium)} alert={alert} available={!alertError} />

      <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
        <h2 className="text-[0.972rem]">{C.notificationSettingsHeading}</h2>
        <p className="mt-3 max-w-[56ch] text-[12.2px] leading-[1.65] text-ink-2">
          {C.notificationSettingsBody}
        </p>

        <NotificationSwitches muted={muted} />

        {/* Shown rather than hidden.
         *
         * verification_decided is not in MUTABLE_EVENTS and
         * set_notification_mute refuses it — a member waiting on a human to
         * look at their account has nothing to do but check, and a switch for
         * it is a switch for stranding themselves. Leaving it off the list
         * entirely would make that look like an oversight; saying so makes it
         * a decision. */}
        <p className="mt-6 max-w-[56ch] border-t border-line-2 pt-5 text-[11.3px] leading-[1.6] text-ink-3">
          <span className="text-ink-2">{NOTIFICATION_EVENT_LABELS.verification_decided}</span>{" "}
          {C.notificationSettingsAlwaysOn}
        </p>
      </section>
    </main>
  );
}
