-- Decision #10's density curve, as config.
--
-- §6.1 has always said the Drop's intention weighting "tightens as density
-- grows". Until now there was no mechanism: dropConfig() hot-read four fixed
-- weights and minPool drove only the radius ladder, so nothing measured the
-- local pool and nothing moved. The curve now lives in packages/logic; these
-- are the two numbers that shape it.
--
-- Seeded because admin_set_config only accepts keys that already exist — the
-- same reason 20260815000700 had to seed the weights themselves. Unseeded, they
-- would default correctly and silently, and §7.3 could not reach them.
--
-- The compiled values in packages/config stay the fallback: deleting a row must
-- not change how the Drop scores.
--
-- saturation_pool is where intention reaches its ceiling, counted in candidates
-- surviving at the radius actually used. max_intention is that ceiling. Below
-- radius.min_pool nothing tightens at all, which is every area at launch.
insert into public.app_config (key, value) values
  ('drop.density.saturation_pool', to_jsonb(120)),
  ('drop.density.max_intention',   to_jsonb(0.7))
on conflict (key) do nothing;
