#!/usr/bin/env node
/**
 * Behavioural checks for what premium does NOT buy (§3.3, Decision #24).
 *
 * "No selling exemptions from mechanics — fuse extensions, wall bypasses, extra
 * drops, undo. Never monetized. Ever."
 *
 * The unit tests assert the pure functions ignore premium. This asserts the
 * DATABASE does: a paying member and a free member, side by side, against the
 * real walls. If premium ever starts buying an exemption it will be through a
 * policy or an RPC, not through packages/logic — so this is where it would show
 * up.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:premium
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live premium verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const problems = [];
const check = (ok, m) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`);
  if (!ok) problems.push(m);
};

let n = 0;
async function member(over = {}) {
  n += 1;
  const {
    rows: [{ id }],
  } = await c.query(`select extensions.gen_random_uuid() id`);
  await c.query(
    `insert into auth.users (id,instance_id,aud,role,phone,created_at,updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555066${String(n).padStart(4, "0")}`],
  );
  const fields = {
    display_name: "M",
    birthdate: "1990-01-01",
    community: "hiv",
    condition: "hiv",
    intention: "long_term",
    search_radius_mi: 250,
    verification_status: "verified",
    mode: "dating",
    ...over,
  };
  const sets = Object.keys(fields)
    .map((k, i) => `${k} = $${i + 2}`)
    .join(", ");
  await c.query(`update public.profiles set ${sets} where id = $1`, [id, ...Object.values(fields)]);
  await c.query(
    `update public.profiles set location = public.round_location(
       extensions.ST_MakePoint(-122.4, 37.77)::extensions.geography) where id = $1`,
    [id],
  );
  return id;
}

const as = async (id, sql, p) => {
  await c.query(`select set_config('request.jwt.claims',$1,true)`, [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  await c.query(`set local role authenticated`);
  try {
    return await c.query(sql, p);
  } finally {
    await c.query(`reset role`);
  }
};

let sp = 0;
const attempt = async (fn) => {
  const name = `sp${sp++}`;
  await c.query(`savepoint ${name}`);
  try {
    await fn();
    await c.query(`release savepoint ${name}`);
    return true;
  } catch {
    await c.query(`rollback to savepoint ${name}`);
    return false;
  }
};

await c.query("begin");
try {
  const free = await member();
  const paid = await member();
  const shielded = await member({ mode: "support_only" });
  const otherCommunity = await member({ community: "hsv", condition: "hsv2" });

  // A real, active subscription — the thing that makes is_premium() true.
  await c.query(
    `insert into public.subscriptions (user_id, stripe_customer_id, stripe_sub_id, plan, status, current_period_end)
     values ($1, 'cus_test_premium', 'sub_test_premium', 'premium_3mo', 'active', now() + interval '90 days')`,
    [paid],
  );

  console.log("\n── the subscription is real ──");
  check(
    (await c.query(`select public.is_premium($1) p`, [paid])).rows[0].p === true,
    "the paying member is premium",
  );
  check(
    (await c.query(`select public.is_premium($1) p`, [free])).rows[0].p === false,
    "the free member is not",
  );

  console.log("\n── premium does not bypass the support-only wall ──");
  const paidSeesShielded = await as(paid, `select id from public.visible_profiles where id=$1`, [
    shielded,
  ]);
  check(
    paidSeesShielded.rows.length === 0,
    "a paying member still cannot see a support-only member",
  );
  const paidConnects = await attempt(() =>
    as(
      paid,
      `insert into public.connects (initiator_id,target_id,prompt_id,prompt_reply,source)
     values ($1,$2,'sunday','hello there','drop')`,
      [paid, shielded],
    ),
  );
  check(!paidConnects, "and still cannot connect to one");

  console.log("\n── premium does not bypass the community wall ──");
  const paidSeesOther = await as(paid, `select id from public.visible_profiles where id=$1`, [
    otherCommunity,
  ]);
  check(paidSeesOther.rows.length === 0, "a paying member still cannot see the other community");

  console.log("\n── premium does not bypass a block ──");
  await c.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [free, paid]);
  const paidSeesBlocker = await as(paid, `select id from public.visible_profiles where id=$1`, [
    free,
  ]);
  check(
    paidSeesBlocker.rows.length === 0,
    "a paying member still cannot see someone who blocked them",
  );
  await c.query(`delete from public.blocks where blocker_id=$1`, [free]);

  console.log("\n── premium does not touch the fuse ──");
  const target = await member();
  const {
    rows: [conn],
  } = await c.query(
    `insert into public.connects (initiator_id,target_id,prompt_id,prompt_reply,source,status,decided_at)
     values ($1,$2,'sunday','hello there','drop','accepted',now()) returning id`,
    [paid, target],
  );
  const {
    rows: [chat],
  } = await c.query(
    `insert into public.chats (connect_id, status, fuse_expires_at)
     values ($1,'open', now() + interval '7 days') returning id, fuse_expires_at`,
    [conn.id],
  );

  // There is no UPDATE policy on chats at all — for anyone, at any price.
  const paidExtends = await attempt(() =>
    as(paid, `update public.chats set fuse_expires_at = now() + interval '90 days' where id=$1`, [
      chat.id,
    ]),
  );
  check(!paidExtends, "a paying member cannot extend their own fuse");

  const updatePolicies = await c.query(
    `select count(*)::int n from pg_policies where tablename in ('chats','connects') and cmd='UPDATE'`,
  );
  check(
    updatePolicies.rows[0].n === 0,
    "there is no update policy on chats or connects to exempt anyone with",
  );

  console.log("\n── premium does not enlarge the Drop ──");
  const dropCount = await c.query(`select value from public.app_config where key='drop.count'`);
  check(
    String(dropCount.rows[0]?.value) === "3",
    `drop.count is a single global value (${dropCount.rows[0]?.value})`,
  );
  const perMember = await c.query(
    `select count(*)::int n from information_schema.columns
     where table_schema='public' and table_name='drops' and column_name ilike '%count%'`,
  );
  check(perMember.rows[0].n === 0, "and drops has no per-member count column to raise");

  console.log("\n── premium raises the connect budget, and only that ──");
  const free_per = await c.query(
    `select value from public.app_config where key='connects.free_per_day'`,
  );
  const prem_per = await c.query(
    `select value from public.app_config where key='connects.premium_per_day'`,
  );
  check(
    Number(prem_per.rows[0]?.value) > Number(free_per.rows[0]?.value),
    `premium sends more per day (${free_per.rows[0]?.value} -> ${prem_per.rows[0]?.value})`,
  );
  check(Number(prem_per.rows[0]?.value) < 100, "and it is still a cap, not unlimited");

  console.log("\n── premium cannot be permanent ──");
  // The shape the checkout webhook used to write: status 'active' with no
  // period end. is_premium() reads a null period end as "no expiry" — correct
  // for a §6.5 referral grant, and forever-free-premium on a subscription row.
  // If this insert ever succeeds again, a failed customer.subscription.created
  // delivery leaves a member paid up for good with nothing left to revoke it.
  // A member each: user_id is the primary key, so reusing one makes the second
  // case fail on a key conflict rather than on the constraint — which reads as
  // a pass when the constraint is gone.
  const [everA, everB, everC] = [await member(), await member(), await member()];

  const forever = await attempt(() =>
    c.query(
      `insert into public.subscriptions (user_id, stripe_customer_id, status, current_period_end)
     values ($1, 'cus_test_forever', 'active', null)`,
      [everA],
    ),
  );
  check(!forever, "an active subscription with no period end is refused");

  const foreverTrial = await attempt(() =>
    c.query(
      `insert into public.subscriptions (user_id, stripe_customer_id, status, current_period_end)
     values ($1, 'cus_test_forever_trial', 'trialing', null)`,
      [everB],
    ),
  );
  check(!foreverTrial, "and so is a trialing one");

  // Statuses that grant nothing are unconstrained — a cancelled subscription
  // legitimately has no period left to record.
  const cancelled = await attempt(() =>
    c.query(
      `insert into public.subscriptions (user_id, stripe_customer_id, status, current_period_end)
     values ($1, 'cus_test_cancelled', 'canceled', null)`,
      [everC],
    ),
  );
  check(cancelled, "a canceled subscription may still have no period end");
  check(
    (await c.query(`select public.is_premium($1) p`, [everC])).rows[0].p === false,
    "and it grants nothing",
  );

  console.log("\n── a store subscription is the third way to be premium ──");

  // Absent rather than broken is the interesting case: 20260826000100 shipped
  // in the repo before it reached the database, and nothing else would say so.
  const hasTable =
    (await c.query(`select to_regclass('public.iap_entitlements') r`)).rows[0].r !== null;
  check(hasTable, "iap_entitlements exists (20260826000100 has been applied)");

  if (hasTable) {
    const buyer = await member();
    const rival = await member();
    const prem = async (u) => (await c.query(`select public.is_premium($1) p`, [u])).rows[0].p;
    const row = (u, status, txn, ends = "now() + interval '30 days'") =>
      c.query(
        `insert into public.iap_entitlements (user_id, store, product_id, transaction_id, status, expires_at)
       values ($1, 'apple', '3months', $2, $3, ${ends}) returning id`,
        [u, txn, status],
      );

    const {
      rows: [{ id: live }],
    } = await row(buyer, "active", "orig-txn-1");
    check((await prem(buyer)) === true, "an active App Store entitlement makes a member premium");

    await c.query(`update public.iap_entitlements set status='grace' where id=$1`, [live]);
    check(
      (await prem(buyer)) === true,
      "so does one in the billing grace period — the store is still retrying the card",
    );

    // The one a date comparison alone gets wrong. A refund revokes access now,
    // with weeks left on expires_at, so anything reading this table has to gate
    // on status BEFORE it looks at the clock.
    await c.query(`update public.iap_entitlements set status='revoked' where id=$1`, [live]);
    check(
      (await prem(buyer)) === false,
      "a revoked entitlement grants nothing, with 30 days still on the clock",
    );

    await c.query(`update public.iap_entitlements set status='paused' where id=$1`, [live]);
    check((await prem(buyer)) === false, "and neither does a paused one");

    // The same shape as the subscriptions constraint above, against the same
    // bug: a granting row with no expiry is premium with nothing left to revoke.
    check(
      !(await attempt(() => row(buyer, "active", "no-end-1", "null"))),
      "an active entitlement with no expiry is refused",
    );
    check(!(await attempt(() => row(buyer, "grace", "no-end-2", "null"))), "and so is a grace one");
    check(
      await attempt(() => row(buyer, "expired", "no-end-3", "null")),
      "an expired one may have none — it grants nothing either way",
    );

    // A store entitlement belongs to an Apple ID, not to a Plus One account.
    // One purchase, "restore" on a second account, two premium members.
    await row(buyer, "active", "shared-txn");
    check(
      !(await attempt(() => row(rival, "active", "shared-txn"))),
      "a second member cannot claim the same store subscription",
    );
    check(
      !(await attempt(() =>
        c.query(`update public.iap_entitlements set user_id=$1 where transaction_id='shared-txn'`, [
          rival,
        ]),
      )),
      "and the binding cannot be moved onto them by an update",
    );
  }

  console.log("\n── a purchase is recorded once, and never changes hands ──");

  const hasRpc =
    (
      await c.query(
        `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = 'record_iap_entitlement'`,
      )
    ).rows[0].n > 0;
  check(hasRpc, "record_iap_entitlement exists (20260826000400 has been applied)");

  if (hasRpc && hasTable) {
    const owner = await member();
    const other = await member();
    const record = (user, over = {}) =>
      c.query(`select public.record_iap_entitlement($1,$2,$3,$4,$5,$6,$7) id`, [
        user,
        "apple",
        over.product ?? "3months",
        over.txn ?? "one-purchase",
        over.status ?? "active",
        over.expires ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
        over.env === undefined ? "Sandbox" : over.env,
      ]);
    const prem = async (u) => (await c.query(`select public.is_premium($1) p`, [u])).rows[0].p;
    const rows = async () =>
      (
        await c.query(
          `select count(*)::int n from public.iap_entitlements where transaction_id = 'one-purchase'`,
        )
      ).rows[0].n;

    const first = (await record(owner)).rows[0].id;
    check(
      Boolean(first) && (await prem(owner)) === true,
      "a purchase is recorded and grants premium",
    );

    // Replay is the NORMAL case: StoreKit redelivers until a transaction is
    // finished, so this runs on every launch until the grant lands.
    const replay = (
      await record(owner, { expires: new Date(Date.now() + 120 * 86_400_000).toISOString() })
    ).rows[0].id;
    check(
      replay === first && (await rows()) === 1,
      "a replay updates that row rather than adding another",
    );

    check(
      (await c.query(`select environment from public.iap_entitlements where id = $1`, [first]))
        .rows[0].environment === "Sandbox",
      "an environment already known survives a caller that omits it",
    );
    await record(owner, { env: null });

    // One Apple ID, two Plus One accounts, "restore purchases" on the second.
    // The subscription stays where it was bought.
    check(
      (await record(other)).rows[0].id === null,
      "a second member is given null, not the subscription",
    );
    check(
      (await c.query(`select user_id from public.iap_entitlements where id = $1`, [first])).rows[0]
        .user_id === owner,
      "and the row still belongs to whoever bought it",
    );
    check((await prem(other)) === false, "so the second member is not premium");
    check((await rows()) === 1, "and no second row was made for them");

    await record(owner, { status: "revoked" });
    check((await prem(owner)) === false, "a refund revokes with the term still running");
  }

  console.log("\n── our database never learns who is paying ──");
  const cols = await c.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='subscriptions'`,
  );
  const names = cols.rows.map((r) => r.column_name);
  for (const forbidden of ["name", "email", "address", "card", "last4", "postal"]) {
    check(
      !names.some((col) => col.includes(forbidden)),
      `subscriptions has no ${forbidden} column`,
    );
  }
} finally {
  await c.query("rollback");
}

await c.end();
console.log(
  problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nPremium buys nothing it should not.\n",
);
process.exit(problems.length ? 1 : 0);
