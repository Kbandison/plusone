/**
 * Connects and a conversation between the given member and the seeds.
 *
 * Separate from seed-test-members because it needs a REAL member to sit on the
 * other side — the point is to look at your own inbox, not at two strangers
 * talking. Rerunnable: it clears whatever it made before, so the screens do not
 * fill up with duplicates every time you look.
 *
 * Everything it writes hangs off seeded accounts, so `pnpm seed:remove` takes
 * all of it with them — connects, chats and messages cascade from auth.users.
 */
import { readFileSync } from "node:fs";

import pg from "pg";

const DOMAIN = "seed.plusone.invalid";
const { PROFILE_PROMPTS } = await import("../packages/config/src/draft-copy.ts");

const url = process.env.SUPABASE_DB_URL;
const member = process.env.SEED_FOR;
if (!url || !member) {
  console.error("SUPABASE_DB_URL and SEED_FOR (a phone or email) are required.");
  process.exit(1);
}

/**
 * Written to read like two people rather than like filler. A conversation is
 * the one screen where lorem ipsum tests nothing at all — the whole question is
 * whether a thread of real sentences is legible at a phone's width.
 */
const PENDING_REPLY =
  "You said you would learn the dog's name before mine. I have three, so you would be busy.";
const SENT_REPLY =
  "The bench that gets the last of the sun — I know exactly the one you mean, and I would fight someone for it.";
const THREAD = [
  ["them", "Right, the roast dinner claim. Are we talking gravy from scratch or is that a stretch?"],
  ["me", "From scratch, and I will not be taking questions about how long it takes."],
  ["them", "That is the correct answer. What is the longest you have left something in the oven?"],
  ["me", "Long enough that the smoke alarm has opinions about me now."],
  ["them", "Honestly that is more reassuring than if you had said never."],
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: whoRows } = await client.query(
  `select id from auth.users where phone = $1 or email = $1`,
  [member],
);
if (whoRows.length === 0) {
  console.error(`No account for ${member}.`);
  process.exit(1);
}
const me = whoRows[0].id;

const { rows: seeds } = await client.query(
  `select u.id, p.display_name from auth.users u
     join public.profiles p on p.id = u.id
    where u.email like $1
    order by p.display_name`,
  [`%@${DOMAIN}`],
);
if (seeds.length < 3) {
  console.error("Need at least three seeded members. Run `pnpm seed` first.");
  process.exit(1);
}

await client.query("begin");
try {
  // Clear anything a previous run left, so looking twice does not double it.
  const { rowCount: cleared } = await client.query(
    `delete from public.connects c
      using auth.users u
      where (u.id = c.initiator_id or u.id = c.target_id)
        and u.email like $1
        and (c.initiator_id = $2 or c.target_id = $2)`,
    [`%@${DOMAIN}`, me],
  );

  const promptId = PROFILE_PROMPTS[0].id;
  const [waiting, talking, sent] = seeds;

  // 1. Somebody is waiting on you. Lands under "Needs you".
  await client.query(
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, status, source)
     values ($1, $2, $3, $4, 'pending', 'drop')`,
    [waiting.id, me, promptId, PENDING_REPLY],
  );

  // 2. One you already accepted, with a conversation in it.
  const {
    rows: [accepted],
  } = await client.query(
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, status, source, decided_at)
     values ($1, $2, $3, $4, 'accepted', 'drop', now()) returning id`,
    [talking.id, me, promptId, "Ten minutes before anyone picks the music is the best part of any trip."],
  );

  // The fuse is what makes a chat a chat (#13): seven days from opening, and
  // this one is three days in so the countdown on the row is not a round number.
  const {
    rows: [chat],
  } = await client.query(
    `insert into public.chats (connect_id, status, fuse_expires_at, created_at, updated_at)
     values ($1, 'open', now() + interval '4 days', now() - interval '3 days', now() - interval '20 minutes')
     returning id`,
    [accepted.id],
  );

  for (const [index, [who, body]] of THREAD.entries()) {
    await client.query(
      `insert into public.messages (chat_id, sender_id, body, created_at)
       values ($1, $2, $3, now() - make_interval(mins => $4))`,
      [chat.id, who === "me" ? me : talking.id, body, (THREAD.length - index) * 26],
    );
  }

  // 3. One you sent that nobody has answered. Lands under "Sent".
  await client.query(
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, status, source)
     values ($1, $2, $3, $4, 'pending', 'browse')`,
    [me, sent.id, promptId, SENT_REPLY],
  );

  await client.query("commit");
  console.log(`Cleared ${cleared} previous, then made:`);
  console.log(`  waiting on you   ${waiting.display_name}`);
  console.log(`  a conversation   ${talking.display_name} (${THREAD.length} messages, fuse in 4 days)`);
  console.log(`  sent, unanswered ${sent.display_name}`);
} catch (error) {
  await client.query("rollback");
  console.error("Nothing was written:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
