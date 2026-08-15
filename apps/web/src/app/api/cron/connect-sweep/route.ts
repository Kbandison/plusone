import { NextResponse } from "next/server";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const { data, error } = await serviceClient().rpc("sweep_expired_connects");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ swept: data ?? 0 });
}

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
