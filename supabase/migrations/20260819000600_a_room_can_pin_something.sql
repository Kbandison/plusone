-- A write path for the pinned resource card.
--
-- §5.2 puts pinned_resource_card on rooms and §7.2 renders it. Nothing has ever
-- been able to SET one: no RPC, no admin screen, no policy allowing a write.
-- Five rooms have carried a null column since the schema was created, and the
-- branch that renders it has never once been reached.
--
-- Admin-only and audited, like every other privileged write here. The card is
-- the one piece of content in a room that is not somebody's post — it speaks
-- with the product's voice, so it needs the same gate the config editor has.
--
-- THE SHAPE: { title, body, url?, urlLabel? }. url is optional because not
-- every pinned thing is a link; when there is one, §8's reasoning about
-- condition words in URLs is why the app sends no referrer with it.
--
-- THE CONTENT IS KEVIN'S TO WRITE, and is not in this migration. A pinned card
-- in a health community points somewhere real — an organisation, a helpline, a
-- page of facts — and inventing one of those is the one kind of invention that
-- could actually hurt somebody. The mechanism ships empty.
create or replace function public.admin_set_room_pinned_card(
  p_room_id uuid,
  p_card jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- Null clears it. Anything else has to be an object with the two fields the
  -- renderer needs, because a card with no title renders as an empty box and a
  -- card with no body renders as a heading with nothing under it.
  if p_card is not null then
    if jsonb_typeof(p_card) <> 'object' then
      raise exception 'a pinned card is an object' using errcode = '22023';
    end if;
    if coalesce(p_card ->> 'title', '') = '' or coalesce(p_card ->> 'body', '') = '' then
      raise exception 'a pinned card needs a title and a body' using errcode = '22023';
    end if;
    -- http(s) only. A javascript: or data: URL in a field that becomes an href
    -- is a script someone else wrote running on this origin.
    if p_card ? 'url' and p_card ->> 'url' !~ '^https://' then
      raise exception 'a pinned card url must be https' using errcode = '22023';
    end if;
  end if;

  select pinned_resource_card into v_old from public.rooms where id = p_room_id;
  if not found then
    raise exception 'no such room' using errcode = 'P0002';
  end if;

  update public.rooms set pinned_resource_card = p_card where id = p_room_id;

  -- The old value goes in the audit entry. A change that cannot be read back is
  -- a change nobody can undo.
  perform public.audit('room.pinned_card_set', 'room', p_room_id,
    jsonb_build_object('was', v_old, 'now', p_card));
end;
$$;

comment on function public.admin_set_room_pinned_card(uuid, jsonb) is
  'Sets or clears a room pinned resource card. Admin only, audited with the previous value.';

revoke all on function public.admin_set_room_pinned_card(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_room_pinned_card(uuid, jsonb) to authenticated;
