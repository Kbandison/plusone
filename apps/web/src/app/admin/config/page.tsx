import type { Metadata } from "next";

import { getServerSupabase } from "@/lib/supabase";
import { ConfigRow } from "./config-row";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

export const metadata: Metadata = { title: "Config" };

/**
 * The config editor (§7.3).
 *
 * Every value here is hot-read: the SQL functions take budgets and cooldowns
 * through config_int(), and the Drop reads its weights through
 * tunable_config(). A number changed on this page changes tonight's Drop.
 *
 * Not everything is tunable, on purpose. There is no key for the Drop count per
 * member, no key for a fuse extension, and no key that exempts anyone from a
 * wall — §3.3's list is absent from this screen because it is absent from the
 * table.
 */
export default async function ConfigPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("app_config")
    .select("key, value, updated_at")
    .order("key", { ascending: true });

  const rows = data ?? [];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = String(row.key).split(".")[0] ?? "other";
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Config</h1>
      <p className="mt-4 max-w-[54ch] text-[13px] leading-[1.7] text-ink-2">
        Read live by the mechanics. Every change is audited with its previous value, and unknown
        keys are refused — there is no setting here that buys anyone an exemption.
      </p>

      {[...groups.entries()].map(([group, items]) => (
        <section key={group} className="mt-10">
          <h2 className="text-[0.891rem] tracking-[0.04em] text-ink-3 uppercase">{group}</h2>
          <ul className="mt-3">
            {items.map((row) => (
              <ConfigRow
                key={row.key as string}
                configKey={row.key as string}
                value={String(row.value)}
              />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
