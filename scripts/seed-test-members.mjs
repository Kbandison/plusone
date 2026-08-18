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

import { readFileSync } from "node:fs";

import pg from "pg";
import sharp from "sharp";

// draft-copy.ts imports nothing, so Node's type stripping can load it directly.
// The package barrel cannot be imported the same way — its subpaths are
// extensionless and Node will not resolve them.
const { PROFILE_PROMPTS, QUIZ_QUESTIONS, QUIZ_TRAITS } = await import(
  "../packages/config/src/draft-copy.ts"
);

const DOMAIN = "seed.plusone.invalid";
const COUNT = Number(process.env.SEED_COUNT ?? 12);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is required.");
  process.exit(1);
}

/**
 * Photos go through the Storage API, not the database. Supabase refuses direct
 * writes to storage.objects, which is the same wall the account reset had to
 * work around.
 */
const envFile = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["\x27]|["\x27]$/g, "")];
    }),
);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFile.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? envFile.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for photos.");
  process.exit(1);
}

/** Around whom to place them: the member whose phone or email is given. */
const ANCHOR = process.env.SEED_NEAR ?? "";

/**
 * Answers for the §10 prompts. Written to sound like people rather than like
 * filler, because a grid of "lorem ipsum" tests the layout and nothing else —
 * a card with three real sentences is the only way to see whether the profile
 * actually reads.
 */
const PROMPT_ANSWERS = [
  "Long walks that turn into long lunches. I never plan them and they never go to plan.",
  "Someone reading the ingredients list out loud in a supermarket aisle. Every time.",
  "I will absolutely learn the name of your dog before I learn yours.",
  "Making a very good roast dinner and pretending it was no trouble at all.",
  "The first ten minutes of a road trip, before anyone has picked the music.",
  "Badly. But enthusiastically, and usually before nine in the morning.",
  "That I would rather be told the truth awkwardly than a kindness smoothly.",
  "Finding the one bench in a park that gets the last of the sun.",
];

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

/**
 * The same reduction packages/logic/src/quiz/quiz.ts performs.
 *
 * Duplicated because that module imports @plusone/config, whose barrel uses
 * extensionless subpaths that Node's type stripping cannot resolve — and a seed
 * with no vector scores NEUTRAL against everybody, which cancels out of the
 * ranking and makes 30% of the Drop's score untestable.
 *
 * seed-quiz.test.ts computes both ways from the real questions and fails if
 * they ever disagree, so this cannot drift quietly.
 */
export function traitVectorFor(answers) {
  const totals = new Map();
  for (const question of QUIZ_QUESTIONS) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;
    const option = question.options.find((o) => o.id === chosen);
    if (!option) continue;
    const current = totals.get(question.trait) ?? { sum: 0, count: 0 };
    totals.set(question.trait, { sum: current.sum + option.weight, count: current.count + 1 });
  }
  return QUIZ_TRAITS.map((trait) => {
    const entry = totals.get(trait);
    return entry && entry.count > 0 ? entry.sum / entry.count : 0;
  });
}

/**
 * A photo, so a card has a face-shaped rectangle rather than a grey box.
 *
 * Drawn rather than downloaded: a seed must never carry a real person's
 * likeness, and fetching stock images would put one in the production storage
 * bucket. Three variants, matching what processPhoto writes on a real upload —
 * a card with no blurred counterpart is a photo with no private fallback.
 */
async function drawPhoto(initial, hue) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="hsl(${hue} 52% 62%)"/>
         <stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 46% 44%)"/>
       </linearGradient></defs>
       <rect width="900" height="900" fill="url(#g)"/>
       <text x="450" y="530" font-family="Georgia, serif" font-size="360"
             fill="rgba(255,255,255,0.9)" text-anchor="middle">${initial}</text>
     </svg>`,
  );
  const base = sharp(svg);
  return {
    full: await base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    card: await base.clone().resize({ width: 320, height: 320, fit: "cover" }).webp({ quality: 78 }).toBuffer(),
    blurred: await base.clone().resize({ width: 32, height: 32, fit: "inside" }).resize({ width: 480, height: 480, fit: "inside", kernel: "cubic" }).blur(18).webp({ quality: 60 }).toBuffer(),
  };
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
    /**
     * Every gender spans the same range of ages.
     *
     * It was `22 + (i * 5) % 40`, whose period of 40 against a gender cycle of
     * 4 gave each gender its own fixed lattice: the women came out 22, 22 and
     * 42, so a member seeking women aged 24 to 38 matched nobody and the filter
     * looked broken while working perfectly.
     *
     * Changing the stride does not fix it. With twelve seeds and four genders
     * each gender gets three slots, and any arithmetic sequence can still miss
     * a band that narrow. So the age is built from the position WITHIN a
     * gender, which puts every gender at the same ages give or take a year —
     * whoever a member is looking for, somebody of that gender is 24 and
     * somebody is 40.
     */
    const age = 24 + Math.floor(i / GENDERS.length) * 9 + (i % GENDERS.length);
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
    // Three prompts, offset so no two seeds answer the same ones in the same
    // order — a wall of identical cards tests nothing about the layout.
    const prompts = [0, 1, 2].map((n) => ({
      id: PROFILE_PROMPTS[(i + n * 3) % PROFILE_PROMPTS.length].id,
      answer: PROMPT_ANSWERS[(i + n * 3) % PROMPT_ANSWERS.length],
    }));
    await client.query(`update public.profiles set prompts = $2::jsonb where id = $1`, [
      id,
      JSON.stringify(prompts),
    ]);

    /**
     * A real answer to every question, chosen by a generator rather than a
     * stride.
     *
     * `(i + q) % options.length` looked varied and was not: each trait owns two
     * questions, and walking the options in lockstep gave the pair
     * complementary weights that averaged to nothing. Twelve seeds produced
     * three distinct vectors and half of them were all zeroes — which
     * quizCompat reads as no answer at all, so 30% of the Drop's score went
     * back to being untestable.
     *
     * Seeded on the member's index, so a rerun produces the same cast.
     */
    let rng = ((i + 1) * 2654435761) >>> 0;
    const nextRandom = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    };
    const answers = {};
    for (const question of QUIZ_QUESTIONS) {
      answers[question.id] =
        question.options[Math.floor(nextRandom() * question.options.length)].id;
    }
    await client.query(
      `insert into public.quiz_responses (user_id, answers, trait_vector)
       values ($1, $2::jsonb, $3::real[])
       on conflict (user_id) do update set answers = excluded.answers, trait_vector = excluded.trait_vector`,
      [id, JSON.stringify(answers), traitVectorFor(answers)],
    );

    // Two photos each, so the gallery, the card and the blurred fallback all
    // have something to render.
    for (const slot of [0, 1]) {
      const photoId = randomUUID();
      const variants = await drawPhoto(pick(NAMES, i)[0], ((i * 47) + slot * 25) % 360);
      const paths = {
        storage_path: `${id}/${photoId}.webp`,
        card_path: `${id}/${photoId}-card.webp`,
        blurred_path: `${id}/${photoId}-blurred.webp`,
      };
      for (const [key, body] of [
        [paths.storage_path, variants.full],
        [paths.card_path, variants.card],
        [paths.blurred_path, variants.blurred],
      ]) {
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${key}`, {
          method: "POST",
          headers: {
            apikey: SECRET_KEY,
            Authorization: `Bearer ${SECRET_KEY}`,
            "Content-Type": "image/webp",
            "x-upsert": "true",
          },
          body,
        });
        if (!response.ok) throw new Error(`photo upload failed: ${await response.text()}`);
      }
      await client.query(
        `insert into public.profile_photos (user_id, storage_path, card_path, blurred_path, position)
         values ($1, $2, $3, $4, $5)`,
        [id, paths.storage_path, paths.card_path, paths.blurred_path, slot],
      );
    }

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
