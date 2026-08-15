import { NextResponse } from "next/server";

import { REFERRALS } from "@plusone/config";
import { referrals } from "@plusone/logic";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

interface Conversion {
  conversion_id: string;
  referrer_id: string;
  invitee_id: string;
  referrer_conversion_count: number;
}

const TIER_ENUM: Record<number, string> = { 3: "tier1_3", 5: "tier2_5", 10: "tier3_10" };

/**
 * Pays out conversions (§6.5).
 *
 * The rules live in `packages/logic/referrals` — who gets what, when it stops,
 * and which tier needs a human. This job replays that reducer against each
 * conversion in order and writes what it says. Restating the tiers here would
 * be a second implementation of who gets paid, and the two would drift on the
 * first change.
 *
 * Idempotent by construction: `premium_grants.source` carries the conversion
 * id, and `unrewarded_conversions()` only returns rows with no such grant. The
 * job can run twice, or crash halfway, without paying anyone twice.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("unrewarded_conversions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pending = (data ?? []) as Conversion[];
  let granted = 0;
  let held = 0;

  for (const conversion of pending) {
    // Replay the reducer at this conversion's position in the referrer's run,
    // so a job that catches up on several at once pays each one what it was
    // worth at the time rather than what the latest one is worth.
    const count = Number(conversion.referrer_conversion_count);
    const before: referrals.ReferralState = {
      conversions: count - 1,
      tiersAwarded: REFERRALS_TIERS.filter((t) => t < count),
    };
    const outcome = referrals.recordConversion(before);

    for (const reward of outcome.inviteeRewards) {
      if (reward.kind !== "premium_days") continue;
      await supabase.rpc("grant_referral_premium", {
        p_conversion_id: conversion.conversion_id,
        p_user_id: conversion.invitee_id,
        p_days: reward.days,
      });
      granted += 1;
    }

    for (const reward of outcome.referrerRewards) {
      if (reward.kind === "badge") {
        await supabase.rpc("record_referral_tier", {
          p_user_id: conversion.referrer_id,
          p_tier: TIER_ENUM[reward.tier],
          p_status: "auto_granted",
        });
        continue;
      }

      if (reward.status === "pending_approval") {
        // Decision #25 — six months is worth a human look. Recorded as pending
        // and NOT granted; the admin queue decides.
        await supabase.rpc("record_referral_tier", {
          p_user_id: conversion.referrer_id,
          p_tier: TIER_ENUM[reward.tier ?? 10],
          p_status: "pending_approval",
        });
        held += 1;
        continue;
      }

      await supabase.rpc("grant_referral_premium", {
        p_conversion_id: conversion.conversion_id,
        p_user_id: conversion.referrer_id,
        p_days: reward.days,
      });
      granted += 1;

      if (reward.reason === "tier" && reward.tier) {
        await supabase.rpc("record_referral_tier", {
          p_user_id: conversion.referrer_id,
          p_tier: TIER_ENUM[reward.tier],
          p_status: "auto_granted",
        });
      }
    }
  }

  return NextResponse.json({ conversions: pending.length, granted, held });
}

const REFERRALS_TIERS = Object.values(REFERRALS.tiers).map((t) => t.conversions);

/**
 * Vercel Cron invokes with GET, not POST.
 *
 * Registering a schedule in vercel.json and exporting only POST produces a 405
 * on every fire — a job that is scheduled, monitored, and has never once run.
 * For the purge that means deletion requests recorded and never executed, which
 * is the §9.3 promise failing silently in the direction that keeps data.
 *
 * The Bearer check in isAuthorisedCron is what actually guards this, and it is
 * the same on both verbs, so exporting GET costs nothing.
 */
export const GET = POST;
