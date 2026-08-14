import { NextResponse } from "next/server";

import { isAuthorisedCron, serviceClient } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const { data, error } = await serviceClient().rpc("sweep_expired_fuses");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ swept: data ?? 0 });
}
