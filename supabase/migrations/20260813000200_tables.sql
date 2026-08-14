-- Plus One — core tables (spec §5.2)
--
-- Deliberately absent, and they must stay absent:
--   * no real/legal name column anywhere (Stripe holds legal names — Decision #28)
--   * no email column (auth.users owns it; phone OTP is the primary factor)
--   * no free-text condition field, no diagnosis dates, no lab values (Decision #6)
--   * no raw coordinates returned to clients (§5.3.6)

-- ── profiles ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  display_name text not null,
  -- Birthdate is stored to compute age and to enforce 18+. It is NEVER exposed;
  -- the visible_profiles view returns an age integer only.
  birthdate date not null,
  gender text,
  seeking text[] not null default '{}',

  community public.condition_community not null,
  condition public.condition_detail not null,
  u_equals_u boolean not null default false,
  cross_community_opt_in boolean not null default false,

  intention public.intention not null,
  intention_changed_at timestamptz not null default now(),

  mode public.member_mode not null default 'dating',
  -- Set to now() + 30 days whenever a member leaves dating. Blocks toggle-flicker
  -- gaming of the support-only shield (Decision #20).
  mode_dating_reentry_at timestamptz,

  -- Rounded to ~1km at write time by round_location(). Never selected by clients.
  location extensions.geography (Point, 4326),
  search_radius_mi integer not null default 50,
  timezone text not null default 'UTC',

  bio text,
  prompts jsonb not null default '[]'::jsonb,
  photo_privacy public.photo_privacy not null default 'clear',

  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,

  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 500),
  constraint profiles_radius_range check (search_radius_mi between 5 and 250),
  -- 18+ is a hard floor, checked in SQL rather than trusted from the client.
  constraint profiles_adult check (birthdate <= (current_date - interval '18 years')),
  -- U=U is only meaningful for HIV community members (Decision #7).
  constraint profiles_ueu_hiv_only check (u_equals_u = false or community = 'hiv'),
  -- Condition detail must belong to the declared community.
  constraint profiles_condition_matches_community check (
    (community = 'hsv' and condition in ('hsv1', 'hsv2', 'hsv1_hsv2'))
    or (community = 'hiv' and condition in ('hiv', 'hiv_hsv'))
  ),
  constraint profiles_prompts_is_array check (jsonb_typeof(prompts) = 'array')
);

comment on column public.profiles.location is
  'Coarse geography, rounded to ~1km. Never returned to clients — see distance_bucket_mi().';

create index profiles_location_gix on public.profiles using gist (location);
create index profiles_discovery_ix on public.profiles (community, mode, verification_status, last_active_at desc);
create index profiles_mode_ix on public.profiles (mode);
create index profiles_cross_community_ix on public.profiles (cross_community_opt_in) where cross_community_opt_in;

-- ── profile_photos ────────────────────────────────────────────────────────────
-- Storage objects live in a private bucket; these rows hold paths only. Blurred
-- variants are generated at upload and power both the preview drop and the
-- blurred-until-connected privacy setting (§5.3.5).
create table public.profile_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  blurred_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint profile_photos_position_range check (position between 0 and 5),
  unique (user_id, position)
);

create index profile_photos_user_ix on public.profile_photos (user_id, position);

-- ── consents (§9.1) ───────────────────────────────────────────────────────────
-- Health-data consent is its own screen with an unbundled checkbox. The timestamp
-- and the exact copy version are both stored so consent is provable after the fact.
create table public.consents (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.consent_kind not null,
  copy_version text not null,
  granted_at timestamptz not null default now(),

  unique (user_id, kind, copy_version)
);

create index consents_user_ix on public.consents (user_id, kind);

-- ── quiz_responses ────────────────────────────────────────────────────────────
create table public.quiz_responses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  -- Normalised trait vector, computed in packages/logic/compat.
  trait_vector real[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── drops ─────────────────────────────────────────────────────────────────────
create table public.drops (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  drop_date date not null,
  served_profile_ids uuid[] not null default '{}',
  radius_used_mi integer not null,
  -- Support-only members get a Preview Drop: real local cards, photos blurred,
  -- names hidden (Decision #19).
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),

  unique (user_id, drop_date)
);

create index drops_user_date_ix on public.drops (user_id, drop_date desc);

-- ── connects ──────────────────────────────────────────────────────────────────
create table public.connects (
  id uuid primary key default extensions.gen_random_uuid(),
  initiator_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,

  -- A connect is a reply to a specific prompt on the target's profile (Decision #14).
  prompt_id text not null,
  prompt_reply text not null,

  status public.connect_status not null default 'pending',
  source public.connect_source not null,
  -- REQUIRED when a support-only member initiates toward a dating member: both
  -- must share this room (Decision #18). Enforced in RLS and by trigger.
  -- FK added after public.rooms exists, further down this file.
  room_id uuid,

  expires_at timestamptz not null default (now() + interval '7 days'),
  decided_at timestamptz,
  -- A decline is never silence: it carries a template note, optionally with a
  -- tone-checked personal line (Decision #14, §3.5).
  decline_template smallint,
  decline_personal_line text,
  created_at timestamptz not null default now(),

  constraint connects_no_self check (initiator_id <> target_id),
  constraint connects_reply_len check (char_length(prompt_reply) between 1 and 500),
  constraint connects_decline_template_range check (
    decline_template is null or decline_template between 0 and 5
  ),
  constraint connects_decline_line_len check (
    decline_personal_line is null or char_length(decline_personal_line) <= 140
  ),
  constraint connects_decided_has_timestamp check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  ),
  constraint connects_room_source_agree check (
    (source = 'room' and room_id is not null) or (source <> 'room')
  )
);

-- One live ask at a time between any two people, in a given direction.
create unique index connects_one_pending_ix
  on public.connects (initiator_id, target_id)
  where status = 'pending';

create index connects_target_pending_ix on public.connects (target_id, status, created_at desc);
create index connects_initiator_ix on public.connects (initiator_id, created_at desc);
create index connects_expiry_sweep_ix on public.connects (expires_at) where status = 'pending';

-- ── chats ─────────────────────────────────────────────────────────────────────
create table public.chats (
  id uuid primary key default extensions.gen_random_uuid(),
  connect_id uuid not null unique references public.connects (id) on delete cascade,
  status public.chat_status not null default 'open',

  -- The one honest timer (Decision #13). Null while a date plan is confirmed.
  -- Extending or pausing this is NEVER purchasable.
  fuse_expires_at timestamptz,
  date_plan jsonb,

  closed_reason text,
  closure_template smallint,
  closure_personal_line text,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chats_closure_template_range check (
    closure_template is null or closure_template between 0 and 5
  ),
  constraint chats_personal_line_len check (
    closure_personal_line is null or char_length(closure_personal_line) <= 140
  ),
  -- An open chat always has a live fuse; a planned chat never does.
  constraint chats_fuse_matches_status check (
    (status = 'open' and fuse_expires_at is not null)
    or (status = 'date_planned' and fuse_expires_at is null)
    or (status in ('closed_fuse', 'closed_by_member', 'graduated'))
  ),
  constraint chats_closed_has_timestamp check (
    (status in ('closed_fuse', 'closed_by_member', 'graduated') and closed_at is not null)
    or (status in ('open', 'date_planned') and closed_at is null)
  )
);

create index chats_fuse_sweep_ix on public.chats (fuse_expires_at) where status = 'open';
create index chats_status_ix on public.chats (status);

-- ── messages ──────────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  -- Voice notes are a protected v1 feature: hearing a real voice mid-conversation
  -- is the cheapest fake-profile killer in this market (§10, never-cut list).
  voice_note_path text,
  voice_note_seconds smallint,
  created_at timestamptz not null default now(),

  constraint messages_has_content check (
    (body is not null and char_length(body) between 1 and 4000)
    or voice_note_path is not null
  ),
  constraint messages_voice_len check (
    voice_note_seconds is null or voice_note_seconds between 1 and 120
  )
);

create index messages_chat_ix on public.messages (chat_id, created_at desc);

-- ── rooms ─────────────────────────────────────────────────────────────────────
create table public.rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  community_scope public.room_scope not null default 'all',
  slow_mode_seconds smallint not null default 30,
  pinned_resource_card jsonb,
  created_at timestamptz not null default now(),

  constraint rooms_slow_mode_range check (slow_mode_seconds between 0 and 600)
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Supports the shared-room check for support-only outbound connects (Decision #18).
create index room_members_user_ix on public.room_members (user_id, room_id);

create table public.room_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint room_messages_body_len check (char_length(body) between 1 and 2000)
);

create index room_messages_room_ix on public.room_messages (room_id, created_at desc);
-- Slow mode is enforced against this member's last post in the room.
create index room_messages_user_recent_ix on public.room_messages (room_id, user_id, created_at desc);

-- Deferred FK from connects.room_id, now that rooms exists.
alter table public.connects
  add constraint connects_room_id_fkey
  foreign key (room_id) references public.rooms (id) on delete set null;

create index connects_room_ix on public.connects (room_id) where room_id is not null;

-- ── connect_budgets ───────────────────────────────────────────────────────────
-- Daily budget only. The support-only weekly budget is counted directly off
-- `connects` (3/week is cheap to count and can never drift out of sync), which is
-- a deliberate simplification of the single-table shape sketched in §5.2.
create table public.connect_budgets (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  connects_used smallint not null default 0,
  primary key (user_id, day),

  constraint connect_budgets_non_negative check (connects_used >= 0)
);

-- ── growth ────────────────────────────────────────────────────────────────────
create table public.referrals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Permanent per user. The link stays live forever, even past the reward cap.
  code text not null unique,
  created_at timestamptz not null default now(),

  constraint referrals_code_format check (code ~ '^[a-z0-9]{6,12}$')
);

create table public.referral_conversions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null references public.referrals (code) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  -- One attribution per invitee, forever.
  invitee_id uuid not null unique references public.profiles (id) on delete cascade,
  -- Conversion counts only when the invitee reaches `verified` (§6.5).
  verified_at timestamptz,
  created_at timestamptz not null default now(),

  constraint referral_conversions_no_self check (referrer_id <> invitee_id)
);

create index referral_conversions_referrer_ix on public.referral_conversions (referrer_id, verified_at);

create table public.referral_rewards (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier public.referral_tier not null,
  status public.reward_status not null,
  -- Signup velocity, IP/device overlap, liveness retry counts. Opaque IDs only.
  fraud_signals jsonb not null default '{}'::jsonb,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, tier)
);

-- Premium truth = active subscription UNION active grant.
create table public.premium_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index premium_grants_user_ix on public.premium_grants (user_id, expires_at desc);

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_sub_id text unique,
  plan text,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_active_ix on public.subscriptions (status, current_period_end desc);

-- ── safety ────────────────────────────────────────────────────────────────────
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),

  constraint blocks_no_self check (blocker_id <> blocked_id)
);

-- Blocks are checked in both directions on every visibility test.
create index blocks_blocked_ix on public.blocks (blocked_id, blocker_id);

create table public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete cascade,
  reported_message_id uuid references public.messages (id) on delete set null,
  reported_room_message_id uuid references public.room_messages (id) on delete set null,
  reason public.report_reason not null,
  detail text,
  created_at timestamptz not null default now(),

  constraint reports_detail_len check (detail is null or char_length(detail) <= 1000),
  constraint reports_has_subject check (
    reported_user_id is not null
    or reported_message_id is not null
    or reported_room_message_id is not null
  )
);

create index reports_reporter_ix on public.reports (reporter_id, created_at desc);

create table public.moderation_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.moderation_kind not null,
  subject_user_id uuid references public.profiles (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status public.moderation_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index moderation_queue_open_ix on public.moderation_queue (status, created_at) where status = 'open';

-- ── compliance ────────────────────────────────────────────────────────────────
create table public.deletion_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- Hard delete is hard delete. The purge job sweeps every table and every
  -- storage object after this instant (§9.3).
  purge_after timestamptz not null default (now() + interval '7 days'),
  status public.deletion_status not null default 'requested',
  purged_at timestamptz
);

create index deletion_requests_sweep_ix on public.deletion_requests (purge_after)
  where status = 'requested';

-- Admin config editor (§7.3) — logic hot-reads these over the packaged defaults.
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Audit trail for privileged state transitions. Opaque IDs and enums only —
-- never message bodies, profile fields, or condition data (§9.6).
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_subject_ix on public.audit_log (subject_type, subject_id, created_at desc);

-- Admin role. Kept separate from profiles so an app-side bug can never grant it.
create table public.admin_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now()
);
