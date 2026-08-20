-- The rooms in an order somebody chose.
--
-- They came back ordered by slug, which is alphabetical by an identifier no
-- member ever sees: Disclosure stories, General lounge, U=U, HSV general,
-- Newly diagnosed. That is not an order, it is the absence of one, and it put
-- the room a frightened person most needs last.
--
-- The order below is a progression rather than a ranking:
--
--   1. Newly diagnosed — where somebody arrives, and the first days are the
--      worst days. Slowest room, heaviest room, and it should not be fourth.
--   2. The condition room — HSV general or U=U, whichever the member's
--      community makes visible. Their everyday one.
--   3. Disclosure stories — topical, and read more than it is written in.
--   4. General lounge — the one that is not about any of this, which is why it
--      is last and not why it is unimportant.
--
-- A column rather than a CASE in the query, so §7.3's room moderation screen
-- can reorder them without a migration when it exists.
alter table public.rooms
  add column if not exists position smallint not null default 100;

comment on column public.rooms.position is
  'Display order in the room bar, low first. Slug order is alphabetical by an identifier no member sees.';

update public.rooms set position = 10 where slug = 'newly-diagnosed';
-- Both condition rooms take the same slot: no member can see both, so they are
-- never in the same bar and never compete.
update public.rooms set position = 20 where slug in ('hsv-general', 'hiv-u-equals-u');
update public.rooms set position = 30 where slug = 'disclosure-stories';
update public.rooms set position = 40 where slug = 'general-lounge';

-- position is not secret and the bar has to read it.
grant select (id, slug, title, description, community_scope, slow_mode_seconds,
              pinned_resource_card, position, created_at)
  on public.rooms to authenticated;
