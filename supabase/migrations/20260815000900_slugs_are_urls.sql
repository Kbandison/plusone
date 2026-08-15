-- Room slugs are URLs, and §8 forbids condition words in a URL.
--
-- Two of the five named a condition outright, so browsing produced
--
--   GET /app/rooms/hsv-general
--   GET /app/rooms/hiv-u-equals-u
--
-- which lands in browser history, the URL bar, address-bar autocomplete on a
-- shared or borrowed device, our own access logs, and the Referer header of
-- anything the page ever links out to. A third was `newly-diagnosed`.
--
-- CONTENT_BLIND_BANNED_TERMS already lists hsv, hiv and diagnosis, and §8 names
-- URLs in the same breath as payloads and subject lines. The rule was written;
-- it was only ever applied to notification bodies. So this renames the slugs and
-- 20260815001000 adds the check that would have caught them.
--
-- Titles are untouched — the room is still called "Newly diagnosed" on screen,
-- where naming the subject is the entire point. It is the URL that travels.
--
-- Safe to rename: room_members and room_messages reference rooms by id.

update public.rooms set slug = 'starting-out'  where slug = 'newly-diagnosed';
update public.rooms set slug = 'stories'       where slug = 'disclosure-stories';
update public.rooms set slug = 'commons'       where slug = 'hsv-general';
update public.rooms set slug = 'circle'        where slug = 'hiv-u-equals-u';
update public.rooms set slug = 'lounge'        where slug = 'general-lounge';

-- A slug that names a condition cannot be seeded again by hand.
alter table public.rooms
  add constraint rooms_slug_is_content_blind check (
    slug !~* '(hsv|hiv|herpes|undetectable|u-?=?-?u|diagnos|poz|outbreak|std|sti)'
  );

comment on constraint rooms_slug_is_content_blind on public.rooms is
  'A slug is a URL, and §8 keeps condition words out of URLs. The title carries the meaning; the slug only has to be unique.';
