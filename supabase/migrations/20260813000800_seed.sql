-- Plus One — seed data
--
-- COPY GAP: §5.2 locks the five v1 room slugs but not their display titles or
-- descriptions. The titles below are minimal slug-derived placeholders pending
-- Kevin's approval — they are the only user-facing strings in this build that did
-- not come from the spec verbatim. Update before beta.

insert into public.rooms (slug, title, community_scope, slow_mode_seconds) values
  -- §5.2 names these five. They are identifiers, not URLs: rooms are addressed
  -- by id, because §8 keeps condition words out of paths and two of these name
  -- one. See 20260815001000.
  ('newly-diagnosed',    'Newly diagnosed',    'all', 60),
  ('disclosure-stories', 'Disclosure stories', 'all', 30),
  ('hsv-general',        'HSV general',        'hsv', 30),
  ('hiv-u-equals-u',     'U=U',                'hiv', 30),
  ('general-lounge',     'General lounge',     'all', 15)
on conflict (slug) do nothing;

-- ── config defaults ───────────────────────────────────────────────────────────
-- These mirror packages/config so the admin config editor (§7.3) has something to
-- edit from day one. packages/logic reads these at runtime and falls back to the
-- packaged values if a key is absent, so the two can never disagree silently.
insert into public.app_config (key, value) values
  ('fuse.window_hours',                        to_jsonb(168)),
  ('fuse.rearm_hours_after_cancelled_plan',    to_jsonb(72)),
  ('fuse.warning_hours_before_expiry',         to_jsonb(24)),

  ('connects.free_per_day',                    to_jsonb(3)),
  ('connects.premium_per_day',                 to_jsonb(10)),
  ('connects.support_only_per_week',           to_jsonb(3)),
  ('connects.pending_expiry_days',             to_jsonb(7)),

  ('radius.default_mi',                        to_jsonb(50)),
  ('radius.min_pool',                          to_jsonb(12)),

  ('drop.count',                               to_jsonb(3)),
  ('drop.hour_local',                          to_jsonb(20)),
  ('drop.active_within_days',                  to_jsonb(14)),
  ('drop.suppress_recently_served_days',       to_jsonb(30)),

  ('cooldowns.intention_change_days',          to_jsonb(30)),
  ('cooldowns.dating_reentry_days',            to_jsonb(30)),

  ('deletion.purge_after_days',                to_jsonb(7))
on conflict (key) do nothing;
