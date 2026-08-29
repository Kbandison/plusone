"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { DRAFT_COPY, RADIUS } from "@plusone/config";

import { saveActivityAlert } from "./activity-alert-actions";
import { alertRadiusOptions } from "./alert-radius-options";

const C = DRAFT_COPY.app;

export interface ActivityAlertState {
  readonly radiusMi: number;
  readonly enabled: boolean;
}

/**
 * "Who's active near you" — the one thing on PREMIUM_INCLUDES that a member
 * builds for themselves (server 18c).
 *
 * Shown to everybody rather than hidden from free members. It is sold on two
 * public pages, and a promised feature that is invisible until you pay is
 * indistinguishable from one that does not exist — which is what this line was
 * for two weeks. Free members see exactly what it does and what it would cost;
 * they just cannot switch it on.
 *
 * The floor is on screen, not only in the SQL. "You will be told when at least
 * five people are about" explains the silence a member would otherwise read as
 * a broken alert in a thin local pool, and it is the honest version of §8's
 * rule rather than a rule kept from the person it protects.
 */
export function ActivityAlert({
  premium,
  alert,
  available,
}: {
  premium: boolean;
  alert: ActivityAlertState | null;
  available: boolean;
}) {
  const [radiusMi, setRadiusMi] = useState(alert?.radiusMi ?? RADIUS.defaultMi);
  const [enabled, setEnabled] = useState(alert?.enabled ?? false);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, start] = useTransition();

  function save() {
    setStatus("idle");
    start(async () => {
      const result = await saveActivityAlert(radiusMi, enabled);
      setStatus(result.ok ? "saved" : "failed");
    });
  }

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[0.972rem]">{C.activityAlertHeading}</h2>
      <p className="mt-3 max-w-[56ch] text-[12.2px] leading-[1.65] text-ink-2">
        {C.activityAlertBody}
      </p>
      <p className="mt-2 max-w-[56ch] text-[11.7px] leading-[1.6] text-ink-3">
        {C.activityAlertFloor}
      </p>

      {!premium ? (
        <p className="mt-5 text-[12.2px] text-ink-2">
          {C.activityAlertPremiumOnly}{" "}
          <Link
            href="/app/settings/premium"
            className="underline decoration-line-2 underline-offset-4"
          >
            {C.activityAlertPremiumLink}
          </Link>
        </p>
      ) : !available ? (
        /* The table is not reachable — an unapplied migration looks exactly
           like this. Saying so beats a control that accepts a change and
           silently drops it. */
        <p role="status" className="mt-5 text-[12.2px] text-critical">
          {C.activityAlertUnavailable}
        </p>
      ) : (
        <div className="mt-5">
          <label className="flex items-center gap-2.5 text-[12.8px]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setStatus("idle");
              }}
            />
            {C.activityAlertEnabledLabel}
          </label>

          <label className="mt-4 flex items-center gap-2.5 text-[12.8px]">
            {C.activityAlertRadiusLabel}
            <select
              value={radiusMi}
              onChange={(e) => {
                setRadiusMi(Number(e.target.value));
                setStatus("idle");
              }}
              /* 16px, not the 12.5px the labels around it use. Anything
                 smaller makes iOS zoom the page on focus and never zoom back
                 out — pinned by design-system.test.ts, which caught this. */
              className="rounded-lg border border-line-2 bg-bg px-2.5 py-1.5 text-[16px]"
            >
              {alertRadiusOptions(radiusMi).map((mi) => (
                <option key={mi} value={mi}>
                  {C.activityAlertRadiusOption(mi)}
                </option>
              ))}
            </select>
          </label>

          <p className="mt-4 max-w-[56ch] text-[11.7px] leading-[1.6] text-ink-3">
            {C.activityAlertChannelNote}
          </p>

          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="ease-brand mt-5 rounded-lg border border-line-2 px-4 py-2 text-[12.5px] transition-colors duration-200 hover:border-accent disabled:opacity-60"
          >
            {C.activityAlertSave}
          </button>

          {status !== "idle" ? (
            <p
              role="status"
              className={`mt-3 text-[11.7px] ${status === "failed" ? "text-critical" : "text-ink-3"}`}
            >
              {status === "failed" ? C.activityAlertSaveFailed : C.activityAlertSaved}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
