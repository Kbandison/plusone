#!/usr/bin/env node
/**
 * Behavioural checks for the connect economy (§6.3, Decisions #15 and #18).
 *
 * The budget is the only thing standing between a member and unlimited
 * unsolicited approaches to everyone they can see, which in this community is a
 * safety question rather than a billing one. It was optional: `source` arrives
 * from the client, 'drop' costs nothing, and nothing checked that a drop had
 * ever happened. Eight connects went out on a 3/day tier with the counter still
 * reading zero.
 *
 * The clock was the client's too. `connects` carries a direct INSERT grant and
 * the policy pins initiator_id and status, so created_at could be backdated out
 * of the support-only weekly window and expires_at pushed a century out — and a
 * connect that never expires never sends the §6.2 note, which makes it the one
 * way to end something in silence.
 *
 * None of that is visible in the SQL: the trigger is correct about the rules it
 * checks. It has to be tried.
 *
 * Runs inside a transaction that is ROLLED BACK. Safe against the real project.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:connects
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live connect verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");

const problems = [];
const check = (ok, msg, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}${detail ? `  — ${detail}` : ""}`);
  if (!ok) problems.push(msg);
};

let sp = 0;
/** Keeps a successful write so budgets accumulate; unwinds only the failure. */
async function act(id, sql, params, keep = true) {
  const name = `s${(sp += 1)}`;
  await c.query(`savepoint ${name}`);
  let err = null;
  let res = null;
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: id, role: "authenticated" }),
    ]);
    await c.query(`set local role authenticated`);
    res = await c.query(sql, params);
  } catch (e) {
    err = e;
  }
  if (err || !keep) {
    await c.query(`rollback to savepoint ${name}`);
  } else {
    await c.query(`release savepoint ${name}`);
    await c.query(`reset role`);
  }
  return { ok: !err, err, res };
}

let seq = 0;
async function member(over = {}) {
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  seq += 1;
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555089${String(seq).padStart(4, "0")}`],
  );
  const fields = {
    display_name: "M", birthdate: "1990-01-01", community: "hiv", condition: "hiv",
    intention: "long_term", search_radius_mi: 250, verification_status: "verified",
    mode: "dating", cross_community_opt_in: false, ...over,
  };
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`).join(", ");
  await c.query(`update public.profiles set ${sets} where id = $1`, [id, ...Object.values(fields)]);
  await c.query(
    `update public.profiles set location = extensions.ST_MakePoint(-122.4, 37.77)::extensions.geography where id = $1`,
    [id],
  );
  return id;
}

const spent = async (id) => {
  const { rows } = await c.query(
    `select coalesce(connects_used, 0) u from public.connect_budgets where user_id = $1 and day = current_date`,
    [id],
  );
  return Number(rows[0]?.u ?? 0);
};

const INSERT = `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, source)
                values ($1, $2, 'p', 'hi', $3) returning id`;

console.log("\nThe daily budget:");
{
  const attacker = await member();
  const targets = [];
  for (let i = 0; i < 8; i += 1) targets.push(await member());

  let sent = 0;
  for (const target of targets) {
    const result = await act(attacker, INSERT, [attacker, target, "drop"]);
    if (!result.ok) break;
    sent += 1;
  }
  // The free tier is 3/day. Claiming 'drop' used to make it unbounded.
  check(sent === 3, "claiming source='drop' without a drop still costs budget", `sent ${sent} of 8`);
}

console.log("\n§7.4 — a decline lasts:");
{
  const asker = await member();
  const target = await member();

  const first = await act(asker, INSERT, [asker, target, "browse"]);
  check(first.ok, "the first ask goes through", first.ok ? "" : first.err.message.slice(0, 60));

  await c.query(
    `update public.connects set status = 'declined', decided_at = now(), decline_template = 0 where id = $1`,
    [first.res.rows[0].id],
  );

  // connects_one_pending_ix is a unique index WHERE status = 'pending', so it
  // stops two live asks and nothing more: the moment this went to 'declined' it
  // left the index and a fresh row inserted cleanly. Somebody could be asked,
  // decline, and be asked again the same minute, indefinitely.
  const inside = await act(asker, INSERT, [asker, target, "browse"]);
  check(!inside.ok, "and the same person cannot be asked again inside it");

  // Being declined must not stop the person who declined from asking back.
  const back = await act(target, INSERT, [target, asker, "browse"]);
  check(back.ok, "but they may ask back", back.ok ? "" : back.err.message.slice(0, 60));

  await c.query(
    `update public.connects
        set decided_at = now() - make_interval(days => public.config_int('cooldowns.decline_days', 30) + 1)
      where id = $1`,
    [first.res.rows[0].id],
  );
  const after = await act(asker, INSERT, [asker, target, "browse"]);
  check(after.ok, "and it lifts when the cooldown is up", after.ok ? "" : after.err.message.slice(0, 60));
}

console.log("\nDecision #15 — a real drop card is free:");
{
  const member1 = await member();
  const target = await member();
  await c.query(
    `insert into public.drops (user_id, drop_date, served_profile_ids, radius_used_mi)
     values ($1, current_date, array[$2::uuid], 50)`,
    [member1, target],
  );

  const first = await act(member1, INSERT, [member1, target, "drop"]);
  check(first.ok, "a genuine drop card connects", first.ok ? "" : first.err.message.slice(0, 60));
  check((await spent(member1)) === 0, "and consumes no daily budget", `used ${await spent(member1)}`);

  // A decline now holds for cooldowns.decline_days, so the re-approach below is
  // dated past it. Testing the budget rule through a fresh decline stopped
  // working the moment that cooldown existed — and the failure looked like the
  // exemption breaking rather than like the wall doing its job.
  await c.query(
    `update public.connects
        set status = 'declined',
            decided_at = now() - make_interval(days => public.config_int('cooldowns.decline_days', 30) + 1),
            decline_template = 0
      where id = $1`,
    [first.res.rows[0].id],
  );
  const again = await act(member1, INSERT, [member1, target, "drop"]);
  check(
    again.ok && (await spent(member1)) > 0,
    "a second approach to the same person is not free",
    `used ${await spent(member1)}`,
  );
}

console.log("\nThe clock is ours, not the client's:");
{
  const sender = await member();
  const one = await member();
  const two = await member();

  const back = await act(
    sender,
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, source, created_at)
     values ($1, $2, 'p', 'hi', 'browse', now() - interval '30 days') returning created_at`,
    [sender, one],
    false,
  );
  check(
    back.ok && Date.now() - back.res.rows[0].created_at.getTime() < 86_400_000,
    "created_at cannot be backdated out of the weekly window",
    back.ok ? `stored ${back.res.rows[0].created_at.toISOString().slice(0, 10)}` : "insert refused",
  );

  const far = await act(
    sender,
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, source, expires_at)
     values ($1, $2, 'p', 'hi', 'browse', now() + interval '100 years') returning expires_at`,
    [sender, two],
    false,
  );
  check(
    far.ok && far.res.rows[0].expires_at.getFullYear() <= new Date().getFullYear() + 1,
    "expires_at cannot be pushed out, so nothing pends forever",
    far.ok ? `stored ${far.res.rows[0].expires_at.toISOString().slice(0, 10)}` : "insert refused",
  );
}

await c.query("rollback");
await c.end();

console.log(
  problems.length
    ? `\n${problems.length} problem(s):\n${problems.map((p) => `  · ${p}`).join("\n")}`
    : "\nThe connect budget holds, and a drop card is still free.",
);
process.exit(problems.length ? 1 : 0);
