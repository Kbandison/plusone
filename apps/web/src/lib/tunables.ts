import "server-only";

import { DROP, RADIUS } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

import { configNumber } from "./config-coerce";
import { getServerSupabase } from "./supabase";

/**
 * Reads the tunables §7.3 promises are hot-read.
 *
 * They were not. The SQL functions read `app_config` through `config_int()`,
 * and the TypeScript used its compiled-in defaults — so an administrator
 * changing the Drop weights changed nothing, and nothing said so.
 *
 * Every value falls back to the compiled default. A missing or malformed row
 * must never take the Drop out with it: config that can break the product when
 * it is wrong is not config, it is a deployment.
 */

type ConfigRow = Record<string, unknown>;

const num = configNumber;

export async function dropConfig(): Promise<dropLogic.DropConfig> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("tunable_config");
  const config = (data ?? {}) as ConfigRow;

  const weights = {
    intentionCompat: num(config, "drop.weights.intention", DROP.weights.intentionCompat),
    quizCompat: num(config, "drop.weights.quiz", DROP.weights.quizCompat),
    recencyActive: num(config, "drop.weights.recency", DROP.weights.recencyActive),
    underexposure: num(config, "drop.weights.underexposure", DROP.weights.underexposure),
  };

  return {
    // Decision #11 — the count is the same for everyone. It is tunable
    // globally and there is nowhere to make it per-member.
    count: num(config, "drop.count", DROP.count),
    activeWithinDays: num(config, "drop.active_within_days", DROP.activeWithinDays),
    suppressRecentlyServedDays: num(
      config,
      "drop.suppress_recently_served_days",
      DROP.suppressRecentlyServedDays,
    ),
    minPool: num(config, "radius.min_pool", RADIUS.minPool),
    ladderMi: RADIUS.ladderMi,
    weights,
  };
}
