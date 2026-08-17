#!/usr/bin/env node
/**
 * Behavioural checks for the safety paths (§5.3, §7.3).
 *
 * Blocking and reporting are what a member reaches for on the worst day this
 * product will give them. Both were tables and policies with nothing connecting
 * them to a moderator, and the trigger that connects them raised on every fire
 * until this test filed a real report and watched it fail.
 *
 * That is the case for behavioural tests over structural ones: `check:sql`
 * parses the grammar, the migration applied cleanly, and creating a function
 * does not run it.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:safety
 */

import pg from "pg";
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live safety verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const problems = [];
const check = (ok, m) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`); if (!ok) problems.push(m); };
let n = 0;
const member = async () => {
  n += 1;
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  await c.query(`insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555022${String(n).padStart(4,"0")}`]);
  await c.query(`update public.profiles set display_name='M', birthdate='1990-01-01', community='hiv',
    condition='hiv', intention='long_term', search_radius_mi=50, verification_status='verified' where id=$1`, [id]);
  return id;
};
const as = async (id, sql, p) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]);
  await c.query(`set local role authenticated`);
  try { return await c.query(sql, p); } finally { await c.query(`reset role`); }
};

await c.query("begin");
try {
  const reporter = await member(), reported = await member();

  console.log("\n── a report reaches a moderator ──");
  await as(reporter, `insert into public.reports (reporter_id, reported_user_id, reason, detail)
    values ($1,$2,'harassment',$3)`, [reporter, reported, "They kept messaging after I asked them to stop."]);
  const queued = await c.query(`select kind, subject_user_id, status, payload from public.moderation_queue
    where subject_user_id = $1`, [reported]);
  check(queued.rows.length === 1, `a queue entry appears (${queued.rows.length})`);
  check(queued.rows[0]?.kind === "user_report", `kind is ${queued.rows[0]?.kind}`);
  check(queued.rows[0]?.status === "open", "it is open");
  check(queued.rows[0]?.payload?.reason === "harassment", "it carries the reason");
  // The member's account of what happened stays on the report row.
  check(!JSON.stringify(queued.rows[0]?.payload).includes("messaging"), "and not the detail text");

  console.log("\n── a verification flag reaches the same queue ──");
  await c.query(`update public.profiles set verification_status='flagged' where id=$1`, [reported]);
  const flags = await c.query(`select count(*)::int n from public.moderation_queue
    where subject_user_id=$1 and kind='verification_flag' and status='open'`, [reported]);
  check(flags.rows[0].n === 1, "one open verification entry");
  // Fail, appeal, fail again is one thing to look at, not three.
  await c.query(`update public.profiles set verification_status='rejected' where id=$1`, [reported]);
  await c.query(`update public.profiles set verification_status='flagged' where id=$1`, [reported]);
  const again = await c.query(`select count(*)::int n from public.moderation_queue
    where subject_user_id=$1 and kind='verification_flag' and status='open'`, [reported]);
  check(again.rows[0].n === 1, "flagging twice does not queue twice");

  console.log("\n── blocking is immediate and mutual ──");
  await as(reporter, `insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [reporter, reported]);
  const seen = await as(reporter, `select id from public.visible_profiles where id=$1`, [reported]);
  check(seen.rows.length === 0, "the blocker no longer sees them");
  const seenBack = await as(reported, `select id from public.visible_profiles where id=$1`, [reporter]);
  check(seenBack.rows.length === 0, "and they no longer see the blocker");

  console.log("\n── members cannot touch the queue ──");
  let refused = false;
  await c.query(`savepoint p`);
  try { await as(reporter, `insert into public.moderation_queue (kind, status) values ('user_report','open')`); await c.query(`release savepoint p`); }
  catch { refused = true; await c.query(`rollback to savepoint p`); }
  check(refused, "a member cannot insert into moderation_queue");

  let readRefused = true;
  await c.query(`savepoint q`);
  try {
    const r = await as(reporter, `select count(*)::int n from public.moderation_queue`);
    readRefused = r.rows[0].n === 0;
    await c.query(`release savepoint q`);
  } catch { await c.query(`rollback to savepoint q`); }
  check(readRefused, "and sees nothing in it");

  // ── a block reaches the rooms (20260815001200) ──────────────────────────────
  // room_messages carried no block term, so someone a member had blocked kept
  // appearing in their feed every day — while tables.sql says blocks are
  // "checked in both directions on every visibility test". Own block scope so
  // nothing here collides with the names above.
  {
    const alice = await member();
    const bob = await member();
    const carol = await member();
    const [{ id: roomId }] = (await c.query(`select id from public.rooms where slug = 'general-lounge'`)).rows;

    for (const who of [alice, bob, carol]) {
      await c.query(`insert into public.room_members (room_id, user_id) values ($1,$2)`, [roomId, who]);
      await c.query(`insert into public.room_messages (room_id, user_id, body) values ($1,$2,$3)`, [
        roomId, who, `post-${who}`,
      ]);
    }

    const feedOf = async (who) => {
      const r = await as(who, `select body from public.room_messages where room_id = '${roomId}'`);
      return r.rows.map((x) => x.body);
    };

    check((await feedOf(alice)).length === 3, "a room member reads every post before any block");

    await c.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [alice, bob]);

    const aliceSees = await feedOf(alice);
    const bobSees = await feedOf(bob);
    const carolSees = await feedOf(carol);

    check(!aliceSees.includes(`post-${bob}`), "a blocked member's room posts disappear for the blocker");
    check(aliceSees.includes(`post-${alice}`), "and the blocker still sees their own");
    check(!bobSees.includes(`post-${alice}`), "the block is mutual in the rooms too");
    check(carolSees.length === 3, "and it changes nothing for anybody else");

    // A block is one member's decision about their own view. If it removed
    // someone's voice for the whole room it would be a moderation action
    // wearing a safety control's clothes.
    //
    // Slow mode is switched off for this room first (20260817000800 enforces it
    // now, and this fixture posts several times in a row). Testing the block
    // means testing the block — a cooldown refusing the post would look exactly
    // like a mute and pass the assertion for the wrong reason.
    await c.query(`update public.rooms set slow_mode_seconds = 0 where id = '${roomId}'`);

    let canStillPost = false;
    await c.query(`savepoint rb`);
    try {
      await as(bob, `insert into public.room_messages (room_id, user_id, body) values ('${roomId}','${bob}','again')`);
      canStillPost = true;
      await c.query(`release savepoint rb`);
    } catch { await c.query(`rollback to savepoint rb`); }
    check(canStillPost, "a blocked member can still post — a block is not a mute for everyone");
  }
} finally { await c.query("rollback"); }
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nSafety paths hold.\n");
process.exit(problems.length ? 1 : 0);
