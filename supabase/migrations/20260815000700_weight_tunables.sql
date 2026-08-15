-- The Drop's scoring weights, as config.
--
-- §7.3's config editor covers "weights/budgets/radius thresholds", and
-- admin_set_config only accepts keys that already exist — so weights that were
-- never seeded were not editable. They defaulted correctly and silently.
--
-- Seeded from the launch values in §6.1, which are the same numbers
-- packages/config compiles in. The compiled values stay as the fallback: a
-- deleted row must not change how the Drop scores.

insert into public.app_config (key, value) values
  ('drop.weights.intention',     to_jsonb(0.4)),
  ('drop.weights.quiz',          to_jsonb(0.3)),
  ('drop.weights.recency',       to_jsonb(0.2)),
  ('drop.weights.underexposure', to_jsonb(0.1))
on conflict (key) do nothing;
