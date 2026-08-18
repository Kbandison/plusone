/**
 * Throwaway members, so the Drop, Browse, connects and chats have somebody in
 * them.
 *
 * THESE GO IN THE PRODUCTION DATABASE. Decision #4 gives this project one
 * Supabase project and no staging one, so there is nowhere else to put them.
 * Everything here is built around that single fact:
 *
 *   1. EVERY ONE IS MARKED, in a way the UI never shows and a real member can
 *      never accidentally match. Their auth email ends in the domain below,
 *      which is under .invalid — a TLD RFC 2606 reserves as permanently
 *      unresolvable. No real person can ever hold one.
 *
 *   2. REMOVAL IS EXACT. remove-test-members.mjs deletes by that domain and
 *      nothing else, so it cannot take a real member with it.
 *
 *   3. A GATE FAILS WHILE ANY EXIST. `pnpm check:seed` is red until the last
 *      one is gone, so "we forgot to clean up" cannot be a silent state.
 *
 * They are placed near whoever runs this, because a member with no location
 * matches nobody and a seed a thousand miles away is the same as no seed.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";

const DOMAIN = "seed.plusone.invalid";
const COUNT = Number(process.env.SEED_COUNT ?? 12);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is required.");
  process.exit(1);
}

/** Around whom to place them: the member whose phone or email is given. */
const ANCHOR = process.env.SEED_NEAR ?? "";

const NAMES = [
  "Rae", "Marcus", "Sofia", "Devon", "Priya", "Elliot",
  "Naomi", "Jonah", "Camille", "Theo", "Alina", "Wes",
  "Nadia", "Callum", "Imani", "Rowan", "Beatriz", "Aziz",
];
const GENDERS = ["woman", "man", "non_binary", "other"];
const INTENTIONS = ["long_term", "casual", "open_to_either", "friends_support"];
const CONDITIONS = { hsv: ["hsv1", "hsv2", "hsv1_hsv2"], hiv: ["hiv", "hiv_hsv"] };
const FREQ = ["never", "sometimes", "often"];
const KIDS = ["none", "have", "have_grown"];
const PLAN = ["want", "open", "no", "unsure"];

/** Deterministic, so a rerun produces the same cast rather than a new one. */
function pick(list, n) {
  return list[n % list.length];
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const anchor = ANCHOR
  ? (
      await client.query(
        `select extensions.st_y(p.location::extensions.geometry) lat,
                extensions.st_x(p.location::extensions.geometry) lon
           from public.profiles p join auth.users u on u.id = p.id
          where u.phone = $1 or u.email = $1`,
        [ANCHOR],
      )
    ).rows[0]
  : null;

// Manhattan, only because somewhere has to be the default and a seed with no
// location is invisible to every surface in the app.
const lat = Number(process.env.SEED_LAT ?? anchor?.lat ?? 40.73);
const lon = Number(process.env.SEED_LON ?? anchor?.lon ?? -73.99);

if (ANCHOR && !anchor?.lat) {
  console.warn(
    `! ${ANCHOR} has no location stored, so the seeds are going near ${lat}, ${lon} instead.\n` +
      "  Finish the radius step as that member first if you want them placed around you.",
  );
}

await client.query("begin");
try {
  const made = [];
  for (let i = 0; i < COUNT; i += 1) {
    const id = randomUUID();
    const email = `seed-${id}@${DOMAIN}`;
    const community = i % 4 === 3 ? "hiv" : "hsv";
    const gender = pick(GENDERS, i);
    // Everybody wants somebody: a seed seeking nothing matches everyone, which
    // would make the mutual filter look broken rather than permissive.
    const seeking = [pick(GENDERS, i + 1), pick(GENDERS, i + 2)];
    const age = 22 + ((i * 5) % 40);
    const birthdate = new Date(Date.UTC(new Date().getUTCFullYear() - age, 5, 15))
      .toISOString()
      .slice(0, 10);

    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now(), now())`,
      [id, email],
    );

    // create_profile_on_signup already made the row; this fills it in.
    await client.query(
      `update public.profiles set
         display_name = $2, birthdate = $3,
         community = $4, condition = $5,
         u_equals_u = $6, cross_community_opt_in = true,
         gender = $7::public.gender_identity,
         seeking = $8::public.gender_identity[],
         age_min = 18, age_max = 80,
         intention = $9::public.intention,
         smokes = $10::public.lifestyle_frequency,
         drinks = $11::public.lifestyle_frequency,
         kids = $12::public.kids_status,
         kids_plan = $13::public.kids_plan,
         bio = $14,
         search_radius_mi = 100,
         location = extensions.ST_SetSRID(extensions.ST_MakePoint($15, $16), 4326)::extensions.geography,
         verification_status = 'verified',
         verified_at = now(), liveness_passed_at = now(), onboarded_at = now(),
         last_active_at = now() - make_interval(hours => $17)
       where id = $1`,
      [
        id,
        `${pick(NAMES, i)}`,
        birthdate,
        community,
        pick(CONDITIONS[community], i),
        community === "hiv" && i % 2 === 0,
        gender,
        seeking,
        pick(INTENTIONS, i),
        pick(FREQ, i),
        pick(FREQ, i + 1),
        pick(KIDS, i),
        pick(PLAN, i),
        "A seeded account for testing. Not a real person.",
        // Scattered over roughly forty miles so the radius filter has something
        // to actually exclude.
        lon + (((i % 7) - 3) * 0.09),
        lat + ((Math.floor(i / 7) % 5) - 2) * 0.09,
        i * 6,
      ],
    );
    made.push(email);
  }
  await client.query("commit");
  console.log(`Seeded ${made.length} members near ${lat.toFixed(2)}, ${lon.toFixed(2)}.`);
  console.log(`Remove them with:  pnpm seed:remove`);
} catch (error) {
  await client.query("rollback");
  console.error("Nothing was seeded:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
