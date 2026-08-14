-- Voice notes (§10, never-cut list).
--
-- "Hearing a real voice mid-conversation is the cheapest fake-profile killer in
-- a market where fakes are the #1 incumbent complaint." The messages table has
-- carried voice_note_path and voice_note_seconds since Milestone 1; what was
-- missing was somewhere to put the audio.
--
-- SPEC GAP: §4.2 lists photos, verification-selfies and room-media (v2) and no
-- bucket for voice. The column implies one, so this adds it. Flagged in
-- PROJECT_UPDATES rather than assumed to be an oversight.
--
-- Private, like everything else. A voice note is somebody's actual voice and a
-- public URL to it is permanent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes',
  'voice-notes',
  false,
  -- 120 seconds is the cap (messages_voice_len). At Opus bitrates that is well
  -- under a megabyte; 4 MB leaves room for a browser picking a fatter codec
  -- without leaving room for a file that is not a voice note.
  4194304,
  array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac']
)
on conflict (id) do nothing;

-- Path convention: <chat_id>/<message_id>.<ext>. Keyed on the CHAT rather than
-- the sender, because who may hear it is decided by chat participation — the
-- same rule the messages policy uses, expressed in the path itself.

create policy "participants read chat voice notes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and public.i_am_in_chat(((storage.foldername(name))[1])::uuid)
  );

create policy "participants write chat voice notes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and public.i_am_in_chat(((storage.foldername(name))[1])::uuid)
    -- A closed chat accepts nothing further, audio included. Without this a
    -- member could keep talking into a chat that had already closed kindly.
    and public.chat_accepts_messages(((storage.foldername(name))[1])::uuid)
  );

-- No delete policy. Messages are immutable (§5.2) and a voice note is a
-- message; letting the audio be removed while the row remains would leave a
-- message that plays silence.
