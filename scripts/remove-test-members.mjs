/**
 * Removes every seeded member, and nothing else.
 *
 * Matched on the .invalid auth domain alone — a TLD RFC 2606 reserves as
 * permanently unresolvable, so no real member can hold one however they signed
 * up. Deleting the auth user cascades through profiles and everything hanging
 * off it. The storage objects need their own pass, because Supabase refuses
 * direct deletes from storage.objects and the cascade cannot reach them.
 *
 * That pass did not exist until 2026-08-28. The docblock claimed it happened
 * "separately" and nothing did it, so every seed/remove cycle left the photos
 * behind in the production bucket — 588 orphans after a day of seeding for
 * screenshots, against 144 that belonged to anybody. A comment describing work
 * that no code performs is worse than no comment: it answers the question a
 * reader would otherwise go and check.
 *
 * `--sweep-orphans` additionally removes objects under a profile id that no
 * longer exists, which is what cleans up the ones already there. It is opt-in
 * because it deletes on a rule rather than on a list, and the seeded members it
 * is aimed at are gone by the time it runs.
 *
 * `--sweep-only` does that and removes NOBODY. Kevin is keeping a live set of
 * seeds for beta testers, so the garbage from earlier cycles has to be
 * collectable without taking the current members with it.
 */
import pg from "pg";

const DOMAIN = "seed.plusone.invalid";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is required.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SWEEP_ONLY = process.argv.includes("--sweep-only");
const SWEEP = SWEEP_ONLY || process.argv.includes("--sweep-orphans");

/**
 * Storage deletes go through the API, never through SQL.
 *
 * Supabase owns storage.objects and a direct delete leaves the file on disk
 * with no row pointing at it, which is a worse leak than the one being fixed.
 */
async function removeObjects(paths) {
  if (paths.length === 0) return 0;
  if (!SUPABASE_URL || !SECRET_KEY) {
    console.error(
      "! NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed to remove photos.",
    );
    console.error(`  ${paths.length} object(s) left in the photos bucket.`);
    process.exitCode = 1;
    return 0;
  }
  let removed = 0;
  // The API takes a batch, but a long list is worth chunking rather than
  // discovering the request limit in production.
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/photos`, {
      method: "DELETE",
      headers: {
        apikey: SECRET_KEY,
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (!response.ok) {
      console.error(`! photo delete failed: ${await response.text()}`);
      process.exitCode = 1;
      return removed;
    }
    removed += chunk.length;
  }
  return removed;
}

const { rows } = await client.query(`select id from auth.users where email like $1`, [
  `%@${DOMAIN}`,
]);

if (rows.length === 0 && !SWEEP) {
  console.log("No seeded members to remove.");
  await client.end();
  process.exit(0);
}

if (!SWEEP_ONLY) {
  // Read the paths BEFORE the cascade takes the rows that name them.
  const photos = await client.query(
    `select pp.storage_path, pp.card_path, pp.blurred_path
       from public.profile_photos pp
       join auth.users u on u.id = pp.user_id
      where u.email like $1`,
    [`%@${DOMAIN}`],
  );
  const paths = photos.rows.flatMap((r) =>
    [r.storage_path, r.card_path, r.blurred_path].filter(Boolean),
  );

  const { rowCount } = await client.query(`delete from auth.users where email like $1`, [
    `%@${DOMAIN}`,
  ]);
  console.log(`Removed ${rowCount} seeded member(s).`);

  const removed = await removeObjects(paths);
  console.log(`Removed ${removed} photo object(s).`);
}

if (SWEEP) {
  const orphans = await client.query(
    `select o.name from storage.objects o
      where o.bucket_id = 'photos'
        and not exists (
          select 1 from public.profiles p where o.name like p.id::text || '/%')`,
  );
  const swept = await removeObjects(orphans.rows.map((r) => r.name));
  console.log(`Swept ${swept} orphaned object(s) with no profile.`);
}

const left = await client.query(`select count(*)::int n from auth.users where email like $1`, [
  `%@${DOMAIN}`,
]);
if (!SWEEP_ONLY && left.rows[0].n !== 0) {
  console.error(`! ${left.rows[0].n} still present.`);
  process.exitCode = 1;
}
await client.end();
