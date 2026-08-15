#!/usr/bin/env node
/**
 * Behavioural checks for the walls (§5.3, Decisions #17 and #18).
 *
 * These are the rules the product is built on: who can see whom, and who can
 * reach whom. They are stated twice — in the `profiles` policy and in
 * `visible_profiles`, in the `connects` policy and in the connect trigger — and
 * a test that reads the SQL would only confirm the statements exist.
 *
 * So this makes real members with real modes and communities, acts as each in
 * turn, and looks at what comes back.
 *
 * Runs inside a transaction that is ROLLED BACK. Safe against the real project.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:walls
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live wall verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const problems = [];
const check = (ok, msg) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`);
  if (!ok) problems.push(msg);
};

let phoneSeq = 0;
async function member(over = {}) {
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  phoneSeq += 1;
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555020${String(phoneSeq).padStart(4, "0")}`],
  );
  const fields = {
    display_name: "Member",
    birthdate: "1990-01-01",
    community: "hiv",
    condition: "hiv",
    intention: "long_term",
    search_radius_mi: 250,
    verification_status: "verified",
    mode: "dating",
    cross_community_opt_in: false,
    ...over,
  };
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`).join(", ");
  await c.query(`update public.profiles set ${sets} where id = $1`, [id, ...Object.values(fields)]);
  // Everyone is in the same place, so distance never confounds a visibility test.
  await c.query(
    `update public.profiles set location = extensions.ST_MakePoint(-122.4, 37.77)::extensions.geography where id = $1`,
    [id],
  );
  return id;
}

const asMember = async (id, sql, params) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: id, role: "authenticated" })]);
  await c.query(`set local role authenticated`);
  try {
    return await c.query(sql, params);
  } finally {
    await c.query(`reset role`);
  }
};

const canSee = async (viewer, target) => {
  const { rows } = await asMember(viewer, `select id from public.visible_profiles where id = $1`, [target]);
  return rows.length === 1;
};

/** Attempts a connect as `initiator`; returns whether the insert was allowed. */
async function canConnect(initiator, target, roomId = null) {
  await c.query(`savepoint attempt`);
  try {
    await asMember(initiator,
      `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, source, room_id)
       values ($1,$2,'p','hello there',$3,$4)`,
      [initiator, target, roomId ? "room" : "drop", roomId]);
    await c.query(`release savepoint attempt`);
    return true;
  } catch {
    await c.query(`rollback to savepoint attempt`);
    return false;
  }
}

await c.query("begin");
try {
  const datingA = await member();
  const datingB = await member();
  const supportOnly = await member({ mode: "support_only" });
  const otherCommunity = await member({ community: "hsv", condition: "hsv2" });
  const unverified = await member({ verification_status: "unverified" });
  const blocked = await member();

  console.log("\n── the community wall ──");
  check(await canSee(datingA, datingB), "a member sees another in their own community");
  check(!(await canSee(datingA, otherCommunity)), "a member does NOT see the other community");

  const optInA = await member({ cross_community_opt_in: true });
  const optInB = await member({ community: "hsv", condition: "hsv2", cross_community_opt_in: true });
  check(await canSee(optInA, optInB), "two mutual opt-ins see each other across communities");

  const optInOnly = await member({ cross_community_opt_in: true });
  check(!(await canSee(optInOnly, otherCommunity)), "one-sided opt-in is not enough");

  console.log("\n── the mode wall (Decision #18) ──");
  check(!(await canSee(datingA, supportOnly)), "a dating member does NOT see a support-only member");
  check(await canSee(supportOnly, datingA), "a support-only member still sees dating members");
  check(!(await canConnect(datingA, supportOnly)), "a dating member cannot connect to a support-only member");
  check(!(await canConnect(supportOnly, datingA)), "a support-only member cannot connect without a shared room");

  const { rows: [room] } = await c.query(`select id from public.rooms limit 1`);
  await c.query(`insert into public.room_members (room_id, user_id) values ($1,$2),($1,$3)`,
    [room.id, supportOnly, datingA]);
  check(await canConnect(supportOnly, datingA, room.id), "a shared room opens the support-only path");

  const loner = await member({ mode: "support_only" });
  check(!(await canConnect(loner, datingB, room.id)), "claiming a room they are not in does not work");

  console.log("\n── verification ──");
  check(!(await canSee(datingA, unverified)), "an unverified profile is invisible");

  console.log("\n── blocking ──");
  await c.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [blocked, datingA]);
  check(!(await canSee(datingA, blocked)), "a blocked member cannot see the blocker");
  check(!(await canSee(blocked, datingA)), "and the blocker cannot see them either — it is mutual");
  check(!(await canConnect(datingA, blocked)), "a block prevents a connect");

  console.log("\n── nobody sees themselves in the pool ──");
  check(!(await canSee(datingA, datingA)), "a member is not in their own visible_profiles");

  // ── the probe leak ─────────────────────────────────────────────────────────
  // Every RLS helper used to take a viewer/user argument that was always
  // auth.uid() in practice, which let a member substitute any uuid and ask
  // questions about other people. These attempts must all be refused.
  const refused = async (label, sql, params) => {
    await c.query(`savepoint probe`);
    try {
      await asMember(datingA, sql, params);
      await c.query(`release savepoint probe`);
      check(false, `${label} — STILL ANSWERABLE`);
    } catch {
      await c.query(`rollback to savepoint probe`);
      check(true, label);
    }
  };

  console.log("\n── questions about other people are unaskable ──");
  const roomId = (await c.query(`select id from public.rooms limit 1`)).rows[0].id;
  await refused("who moderates: is_admin(uuid)", `select public.is_admin($1)`, [datingB]);
  await refused("who pays: is_premium(uuid)", `select public.is_premium($1)`, [datingB]);
  await refused("who is support-only: profile_mode(uuid)", `select public.profile_mode($1)`, [supportOnly]);
  await refused("did two others block: is_blocked_either_way(a,b)",
    `select public.is_blocked_either_way($1,$2)`, [datingB, blocked]);
  await refused("did two others connect: has_accepted_connect(a,b)",
    `select public.has_accepted_connect($1,$2)`, [datingB, supportOnly]);
  await refused("is someone else in a room: is_member_of_room(user,room)",
    `select public.is_member_of_room($1,$2)`, [supportOnly, roomId]);
  await refused("what can someone else see: can_view_profile(viewer,...)",
    `select public.can_view_profile($1,$2,'hiv',false,'dating','verified')`, [datingB, supportOnly]);
  await refused("is someone else in a chat: is_chat_participant(chat,user)",
    `select public.is_chat_participant($1,$2)`, [roomId, datingB]);
  await refused("dead helper: shares_room(a,b)", `select public.shares_room($1,$2)`, [datingB, supportOnly]);

  console.log("\n── questions about myself still work, as the policies need ──");
  const self = await asMember(datingA,
    `select public.is_admin() a, public.connect_permitted($1) b,
            public.i_have_connected_with($1) c, public.i_am_in_room($2) d`,
    [supportOnly, roomId]);
  check(self.rows[0].a === false, "is_admin() answers about me");
  // A false, and it does not say WHICH wall stopped it.
  check(self.rows[0].b === false, "connect_permitted(target) answers about my own reach");
  check(self.rows[0].c === false, "i_have_connected_with(other) answers about me");
  // datingA joined this room earlier in the test, so a correct answer here is
  // true. Asserting the real value rather than a convenient false is what makes
  // this a test of the wrapper rather than of nothing.
  check(self.rows[0].d === true, "i_am_in_room(room) answers about me — correctly true");

  // Every table an ordinary member or an administrator reads, read as one.
  //
  // A policy that calls a function its role cannot execute fails CLOSED, which
  // looks like "there is no data" rather than like a permissions error. That is
  // how the moderation_queue policy sat broken: it called is_admin(uuid) after
  // that form was revoked, and nothing noticed because check:admin exercises
  // the SECURITY DEFINER RPCs, which never go through a policy.
  console.log("\n── every policy can call what it references ──");

  const adminId = await member();
  await c.query(`insert into public.admin_users (user_id) values ($1)`, [adminId]);

  const MEMBER_TABLES = [
    "profiles", "visible_profiles", "connects", "chats", "messages",
    "rooms", "room_members", "room_messages", "blocks", "reports",
    "referrals", "referral_conversions", "referral_rewards",
    "premium_grants", "subscriptions", "consents", "quiz_responses",
    "profile_photos", "drops", "connect_budgets", "deletion_requests",
  ];
  const ADMIN_TABLES = ["moderation_queue", "audit_log"];

  for (const [who, id, tables] of [
    ["a member", datingA, MEMBER_TABLES],
    ["an administrator", adminId, ADMIN_TABLES],
  ]) {
    for (const table of tables) {
      await c.query(`savepoint policy_probe`);
      try {
        await asMember(id, `select count(*) from public.${table}`);
        await c.query(`release savepoint policy_probe`);
        check(true, `${who} can read ${table}`);
      } catch (error) {
        await c.query(`rollback to savepoint policy_probe`);
        check(false, `${who} reading ${table}: ${String(error.message).split("\n")[0]}`);
      }
    }
  }

  console.log("\n── the preview surface is support-only ──");
  const { rows: previewForDating } = await asMember(datingA, `select id from public.preview_profiles limit 1`);
  check(previewForDating.length === 0, "a dating member gets no preview rows");
  const { rows: previewForSupport } = await asMember(supportOnly, `select id from public.preview_profiles`);
  check(previewForSupport.length > 0, `a support-only member gets preview rows (${previewForSupport.length})`);
  const previewCols = Object.keys(
    (await asMember(supportOnly, `select * from public.preview_profiles limit 1`)).rows[0] ?? {},
  );
  check(!previewCols.includes("display_name"), `preview exposes no name (${previewCols.join(", ")})`);
} finally {
  await c.query("rollback");
}

await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nEvery wall holds.\n");
process.exit(problems.length ? 1 : 0);
