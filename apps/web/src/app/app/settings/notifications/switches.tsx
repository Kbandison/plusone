"use client";

import { useEffect, useState, useTransition } from "react";

import {
  DRAFT_COPY,
  MUTABLE_EVENTS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_EVENT_LABELS,
} from "@plusone/config";
import type { NotificationChannel, NotificationEvent } from "@plusone/config";

import { setNotificationMute } from "./actions";

const C = DRAFT_COPY.app;

/** "drop_ready:push" — one key per box, which is what the state is keyed on. */
const key = (event: string, channel: string) => `${event}:${channel}`;

/**
 * Every switch, in one grid.
 *
 * Fourteen events across three channels is forty-two controls, and the only
 * layout that makes that scannable is a table: the member is looking for one
 * row, or for one column they want to silence everywhere. A card per event
 * would be fourteen cards.
 *
 * The state is what is MUTED, not what is on. That is the shape the database
 * stores — absence means the configured default — and converting to "on" here
 * would mean deciding, in the browser, what the default was. A member who has
 * never touched this screen has no rows at all, which is what lets a default
 * change later reach everyone who never expressed a preference.
 */
export function NotificationSwitches({ muted }: { muted: readonly string[] }) {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set(muted));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  // The server is the source of truth after a revalidate: a change made in
  // another tab, or a save that failed and was rolled back, arrives as a new
  // prop and must win over the optimistic set.
  // Adjusted during render rather than after it, which is React's shape for
  // this and one render pass cheaper. The effect version painted the stale set
  // first and corrected it on a second pass, so a rolled-back save showed the
  // switch in the position it had just failed to reach.
  const [seen, setSeen] = useState(muted);
  if (muted !== seen) {
    setSeen(muted);
    setOff(new Set(muted));
  }

  function toggle(event: NotificationEvent, channel: NotificationChannel, wantOn: boolean) {
    const id = key(event, channel);
    const before = off;
    // Moved first, then saved. A checkbox that waits for a round trip before
    // moving reads as broken, and a member setting up six of these in a row
    // would be waiting six times.
    const next = new Set(off);
    if (wantOn) next.delete(id);
    else next.add(id);
    setOff(next);
    setError(null);

    start(async () => {
      const result = await setNotificationMute(event, channel, !wantOn);
      if (!result.ok) {
        setOff(before);
        setError(C.notificationSettingsSaveFailed);
      }
    });
  }

  return (
    <>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {/* Empty, and it has to be a th with a scope for the row headers
                  below to have something to hang from. sr-only text rather
                  than nothing, so a screen reader reading the header row does
                  not announce a blank. */}
              <th scope="col" className="pb-3">
                <span className="sr-only">{C.notificationSettingsHeading}</span>
              </th>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <th
                  key={channel}
                  scope="col"
                  className="w-[62px] pb-3 text-center text-[11.3px] font-normal text-ink-3"
                >
                  {NOTIFICATION_CHANNEL_LABELS[channel]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MUTABLE_EVENTS.map((event) => (
              <tr key={event} className="border-t border-line-2">
                <th
                  scope="row"
                  className="py-3 pr-3 text-[12.2px] leading-[1.5] font-normal text-ink"
                >
                  {NOTIFICATION_EVENT_LABELS[event]}
                </th>
                {NOTIFICATION_CHANNELS.map((channel) => {
                  /**
                   * A channel this event does not use at all.
                   *
                   * `like_received` has no push in NOTIFICATION_DEFAULTS and
                   * almost nothing has email. An unticked box there would read
                   * as "off, turn it on" and turning it on would do nothing —
                   * the default list is what the dispatcher sends, and a mute
                   * row for a channel that was never in it is inert. So the
                   * cell is a dash: this one does not arrive that way.
                   */
                  const offered = (NOTIFICATION_DEFAULTS[event] as readonly string[]).includes(
                    channel,
                  );
                  if (!offered) {
                    return (
                      <td key={channel} className="py-3 text-center text-ink-3">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">
                          {NOTIFICATION_EVENT_LABELS[event]} —{" "}
                          {NOTIFICATION_CHANNEL_LABELS[channel]}: not used
                        </span>
                      </td>
                    );
                  }

                  const on = !off.has(key(event, channel));
                  return (
                    <td key={channel} className="py-3 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(event, channel, e.currentTarget.checked)}
                        /* The row header and the column header do not reach a
                           checkbox on their own in every screen reader, and
                           "checkbox, checked" forty-two times is not a
                           setting. */
                        aria-label={`${NOTIFICATION_EVENT_LABELS[event]} — ${NOTIFICATION_CHANNEL_LABELS[channel]}`}
                        className="size-[15px] accent-accent"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[11.3px] text-critical">
          {error}
        </p>
      ) : null}

      <PushNotice />
    </>
  );
}

/**
 * "Push is off for this device."
 *
 * A push column ticked on an account with no subscription does exactly
 * nothing, silently — and the member has no way to tell that apart from a
 * broken feature. The browser is the source of truth for whether THIS device
 * is subscribed, which is why push_subscriptions grants members no select: the
 * answer is already here.
 */
function PushNotice() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- asks the browser what it supports, which has no answer during a server render
      setSubscribed(false);
      return;
    }
    let cancelled = false;
    void navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setSubscribed(Boolean(existing));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // null while it is being worked out: a note that appears and then vanishes
  // is worse than one that arrives a beat late.
  if (subscribed !== false) return null;

  return (
    <p className="mt-5 max-w-[52ch] text-[11.3px] leading-[1.6] text-ink-3">
      {C.notificationSettingsPushOff}
    </p>
  );
}
