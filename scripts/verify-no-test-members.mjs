/**
 * Fails while any seeded member exists.
 *
 * They live in the production database because there is only one, so "we forgot
 * to clean up" must not be a state anybody has to remember to check. This is
 * the gate that remembers.
 */
import pg from "pg";

const DOMAIN = "seed.plusone.invalid";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.log("SUPABASE_DB_URL not set — skipping.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(
  `select count(*)::int n from auth.users where email like $1`,
  [`%@${DOMAIN}`],
);
await client.end();

if (rows[0].n > 0) {
  console.error(`FAIL  ${rows[0].n} seeded test member(s) still in the database.`);
  console.error("      Remove them with: pnpm seed:remove");
  process.exit(1);
}
console.log("No seeded test members. Safe to go live.");
