#!/usr/bin/env node
/**
 * Behavioural checks for photo privacy (Decision #19, §5.3).
 *
 * Blurred-until-connected is not a CSS filter and not a client decision: the
 * view swaps in a different OBJECT, so what a viewer receives is a blurred
 * image rather than the real one waiting to be un-styled.
 *
 * This existed and did not work. `visible_profile_photos` was security_invoker
 * over an own-rows-only `profile_photos` policy, so it returned nothing but
 * your own photos — the mechanic was decorative until the view became the
 * authority. Nothing leaked, because it failed closed and no surface rendered
 * photos, but nothing worked either.
 *
 * The last two checks are the important ones: they assert the OBVIOUS fix was
 * not taken. A profile_photos policy for members you can see would have made
 * the view work and put both paths one query away.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:photos
 */

import pg from "pg";
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live photo verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const problems = [];
const check = (ok, m) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`); if (!ok) problems.push(m); };
let n = 0;
const member = async (privacy) => {
  n += 1;
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  await c.query(`insert into auth.users (id,instance_id,aud,role,phone,created_at,updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555044${String(n).padStart(4,"0")}`]);
  await c.query(`update public.profiles set display_name='M', birthdate='1990-01-01', community='hiv',
    condition='hiv', intention='long_term', search_radius_mi=250, verification_status='verified',
    photo_privacy=$2, location=public.round_location(extensions.ST_MakePoint(-122.4,37.77)::extensions.geography)
    where id=$1`, [id, privacy]);
  await c.query(`insert into public.profile_photos (user_id, storage_path, blurred_path, position)
    values ($1,$2,$3,0)`, [id, `${id}/clear.webp`, `${id}/blurred.webp`]);
  return id;
};
const as = async (id, sql, p) => {
  await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({sub:id,role:"authenticated"})]);
  await c.query(`set local role authenticated`);
  try { return await c.query(sql, p); } finally { await c.query(`reset role`); }
};

await c.query("begin");
try {
  const viewer = await member("clear");
  const clear = await member("clear");
  const shy = await member("blurred_until_connected");

  console.log("\n── the view picks the variant, not the client ──");
  const seeClear = await as(viewer, `select storage_path, is_blurred from public.visible_profile_photos where user_id=$1`, [clear]);
  check(String(seeClear.rows[0]?.storage_path).endsWith("clear.webp"), "a clear profile returns the clear path");
  check(seeClear.rows[0]?.is_blurred === false, "and is not marked blurred");

  const seeShy = await as(viewer, `select storage_path, is_blurred from public.visible_profile_photos where user_id=$1`, [shy]);
  // The whole of Decision #19: the CLEAR PATH IS NOT IN THE PAYLOAD.
  check(String(seeShy.rows[0]?.storage_path).endsWith("blurred.webp"), "a blurred-until-connected profile returns the BLURRED path");
  check(seeShy.rows[0]?.is_blurred === true, "and is marked blurred");
  check(!JSON.stringify(seeShy.rows[0]).includes("clear.webp"), "the clear path never reaches the viewer");

  console.log("\n── connecting reveals it ──");
  const { rows: [conn] } = await c.query(
    `insert into public.connects (initiator_id,target_id,prompt_id,prompt_reply,source,status,decided_at)
     values ($1,$2,'p','hello there','drop','accepted',now()) returning id`, [viewer, shy]);
  const afterConnect = await as(viewer, `select storage_path, is_blurred from public.visible_profile_photos where user_id=$1`, [shy]);
  check(String(afterConnect.rows[0]?.storage_path).endsWith("clear.webp"), "once connected, the clear path is returned");
  check(afterConnect.rows[0]?.is_blurred === false, "and it is no longer marked blurred");

  console.log("\n── and a stranger still gets nothing ──");
  const outsider = await member("clear");
  await c.query(`update public.profiles set community='hsv', condition='hsv2' where id=$1`, [outsider]);
  const none = await as(outsider, `select count(*)::int n from public.visible_profile_photos where user_id=$1`, [shy]);
  check(none.rows[0].n === 0, "someone in another community sees no photo row at all");

  console.log("\n── the direct path still shows nothing ──");
  // The obvious fix — a profile_photos policy for visible members — would have
  // made the view work AND put both paths one query away. This is the assertion
  // that it was not taken.
  const direct = await as(viewer, `select count(*)::int n from public.profile_photos where user_id=$1`, [shy]);
  check(direct.rows[0].n === 0, "profile_photos returns nothing for another member");

  const own = await as(viewer, `select count(*)::int n from public.profile_photos where user_id=$1`, [viewer]);
  check(own.rows[0].n === 1, "and still returns your own");

  console.log("\n── nobody reads another member's objects directly ──");
  const pol = await c.query(`select count(*)::int n from pg_policies
    where schemaname='storage' and tablename='objects' and cmd='SELECT'
      and qual like '%photos%' and qual not like '%foldername%'`);
  check(pol.rows[0].n === 0, "no storage policy grants read beyond your own folder");

  // ── the card variant (20260815001300) ──────────────────────────────────────
  // Every surface renders at 72px and the stored original is 1600. These cannot
  // go through a shared image optimiser — the bytes behind one URL differ by
  // viewer, so a connected viewer would populate a cache entry a stranger then
  // reads — which is why the small variant exists and why the view must return
  // it rather than the original.
  {
    console.log("\n── the view returns the card, never the original ──");
    const seen = await member("clear");
    await c.query(`update public.profile_photos set card_path = $2 where user_id = $1`, [
      seen, `${seen}/card.webp`,
    ]);
    const looker = await member("clear");
    const row = (await as(looker,
      `select storage_path from public.visible_profile_photos where user_id=$1`, [seen])).rows[0];
    check(String(row?.storage_path).endsWith("card.webp"), "a photo with a card variant returns the card");
    check(!String(row?.storage_path).endsWith("clear.webp"), "and never the 1600px original");

    // Nullable on purpose: a row written before the column existed still has to
    // resolve to something rather than to null.
    await c.query(`update public.profile_photos set card_path = null where user_id = $1`, [seen]);
    const fallback = (await as(looker,
      `select storage_path from public.visible_profile_photos where user_id=$1`, [seen])).rows[0];
    check(String(fallback?.storage_path).endsWith("clear.webp"), "without one it falls back to the original");

    // And the ownership constraint has to cover the new column too, or it is
    // one more derivable path pointing at somebody else's folder.
    let refused = false;
    await c.query(`savepoint cardown`);
    try {
      await c.query(`update public.profile_photos set card_path = $2 where user_id = $1`,
        [seen, `${looker}/stolen-card.webp`]);
      await c.query(`release savepoint cardown`);
    } catch { refused = true; await c.query(`rollback to savepoint cardown`); }
    check(refused, "a card path under another member's prefix is refused");
  }
} finally { await c.query("rollback"); }
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nPhoto privacy holds.\n");
process.exit(problems.length ? 1 : 0);
