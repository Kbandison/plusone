/**
 * Removes every seeded member, and nothing else.
 *
 * Matched on the .invalid auth domain alone — a TLD RFC 2606 reserves as
 * permanently unresolvable, so no real member can hold one however they signed
 * up. Deleting the auth user cascades through profiles and everything hanging
 * off it; the storage objects are removed separately because Supabase refuses
 * direct deletes from storage.objects.
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

const { rows } = await client.query(
  `select id from auth.users where email like $1`,
  [`%@${DOMAIN}`],
);

if (rows.length === 0) {
  console.log("No seeded members to remove.");
  await client.end();
  process.exit(0);
}

const { rowCount } = await client.query(`delete from auth.users where email like $1`, [
  `%@${DOMAIN}`,
]);
console.log(`Removed ${rowCount} seeded member(s).`);

const left = await client.query(`select count(*)::int n from auth.users where email like $1`, [
  `%@${DOMAIN}`,
]);
if (left.rows[0].n !== 0) {
  console.error(`! ${left.rows[0].n} still present.`);
  process.exitCode = 1;
}
await client.end();
