-- Every voice note was stored with the literal path 'pending' and could never
-- be played.
--
-- sendVoiceNote inserted the row with voice_note_path = 'pending', uploaded the
-- audio, then UPDATEd the row to the real path. Members hold `select, insert`
-- on public.messages and nothing else — no UPDATE privilege, and no UPDATE
-- policy either, because §5.2 makes messages immutable. So the second write was
-- refused with 42501 and its result was never checked. Every note in the
-- database points at 'pending'. The rollback had the same problem: it called
-- .delete() on messages, which members also cannot do.
--
-- The action is being rewritten to upload first and insert once, with the final
-- path — no second write, so no privilege to grant and no immutability to bend.
--
-- What that leaves is the rollback: if the insert fails after the audio is up,
-- the object is orphaned, and the bucket deliberately has no delete policy
-- ("letting the audio be removed while the row remains would leave a message
-- that plays silence"). That reasoning is right about referenced objects and
-- says nothing about unreferenced ones, so the policy below allows exactly the
-- second case: a participant may delete a voice note that NO message points at.
-- A message that plays silence is still impossible.
create policy "participants may remove an unreferenced voice note"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and public.i_am_in_chat(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from public.messages m where m.voice_note_path = storage.objects.name
    )
  );

-- The rows already written are unplayable and unrecoverable: 'pending' is not a
-- path, and the audio that was meant to go with them was uploaded under a name
-- the row no longer records. Nothing can repair them, so they are removed rather
-- than left as messages that render a broken player forever.
delete from public.messages where voice_note_path = 'pending';
