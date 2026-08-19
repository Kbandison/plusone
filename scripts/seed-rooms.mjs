/**
 * Posts in the five rooms, so they are not five empty pages.
 *
 * Every room in this database held zero messages, which makes the room screens
 * impossible to look at honestly: slow mode, the report and block controls on a
 * post, the unattributed-author rule and the scope wall all render the same on
 * an empty page, which is to say not at all.
 *
 * THE POSTS ARE CLAUDE'S WORDS. They are not Kevin's, and they are not real
 * members'. They are written to read like people rather than like filler,
 * because a room is the one screen where lorem ipsum tests nothing — the whole
 * question is whether a column of real sentences from strangers is legible and
 * feels like somewhere you would speak. None of them gives medical advice, and
 * none of them is a fact claim about any condition that is not already in the
 * product's own copy.
 *
 * Rerunnable: it clears what it made before, so looking twice does not double
 * it. Everything hangs off seeded accounts, so `pnpm seed:remove` takes all of
 * it with them — room_messages and room_members both cascade from profiles.
 */
import pg from "pg";

const DOMAIN = "seed.plusone.invalid";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is required.");
  process.exit(1);
}

/**
 * A room's worth of posts, oldest first, each with how many minutes before now
 * it was written.
 *
 * Spaced by more than the room's slow_mode_seconds is not required — the
 * trigger compares now() against the last post's created_at, so a backdated
 * insert always clears it — but they are spaced anyway, because a room where
 * six people posted in the same second is not a room.
 */
const POSTS = {
  "newly-diagnosed": [
    [2880, "Diagnosed three weeks ago. I have read the same four pages of the internet about forty times and I do not think page five exists. Mostly I wanted to say it out loud somewhere."],
    [2790, "Page five does not exist. I looked. What helped me was closing the tabs and going outside, which sounds like nothing and was not nothing."],
    [2610, "The first fortnight I was certain everyone could tell by looking at me. They cannot. That took an embarrassingly long time to believe."],
    [1980, "Something nobody told me: the admin of it settles down. Early on it is the only thing in your calendar and then one day it just is not."],
    [900, "Reading this thread on a bad evening and it is helping. Thank you for writing things down."],
  ],
  "disclosure-stories": [
    [4320, "Told someone last night. Rehearsed it for a week, said it in about nine seconds, and then we talked about it for an hour. The nine seconds were the whole mountain."],
    [4100, "Mine went badly the first time and fine every time since. I wish someone had told me that the first one is not the referendum."],
    [3200, "I do it early now. Not as a warning, just as a thing about me, in the same tone as anything else. The tone does more work than the words."],
    [1500, "What I stopped doing was apologising in the sentence. Once I took the sorry out, people stopped hearing it as bad news."],
    [420, "Doing mine on Thursday. Coming back to this thread to read it again beforehand."],
  ],
  "hsv-general": [
    [3600, "Does anyone else find the tiredness worse than anything else? Not looking for advice, just wondering if it is a me thing."],
    [3400, "Not a you thing."],
    [2200, "Two years in and the honest report is that I think about it roughly never, which is not what I would have believed at six months."],
    [640, "Small thing that improved my week: I stopped reading forums at midnight. This one at four in the afternoon is fine."],
  ],
  "hiv-u-equals-u": [
    [5000, "Six months undetectable this week. I did not expect the number itself to feel like anything and it did."],
    [4600, "Congratulations. That one genuinely is worth marking."],
    [3000, "The hardest part for me was explaining U=U to someone who had not heard of it. I have got it down to two sentences now and it lands much better than the long version."],
    [1200, "Would you share the two sentences? I keep over-explaining and watching people's eyes glaze."],
    [1080, "Roughly: the treatment keeps the virus at a level tests cannot detect, and at that level it is not passed on. Then I stop talking and let them ask."],
  ],
  "general-lounge": [
    [2400, "Unpopular opinion: a Sunday with nothing in it is the best thing money cannot buy."],
    [2100, "Correct, and I will add that the second cup of coffee is better than the first because nobody is waiting for you by then."],
    [800, "Currently losing an argument with a plant that I have been told is unkillable."],
    [300, "The plant is fine. The plant is always fine. It is a very long game."],
  ],
};

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: seeds } = await client.query(
  `select u.id, p.display_name, p.community
     from auth.users u
     join public.profiles p on p.id = u.id
    where u.email like $1
    order by p.display_name`,
  [`%@${DOMAIN}`],
);
if (seeds.length < 4) {
  console.error("Need at least four seeded members. Run `pnpm seed` first.");
  process.exit(1);
}

const { rows: rooms } = await client.query(
  `select id, slug, community_scope from public.rooms order by slug`,
);

// Optional, and the reason to run this at all: joining the real member so the
// rooms are populated from THEIR side of the wall rather than only in the
// table. RLS reads posts through i_am_in_room, so a room nobody joined is a
// room that renders empty however much is in it.
const member = process.env.SEED_FOR;
let me = null;
if (member) {
  const { rows } = await client.query(
    `select id from auth.users where phone = $1 or email = $1`,
    [member],
  );
  if (rows.length === 0) {
    console.error(`No account for ${member}.`);
    process.exit(1);
  }
  me = rows[0].id;
}

await client.query("begin");
try {
  const { rowCount: cleared } = await client.query(
    `delete from public.room_messages m
      using auth.users u
      where u.id = m.user_id and u.email like $1`,
    [`%@${DOMAIN}`],
  );
  await client.query(
    `delete from public.room_members rm
      using auth.users u
      where u.id = rm.user_id and u.email like $1`,
    [`%@${DOMAIN}`],
  );

  let posted = 0;
  const summary = [];

  for (const room of rooms) {
    // Scope is the wall, and the seed has to respect it or it writes rows the
    // product would never have allowed: an hsv member posting in the hiv room
    // is not a thing the app can produce.
    const eligible = seeds.filter(
      (s) => room.community_scope === "all" || s.community === room.community_scope,
    );
    const posts = POSTS[room.slug] ?? [];
    if (eligible.length === 0 || posts.length === 0) continue;

    for (const [index, [minutesAgo, body]] of posts.entries()) {
      // A mix, because both modes need looking at. The rooms where a member is
      // most likely to want cover get more of it — which is a guess about
      // people, not a rule, and the real ratio is whatever members choose.
      const anonymous =
        (room.slug === "newly-diagnosed" || room.slug === "disclosure-stories")
          ? index % 3 !== 2
          : index % 4 === 0;

      // Round-robin, so a five-post thread is five people rather than one
      // person talking to themselves.
      const author = eligible[index % eligible.length];
      await client.query(
        `insert into public.room_members (room_id, user_id, joined_at)
         values ($1, $2, now() - interval '30 days')
         on conflict do nothing`,
        [room.id, author.id],
      );
      await client.query(
        `insert into public.room_messages (room_id, user_id, body, anonymous, created_at)
         values ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
        [room.id, author.id, body, anonymous, minutesAgo],
      );
      posted += 1;
    }

    if (me) {
      const { rows: mine } = await client.query(
        `select community from public.profiles where id = $1`,
        [me],
      );
      const myCommunity = mine[0]?.community ?? null;
      if (room.community_scope === "all" || room.community_scope === myCommunity) {
        await client.query(
          `insert into public.room_members (room_id, user_id) values ($1, $2)
           on conflict do nothing`,
          [room.id, me],
        );
      }
    }

    summary.push(`  ${room.slug.padEnd(20)} ${posts.length} posts`);
  }

  await client.query("commit");
  console.log(`Cleared ${cleared} previous, then wrote ${posted}:`);
  console.log(summary.join("\n"));
  if (me) console.log(`\nJoined ${member} to every room in their scope.`);
  else console.log("\nSet SEED_FOR to join your own account to them.");
} catch (error) {
  await client.query("rollback");
  console.error("Nothing was written:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
