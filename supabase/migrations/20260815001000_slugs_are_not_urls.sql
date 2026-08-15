-- Restores the §5.2 slugs, and takes them out of the URL instead.
--
-- 20260815000900 renamed the seed rooms because two of them named a condition
-- in the path. The leak was real, but the fix bent the wrong half of the spec:
-- §5.2 names these five slugs explicitly, and §8 says "no condition words
-- anywhere in any payload, subject, URL, or analytics event". Both are locked,
-- and they only conflict because the app chose to route on the slug.
--
-- So the slug goes back to what the spec says, and stops being a URL. Rooms are
-- addressed by id — /app/rooms/<uuid> — which names nothing, and the slug goes
-- back to being what it always was underneath: the stable identifier the seed
-- and the spec agree on.
--
-- The lesson is narrower than "don't put condition words in slugs". It is that
-- the identifier and the URL were the same string by default, and nobody chose
-- that. §8 constrains one of them and §5.2 fixes the other.

-- The constraint goes first: it enforced the wrong resolution, and it would
-- reject the spec's own slugs on the way back in.
alter table public.rooms drop constraint if exists rooms_slug_is_content_blind;

update public.rooms set slug = 'newly-diagnosed'    where slug = 'starting-out';
update public.rooms set slug = 'disclosure-stories' where slug = 'stories';
update public.rooms set slug = 'hsv-general'        where slug = 'commons';
update public.rooms set slug = 'hiv-u-equals-u'     where slug = 'circle';
update public.rooms set slug = 'general-lounge'     where slug = 'lounge';

comment on column public.rooms.slug is
  'The §5.2 identifier. NOT a URL — rooms are addressed by id, because §8 keeps condition words out of paths and two of these name one.';
